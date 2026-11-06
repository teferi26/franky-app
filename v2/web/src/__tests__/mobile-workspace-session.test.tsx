import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const org = (id: string) => ({ id, name: id, kind: 'housing', status: 'active', role: 'owner', permissions: ['resource.read', 'content.manage'], demo_cohort_id: null });
function fixture() {
  let owner = { userId: 'a', generation: 1 }, snapshot: any;
  const saved = new Map([['a', 'org-a'], ['b', 'org-b']]);
  const lists = new Map([['a', [org('org-a'), org('org-second')]], ['b', [org('org-b')]]]);
  const rpc = vi.fn(async (name: string, _args: any, session: any, _signal?: AbortSignal): Promise<any> => {
    if (name === 'get_workspace_access') return { enabled: true, can_create: true };
    if (name === 'list_my_workspaces') return lists.get(session.userId) ?? [];
    return { success: true };
  });
  const router = { replace: vi.fn() }, channel = { on: () => channel, subscribe: () => channel };
  const storage = { get: vi.fn(async (session: any) => saved.get(session.userId)), set: vi.fn(async (session: any, _key: string, value: string) => { saved.set(session.userId, value); }), remove: vi.fn(async (session: any) => { saved.delete(session.userId); }) };
  const load = nativeLoader({ react: { ...React, default: React }, 'react/jsx-runtime': jsx,
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'expo-router': { useRouter: () => router, useSegments: () => ['espacios'] },
    '@/lib/useSessionIdentity': { useSessionIdentity: () => ({ uid: owner.userId }) },
    '@/lib/useSessionOwner': { useSessionOwner: () => owner },
    '@/lib/session': { captureSessionIdentity: () => owner, isCurrentSessionIdentity: (value: any) => value === owner },
    '@/lib/supabase': { supabase: { channel: () => channel, removeChannel() {} } },
    '@/lib/workspaces': { ACTIVE_WORKSPACE_KEY: 'active', workspaceRpc: rpc, workspaceStorage: storage },
  }, { setInterval, clearInterval });
  const { WorkspaceProvider, useWorkspace } = load('../mobile/src/components/WorkspaceProvider.tsx');
  function Probe() { snapshot = useWorkspace(); return <span>{snapshot.active?.id ?? 'student'}</span>; }
  const Page = () => <WorkspaceProvider><Probe /></WorkspaceProvider>;
  return { Page, rpc, saved, lists, storage, get state() { return snapshot; }, switchAccount() { owner = { userId: 'b', generation: 2 }; }, restartSession() { owner = { userId: 'a', generation: owner.generation + 1 }; } };
}

describe('native workspace account and permission boundaries', () => {
  it('ignores an old membership response after account changes', async () => {
    const f = fixture(), pending = deferred<any>();
    f.rpc.mockImplementationOnce(async () => pending.promise);
    const page = render(<f.Page />); f.switchAccount(); page.rerender(<f.Page />);
    await waitFor(() => expect(f.state.active?.id).toBe('org-b'));
    await act(async () => pending.resolve({ enabled: true, can_create: true }));
    expect(f.state.active.id).toBe('org-b'); expect(f.state.workspaces.map((item: any) => item.id)).toEqual(['org-b']);
  });
  it('invalidates in-flight content immediately when selecting another workspace', async () => {
    const f = fixture(); render(<f.Page />); await waitFor(() => expect(f.state.active?.id).toBe('org-a'));
    const pending = deferred<any>(); f.rpc.mockImplementationOnce(async () => pending.promise);
    const result = f.state.run('get_workspace_dashboard').then(() => 'unexpected', (error: Error) => error.message);
    const signal = f.rpc.mock.calls.at(-1)?.[3];
    await act(async () => f.state.select('org-second'));
    expect(signal?.aborted).toBe(true); await act(async () => pending.resolve({ secret: 'old org' }));
    expect(await result).toBe('workspace_changed'); expect(f.state.active.id).toBe('org-second');
  });
  it('drops persisted access on revocation and rejects a direct stale selection', async () => {
    const f = fixture(); render(<f.Page />); await waitFor(() => expect(f.state.active?.id).toBe('org-a'));
    f.lists.set('a', []); await act(async () => f.state.refresh());
    expect(f.state.active).toBeNull(); expect(f.storage.remove).toHaveBeenCalled();
    await expect(f.state.select('org-a')).rejects.toThrow('workspace_changed');
  });
  it('rejects a delayed confirmation after logout/login of the same account', async () => {
    const f=fixture(),page=render(<f.Page/>);await waitFor(()=>expect(f.state.active?.id).toBe('org-a'));
    const oldRun=f.state.run,oldGuard=f.state.isCurrent;f.restartSession();page.rerender(<f.Page/>);
    await waitFor(()=>expect(f.state.active?.id).toBe('org-a'));
    expect(oldGuard('org-a')).toBe(false);await expect(oldRun('workspace_housing_action')).rejects.toThrow('workspace_changed');
  });
});
