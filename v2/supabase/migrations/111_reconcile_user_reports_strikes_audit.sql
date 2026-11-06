-- =====================================================================
-- 111: Reconciliación de moderación y auditoría con la BD de producción
--
-- Contexto
-- --------
-- Las migraciones 010 y 015 NUNCA se aplicaron en la BD de producción (lo
-- documenta la cabecera de 045 y lo confirmó el 42P01 sobre user_reports al
-- aplicar la 110 el 12-jun-2026). En prod NO existen: user_reports,
-- user_strikes ni admin_audit_log. Consecuencia visible: en /admin la tab
-- Reportes y el botón de strike fallan en silencio, y el Registro de
-- Auditoría siempre sale vacío.
--
-- Qué hace
-- --------
--   1. Crea user_reports y user_strikes (esquema y policies de la 010,
--      secciones 2 y 3) con IF NOT EXISTS, más las policies de staff de la
--      110 ("Staff view reports" / "Staff view strikes"). Los FOR ALL de
--      admin de la 010 se dividen en una policy por operación (checklist
--      franky-rls-review; revisión de seguridad del 12-jun).
--   2. Recrea handle_new_strike con el guard de cuenta admin de la 110
--      (la cuenta role='admin' no acumula strikes ni se auto-banea) y con
--      una CORRECCIÓN sobre 010/110: el INSERT en discarded_records usa
--      deleted_by (la 047 renombró discarded_by -> deleted_by; el cuerpo
--      antiguo habría fallado al tercer strike con "column does not exist").
--   3. Restaura el rate-limit de reportes de la 010 (sección 8): máximo 5
--      reportes por usuario cada 24 h, endurecido con guard de auth.uid()
--      (un autenticado normal solo inserta en su propio nombre).
--   4. AUDITORÍA: una sola fuente de verdad: public.admin_actions (042),
--      que es donde escriben log_admin_action (045) y el trigger
--      _log_admin_change (042). admin_audit_log (010) NO se crea: el panel
--      (AuditLogPanel en dashboard.tsx) pasa a leer admin_actions en el
--      mismo commit que esta migración. En entornos donde admin_audit_log
--      exista (instalaciones fresh del repo) se deja intacta como tabla
--      legacy, sin lectores; no se borra por prudencia (puede tener datos).
--      Se elimina además la sobrecarga antigua de log_admin_action de la
--      010 (escribía en admin_audit_log) para que solo quede la de 045.
--   5. Engancha el trigger de auditoría trg_log_admin_change (042) a
--      user_reports: en prod la 042 no pudo adjuntarlo porque la tabla no
--      existía.
--   6. Añade user_reports y user_strikes a supabase_realtime (el panel se
--      suscribe a INSERT en user_reports para el contador de pendientes).
--
-- Requisitos: la 110 debe estar aplicada (usa public.is_staff()).
-- Idempotente: todo con IF NOT EXISTS / DROP IF EXISTS / guards
-- to_regclass; hay entornos donde estas tablas SÍ existen (BDs creadas
-- desde el repo completo) y re-ejecutar es seguro.
--
-- NOTICEs esperados al aplicar (ver también el bloque final):
--   · En PROD: "admin_actions ya existía...", posiblemente ninguno más.
--   · En entornos fresh del repo: "relation ... already exists, skipping"
--     (tablas/índices), "ya estaba en supabase_realtime" y el aviso de
--     admin_audit_log legacy.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Guards previos: dependencias que deben existir
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regproc('public.is_staff') IS NULL THEN
        RAISE EXCEPTION 'Falta public.is_staff()'
            USING HINT = 'Aplica antes la migración 110_analyst_role_admin_lockdown.sql';
    END IF;
    IF to_regproc('public.is_admin') IS NULL THEN
        RAISE EXCEPTION 'Falta public.is_admin()'
            USING HINT = 'Aplica antes la migración 040_rls_lockdown_profiles.sql';
    END IF;
    IF to_regclass('public.discarded_records') IS NULL THEN
        RAISE EXCEPTION 'Falta public.discarded_records (006): esta BD no se parece ni a prod ni al repo';
    END IF;
    IF to_regclass('public.admin_actions') IS NULL THEN
        RAISE NOTICE 'admin_actions no existia: se creara en la seccion 5';
    ELSE
        RAISE NOTICE 'admin_actions ya existia: la seccion 5 solo reafirma policies';
    END IF;
END $$;

-- Columnas de moderación en profiles (sección 1 de la 010). En prod existen
-- (el panel filtra por is_discarded), pero el guard es gratis.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS strikes_count INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_discarded BOOLEAN DEFAULT false;

