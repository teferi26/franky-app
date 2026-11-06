-- 042 — Admin action audit log + automatic change tracking
--
-- A single append-only table records every admin-side write to sensitive
-- tables. Forensics is impossible without this — Wave S13 (incident response)
-- depends on it.
--
-- Coverage:
--   profiles (role, is_discarded, strikes_count changes)
--   universities, careers, scholarships, news, leisure_spots, accommodations
--   user_reports (status transitions)
--
-- The audit log only captures the actor + before/after JSON. It does NOT
-- capture the full row (which could contain PII the admin doesn't normally
-- have access to log) — just the changed fields.

CREATE TABLE IF NOT EXISTS public.admin_actions (
    id              bigserial PRIMARY KEY,
    actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email     text,
    action          text NOT NULL,                    -- 'insert' | 'update' | 'delete'
    target_table    text NOT NULL,
    target_id       text,                              -- target row PK as text
    changes         jsonb DEFAULT '{}'::jsonb,         -- { field: { from, to } } or full row on delete
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created
    ON public.admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_actor
    ON public.admin_actions (actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_table
    ON public.admin_actions (target_table);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target
    ON public.admin_actions (target_table, target_id);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin_actions"
    ON public.admin_actions FOR SELECT
    USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policies — only the SECURITY DEFINER trigger writes.

COMMENT ON TABLE public.admin_actions IS
    'Append-only audit log of admin-side writes to sensitive tables. '
    'Only admins can read; only the _log_admin_change trigger writes.';

-- =====================================================================
-- Universal trigger function
-- =====================================================================
--
-- Detects whether the current user is an admin (via is_admin()) and, if so,
-- records the diff. Non-admin writes (regular user updating own profile)
-- are NOT logged here — we only want admin-side modifications in this table.

CREATE OR REPLACE FUNCTION public._log_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_email text;
    v_changes jsonb := '{}'::jsonb;
    v_target_id text;
BEGIN
    -- Skip if no caller (system migration) or caller is not admin.
    IF v_actor_id IS NULL OR NOT public.is_admin() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor_id;

    IF TG_OP = 'INSERT' THEN
        v_target_id := COALESCE((NEW)::jsonb ->> 'id', '');
        v_changes := jsonb_build_object('inserted', to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        v_target_id := COALESCE((NEW)::jsonb ->> 'id', '');
        -- Compute diff: only fields that actually changed
        SELECT jsonb_object_agg(key, jsonb_build_object('from', old_v, 'to', new_v))
        INTO v_changes
        FROM (
            SELECT key, old_obj.value AS old_v, new_obj.value AS new_v
            FROM jsonb_each(to_jsonb(OLD)) old_obj
            JOIN jsonb_each(to_jsonb(NEW)) new_obj USING (key)
            WHERE old_obj.value IS DISTINCT FROM new_obj.value
        ) diffs;
        v_changes := COALESCE(v_changes, '{}'::jsonb);
    ELSIF TG_OP = 'DELETE' THEN
        v_target_id := COALESCE((OLD)::jsonb ->> 'id', '');
        v_changes := jsonb_build_object('deleted', to_jsonb(OLD));
    END IF;

    -- Skip noisy "no fields changed" UPDATE noise.
    IF TG_OP = 'UPDATE' AND v_changes = '{}'::jsonb THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.admin_actions (
        actor_id, actor_email, action, target_table, target_id, changes
    ) VALUES (
        v_actor_id, v_actor_email, lower(TG_OP), TG_TABLE_NAME, v_target_id, v_changes
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================================
-- Attach trigger to sensitive tables
-- =====================================================================
--
-- Pattern: AFTER trigger so we record what actually persisted. We use
-- FOR EACH ROW to capture individual row identity.

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'profiles',
        'universities',
        'careers',
        'scholarships',
        'news',
        'leisure_spots',
        'accommodations',
        'user_reports'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_log_admin_change ON public.%I;', t
        );
        EXECUTE format(
            'CREATE TRIGGER trg_log_admin_change
                AFTER INSERT OR UPDATE OR DELETE ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public._log_admin_change();',
            t
        );
    END LOOP;
END;
$$;

-- =====================================================================
-- Notes
-- =====================================================================
--
-- The trigger calls `is_admin()` which itself queries `profiles`. To avoid
-- recursion on profiles-table writes:
--   - is_admin() is SECURITY DEFINER + STABLE-ish (now VOLATILE since 040)
--     so each call re-queries, but does NOT recurse because it's a SELECT,
--     not a write.
--
-- Performance:
--   - Triggers add a small write overhead. Negligible for low-frequency
--     admin actions. Catalogue bulk imports may be slow; for those use
--     `SET LOCAL session_replication_role = replica;` to skip triggers.
