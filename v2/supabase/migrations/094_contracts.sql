-- =====================================================
-- 094: Contratos de alquiler (LAU) + firma electrónica simple
-- =====================================================
-- El propietario construye un contrato de alquiler respondiendo un asistente
-- (answers JSONB). Ve la preview (PDF generado bajo demanda desde answers),
-- selecciona los inquilinos y lo envía a firmar. Cada parte (arrendador +
-- arrendatarios) firma in-app: clic + sello de tiempo + IP + user-agent +
-- consentimiento = firma electrónica simple (eIDAS). El cobro de renta/fianza
-- va por /api/stripe/pay/rent (ledger `payments`, type 'rent').
--
-- Decisiones:
--   · El PDF NO se guarda en bucket: se regenera de forma determinista desde
--     `answers`. Para garantizar integridad, al ENVIAR se congela el contenido:
--     `locked_at` + `content_sha256` (hash de las answers acordadas, calculado
--     en servidor). Cada firma guarda ese mismo hash → prueba de qué se firmó.
--   · Escrituras de estado (enviar, firmar, cancelar) SOLO vía RPC
--     SECURITY DEFINER. El propietario edita el borrador directamente por RLS,
--     pero una vez `locked_at` no puede tocar answers.
--   · Las firmas son append-only e inmutables (sin UPDATE/DELETE).
--
-- ORDEN: primero se crean las TRES tablas y luego TODAS las políticas. La
-- política contracts_select_signer referencia contract_signers, así que esa
-- tabla debe existir antes de crear las políticas (Postgres valida el USING al
-- crear la política).
--
-- AVISO LEGAL: la plantilla generada NO es asesoramiento legal; se recomienda
-- revisión profesional. La firma simple es admisible pero con menor peso
-- probatorio que la avanzada/cualificada. El depósito de la fianza en el
-- organismo autonómico es responsabilidad del propietario.
-- =====================================================

