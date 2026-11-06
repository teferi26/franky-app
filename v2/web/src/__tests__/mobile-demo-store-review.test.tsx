import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';

afterEach(cleanup);
function fixture(initial = 'demo') {
 let owner = { userId: initial, generation: 1 }, snapshot: any, failRefresh = false, epoch = 1;
 const wrapper = ({ children }: any) => <div>{children}</div>;
 const billing = { getNativeBilling: vi.fn(async () => ({ configured: false, salesEnabled: false, entitlements: [] })), getNativeOffers: vi.fn(), buyNativeOffer: vi.fn(), restoreNativePurchases: vi.fn() };
 const channel = { on: () => channel, subscribe: () => channel }, router = { replace: vi.fn() };
 const bindings: Record<string, unknown> = {
  react: { ...React, default: React }, 'react/jsx-runtime': jsx,
  'react-native': { Text: ({ children, accessibilityRole }: any) => <span role={accessibilityRole}>{children}</span>, View: wrapper, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
  'expo-router': { useRouter: () => router, useSegments: () => ['compras'] },
  '@/lib/useSessionIdentity': { useSessionIdentity: () => ({ uid: owner.userId }) },
  '@/lib/useSessionOwner': { useSessionOwner: () => owner, useOwnerGuard: (expected: any) => () => expected === owner },
  '@/lib/session': { captureSessionIdentity: () => owner, isCurrentSessionIdentity: (expected: any) => expected === owner },
  '@/lib/supabase': { supabase: { channel: () => channel, removeChannel() {} } },
  '@/lib/workspaces': { ACTIVE_WORKSPACE_KEY: 'active', workspaceStorage: { get: async () => null, remove: async () => {} }, workspaceRpc: async (name: string) => {
   if (failRefresh) throw new Error('connection unavailable');
   if (name === 'get_workspace_access') return { enabled: true, can_create: false, demo_epoch: owner.userId === 'demo' ? epoch : null };
   if (name === 'list_my_workspaces') return owner.userId === 'demo' ? [{ id: 'demo-org', demo_cohort_id: 'demo-cohort', status: 'active' }] : [];
   throw new Error('unexpected RPC');
  } },
  '@/components/Screen': { Screen: wrapper },
  '@/components/ui': { Card: wrapper, Pill: ({ label }: any) => <span>{label}</span>, EmptyState: ({ title }: any) => <span>{title}</span>, Btn: ({ label, onPress, disabled }: any) => <button onClick={onPress} disabled={disabled}>{label}</button> },
  '@/lib/native-billing': billing, '@/theme': { F: {}, S: {} }, 'lucide-react-native': { ShoppingBag: wrapper },
 };
 const load = nativeLoader(bindings, { setInterval, clearInterval });
 const provider = load('../mobile/src/components/WorkspaceProvider.tsx');
 bindings['@/components/WorkspaceProvider'] = provider;
 bindings['@/components/DemoStorePurchases'] = load('../mobile/src/components/DemoStorePurchases.tsx');
 const Purchases = load('../mobile/app/compras.tsx').default;
 function Probe() { snapshot = provider.useWorkspace(); return null; }
 function Page() { return <provider.WorkspaceProvider><Probe /><Purchases /></provider.WorkspaceProvider>; }
 return { Page, billing, get state() { return snapshot; }, fail() { failRefresh = true; }, reset() { epoch++; }, change(id: string) { owner = { userId: id, generation: owner.generation + 1 }; } };
}

describe('independent provider integration review of demo billing boundary', () => {
 it('does not fall through to real billing when demo membership refresh fails', async () => {
  const f = fixture(); render(<f.Page />); await screen.findByRole('button', { name: 'Simular compra completada' });
  f.fail(); await act(async () => f.state.refresh());
  expect(f.state.ready).toBe(true); expect(f.state.error).toBeTruthy();
  expect(f.billing.getNativeBilling).not.toHaveBeenCalled();
 });
 it('does not mount a real billing lookup for the next account before its demo membership resolves', async () => {
  const f = fixture('real'), page = render(<f.Page />); await waitFor(() => expect(f.billing.getNativeBilling).toHaveBeenCalledTimes(1));
  f.billing.getNativeBilling.mockClear(); f.change('demo'); page.rerender(<f.Page />);
  await screen.findByRole('button', { name: 'Simular compra completada' });
  expect(f.billing.getNativeBilling).not.toHaveBeenCalled();
 });
 it('resets local simulated receipts when the real provider observes a new server epoch', async () => {
  const f = fixture(); render(<f.Page />); fireEvent.click(await screen.findByRole('button', { name: 'Simular compra completada' }));
  f.reset(); await act(async () => f.state.refresh());
  fireEvent.click(screen.getByRole('button', { name: 'Simular restauración' }));
  expect(screen.getByRole('alert').textContent).toContain('no hay compras anteriores');
  expect(f.billing.getNativeBilling).not.toHaveBeenCalled();
 });
});
