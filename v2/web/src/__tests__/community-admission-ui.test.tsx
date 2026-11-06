import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ current: true, member: false, status: null as string | null, fail: false, otherSession: false, rpc: vi.fn(), header: vi.fn() }));
const isCurrent = () => state.current;
vi.mock('@/components/AccountScope', () => ({ useAccountGuard: () => ({ owner: 'student', isCurrent }), withAccountScope: (Component: React.ComponentType) => Component }));
vi.mock('@/components/SessionProvider', () => ({ useSession: () => ({ user: { id: 'student' }, loading: false }) }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: state.otherSession ? 'another' : 'student' }, access_token: 'pinned-token' } }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
}, rpc: state.rpc }) }));
vi.mock('@/lib/community-image-upload', () => ({ uploadCommunityImage: vi.fn() }));
vi.mock('@/lib/community-terms-client', () => ({ ensureCommunityTerms: vi.fn() }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/lib/social-moderation-client', () => ({ useSocialModerationRefresh: vi.fn() }));
vi.mock('@/components/SocialSafetyActions', () => ({ SocialSafetyActions: () => null }));
vi.mock('next/image', () => ({ default: () => null }));

import Detail from '@/app/comunidades/[id]/client';
import { communityAdmissionAction, communityRpc, type CommunityAdmission } from '@/lib/community-admission-client';

const community = (): CommunityAdmission => ({ id: 'community', name: 'Club de lectura', description: 'Libros y encuentros', kind: 'aficion', image_url: null, is_private: false, created_by: 'owner', is_member: state.member, member_count: 4, join_policy: 'request', admission_id: 'admission', admission_status: state.status });
function builder(data: unknown, error: unknown = null) {
  const promise = Promise.resolve({ data, error });
  return Object.assign(promise, { setHeader: (name: string, value: string) => { state.header(name, value); return promise; }, abortSignal: () => promise });
}
beforeEach(() => {
  state.current = true; state.member = false; state.status = null; state.fail = false; state.otherSession = false; state.header.mockReset(); state.rpc.mockReset();
  state.rpc.mockImplementation((name: string) => {
    if (name === 'get_community_admission') return builder(community());
    if (name === 'get_community_posts') return builder([]);
    if (name === 'request_community_admission') {
      if (state.fail) return builder(null, { message: 'network_failure' });
      state.status = 'requested'; return builder(community());
    }
    return builder(null);
  });
});

describe('community admission UI', () => {
  it('shows a pending request without pretending the applicant is a member', async () => {
    render(<Detail id="community" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar acceso' }));
    expect(await screen.findByRole('button', { name: 'Solicitud pendiente' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument();
    expect(state.header).toHaveBeenCalledWith('Authorization', 'Bearer pinned-token');
  });
  it('keeps the previous membership after a failed operation and offers a retry', async () => {
    state.fail = true; render(<Detail id="community" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Solicitar acceso' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No se ha completado'));
    expect(screen.getByRole('button', { name: 'Solicitar acceso' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument();
  });
  it('offers the recipients explicit invitation accept and decline actions', async () => {
    state.status = 'invited'; render(<Detail id="community" />);
    expect(await screen.findByRole('button', { name: 'Aceptar invitación' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Declinar' })).toBeEnabled();
    expect(communityAdmissionAction(community())).toEqual({ name: 'respond_community_invitation', args: { p_id: 'admission', p_accept: true }, requested: false });
  });
  it('blocks a delayed request when the SDK resolves another account', async () => {
    state.otherSession = true;
    await act(async () => { await expect(communityRpc('join_community', { p_id: 'community' }, 'student', isCurrent)).rejects.toThrow('session_changed'); });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
