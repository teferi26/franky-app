// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn(), callback: null as null | ((event: string, session: unknown) => void), unsubscribe: vi.fn() }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ auth: { getSession: m.getSession, onAuthStateChange: (cb: typeof m.callback) => { m.callback = cb; return { data: { subscription: { unsubscribe: m.unsubscribe } } }; } }, rpc: m.rpc }) }));
vi.mock('@/components/SessionProvider', () => ({ useSession: () => ({ user: null }) }));
import { suppressSocialContent } from '@/lib/social-moderation-client';
let headers: Record<string, string>, signal: AbortSignal;
beforeEach(() => {
  vi.clearAllMocks(); headers = {};
  m.getSession.mockResolvedValue({ data: { session: { user: { id: 'account-a' }, access_token: 'synthetic-token-a' } }, error: null });
  m.rpc.mockImplementation(() => {
    const query = { setHeader: (key: string, value: string) => { headers[key] = value; return query; }, abortSignal: (value: AbortSignal) => { signal = value; return query; }, then: (resolve: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return query;
  });
});
describe('Persistent social moderation client', () => {
  it('pins the original account token and publishes a refresh only after persistence', async () => {
    const refresh = vi.fn(); window.addEventListener('franky:social-suppressed', refresh);
    await suppressSocialContent('account-a', () => true, 'fomo_thread', 'post-id');
    expect(m.rpc).toHaveBeenCalledWith('report_social_content', { p_kind: 'fomo_thread', p_id: 'post-id', p_reason: 'inapropiado' });
    expect(headers.Authorization).toBe('Bearer synthetic-token-a'); expect(refresh).toHaveBeenCalledOnce();
    expect(m.unsubscribe).toHaveBeenCalledOnce(); window.removeEventListener('franky:social-suppressed', refresh);
  });
  it('refuses another account before sending a mutation', async () => {
    m.getSession.mockResolvedValue({ data: { session: { user: { id: 'account-b' }, access_token: 'synthetic-token-b' } } });
    await expect(suppressSocialContent('account-a', () => true, 'story', 'story-id')).rejects.toThrow('session_required');
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('aborts on sign out even if the user later signs into the same account', async () => {
    m.getSession.mockImplementation(async () => { m.callback?.('SIGNED_OUT', null); m.callback?.('SIGNED_IN', { user: { id: 'account-a' } }); return { data: { session: { user: { id: 'account-a' }, access_token: 'synthetic-new-token' } } }; });
    await expect(suppressSocialContent('account-a', () => true, 'story', 'story-id')).rejects.toThrow('session_changed');
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('hides no content and emits no success when persistence fails', async () => {
    const refresh=vi.fn(); window.addEventListener('franky:social-suppressed', refresh);
    m.rpc.mockImplementation(() => { const query={setHeader:()=>query,abortSignal:()=>query,then:(resolve:(x:unknown)=>unknown)=>Promise.resolve({error:{message:'sensitive database detail'}}).then(resolve)}; return query; });
    await expect(suppressSocialContent('account-a', () => true, 'crush_post', 'post-id', true)).rejects.toThrow('moderation_failed');
    expect(refresh).not.toHaveBeenCalled(); window.removeEventListener('franky:social-suppressed', refresh);
  });
  it('cancels an SDK request if the active account changes during dispatch', async () => {
    const original=m.rpc.getMockImplementation()!;
    m.rpc.mockImplementation((...args) => { const query=original(...args); query.then=(resolve:(x:unknown)=>unknown)=>{m.callback?.('SIGNED_IN',{user:{id:'account-b'}});return Promise.resolve({error:null}).then(resolve);};return query; });
    await expect(suppressSocialContent('account-a', () => true, 'crush_post', 'post-id', true)).rejects.toThrow('session_changed');
    expect(signal.aborted).toBe(true); expect(headers.Authorization).toBe('Bearer synthetic-token-a');
  });
});
