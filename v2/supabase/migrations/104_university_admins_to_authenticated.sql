-- =====================================================
-- 104: Harden university_admins policies (SCU Fase 2)
-- Defensa en profundidad recomendada por la revisión RLS: añadir
-- `TO authenticated` a las políticas de university_admins. Los USING ya
-- bloquean a anon (auth.uid() es NULL), pero restringir explícitamente el
-- rol cierra la puerta del todo. Idempotente.
-- =====================================================

DROP POLICY IF EXISTS "University admins see own link" ON public.university_admins;
CREATE POLICY "University admins see own link"
    ON public.university_admins FOR SELECT
    TO authenticated
    USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage university_admins" ON public.university_admins;
CREATE POLICY "Admins manage university_admins"
    ON public.university_admins FOR ALL
    TO authenticated
    USING (public.is_admin());
