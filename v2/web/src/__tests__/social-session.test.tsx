import React from 'react';
// External-contact safety has dedicated social-demo-link tests.
vi.mock('@/components/SocialDemoNotice', () => ({ SocialInstagramLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LigarRequests from '@/app/crush/LigarRequests';
import LigarMatches from '@/app/crush/LigarMatches';
import LigarComposer from '@/app/crush/LigarComposer';
import FomoComposer from '@/app/fomo/FomoComposer';

const mock = vi.hoisted(() => ({
  uid: 'account-a', rpc: vi.fn(), upload: vi.fn(),
  listeners: new Set<(event: string, session: { user: { id: string } }) => void>(),
}));
vi.mock('@/components/SessionProvider', () => ({ useSession: () => ({ user: { id: mock.uid }, loading: false }) }));
vi.mock('@/components/ui/confirm-dialog',()=>({useConfirm:()=>async()=>true}));
vi.mock('@/components/ui/toast',()=>({useToast:()=>({info:vi.fn(),success:vi.fn(),error:vi.fn()})}));
vi.mock('@/lib/community-terms-client',()=>({ensureCommunityTerms:async()=>true}));
vi.mock('@/lib/publication-review-client',()=>({requestPublicationReview:async()=> 'pending'}));
vi.mock('@/lib/supabase-client', () => {
  const client = { rpc: (...args:unknown[])=>{const promise=mock.rpc(...args);promise.setHeader=()=>promise;return promise;}, auth: {
    getUser: async () => ({ data: { user: { id: mock.uid } } }),
    getSession: async () => ({data:{session:{user:{id:mock.uid},access_token:'synthetic-session-token'}}}),
    onAuthStateChange: (listener: (event: string, session: { user: { id: string } }) => void) => {
      mock.listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => mock.listeners.delete(listener) } } };
    },
  } };
  return { createClient: () => client };
});
vi.mock('@/app/fomo/uploadMedia', () => ({ uploadFomoMedia: mock.upload, FOMO_BUCKET: 'fomo-media' }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }));

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const switchAccount = (uid: string) => { mock.uid = uid; mock.listeners.forEach(fn => fn('SIGNED_IN', { user: { id: uid } })); };
const person = (id: string) => ({ id, full_name: id, avatar_url: null, age: 21, city: 'Alicante', verified: false, requested_at: '2026-09-05T10:00:00Z' });
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = 'account-a'; mock.listeners.clear();
  URL.createObjectURL = vi.fn(() => 'blob:local-preview'); URL.revokeObjectURL = vi.fn();
});

describe('social account isolation', () => {
  it('stops accepting a batch after an auth event, even before React renders the next account', async () => {
    const pending = deferred<{ data: { matched: boolean; instagram_handle: string }; error: null }>();
    mock.rpc.mockImplementation((name: string) => name === 'request_ig' ? pending.promise : Promise.resolve({ data: [person('first'), person('second')], error: null }));
    const onChanged = vi.fn();
    render(<LigarRequests onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar todas (2)' }));
    await waitFor(() => expect(mock.rpc.mock.calls.filter(c => c[0] === 'request_ig')).toHaveLength(1));
    act(() => switchAccount('account-b'));
    await act(async () => { pending.resolve({ data: { matched: true, instagram_handle: 'private-a' }, error: null }); });
    expect(mock.rpc.mock.calls.filter(c => c[0] === 'request_ig')).toHaveLength(1);
    expect(screen.queryByText('@private-a')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('shares one lock between accepting one and accepting all', async () => {
    const pending = deferred<{ data: { matched: boolean; instagram_handle: null }; error: null }>();
    mock.rpc.mockImplementation((name: string) => name === 'request_ig' ? pending.promise : Promise.resolve({ data: [person('first'), person('second')], error: null }));
    render(<LigarRequests />);
    const all = await screen.findByRole('button', { name: 'Aceptar todas (2)' });
    const one = screen.getAllByRole('button', { name: 'Aceptar' })[0];
    act(() => { fireEvent.click(one); fireEvent.click(all); fireEvent.click(one); });
    await waitFor(() => expect(mock.rpc.mock.calls.filter(c => c[0] === 'request_ig')).toHaveLength(1));
    await act(async () => { pending.resolve({ data: { matched: false, instagram_handle: null }, error: null }); });
    expect(screen.queryByText('¡Match! Ya podéis veros')).toBeNull();
    expect(screen.getByText(/Solicitud enviada/)).toBeTruthy();
  });

  it('never renders private handles from a previous account response', async () => {
    const old = deferred<{ data: unknown[]; error: null }>();
    mock.rpc.mockImplementation(() => mock.uid === 'account-a' ? old.promise : Promise.resolve({ data: [{ ...person('new-person'), instagram_handle: 'new-handle' }], error: null }));
    const ui = render(<LigarMatches />);
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledOnce());
    act(() => { switchAccount('account-b'); ui.rerender(<LigarMatches />); });
    expect(await screen.findByText('@new-handle')).toBeTruthy();
    await act(async () => { old.resolve({ data: [{ ...person('old-person'), instagram_handle: 'old-handle' }], error: null }); });
    expect(screen.queryByText('@old-handle')).toBeNull();
  });

  it('resets a Crush draft on account change and prevents duplicate posting', async () => {
    const pending = deferred<{ data: null; error: null }>();
    mock.rpc.mockReturnValue(pending.promise);
    const onCreated = vi.fn();
    const ui = render(<LigarComposer onCreated={onCreated} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('¿Quién te gusta? Descríbelo/a'), { target: { value: 'draft owned by A' } });
    const publish = screen.getByRole('button', { name: 'Publicar' });
    act(() => { fireEvent.click(publish); fireEvent.click(publish); });
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Público' })).toBeDisabled();
    act(() => { switchAccount('account-b'); ui.rerender(<LigarComposer onCreated={onCreated} onCancel={() => {}} />); });
    expect(screen.getByLabelText('¿Quién te gusta? Descríbelo/a')).toHaveValue('');
    await act(async () => { pending.resolve({ data: null, error: null }); });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('locks FOMO content and anonymity during upload, and cancels publication after unmount', async () => {
    const pending = deferred<{ url: string; type: 'image' }>();
    mock.upload.mockReturnValue(pending.promise);
    const onCreated = vi.fn(); const onCancel = vi.fn();
    const ui = render(<FomoComposer mode="thread" universityId="test-uni" onCreated={onCreated} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('Escribe una publicación'), { target: { value: 'Only for account A' } });
    const fileInput = ui.container.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [new File(['image'], 'campus.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(mock.upload).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Escribe una publicación')).toBeDisabled();
    for (const input of ui.container.querySelectorAll('input')) expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledOnce();
    ui.unmount();
    await act(async () => { pending.resolve({ url: 'https://example.com/test.jpg', type: 'image' }); });
    expect(mock.rpc).not.toHaveBeenCalled(); expect(onCreated).not.toHaveBeenCalled();
  });
});
