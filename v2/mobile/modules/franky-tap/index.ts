// ─── Franky Tap: acercar los móviles ────────────────────────────────────────
// Interfaz única para la pantalla. Por debajo hay dos implementaciones (banda
// ultraancha en iPhone, Bluetooth en el resto) y un sustituto para web que
// siempre dice que no está disponible.
//
// Si el módulo nativo no está presente (por ejemplo en Expo Go, que no puede
// cargar código nativo propio), `isAvailable` devuelve `unavailable` en lugar
// de reventar. La pantalla ofrece entonces el código escaneado.
import FrankyTapModule from './src/FrankyTapModule';
import type {
  FrankyTapEvents, TapCapability, TapDetected, TapError, TapSighting, TapUnavailableReason,
} from './src/FrankyTap.types';

export type { TapCapability, TapDetected, TapError, TapSighting, TapUnavailableReason, FrankyTapEvents };

const NO_DISPONIBLE: TapCapability = { available: false, precise: false, reason: 'unavailable' };

/** Qué puede hacer este teléfono. Nunca lanza: ante la duda, no disponible. */
export async function isAvailable(): Promise<TapCapability> {
  try {
    return await FrankyTapModule?.isAvailable() ?? NO_DISPONIBLE;
  } catch {
    return NO_DISPONIBLE;
  }
}

/** Pide los permisos que falten. Nunca lanza. */
export async function requestPermissions(): Promise<TapCapability> {
  try {
    return await FrankyTapModule?.requestPermissions() ?? NO_DISPONIBLE;
  } catch {
    return NO_DISPONIBLE;
  }
}

/** Empieza a anunciarse con el testigo del servidor y a buscar a otros. */
let radioQueue: Promise<unknown> = Promise.resolve();
let requestedGeneration = 0;
export function start(token: string): Promise<boolean> {
  const version = ++requestedGeneration;
  const result = radioQueue.then(async () => {
    if (!FrankyTapModule || version !== requestedGeneration) return false;
    try { await FrankyTapModule.start(token); return version === requestedGeneration; }
    catch { return false; }
  });
  radioQueue = result.catch(() => {});
  return result;
}

export function stop(): Promise<void> {
  requestedGeneration++;
  const result = radioQueue.then(async () => { try { await FrankyTapModule?.stop(); } catch { /* already stopped */ } });
  radioQueue = result.catch(() => {});
  return result;
}

/** Alguien cerca, todavía sin confirmar el gesto. Para la pista de "un poco más". */
export function addSightingListener(listener: (s: TapSighting) => void) {
  return FrankyTapModule?.addListener('onSighting', listener) ?? { remove() {} };
}

/** Proximidad detectada: la pantalla debe pedir consentimiento explícito antes de registrar interés. */
export function addTapListener(listener: (t: TapDetected) => void) {
  return FrankyTapModule?.addListener('onTap', listener) ?? { remove() {} };
}

export function addErrorListener(listener: (e: TapError) => void) {
  return FrankyTapModule?.addListener('onError', listener) ?? { remove() {} };
}
