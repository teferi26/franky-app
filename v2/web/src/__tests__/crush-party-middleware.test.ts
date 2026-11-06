// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
const f = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn(), profile: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: f.getUser, getSession: f.getSession }, from: f.profile }) }));
beforeEach(() => { vi.clearAllMocks(); f.getUser.mockResolvedValue({ data: { user: null }, error: null }); });
const req = (path: string, headers: Record<string,string> = {}) => new NextRequest(`https://franky.es${path}`, { headers });
describe('The projection is public but party participation remains authenticated', () => {
  it.each(['/crush/fiesta/franky-11-septiembre/pantalla','/api/crush/fiesta/franky-11-septiembre/feed','/api/crush/fiesta/franky-11-septiembre/qr'])('does not inspect or refresh a session on %s', async path => {
    const response = await middleware(req(path)); expect(response.status).toBe(200); expect(f.getUser).not.toHaveBeenCalled(); expect(f.profile).not.toHaveBeenCalled();
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
  it.each(['state','join','posts','action'])('returns 401 for anonymous %s actions', async action => {
    const response = await middleware(req(`/api/crush/fiesta/franky-11-septiembre/${action}`)); expect(response.status).toBe(401);
  });
  it('overwrites a forged chrome bypass on a regular page', async () => {
    const response = await middleware(req('/', { 'x-franky-surface': 'crush-party-screen' }));
    expect(response.headers.get('x-middleware-request-x-franky-surface')).toBe('app');
  });
  it('marks only the exact OBS path as a screen', async () => {
    const response = await middleware(req('/crush/fiesta/franky-11-septiembre/pantalla'));
    expect(response.headers.get('x-middleware-request-x-franky-surface')).toBe('crush-party-screen');
  });
  it('allows the QR landing without requiring login first', async () => {
    const response = await middleware(req('/crush/fiesta/franky-11-septiembre')); expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-franky-surface')).toBe('crush-party-entry');
  });
});
