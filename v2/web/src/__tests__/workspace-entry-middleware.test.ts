// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: auth.getUser } }),
}));
beforeEach(() => {
  auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
});

it.each(['/mis-visitas', '/devoluciones', '/novedades-ciudad?ciudad=Alicante'])
  ('preserves the protected destination when opening %s without a session', async path => {
    const response = await middleware(new NextRequest(`https://franky.es${path}`));
    expect(response.status).toBe(307);
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe('/login');
    expect(target.searchParams.get('next')).toBe(path);
  });
