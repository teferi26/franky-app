import 'server-only';
import { createAdminSupabase } from './supabase-admin';

type Job = { user_id: string; desired_ban: boolean; revision: string; lease_id: string };

/** Reconcile Auth with the durable moderation decision; SQL already denies old JWTs. */
export async function processModerationAuth() {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('claim_moderation_auth_job');
  if (error) throw new Error('moderation_auth_claim_failed');
  const job = data as Job | null;
  if (!job) return { processed: 0 };
  let success = false;
  try {
    const result = await admin.auth.admin.updateUserById(job.user_id, {
      ban_duration: job.desired_ban ? '876000h' : 'none',
    });
    success = !result.error || result.error.code === 'user_not_found';
  } catch { /* Retry without logging identity or provider responses. */ }
  const finished = await admin.rpc('finish_moderation_auth_job', {
    p_user: job.user_id, p_revision: job.revision, p_lease: job.lease_id, p_success: success,
  });
  if (finished.error || !success) throw new Error('moderation_auth_retry_required');
  return { processed: 1, reconciled: finished.data === true };
}
