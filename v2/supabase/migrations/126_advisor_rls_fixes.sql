-- ═══════════════════════════════════════════════════════════════════════════
-- 126: Arreglos del Security Advisor (21-jul-2026)
--
-- El Advisor marcaba 4 CRITICAL. Diagnóstico:
--   1. event_conversations SIN RLS en prod → REAL. La 013 la activaba con
--      políticas, pero prod la perdió (divergencia prod/repo). Verificado:
--      legible por anon vía PostgREST. Es la tabla evento↔conversación
--      (metadatos, los mensajes tienen su propia RLS), pero además era
--      ESCRIBIBLE, lo que permitiría enredar los chats de eventos.
--   2. compatibility_cache SIN RLS → REAL y bug también en el repo: la 076
--      nunca la activó. Guarda pares de compatibilidad entre usuarios; solo
--      la toca una función SECURITY DEFINER, así que se cierra sin políticas
--      de usuario (definer y service role la siguen usando igual).
--   3. public_profiles (vista SECURITY DEFINER) → ACEPTADO por diseño (040):
--      expone columnas curadas sin PII a usuarios autenticados saltando la
--      RLS estricta de profiles. Verificado: anon NO puede leerla.
--   4. career_comments_public (vista SECURITY DEFINER) → ACEPTADO por diseño
--      (118, documentado allí): comentarios de carreras en páginas públicas,
--      ocultando user_id de los anónimos.
--
-- Aplicable desde el SQL Editor. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. event_conversations: reactivar la RLS de la 013 con sus políticas.
ALTER TABLE public.event_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event participants can view event conversation" ON public.event_conversations;
CREATE POLICY "Event participants can view event conversation"
  ON public.event_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = event_conversations.event_id
        AND ep.user_id = auth.uid()
        AND ep.status != 'cancelled'
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Admins manage event conversations" ON public.event_conversations;
CREATE POLICY "Admins manage event conversations"
  ON public.event_conversations FOR ALL
  USING (is_admin());

-- 2. compatibility_cache: RLS sin políticas de usuario. Solo la función
--    SECURITY DEFINER de compatibilidad (076) y el service role la tocan.
ALTER TABLE public.compatibility_cache ENABLE ROW LEVEL SECURITY;

-- 3 y 4. Vistas definer: decisión documentada; se deja constancia aquí para
--    que el próximo Advisor no dispare otra alarma sin contexto.
COMMENT ON VIEW public.public_profiles IS
  '040/126: SECURITY DEFINER a propósito: expone columnas curadas sin PII de profiles (RLS estricta) a authenticated. Anon bloqueado. Advisor: aceptado.';
COMMENT ON VIEW public.career_comments_public IS
  '118/126: SECURITY DEFINER a propósito: comentarios de carreras para páginas públicas, ocultando user_id de los anónimos. Advisor: aceptado.';

NOTIFY pgrst, 'reload schema';
