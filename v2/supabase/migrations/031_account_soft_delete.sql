-- 031_account_soft_delete.sql
-- Soft delete completo para cuentas de usuario.
-- profiles ya tiene is_discarded (migración 010). Añadimos metadata adicional
-- para poder distinguir self-delete vs admin-delete y permitir recuperación.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS discarded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS self_deleted BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_discarded_at
    ON public.profiles(discarded_at)
    WHERE is_discarded = true;

-- Trigger: cuando is_discarded cambia a true, escribe discarded_at si está vacío.
-- Cuando vuelve a false (recovery), limpia discarded_at, discarded_by y self_deleted.
CREATE OR REPLACE FUNCTION public.sync_discarded_metadata()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_discarded = true AND (OLD.is_discarded IS NULL OR OLD.is_discarded = false) THEN
        NEW.discarded_at := COALESCE(NEW.discarded_at, NOW());
    ELSIF NEW.is_discarded = false AND OLD.is_discarded = true THEN
        NEW.discarded_at := NULL;
        NEW.discarded_by := NULL;
        NEW.self_deleted := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_discarded_trigger ON public.profiles;
CREATE TRIGGER sync_discarded_trigger
    BEFORE UPDATE OF is_discarded ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.sync_discarded_metadata();

-- RPC para que el usuario pueda recuperarse a sí mismo (sólo si está discarded).
-- Se llama tras el login si profile.is_discarded = true.
CREATE OR REPLACE FUNCTION public.recover_my_account()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET is_discarded = false
    WHERE id = auth.uid() AND is_discarded = true;
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_my_account() TO authenticated;
