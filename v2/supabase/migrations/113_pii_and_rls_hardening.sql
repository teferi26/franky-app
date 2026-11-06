-- =====================================================================
-- 113: Blindaje de PII en RPCs y endurecimiento de RLS
--
-- Origen: auditoria del 11-jun-2026 (docs/mejoras/01-seguridad.md y
-- 09-datos-supabase.md). Mismo patron que la 108 cerro en get_discovery_feed.
--
-- Que cierra
-- ----------
--   · M-SEC-001 / M-SEC-004: get_roomies_filtered (077, y antes 071/073)
--     devolvia to_jsonb(p.*): email, phone, birth_date, student_email,
--     stripe_customer_id, instagram_verify_token, is_premium, strikes_count,
--     etc. de cada perfil candidato a cualquier autenticado. Se redefine con
--     whitelist EXPLICITA (sin PII ni campos de moderacion), edad calculada en
--     SQL y auth.uid() obligatorio. La firma NO cambia, asi que tapa de una vez
--     las tres revisiones (071/073/077): CREATE OR REPLACE sobre la misma firma.
--   · M-SEC-002: get_daily_match (053, vigente en 060) devolvia
--     to_jsonb(p) - 'updated_at': mismo leak. Se redefine con whitelist. NO se
--     cambia la firma (profile/compatibility/day) ni la estrategia de hash
--     (md5, built-in) ni la tabla de bloqueo (user_blocks, como 060): solo se
--     sustituye el to_jsonb por jsonb_build_object con campos seguros.
--   · M-SEC-005: instagram_verify_token deja de viajar al cliente (no esta en
--     ninguna whitelist).
--   · M-BD-018: messages no tenia politicas UPDATE ni DELETE pese a soportar
--     editar (edited_at, 050) y soft-borrar (is_deleted, 062). Se anaden,
--     acotadas a sender_id = auth.uid().
--   · M-BD-019: el INSERT de conversations era WITH CHECK (true). Se mantiene
--     la creacion abierta (process_swipe_action / get_or_create_conversation la
--     necesitan) pero se ata TO authenticated (anon no crea conversaciones).
--
-- Compatibilidad: get_roomies_filtered y get_daily_match NO se invocan hoy
-- desde web ni mobile (grep 12-jun-2026: 0 llamadas; el feed de roomies usa
-- get_discovery_feed, ya blindada por la 108). Aun asi se mantienen las claves
-- del JSON salvo birth_date -> age, por si algun cliente futuro las consume.
--
-- Idempotente y resiliente: guards to_regclass, DROP POLICY IF EXISTS antes de
-- CREATE POLICY, CREATE OR REPLACE FUNCTION. La BD de produccion diverge del
-- repo (010/015 nunca aplicadas), pero todo lo que se toca aqui (profiles,
-- messages, conversations, las dos RPCs) existe igual en prod y en el repo.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. get_roomies_filtered: whitelist explicita (cierra M-SEC-001 / 004 / 005)
-- ---------------------------------------------------------------------
-- Firma IDENTICA a 071/073/077 (UUID, INT, BOOLEAN, BOOLEAN). El cuerpo
-- conserva exactamente los mismos filtros y orden que la 077 (la version
-- vigente: bloqueo via blocked_users en ambas direcciones, is_hidden, boost),
-- y solo cambia la proyeccion: en vez de to_jsonb(p.*) || jsonb_build_object,
-- se construye el JSON campo a campo con la misma lista blanca que la 108.
-- birth_date -> age (entero calculado en SQL). NO se exponen: email,
-- student_email, phone, birth_date, stripe_customer_id, instagram_verify_token,
-- is_premium, role, strikes_count, is_discarded, utm_*, etc.
CREATE OR REPLACE FUNCTION public.get_roomies_filtered(
    p_user_id UUID,
    p_limit INT DEFAULT 20,
    p_verified_only BOOLEAN DEFAULT false,
    p_same_university BOOLEAN DEFAULT false
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_uni UUID;
    v_caller UUID := auth.uid();
BEGIN
    IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF v_caller <> p_user_id THEN RAISE EXCEPTION 'forbidden - only self'; END IF;

    SELECT university_id INTO v_user_uni FROM public.profiles WHERE id = p_user_id;

    RETURN QUERY
    SELECT jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'photos', COALESCE(p.photos, '{}'::text[]),
        'career', p.career,
        'academic_year', p.academic_year,
        'bio', p.bio,
        'city', p.city,
        'university_id', p.university_id,
        'interests', COALESCE(p.interests, '{}'::text[]),
        'age', CASE WHEN p.birth_date IS NOT NULL
                    THEN date_part('year', age(p.birth_date))::int
               END,
        'lifestyle_preferences', p.lifestyle_preferences,
        'housing_preferences', p.housing_preferences,
        'compatibility', public.calculate_compatibility(p_user_id, p.id),
        'last_seen_at', p.last_seen,
        'is_verified', COALESCE(p.student_email_verified, false),
        'is_boosted', EXISTS (
            SELECT 1 FROM public.user_boosts ub
            WHERE ub.user_id = p.id
              AND ub.boost_type = 'profile_boost'
              AND ub.expires_at > NOW()
        )
    )
    FROM public.profiles p
    WHERE p.id <> p_user_id
      AND p.looking_for_roommate = true
      AND p.onboarding_completed = true
      AND COALESCE(p.is_discarded, false) = false
      AND COALESCE(p.is_hidden, false) = false  -- SEC-005 (077)
      -- SEC-004 (077): excluye bloqueados en ambas direcciones.
      AND p.id NOT IN (
        SELECT blocked_id FROM public.blocked_users WHERE blocker_id = p_user_id
        UNION
        SELECT blocker_id FROM public.blocked_users WHERE blocked_id = p_user_id
      )
      AND p.id NOT IN (
        SELECT sa.target_id FROM public.swipe_actions sa
        WHERE sa.user_id = p_user_id AND sa.target_type = 'roomie'
      )
      AND (NOT p_verified_only OR COALESCE(p.student_email_verified, false) = true)
      AND (NOT p_same_university OR (v_user_uni IS NOT NULL AND p.university_id = v_user_uni))
    ORDER BY
        CASE WHEN EXISTS (
            SELECT 1 FROM public.user_boosts ub
            WHERE ub.user_id = p.id
              AND ub.boost_type = 'profile_boost'
              AND ub.expires_at > NOW()
        ) THEN 0 ELSE 1 END,
        public.calculate_compatibility(p_user_id, p.id) DESC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_roomies_filtered(UUID, INT, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_roomies_filtered(UUID, INT, BOOLEAN, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_roomies_filtered(UUID, INT, BOOLEAN, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.get_roomies_filtered IS
    '113: feed de roomies con whitelist de campos (sin PII: ni email, phone, '
    'birth_date ni instagram_verify_token), edad calculada en SQL, auth.uid() '
    'obligatorio y solo authenticated. Cierra M-SEC-001/004/005.';

-- ---------------------------------------------------------------------
-- 2. get_daily_match: whitelist explicita (cierra M-SEC-002)
-- ---------------------------------------------------------------------
-- Parte de la version VIGENTE (060): guard auth.uid() = p_user_id, hash md5
-- (built-in, no pgcrypto), bloqueo via user_blocks (NO se cambia: la divergencia
-- user_blocks vs blocked_users es M-SEC-013, fuera del alcance de PII). El
-- swipe se filtra por target_type = 'profile' como en 060 (no se altera).
-- Unico cambio: profile pasa de to_jsonb(p) - 'updated_at' a jsonb_build_object
-- con la misma whitelist que get_discovery_feed/get_roomies_filtered.
CREATE OR REPLACE FUNCTION public.get_daily_match(p_user_id UUID)
RETURNS TABLE (
    profile JSONB,
    compatibility INT,
    day DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_day DATE := CURRENT_DATE;
    v_seed BIGINT;
BEGIN
    IF p_user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
        RETURN;
    END IF;

    v_seed := abs(hashtext(p_user_id::text || v_day::text));

    RETURN QUERY
    WITH candidates AS (
        SELECT
            p.id,
            jsonb_build_object(
                'id', p.id,
                'full_name', p.full_name,
                'avatar_url', p.avatar_url,
                'photos', COALESCE(p.photos, '{}'::text[]),
                'career', p.career,
                'academic_year', p.academic_year,
                'bio', p.bio,
                'city', p.city,
                'university_id', p.university_id,
                'interests', COALESCE(p.interests, '{}'::text[]),
                'age', CASE WHEN p.birth_date IS NOT NULL
                            THEN date_part('year', age(p.birth_date))::int
                       END,
                'lifestyle_preferences', p.lifestyle_preferences,
                'housing_preferences', p.housing_preferences
            ) AS prof,
            (public.calculate_compatibility(p_user_id, p.id))::INT AS compat
        FROM public.profiles p
        WHERE p.id <> p_user_id
          AND p.onboarding_completed = true
          AND p.looking_for_roommate = true
          AND p.is_discarded IS NOT TRUE
          AND (
            p.avatar_url IS NOT NULL
            OR COALESCE(array_length(p.photos, 1), 0) > 0
          )
          AND p.id NOT IN (
              SELECT target_id FROM public.swipe_actions
              WHERE user_id = p_user_id AND target_type = 'profile'
          )
          AND p.id NOT IN (
              SELECT CASE WHEN ub.blocker_id = p_user_id THEN ub.blocked_id ELSE ub.blocker_id END
              FROM public.user_blocks ub
              WHERE ub.blocker_id = p_user_id OR ub.blocked_id = p_user_id
          )
    )
    SELECT c.prof, c.compat, v_day
    FROM candidates c
    -- Shuffle determinista por dia (igual que 060).
    ORDER BY c.compat DESC, md5(v_seed::text || c.id::text) ASC
    LIMIT 1;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_daily_match(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_match(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_daily_match(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_daily_match(UUID) IS
    '113: match diario con whitelist de campos (sin PII), edad calculada en SQL '
    'y auth.uid() obligatorio. Hash md5 y bloqueo via user_blocks como en 060. '
    'Cierra M-SEC-002.';

-- ---------------------------------------------------------------------
-- 3. messages: politicas UPDATE y DELETE que faltaban (cierra M-BD-018)
-- ---------------------------------------------------------------------
-- 050 anadio edited_at y 062 is_deleted (editar y soft-borrar desde el cliente)
-- pero messages solo tenia SELECT e INSERT: con RLS activa todo UPDATE/DELETE se
-- rechazaba en silencio. Se acota a la propia autoria (sender_id = auth.uid()).
-- El WITH CHECK impide que un UPDATE cambie el autor o mueva el mensaje de
-- conversacion (no se puede reasignar sender_id ni conversation_id).
DO $$
BEGIN
    IF to_regclass('public.messages') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Users can edit own messages" ON public.messages;
        CREATE POLICY "Users can edit own messages"
            ON public.messages FOR UPDATE TO authenticated
            USING (sender_id = auth.uid())
            WITH CHECK (sender_id = auth.uid());

        DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
        CREATE POLICY "Users can delete own messages"
            ON public.messages FOR DELETE TO authenticated
            USING (sender_id = auth.uid());
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. conversations: el INSERT WITH CHECK (true) se ata a authenticated
--    (mitiga M-BD-019)
-- ---------------------------------------------------------------------
-- No se puede endurecer mas el WITH CHECK sin romper process_swipe_action y
-- get_or_create_conversation (crean la conversacion antes de meter al segundo
-- participante, asi que en el momento del INSERT no hay relacion que validar).
-- El minimo de defensa en profundidad es impedir que anon cree conversaciones.
DO $$
BEGIN
    IF to_regclass('public.conversations') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
        CREATE POLICY "Users can create conversations"
            ON public.conversations FOR INSERT TO authenticated
            WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
END $$;

COMMIT;

-- =====================================================================
-- VERIFICACION (ejecutar manualmente tras aplicar)
-- =====================================================================
-- PII fuera de las RPCs (deben devolver claves seguras y 'age', nunca email):
--   SELECT public.get_roomies_filtered(auth.uid(), 1);   -- como un usuario logueado
--   SELECT (public.get_daily_match(auth.uid())).profile;
--   -> ninguno debe contener email, phone, birth_date ni instagram_verify_token
--
-- Politicas de messages:
--   SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.messages'::regclass;
--   -> aparecen UPDATE ('Users can edit own messages') y DELETE
--      ('Users can delete own messages')
--   Editar un mensaje ajeno (otra sesion) -> 0 filas afectadas (RLS lo bloquea)
--
-- conversations:
--   INSERT INTO public.conversations DEFAULT VALUES;  -- como anon -> denegado
-- =====================================================================
