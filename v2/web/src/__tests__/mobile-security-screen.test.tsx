import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { motionMock } from './helpers/mobile-motion-mock';

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() {
  let owner: string | null = 'a'; const listeners = new Set<(event: string, session: any) => void>();
  const supabase = { auth: { onAuthStateChange: (fn: (event: string, session: any) => void) => { listeners.add(fn); fn('INITIAL_SESSION', owner ? { user: { id: owner } } : null); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; } } };
  const api = { getCuentaInfo: vi.fn(async (): Promise<any> => ({ email: `${owner}@example.invalid`, tienePassword: true })), getAal: vi.fn(async () => 'aal2'), listVerifiedFactors: vi.fn(async (): Promise<any[]> => []), empezarAltaTotp: vi.fn(async () => ({ factorId: 'new-a', uri: 'otpauth://synthetic-a', secret: 'PRIVATE-KEY-A' })), confirmarAltaTotp: vi.fn(async () => {}), cancelarAltaTotp: vi.fn(async () => {}), elevateWithTotp: vi.fn(async () => {}), cambiarPassword: vi.fn(async () => {}), quitarFactor: vi.fn(async () => {}), validarPassword: () => null, PASSWORD_MIN: 12 };
  const Box = ({ children }: any) => <div>{children}</div>, Btn = ({ label, onPress, busy, disabled }: any) => <button onClick={onPress} disabled={busy || disabled}>{label}</button>;
  const alert = vi.fn();
  const mocks: Record<string, any> = { react: { ...React, default: React }, 'react/jsx-runtime': jsx, 'react-native': { View: Box, Text: Box, TextInput: ({ value, onChangeText, accessibilityLabel, placeholder }: any) => <input aria-label={accessibilityLabel} placeholder={placeholder} value={value} onChange={event => onChangeText(event.target.value)} />, Alert: { alert }, Clipboard: { setString: vi.fn() } }, 'expo-haptics': { notificationAsync: async () => {}, NotificationFeedbackType: { Success: 'success', Warning: 'warning' } }, 'react-native-qrcode-svg': { default: () => null }, 'lucide-react-native': new Proxy({}, { get: () => () => null }), '@/components/Screen': { Screen: Box }, '@/components/ui': { Btn, Card: Box, IconCircle: () => null, EmptyState: ({ title, cta, onCta }: any) => <div>{title}<Btn label={cta} onPress={onCta} /></div>, SkeletonList: () => <div>Cargando cuenta</div>, Tap: ({ children, onPress }: any) => <button onClick={onPress}>{children}</button>, Pill: ({ label }: any) => <span>{label}</span> }, '@/lib/toast': { toast: vi.fn(), toastError: vi.fn() }, '@/lib/a11y': { MAX_FONT_SCALE: 1.6 }, '@/lib/admin': api, '@/lib/security': api, '@/theme': { C: {}, S: {}, F: {}, R: {}, FONT: {} }, '@/lib/supabase': { supabase }, './supabase': { supabase } };
  function load(file: string): any { const path = resolve(file), mod = { exports: {} }; const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; runInNewContext(source, { exports: mod.exports, module: mod, console, require: (id: string) => { if (id in mocks) return mocks[id]; if (id.startsWith('@/lib/')) return load(`../mobile/src/lib/${id.slice(6)}.ts`); if(id==='@/components/motion'||id==='./motion')return motionMock; throw Error(id); } }, { filename: path }); return mod.exports; }
  mocks['./session'] = load('../mobile/src/lib/session-cache.ts').createSessionCache(supabase.auth);
  return { ...api, alert, Page: load('../mobile/app/seguridad.tsx').default, switchTo(id: string | null) { owner = id; for (const fn of listeners) fn(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null); } };
}

describe('Native security settings do not carry secrets or actions into another account', () => {
  it('clears secrets after a batched logout and login of the same UID', async () => {
    const f = fixture(); render(<f.Page />); const field = await screen.findByRole('textbox', { name: 'Contraseña actual' }); fireEvent.change(field, { target: { value: 'previous-session-secret' } });
    act(() => { f.switchTo(null); f.switchTo('a'); }); await screen.findByRole('textbox', { name: 'Contraseña actual' }); expect(screen.queryByDisplayValue('previous-session-secret')).toBeNull();
  });
  it('clears password input when the account changes', async () => {
    const f = fixture(); render(<f.Page />); const field = await screen.findByRole('textbox', { name: 'Contraseña actual' }); fireEvent.change(field, { target: { value: 'private-password-a' } });
    act(() => f.switchTo('b')); await screen.findByRole('textbox', { name: 'Contraseña actual' }); expect(screen.queryByDisplayValue('private-password-a')).toBeNull();
  });
  it('does not display an enrollment secret returned after logout', async () => {
    const f = fixture(), pending = deferred<any>(); f.empezarAltaTotp.mockReturnValueOnce(pending.promise); render(<f.Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Activar verificación/ })); act(() => f.switchTo(null));
    await act(async () => pending.resolve({ factorId: 'old', uri: 'otpauth://old', secret: 'PRIVATE-KEY-A' })); expect(screen.queryByText('PRIVATE-KEY-A')).toBeNull(); expect(screen.getByText(/Inicia sesión para revisar/)).toBeInTheDocument();
  });
  it('does not execute a destructive confirmation belonging to the previous account', async () => {
    const f = fixture(); f.listVerifiedFactors.mockResolvedValue([{ id: 'factor-a', name: 'Factor A' }]); render(<f.Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Desactivar/ })); expect(f.alert).toHaveBeenCalled(); const confirmation = f.alert.mock.calls[0][2].find((item: any) => item.style === 'destructive');
    act(() => f.switchTo('b')); act(() => confirmation.onPress()); expect(f.quitarFactor).not.toHaveBeenCalled();
  });
});