-- =====================================================
-- 1. Tablas
-- =====================================================
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    accommodation_id UUID NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
    title TEXT,
    -- Respuestas del asistente: única fuente de verdad del PDF.
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'partially_signed', 'fully_signed', 'cancelled')),
    -- Importes congelados al enviar (snapshot para el cobro de renta/fianza).
    rent_cents    INTEGER CHECK (rent_cents IS NULL OR rent_cents >= 0),
    deposit_cents INTEGER CHECK (deposit_cents IS NULL OR deposit_cents >= 0),
    -- Hash determinista de las answers congeladas al enviar (integridad).
    content_sha256 TEXT,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_owner ON public.contracts(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_accommodation ON public.contracts(accommodation_id);

CREATE TABLE IF NOT EXISTS public.contract_signers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'tenant')),
    sign_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed')),
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_signers_contract ON public.contract_signers(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_signers_user ON public.contract_signers(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_signer
    ON public.contract_signers(contract_id, user_id);

CREATE TABLE IF NOT EXISTS public.contract_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    signer_id UUID NOT NULL REFERENCES public.contract_signers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip TEXT,
    user_agent TEXT,
    consent_text TEXT NOT NULL,
    -- Hash del contenido que esta parte firmó (== contracts.content_sha256).
    content_sha256 TEXT,
    audit JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_contract_signatures_contract ON public.contract_signatures(contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_signature_signer
    ON public.contract_signatures(signer_id);

-- =====================================================
-- 2. RLS (todas las tablas ya existen → las políticas pueden cruzarse)
-- =====================================================
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

-- contracts: el propietario gestiona sus contratos.
DROP POLICY IF EXISTS "contracts_select_owner" ON public.contracts;
CREATE POLICY "contracts_select_owner"
    ON public.contracts FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

-- contracts: los firmantes (inquilinos seleccionados) ven el contrato a firmar.
DROP POLICY IF EXISTS "contracts_select_signer" ON public.contracts;
CREATE POLICY "contracts_select_signer"
    ON public.contracts FOR SELECT TO authenticated
    USING (id IN (SELECT contract_id FROM public.contract_signers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "contracts_select_admin" ON public.contracts;
CREATE POLICY "contracts_select_admin"
    ON public.contracts FOR SELECT TO authenticated
    USING (public.is_admin());

-- contracts: el propietario crea borradores para sus propios pisos.
DROP POLICY IF EXISTS "contracts_insert_owner" ON public.contracts;
CREATE POLICY "contracts_insert_owner"
    ON public.contracts FOR INSERT TO authenticated
    WITH CHECK (
        owner_id = auth.uid()
        AND accommodation_id IN (SELECT id FROM public.accommodations WHERE owner_id = auth.uid())
    );

-- contracts: el propietario edita solo mientras no esté congelado.
DROP POLICY IF EXISTS "contracts_update_owner" ON public.contracts;
CREATE POLICY "contracts_update_owner"
    ON public.contracts FOR UPDATE TO authenticated
    USING (owner_id = auth.uid() AND locked_at IS NULL)
    WITH CHECK (owner_id = auth.uid() AND locked_at IS NULL);

-- contracts: solo se pueden borrar borradores.
DROP POLICY IF EXISTS "contracts_delete_owner" ON public.contracts;
CREATE POLICY "contracts_delete_owner"
    ON public.contracts FOR DELETE TO authenticated
    USING (owner_id = auth.uid() AND status = 'draft');

-- contract_signers: cada firmante ve su fila; el propietario ve todas las suyas.
DROP POLICY IF EXISTS "contract_signers_select_self" ON public.contract_signers;
CREATE POLICY "contract_signers_select_self"
    ON public.contract_signers FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "contract_signers_select_owner" ON public.contract_signers;
CREATE POLICY "contract_signers_select_owner"
    ON public.contract_signers FOR SELECT TO authenticated
    USING (contract_id IN (SELECT id FROM public.contracts WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "contract_signers_select_admin" ON public.contract_signers;
CREATE POLICY "contract_signers_select_admin"
    ON public.contract_signers FOR SELECT TO authenticated
    USING (public.is_admin());

-- Escrituras de contract_signers solo vía RPC (send_contract / sign_contract).

-- contract_signatures: firmante ve las suyas; propietario las de sus contratos.
-- Inmutable: sin INSERT/UPDATE/DELETE para authenticated (solo sign_contract).
DROP POLICY IF EXISTS "contract_signatures_select_self" ON public.contract_signatures;
CREATE POLICY "contract_signatures_select_self"
    ON public.contract_signatures FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "contract_signatures_select_owner" ON public.contract_signatures;
CREATE POLICY "contract_signatures_select_owner"
    ON public.contract_signatures FOR SELECT TO authenticated
    USING (contract_id IN (SELECT id FROM public.contracts WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "contract_signatures_select_admin" ON public.contract_signatures;
CREATE POLICY "contract_signatures_select_admin"
    ON public.contract_signatures FOR SELECT TO authenticated
    USING (public.is_admin());

-- =====================================================
-- 3. Trigger updated_at en contracts
-- =====================================================
CREATE OR REPLACE FUNCTION public.touch_contracts_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contracts_updated_at ON public.contracts;
CREATE TRIGGER contracts_updated_at
    BEFORE UPDATE ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.touch_contracts_updated_at();

-- =====================================================
-- 4. send_contract — congela el contrato y crea los firmantes
-- =====================================================
-- El propietario envía el borrador a firmar. Se congela el contenido
-- (locked_at + content_sha256, calculados en servidor) y se snapshotean los
-- importes de renta/fianza. Se crea un firmante 'owner' (el propietario) y un
-- firmante 'tenant' por cada inquilino seleccionado. Todos firman el mismo
-- contenido. Idempotente solo si el contrato sigue en 'draft'.
-- =====================================================
CREATE OR REPLACE FUNCTION public.send_contract(
    p_contract_id UUID,
    p_tenant_ids UUID[],
    p_content_sha256 TEXT,
    p_rent_cents INTEGER DEFAULT NULL,
    p_deposit_cents INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_contract RECORD;
    v_title TEXT;
    v_tenant UUID;
    v_order INTEGER := 1;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF p_tenant_ids IS NULL OR array_length(p_tenant_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'selecciona al menos un inquilino';
    END IF;

    SELECT c.id, c.status, c.owner_id, a.title
      INTO v_contract
      FROM public.contracts c
      JOIN public.accommodations a ON a.id = c.accommodation_id
     WHERE c.id = p_contract_id
     FOR UPDATE OF c;

    IF v_contract.id IS NULL THEN RAISE EXCEPTION 'contrato no encontrado'; END IF;
    IF v_contract.owner_id <> v_user THEN RAISE EXCEPTION 'no autorizado'; END IF;
    IF v_contract.status <> 'draft' THEN RAISE EXCEPTION 'el contrato ya fue enviado'; END IF;
    v_title := v_contract.title;

    -- Congela el contenido e importes.
    UPDATE public.contracts
       SET status = 'sent',
           locked_at = NOW(),
           content_sha256 = p_content_sha256,
           rent_cents = p_rent_cents,
           deposit_cents = p_deposit_cents
     WHERE id = p_contract_id;

    -- Firmante propietario (arrendador).
    INSERT INTO public.contract_signers (contract_id, user_id, role, sign_order)
    VALUES (p_contract_id, v_user, 'owner', 0)
    ON CONFLICT (contract_id, user_id) DO NOTHING;

    -- Firmantes inquilinos (arrendatarios).
    FOREACH v_tenant IN ARRAY p_tenant_ids LOOP
        IF v_tenant = v_user THEN CONTINUE; END IF;
        INSERT INTO public.contract_signers (contract_id, user_id, role, sign_order)
        VALUES (p_contract_id, v_tenant, 'tenant', v_order)
        ON CONFLICT (contract_id, user_id) DO NOTHING;
        v_order := v_order + 1;

        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_tenant, 'contract', 'Tienes un contrato para firmar',
            'Un propietario te ha enviado el contrato de "' || COALESCE(v_title, 'tu alquiler') ||
                '" para firmar.',
            jsonb_build_object('kind', 'contract_to_sign', 'contract_id', p_contract_id,
                               'url', '/contratos/' || p_contract_id)
        );
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'contract_id', p_contract_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_contract(UUID, UUID[], TEXT, INTEGER, INTEGER) TO authenticated;

-- =====================================================
-- 5. sign_contract — una parte firma (append-only + avance de estado)
-- =====================================================
-- El firmante (arrendador o arrendatario) firma. IP/User-Agent los captura la
-- ruta API desde headers y los pasa aquí. Se inserta la firma inmutable, se
-- marca el firmante como 'signed' y se avanza el estado del contrato:
-- partially_signed mientras falten firmas, fully_signed cuando todas estén.
-- =====================================================
CREATE OR REPLACE FUNCTION public.sign_contract(
    p_contract_id UUID,
    p_ip TEXT,
    p_user_agent TEXT,
    p_consent_text TEXT,
    p_audit JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_signer RECORD;
    v_hash TEXT;
    v_owner UUID;
    v_title TEXT;
    v_pending INTEGER;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
    IF p_consent_text IS NULL OR length(trim(p_consent_text)) = 0 THEN
        RAISE EXCEPTION 'consentimiento requerido';
    END IF;

    -- El usuario debe ser un firmante pendiente de este contrato.
    SELECT cs.id, cs.status
      INTO v_signer
      FROM public.contract_signers cs
     WHERE cs.contract_id = p_contract_id AND cs.user_id = v_user
     FOR UPDATE OF cs;

    IF v_signer.id IS NULL THEN RAISE EXCEPTION 'no eres firmante de este contrato'; END IF;
    IF v_signer.status = 'signed' THEN RAISE EXCEPTION 'ya has firmado este contrato'; END IF;

    -- Hash congelado + datos del piso/propietario.
    SELECT c.content_sha256, c.owner_id, a.title
      INTO v_hash, v_owner, v_title
      FROM public.contracts c
      JOIN public.accommodations a ON a.id = c.accommodation_id
     WHERE c.id = p_contract_id;

    INSERT INTO public.contract_signatures
        (contract_id, signer_id, user_id, ip, user_agent, consent_text, content_sha256, audit)
    VALUES
        (p_contract_id, v_signer.id, v_user, p_ip, p_user_agent, p_consent_text, v_hash, p_audit);

    UPDATE public.contract_signers
       SET status = 'signed', signed_at = NOW()
     WHERE id = v_signer.id;

    -- ¿Quedan firmantes pendientes?
    SELECT COUNT(*) INTO v_pending
      FROM public.contract_signers
     WHERE contract_id = p_contract_id AND status = 'pending';

    IF v_pending = 0 THEN
        UPDATE public.contracts SET status = 'fully_signed' WHERE id = p_contract_id;
        -- Avisa a todas las partes.
        INSERT INTO public.notifications (user_id, type, title, body, data)
        SELECT cs.user_id, 'contract', 'Contrato firmado por todas las partes',
               'El contrato de "' || COALESCE(v_title, 'tu alquiler') || '" esta completamente firmado.',
               jsonb_build_object('kind', 'contract_fully_signed', 'contract_id', p_contract_id,
                                  'url', '/contratos/' || p_contract_id)
          FROM public.contract_signers cs
         WHERE cs.contract_id = p_contract_id;
    ELSE
        UPDATE public.contracts SET status = 'partially_signed'
         WHERE id = p_contract_id AND status <> 'partially_signed';
        -- Avisa al propietario del progreso.
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_owner, 'contract', 'Nueva firma en tu contrato',
            'Una parte ha firmado el contrato de "' || COALESCE(v_title, 'tu alquiler') ||
                '". Faltan ' || v_pending || ' firma(s).',
            jsonb_build_object('kind', 'contract_signed_progress', 'contract_id', p_contract_id,
                               'pending', v_pending, 'url', '/propietario/dashboard/contratos')
        );
    END IF;

    RETURN jsonb_build_object('ok', true, 'fully_signed', v_pending = 0, 'pending', v_pending);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_contract(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- =====================================================
-- 6. cancel_contract — el propietario cancela un contrato no firmado
-- =====================================================
CREATE OR REPLACE FUNCTION public.cancel_contract(p_contract_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user UUID := auth.uid();
    v_status TEXT;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

    SELECT status INTO v_status FROM public.contracts
     WHERE id = p_contract_id AND owner_id = v_user
     FOR UPDATE;
    IF v_status IS NULL THEN RAISE EXCEPTION 'contrato no encontrado'; END IF;
    IF v_status = 'fully_signed' THEN RAISE EXCEPTION 'un contrato firmado no se puede cancelar'; END IF;

    UPDATE public.contracts SET status = 'cancelled' WHERE id = p_contract_id;

    -- Avisa a los firmantes pendientes.
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT cs.user_id, 'contract', 'Contrato cancelado',
           'El propietario ha cancelado un contrato que tenias pendiente de firma.',
           jsonb_build_object('kind', 'contract_cancelled', 'contract_id', p_contract_id)
      FROM public.contract_signers cs
     WHERE cs.contract_id = p_contract_id AND cs.role = 'tenant';

    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_contract(UUID) TO authenticated;
