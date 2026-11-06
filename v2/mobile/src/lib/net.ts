// Bus de conectividad global. No usamos un módulo nativo (netinfo) porque en
// Expo Go no funcionaría sin dev build: derivamos el estado de la propia capa
// de red. Cuando una petición va bien declaramos "online"; cuando falla,
// confirmamos con un ping muy ligero antes de declarar "sin conexión", para no
// dar falsos avisos ante un simple error puntual del servidor.
import { SUPABASE_HEALTH_URL } from './supabase';

type Listener = (online: boolean) => void;

let online = true;
let pinging = false;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(online);
}

export function isOnline(): boolean {
  return online;
}

// Suscripción al estado de red. Llama al callback de inmediato con el estado
// actual y devuelve la función para desuscribirse.
export function subscribeNet(cb: Listener): () => void {
  listeners.add(cb);
  cb(online);
  return () => { listeners.delete(cb); };
}

// Una petición fue bien: estamos online sin lugar a dudas.
export function reportOnline(): void {
  if (!online) { online = true; emit(); }
}

// Una petición falló: puede ser el servidor o falta de red. Confirmamos con un
// ping corto antes de marcar "sin conexión". Si el ping también falla, avisamos.
export async function reportMaybeOffline(): Promise<void> {
  if (pinging) return;
  pinging = true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    try {
      await fetch(SUPABASE_HEALTH_URL, { method: 'GET', signal: ctrl.signal });
      reportOnline();
    } finally {
      clearTimeout(t);
    }
  } catch {
    if (online) { online = false; emit(); }
  } finally {
    pinging = false;
  }
}
