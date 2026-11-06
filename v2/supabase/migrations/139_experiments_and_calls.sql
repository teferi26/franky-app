-- ═══════════════════════════════════════════════════════════════════════════
-- 139: Experimentos A/B y señalización de llamadas 1:1
--      (mejoras 91 y 100 del ciclo 2)
--
--   91. A/B testing de onboarding y del ranking de la Lupa. La ASIGNACIÓN se
--       hace en el cliente de forma determinista (hash del uid + nombre del
--       experimento), así que aquí no hace falta guardar la variante: basta
--       con registrar la exposición en analytics_events (migración 131) y
--       poder consultarla. Lo que SÍ vive aquí es el catálogo de experimentos,
--       para poder encender, apagar o repartir sin publicar una versión nueva.
--
--   100. Llamadas de voz y vídeo 1:1 entre matches. WebRTC necesita un canal
--        para intercambiar oferta, respuesta y candidatos ICE. Usamos una
--        tabla + realtime de Supabase como señalización, que es suficiente
--        para 1:1 y evita montar un servidor aparte.
--        OJO: el media en sí NO pasa por aquí (va peer to peer, con TURN si
--        hace falta). Esto es solo el "apretón de manos".
--
-- Idempotente y con RLS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────
-- 91. Catálogo de experimentos
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.experiments (
  key         TEXT PRIMARY KEY,
  description TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  -- Variantes con su peso: {"control": 50, "variante": 50}
  variants    JSONB NOT NULL DEFAULT '{"control": 50, "variante": 50}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

-- Cualquiera con cuenta puede LEER qué experimentos hay activos (el cliente
-- necesita saberlo para asignarse variante). Escribir, solo el service_role.
DROP POLICY IF EXISTS "experiments_read" ON public.experiments;
CREATE POLICY "experiments_read"
  ON public.experiments FOR SELECT TO authenticated
  USING (true);

-- Semillas de los dos experimentos que pide la mejora 91.
INSERT INTO public.experiments (key, description, enabled, variants)
VALUES
  ('onboarding_v2', 'Orden y copy del onboarding tras el registro', true,
   '{"control": 50, "variante": 50}'::jsonb),
  ('lupa_ranking', 'Peso de la afinidad en el feed Para ti de la Lupa', true,
   '{"control": 50, "variante": 50}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.experiments IS
  '139: catálogo de experimentos A/B. La variante se asigna en cliente (hash del uid) y la exposición se registra en analytics_events.';

-- ─────────────────────────────────────────────────────
-- 100. Señalización de llamadas 1:1
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callee_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'audio',
  status       TEXT NOT NULL DEFAULT 'ringing',
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calls_kind_check   CHECK (kind IN ('audio', 'video')),
  CONSTRAINT calls_status_check CHECK (status IN ('ringing', 'accepted', 'rejected', 'ended', 'missed')),
  CONSTRAINT calls_no_self      CHECK (caller_id <> callee_id)
);

CREATE INDEX IF NOT EXISTS idx_calls_callee
  ON public.calls (callee_id, created_at DESC);

-- Mensajes de señalización (offer / answer / candidatos ICE).
CREATE TABLE IF NOT EXISTS public.call_signals (
  id         BIGSERIAL PRIMARY KEY,
  call_id    UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT call_signals_kind_check CHECK (kind IN ('offer', 'answer', 'ice'))
);

CREATE INDEX IF NOT EXISTS idx_call_signals_call
  ON public.call_signals (call_id, id);

ALTER TABLE public.calls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

-- Solo las dos personas de la llamada la ven y la tocan.
DROP POLICY IF EXISTS "calls_participants" ON public.calls;
CREATE POLICY "calls_participants"
  ON public.calls FOR ALL TO authenticated
  USING (caller_id = auth.uid() OR callee_id = auth.uid())
  WITH CHECK (caller_id = auth.uid() OR callee_id = auth.uid());

DROP POLICY IF EXISTS "call_signals_participants_select" ON public.call_signals;
CREATE POLICY "call_signals_participants_select"
  ON public.call_signals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id = call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
  ));

-- Enviar señales: solo a tu nombre y solo en llamadas tuyas.
DROP POLICY IF EXISTS "call_signals_participants_insert" ON public.call_signals;
CREATE POLICY "call_signals_participants_insert"
  ON public.call_signals FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_signals.call_id
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
        AND c.status IN ('ringing', 'accepted')
    )
  );

-- Iniciar llamada. Respeta el bloqueo y la privacidad de mensajes: si no
-- puedes escribirle, tampoco puedes llamarle.
CREATE OR REPLACE FUNCTION public.start_call(p_callee UUID, p_kind TEXT DEFAULT 'audio')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_me = p_callee THEN RAISE EXCEPTION 'cannot_call_self'; END IF;

  -- can_message_user (migración 134) ya comprueba bloqueos y dm_privacy.
  IF NOT public.can_message_user(p_callee) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  INSERT INTO public.calls (caller_id, callee_id, kind)
  VALUES (v_me, p_callee, COALESCE(p_kind, 'audio'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_call(UUID, TEXT) TO authenticated;

-- Cambiar el estado de la llamada (aceptar, rechazar, colgar).
CREATE OR REPLACE FUNCTION public.set_call_status(p_call UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.calls
     SET status     = p_status,
         started_at = CASE WHEN p_status = 'accepted' AND started_at IS NULL THEN now() ELSE started_at END,
         ended_at   = CASE WHEN p_status IN ('ended', 'rejected', 'missed') THEN now() ELSE ended_at END
   WHERE id = p_call
     AND (caller_id = v_me OR callee_id = v_me);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_call_status(UUID, TEXT) TO authenticated;

COMMENT ON TABLE public.calls IS
  '139: llamadas 1:1. Esta tabla es solo señalización y estado; el audio y vídeo van peer to peer.';

NOTIFY pgrst, 'reload schema';
