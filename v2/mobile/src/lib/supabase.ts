import { createClient, processLock } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createSessionCache } from './session-cache';
import { coordinateAuth, withHandledLockErrors } from './auth-coordinator';

// Mismo backend que la web Franky. Se leen de EXPO_PUBLIC_* (ver .env.example):
// la clave anónima es pública por diseño, pero no se versiona en el código.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (copia .env.example a .env.local).');
}

// Se exportan para las subidas grandes (vídeo), que no pasan por el SDK: el
// SDK necesita el fichero entero en memoria y un vídeo largo tumbaría la app.
// Ver uploadLargeFile en src/lib/media.ts.
export { SUPABASE_URL, SUPABASE_ANON_KEY };

// ─── fetch con tiempo límite ─────────────────────────────────────────────
// Ninguna petición puede quedarse colgada para siempre. Con una conexión que
// se cae a medias (túnel, ascensor, wifi de la uni saturada) el fetch nativo
// no responde nunca: la promesa ni resuelve ni rechaza, y la pantalla se queda
// en el esqueleto o con el botón girando sin salida posible.
//
// 15 s para lo normal (RPC, selects, auth). Las subidas a Storage van con 90 s:
// una foto de 5 MB con datos móviles flojos tarda más de 15 s y abortarla
// sería peor que esperar. Si quien llama trae su propio `signal`, se respeta:
// abortar el suyo aborta también el nuestro.
export const FETCH_TIMEOUT_MS = 15_000;
export const UPLOAD_TIMEOUT_MS = 90_000;

type FetchInput = Parameters<typeof fetch>[0];

function urlDe(input: FetchInput): string {
  if (typeof input === 'string') return input;
  return (input as { url?: string }).url ?? String(input);
}

export function fetchConTimeout(
  input: FetchInput,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const esSubida = /\/storage\/v1\/object\//.test(urlDe(input))
    && (init.method ?? 'GET').toUpperCase() !== 'GET';
  const ms = timeoutMs ?? (esSubida ? UPLOAD_TIMEOUT_MS : FETCH_TIMEOUT_MS);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const externo = init.signal;
  if (externo) {
    if (externo.aborted) ctrl.abort();
    else externo.addEventListener('abort', () => ctrl.abort());
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// Preserve supabase-js's existing default key; do not invalidate installed sessions.
const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const AUTH_LOCK_TIMEOUT_MS = 20_000;
const authLock = withHandledLockErrors(processLock);
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // Todo lo que hace el SDK (auth, PostgREST, Storage) pasa por este fetch con
  // tope de tiempo. Realtime va por websocket y no se ve afectado.
  global: { fetch: fetchConTimeout },
  auth: {
    storage: AsyncStorage,
    storageKey: AUTH_STORAGE_KEY,
    lock: authLock,
    lockAcquireTimeout: AUTH_LOCK_TIMEOUT_MS,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE explícito (M4): el default de supabase-js v2 es 'implicit'. Con
    // PKCE el OAuth de Google vuelve con ?code=... y welcome.tsx lo canjea
    // con exchangeCodeForSession; la rama de #access_token queda de fallback.
    flowType: 'pkce',
  },
});

// One cache/identity source for the coordinator and every consumer. Creating it
// here avoids a circular import between session.ts and the shared client.
export const sessionCache = createSessionCache(supabase.auth);
export const { beginAttempt: beginAuthAttempt, captureOwnedSignOut } = coordinateAuth(supabase.auth, sessionCache, AUTH_STORAGE_KEY, authLock, AUTH_LOCK_TIMEOUT_MS);

// En React Native autoRefreshToken no corre en background: la guia oficial de
// Supabase pide arrancar y parar el refresco con AppState para que, al volver a
// foreground, el access token se renueve y las RPC con auth (FOMO, Crush,
// compras) no fallen por token caducado. (M-MOV-021 / M-PAR-040)
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

export const WEB_URL = 'https://franky.es';

// Endpoint de salud del backend, usado por el detector de conexión (net.ts)
// para confirmar si de verdad estamos sin red antes de avisar al usuario.
export const SUPABASE_HEALTH_URL = `${SUPABASE_URL}/auth/v1/health`;
