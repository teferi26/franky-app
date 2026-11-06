import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as reconcile, GET as lookup } from '../app/api/admin/users/lookup/route';
import { POST as hardDelete } from '../app/api/admin/users/[id]/hard-delete/route';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), auth: vi.fn(), list: vi.fn(), existing: null as any,
  readError: null as any, insertError: null as any, intentError: false, receiptError: false, receiptThrows: false,
  profileWrites: [] as any[], audits: [] as any[] }));
vi.mock('@/lib/admin-request', async () => {
  const { NextResponse } = await import('next/server');
  return { requireAdminRequest: async () => ({ user: { id: '22222222-2222-4222-8222-222222222222' } }),
    adminJson: (data: unknown, options: any = {}) => NextResponse.json(data, { ...options, headers: { 'Cache-Control': 'private, no-store' } }) };
});
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: mocks.admin }));
const id = '11111111-1111-4111-8111-111111111111';
const authUser = { id, email: 'ana@example.es', created_at: '2020-01-01T00:00:00Z', email_confirmed_at: '2020-01-02T00:00:00Z', user_metadata: {}, app_metadata: {} };
const request = (email = 'ana@example.es', userId = id) => new NextRequest(`https://franky.test/api/admin/users/lookup?email=${encodeURIComponent(email)}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });

beforeEach(() => {
  mocks.existing = null; mocks.readError = null; mocks.insertError = null;
  mocks.intentError = mocks.receiptError = mocks.receiptThrows = false; mocks.profileWrites.length = 0; mocks.audits.length = 0;
  mocks.auth.mockReset().mockResolvedValue({ data: { user: authUser }, error: null });
  mocks.list.mockReset().mockResolvedValue({ data: { users: [authUser] }, error: null });
  mocks.admin.mockReset().mockImplementation(() => ({ auth: { admin: { getUserById: mocks.auth, listUsers: mocks.list } },
    from(table: string) {
      let inserted: any = null;
      const builder: any = { select: () => builder, eq: () => builder, insert(value: any) { inserted = value; return builder; },
        maybeSingle: () => builder, single: () => builder,
        then(yes: any, no: any) {
          let operation: Promise<any>;
          if (table === 'admin_actions') {
            mocks.audits.push(inserted);
            operation = inserted.action.endsWith('completed') && mocks.receiptThrows ? Promise.reject(new Error('transport failed'))
              : Promise.resolve({ data: null, error: inserted.action.endsWith('requested') ? mocks.intentError : mocks.receiptError });
          } else if (inserted) {
            mocks.profileWrites.push(inserted); operation = Promise.resolve({ data: mocks.insertError ? null : inserted, error: mocks.insertError });
          } else operation = Promise.resolve({ data: mocks.existing, error: mocks.readError });
          return operation.then(yes, no);
        } };
      return builder;
    } }));
});

describe('Reconciliation fails safely and reports partial completion', () => {
  it('does not insert when the existing-profile read fails', async () => {
    mocks.readError = { message: 'database offline' };
    expect((await reconcile(request())).status).toBe(503); expect(mocks.profileWrites).toHaveLength(0); expect(mocks.audits).toHaveLength(0);
  });
  it('does not insert unless the audit intention persisted', async () => {
    mocks.intentError = true;
    expect((await reconcile(request())).status).toBe(503); expect(mocks.profileWrites).toHaveLength(0);
  });
  it('rejects an email that does not belong to the displayed UUID', async () => {
    expect((await reconcile(request('bea@example.es'))).status).toBe(409); expect(mocks.profileWrites).toHaveLength(0);
  });
  it('rejects malformed UUIDs before creating a service client', async () => {
    expect((await reconcile(request('ana@example.es', 'bad-id'))).status).toBe(400); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('never updates an existing profile or claims ownership of a competing insert', async () => {
    mocks.existing = { id };
    expect((await reconcile(request())).status).toBe(409); expect(mocks.profileWrites).toHaveLength(0);
    mocks.existing = null; mocks.insertError = { code: '23505' };
    expect((await reconcile(request())).status).toBe(409); expect(mocks.audits.every(a => a.action.endsWith('requested'))).toBe(true);
  });
  it.each(['returned', 'thrown'])('returns 202 after a %s audit receipt failure without asking to recreate', async mode => {
    mocks.receiptError = mode === 'returned'; mocks.receiptThrows = mode === 'thrown';
    const response = await reconcile(request()); const body = await response.json();
    expect(response.status).toBe(202); expect(body).toMatchObject({ ok: true, audit_pending: true, profile: { id } });
    expect(body.message).toMatch(/no repitas/); expect(mocks.profileWrites).toHaveLength(1);
  });
  it('creates a profile with the real timestamps and correlated audit records', async () => {
    expect((await reconcile(request())).status).toBe(200);
    expect(mocks.profileWrites[0]).toMatchObject({ created_at: authUser.created_at, email_verified_at: authUser.email_confirmed_at, role: 'user' });
    expect(mocks.audits).toHaveLength(2); expect(mocks.audits[0].changes.operation_id).toBe(mocks.audits[1].changes.operation_id);
  });
  it('does not diagnose a profile as missing when its read fails', async () => {
    mocks.readError = { message: 'database offline' };
    const response = await lookup(new NextRequest('https://franky.test/api/admin/users/lookup?email=ana@example.es'));
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty('status', 'missing_profile');
  });
  it('blocks permanent deletion without instantiating a privileged client', async () => {
    const response = await hardDelete(request(), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(409); expect(mocks.admin).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
