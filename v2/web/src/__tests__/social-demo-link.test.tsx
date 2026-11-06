import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SocialDemoProvider, SocialInstagramLink } from '@/components/SocialDemoNotice';
const f = vi.hoisted(() => ({ rpc: vi.fn(), listener: null as null | ((event: string, session: unknown) => void) }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ rpc: f.rpc, auth: { onAuthStateChange: (callback: typeof f.listener) => { f.listener = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } } }) }));
beforeEach(() => { f.rpc.mockReset(); f.listener = null; });
const login = () => act(() => { f.listener?.('SIGNED_IN', { user: { id: 'synthetic-user' } }); });
const view = () => render(<SocialDemoProvider><SocialInstagramLink href="https://www.instagram.com/synthetic/">Abrir contacto</SocialInstagramLink></SocialDemoProvider>);
it('never exposes a synthetic outgoing URL while loading or after demo confirmation', async () => {
  f.rpc.mockResolvedValue({ data: { demo: true, active: true }, error: null });
  view(); expect(screen.queryByRole('link')).toBeNull(); login();
  expect(await screen.findByText(/Demostración aislada/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir contacto' }));
  expect(screen.getByRole('status')).toHaveTextContent('Contacto ficticio');
  expect(screen.queryByRole('link')).toBeNull();
});
it('restores ordinary links only after a server-confirmed real account', async () => {
  f.rpc.mockResolvedValue({ data: { demo: false }, error: null });
  view(); login();
  expect(await screen.findByRole('link')).toHaveAttribute('href', 'https://www.instagram.com/synthetic/');
});
it('ignores an old real-account response after signing out', async () => {
  let resolve!: (value: unknown) => void;
  f.rpc.mockImplementation(() => new Promise(done => { resolve = done; }));
  view(); login(); await act(async () => { await Promise.resolve(); });
  act(() => { f.listener?.('SIGNED_OUT', null); });
  await act(async () => { resolve({ data: { demo: false }, error: null }); });
  expect(screen.queryByRole('link')).toBeNull();
});
