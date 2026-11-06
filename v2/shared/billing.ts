/** Product definitions do not activate sales or change existing Stripe plans. */
export const BILLING_CATALOG_VERSION = 1;
export const BILLING_CATALOG = [
  { key: 'student_pro', title: 'Franky Pro', kind: 'digital', entitlement: 'franky.pro', scope: 'person', nativeProvider: 'revenuecat', currency: 'EUR', priceVersion: 1 },
  { key: 'student_premium', title: 'Franky Premium', kind: 'digital', entitlement: 'franky.premium', scope: 'person', nativeProvider: 'revenuecat', currency: 'EUR', priceVersion: 1 },
  { key: 'event_ticket', title: 'Entrada presencial', kind: 'physical_service', entitlement: null, scope: 'reservation', nativeProvider: 'stripe', currency: 'EUR', priceVersion: 1 },
  { key: 'housing_visit', title: 'Visita al alojamiento', kind: 'physical_service', entitlement: null, scope: 'reservation', nativeProvider: 'stripe', currency: 'EUR', priceVersion: 1 },
  { key: 'housing_rent', title: 'Alquiler y fianza', kind: 'physical_service', entitlement: null, scope: 'contract', nativeProvider: 'stripe', currency: 'EUR', priceVersion: 1 },
] as const;
export type NativeEntitlementKey = 'franky.pro' | 'franky.premium';
export type NativeProductMapping = { productId: string; platform: 'ios' | 'android'; entitlement: NativeEntitlementKey; catalogKey: 'student_pro' | 'student_premium' };
export type NativeEntitlement = { entitlement: NativeEntitlementKey; productId: string; expiresAt: string; platform: 'ios' | 'android' };
export type NativeBillingConfiguration = { configured: boolean; salesEnabled: boolean; canRestore: boolean; products: NativeProductMapping[]; entitlements: NativeEntitlement[] };

export function validNativeProducts(value: unknown): NativeProductMapping[] {
  if (!Array.isArray(value)) return [];
  const rows = value.filter((v): v is NativeProductMapping => !!v && typeof v === 'object'
    && typeof v.productId === 'string' && /^[a-zA-Z0-9._:-]{1,160}$/.test(v.productId)
    && (v.platform === 'ios' || v.platform === 'android')
    && ((v.catalogKey === 'student_pro' && v.entitlement === 'franky.pro') || (v.catalogKey === 'student_premium' && v.entitlement === 'franky.premium')));
  return rows.length === value.length && new Set(rows.map(v => v.platform + ':' + v.productId)).size === rows.length ? rows : [];
}
