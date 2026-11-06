-- =====================================================
-- 091: FOMO — RPC de preview público para la ficha de universidad
-- =====================================================
-- La página /universidades/[slug] es pública (indexable). Queremos enseñar
-- ahí un avance de los últimos hilos FOMO de esa universidad como gancho,
-- SIN exigir sesión (get_fomo_feed sí la exige y rompería para visitantes
-- anónimos). Esta función corre como SECURITY DEFINER, respeta el anonimato
-- (anula nombre/avatar cuando is_anonymous = true) y solo devuelve campos
-- seguros para mostrar de forma compacta.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_fomo_preview(
    p_university_id UUID,
    p_limit INT DEFAULT 4
)
RETURNS SETOF JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT jsonb_build_object(
        'id', t.id,
        'body', t.body,
        'media_type', t.media_type,
        'is_anonymous', t.is_anonymous,
        'reply_count', t.reply_count,
        'reaction_count', t.reaction_count,
        'created_at', t.created_at,
        'author_name', CASE WHEN t.is_anonymous THEN NULL ELSE pr.full_name END,
        'author_avatar', CASE WHEN t.is_anonymous THEN NULL ELSE pr.avatar_url END
    )
    FROM public.fomo_threads t
    LEFT JOIN public.profiles pr ON pr.id = t.author_id
    WHERE t.university_id = p_university_id
      AND t.is_deleted = false
      AND t.is_hidden = false
    ORDER BY t.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 10);
$$;

GRANT EXECUTE ON FUNCTION public.get_fomo_preview(UUID, INT) TO anon, authenticated;
