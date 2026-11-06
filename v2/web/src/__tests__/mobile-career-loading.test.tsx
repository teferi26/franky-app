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
const ok = (data: unknown) => ({ data, error: null });
const career = (values = {}) => ({ id: 'career-a', name: 'Carrera A', profile_id: 'profile-a', branch: 'ingenieria', duration: 4, credits: 240, universities: { name: 'Universidad A' }, ...values });
const profile = (values = {}) => ({ id: 'profile-a', overview: 'Guía del programa A', ...values });

function fixture() {
  let owner: string | null = 'account-a';
  type TestSession = { user: { id: string } } | null;
  let authCallback: ((event: string, session: TestSession) => void) | null = null;
  const api = { getUser: vi.fn(async () => ({ data: { user: owner ? { id: owner } : null }, error: null })), career: vi.fn(async () => ok(career())), profile: vi.fn(async () => ok(profile())), summary: vi.fn(async () => ok({ avg_rating: 4, ratings_count: 2 })), mine: vi.fn(async () => ok({ rating: 4 })), upsert: vi.fn(async () => ok(null)) };
  const Box = ({ children }: any) => <div>{children}</div>;
  const Text = ({ children, accessibilityRole, accessibilityLabel }: any) => <span role={accessibilityRole === 'header' ? 'heading' : accessibilityRole} aria-label={accessibilityLabel}>{children}</span>;
  const Tap = ({ children, onPress, accessibilityLabel, accessibilityRole, disabled }: any) => <div role={accessibilityRole ?? 'button'} aria-label={accessibilityLabel} aria-disabled={!!disabled} onClick={() => { if (!disabled) onPress?.(); }}>{children}</div>;
  const Btn = ({ label, onPress, busy, disabled }: any) => <button disabled={busy || disabled} onClick={onPress}>{label}</button>;
  const native = { View: Box, Text, KeyboardAvoidingView: Box, TextInput: () => null, ActivityIndicator: () => null, Platform: { OS: 'ios' }, ScrollView: ({ children, refreshControl }: any) => <div>{refreshControl}{children}</div>, RefreshControl: ({ onRefresh, refreshing }: any) => <button onClick={onRefresh} aria-label="Actualizar" data-refreshing={!!refreshing}>Actualizar</button>, Alert: { alert: vi.fn() }, Linking: { openURL: vi.fn(async () => {}) }, LayoutAnimation: { configureNext: vi.fn(), Presets: { easeInEaseOut: {} } } };
  const supabase = { from: (table: string) => { const q: any = { select: () => q, eq: () => q, is: () => q, order: () => q, limit: async () => ok([]), maybeSingle: () => table === 'careers' ? api.career() : table === 'career_profiles' ? api.profile() : api.mine(), upsert: api.upsert }; return q; }, rpc: api.summary, auth: { getUser: api.getUser, onAuthStateChange: (callback: (event: string, session: TestSession) => void) => { authCallback = callback; callback('INITIAL_SESSION', owner ? { user: { id: owner } } : null); return { data: { subscription: { unsubscribe() { if (authCallback === callback) authCallback = null; } } } }; } } };
  const mocks: Record<string, any> = {
    '@/lib/academic-analytics': { trackAcademicConsultation: vi.fn(async () => {}) },
    react: { ...React, default: React }, 'react/jsx-runtime': jsx, 'react-native': native,
    'expo-router': { useLocalSearchParams: () => ({ id: 'career-a' }), useRouter: () => ({ push: vi.fn() }) },
    'expo-haptics': { notificationAsync: async () => {}, NotificationFeedbackType: { Success: 'success' } },
    'lucide-react-native': new Proxy({}, { get: () => () => null }), 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/components/Screen': { Header: () => null }, '@/components/ui': { Tap, Btn, Avatar: () => null, Skeleton: () => null, SkeletonList: () => null, IconCircle: () => null, Pill: ({ label }: any) => <span>{label}</span>, EmptyState: ({ title, cta, onCta }: any) => <div>{title}<Btn label={cta} onPress={onCta} /></div> },
    '@/lib/supabase': { supabase }, '@/lib/format': { branchLabel: () => 'Ingeniería', timeAgo: () => 'Ahora' }, '@/lib/toast': { toastError: vi.fn() }, '@/lib/a11y': { MAX_FONT_SCALE: 1.6 }, '@/theme': { C: {}, S: {}, F: {}, R: {}, FONT: {} },
  };
  function load(file: string): any {
    const path = resolve(file), mod = { exports: {} };
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { module: mod, exports: mod.exports, console, Date, setTimeout, clearTimeout, require: (name: string) => {
      if (name in mocks) return mocks[name];
      if (name === './supabase') return { supabase };
      if (name.startsWith('@/lib/')) return load(`../mobile/src/lib/${name.slice(6)}.ts`);
      if (name.startsWith('.')) return load(resolve(dirname(path), `${name}.ts`));
      if(name==='@/components/motion'||name==='./motion')return motionMock; if(name==='@/components/CutOffYearToggle')return { CutOffYearToggle: () => null }; throw Error(name);
    } }, { filename: path });
    return mod.exports;
  }
  return { ...api, Page: load('../mobile/app/carrera/[id].tsx').default, setOwner: (value: string | null) => { owner = value; authCallback?.(value ? 'SIGNED_IN' : 'SIGNED_OUT', value ? { user: { id: value } } : null); } };
}

