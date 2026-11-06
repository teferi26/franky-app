import { Platform } from "react-native";
import { supabase, WEB_URL } from "@/lib/supabase";
import { PRO_IAP_TIERS, PRO_PRODUCT_IDS, type ProIapTier } from "../../../../shared/pro/iap";
import type { ExpoIapModule, IapPurchase } from "./expo-iap";
import { parseProAccess, purchaseErrorKind, verifyErrorMessage, type ProAccess } from "./logic";
import { setCachedProAccess } from "./access";

/**
 * Compras de Franky Pro con Apple (StoreKit 2 a través de expo-iap).
 *
 * Todo el acceso a expo-iap pasa por aquí. El módulo nativo no existe en
 * Expo Go, en web ni en Android (no se vende allí), así que se carga con
 * require dentro de try/catch: si falla, la tienda está "no disponible" y la
 * app sigue funcionando sin botón de pago.
 *
 * Flujo de compra: requestPurchase con appAccountToken = id del usuario de
 * Supabase; la transacción firmada (JWS) se manda a /api/apple/pro/verify,
 * que la comprueba con Apple y devuelve el mismo objeto que
 * get_my_pro_access. Solo entonces se cierra la transacción: si el servidor
 * falla, StoreKit la vuelve a entregar y "Restaurar compras" la reintenta.
 */

const VERIFY_URL = `${WEB_URL}/api/apple/pro/verify`;

let loaded: ExpoIapModule | null | undefined;
let connection: Promise<boolean> | null = null;
const prices = new Map<string, string>();

function loadIap(): ExpoIapModule | null {
  if (loaded !== undefined) return loaded;
  if (Platform.OS !== "ios") return (loaded = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-iap") as Partial<ExpoIapModule> | undefined;
    loaded = mod && typeof mod.initConnection === "function" && typeof mod.requestPurchase === "function" ? (mod as ExpoIapModule) : null;
  } catch {
    // Expo Go o build sin el módulo nativo.
    loaded = null;
  }
  return loaded;
}

async function connect(): Promise<ExpoIapModule | null> {
  const iap = loadIap();
  if (!iap) return null;
  connection ??= iap.initConnection().catch(() => false);
  const ok = await connection;
  if (!ok) {
    // Se reintenta en la próxima llamada (p. ej. sin red al abrir).
    connection = null;
    return null;
  }
  return iap;
}

/** ¿Se puede pagar aquí? Solo iPhone con StoreKit disponible. */
export async function storeAvailable(): Promise<boolean> {
  return (await connect()) !== null;
}

/** Precio del nivel tal y como lo formatea la App Store. Nunca inventado. */
export async function fetchTierPrice(tier: ProIapTier): Promise<string | null> {
  const productId = PRO_IAP_TIERS[tier].productId;
  const cached = prices.get(productId);
  if (cached) return cached;
  const iap = await connect();
  if (!iap) return null;
  try {
    const products = (await iap.fetchProducts({ skus: [productId], type: "subs" })) ?? [];
    const product = products.find((p) => p.id === productId);
    if (!product?.displayPrice) return null;
    prices.set(productId, product.displayPrice);
    return product.displayPrice;
  } catch {
    return null;
  }
}

export type PurchaseResult =
  | { kind: "ok"; access: ProAccess }
  | { kind: "cancelled" }
  | { kind: "pending" }
  | { kind: "unavailable" }
  | { kind: "none" }
  | { kind: "failed"; message: string };

async function bearerFor(userId: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token || session.user.id !== userId) throw Object.assign(new Error("session_required"), { code: "session_required" });
  return `Bearer ${session.access_token}`;
}

async function jwsFor(iap: ExpoIapModule, purchase: IapPurchase): Promise<string | null> {
  if (purchase.purchaseToken) return purchase.purchaseToken;
  try {
    return (await iap.getTransactionJwsIOS?.(purchase.productId)) ?? null;
  } catch {
    return null;
  }
}

