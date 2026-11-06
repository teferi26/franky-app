import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { VOCATIONAL_MATCHING_VERSION } from '@/lib/vocational-version';
import { motionMock } from './helpers/mobile-motion-mock';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
afterEach(cleanup);

/** The actual native screen/hooks execute with only platform rendering and I/O mocked. */
function fixture(platform = 'ios') {
  let uid: string | null = 'a';
  const listeners = new Set<(event: string, session: any) => void>();
  const rpc = vi.fn(); const push = vi.fn(); const browser = vi.fn().mockResolvedValue({ type: 'opened' });
  const appListeners = new Set<(state: string) => void>();
  const router = { push };
  const supabase = { auth: {
    getUser: vi.fn(async () => ({ data: { user: uid ? { id: uid } : null } })),
    onAuthStateChange(fn: (event: string, session: any) => void) {
      listeners.add(fn); queueMicrotask(() => { if (listeners.has(fn)) fn('INITIAL_SESSION', uid ? { user: { id: uid } } : null); });
      return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } };
    },
  }, rpc };
  const Box = ({ children }: any) => <div>{children}</div>;
  const Btn = ({ label, onPress }: any) => <button onClick={onPress}>{label}</button>;
  const Empty = ({ title, subtitle, cta, onCta }: any) => <div>{title}<p>{subtitle}</p>{cta && <button onClick={onCta}>{cta}</button>}</div>;
  const kit = { Card: Box, IconCircle: () => null, Skeleton: () => null, SkeletonList: () => <p>Cargando</p>, SectionHeader: ({ title }: any) => <h2>{title}</h2>, Pill: ({ label }: any) => <span>{label}</span>, Btn, EmptyState: Empty };
  const mocks: Record<string, any> = {
    react: { ...React, default: React }, 'react/jsx-runtime': jsx,
    'react-native': { Platform: { OS: platform }, View: Box, Text: ({ children }: any) => <span>{children}</span>, AppState: { addEventListener: (_event: string, fn: (state: string) => void) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } } },
    'expo-router': { useRouter: () => router, useFocusEffect: (fn: () => void | (() => void)) => React.useEffect(fn, [fn]) },
    'expo-web-browser': { openBrowserAsync: browser },
    'lucide-react-native': new Proxy({}, { get: () => () => null }),
    '@/components/Screen': { Screen: Box }, '@/components/ui': kit,
    '@/lib/supabase': { supabase, WEB_URL: 'https://franky.es' }, './supabase': { supabase },
    '@/lib/a11y': { MAX_FONT_SCALE: 1.6 },
    '@/theme': { C: {}, S: {}, R: {}, F: { h3: {} }, FONT: {} },
  };
  const loaded = new Map<string, any>();
  function load(file: string): any {
    const path = resolve(file); if (loaded.has(path)) return loaded.get(path);
    const mod = { exports: {} }; loaded.set(path, mod.exports);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports: mod.exports, module: mod, console, Date, require: (id: string) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/lib/')) return load(`../mobile/src/lib/${id.slice(6)}.ts`);
      if(id==='@/components/motion'||id==='./motion')return motionMock; throw new Error('Unexpected import: ' + id);
    } }, { filename: path });
    return mod.exports;
  }
  const Page = load('../mobile/app/test-vocacional.tsx').default;
  const changeAccount = (next: string | null) => { uid = next; for (const fn of [...listeners]) fn('SIGNED_IN', uid ? { user: { id: uid } } : null); };
  return { Page, rpc, push, browser, changeAccount, appState: (state: string) => { for (const fn of appListeners) fn(state); } };
}
const result = (name: string, version?: string) => ({ data: { created_at: '2026-09-06T00:00:00Z', profile_snapshot: version ? { matching_version: version } : {}, top_careers: [{ career_id: '00000000-0000-4000-8000-000000000001', name, score: 70 }] }, error: null });

