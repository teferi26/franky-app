-- Migration 066: añade is_encrypted flag a messages para soportar E2E in-house.
--
-- Cuando is_encrypted=true:
--   - content guarda el envelope encriptado base64(iv|ciphertext|tag)
--   - el server NO puede leerlo (sólo los dos clientes con la conversation key)
--   - message_type sigue siendo 'text' (o 'image'/'audio'/etc para attachments
--     futuros — Wave 14 encrypt attachments también)
--
-- Backwards compat: mensajes existentes sin flag → is_encrypted=false (plain).
-- Nuevos clientes que negociaron E2E enviarán is_encrypted=true.

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS encryption_version INT;
-- encryption_version referencia la `user_keys.key_version` del sender al momento
-- de encriptar. Permite key rotation gradual (mensajes antiguos siguen
-- decifrables con la public key de aquel momento — si guardamos histórico).

COMMENT ON COLUMN public.messages.is_encrypted IS
    'true → content es base64(iv|ciphertext|tag) AES-256-GCM. false → plaintext.';