describe('Native career detail recovery and request ordering', () => {
  it('preserves the displayed career when a refresh returns a database error', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Guía del programa A');
    f.career.mockResolvedValueOnce({ data: null, error: { message: 'offline' } } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await screen.findByText('No se ha podido actualizar la ficha. Conservamos los datos que ya veías.');
    expect(screen.getByText('Carrera A')).toBeInTheDocument();
    expect(screen.getByText('Guía del programa A')).toBeInTheDocument();
  });
  it('retries an initial failure and loads the real page', async () => {
    const f = fixture(); f.career.mockResolvedValueOnce({ data: null, error: { message: 'offline' } } as never); render(<f.Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' })); await screen.findByText('Guía del programa A');
  });
  it('removes the old deep guide when the refreshed career no longer links one', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Guía del programa A');
    f.career.mockResolvedValueOnce(ok(career({ profile_id: null })));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(screen.queryByText('Guía del programa A')).toBeNull());
  });
  it('does not replace a fresh guide with an older refresh arriving last', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Guía del programa A');
    const old = deferred<any>(); f.career.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok(career({ name: 'Carrera actualizada' })));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' })); fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await screen.findByText('Carrera actualizada'); await act(async () => old.resolve(ok(career({ name: 'Carrera antigua' }))));
    expect(screen.queryByText('Carrera antigua')).toBeNull(); expect(screen.getByText('Carrera actualizada')).toBeInTheDocument();
  });
  it('restores ratings after a temporary summary error', async () => {
    const f = fixture(); f.summary.mockResolvedValueOnce({ data: null, error: { message: 'offline' } } as never); render(<f.Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar valoraciones' }));
    await screen.findByText('Media 4.0 de 2 valoraciones.');
  });
  it('clears a removed own rating after a successful refresh', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText(/Tu valoración: 4/); f.mine.mockResolvedValueOnce(ok(null) as never);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(screen.queryByText(/Tu valoración: 4/)).toBeNull());
  });
  it('keeps a newly saved rating when a stale summary finishes later', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText(/Tu valoración: 4/);
    const old = deferred<any>(); f.summary.mockReturnValueOnce(old.promise); fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(f.summary).toHaveBeenCalledTimes(2));
    f.summary.mockResolvedValueOnce(ok({ avg_rating: 5, ratings_count: 3 })); f.mine.mockResolvedValueOnce(ok({ rating: 5 }));
    fireEvent.click(screen.getByRole('button', { name: '5 estrellas' })); await screen.findByText('Media 5.0 de 3 valoraciones.');
    await act(async () => old.resolve(ok({ avg_rating: 1, ratings_count: 1 })));
    expect(screen.getByText('Media 5.0 de 3 valoraciones.')).toBeInTheDocument(); expect(screen.queryByText('Media 1.0 de 1 valoración.')).toBeNull();
  });
  it('renders a guide containing only the FP access route', async () => {
    const f = fixture(); f.profile.mockResolvedValueOnce(ok(profile({ pre_university: { acceso_fp: 'Acceso desde Técnico Superior' } }))); render(<f.Page />);
    await screen.findByText('Acceso desde Técnico Superior');
  });
  it('keeps a matching guide after a guide-only refresh fails', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Guía del programa A');
    f.profile.mockResolvedValueOnce({ data: null, error: { message: 'offline' } } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await screen.findByText(/No se ha podido actualizar la guía/);
    expect(screen.getByText('Guía del programa A')).toBeInTheDocument();
  });
  it('never attaches the previous guide when a replacement profile fails', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Guía del programa A');
    f.career.mockResolvedValueOnce(ok(career({ profile_id: 'profile-b' })));
    f.profile.mockRejectedValueOnce(Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await screen.findByText(/No se ha podido actualizar la guía/);
    expect(screen.queryByText('Guía del programa A')).toBeNull(); expect(screen.getByText('Carrera A')).toBeInTheDocument();
  });
  it('keeps the refresh indicator until the most recent refresh has finished', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Guía del programa A');
    const first = deferred<any>(), second = deferred<any>(); f.career.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const refresh = screen.getByRole('button', { name: 'Actualizar' }); fireEvent.click(refresh); fireEvent.click(refresh);
    await act(async () => first.resolve(ok(career()))); expect(refresh).toHaveAttribute('data-refreshing', 'true');
    await act(async () => second.resolve(ok(career()))); expect(refresh).toHaveAttribute('data-refreshing', 'false');
  });
  it('discards an old own-rating response when switching A to B', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText(/Tu valoración: 4/);
    const pending = deferred<any>(); f.mine.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' })); await waitFor(() => expect(f.mine).toHaveBeenCalledTimes(2));
    f.mine.mockResolvedValueOnce(ok({ rating: 5 }));
    await act(async () => { f.setOwner('account-b'); pending.resolve(ok({ rating: 1 })); });
    await screen.findByText(/Tu valoración: 5/); expect(screen.queryByText(/Tu valoración: 1/)).toBeNull();
  });
  it('discards a pending own rating after logout', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText(/Tu valoración: 4/);
    const pending = deferred<any>(); f.mine.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' })); await waitFor(() => expect(f.mine).toHaveBeenCalledTimes(2));
    await act(async () => { f.setOwner(null); pending.resolve(ok({ rating: 1 })); });
    await screen.findByText('Media 4.0 de 2 valoraciones.'); expect(screen.queryByText(/Tu valoración:/)).toBeNull();
  });
  it('does not save after the account changes during getUser', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText(/Tu valoración: 4/);
    const pending = deferred<any>(); f.getUser.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: '5 estrellas' }));
    await act(async () => { f.setOwner('account-b'); pending.resolve({ data: { user: { id: 'account-a' } }, error: null }); });
    await screen.findByText(/Tu valoración: 4/); expect(f.upsert).not.toHaveBeenCalled();
  });
});
