import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useAuth } from '@/hooks/useAuth';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), listener: null as null | ((event: string, session: unknown) => void) }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ auth: {
  getSession: auth.getSession,
  onAuthStateChange: (listener: (event: string, session: unknown) => void) => { auth.listener = listener; return { data: { subscription: { unsubscribe: () => {} } } }; },
} }) }));
describe('auth initialization race', () => {
  it('does not restore an older account after a newer auth event', async () => {
    let resolve!: (value: unknown) => void;
    auth.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
    const { result } = renderHook(() => useAuth());
    act(() => auth.listener?.('SIGNED_IN', { user: { id: 'new-account' } }));
    await act(async () => { resolve({ data: { session: { user: { id: 'old-account' } } } }); });
    expect(result.current.user?.id).toBe('new-account');
    expect(result.current.loading).toBe(false);
  });
});
