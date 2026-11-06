// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { claimWebhookEvent, finishWebhookEvent } from '@/app/api/stripe/webhook/event-ledger';

const event = { id: 'evt_test_lease', type: 'checkout.session.completed' } as const;
const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('webhook durable claim boundary', () => {
  it.each(['PGRST202', '42501', '42601', 'connection_failure'])('retries without granting processing on %s', async code => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code } }) };
    expect(await claimWebhookEvent(db, event)).toEqual({ state: 'retry' });
  });
  it.each([null, {}, { token: 'invalid' }, { busy: true, token }])('rejects malformed or busy claims %#', async data => {
    expect(await claimWebhookEvent({ rpc: vi.fn().mockResolvedValue({ data, error: null }) }, event)).toEqual({ state: 'retry' });
  });
  it('retries after a transport rejection', async () => {
    expect(await claimWebhookEvent({ rpc: vi.fn().mockRejectedValue(new Error('offline')) }, event)).toEqual({ state: 'retry' });
  });
  it('requires the exact claim token and an affirmative durable completion', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { finished: false }, error: null });
    expect(await finishWebhookEvent({ rpc }, event, token, 'succeeded')).toBe(false);
    expect(rpc).toHaveBeenCalledWith('finish_webhook_event_v2', { p_event_id: event.id, p_token: token, p_status: 'succeeded', p_error: null });
  });
});
