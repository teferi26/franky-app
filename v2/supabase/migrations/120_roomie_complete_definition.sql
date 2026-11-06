-- =====================================================================
-- 120: redefinir "perfil de roomie completo"
--
-- La 119 definía completo = los 8 campos de estilo de vida. Pero en los datos
-- reales esos 8 campos están rellenos con valores por defecto idénticos en los
-- 239 perfiles (smoking='no', cleanliness='3'…), así que no distinguían a
-- nadie y el gate no bloqueaba a los usuarios que swipeaban sin haber montado
-- su búsqueda.
--
-- Definición correcta (decidida con el fundador): un usuario tiene el perfil
-- de búsqueda COMPLETO cuando ha activado y rellenado su búsqueda Y tiene una
-- ficha presentable:
--   - looking_for_roommate = true   (ha activado la búsqueda)
--   - budget_min IS NOT NULL         (presupuesto)
--   - city con contenido real        (>= 2 chars, excluye placeholders "." )
--   - bio con contenido real         (>= 10 chars, excluye "." y vacíos)
--   - al menos una foto              (avatar_url o algún elemento en photos)
--
-- Solo se cambia el cuerpo de roomie_profile_complete: el trigger, las RPC y
-- la política UPDATE la referencian por nombre y heredan la nueva lógica.
--
-- Idempotente: CREATE OR REPLACE.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.roomie_profile_complete(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_uid
      AND p.looking_for_roommate = true
      AND p.budget_min IS NOT NULL
      AND char_length(btrim(COALESCE(p.city, ''))) >= 2
      AND char_length(btrim(COALESCE(p.bio, ''))) >= 10
      AND (
            NULLIF(btrim(COALESCE(p.avatar_url, '')), '') IS NOT NULL
         OR COALESCE(array_length(p.photos, 1), 0) > 0
      )
  );
$$;

COMMENT ON FUNCTION public.roomie_profile_complete IS
  '120: perfil de roomie completo = looking_for_roommate + presupuesto + ciudad + bio (>=10) + foto.';
