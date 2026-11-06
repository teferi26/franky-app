import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import RoomieConnections from '@/app/roomie-match/components/RoomieConnections';

const mock = vi.hoisted(() => ({
  uid: 'account-a',
  listeners: new Set<(event: string, session: { user: { id: string } } | null) => void>(),
  rpc: vi.fn(), push: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mock.uid }, loading: false }) }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({
  rpc: mock.rpc,
  auth: {
    onAuthStateChange: (listener: (event: string, session: { user: { id: string } } | null) => void) => {
      mock.listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => mock.listeners.delete(listener) } } };
    },
    getUser: async () => ({ data: { user: { id: mock.uid } } }),
  },
}) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: mock.success, error: mock.error }) }));

const person = (id: string) => ({ id, full_name: id, avatar_url: null, city: 'Alicante', budget_min: 300, budget_max: 500 });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const switchAccount = (uid: string) => { mock.uid = uid; mock.listeners.forEach(fn => fn('SIGNED_IN', { user: { id: uid } })); };
beforeEach(() => { vi.clearAllMocks(); mock.uid = 'account-a'; mock.listeners.clear(); });

describe('Roomie private connections', () => {
  it('discards a delayed page from the previous account', async () => {
    const old = deferred<{ data: ReturnType<typeof person>[]; error: null }>();
    mock.rpc.mockImplementation(() => mock.uid === 'account-a' ? old.promise : Promise.resolve({ data: [person('new-account-person')], error: null }));
    const ui = render(<RoomieConnections />);
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledOnce());
    act(() => { switchAccount('account-b'); ui.rerender(<RoomieConnections />); });
    expect(await screen.findByText('new-account-person')).toBeTruthy();
    await act(async () => { old.resolve({ data: [person('old-account-person')], error: null }); });
    expect(screen.queryByText('old-account-person')).toBeNull();
    expect(screen.getByText('new-account-person')).toBeTruthy();
  });

  it('serializes like clicks and does not promise a chat when privacy prevents it', async () => {
    const saved = deferred<{ data: { match: boolean; conversation_id: null }; error: null }>();
    mock.rpc.mockImplementation((name: string) => name === 'process_swipe_action' ? saved.promise : Promise.resolve({ data: [person('Future roomie')], error: null }));
    render(<RoomieConnections initialTab="received" />);
    const button = await screen.findByRole('button', { name: 'También me encaja' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await waitFor(() => expect(mock.rpc.mock.calls.filter(call => call[0] === 'process_swipe_action')).toHaveLength(1));
    await act(async () => { saved.resolve({ data: { match: true, conversation_id: null }, error: null }); });
    expect(mock.success).toHaveBeenCalledWith('¡Os encajáis!', expect.stringContaining('privacidad'));
    expect(mock.push).not.toHaveBeenCalled();
  });

  it('does not navigate when a pending chat belongs to an earlier account', async () => {
    const chat = deferred<{ data: string; error: null }>();
    mock.rpc.mockImplementation((name: string) => name === 'get_or_create_direct_chat' ? chat.promise : Promise.resolve({ data: [person('Future roomie')], error: null }));
    const ui = render(<RoomieConnections />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir conversación' }));
    await waitFor(() => expect(mock.rpc.mock.calls.some(call => call[0] === 'get_or_create_direct_chat')).toBe(true));
    act(() => { switchAccount('account-b'); ui.rerender(<RoomieConnections />); });
    await act(async () => { chat.resolve({ data: 'old-account-chat', error: null }); });
    expect(mock.push).not.toHaveBeenCalled();
  });
});
