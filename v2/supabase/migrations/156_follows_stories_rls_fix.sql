-- ═══════════════════════════════════════════════════════════════════════════
-- 156: "No se puede seguir a esta cuenta" (y stories de otros invisibles)
--
-- SÍNTOMA (reportado el 31-jul-2026): al pulsar Seguir en el perfil de otra
-- persona, la app enseña "No se pudo seguir a esta persona".
--
-- CAUSA RAÍZ: las políticas `follows_insert` (123_social_graph.sql:34-42) y
-- `stories_select` (124_social_graph_fix.sql:34-45) comprueban que la otra
-- cuenta existe y no está descartada con un EXISTS sobre `public.profiles`:
--
--     AND EXISTS (SELECT 1 FROM public.profiles p
--                  WHERE p.id = followee_id
--                    AND COALESCE(p.is_discarded, false) = false)
--
-- La subconsulta de una política se evalúa con la RLS del usuario que ejecuta
-- la sentencia, y desde la 040 un usuario normal SOLO puede leer su propia fila
-- de `profiles` ("Own profile readable", 040:123-127; las otras dos políticas
-- de SELECT son para admin y staff). Así que ese EXISTS es falso para cualquier
-- followee distinto de uno mismo, y en consecuencia:
--   · todo INSERT en `follows` falla con 42501 (row-level security violation)
--   · `stories_select` solo deja ver TUS PROPIAS stories, nunca las de nadie
-- La lectura pública de perfiles va por la vista `public_profiles`, que sí
-- salta la RLS, pero las políticas apuntaban a la tabla, no a la vista.
--
-- ARREGLO: mover la comprobación a una función SECURITY DEFINER, el mismo
-- patrón que ya se usa dentro de políticas en este esquema (`is_admin()`,
-- `roomie_profile_complete()`). NO se abre la RLS de `profiles`: la función
-- solo devuelve un booleano "existe y no está descartada", que es información
-- que `public_profiles` ya expone a cualquier usuario autenticado.
--
-- Se prefiere la función a consultar `public_profiles` directamente porque esa
-- vista arrastra un LEFT JOIN con `universities` y un jsonb_build_object que se
-- ejecutarían en cada INSERT de follow y en cada fila de stories, y porque
-- atarle la RLS de `follows` a la lista de columnas de la vista más manoseada
-- del esquema es pedir una rotura silenciosa.
--
-- Aplicable desde el SQL Editor. Idempotente. No toca storage.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Helper: ¿ese perfil existe y no está descartado?
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profile_is_visible(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_id
      AND COALESCE(p.is_discarded, false) = false
  );
$$;

REVOKE ALL     ON FUNCTION public.profile_is_visible(uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.profile_is_visible(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.profile_is_visible(uuid) TO authenticated;

COMMENT ON FUNCTION public.profile_is_visible(uuid) IS
  '156: booleano "el perfil existe y no está descartado", pensado para usarse '
  'DENTRO de políticas RLS. SECURITY DEFINER a propósito: sin esto, una política '
  'que consulta public.profiles se evalúa con la RLS del invocador (040) y '
  'siempre da falso para cualquier fila que no sea la suya.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. follows_insert: seguir a alguien vuelve a funcionar
-- ─────────────────────────────────────────────────────────────────────────
DO $do$
BEGIN
  IF to_regclass('public.follows') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS follows_insert ON public.follows';
    EXECUTE $p$
      CREATE POLICY follows_insert ON public.follows
        FOR INSERT TO authenticated
        WITH CHECK (
          follower_id = auth.uid()
          AND public.profile_is_visible(followee_id)
        )
    $p$;
    RAISE NOTICE '156: follows_insert recreada.';
  ELSE
    RAISE NOTICE '156: public.follows no existe todavía; se omite.';
  END IF;
END
$do$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. stories_select: las stories de otros vuelven a verse
-- ─────────────────────────────────────────────────────────────────────────
DO $do$
BEGIN
  IF to_regclass('public.stories') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS stories_select ON public.stories';
    EXECUTE $p$
      CREATE POLICY stories_select ON public.stories
        FOR SELECT TO authenticated
        USING (
          author_id = auth.uid()
          OR (expires_at > NOW() AND public.profile_is_visible(author_id))
        )
    $p$;
    RAISE NOTICE '156: stories_select recreada.';
  ELSE
    RAISE NOTICE '156: public.stories no existe todavía; se omite.';
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (ejecutar como usuario normal autenticado, NO como admin):
--
--   SELECT public.profile_is_visible('<id de otra persona>');   -- espera true
--
--   INSERT INTO public.follows (follower_id, followee_id)
--        VALUES (auth.uid(), '<id de otra persona>');           -- espera 1 fila
--
--   SELECT count(*) FROM public.stories WHERE author_id <> auth.uid();
--                                                              -- espera > 0 si
--                                                                 alguien tiene
--                                                                 stories vivas
-- ─────────────────────────────────────────────────────────────────────────
