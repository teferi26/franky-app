-- NOTA (auditoria 23-sep-2026): este fichero SUSTITUYE a la antigua
-- 041_pii_encryption.sql (pgsodium), retirada a
-- supabase/migrations_superseded/041_pii_encryption.sql. Es la unica 041 vigente.
--
-- 041 — PII encryption at the column level (pgcrypto + supabase_vault)
--
-- Replaces the original 041_pii_encryption.sql, which assumed pgsodium.
-- pgsodium is deprecated by Supabase since 2024 and not enabled on Free
-- tier. This version uses pgcrypto (already installed) for encryption +
-- supabase_vault (already installed) for the master-key storage.
--
-- Defense story:
--   • RLS in 040 already prevents users from reading other users' PII.
--   • This migration adds defense-in-depth: even if an attacker dumps the
--     database or steals a backup, `profiles.phone_encrypted` and
--     `profiles.birth_date_encrypted` are ciphertext. They need the
--     vault master key to decrypt.
--
-- Encryption scheme:
--   • pgp_sym_encrypt(plain, key, 'cipher-algo=aes256') — PGP symmetric
--     with AES-256. Each call uses a fresh random salt, so two encryptions
--     of the same plaintext produce different ciphertexts (no determinism
--     leak).
--   • Master key stored in vault.secrets under name 'franky_pii_master'.
--
-- PREREQUISITES — you must run this ONCE manually in Supabase SQL editor,
-- BEFORE running this migration:
--
--   -- Generate a random 32-byte key, encode as hex, store in vault:
--   SELECT vault.create_secret(
--     encode(gen_random_bytes(32), 'hex'),
--     'franky_pii_master',
--     'Master key for column-level PII encryption (phone, birth_date)'
--   );
--
-- After that, this migration is idempotent (CREATE OR REPLACE everywhere).

-- =====================================================================
-- 1. Add encrypted shadow columns + plain-column nullable backup
-- =====================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS phone_encrypted bytea,
    ADD COLUMN IF NOT EXISTS birth_date_encrypted bytea;

-- =====================================================================
-- 2. Master-key fetcher (SECURITY DEFINER; service_role only)
-- =====================================================================
--
-- We never let `authenticated` callers read the raw master key. Only
-- SECURITY DEFINER functions in this file invoke it.

CREATE OR REPLACE FUNCTION public._pii_master_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'franky_pii_master'
    LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public._pii_master_key() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._pii_master_key() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._pii_master_key() FROM anon;

-- =====================================================================
-- 3. Encrypt / decrypt helpers (pgcrypto-based)
-- =====================================================================

CREATE OR REPLACE FUNCTION public._pii_encrypt(plain text)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_key text := public._pii_master_key();
BEGIN
    IF plain IS NULL THEN RETURN NULL; END IF;
    IF v_key IS NULL THEN
        RAISE EXCEPTION 'pii_master_key_missing'
            USING HINT = 'Create vault secret franky_pii_master before encrypting PII';
    END IF;
    RETURN pgp_sym_encrypt(plain, v_key, 'cipher-algo=aes256');
END;
$$;

CREATE OR REPLACE FUNCTION public._pii_decrypt(cipher bytea)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_key text := public._pii_master_key();
BEGIN
    IF cipher IS NULL THEN RETURN NULL; END IF;
    IF v_key IS NULL THEN RETURN NULL; END IF;
    RETURN pgp_sym_decrypt(cipher, v_key);
