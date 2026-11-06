import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { motionMock } from './helpers/mobile-motion-mock';

const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };

function fixture() {
  let owner: string | null = 'a';
  const listeners = new Set<(event: string, session: any) => void>();
  const auth = { onAuthStateChange: (fn: (event: string, session: any) => void) => { listeners.add(fn); fn('INITIAL_SESSION', owner ? { user: { id: owner } } : null); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; } };
  class MfaRequiredError extends Error {}
  const api = {
    getStaffRole: vi.fn(async (): Promise<string | null> => 'analyst'), getAal: vi.fn(async () => 'aal2'), listVerifiedFactors: vi.fn(async () => [{ id: 'factor-a' }]),
    elevateWithTotp: vi.fn(async () => {}), empezarAltaTotp: vi.fn(async () => ({ factorId: 'new', uri: 'otpauth://fixture', secret: 'TEST-SECRET' })), confirmarAltaTotp: vi.fn(async () => {}), cancelarAltaTotp: vi.fn(async () => {}), MfaRequiredError,
    getKpis: vi.fn(async (_days: number): Promise<any> => ({ total_users: owner === 'a' ? 111 : 222, pending_reports: 3, mrr_estimate: 42 })),
    getEngagement: vi.fn(async () => ({ engagement_funnel: {} })), getDemografia: vi.fn(async () => ({ total: 5 })), getContenido: vi.fn(async () => ({})), getCrecimiento: vi.fn(async () => ({})), getSeguridad: vi.fn(async () => ({})),
    getMonetizacion: vi.fn(async () => ({ mrr_normalized: 42, active_subscriptions: {} })), getTopUniversidades: vi.fn(async () => []), getTopCiudades: vi.fn(async () => []), getTopCarreras: vi.fn(async () => []), getAltasDiarias: vi.fn(async () => []),
    getProductAnalytics: vi.fn(async () => ({ current_careers: [{ name: `Carrera privada ${owner}`, user_count: 9 }], screens: [], coverage: { users: 0, views: 0 } })),
  };
  const Box = ({ children }: any) => <div>{children}</div>;
  const Tap = ({ children, onPress, accessibilityLabel, disabled }: any) => <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>{children}</button>;
  const Btn = ({ label, onPress, busy, disabled }: any) => <button disabled={busy || disabled} onClick={onPress}>{label}</button>;
  const mocks: Record<string, any> = {
    react: { ...React, default: React }, 'react/jsx-runtime': jsx,
    'react-native': { View: Box, Text: Box, ScrollView: Box, useWindowDimensions: () => ({ width: 390 }), ActivityIndicator: ({ accessibilityLabel }: any) => <div role="status">{accessibilityLabel ?? 'Cargando indicadores'}</div>, TextInput: ({ value, onChangeText }: any) => <input aria-label="Código de verificación" value={value} onChange={e => onChangeText(e.target.value)} />, Alert: { alert: vi.fn() }, Clipboard: { setString: vi.fn() } },
    'expo-router': { useRouter: () => ({ back: vi.fn() }) }, 'react-native-qrcode-svg': { default: () => null }, 'lucide-react-native': new Proxy({}, { get: () => () => null }),
    '@/theme': { C: {}, S: {}, F: {}, R: {}, FONT: { display: 'display', heading: 'heading', semibold: 'semibold', medium: 'medium' }, SHADOW: { card: {}, float: {}, glow: {} } }, '@/lib/admin': api, '@/lib/supabase': { supabase: { auth } },
    '@/components/Screen': { Header: ({ title }: any) => <h1>{title}</h1>, Screen: ({ children, onRefresh, refreshing }: any) => <div><button onClick={onRefresh} data-refreshing={!!refreshing}>Actualizar panel</button>{children}</div> },
    '@/components/ui': { Tap, Btn, SkeletonList: () => <div role="status">Cargando indicadores</div>, EmptyState: ({ title, subtitle, cta, onCta }: any) => <div>{title}{subtitle}<Btn label={cta} onPress={onCta} /></div> }, '@/components/AdminGestion': { AdminGestion: () => <div>Gestión</div> },
  };
  const cache = new Map<string, any>();
  const load = (file: string): any => {
    const path = resolve(file); if (cache.has(path)) return cache.get(path);
    const mod = { exports: {} }; cache.set(path, mod.exports);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports: mod.exports, module: mod, console, Date, setTimeout, clearTimeout, require: (name: string) => {
      if (name in mocks) return mocks[name];
      if (name === './supabase') return mocks['@/lib/supabase'];
      if (name.startsWith('@/lib/')) return load(`../mobile/src/lib/${name.slice(6)}.ts`);
      if (name === '@/components/admin-ui') return load('../mobile/src/components/admin-ui.tsx');
      if (name.startsWith('.')) return load(resolve(dirname(path), `${name}.ts`));
      if(name==='@/components/motion'||name==='./motion')return motionMock; throw Error(name);
    } }, { filename: path }); return mod.exports;
  };
  mocks['@/lib/supabase'].sessionCache = load('../mobile/src/lib/session-cache.ts').createSessionCache(auth);
  return { ...api, Page: load('../mobile/app/admin.tsx').default, switchTo: (id: string | null) => { owner = id; for (const listener of listeners) listener(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null); } };
}

