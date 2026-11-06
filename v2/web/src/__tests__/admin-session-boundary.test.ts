// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { requireAdmin, requireStaff } from '../lib/analytics-filters';
import { GET } from '../app/api/admin/analytics/users/route';
import { POST as createTeam } from '../app/api/admin/create-propietario/route';
import { POST as upload } from '../app/api/admin/upload-image/route';
import { POST as fillImages } from '../app/api/admin/autofill-leisure-images/route';
import { GET as lookup, POST as reconcile } from '../app/api/admin/users/lookup/route';
import { POST as setRole } from '../app/api/admin/users/[id]/set-role/route';
import { POST as hardDelete } from '../app/api/admin/users/[id]/hard-delete/route';

const auth = vi.hoisted(() => ({
  cookie: null as string | null,
  identities: new Map<string, { id: string; role: string; discarded?: boolean }>(),
  verified: [] as string[],
  queried: [] as string[],
  rpc: vi.fn(async () => ({ data: [], error: null })),
}));
function makeClient(token: () => string | null) {
  return {
    auth: {
      getSession: async () => ({ data: { session: token() ? { access_token: token() } : null }, error: null }),
      getUser: async (jwt?: string) => {
        const effective = jwt ?? token() ?? ''; auth.verified.push(effective);
        const user = auth.identities.get(effective);
        return { data: { user: user ? { id: user.id } : null }, error: user ? null : new Error('Invalid JWT') };
      },
    },
    from: () => ({ select: () => ({ eq: (_: string, id: string) => ({
      maybeSingle: async () => {
        auth.queried.push(id); const profile = [...auth.identities.values()].find(u => u.id === id);
        return { data: profile ? { role: profile.role, is_discarded: !!profile.discarded } : null, error: null };
      },
    }) }) }),
    rpc: auth.rpc,
  };
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => makeClient(() => auth.cookie) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: (_url: string, _key: string, options: { global: { headers: { Authorization: string } } }) => makeClient(() => options.global.headers.Authorization.slice(7)) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
vi.mock('@/lib/env', () => ({ clientEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key' } }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: () => { throw new Error('Privileged backend must not be reached by this fixture'); } }));
function session(id: string, role: string, aal: string, discarded = false) {
  const token = `${Buffer.from('{"alg":"TEST"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, aal })).toString('base64url')}.verified-by-auth-mock`;
  auth.identities.set(token, { id, role, discarded }); return token;
}
function request(token?: string) { return new NextRequest('https://franky.es/api/admin/analytics/users', { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } }); }
beforeEach(() => { auth.cookie = null; auth.identities.clear(); auth.verified = []; auth.queried = []; auth.rpc.mockClear(); });

describe('Administrative authentication binds role and MFA to one verified session', () => {
  it('blocks the reproduced cookie AAL2 + Bearer admin AAL1 combination at both boundaries', async () => {
    auth.cookie = session('student-a', 'user', 'aal2'); const req = request(session('admin-b', 'admin', 'aal1'));
    expect((await middleware(req)).status).toBe(403);
    const guard = await requireStaff(req); expect(guard.ok).toBe(false);
    if (!guard.ok) expect(await guard.response.json()).toMatchObject({ error: 'mfa_required' });
    expect((await GET(req)).status).toBe(403); expect(auth.rpc).not.toHaveBeenCalled();
  });
  it('accepts an independently verified admin AAL2 bearer even when the cookie is AAL1', async () => {
    auth.cookie = session('other', 'user', 'aal1'); const token = session('admin', 'admin', 'aal2'); const req = request(token);
    expect((await middleware(req)).status).toBe(200); expect(await requireAdmin(req)).toEqual({ ok: true, userId: 'admin', role: 'admin' });
    expect((await GET(req)).status).toBe(200); expect(auth.verified.every(t => t === token)).toBe(true); expect(auth.queried.every(id => id === 'admin')).toBe(true);
  });
  it.each(['', 'malformed', 'bad.bad.bad'])('does not fall back to a valid cookie for invalid bearer %j', async bearer => {
    auth.cookie = session('admin', 'admin', 'aal2'); const req = request(bearer);
    expect((await middleware(req)).status).toBe(401); const guard = await requireStaff(req); expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401); expect(auth.rpc).not.toHaveBeenCalled();
  });
  it('rejects a forged AAL2 claim when Supabase has not validated its token', async () => {
    const token = session('forged', 'admin', 'aal2'); auth.identities.delete(token);
    const guard = await requireAdmin(request(token)); expect(guard.ok).toBe(false); if (!guard.ok) expect(guard.response.status).toBe(401);
  });
  it('requires AAL2 for cookie-only administrators even when called without a request', async () => {
    auth.cookie = session('admin', 'admin', 'aal1'); const rejected = await requireAdmin(); expect(rejected.ok).toBe(false);
    auth.cookie = session('admin', 'admin', 'aal2'); expect((await requireAdmin()).ok).toBe(true);
  });
  it('keeps analyst read access separate from admin writes after MFA', async () => {
    const req = request(session('analyst', 'analyst', 'aal2')); expect((await requireStaff(req)).ok).toBe(true); expect((await requireAdmin(req)).ok).toBe(false);
  });
  it.each([['user', false], ['admin', true]])('rejects %s with discarded=%s regardless of AAL2', async (role, discarded) => {
    const guard = await requireStaff(request(session('person', role as string, 'aal2', discarded as boolean))); expect(guard.ok).toBe(false);
  });
});

describe('Every management API enforces the same administrator and second factor inside its handler', () => {
  const target = { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) };
  const handlers = [
    ['create team', (r: NextRequest) => createTeam(r)], ['upload image', (r: NextRequest) => upload(r)],
    ['fill images', (r: NextRequest) => fillImages(r)], ['lookup', (r: NextRequest) => lookup(r)],
    ['reconcile', (r: NextRequest) => reconcile(r)], ['set role', (r: NextRequest) => setRole(r,target)], ['delete account', (r: NextRequest) => hardDelete(r,target)],
  ] as const;
  it.each(handlers)('%s rejects an AAL1 bearer even with an administrator AAL2 cookie', async (_label, handler) => {
    auth.cookie = session('cookie-admin', 'admin', 'aal2'); const token = session('bearer-admin','admin','aal1');
    const response = await handler(request(token)); expect(response.status).toBe(403); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(auth.verified.every(value => value === token)).toBe(true);
  });
  it.each(handlers)('%s rejects a student bearer instead of borrowing an administrator cookie', async (_label, handler) => {
    auth.cookie = session('cookie-admin','admin','aal2'); const token = session('student','user','aal2');
    expect((await handler(request(token))).status).toBe(403); expect(auth.queried).toEqual(['student']);
  });
  it.each(handlers)('%s rejects an empty bearer instead of falling back to cookies', async (_label, handler) => {
    auth.cookie = session('cookie-admin','admin','aal2'); expect((await handler(request(''))).status).toBe(401); expect(auth.queried).toHaveLength(0);
  });
  it.each(handlers)('%s rejects discarded administrators with AAL2', async (_label, handler) => {
    expect((await handler(request(session('admin','admin','aal2',true)))).status).toBe(403);
  });
});
