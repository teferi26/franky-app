import 'server-only';
import type { createAdminSupabase } from './supabase-admin';
import type { ProSubscriptionState } from './apple-iap';

type Admin = ReturnType<typeof createAdminSupabase>;

export interface ProAccess {
  pro: boolean;
  status: string | null;
  tier: string | null;
  product_id: string | null;
  expires_at: string | null;
  is_trial: boolean;
}

export class ProStoreError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'ProStoreError';
  }
}

const KNOWN_ERRORS = [
  'pro_subscription_owner_conflict',
  'pro_subscription_owner_unknown',
  'pro_subscription_environment_mismatch',
  'pro_subscription_invalid',
];

/** Escribe el estado con la RPC de service_role (idempotente y ordenada). */
export async function applyProState(
  admin: Admin,
  state: ProSubscriptionState,
  notification: { uuid: string; type: string; subtype?: string | null } | null = null,
): Promise<{ applied: boolean; duplicate: boolean; stale: boolean; created: boolean }> {
  const { data, error } = await admin.rpc('pro_apply_apple_state', { p_state: state, p_notification: notification });
  if (error) {
    const known = KNOWN_ERRORS.find((code) => error.message?.includes(code));
    throw new ProStoreError(known ?? 'pro_store_unavailable');
  }
  return data as { applied: boolean; duplicate: boolean; stale: boolean; created: boolean };
}

/** Lo mismo que devuelve get_my_pro_access, sin trial_eligible. */
export async function readProAccess(admin: Admin, userId: string): Promise<ProAccess> {
  const { data, error } = await admin.rpc('pro_access_for_user', { p_user: userId });
  if (error || !data) throw new ProStoreError('pro_store_unavailable');
  const access = data as ProAccess & { trial_eligible?: boolean };
  return {
    pro: access.pro === true,
    status: access.status ?? null,
    tier: access.tier ?? null,
    product_id: access.product_id ?? null,
    expires_at: access.expires_at ?? null,
    is_trial: access.is_trial === true,
  };
}
