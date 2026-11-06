-- =====================================================
-- Migration 109: anonimato real de Crush, política qr_scans,
--                índices que faltaban y blindaje del bucket de apuntes
-- =====================================================
-- Origen: auditoría masiva del 11-jun-2026 (docs/mejoras/01-seguridad.md y
-- 09-datos-supabase.md). Todo son quick wins sin cambio de comportamiento
-- para los clientes (web y móvil acceden a estas tablas solo vía RPCs
-- SECURITY DEFINER, verificado por grep el 11-jun-2026).

-- ─────────────────────────────────────────────────────
-- 1. El nominado NO debe poder leer quién le invitó a Crush.
--    La promesa del producto es "nominación anónima"; con la política de 084
--    bastaba un SELECT desde la consola del navegador para desvelarla.
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ligar_nominations_select_own" ON public.ligar_nominations;
CREATE POLICY "ligar_nominations_select_own"
    ON public.ligar_nominations FOR SELECT TO authenticated
    USING (nominator_id = auth.uid());

-- ─────────────────────────────────────────────────────
-- 2. El objetivo NO debe poder leer quién pidió su Instagram antes de
--    corresponder (misma promesa de anonimato; las RPCs de 083 revelan el
--    handle solo cuando hay match mutuo).
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ig_requests_select_own" ON public.ig_requests;
CREATE POLICY "ig_requests_select_own"
    ON public.ig_requests FOR SELECT TO authenticated
    USING (requester_id = auth.uid());

-- ─────────────────────────────────────────────────────
-- 3. qr_scans: unificar al patrón idiomático TO authenticated
--    (mismas semánticas que la política antigua basada en auth.role()).
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Scans viewable by authenticated" ON public.qr_scans;
DROP POLICY IF EXISTS "qr_scans_select_authenticated" ON public.qr_scans;
CREATE POLICY "qr_scans_select_authenticated"
    ON public.qr_scans FOR SELECT TO authenticated
    USING (true);

-- ─────────────────────────────────────────────────────
-- 4. Índices que faltaban para queries reales de la web
-- ─────────────────────────────────────────────────────
-- Conciliación de pagos de entradas (webhook busca por order_id)
CREATE INDEX IF NOT EXISTS idx_event_tickets_order
    ON public.event_tickets(order_id) WHERE order_id IS NOT NULL;

-- Búsqueda por texto en eventos y becas (pg_trgm ya está en 001)
CREATE INDEX IF NOT EXISTS idx_events_title_trgm
    ON public.events USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_scholarships_name_trgm
    ON public.scholarships USING gin(name gin_trgm_ops);

-- Listado público de alojamiento: activos y pagados por fecha
CREATE INDEX IF NOT EXISTS idx_accommodations_active_paid_created
    ON public.accommodations(created_at DESC)
    WHERE status = 'active' AND is_paid = true;

-- ─────────────────────────────────────────────────────
-- 5. Bucket de apuntes: tipos permitidos y tamaño máximo
--    (el bucket es público de lectura: sin esta lista alguien podría alojar
--    HTML/SVG/ejecutables servidos desde el dominio de Supabase).
--    Si la 107 aún no se ha aplicado, este UPDATE no afecta a ninguna fila.
-- ─────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'application/pdf',
         'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
       ],
       file_size_limit = 26214400  -- 25 MB, alineado con el límite del cliente móvil
 WHERE id = 'notes';
