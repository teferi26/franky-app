import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { captureSessionIdentity, type SessionIdentity } from './session';
import { withOwnedRequest, type OwnedRequest } from './owned-request';
import { fetchConTimeout, WEB_URL } from './supabase';
import type { NativeBillingConfiguration } from '../../../shared/billing';

const disabled: NativeBillingConfiguration = { configured: false, salesEnabled: false, canRestore: false, products: [], entitlements: [] };
function publicKey() {
  if (process.env.EXPO_PUBLIC_NATIVE_BILLING_ENABLED !== 'true') return null;
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.startsWith('appl_') ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : null;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.startsWith('goog_') ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : null;
  return null;
}
export function nativeBillingAvailable() { return !!publicKey(); }
async function configuration(request: OwnedRequest, method = 'GET'): Promise<NativeBillingConfiguration> {
  const response = await fetchConTimeout(WEB_URL + '/api/billing/native', { method, signal: request.signal, headers: { Authorization: request.authorization } });
  request.check();
  if (!response.ok) throw new Error('No se pudo comprobar la compra. Inténtalo de nuevo.');
  const value = await response.json() as NativeBillingConfiguration;
  request.check();
  return value;
}
export async function getNativeBilling(owner = captureSessionIdentity()): Promise<NativeBillingConfiguration> {
  if (!owner || !nativeBillingAvailable()) return disabled;
  return withOwnedRequest(owner, request => configuration(request));
}

let queue: Promise<unknown> = Promise.resolve();
let configuredUser: string | null = null;
/** RevenueCat is a singleton: serialize identity changes and store operations. */
function ownedStore<T>(owner: SessionIdentity, work: (request: OwnedRequest, purchases: typeof import('react-native-purchases').default) => Promise<T>) {
  const operation = queue.catch(() => {}).then(() => withOwnedRequest(owner, async request => {
    const apiKey = publicKey();
    if (!apiKey) throw new Error('Las compras digitales todavía no están disponibles.');
    const purchases = (await import('react-native-purchases')).default;
    request.check();
    if (!configuredUser) { purchases.configure({ apiKey, appUserID: owner.userId }); configuredUser = owner.userId; }
    else if (configuredUser !== owner.userId) { await purchases.logIn(owner.userId); configuredUser = owner.userId; }
    request.check();
    return work(request, purchases);
  }));
  queue = operation;
  return operation;
}
export type NativeOffer = { id: string; productId: string; title: string; description: string; price: string; package: PurchasesPackage };
export async function getNativeOffers(owner = captureSessionIdentity()): Promise<NativeOffer[]> {
  if (!owner || !nativeBillingAvailable()) return [];
  return ownedStore(owner, async (request, purchases) => {
    const config = await configuration(request);
    if (!config.salesEnabled) return [];
    const offerings = await purchases.getOfferings(); request.check();
    const allowed = new Set(config.products.filter(p => p.platform === Platform.OS).map(p => p.productId));
    return (offerings.current?.availablePackages ?? []).filter(p => allowed.has(p.product.identifier))
      .map(p => ({ id: p.identifier, productId: p.product.identifier, title: p.product.title, description: p.product.description, price: p.product.priceString, package: p }));
  });
}

export type NativePurchaseResult = { status: 'verified' | 'pending' | 'cancelled'; configuration?: NativeBillingConfiguration };
export async function buyNativeOffer(offer: NativeOffer, owner = captureSessionIdentity()): Promise<NativePurchaseResult> {
  if (!owner) throw new Error('Inicia sesión para comprar.');
  return ownedStore(owner, async (request, purchases) => {
    const config = await configuration(request);
    if (!config.salesEnabled || !config.products.some(p => p.platform === Platform.OS && p.productId === offer.package.product.identifier)) throw new Error('Esta compra no está disponible.');
    try { await purchases.purchasePackage(offer.package); }
    catch (error) {
      request.check();
      if ((error as { userCancelled?: boolean })?.userCancelled) return { status: 'cancelled' };
      throw new Error('No se pudo completar la compra. Revisa su estado en la tienda.');
    }
    request.check();
    try {
      const verified = await configuration(request, 'POST');
      return { status: verified.entitlements.some(e => e.productId === offer.productId) ? 'verified' : 'pending', configuration: verified };
    } catch { request.check(); return { status: 'pending' }; }
  });
}

/** User-initiated only. Local CustomerInfo never grants a server capability. */
export async function restoreNativePurchases(owner = captureSessionIdentity()): Promise<NativePurchaseResult> {
  if (!owner) throw new Error('Inicia sesión para restaurar tus compras.');
  return ownedStore(owner, async (request, purchases) => {
    const config = await configuration(request);
    if (!config.canRestore) throw new Error('La restauración todavía no está configurada.');
    await purchases.restorePurchases(); request.check();
    try { return { status: 'verified', configuration: await configuration(request, 'POST') }; }
    catch { request.check(); return { status: 'pending' }; }
  });
}
