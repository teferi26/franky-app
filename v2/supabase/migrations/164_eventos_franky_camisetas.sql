-- =====================================================
-- 164: eventos oficiales de Franky + encuesta de talla de camiseta
-- =====================================================
--
-- QUÉ SE AÑADE
--
--   1. events.is_official — "Evento Franky". Se pone SOLO porque lo organiza
--      alguien del equipo (rol 'analyst' o 'admin'), nunca porque el cliente lo
--      pida.
--   2. events.shirts_enabled — el organizador marca si en su evento se reparten
--      camisetas.
--   3. event_shirt_sizes — la talla que elige cada participante cuando el evento
--      reparte camiseta, para que el organizador sepa cuántas llevar de cada
--      una y con qué nombre.
--
-- POR QUÉ is_official LO DECIDE UN TRIGGER Y NO EL CLIENTE
--
-- Los eventos se crean con un INSERT directo desde el navegador (política
-- "Authenticated users can create events" de 001_schema.sql, que solo comprueba
-- auth.uid() = organizer_id) y el organizador puede hacer UPDATE de su propia
-- fila sin restricción de columnas. Si el distintivo fuera un campo más del
-- formulario, cualquiera podría hacer
--
--     POST /rest/v1/events   { ..., "is_official": true }
--
-- con la clave anónima y colgarse la marca de Franky en su fiesta. Mismo patrón
-- que el guard de is_paid de la 151: el trigger FUERZA el valor derivado del rol
-- del organizador en cada INSERT y en cada UPDATE, así que no hay peticion a
-- mano que lo consiga.
--
-- service_role queda fuera del guard a propósito: un script de la plataforma
-- tiene que poder marcar como oficial un evento que organizamos con un partner
-- aunque la cuenta que lo publica no sea del equipo.
--
-- POR QUÉ LAS TALLAS VAN EN SU PROPIA TABLA
--
-- Un evento gratuito lleva a sus asistentes en event_participants y uno de pago
-- en event_tickets. Guardar la talla en una tabla aparte, indexada por
-- (event_id, user_id), sirve a los dos caminos sin duplicar la pregunta ni
-- tocar reserve_event_ticket. El recuento que ve el organizador se cruza SIEMPRE
-- con la lista real de asistentes: quien eligió talla y luego no se apuntó (o
-- canceló) no cuenta.
--
-- Idempotente: se puede ejecutar desde el editor SQL de Supabase sin miedo.
-- =====================================================

-- ---------------------------------------------------------------
-- 1. Columnas nuevas de events
-- ---------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_official    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shirts_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.is_official IS
  'Evento organizado por el equipo de Franky (organizador con rol analyst o '
  'admin). Lo fija el trigger trg_events_official_flag: el cliente no puede '
  'ponerlo. Un evento sigue siendo oficial si su organizador deja el equipo '
  'después: lo era cuando se publicó.';

COMMENT ON COLUMN public.events.shirts_enabled IS
  'El organizador reparte camisetas en el evento: a quien se apunta se le '
  'pregunta la talla (event_shirt_sizes).';

-- Índice parcial para poder listar "solo eventos de Franky" por fecha sin
-- escanear la tabla entera cuando haya muchos eventos de usuarios.
CREATE INDEX IF NOT EXISTS idx_events_oficiales
  ON public.events(start_date) WHERE is_official;

