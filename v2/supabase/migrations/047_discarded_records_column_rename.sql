-- 047 — Align discarded_records columns with what the admin dashboard expects
--
-- Production was created with `discarded_at` / `discarded_by` columns, but the
-- frontend (and the intent of migration 015) uses `deleted_at` / `deleted_by`
-- plus `restored_at` / `restored_by` to support the restore flow.
--
-- Symptom before this fix:
--   GET /rest/v1/discarded_records?restored_at=is.null&order=deleted_at.desc
--     → 400 (Bad Request, "column does not exist")
--
-- The papelera tab in /admin couldn't load and the "restore" button
-- couldn't write the timestamp.

ALTER TABLE public.discarded_records RENAME COLUMN discarded_at TO deleted_at;
ALTER TABLE public.discarded_records RENAME COLUMN discarded_by TO deleted_by;
ALTER TABLE public.discarded_records ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
ALTER TABLE public.discarded_records ADD COLUMN IF NOT EXISTS restored_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.discarded_records.deleted_at IS
    'When the row was moved to the papelera (formerly discarded_at).';
COMMENT ON COLUMN public.discarded_records.restored_at IS
    'When (if ever) the row was restored. NULL = still in the papelera.';
COMMENT ON COLUMN public.discarded_records.restored_by IS
    'Admin who clicked Restore. NULL = still in the papelera.';