describe('Native administrator screen isolates account and reporting period', () => {
  it('removes the old account immediately and ignores its delayed analytics', async () => {
    const f = fixture(), pending = deferred<any>(); f.getKpis.mockReturnValueOnce(pending.promise);
    render(<f.Page />); await waitFor(() => expect(f.getKpis).toHaveBeenCalled());
    act(() => f.switchTo('b')); await screen.findByText('222');
    await act(async () => pending.resolve({ total_users: 999 }));
    expect(screen.queryByText('999')).toBeNull(); expect(screen.getByText('222')).toBeInTheDocument();
    act(() => f.switchTo(null)); expect(screen.queryByText('222')).toBeNull(); expect(screen.getByText(/Inicia sesión para consultar/)).toBeInTheDocument();
  });
  it('does not paint a previous period while loading a different one', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('111');
    const pending = deferred<any>(); f.getKpis.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 días' }));
    expect(screen.queryByText('111')).toBeNull(); expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => pending.resolve({ total_users: 777 })); expect(screen.getByText('777')).toBeInTheDocument();
  });
  it('keeps the latest range when responses finish out of order', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('111');
    const first = deferred<any>(), second = deferred<any>(); f.getKpis.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 días' })); fireEvent.click(screen.getByRole('button', { name: 'Últimos 90 días' }));
    await act(async () => second.resolve({ total_users: 990 })); await act(async () => first.resolve({ total_users: 770 }));
    expect(screen.queryByText('770')).toBeNull(); expect(screen.getByText('990')).toBeInTheDocument();
  });
  it('does not cancel an in-flight load when the already-selected period is tapped', async () => {
    const f = fixture(), pending = deferred<any>(); f.getKpis.mockReturnValueOnce(pending.promise); render(<f.Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Últimos 30 días' }));
    await act(async () => pending.resolve({ total_users: 303 })); expect(screen.getByText('303')).toBeInTheDocument();
  });
  it('invalidates an old access check after switching accounts', async () => {
    const f = fixture(), pending = deferred<string | null>(); f.getStaffRole.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(null);
    render(<f.Page />); await waitFor(() => expect(f.getStaffRole).toHaveBeenCalled()); act(() => f.switchTo('b'));
    await screen.findByText('Esta sección no está disponible para tu cuenta.'); await act(async () => pending.resolve('admin'));
    expect(screen.queryByText('Gestión')).toBeNull(); expect(f.getKpis).not.toHaveBeenCalled();
  });
  it('shows current study declarations and explains their scope', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('111'); fireEvent.click(screen.getByRole('button', { name: 'Académico' }));
    expect(screen.getByText('Carrera privada a')).toBeInTheDocument(); expect(screen.getByText('Carreras deseadas')).toBeInTheDocument(); expect(screen.getByText(/No incluye recomendaciones del test ni carreras deseadas/)).toBeInTheDocument();
  });
  it('reloads after MFA expires instead of reusing the prior range cache', async () => {
    const f = fixture(); f.getKpis.mockRejectedValueOnce(new f.MfaRequiredError()); f.getAal.mockResolvedValue('aal1'); render(<f.Page />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Código de verificación' }), { target: { value: '123456' } }); fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(f.getKpis).toHaveBeenCalledTimes(1));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Código de verificación' }), { target: { value: '654321' } }); fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByText('111'); expect(f.getKpis).toHaveBeenCalledTimes(2);
  });
  it('looks up the existing factor when an initially elevated session expires', async () => {
    const f = fixture(); f.getKpis.mockRejectedValueOnce(new f.MfaRequiredError()); render(<f.Page />);
    await screen.findByText('Introduce tu código'); expect(f.listVerifiedFactors).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Activar segundo factor aquí' })).toBeNull();
  });
});
