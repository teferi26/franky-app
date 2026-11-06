// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, any>[]>, fail: '' }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => ({
  from: (table: string) => {
    const filters: ((row: Record<string, any>) => boolean)[] = [];
    let update: Record<string, unknown> | null = null;
    let deleted = false;
    const query: any = {
      select: () => query, limit: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      gt: (key: string, value: string) => { filters.push(row => row[key] > value); return query; },
      update: (value: Record<string, unknown>) => { update = value; return query; },
      delete: () => { deleted = true; return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve().then(() => {
        if (state.fail === table) return resolve({ data: null, error: { message: 'Unavailable' } });
        const rows = (state.tables[table] || []).filter(row => filters.every(f => f(row)));
        if (update) rows.forEach(row => Object.assign(row, update));
        if (deleted) state.tables[table] = state.tables[table].filter(row => !rows.includes(row));
        return resolve({ data: rows.map(row => ({ ...row })), error: null });
      }),
      maybeSingle: async () => { const result = await query; return { ...result, data: result.data?.[0] ?? null }; },
    };
    return query;
  },
  rpc: async () => ({ data: true, error: null }),
}) }));

import { POST } from '../app/api/internal/notify-push/route';
const jobId = '10000000-0000-4000-8000-000000000001';
const lease = '20000000-0000-4000-8000-000000000002';
const request = (key = lease, auth = 'Bearer local-test-secret') => new Request('http://localhost/api/internal/notify-push', {
  method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ alert_id: jobId, lease_id: key }),
});
const row = () => state.tables.push_delivery_outbox[0];

beforeEach(() => {
  vi.stubEnv('NOTIFY_EMAIL_SECRET', 'local-test-secret');
  state.fail = '';
  state.tables = {
    push_delivery_outbox: [{ id: jobId, notification_id: 'notice', status: 'sending', lease_id: lease, attempts: 1, next_attempt_at: new Date(Date.now() + 120000).toISOString(), device_results: [] }],
    notifications: [{ id: 'notice', user_id: 'owner', title: 'Fixture', body: 'Fixture', type: 'news', data: {} }],
    profiles: [{ id: 'owner', is_discarded: false, push_prefs: {} }],
    device_tokens: [{ id: 'phone-a', user_id: 'owner', token: 'ExpoPushToken[fixture-a]' }, { id: 'phone-b', user_id: 'owner', token: 'ExpoPushToken[fixture-b]' }],
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: [{ status: 'ok', id: 'ticket-a' }, { status: 'ok', id: 'ticket-b' }] })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('durable push request processing', () => {
  it('sends the real sender and text, bound to the real recipient, on the messages channel', async () => {
    state.tables.notifications[0].type = 'message';
    state.tables.notifications[0].data = { recipient_user_id: 'forged-owner', conversation_id: 'chat-id', subtitle: 'Chat del evento' };
    state.tables.notifications[0].title = 'Marta';
    state.tables.notifications[0].body = '¿Vienes esta noche?';
    expect((await POST(request())).status).toBe(200);
    const sent = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(sent).toHaveLength(2);
    expect(sent[0].data.recipient_user_id).toBe('owner');
    expect(sent[0].data.conversation_id).toBe('chat-id');
    expect(sent[0].title).toBe('Marta');
    expect(sent[0].body).toBe('¿Vienes esta noche?');
    expect(sent[0].subtitle).toBe('Chat del evento');
    expect(sent[0].threadId).toBe('chat-id');
    expect(sent[0].channelId).toBe('messages');
    expect(sent[0].priority).toBe('high');
    expect(sent[1].to).toBe('ExpoPushToken[fixture-b]');
  });
  it('rejects an invalid secret and stale lease before calling the provider', async () => {
    expect((await POST(request(lease, 'Bearer invalid'))).status).toBe(401);
    expect((await POST(request('30000000-0000-4000-8000-000000000003'))).status).toBe(409);
    expect(fetch).not.toHaveBeenCalled(); expect(row().status).toBe('sending');
  });
  it('claims a lease once when the same dispatch is delivered concurrently', async () => {
    await Promise.all([POST(request()), POST(request())]);
    expect(fetch).toHaveBeenCalledTimes(1); expect(row().status).toBe('accepted');
    expect(row().device_results).toHaveLength(2);
    await POST(request()); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retries only the device whose provider ticket failed', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: [
      { status: 'ok', id: 'ticket-a' }, { status: 'error', details: { error: 'MessageRateExceeded' } },
    ] }));
    expect((await POST(request())).status).toBe(502); expect(row().status).toBe('pending');
    row().status = 'sending'; row().attempts = 2;
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: [{ status: 'ok', id: 'ticket-b' }] }));
    expect((await POST(request())).status).toBe(200);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(payload.map((p: { to: string }) => p.to)).toEqual(['ExpoPushToken[fixture-b]']);
    expect(row().status).toBe('accepted'); expect(row().device_results[0].ticket_id).toBe('ticket-a');
  });
  it('does not treat unavailable preferences as permission to send', async () => {
    state.fail = 'profiles'; expect((await POST(request())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled(); expect(row().status).toBe('processing');
  });
  it('does not repeat a request whose provider outcome is unknown', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Timeout after dispatch'));
    expect((await POST(request())).status).toBe(502); expect(row().status).toBe('failed');
    await POST(request()); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves known tickets and stops on an ambiguous partial provider response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: [{ status: 'ok', id: 'ticket-a' }] }));
    expect((await POST(request())).status).toBe(502); expect(row().status).toBe('failed');
    expect(row().device_results[0].ticket_id).toBe('ticket-a');
    expect(row().device_results[1].status).toBe('unknown');
    await POST(request()); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
