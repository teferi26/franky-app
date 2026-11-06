// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../app/auth/callback/route';
const f = vi.hoisted(() => ({ exchange: vi.fn(), getUser: vi.fn(), profile: vi.fn(), rpc: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: async () => ({ auth: { exchangeCodeForSession: f.exchange, getUser: f.getUser }, rpc: f.rpc, from: () => { const q = { select: () => q, eq: () => q, maybeSingle: f.profile }; return q; } }) }));
const party = '/crush/fiesta/franky-11-septiembre';
const request = (next = party, code = 'authorization-code') => new Request(`https://franky.es/auth/callback?code=${code}&next=${encodeURIComponent(next)}`);
beforeEach(() => {
  vi.clearAllMocks(); f.exchange.mockResolvedValue({ error: null }); f.getUser.mockResolvedValue({ data: { user: { id: 'a' } }, error: null });
  f.profile.mockResolvedValue({ data: { onboarding_completed: false, role: 'user' }, error: null }); f.rpc.mockResolvedValue({ data: [{}], error: null });
});
describe('Google returns party visitors to the minimal profile flow', () => {
  it('returns a new authenticated visitor to the exact party', async () => expect((await GET(request())).headers.get('location')).toBe(`https://franky.es${party}`));
  it('retains normal onboarding for other protected destinations', async () => expect((await GET(request('/roomie-match'))).headers.get('location')).toBe('https://franky.es/onboarding?next=%2Froomie-match'));
  it('retains normal onboarding for unrelated subroutes', async () => expect((await GET(request(`${party}/private`))).headers.get('location')).toContain('/onboarding?next='));
  it('repairs an absent profile without overwriting a concurrent existing row', async () => {
    f.profile.mockResolvedValueOnce({ data: null, error: null });
    expect((await GET(request())).headers.get('location')).toBe(`https://franky.es${party}`); expect(f.rpc).toHaveBeenCalledWith('ensure_my_profile'); expect(f.profile).toHaveBeenCalledTimes(2);
  });
  it('does not interpret a failed profile query as an absent row', async () => {
    f.profile.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect((await GET(request())).headers.get('location')).toBe(`https://franky.es${party}?error=callback_failed`); expect(f.rpc).not.toHaveBeenCalled();
  });
  it('keeps the party available for retry when Google authorization fails', async () => {
    f.exchange.mockResolvedValue({ error: {} }); expect((await GET(request())).headers.get('location')).toBe(`https://franky.es${party}?error=callback_failed`);
  });
  it('does not claim successful login without a verified user', async () => {
    f.getUser.mockResolvedValue({ data: { user: null }, error: {} }); expect((await GET(request())).headers.get('location')).toContain('error=callback_failed');
  });
  it('never lets a failure redirect outside Franky through encoded slash controls', async () => {
    f.exchange.mockResolvedValue({ error: {} }); const location = (await GET(request('/%5cevil.invalid'))).headers.get('location')!;
    expect(new URL(location).origin).toBe('https://franky.es'); expect(new URL(location).pathname).toBe('/login');
  });
});
