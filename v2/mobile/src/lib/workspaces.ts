import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAccountStorage } from './account-storage';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import { supabase } from './supabase';
import { normalizeImage } from './media';
export * from './workspace-model';

export const workspaceStorage = createAccountStorage(AsyncStorage, {
  capture: captureSessionIdentity, current: isCurrentSessionIdentity,
});
export const ACTIVE_WORKSPACE_KEY = 'franky.workspace.active.v1';

/** Used at sign-in before the student tour; stale local IDs confer no access. */
export async function rememberedWorkspaceDestination(owner: SessionIdentity | null): Promise<'/(workspace)/resumen' | null> {
  try {
    const id = await workspaceStorage.get(owner, ACTIVE_WORKSPACE_KEY);
    if (!id) return null;
    const [access, list] = await Promise.all([
      workspaceRpc<{ enabled: boolean }>('get_workspace_access', {}, owner),
      workspaceRpc<import('./workspace-model').Workspace[]>('list_my_workspaces', {}, owner),
    ]);
    const workspace = list.find(item => item.id === id && item.status === 'active');
    return workspace && (access.enabled || workspace.demo_cohort_id) ? '/(workspace)/resumen' : null;
  } catch { return null; }
}

/** No service credential or owner filter: each operation is authorized by the server. */
export async function workspaceRpc<T>(name: string, args: Record<string, unknown>, owner: SessionIdentity | null, signal?: AbortSignal): Promise<T> {
  return withOwnedRequest(owner, async request => {
    const { data, error } = await request.query(supabase.rpc(name, args));
    request.check();
    if (error) throw error;
    return data as T;
  }, signal);
}

export async function uploadWorkspaceImage(organizationId: string, asset: { uri: string; width?: number | null; mimeType?: string | null }, owner: SessionIdentity | null, signal?: AbortSignal): Promise<string> {
  return withOwnedRequest(owner, async request => {
    const normalized = await normalizeImage(asset.uri, asset.width, 1440, asset.mimeType ?? 'image/jpeg');
    request.check();
    const response = await fetch(normalized.uri, { signal: request.signal });
    const buffer = await response.arrayBuffer();
    request.check();
    if (buffer.byteLength > 8 * 1024 * 1024) throw new Error('La foto supera los 8 MB.');
    const path = `${organizationId}/${request.owner.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    // Private bucket: demo photos never enter public avatar or catalogue storage.
    const { error } = await supabase.storage.from('workspace-media').upload(path, buffer, {
      contentType: normalized.mime, upsert: false, headers: { Authorization: request.authorization },
    });
    request.check();
    if (error) throw error;
    return path;
  }, signal);
}

export async function workspaceImageUrls(paths: string[], owner: SessionIdentity | null, signal?: AbortSignal): Promise<string[]> {
  return withOwnedRequest(owner, async request => {
    if (!paths.length) return [];
    // Short lived private previews; permissions are reevaluated when issued.
    const { data, error } = await supabase.storage.from('workspace-media').createSignedUrls(paths, 120);
    request.check();
    if (error) throw error;
    return (data ?? []).map(item => item.signedUrl ?? '');
  }, signal);
}