/** Manda la transacción firmada al servidor y, si la acepta, la cierra. */
async function verifyAndFinish(iap: ExpoIapModule, purchase: IapPurchase, userId: string): Promise<PurchaseResult> {
  const signedTransaction = await jwsFor(iap, purchase);
  if (!signedTransaction) return { kind: "failed", message: verifyErrorMessage(null) };
  let response: Response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: await bearerFor(userId) },
      body: JSON.stringify({ signedTransaction }),
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : null;
    return { kind: "failed", message: code === "session_required" ? verifyErrorMessage(code) : "Sin conexión con Franky. Tu compra está hecha: pulsa Restaurar compras cuando tengas red." };
  }
  const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  const access = response.ok ? parseProAccess(body) : null;
  if (!access) return { kind: "failed", message: verifyErrorMessage(body?.code ?? body?.error ?? (response.status === 401 ? "unauthorized" : null)) };
  try {
    await iap.finishTransaction({ purchase, isConsumable: false });
  } catch {
    // Ya está registrada en Franky: si StoreKit la reenvía, el servidor la
    // reconoce como la misma suscripción.
  }
  setCachedProAccess(userId, access);
  return { kind: "ok", access };
}

function pickPurchase(value: IapPurchase | IapPurchase[] | null | undefined, productId: string): IapPurchase | null {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.find((p) => p.productId === productId) ?? null;
}

/**
 * Compra la suscripción del nivel. appAccountToken = userId para que Apple
 * y el servidor sepan de qué cuenta de Franky es.
 */
export async function purchasePro(tier: ProIapTier, userId: string): Promise<PurchaseResult> {
  const iap = await connect();
  if (!iap) return { kind: "unavailable" };
  const productId = PRO_IAP_TIERS[tier].productId;

  // Algunas versiones de StoreKit entregan la compra solo por el evento.
  const fromEvent: { purchase: IapPurchase | null; wake: (() => void) | null } = { purchase: null, wake: null };
  const sub = iap.purchaseUpdatedListener((p) => {
    if (p.productId !== productId) return;
    fromEvent.purchase = p;
    fromEvent.wake?.();
  });

  try {
    let purchase: IapPurchase | null;
    try {
      purchase = pickPurchase(
        await iap.requestPurchase({ type: "subs", request: { apple: { sku: productId, appAccountToken: userId, andDangerouslyFinishTransactionAutomatically: false } } }),
        productId,
      );
    } catch (error) {
      const kind = purchaseErrorKind(error);
      if (kind === "cancelled") return { kind: "cancelled" };
      if (kind === "pending") return { kind: "pending" };
      return { kind: "failed", message: "No se ha podido completar la compra con Apple. Inténtalo de nuevo." };
    }
    if (!purchase && !fromEvent.purchase) {
      await new Promise<void>((resolve) => {
        fromEvent.wake = resolve;
        setTimeout(resolve, 3000);
      });
    }
    purchase ??= fromEvent.purchase;
    // Sin compra ni error: pendiente de aprobación (compra aplazada, "Pedir permiso").
    if (!purchase || purchase.purchaseState === "pending") return { kind: "pending" };
    return await verifyAndFinish(iap, purchase, userId);
  } finally {
    sub.remove();
  }
}

/** Restaurar compras: vuelve a mandar al servidor las suscripciones vigentes. */
export async function restorePro(userId: string): Promise<PurchaseResult> {
  const iap = await connect();
  if (!iap) return { kind: "unavailable" };
  try {
    await iap.restorePurchases();
  } catch {
    // Solo sincroniza con Apple; seguimos con lo que haya en el teléfono.
  }
  let purchases: IapPurchase[] = [];
  try {
    purchases = await iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
  } catch {
    return { kind: "failed", message: "No hemos podido hablar con la App Store. Inténtalo de nuevo." };
  }
  const mine = purchases
    .filter((p) => PRO_PRODUCT_IDS.includes(p.productId) && p.purchaseState !== "pending")
    .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0));
  if (!mine.length) return { kind: "none" };

  let best: PurchaseResult | null = null;
  for (const purchase of mine) {
    const result = await verifyAndFinish(iap, purchase, userId);
    if (result.kind === "ok" && (best?.kind !== "ok" || (!best.access.pro && result.access.pro))) best = result;
    else if (!best) best = result;
  }
  return best ?? { kind: "none" };
}

/** Abre la gestión de suscripciones de Apple (cambiar o cancelar). */
export async function openManageSubscriptions(): Promise<boolean> {
  const iap = loadIap();
  if (!iap?.deepLinkToSubscriptionsIOS) return false;
  try {
    await iap.deepLinkToSubscriptionsIOS();
    return true;
  } catch {
    return false;
  }
}