-- Rename 047 idempotente: por si algún entorno conserva los nombres viejos
-- de discarded_records (el trigger de la sección 3 usa deleted_by).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'discarded_records'
                 AND column_name = 'discarded_by')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'discarded_records'
                 AND column_name = 'deleted_by') THEN
        ALTER TABLE public.discarded_records RENAME COLUMN discarded_by TO deleted_by;
        RAISE NOTICE 'discarded_records.discarded_by renombrada a deleted_by (047 no aplicada aqui)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'discarded_records'
                 AND column_name = 'discarded_at')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'discarded_records'
                 AND column_name = 'deleted_at') THEN
        ALTER TABLE public.discarded_records RENAME COLUMN discarded_at TO deleted_at;
        RAISE NOTICE 'discarded_records.discarded_at renombrada a deleted_at (047 no aplicada aqui)';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. user_reports (esquema de la 010, sección 2)
-- ---------------------------------------------------------------------
-- Los FK inline generan los nombres user_reports_reporter_id_fkey y
-- user_reports_reported_user_id_fkey, que el panel usa en los embeds de
-- PostgREST (profiles!user_reports_reporter_id_fkey). No cambiarlos.
CREATE TABLE IF NOT EXISTS public.user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    context TEXT NOT NULL CHECK (context IN ('profile', 'chat', 'comment', 'accommodation')),
    context_id UUID,
    reason TEXT NOT NULL CHECK (reason IN (
        'comportamiento_inapropiado', 'spam', 'acoso',
        'contenido_ofensivo', 'suplantacion', 'otro'
    )),
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
    admin_notes TEXT,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    CONSTRAINT no_self_report CHECK (reporter_id != reported_user_id),
    CONSTRAINT unique_report_context UNIQUE (reporter_id, reported_user_id, context, context_id)
);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON public.user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.user_reports(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reports_created ON public.user_reports(created_at DESC);

-- Policies de la 010 (DROP + CREATE para poder re-ejecutar)
DROP POLICY IF EXISTS "Users can create reports" ON public.user_reports;
CREATE POLICY "Users can create reports"
    ON public.user_reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can view own reports" ON public.user_reports;
CREATE POLICY "Users can view own reports"
    ON public.user_reports FOR SELECT
    USING (auth.uid() = reporter_id);

-- La 010 usaba un único FOR ALL ("Admins can manage reports"); se divide por
-- operación (checklist franky-rls-review). El DROP del nombre viejo limpia
-- los entornos donde la 010 sí se aplicó.
DROP POLICY IF EXISTS "Admins can manage reports" ON public.user_reports;
DROP POLICY IF EXISTS "Admins read reports" ON public.user_reports;
CREATE POLICY "Admins read reports"
    ON public.user_reports FOR SELECT
    USING (public.is_admin());
DROP POLICY IF EXISTS "Admins insert reports" ON public.user_reports;
CREATE POLICY "Admins insert reports"
    ON public.user_reports FOR INSERT
    WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins update reports" ON public.user_reports;
CREATE POLICY "Admins update reports"
    ON public.user_reports FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins delete reports" ON public.user_reports;
CREATE POLICY "Admins delete reports"
    ON public.user_reports FOR DELETE
    USING (public.is_admin());

-- Policy de staff de la 110 (el analista ve la cola de reportes, no escribe)
DROP POLICY IF EXISTS "Staff view reports" ON public.user_reports;
CREATE POLICY "Staff view reports"
    ON public.user_reports FOR SELECT
    TO authenticated
    USING (public.is_staff());

-- ---------------------------------------------------------------------
-- 2. user_strikes (esquema de la 010, sección 3)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_strikes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    report_id UUID REFERENCES public.user_reports(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_strikes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_strikes_user ON public.user_strikes(user_id);
CREATE INDEX IF NOT EXISTS idx_strikes_created ON public.user_strikes(created_at DESC);

DROP POLICY IF EXISTS "Users can view own strikes" ON public.user_strikes;
CREATE POLICY "Users can view own strikes"
    ON public.user_strikes FOR SELECT
    USING (auth.uid() = user_id);

-- FOR ALL de la 010 dividido por operación, igual que en user_reports.
DROP POLICY IF EXISTS "Admins can manage strikes" ON public.user_strikes;
DROP POLICY IF EXISTS "Admins read strikes" ON public.user_strikes;
CREATE POLICY "Admins read strikes"
    ON public.user_strikes FOR SELECT
    USING (public.is_admin());
DROP POLICY IF EXISTS "Admins insert strikes" ON public.user_strikes;
CREATE POLICY "Admins insert strikes"
    ON public.user_strikes FOR INSERT
    WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins update strikes" ON public.user_strikes;
CREATE POLICY "Admins update strikes"
    ON public.user_strikes FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins delete strikes" ON public.user_strikes;
CREATE POLICY "Admins delete strikes"
    ON public.user_strikes FOR DELETE
    USING (public.is_admin());

DROP POLICY IF EXISTS "Staff view strikes" ON public.user_strikes;
CREATE POLICY "Staff view strikes"
    ON public.user_strikes FOR SELECT
    TO authenticated
    USING (public.is_staff());

-- ---------------------------------------------------------------------
-- 3. Trigger handle_new_strike: cuerpo de la 110 (sección 3) + fix 047
-- ---------------------------------------------------------------------
-- SECURITY DEFINER porque actualiza profiles y escribe en discarded_records
-- saltando RLS; no necesita guard de auth.uid() propio: solo se dispara tras
-- un INSERT en user_strikes, que las policies de arriba limitan a admin.
-- Diferencias respecto a 010:
--   · Guard inicial de la 110: la cuenta admin no acumula strikes ni se
--     auto-banea (sin él, el trigger escudo protect_admin_account abortaría
--     toda la transacción del strike).
--   · deleted_by en vez de discarded_by (rename de la 047; el cuerpo de
--     010/110 habría fallado aquí al tercer strike).
--   · SET search_path fijado (patrón 044, no lo tenía la 010).
CREATE OR REPLACE FUNCTION public.handle_new_strike()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_strikes INTEGER;
    user_data JSONB;
BEGIN
    -- La cuenta admin no acumula strikes ni se auto-banea.
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND role = 'admin') THEN
        RETURN NEW;
    END IF;

    -- Count total strikes for this user
    SELECT COUNT(*) INTO current_strikes
    FROM public.user_strikes
    WHERE user_id = NEW.user_id;

    -- Update strikes_count on profile
    UPDATE public.profiles
    SET strikes_count = current_strikes,
        updated_at = NOW()
    WHERE id = NEW.user_id;

    -- Auto-discard at 3 strikes
    IF current_strikes >= 3 THEN
        SELECT to_jsonb(p.*) INTO user_data
        FROM public.profiles p
        WHERE p.id = NEW.user_id;

        INSERT INTO public.discarded_records (original_table, original_id, data, deleted_by, reason)
        VALUES ('profiles', NEW.user_id, user_data, NEW.issued_by, '3 strikes reached - auto discard');

        UPDATE public.profiles
        SET is_discarded = true,
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_strike_created ON public.user_strikes;
CREATE TRIGGER on_strike_created
    AFTER INSERT ON public.user_strikes
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_strike();

-- ---------------------------------------------------------------------
-- 4. Rate-limit de reportes (010, sección 8): máx. 5 por usuario / 24 h
-- ---------------------------------------------------------------------
-- DEFINER para poder contar reportes del usuario por encima de RLS.
-- Endurecido respecto a la 010 (revisión de seguridad 12-jun): el caller
-- autenticado normal solo puede insertar como él mismo (refuerza la policy
-- de INSERT aunque alguna vez se relaje) y no puede usar el contador como
-- oráculo de reportes ajenos. service_role / SQL Editor (auth.uid() NULL)
-- y la cuenta admin quedan exentos del límite, como ya lo estaban de RLS.
CREATE OR REPLACE FUNCTION public.check_report_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    report_count INTEGER;
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    IF auth.uid() <> NEW.reporter_id THEN
        RAISE EXCEPTION 'forbidden'
            USING HINT = 'Solo puedes crear reportes en tu propio nombre';
    END IF;

    SELECT COUNT(*) INTO report_count
    FROM public.user_reports
    WHERE reporter_id = NEW.reporter_id
      AND created_at > NOW() - INTERVAL '24 hours';

    IF report_count >= 5 THEN
        RAISE EXCEPTION 'Rate limit exceeded: maximum 5 reports per 24 hours';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_report_rate ON public.user_reports;
CREATE TRIGGER check_report_rate
    BEFORE INSERT ON public.user_reports
    FOR EACH ROW EXECUTE FUNCTION public.check_report_rate_limit();

-- ---------------------------------------------------------------------
-- 5. Auditoría: admin_actions como ÚNICA fuente de verdad
-- ---------------------------------------------------------------------
-- En prod ya existe (ahí escriben log_admin_action de 045 y el trigger
-- _log_admin_change de 042); el IF NOT EXISTS cubre entornos donde la 042
-- fallara a mitad. Esquema idéntico a la 042.
CREATE TABLE IF NOT EXISTS public.admin_actions (
    id              bigserial PRIMARY KEY,
    actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email     text,
    action          text NOT NULL,
    target_table    text NOT NULL,
    target_id       text,
    changes         jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON public.admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_actor   ON public.admin_actions (actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_table   ON public.admin_actions (target_table);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target  ON public.admin_actions (target_table, target_id);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Patrón D: solo lectura para admin/staff; nadie escribe por PostgREST
-- (sin policies de INSERT/UPDATE/DELETE: escriben solo funciones DEFINER).
DROP POLICY IF EXISTS "Admins read admin_actions" ON public.admin_actions;
CREATE POLICY "Admins read admin_actions"
    ON public.admin_actions FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Staff view admin actions" ON public.admin_actions;
CREATE POLICY "Staff view admin actions"
    ON public.admin_actions FOR SELECT
    TO authenticated
    USING (public.is_staff());

-- La sobrecarga de log_admin_action de la 010 escribía en admin_audit_log;
-- se retira donde exista para dejar solo la firma de la 045 (la que llama el
-- panel). Las llamadas posicionales de la 110 también resuelven a la de 045.
DROP FUNCTION IF EXISTS public.log_admin_action(text, text, uuid, jsonb, jsonb);

-- admin_audit_log NO se crea: queda retirada. El panel lee admin_actions
-- desde el mismo commit. Si existe (entornos fresh del repo), se deja como
-- legacy de solo lectura y se avisa.
DO $$
BEGIN
    IF to_regclass('public.admin_audit_log') IS NOT NULL THEN
        RAISE NOTICE 'admin_audit_log existe en este entorno: queda como tabla LEGACY sin lectores (el panel lee admin_actions). Valorar DROP manual cuando se confirme que no hay datos que conservar.';
    END IF;
END $$;

-- Trigger de auditoría automática de la 042 sobre user_reports (en prod no
-- pudo adjuntarse porque la tabla no existía).
DO $$
BEGIN
    IF to_regproc('public._log_admin_change') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_log_admin_change ON public.user_reports';
        EXECUTE 'CREATE TRIGGER trg_log_admin_change
                     AFTER INSERT OR UPDATE OR DELETE ON public.user_reports
                     FOR EACH ROW EXECUTE FUNCTION public._log_admin_change()';
    ELSE
        RAISE NOTICE '_log_admin_change (042) no existe: trigger de auditoria sobre user_reports omitido';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 6. Realtime: el panel se suscribe a INSERT en user_reports (contador
--    de pendientes); user_strikes va también por paridad con la 010.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_reports;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'user_reports ya estaba en supabase_realtime';
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_strikes;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'user_strikes ya estaba en supabase_realtime';
END $$;

COMMIT;

-- =====================================================================
-- VERIFICACIÓN (ejecutar manualmente tras aplicar)
-- =====================================================================
-- Estructura:
--   SELECT to_regclass('public.user_reports'), to_regclass('public.user_strikes');
--     -> ambas NOT NULL
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE tablename IN ('user_reports','user_strikes','admin_actions');
--     -> rowsecurity = true en las tres
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.user_reports'::regclass;
--     -> 7 policies (create own, view own, staff view y 4 de admin por operación)
--
-- Comportamiento (como admin, desde el panel o SQL):
--   · Tab Reportes de /admin carga sin error (lista vacía al principio).
--   · Dar un strike funciona y aparece en el Registro de Auditoría
--     (fila 'issue_strike' en admin_actions vía log_admin_action).
--   · 3 strikes a un usuario de prueba -> profiles.is_discarded = true y
--     fila en discarded_records con deleted_by = admin.
--   · Strike a la cuenta admin -> se inserta pero NO suma strikes_count
--     ni banea (guard de la 110).
--   · 6º reporte del mismo usuario en 24 h -> EXCEPTION rate limit.
--
-- Como analista:
--   SELECT COUNT(*) FROM public.user_reports;   -> lee (Staff view reports)
--   INSERT/UPDATE sobre user_reports/user_strikes -> denegado
--
-- NOTICEs esperados al aplicar en PROD (ninguno es un error):
--   · "admin_actions ya existia: la seccion 5 solo reafirma policies"
--   · NOTICEs de "... already exists, skipping" solo si se re-ejecuta.
-- En entornos creados desde el repo completo, además:
--   · "relation ... already exists, skipping" (tablas e índices de 010/042)
--   · "admin_audit_log existe en este entorno: queda como tabla LEGACY..."
--   · "user_reports/user_strikes ya estaba en supabase_realtime"
-- =====================================================================