EXCEPTION WHEN OTHERS THEN
    -- Defensive: corrupted ciphertext should not crash the whole query.
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._pii_encrypt(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._pii_decrypt(bytea) FROM PUBLIC;
-- Encryption is only used by the trigger (SECURITY DEFINER chain).
-- Decryption is exposed via the profiles_decrypted view below; we don't
-- need to grant direct access to authenticated.

-- =====================================================================
-- 4. Trigger: auto-encrypt phone + birth_date on write
-- =====================================================================

CREATE OR REPLACE FUNCTION public._encrypt_profile_pii()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.phone IS NOT NULL THEN
            NEW.phone_encrypted := public._pii_encrypt(NEW.phone);
        END IF;
        IF NEW.birth_date IS NOT NULL THEN
            NEW.birth_date_encrypted := public._pii_encrypt(NEW.birth_date::text);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.phone IS DISTINCT FROM OLD.phone THEN
            NEW.phone_encrypted := public._pii_encrypt(NEW.phone);
        END IF;
        IF NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN
            NEW.birth_date_encrypted := public._pii_encrypt(NEW.birth_date::text);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_encrypt_profile_pii ON public.profiles;
CREATE TRIGGER trg_encrypt_profile_pii
    BEFORE INSERT OR UPDATE OF phone, birth_date
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public._encrypt_profile_pii();

-- =====================================================================
-- 5. Backfill existing rows
-- =====================================================================
--
-- We write the encrypted columns directly, bypassing the trigger. The
-- trigger's `NEW.phone IS DISTINCT FROM OLD.phone` check would otherwise
-- skip backfill UPDATEs of the form `SET phone = phone` because the
-- value didn't change. Direct UPDATE of encrypted columns avoids that
-- (the trigger fires on UPDATE OF phone, birth_date — not on the
-- encrypted shadow columns).

UPDATE public.profiles
SET birth_date_encrypted = public._pii_encrypt(birth_date::text)
WHERE birth_date IS NOT NULL AND birth_date_encrypted IS NULL;

UPDATE public.profiles
SET phone_encrypted = public._pii_encrypt(phone)
WHERE phone IS NOT NULL AND phone_encrypted IS NULL;

-- =====================================================================
-- 6. Decrypted view (security_invoker → reuses caller's RLS)
-- =====================================================================
--
-- security_invoker = true means: when authenticated user A reads from this
-- view, the underlying `public.profiles` RLS applies. So A sees only their
-- own row, exactly like reading profiles directly. Admin sees all rows.

CREATE OR REPLACE VIEW public.profiles_decrypted
WITH (security_invoker = true) AS
SELECT
    p.*,
    public._pii_decrypt(p.phone_encrypted) AS phone_decrypted,
    NULLIF(public._pii_decrypt(p.birth_date_encrypted), '')::date AS birth_date_decrypted
FROM public.profiles p;

GRANT SELECT ON public.profiles_decrypted TO authenticated;

COMMENT ON VIEW public.profiles_decrypted IS
    'Read PII back as plaintext. security_invoker view → caller RLS applies, '
    'so only the row owner or admin will see non-null phone_decrypted / '
    'birth_date_decrypted. Cross-user reads via public_profiles still hide '
    'these columns entirely.';

-- =====================================================================
-- 7. Notes for callers
-- =====================================================================
--
-- The plain `profiles.phone` and `profiles.birth_date` columns are still
-- present, populated, and readable (subject to 040 RLS). Encryption is
-- ADDITIVE: every write also fills the *_encrypted column.
--
-- The next migration (041b_pii_drop_plain.sql, TBD) drops the plain
-- columns once every read path has migrated to `profiles_decrypted`.
-- That step is intentionally separate so we can verify nothing regresses.
--
-- Operational checklist:
--   • Master key lives in vault.secrets — back it up separately from
--     the rest of the database (Settings → Vault → Export). Without it,
--     the encrypted columns are unrecoverable.
--   • Key rotation: write a new secret franky_pii_master_v2, dual-decrypt
--     during a window, then re-encrypt everything under v2 and retire v1.
--   • Performance: pgp_sym_encrypt costs a few hundred microseconds per
--     row. Negligible for INSERT/UPDATE; matters for big SELECTs through
--     `profiles_decrypted` — keep that view's reads scoped (don't SELECT *
--     over millions of rows).
