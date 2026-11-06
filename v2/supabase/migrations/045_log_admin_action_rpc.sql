-- 045 — Restore the log_admin_action RPC that the admin dashboard relies on
--
-- Why this exists
-- ----------------
-- The admin dashboard at /admin calls
--
--   supabase.rpc('log_admin_action', {
--     p_admin_id: ...,
--     p_action: 'discard_user' | 'restore_user' | 'issue_strike' | 'report_*' | 'hard_delete_user' | 'create_propietario',
--     p_target_type: 'user' | 'report' | ...,
--     p_target_id: ...,
--     p_details: {}
--   })
--
-- after every privileged write (send-to-papelera, restore, strike, etc.).
--
-- Earlier migrations 010 and 015 defined a function called log_admin_action
-- but with different parameter names (p_target_table instead of
-- p_target_type) AND those migrations were never applied to this production
-- database — `pg_proc` had no entry for log_admin_action at all. PostgREST
-- responded with "Could not find the function" and the admin dashboard
-- buttons silently failed for the user even though the UPDATE on profiles
-- itself succeeded.
--
-- This migration creates the function with the signature the application
-- actually uses, and routes the audit row into `admin_actions` (the table
-- that migration 042 already provisioned).
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_admin_id   uuid,
    p_action     text,
    p_target_type text,
    p_target_id  text DEFAULT NULL,
    p_details    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
    v_actor_email text;
BEGIN
    -- Don't let one caller log actions on behalf of another admin.
    IF auth.uid() IS NULL OR auth.uid() <> p_admin_id THEN
        RETURN;
    END IF;
    IF NOT public.is_admin() THEN
        RETURN;
    END IF;

    SELECT email INTO v_actor_email FROM auth.users WHERE id = p_admin_id;

    INSERT INTO public.admin_actions (
        actor_id, actor_email, action, target_table, target_id, changes
    ) VALUES (
        p_admin_id, v_actor_email, p_action, p_target_type, p_target_id,
        COALESCE(p_details, '{}'::jsonb)
    );
EXCEPTION WHEN OTHERS THEN
    -- An audit-log failure must NEVER cascade into the main operation.
    -- The admin dashboard treats this as fire-and-forget; we honor that.
    NULL;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.log_admin_action(uuid, text, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.log_admin_action(uuid, text, text, text, jsonb) IS
    'Audit trail wrapper used by /admin dashboard. Silently no-ops for non-admin '
    'callers; never raises (an audit failure must not block the user-facing '
    'operation). Persists rows into public.admin_actions.';
