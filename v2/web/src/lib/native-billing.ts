import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminSupabase } from './supabase-admin';
import { isDemoPaymentActor } from './payment-demo-guard';
import { validNativeProducts, type NativeEntitlement, type NativeProductMapping, type NativeBillingConfiguration } from '../../../shared/billing';

export type BillingEnvironment = 'PRODUCTION' | 'SANDBOX';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function verifyRevenueCatWebhook(raw: string, signature: string | null, secret: string, now = Date.now()): boolean {
  if (!secret || !signature) return false;
  const match = /^t=(\d{10}),v1=([a-f0-9]{64})$/i.exec(signature);
  if (!match || Math.abs(now / 1000 - Number(match[1])) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${match[1]}.${raw}`).digest();
  return timingSafeEqual(expected, Buffer.from(match[2], 'hex'));
}
export function constantTimeAuthorization(header: string | null, expected: string): boolean {
  if (!header || !expected) return false;
  const actualBytes = Buffer.from(header), expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/** Canonical subscriber data, never an event's claimed grant, drives access. */
export function subscriberEntitlements(payload: unknown, userId: string, mapping: NativeProductMapping[], environment: BillingEnvironment, now = Date.now()): { grants: NativeEntitlement[]; observedAt: number } {
  const body = payload as { request_date_ms?: unknown; subscriber?: { original_app_user_id?: unknown; entitlements?: Record<string, { product_identifier?: string; expires_date?: string | null }>; subscriptions?: Record<string, { store?: string; is_sandbox?: boolean; refunded_at?: string | null }> } };
  if (!body?.subscriber || body.subscriber.original_app_user_id !== userId || !UUID.test(userId)) throw new Error('native_purchase_owner_unverified');
  const observedAt = Number(body.request_date_ms);
  if (!Number.isSafeInteger(observedAt) || observedAt <= 0 || observedAt > now + 60_000 || observedAt < now - 5 * 60_000) throw new Error('native_subscription_snapshot_invalid');
  const grants: NativeEntitlement[] = [];
  for (const product of mapping) {
    const entitlement = body.subscriber.entitlements?.[product.entitlement];
    if (!entitlement || entitlement.product_identifier !== product.productId) continue;
    const subscription = body.subscriber.subscriptions?.[product.productId];
    if (!subscription || subscription.refunded_at || typeof subscription.is_sandbox !== 'boolean') continue;
    if (subscription.is_sandbox !== (environment === 'SANDBOX')) continue;
    if (subscription.store !== (product.platform === 'ios' ? 'app_store' : 'play_store')) continue;
    const expires = Date.parse(entitlement.expires_date ?? '');
    // Current catalog is recurring subscriptions only. Lifetime/unknown dates
    // require a separately reviewed product instead of accidental endless access.
    if (!Number.isFinite(expires) || expires <= now) continue;
    grants.push({ entitlement: product.entitlement, productId: product.productId, expiresAt: new Date(expires).toISOString(), platform: product.platform });
  }
  return { grants, observedAt };
}

export async function nativeBillingSettings() {
  const admin = createAdminSupabase();
  const [{ data, error }, { data: release, error: releaseError }] = await Promise.all([
    admin.from('native_billing_configuration').select('verified_for_sales,environment,product_mapping').eq('singleton', true).maybeSingle(),
    admin.from('workspace_release').select('digital_sales_enabled').eq('singleton', true).maybeSingle(),
  ]);
  if (error || releaseError) throw new Error('native_billing_configuration_unavailable');
  const products = validNativeProducts(data?.product_mapping);
  const environment: BillingEnvironment = data?.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
  const configured = !!process.env.REVENUECAT_SECRET_API_KEY && !!process.env.REVENUECAT_WEBHOOK_SIGNING_SECRET
    && !!process.env.REVENUECAT_WEBHOOK_AUTHORIZATION && !!process.env.REVENUECAT_APP_IDS?.trim() && products.length > 0;
  return { configured, salesEnabled: configured && release?.digital_sales_enabled === true && data?.verified_for_sales === true,
    canRestore: configured, products, environment };
}

export async function getNativeBillingConfiguration(userId: string): Promise<NativeBillingConfiguration> {
  if (await isDemoPaymentActor(userId)) return { configured: false, salesEnabled: false, canRestore: false, products: [], entitlements: [] };
  const settings = await nativeBillingSettings();
  const { data, error } = await createAdminSupabase().from('native_entitlements').select('entitlement,product_id,expires_at,platform')
    .eq('user_id', userId).eq('environment', settings.environment).gt('expires_at', new Date().toISOString());
  if (error) throw new Error('native_entitlements_unavailable');
  return { configured: settings.configured, salesEnabled: settings.salesEnabled, canRestore: settings.canRestore,
    products: settings.products, entitlements: (data ?? []).map(v => ({ entitlement: v.entitlement, productId: v.product_id, expiresAt: v.expires_at, platform: v.platform })) };
}

export async function syncNativeEntitlements(userId: string, eventId: string) {
  if (!UUID.test(userId)) throw new Error('native_purchase_owner_unverified');
  if (await isDemoPaymentActor(userId)) throw new Error('demo_payments_disabled');
  const settings = await nativeBillingSettings();
  if (!settings.configured) throw new Error('native_billing_not_configured');
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${process.env.REVENUECAT_SECRET_API_KEY!}`, Accept: 'application/json' },
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('native_provider_unavailable');
  const snapshot = subscriberEntitlements(await response.json(), userId, settings.products, settings.environment);
  const { error } = await createAdminSupabase().rpc('apply_native_entitlement_snapshot', {
    p_user: userId, p_event: eventId, p_observed_ms: snapshot.observedAt, p_environment: settings.environment, p_grants: snapshot.grants,
  });
  if (error) throw new Error('native_entitlement_write_failed');
  return snapshot.grants;
}