describe('native vocational result keeps its account and history', () => {
  it('shows the offer campus, modality and reference year with precise decimals', async () => {
    const f = fixture();
    const saved = result('Grado en Enfermería');
    Object.assign(saved.data.top_careers[0], { university_name: 'Universidad de ejemplo', campus: 'Guadalajara', modality: 'Presencial', cut_off: 11.735, cut_off_year: 2026 });
    f.rpc.mockResolvedValue(saved);
    render(<f.Page />);
    await screen.findByText('Guadalajara · Presencial');
    expect(screen.getByText(/corte de referencia 2026: 11,735/)).toBeInTheDocument();
  });
  it('discards account A arriving after B and offers the valid career route', async () => {
    const f = fixture(); const slow = deferred<any>();
    f.rpc.mockReturnValueOnce(slow.promise).mockResolvedValue(result('Carrera B', VOCATIONAL_MATCHING_VERSION));
    render(<f.Page />); await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(1));
    act(() => f.changeAccount('b'));
    await screen.findByText('Carrera B');
    await act(async () => slow.resolve(result('Privado A')));
    expect(screen.queryByText('Privado A')).toBeNull();
    expect(screen.queryByText('Puedes actualizar tus recomendaciones')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver carrera y requisitos' }));
    expect(f.push).toHaveBeenCalledWith('/carrera/00000000-0000-4000-8000-000000000001');
  });
  it('labels an older calculation and explicitly starts a new test', async () => {
    const f = fixture(); f.rpc.mockResolvedValue(result('Carrera antigua'));
    render(<f.Page />); await screen.findByText('Carrera antigua');
    expect(screen.getByText('Puedes actualizar tus recomendaciones')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar mi orientación' }));
    expect(f.browser).toHaveBeenCalledWith('https://franky.es/test-vocacional?redo=1');
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it('hides a loaded result immediately after signing out', async () => {
    const f = fixture(); f.rpc.mockResolvedValue(result('Solo A'));
    render(<f.Page />); await screen.findByText('Solo A');
    act(() => f.changeAccount(null));
    expect(screen.queryByText('Solo A')).toBeNull();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });
  it('shows a retry after an RPC failure and never calls it an empty result', async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({ data: null, error: { code: 'network', message: 'offline' } }).mockResolvedValue(result('Recuperada'));
    render(<f.Page />); fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await screen.findByText('Recuperada'); expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it('refreshes after iOS browser dismissal without a navigation focus event', async () => {
    const f = fixture(); const closing = deferred<any>(); f.browser.mockReturnValue(closing.promise);
    f.rpc.mockResolvedValueOnce(result('Anterior')).mockResolvedValue(result('Nuevo', VOCATIONAL_MATCHING_VERSION));
    render(<f.Page />); await screen.findByText('Anterior');
    fireEvent.click(screen.getByRole('button', { name: 'Repetir el test' }));
    expect(f.rpc).toHaveBeenCalledTimes(1);
    await act(async () => closing.resolve({ type: 'cancel' }));
    await screen.findByText('Nuevo'); expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it('waits for the Android return and deduplicates repeated active events', async () => {
    const f = fixture('android'); f.rpc.mockResolvedValueOnce(result('Anterior')).mockResolvedValue(result('Nuevo'));
    render(<f.Page />); await screen.findByText('Anterior');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Repetir el test' })));
    expect(f.rpc).toHaveBeenCalledTimes(1);
    act(() => { f.appState('background'); f.appState('active'); f.appState('active'); });
    await screen.findByText('Nuevo'); expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it('does not refresh the next account when a browser opened by A closes later', async () => {
    const f = fixture(); const closing = deferred<any>(); f.browser.mockReturnValue(closing.promise);
    f.rpc.mockResolvedValueOnce(result('Anterior A')).mockResolvedValue(result('Cuenta B'));
    render(<f.Page />); await screen.findByText('Anterior A');
    fireEvent.click(screen.getByRole('button', { name: 'Repetir el test' }));
    act(() => f.changeAccount('b')); await screen.findByText('Cuenta B');
    await act(async () => closing.resolve({ type: 'cancel' }));
    expect(f.rpc).toHaveBeenCalledTimes(2); expect(screen.getByText('Cuenta B')).toBeInTheDocument();
  });
});
