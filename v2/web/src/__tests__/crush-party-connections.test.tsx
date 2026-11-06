import React from 'react';
// External-contact safety has dedicated social-demo-link tests.
vi.mock('@/components/SocialDemoNotice', () => ({ SocialInstagramLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PartyConnections from '../app/crush/fiesta/PartyConnections';
const f = vi.hoisted(() => ({ rpc: vi.fn(), current: true }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ rpc: (name: string, args?: unknown) => { const promise = f.rpc(name, args); return Object.assign(promise, { abortSignal: () => promise }); } }) }));
const account = { key: 'a:1', userId: 'account-a', ready: true, request: vi.fn(), isCurrent: () => f.current } as any;
const incoming = { id: '00000000-0000-4000-8000-000000000009', full_name: 'Mar', avatar_url: null, age: 21, requested_at: '2026-09-11T22:00:00Z' };
beforeEach(() => {
  f.current = true; f.rpc.mockReset();
  f.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_ig_incoming_requests') return { data: [incoming], error: null };
    if (name === 'get_ig_matches') return { data: [{ id: 'm1', full_name: 'Leo', avatar_url: null, age: 22, instagram_handle: 'leo.ua', matched_at: '2026-09-11T22:10:00Z' }], error: null };
    if (name === 'request_ig') return { data: { matched: true, instagram_handle: 'mar_ua' }, error: null };
    throw new Error(`unexpected rpc ${name}`);
  });
});
describe('Party connections reuse the canonical Crush request and match RPCs', () => {
  it('lists incoming requests with a badge and reveals the handle after accepting', async () => {
    render(<PartyConnections account={account} />);
    expect(await screen.findByText('Quiere intercambiar Instagram contigo')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Solicitudes/ })).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /Aceptar/ }));
    expect(await screen.findByRole('link', { name: /@mar_ua/ })).toHaveAttribute('href', 'https://www.instagram.com/mar_ua/');
    expect(f.rpc).toHaveBeenCalledWith('request_ig', { p_target: incoming.id });
  });
  it('shows matches with their Instagram link and ignores a malformed handle', async () => {
    f.rpc.mockImplementation(async (name: string) => name === 'get_ig_incoming_requests' ? { data: [], error: null }
      : { data: [{ id: 'm1', full_name: 'Leo', avatar_url: null, age: 22, instagram_handle: 'leo.ua', matched_at: '' }, { id: 'm2', full_name: 'X', avatar_url: null, age: null, instagram_handle: '<script>', matched_at: '' }], error: null });
    render(<PartyConnections account={account} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Matches/ }));
    expect(await screen.findByRole('link', { name: /@leo.ua/ })).toBeInTheDocument();
    expect(screen.queryByText(/<script>/)).toBeNull(); expect(screen.getByText('Sin Instagram visible')).toBeInTheDocument();
  });
  it('does not apply a result after the account changed', async () => {
    render(<PartyConnections account={account} />);
    const accept = await screen.findByRole('button', { name: /Aceptar/ });
    f.current = false; fireEvent.click(accept);
    await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('link', { name: /@mar_ua/ })).toBeNull();
  });
});
