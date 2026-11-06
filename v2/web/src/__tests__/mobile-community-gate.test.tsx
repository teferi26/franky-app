import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { isCommunityRoute } from '../../../mobile/src/lib/community-terms-state';
function fixture() {
  let owner: any = { userId: 'A', generation: 1 }, path = 'feed';
  const current = (value: any) => value === owner;
  const rpc = vi.fn(async (name: string, _args?: unknown) => ({ data: name === 'community_terms_accepted' ? false : true, error: null as any }));
  const exit = vi.fn(async () => true), push = vi.fn(), replace = vi.fn();
  const cached = new Set<string>();
  const Box = ({ children }: any) => <div>{children}</div>;
  const mocks: Record<string, any> = {
    react: React, 'react/jsx-runtime': jsx,
    'react-native': { ActivityIndicator: () => <p>Comprobando</p>, Linking: { openURL: vi.fn() }, Modal: ({ visible, children }: any) => visible ? <div role="dialog">{children}</div> : null, ScrollView: Box, Text: Box },
    'expo-router': { useRouter: () => ({ push, replace }), useSegments: () => [path] },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'lucide-react-native': { ShieldCheck: () => null, Square: () => null, CheckSquare: () => null },
    './ui': { Btn: ({ label, disabled, onPress }: any) => <button disabled={disabled} onClick={onPress}>{label}</button>, Tap: ({ children, onPress, accessibilityRole, accessibilityLabel, accessibilityState }: any) => <button role={accessibilityRole} aria-label={accessibilityLabel} aria-checked={accessibilityState?.checked} onClick={onPress}>{children}</button> },
    '@/lib/supabase': { supabase: { rpc }, beginAuthAttempt: () => ({ run: vi.fn() }) },
    '@/lib/community-terms': { COMMUNITY_TERMS_VERSION: '2026-09-10', hasCachedCommunityAcceptance: (id: string) => cached.has(id), loadCachedCommunityAcceptance: async (id: string) => cached.has(id), cacheCommunityAcceptance: async (id: string, accepted: boolean) => { if (accepted) cached.add(id); else cached.delete(id); } },
    '@/lib/community-terms-state': { isCommunityRoute },
    '@/lib/useSessionOwner': { useSessionOwner: () => owner, useOwnerGuard: (value: any) => React.useCallback(() => current(value), [value]) },
    '@/lib/session': { isCurrentSessionIdentity: current },
    '@/lib/owned-request': { withOwnedRequest: async (value: any, run: any) => run({ query: (q: any) => q, check: () => { if (!current(value)) throw Error('changed'); } }) },
    '@/lib/session-exit': { createSessionExit: () => exit },
    '@/lib/push': {}, '@/lib/local-notifications': {}, '@/lib/offline-queue': {},
    '@/lib/a11y': { MAX_FONT_SCALE: 1.5 }, '@/theme': { C: {}, F: {}, S: {} },
  };
  const mod = { exports: {} as any };
  const code = ts.transpileModule(readFileSync(resolve('../mobile/src/components/CommunityTermsGate.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { module: mod, exports: mod.exports, console, require: (name: string) => { if (!(name in mocks)) throw Error(name); return mocks[name]; } });
  return { Gate: mod.exports.CommunityTermsGate, rpc, exit, push, replace, cached, setOwner: (id: string) => { owner = { userId: id, generation: owner.generation + 1 }; }, setPath: (value: string) => { path = value; } };
}
describe('Mandatory native community agreement', () => {
  it('does not flash policy content while an already accepted account is checking', async () => {
    const f = fixture(); f.cached.add('A'); f.rpc.mockReturnValue(new Promise(() => {}));
    render(<f.Gate />); await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Una comunidad segura')).toBeNull();
  });
  it.each(['explorar', 'pisos', 'facturas', 'pago-retorno', 'universidades'])('does not block %s during a consent outage', async path => {
    const f = fixture(); f.setPath(path); f.rpc.mockRejectedValue(new Error('offline'));
    render(<f.Gate />); await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps unaccepted social access gated but lets the person continue exploring during an outage', async () => {
    const f = fixture(); f.rpc.mockRejectedValue(new Error('offline')); render(<f.Gate />);
    await screen.findByText('No pudimos comprobar las normas. Revisa tu conexión e inténtalo de nuevo.');
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar explorando Franky' }));
    expect(f.replace).toHaveBeenCalledWith('/(tabs)/explorar');
  });
  it('requires an explicit check and confirmed server acceptance before opening content', async () => {
    const f = fixture(); render(<f.Gate />);
    const accept = await screen.findByRole('button', { name: 'Aceptar y continuar' });
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(accept).toBeEnabled(); fireEvent.click(accept);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(f.rpc).toHaveBeenCalledWith('accept_community_terms', { p_version: '2026-09-10' });
  });
  it('keeps content blocked if acceptance cannot be saved, and permits retry', async () => {
    const f = fixture(); f.rpc.mockImplementation(async name => ({ data: false, error: name === 'accept_community_terms' ? new Error('offline') : null }));
    render(<f.Gate />); fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
    await screen.findByText('No se ha guardado la aceptación. Inténtalo de nuevo.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('does not reuse A acceptance or its checkbox when the device changes to B', async () => {
    const f = fixture(); const view = render(<f.Gate />);
    fireEvent.click(await screen.findByRole('checkbox'));
    act(() => { f.setOwner('B'); view.rerender(<f.Gate />); });
    await waitFor(() => expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByRole('button', { name: 'Aceptar y continuar' })).toBeDisabled();
  });
  it('legal text and account deletion remain accessible without agreeing', async () => {
    const f = fixture(); f.setPath('eliminar-cuenta'); render(<f.Gate />);
    await act(async () => {}); expect(screen.queryByRole('dialog')).toBeNull();
    expect(f.rpc).not.toHaveBeenCalledWith('accept_community_terms', expect.anything());
  });
});
