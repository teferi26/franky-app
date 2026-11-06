// Ubicación rápida para el mapa de eventos.
//
// Antes el mapa arrancaba con toda España y solo se movía después de CUATRO
// viajes seguidos a la red (sesión en el servidor de auth, perfil,
// universidad y zonas de esa ciudad); a "donde estás" solo iba si tocabas el
// botón, y además esperando un GPS nuevo. Ahora:
//   1. la última posición conocida del sistema (instantánea) centra ya;
//   2. un fix Balanced con tope de tiempo la afina por detrás;
//   3. el permiso se pide sin bloquear el pintado del mapa;
//   4. la ciudad del perfil se lee con la sesión local y queda en memoria.
import * as Location from 'expo-location';
import { supabase } from './supabase';
import { getCachedSession } from './session';

export type Coords = { latitude: number; longitude: number };

/** Permiso concedido; si `ask` y nunca se ha preguntado, lo pide (no bloquea a nadie). */
export async function ensureLocationPermission(ask: boolean): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return true;
    if (!ask) return false;
    // Solo la primera vez de forma automática; si ya dijo que no, el botón
    // "centrar en mí" es quien vuelve a preguntar.
    if (current.status !== 'undetermined' || current.canAskAgain === false) return false;
    const asked = await Location.requestForegroundPermissionsAsync();
    return asked.status === 'granted';
  } catch {
    return false;
  }
}

/** Pide permiso siempre que se pueda (acción explícita del usuario). */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return true;
    const asked = await Location.requestForegroundPermissionsAsync();
    return asked.status === 'granted';
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

let lastFix: { coords: Coords; at: number } | null = null;

/**
 * Llama a `onFix` en cuanto hay algo: primero la última posición conocida (o
 * la de esta sesión) y después la posición actual con precisión media. El
 * segundo aviso solo llega si el primero no existía o se ha movido.
 */
export async function locateFast(
  onFix: (coords: Coords, precise: boolean) => void,
  timeoutMs = 8000,
): Promise<void> {
  const last: { sent: Coords | null } = { sent: null };
  const send = (c: Coords, precise: boolean) => { last.sent = c; onFix(c, precise); };
  if (lastFix && Date.now() - lastFix.at < 10 * 60 * 1000) send(lastFix.coords, false);
  else {
    const known = await withTimeout(
      Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000, requiredAccuracy: 3000 }),
      1500,
    );
    if (known) send({ latitude: known.coords.latitude, longitude: known.coords.longitude }, false);
  }
  const fresh = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    timeoutMs,
  );
  if (!fresh) return;
  const c = { latitude: fresh.coords.latitude, longitude: fresh.coords.longitude };
  lastFix = { coords: c, at: Date.now() };
  const prev = last.sent;
  // Menos de ~150 m de diferencia: no merece la pena mover el mapa otra vez.
  if (prev && Math.abs(prev.latitude - c.latitude) < 0.0015 && Math.abs(prev.longitude - c.longitude) < 0.0015) return;
  send(c, true);
}

// Ciudad de la universidad (o del perfil) para el encuadre por defecto.
let myCity: { uid: string; city: string | null } | null = null;

export function cachedMyMapCity(): string | null {
  return myCity?.city ?? null;
}

export async function getMyMapCity(): Promise<string | null> {
  try {
    const session = await getCachedSession();
    const uid = session?.user?.id;
    if (!uid) return null;
    if (myCity?.uid === uid) return myCity.city;
    const { data: prof } = await supabase
      .from('profiles').select('university_id, city').eq('id', uid).maybeSingle();
    let city: string | null = null;
    if (prof?.university_id) {
      const { data: uni } = await supabase
        .from('universities').select('city').eq('id', prof.university_id).maybeSingle();
      city = (uni?.city as string | null) ?? null;
    }
    if (!city && prof?.city) city = prof.city as string;
    myCity = { uid, city };
    return city;
  } catch {
    return null;
  }
}
