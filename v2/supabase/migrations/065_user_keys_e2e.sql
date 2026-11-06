-- Migration 065: user_keys — identity public keys para E2E encryption (in-house)
--
-- Implementa el lado server-side de E2E. Cada usuario publica su identity
-- public key (ECDH P-256, X.509 DER + base64). Los demás usuarios la consultan
-- para derivar una conversation key via ECDH(myPrivate, peerPublic) → HKDF-SHA256.
--
-- Privacidad: el servidor NUNCA ve private keys ni conversation keys ni mensajes
-- en plain. Sólo public keys (que por definición son públicas).
--
-- Alg fijo a 'ECDH-P256' en v1. Wave 14+ podemos añadir 'ECDH-X25519' o
-- introducir Double Ratchet con prekeys.

CREATE TABLE IF NOT EXISTS public.user_keys (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    identity_pubkey TEXT NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'ECDH-P256',
    -- Versioning para rotaciones. Cada rotación incrementa.
    -- Los clientes mantienen el version del peer cacheado y re-derivan key si cambia.
    key_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_keys_user_id ON public.user_keys(user_id);

ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado puede leer las public keys de otros
-- (necesario para encriptar mensajes hacia ellos). Public keys NO son secret.
DROP POLICY IF EXISTS "user_keys_select_authenticated" ON public.user_keys;
CREATE POLICY "user_keys_select_authenticated"
    ON public.user_keys
    FOR SELECT
    TO authenticated
    USING (true);

-- INSERT/UPDATE: solo el dueño puede modificar su propia entry.
DROP POLICY IF EXISTS "user_keys_insert_own" ON public.user_keys;
CREATE POLICY "user_keys_insert_own"
    ON public.user_keys
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_keys_update_own" ON public.user_keys;
CREATE POLICY "user_keys_update_own"
    ON public.user_keys
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_keys_delete_own" ON public.user_keys;
CREATE POLICY "user_keys_delete_own"
    ON public.user_keys
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Trigger para actualizar updated_at automáticamente.
CREATE OR REPLACE FUNCTION public.touch_user_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF OLD.identity_pubkey IS DISTINCT FROM NEW.identity_pubkey THEN
        NEW.key_version = OLD.key_version + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_keys_updated_at ON public.user_keys;
CREATE TRIGGER trg_user_keys_updated_at
    BEFORE UPDATE ON public.user_keys
    FOR EACH ROW EXECUTE FUNCTION public.touch_user_keys_updated_at();

COMMENT ON TABLE public.user_keys IS 'E2E encryption identity public keys (ECDH P-256). Private keys NUNCA tocan el server.';
