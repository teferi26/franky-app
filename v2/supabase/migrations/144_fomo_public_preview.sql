-- =====================================================
-- 144: Vista previa PÚBLICA de FOMO (adquisición orgánica)
-- =====================================================
-- Por qué:
--   FOMO es lo que diferencia a Franky y lo que retiene, pero estaba tras el
--   muro de auth Y prohibido en robots.txt. Resultado: Google solo indexaba el
--   directorio de carreras (que tienen mil sitios) y el visitante nunca veía el
--   producto por el que se registraría.
--
--   Esta migración abre una vista previa MUY recortada, pensada como anzuelo:
--   unos pocos hilos, solo texto, sin autor, sin media, sin encuestas y con
--   retardo. Todo lo demás (publicar, responder, reaccionar, ver quién escribe)
--   sigue exigiendo cuenta.
--
-- Garantías de privacidad, explícitas:
--   * NO devuelve author_id, ni alias, ni avatar, ni is_anonymous. Nada que
--     permita atribuir un hilo a una persona.
--   * NO devuelve media_url: una URL de Storage filtrada es permanente.
--   * Solo hilos con texto, ni ocultos ni borrados y sin ningún reporte.
--   * Retardo de 15 minutos: da margen a la moderación automática (3 reportes
--     ocultan el hilo) antes de que algo pueda salir en la web pública.
--   * Cuerpo truncado a 180 caracteres: es un aperitivo, no el contenido.
--   * Tope duro de 10 hilos por llamada: no es un endpoint de volcado.

-- ─────────────────────────────────────────────────────
-- get_fomo_public_preview: hilos recortados de una universidad, por slug.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fomo_public_preview(
    p_university_slug TEXT,
    p_limit INT DEFAULT 6
)
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_uni UUID;
BEGIN
    SELECT id INTO v_uni
      FROM public.universities
     WHERE slug = p_university_slug
     LIMIT 1;

    IF v_uni IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT jsonb_build_object(
        -- Sin id de hilo a propósito: la vista previa no enlaza a la ficha
        -- (que sigue siendo privada), así que el id no aporta y sí filtra
        -- información sobre el volumen y el orden de publicación.
        'body', left(t.body, 180),
        'is_truncated', char_length(t.body) > 180,
        'reply_count', t.reply_count,
        'reaction_count', t.reaction_count,
        -- Solo el día, no la hora exacta: con hora exacta más el muro de una
        -- uni pequeña se puede correlacionar quién publicó qué.
        'created_on', t.created_at::date
    )
    FROM public.fomo_threads t
    WHERE t.university_id = v_uni
      AND t.is_deleted = false
      AND t.is_hidden  = false
      AND t.report_count = 0
      AND t.body IS NOT NULL
      AND char_length(btrim(t.body)) >= 20
      AND t.created_at < NOW() - INTERVAL '15 minutes'
    ORDER BY t.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 6), 1), 10);
END;
$$;

REVOKE ALL ON FUNCTION public.get_fomo_public_preview(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fomo_public_preview(TEXT, INT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_fomo_public_preview(TEXT, INT) IS
'Vista previa publica y anonimizada del muro FOMO de una universidad (maximo 10 hilos, solo texto truncado, sin autor ni media, con 15 min de retardo). Alimenta la landing publica /fomo/[slug] para captacion organica.';

-- ─────────────────────────────────────────────────────
-- get_fomo_public_stats: cifras agregadas para la landing pública.
-- Sirven de prueba social ("312 hilos este mes en la UA") sin exponer nada.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fomo_public_stats(
    p_university_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_uni UUID;
    v_threads INT;
    v_replies INT;
BEGIN
    SELECT id INTO v_uni FROM public.universities WHERE slug = p_university_slug LIMIT 1;
    IF v_uni IS NULL THEN
        RETURN jsonb_build_object('threads_30d', 0, 'replies_30d', 0);
    END IF;

    SELECT COUNT(*)::int INTO v_threads
      FROM public.fomo_threads t
     WHERE t.university_id = v_uni
       AND t.is_deleted = false AND t.is_hidden = false
       AND t.created_at > NOW() - INTERVAL '30 days';

    SELECT COALESCE(SUM(t.reply_count), 0)::int INTO v_replies
      FROM public.fomo_threads t
     WHERE t.university_id = v_uni
       AND t.is_deleted = false AND t.is_hidden = false
       AND t.created_at > NOW() - INTERVAL '30 days';

    RETURN jsonb_build_object('threads_30d', v_threads, 'replies_30d', v_replies);
END;
$$;

REVOKE ALL ON FUNCTION public.get_fomo_public_stats(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fomo_public_stats(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_fomo_public_stats(TEXT) IS
'Cifras agregadas (hilos y respuestas de los ultimos 30 dias) del muro FOMO de una universidad, para la prueba social de la landing publica. No expone filas ni identidades.';
