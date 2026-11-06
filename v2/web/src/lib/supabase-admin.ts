import { createClient } from "@supabase/supabase-js";
import { clientEnv, getServerEnv } from "./env";

export function createAdminSupabase() {
  const serverEnv = getServerEnv();
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    // Fallamos en el origen (no creamos un cliente con undefined): asi el error
    // apunta a la causa real (falta la service role key) y no a un punto lejano.
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY no esta configurada: el cliente admin de Supabase requiere la service role key"
    );
  }
  return createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY
  );
}
