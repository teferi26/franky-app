-- =====================================================
-- 098: Crush — bajar TEMPORALMENTE el gate de edad de 18 a 16
-- =====================================================
-- A petición ("por estos días"). El gate de Crush/ligar está centralizado en
-- is_adult(), que usan:
--   - get_ligar_profile  (082) → campo 'eligible'
--   - set_ligar_profile  (082) → activación de Crush
--   - nominaciones       (084)
--   - verificación IG    (096)
-- is_adult() NO se usa fuera de Crush, así que cambiar solo este helper baja el
-- listón de todo Crush a 16+ de forma coherente, sin tocar nada más.
--
-- ⚠ TEMPORAL. PARA REVERTIR: volver a poner INTERVAL '18 years'.
-- (El texto de la app sigue diciendo 18 a propósito; no se toca.)
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_adult(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COALESCE(
        (SELECT birth_date IS NOT NULL
                AND birth_date <= (CURRENT_DATE - INTERVAL '16 years')
         FROM public.profiles WHERE id = p_user),
        false
    );
$$;
