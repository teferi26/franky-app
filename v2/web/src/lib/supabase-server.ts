import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { clientEnv } from "@/lib/env";
import { getRequestBearer } from "@/lib/request-auth";

/**
 * Cliente Supabase para API routes consumidas también por la app móvil.
 * La app no tiene cookies de Next: manda `Authorization: Bearer <access_token>`.
 * Si el header está presente se usa ese token (RLS del usuario incluida);
 * si no, cae al flujo de cookies de siempre (web). No cambia nada para la web.
 */
export async function createRequestSupabase(req: { headers: Headers }) {
  const token = getRequestBearer(req);
  if (token !== null) {
    return createClient(
      clientEnv.NEXT_PUBLIC_SUPABASE_URL,
      clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }
    );
  }
  return createServerSupabase();
}

/**
 * Cliente Supabase sin cookies, solo lectura pública (anon key).
 * Para queries de catálogo (universidades, carreras, notas de corte): al no
 * tocar cookies(), no fuerza renderizado dinámico y permite SSG/ISR real.
 * No usar para datos que dependan del usuario autenticado.
 */
export function createPublicSupabase() {
  return createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  );
}

/**
 * `auth.getUser()` deduplicado por petición.
 *
 * Rendimiento (sep-2026): el layout raíz ya resuelve la sesión para pintar la
 * navegación, y acto seguido casi todas las páginas con sesión (home social,
 * eventos, FOMO, agenda, perfil, dashboards...) vuelven a llamar a
 * `supabase.auth.getUser()`. Cada llamada es un viaje de red al servidor de
 * Auth de Supabase (valida el JWT contra el servidor, no en local), del orden
 * de 50 a 150 ms en Vercel. Con este memo, la segunda llamada dentro de la
 * misma petición devuelve la misma promesa: una ida y vuelta menos por página
 * con sesión, sin tocar ninguna página.
 *
 * El memo se vacía en cuanto el cliente escribe cookies (refresco de token,
 * intercambio de código en /auth/callback, cierre de sesión): en ese momento
 * la sesión ha cambiado de verdad y la siguiente llamada vuelve a preguntar.
 * Solo se memoiza la llamada SIN argumentos (la de la cookie); `getUser(jwt)`
 * con un token explícito sigue yendo siempre al servidor.
 */
function withRequestMemoizedGetUser<T extends SupabaseClient>(
  client: T,
  memo: { promise: ReturnType<T["auth"]["getUser"]> | null }
): T {
  const original = client.auth.getUser.bind(client.auth);
  client.auth.getUser = ((jwt?: string) => {
    if (jwt !== undefined) return original(jwt);
    if (!memo.promise) {
      memo.promise = original() as ReturnType<T["auth"]["getUser"]>;
    }
    return memo.promise;
  }) as T["auth"]["getUser"];
  return client;
}

async function buildServerSupabase() {
  const cookieStore = await cookies();
  const memo: { promise: ReturnType<SupabaseClient["auth"]["getUser"]> | null } = {
    promise: null,
  };
  const client = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // La sesión acaba de cambiar (refresco, login, logout): el usuario
          // memoizado ya no vale.
          memo.promise = null;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — ignore
          }
        },
      },
    }
  );
  return withRequestMemoizedGetUser(client, memo);
}

/**
 * Cliente Supabase con la sesión de las cookies.
 *
 * Envuelto en `cache()` de React: dentro de una misma petición (layout, página
 * y componentes de servidor anidados) se devuelve la MISMA instancia, así que
 * el memo de `getUser()` de arriba se comparte entre todos ellos. Fuera de un
 * render (route handlers, server actions) `cache()` se comporta como una
 * llamada normal y cada handler recibe su propio cliente, como hasta ahora.
 */
export const createServerSupabase = cache(buildServerSupabase);
