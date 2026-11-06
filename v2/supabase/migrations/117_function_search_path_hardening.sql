-- =====================================================================
-- 117: search_path fijo en todas las funciones SECURITY DEFINER de public
--
-- Origen: M-BD-012 / M-SEC (docs/mejoras/09-datos-supabase.md y 01-seguridad).
-- Las funciones SECURITY DEFINER antiguas (handle_new_profile,
-- get_or_create_conversation, create_group_chat, etc., creadas en 001 a 100)
-- no fijan search_path. Eso es la vulnerabilidad "function search_path mutable":
-- un atacante con permiso para crear objetos en un esquema que este antes en el
-- search_path del invocador podria secuestrar una llamada no cualificada dentro
-- de una funcion que corre con privilegios del dueno.
--
-- Solucion robusta y de bajo riesgo: en vez de reescribir el cuerpo de cada
-- funcion (CREATE OR REPLACE, propenso a errores), se hace ALTER FUNCTION para
-- FIJAR el search_path. Un bloque dinamico recorre TODAS las funciones
-- SECURITY DEFINER de public que aun no tienen search_path fijo y se lo pone.
-- Asi cubre exactamente las que falten en prod (resiliente a la divergencia) y
-- no toca las que ya lo traen (108, 109, 110, 111, 113, 115, etc.).
--
-- Se usa 'public, extensions, pg_temp' (no solo 'public, pg_temp') para no
-- romper funciones que llamen a funciones de extensiones (pg_trgm, pgcrypto,
-- etc.) sin cualificar el esquema: Supabase instala las extensiones en el
-- esquema 'extensions'. Incluir ese esquema no reabre la vulnerabilidad: el
-- punto es que el search_path quede FIJO y no manipulable por el invocador.
-- pg_temp va al final a proposito (nunca antes que los esquemas reales).
--
-- Idempotente: re-ejecutarlo no hace nada sobre las ya endurecidas.
-- =====================================================================

DO $$
DECLARE
  r RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) AS c
          WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '117: search_path fijado en % funciones SECURITY DEFINER que no lo tenian.', v_count;
END;
$$;
