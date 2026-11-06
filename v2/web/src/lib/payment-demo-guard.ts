import { createAdminSupabase } from './supabase-admin';

/** Server-controlled assignment. A missing/unreadable registry fails closed. */
export async function isDemoPaymentActor(userId: string): Promise<boolean> {
  const { data, error } = await createAdminSupabase().from('workspace_demo_accounts')
    .select('user_id').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('payment_demo_registry_unavailable');
  return !!data;
}

export async function assertRealPaymentActors(...ids: string[]) {
  for (const id of new Set(ids)) {
    if (await isDemoPaymentActor(id)) throw new Error('demo_payments_disabled');
  }
}
