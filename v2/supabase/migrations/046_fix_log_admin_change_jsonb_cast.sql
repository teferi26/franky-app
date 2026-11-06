-- 046 — Fix _log_admin_change: (NEW)::jsonb crashes on composite row types
--
-- The audit trigger from migration 042 used `(NEW)::jsonb ->> 'id'` to read
-- the row id. Postgres has no implicit cast from a composite (record) type
-- to jsonb, so this raises:
--
--   ERROR: 42846: cannot cast type profiles to jsonb
--   CONTEXT: PL/pgSQL function _log_admin_change() line 18 at assignment
--
-- It only manifested when the trigger actually entered its body, which is
-- gated by `IF v_actor_id IS NULL OR NOT is_admin() THEN RETURN; END IF;`.
-- Migrations were applied as the postgres role (auth.uid() = NULL), so the
-- trigger always early-returned and the bug stayed hidden until a real
-- authenticated admin tried to UPDATE profiles from the dashboard.
--
-- User-visible symptom: PATCH /rest/v1/profiles?id=eq.<uuid> returned 400
-- and the admin papelera buttons silently failed.
--
-- Fix: use `to_jsonb(NEW)` and `to_jsonb(OLD)` (the canonical row-to-jsonb
-- conversion), cache the result in locals to avoid recomputing, and wrap
-- the whole body in an EXCEPTION block so an audit failure can never
-- cascade into the user-facing operation.

CREATE OR REPLACE FUNCTION public._log_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_email text;
    v_changes jsonb := '{}'::jsonb;
    v_target_id text;
    v_new_json jsonb;
    v_old_json jsonb;
BEGIN
    IF v_actor_id IS NULL OR NOT public.is_admin() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor_id;

    IF TG_OP = 'INSERT' THEN
        v_new_json := to_jsonb(NEW);
        v_target_id := COALESCE(v_new_json ->> 'id', '');
        v_changes := jsonb_build_object('inserted', v_new_json);
    ELSIF TG_OP = 'UPDATE' THEN
        v_new_json := to_jsonb(NEW);
        v_old_json := to_jsonb(OLD);
        v_target_id := COALESCE(v_new_json ->> 'id', '');
        SELECT jsonb_object_agg(key, jsonb_build_object('from', old_v, 'to', new_v))
        INTO v_changes
        FROM (
            SELECT key, old_obj.value AS old_v, new_obj.value AS new_v
            FROM jsonb_each(v_old_json) old_obj
            JOIN jsonb_each(v_new_json) new_obj USING (key)
            WHERE old_obj.value IS DISTINCT FROM new_obj.value
        ) diffs;
        v_changes := COALESCE(v_changes, '{}'::jsonb);
    ELSIF TG_OP = 'DELETE' THEN
        v_old_json := to_jsonb(OLD);
        v_target_id := COALESCE(v_old_json ->> 'id', '');
        v_changes := jsonb_build_object('deleted', v_old_json);
    END IF;

    IF TG_OP = 'UPDATE' AND v_changes = '{}'::jsonb THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.admin_actions (
        actor_id, actor_email, action, target_table, target_id, changes
    ) VALUES (
        v_actor_id, v_actor_email, lower(TG_OP), TG_TABLE_NAME, v_target_id, v_changes
    );

    RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
    -- Audit log must never block the underlying admin operation.
    RETURN COALESCE(NEW, OLD);
END;
$func$;
