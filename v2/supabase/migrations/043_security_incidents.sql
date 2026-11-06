-- 043 — Security observability tables
--
-- Two append-only tables that feed forensics:
--   csp_violations  ← browser POSTs to /api/csp-report when the strict CSP blocks something
--   security_incidents ← honeypot hits, banned IPs, rate-limit blasts, etc.
--
-- Both:
--   - have RLS enabled
--   - admins read; nobody else reads or writes
--   - rows are inserted by SECURITY DEFINER triggers / API routes that
--     bypass RLS (server-side, never from the browser client)
--
-- A retention job (scheduled function or pg_cron) trims both to the last
-- 100K rows. We don't need history forever; we need recent anomalies.

-- =====================================================================
-- csp_violations
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.csp_violations (
    id          bigserial PRIMARY KEY,
    created_at  timestamptz NOT NULL DEFAULT now(),
    ip_hash     text,
    ua          text,
    report      jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_csp_violations_created
    ON public.csp_violations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csp_violations_directive
    ON public.csp_violations ((report ->> 'violated-directive'));

ALTER TABLE public.csp_violations ENABLE ROW LEVEL SECURITY;

-- Admins can browse the table.
CREATE POLICY "Admins read csp_violations"
    ON public.csp_violations FOR SELECT
    USING (public.is_admin());

-- INSERT path: the /api/csp-report route uses the anon Supabase client which
-- respects RLS. We need an INSERT policy that lets the anon role write here
-- without exposing reads. Note: the route also rate-limits to 60/min per IP
-- so this isn't a free DoS vector.
CREATE POLICY "Anyone can submit csp_violations"
    ON public.csp_violations FOR INSERT
    WITH CHECK (true);

GRANT INSERT ON public.csp_violations TO anon, authenticated;
GRANT USAGE ON SEQUENCE public.csp_violations_id_seq TO anon, authenticated;

COMMENT ON TABLE public.csp_violations IS
    'Append-only log of Content-Security-Policy violations reported by '
    'browsers via /api/csp-report. Useful to spot XSS attempts (the policy '
    'blocked them) and to find legit scripts we forgot to allowlist. '
    'Hash the IP — we never store it raw.';


-- =====================================================================
-- security_incidents
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.security_incidents (
    id          bigserial PRIMARY KEY,
    created_at  timestamptz NOT NULL DEFAULT now(),
    kind        text NOT NULL CHECK (kind IN (
        'honeypot_hit',
        'rate_limit_blast',
        'auth_brute_force',
        'banned_ip_hit',
        'turnstile_failed',
        'csp_violation_spike',
        'admin_action_denied',
        'other'
    )),
    severity    text NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    ip_hash     text,
    ua          text,
    path        text,
    user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    details     jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_created
    ON public.security_incidents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_incidents_kind
    ON public.security_incidents (kind);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity
    ON public.security_incidents (severity);

ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read security_incidents"
    ON public.security_incidents FOR SELECT
    USING (public.is_admin());

-- No INSERT policy here — only SECURITY DEFINER functions / server-side
-- code using the service-role key write to this table.

COMMENT ON TABLE public.security_incidents IS
    'Append-only forensic log: honeypot hits, ban activations, brute-force '
    'attempts, Turnstile failures. Each row carries enough detail to react '
    'and post-mortem.';


-- =====================================================================
-- Helper RPC: log_security_incident (callable from anon API routes)
-- =====================================================================
--
-- Centralises writes so we don't grant INSERT on the table itself.
-- The route handler calls this via supabase.rpc('log_security_incident', { ... })
-- with the anon client; the SECURITY DEFINER wrapper does the actual insert.

CREATE OR REPLACE FUNCTION public.log_security_incident(
    p_kind text,
    p_severity text DEFAULT 'low',
    p_ip_hash text DEFAULT NULL,
    p_ua text DEFAULT NULL,
    p_path text DEFAULT NULL,
    p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id bigint;
    v_uid uuid := auth.uid();  -- may be NULL for anon callers
BEGIN
    -- Defensive validation: reject unknown kinds early.
    IF p_kind NOT IN (
        'honeypot_hit', 'rate_limit_blast', 'auth_brute_force',
        'banned_ip_hit', 'turnstile_failed', 'csp_violation_spike',
        'admin_action_denied', 'other'
    ) THEN
        RAISE EXCEPTION 'invalid_kind';
    END IF;

    INSERT INTO public.security_incidents (kind, severity, ip_hash, ua, path, user_id, details)
    VALUES (p_kind, p_severity, p_ip_hash, left(p_ua, 500), p_path, v_uid, p_details)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_security_incident(text, text, text, text, text, jsonb)
    TO anon, authenticated;
