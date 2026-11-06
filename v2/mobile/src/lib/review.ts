// ─── Petición de reseña in-app (App Store / Play) ────────────────────────
// Regla de oro de las stores: pedir la reseña SOLO tras una acción positiva
// (un match, la primera respuesta en un chat…), nunca al arrancar. Además el
// SO limita cuántas veces se puede mostrar; aquí ponemos nuestro propio tope
// (una vez por versión, y como mucho tras 2 momentos buenos) para no molestar.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';

const COUNT_KEY = 'franky_review_good_moments';
const ASKED_KEY = 'franky_review_asked_version';
const APP_VERSION = Constants.expoConfig?.version ?? '0';

/**
 * Registra un "buen momento" y, a partir del segundo, pide la reseña una vez
 * por versión de la app. Best-effort: si el SO no permite mostrarla, no pasa
 * nada. Llamar tras acciones positivas (match, primera respuesta, etc.).
 */
export async function maybeAskForReview(): Promise<void> {
  try {
    const askedVersion = await AsyncStorage.getItem(ASKED_KEY);
    if (askedVersion === APP_VERSION) return; // ya se pidió en esta versión

    const n = Number(await AsyncStorage.getItem(COUNT_KEY)) + 1;
    await AsyncStorage.setItem(COUNT_KEY, String(n));
    if (n < 2) return; // esperamos al segundo buen momento

    if (await StoreReview.hasAction()) {
      await AsyncStorage.setItem(ASKED_KEY, APP_VERSION);
      await StoreReview.requestReview();
    }
  } catch {
    /* best-effort: la reseña jamás rompe nada */
  }
}