-- ---------------------------------------------------------------
-- 2. Guard del distintivo oficial
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_event_official_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role text := COALESCE(
        NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
    v_role text;
BEGIN
    -- Scripts de la plataforma y webhooks (service_role): pasan tal cual.
    IF v_jwt_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Cualquier otro camino (navegador, app, o el editor SQL sin claims) deriva
    -- el distintivo del rol del organizador. SECURITY DEFINER porque profiles
    -- no es legible en bloque para el que escribe.
    SELECT p.role INTO v_role
      FROM public.profiles p
     WHERE p.id = NEW.organizer_id;

    NEW.is_official := COALESCE(v_role IN ('analyst', 'admin'), false);
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_event_official_flag() IS
  'Fuerza events.is_official a partir del rol del organizador (analyst/admin). '
  'Sin esto, cualquiera podría marcar su evento como oficial de Franky con una '
  'petición a mano contra PostgREST.';

DROP TRIGGER IF EXISTS trg_events_official_flag ON public.events;
CREATE TRIGGER trg_events_official_flag
    BEFORE INSERT OR UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.enforce_event_official_flag();

-- Eventos ya publicados por el equipo: quedan marcados de una pasada. El
-- trigger recalcula lo mismo al ejecutarse este UPDATE, así que es consistente.
UPDATE public.events e
   SET is_official = true
  FROM public.profiles p
 WHERE p.id = e.organizer_id
   AND p.role IN ('analyst', 'admin')
   AND e.is_official IS DISTINCT FROM true;

-- ---------------------------------------------------------------
-- 3. Tallas de camiseta por participante
-- ---------------------------------------------------------------
-- 'ninguna' es una respuesta de primera clase: hay que poder apuntarse sin
-- querer camiseta sin falsear una talla ni dejar el recuento a medias.
CREATE TABLE IF NOT EXISTS public.event_shirt_sizes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id   UUID NOT NULL REFERENCES public.events(id)   ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    size       TEXT NOT NULL CHECK (size IN ('XS', 'S', 'M', 'L', 'XL', 'XXL', 'ninguna')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_shirt_sizes_event ON public.event_shirt_sizes(event_id);

COMMENT ON TABLE public.event_shirt_sizes IS
  'Talla de camiseta elegida por cada participante de un evento que reparte '
  'camisetas. Vale para eventos gratuitos (event_participants) y de pago '
  '(event_tickets): el organizador cruza estas filas con su lista real.';

ALTER TABLE public.event_shirt_sizes ENABLE ROW LEVEL SECURITY;

-- Cada uno ve su propia respuesta.
DROP POLICY IF EXISTS "event_shirt_sizes_select_self" ON public.event_shirt_sizes;
CREATE POLICY "event_shirt_sizes_select_self"
    ON public.event_shirt_sizes FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Y solo puede responder por sí mismo, en un evento que reparta camisetas de
-- verdad (si el organizador desactiva el reparto, deja de admitir respuestas).
DROP POLICY IF EXISTS "event_shirt_sizes_insert_self" ON public.event_shirt_sizes;
CREATE POLICY "event_shirt_sizes_insert_self"
    ON public.event_shirt_sizes FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.events e
             WHERE e.id = event_shirt_sizes.event_id
               AND e.shirts_enabled
        )
    );

-- Cambiar de talla mientras el evento siga repartiendo camisetas.
DROP POLICY IF EXISTS "event_shirt_sizes_update_self" ON public.event_shirt_sizes;
CREATE POLICY "event_shirt_sizes_update_self"
    ON public.event_shirt_sizes FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.events e
             WHERE e.id = event_shirt_sizes.event_id
               AND e.shirts_enabled
        )
    );

-- El organizador ve las tallas de SU evento (es para lo que se preguntan).
DROP POLICY IF EXISTS "event_shirt_sizes_select_organizer" ON public.event_shirt_sizes;
CREATE POLICY "event_shirt_sizes_select_organizer"
    ON public.event_shirt_sizes FOR SELECT TO authenticated
    USING (event_id IN (SELECT id FROM public.events WHERE organizer_id = auth.uid()));

DROP POLICY IF EXISTS "event_shirt_sizes_select_admin" ON public.event_shirt_sizes;
CREATE POLICY "event_shirt_sizes_select_admin"
    ON public.event_shirt_sizes FOR SELECT TO authenticated
    USING (public.is_admin());

-- updated_at al día (la talla se cambia tantas veces como haga falta).
CREATE OR REPLACE FUNCTION public.touch_event_shirt_sizes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_shirt_sizes_updated_at ON public.event_shirt_sizes;
CREATE TRIGGER trg_event_shirt_sizes_updated_at
    BEFORE UPDATE ON public.event_shirt_sizes
    FOR EACH ROW EXECUTE FUNCTION public.touch_event_shirt_sizes_updated_at();

-- ---------------------------------------------------------------
-- 4. Comprobación rápida tras aplicar
-- ---------------------------------------------------------------
--   -- ¿Quedan marcados los eventos del equipo?
--   SELECT e.title, e.is_official, p.role
--     FROM public.events e JOIN public.profiles p ON p.id = e.organizer_id
--    WHERE p.role IN ('analyst', 'admin')
--    ORDER BY e.start_date DESC LIMIT 10;
--
--   -- ¿El guard aguanta un intento a mano? (desde el editor SQL, como usuario
--   -- normal, is_official debe volver a false)
--   -- UPDATE public.events SET is_official = true WHERE id = '<evento-de-un-user>';
