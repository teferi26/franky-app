-- =====================================================================
-- 114: Indices que faltan para las queries reales (rendimiento)
--
-- Origen: docs/mejoras/09-datos-supabase.md (seccion "Indices frente a las
-- queries reales del codigo"). Solo se crean indices que NO existen ya.
--
-- NO se repiten (verificado con grep el 12-jun-2026):
--   · idx_events_title_trgm, idx_scholarships_name_trgm,
--     idx_accommodations_active_paid_created, idx_event_tickets_order (109)
--   · idx_accommodations_search (GIN search_vector), idx_swipe_actions_*,
--     idx_compat_cache_* (076)
--   · indices de get_discovery_feed (las 108 no creo indices nuevos)
--   · idx_events_city/date/category/university (001), idx_conv_participants_*
--     simples (001), idx_career_comments_career/user/parent (009),
--     idx_messages_unread (017)
--
-- Sin CONCURRENTLY: estas migraciones se aplican a mano en el SQL Editor de
-- Supabase, que ejecuta dentro de una transaccion implicita; CONCURRENTLY no
-- puede ir en transaccion. Las tablas son pequenas hoy, el lock es breve.
--
-- Idempotente: todo CREATE INDEX IF NOT EXISTS dentro de guards to_regclass
-- (la BD de produccion diverge del repo; aqui todas las tablas existen, pero
-- el guard es gratis y deja la migracion segura en cualquier entorno).
-- =====================================================================

DO $$
BEGIN
    -- -----------------------------------------------------------------
    -- M-BD-039: events combina condiciones que los indices simples no cubren.
    -- El feed y los listados filtran por status + start_date y por
    -- category + start_date.
    -- -----------------------------------------------------------------
    IF to_regclass('public.events') IS NOT NULL THEN
        -- get_discovery_feed (108): WHERE start_date >= NOW() AND status='upcoming'
        -- ORDER BY start_date. Indice parcial de proximos eventos por fecha.
        CREATE INDEX IF NOT EXISTS idx_events_upcoming_start
            ON public.events(start_date)
            WHERE status = 'upcoming';

        -- eventos/[id]: .eq('category').order('start_date')
        CREATE INDEX IF NOT EXISTS idx_events_category_start
            ON public.events(category, start_date);

        -- eventos/swipe: .gte('end_date', now).order('start_date')
        CREATE INDEX IF NOT EXISTS idx_events_end_start
            ON public.events(end_date, start_date)
            WHERE end_date IS NOT NULL;

        -- Listado de destacados por fecha (is_featured + start_date).
        CREATE INDEX IF NOT EXISTS idx_events_featured_start
            ON public.events(start_date)
            WHERE is_featured = true;
    END IF;

    -- -----------------------------------------------------------------
    -- M-BD-040: get_unread_chat_count (100) une por cp.user_id y
    -- cp.conversation_id; solo existe el indice por user_id suelto (001).
    -- -----------------------------------------------------------------
    IF to_regclass('public.conversation_participants') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_conv_participants_user_conv
            ON public.conversation_participants(user_id, conversation_id);
    END IF;

    -- -----------------------------------------------------------------
    -- M-BD-042: career_comments es de las tablas mas consultadas del front
    -- (6 accesos) y se ordena por fecha dentro de cada carrera. Solo existe
    -- idx_career_comments_career por career_id suelto (009).
    -- -----------------------------------------------------------------
    IF to_regclass('public.career_comments') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_career_comments_career_created
            ON public.career_comments(career_id, created_at DESC);
    END IF;

    -- -----------------------------------------------------------------
    -- M-BD-064: accommodations.university_ids es UUID[] sin indice; el filtro
    -- "pisos cerca de la uni X" (university_ids @> ARRAY[...]) hace seq scan.
    -- -----------------------------------------------------------------
    IF to_regclass('public.accommodations') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_accommodations_university_ids
            ON public.accommodations USING gin(university_ids);
    END IF;

    -- -----------------------------------------------------------------
    -- M-BD-065: leisure_spots.university_ids mismo patron (filtrar ocio por
    -- universidad). Solo se crea si la columna existe en este entorno.
    -- -----------------------------------------------------------------
    IF to_regclass('public.leisure_spots') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'leisure_spots'
             AND column_name = 'university_ids'
       ) THEN
        CREATE INDEX IF NOT EXISTS idx_leisure_spots_university_ids
            ON public.leisure_spots USING gin(university_ids);
    END IF;
END $$;

-- =====================================================================
-- VERIFICACION (ejecutar manualmente tras aplicar)
-- =====================================================================
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND indexname IN (
--       'idx_events_upcoming_start','idx_events_category_start',
--       'idx_events_end_start','idx_events_featured_start',
--       'idx_conv_participants_user_conv','idx_career_comments_career_created',
--       'idx_accommodations_university_ids'
--     );
--   -> deben aparecer todos (idx_leisure_spots_university_ids solo si la
--      columna existe en este entorno).
-- =====================================================================
