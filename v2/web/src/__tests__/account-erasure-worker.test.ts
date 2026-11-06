import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), deleteUser: vi.fn(), revoke: vi.fn(), email: vi.fn(), stripe: {} as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({ rpc: f.rpc, storage: { from: () => ({ remove: f.remove }) }, auth: { admin: { deleteUser: f.deleteUser } } }) }));
vi.mock('@/lib/apple-account', () => ({ revokeAppleCredentials: f.revoke }));
vi.mock('@/lib/email', () => ({ sendEmail: f.email }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => f.stripe }));
vi.mock('@/lib/stripe-customer', () => ({ assertCustomerOwner: vi.fn(async () => {}) }));
import { processAccountErasure, stopAccountRenewals } from '@/lib/account-erasure';

const base = () => ({ user_id: 'account-a', lease_id: 'lease-a', requested_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  state: 'requested', completion_email: 'a@fixture.invalid', apple_subject: null, auth_erased_at: null,
  billing_stopped_at: null, apple_revoked_at: null, notification_sent_at: null, notification_attempts: 0, billing: {} });
let job: ReturnType<typeof base>;
let files: { bucket_id: string; name: string }[];
const steps = () => f.rpc.mock.calls.filter(([name]) => name === 'finish_account_erasure_step').map(([, args]) => args.p_step);
beforeEach(() => {
  vi.clearAllMocks(); job = base(); files = [];
  f.rpc.mockImplementation(async (name, args) => {
    if (name === 'claim_account_erasure') return { data: job, error: null };
    if (name === 'account_erasure_files') return { data: files, error: null };
    if (args?.p_step === 'files') files = [];
    return { data: true, error: null };
  });
  f.remove.mockResolvedValue({ error: null }); f.deleteUser.mockResolvedValue({ error: null });
  f.revoke.mockResolvedValue(undefined); f.email.mockResolvedValue({ ok: true });
});
describe('Durable account erasure worker', () => {
  it('clears Auth PII irreversibly, processes all stages and sends only a completion notice', async () => {
    files = [{ bucket_id: 'ugc-pending-image', name: 'owned/image.jpg' }];
    expect(await processAccountErasure()).toEqual({ processed: 1, complete: true });
    expect(f.deleteUser).toHaveBeenCalledWith('account-a', true);
    expect(f.remove).toHaveBeenCalledWith(['owned/image.jpg']);
    expect(steps()).toEqual(['auth', 'files', 'billing', 'apple', 'notice_sent', 'complete']);
  });
  it('a stale Stripe reference cannot block personal data or Auth erasure', async () => {
    job.billing = { subscriptions: ['missing'] } as any;
    f.stripe = { subscriptions: { retrieve: vi.fn().mockRejectedValue(new Error('missing')) } };
    await expect(processAccountErasure()).rejects.toThrow('account_erasure_retry_required');
    expect(f.rpc).toHaveBeenCalledWith('purge_account_erasure', { p_user: 'account-a', p_lease: 'lease-a' });
    expect(f.deleteUser).toHaveBeenCalledWith('account-a', true);
    expect(steps()).toContain('apple'); expect(steps()).toContain('retry');
    expect(steps()).not.toContain('complete'); expect(f.email).not.toHaveBeenCalled();
  });
  it('Apple unavailability blocks completion, but does not retain Auth PII', async () => {
    f.revoke.mockRejectedValue(new Error('provider unavailable'));
    await expect(processAccountErasure()).rejects.toThrow('account_erasure_retry_required');
    expect(f.deleteUser).toHaveBeenCalled(); expect(steps()).not.toContain('apple');
    expect(steps()).not.toContain('complete');
  });
  it('the final sweep rechecks billing even if an earlier attempt recorded it', async () => {
    job.billing_stopped_at = 'already checked' as any;
    job.billing = { subscriptions: ['late-subscription'] } as any;
    f.stripe = { subscriptions: { retrieve: vi.fn().mockRejectedValue(new Error('retry final billing')) } };
    await expect(processAccountErasure()).rejects.toThrow('account_erasure_retry_required');
    expect(f.stripe.subscriptions.retrieve).toHaveBeenCalledWith('late-subscription');
    expect(steps()).not.toContain('complete');
  });
  it('waits out signed upload validity and schedules another sweep', async () => {
    job.requested_at = new Date().toISOString();
    expect(await processAccountErasure()).toEqual({ processed: 1, complete: false });
    expect(steps()).toContain('wait'); expect(f.email).not.toHaveBeenCalled();
  });
  it('a storage outage does not claim success or prevent Auth erasure', async () => {
    files = [{ bucket_id: 'avatars', name: 'owned/pic.jpg' }];
    f.remove.mockResolvedValue({ error: new Error('offline') });
    await expect(processAccountErasure()).rejects.toThrow('account_erasure_retry_required');
    expect(f.deleteUser).toHaveBeenCalled(); expect(steps()).not.toContain('complete');
  });
  it('retries failed mail and stops retaining the address after five attempts', async () => {
    f.email.mockResolvedValue({ ok: false });
    await expect(processAccountErasure()).rejects.toThrow('account_erasure_retry_required');
    expect(steps()).toContain('notice_failed'); expect(steps()).not.toContain('complete');
    job.notification_attempts = 4; f.rpc.mockClear();
    expect(await processAccountErasure()).toEqual({ processed: 1, complete: true });
    expect(steps()).toContain('notice_failed'); expect(steps()).not.toContain('notice_sent');
  });
  it('does not repeat acknowledged irreversible steps on a retry', async () => {
    Object.assign(job, { billing_stopped_at: 'done', apple_revoked_at: 'done', auth_erased_at: 'done', notification_sent_at: 'done' });
    await processAccountErasure();
    expect(f.deleteUser).not.toHaveBeenCalled(); expect(f.revoke).not.toHaveBeenCalled(); expect(f.email).not.toHaveBeenCalled();
  });
  it('discovers subscription customers before enumerating their other renewals', async () => {
    const stripe = { subscriptions: { retrieve: vi.fn(async () => ({ id: 'sub', customer: 'customer-a', status: 'active', cancel_at_period_end: false })),
      list: vi.fn(() => []), update: vi.fn() }, subscriptionSchedules: { list: vi.fn(() => []), release: vi.fn(), cancel: vi.fn() },
      checkout: { sessions: { list: vi.fn(() => []), retrieve: vi.fn(), expire: vi.fn() } } };
    await stopAccountRenewals(stripe as any, { ...job, billing: { subscriptions: ['sub'] } } as any);
    expect(stripe.subscriptionSchedules.list).toHaveBeenCalledWith({ customer: 'customer-a', limit: 100 });
    expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({ customer: 'customer-a', status: 'open', limit: 100 });
  });
});
