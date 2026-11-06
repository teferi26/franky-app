import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';
import { motionMock } from './helpers/mobile-motion-mock';

type ReadError = { message: string; code?: string; status?: number };
type ProfileReply = { data: Record<string, unknown> | null; error: ReadError | null; status?: number };
type AuthReply = { data: { user: { id: string } | null }; error: ReadError | null };
const failure: ProfileReply = { data: null, error: { message: 'temporary database failure' } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

function fixture() {
  let owner: string | null = 'account-a';
  const listeners = new Set<(event: string, session: any) => void>();
  const rows: Record<string, Record<string, unknown>> = {
    'account-a': { id: 'account-a', full_name: 'Ana Real', email: 'ana@example.invalid', city: 'Alicante', career: 'Ingeniería', university_id: 'ua', university_course: 2, universities: { name: 'Universidad de Alicante', short_name: 'UA' } },
    'account-b': { id: 'account-b', full_name: 'Bruno Real', email: 'bruno@example.invalid', city: 'Madrid' },
  };
  const profileRequest = vi.fn(async (id: string): Promise<ProfileReply> => ({ data: rows[id] ?? null, error: null }));
  const auth = {
    getUser: vi.fn(async (): Promise<AuthReply> => ({ data: { user: owner ? { id: owner } : null }, error: null })),
    signOut: vi.fn(),
    onAuthStateChange(fn: (event: string, session: any) => void) {
      listeners.add(fn);
      fn('INITIAL_SESSION', owner ? { user: { id: owner } } : null);
      return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } };
    },
  };
  const supabase = {
    auth,
    from(table: string) {
      let id = '';
      const query = {
        select: () => query,
        eq(key: string, value: string) { if (key === 'id') id = value; return query; },
        order: () => query,
        limit: () => query,
        maybeSingle: () => profileRequest(id),
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(table === 'accommodations' ? { count: 0, error: null } : { data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const Box = ({ children }: any) => <div>{children}</div>;
  const Btn = ({ label, onPress, busy, disabled }: any) => <button disabled={busy || disabled} onClick={onPress}>{label}</button>;
  const Tap = ({ children, onPress, accessibilityLabel }: any) => <button aria-label={accessibilityLabel} onClick={onPress}>{children}</button>;
  const router = { push: vi.fn(), replace: vi.fn() };
  const mocks: Record<string, any> = {
    react: { ...React, default: React }, 'react/jsx-runtime': jsx,
    'react-native': { View: Box, Text: Box, ScrollView: Box, Pressable: Tap, FlatList: () => null, Modal: ({ visible, children }: any) => visible ? <>{children}</> : null, Alert: { alert: vi.fn() }, Share: { share: vi.fn() }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'expo-router': { useRouter: () => router, useFocusEffect: (callback: React.EffectCallback) => React.useEffect(callback, [callback]) },
    'expo-image': { Image: () => null }, 'react-native-qrcode-svg': { default: () => null },
    'lucide-react-native': new Proxy({}, { get: () => () => null }),
    '@/components/Screen': { Screen: ({ title, right, children, onRefresh, refreshing }: any) => <div><h1>{title}</h1>{right}{onRefresh ? <button aria-label="Actualizar perfil" disabled={refreshing} onClick={onRefresh}>Actualizar</button> : null}{children}</div> },
    '@/components/card/CardPromo': { CardPromo: () => null },
    '@/components/ui': { Avatar: () => null, Btn, Tap, EmptyState: ({ title, subtitle, cta, onCta }: any) => <div>{title}<p>{subtitle}</p>{cta ? <Btn label={cta} onPress={onCta} /> : null}</div>, ProgressBar: () => null, NavRow: () => null, Pill: ({ label }: any) => <span>{label}</span>, IconCircle: () => null },
    '@/components/motion': motionMock,
    '@/components/VideoPlayer': { VideoPlayer: () => null }, '@/components/GridTile': { GridTile: () => null }, '@/components/CreateMenu': { CreateMenu: () => null },
    '@/components/WorkspaceProvider': { useWorkspace: () => ({ enabled: false, workspaces: [] }) },
    '@/lib/supabase': { supabase }, './supabase': { supabase },
    '@/lib/push': { unregisterPushToken: vi.fn(), resumePushRegistration: vi.fn(), registerForPushNotifications: vi.fn() },
    '@/lib/local-notifications': { clearOwnedNotifications: vi.fn(), resumeLocalNotifications: vi.fn() },
    '@/lib/session-exit': { createSessionExit: () => vi.fn() }, '@/lib/offline-queue': { clearOfflineQueue: vi.fn() },
    '@/lib/franky-card': { cardRpc: vi.fn(async () => ({ enabled: false })) }, '@/lib/api': { getMyUniversitySlug: vi.fn() },
    '@/lib/social': { getSocialCounts: vi.fn(async () => ({ posts: 0, followers: 0, following: 0 })), getProfileActivity: vi.fn(async () => ({ views: 0, newFollowers: 0 })), getHighlights: vi.fn(async () => []), listFollowLinks: vi.fn(async () => []), deleteHighlight: vi.fn() },
    '@/lib/chat': { startDirectChat: vi.fn() }, '@/lib/theme-switch': { getThemePref: () => 'auto', setThemePref: vi.fn() }, '@/lib/streak': { getStreak: vi.fn(async () => null) },
    '@/lib/format': { timeAgo: vi.fn() }, '@/lib/i18n': { t: (key: string) => key === 'common.student' ? 'Estudiante' : key }, '@/lib/toast': { toastError: vi.fn() }, '@/lib/a11y': { MAX_FONT_SCALE: 1.6 },
    '@/theme': { C: {}, S: {}, F: {}, R: {}, FONT: {}, SHADOW: {} },
  };
  const load = nativeLoader(mocks);
  const session = load('../mobile/src/lib/session-cache.ts').createSessionCache(auth);
  mocks['@/lib/session'] = session;
  mocks['./session'] = session;
  return {
    Page: load('../mobile/app/(tabs)/perfil.tsx').default, profileRequest, rows, auth,
    switchTo(id: string | null) {
      owner = id;
      for (const fn of listeners) fn(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null);
    },
  };
}

describe('Native profile preserves server data and offers recovery from read failures', () => {
  it('renders the actual name, university and city from a successful profile read', async () => {
    const f = fixture(); render(<f.Page />);
    expect(await screen.findByText('Ana Real')).toBeInTheDocument();
    expect(screen.getByText('UA · Ingeniería · 2º')).toBeInTheDocument();
    expect(screen.getByText('Alicante')).toBeInTheDocument();
    expect(screen.queryByText('Estudiante')).toBeNull();
  });

  it.each(['database error', 'missing row'] as const)('does not fabricate a profile after an initial %s, and retries', async reason => {
    const f = fixture();
    f.profileRequest.mockResolvedValue(reason === 'database error' ? failure : { data: null, error: null });
    render(<f.Page />);
    expect(await screen.findByText('No hemos podido cargar tu perfil')).toBeInTheDocument();
    expect(screen.queryByText('Estudiante')).toBeNull();
    expect(screen.queryByText('perfil.editProfile')).toBeNull();
    f.profileRequest.mockResolvedValue({ data: f.rows['account-a'], error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Real')).toBeInTheDocument();
    expect(screen.queryByText('No hemos podido cargar tu perfil')).toBeNull();
  });

  it('retains the previous name and academic data after a failed refresh, then recovers', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Ana Real');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualizar perfil' })).toBeEnabled());
    f.profileRequest.mockResolvedValue(failure);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar perfil' }));
    await screen.findByText(/No hemos podido actualizar tu perfil/);
    expect(screen.getByText('Ana Real')).toBeInTheDocument();
    expect(screen.getByText('UA · Ingeniería · 2º')).toBeInTheDocument();
    expect(screen.getByText('Alicante')).toBeInTheDocument();
    f.profileRequest.mockResolvedValue({ data: { ...f.rows['account-a'], city: 'Valencia' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Valencia')).toBeInTheDocument();
    expect(screen.queryByText(/No hemos podido actualizar tu perfil/)).toBeNull();
  });

  it('clears prior account data and ignores its late reply when the next account cannot load', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Ana Real');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualizar perfil' })).toBeEnabled());
    const oldRead = deferred<ProfileReply>();
    f.profileRequest.mockImplementation(id => id === 'account-a' ? oldRead.promise : Promise.resolve(failure));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar perfil' }));
    await waitFor(() => expect(f.profileRequest.mock.calls.filter(([id]) => id === 'account-a').length).toBeGreaterThan(1));
    act(() => f.switchTo('account-b'));
    await screen.findByText('No hemos podido cargar tu perfil');
    expect(screen.queryByText('Ana Real')).toBeNull();
    expect(screen.queryByText('Alicante')).toBeNull();
    await act(async () => oldRead.resolve({ data: f.rows['account-a'], error: null }));
    expect(screen.queryByText('Ana Real')).toBeNull();
    f.profileRequest.mockResolvedValue({ data: f.rows['account-b'], error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Bruno Real')).toBeInTheDocument();
    expect(screen.queryByText('Ana Real')).toBeNull();
  });

  it.each(['user_not_found', 'account_unavailable', 'no-user'] as const)('clears previous private data after confirmed %s without requiring a sign-out event', async code => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Ana Real');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualizar perfil' })).toBeEnabled());
    f.auth.getUser.mockResolvedValue({ data: { user: null }, error: code === 'no-user' ? null : { code, message: 'account is unavailable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar perfil' }));
    await screen.findByText('No hemos podido cargar tu perfil');
    expect(screen.queryByText('Ana Real')).toBeNull();
    expect(screen.queryByText('UA · Ingeniería · 2º')).toBeNull();
    expect(screen.queryByText('Alicante')).toBeNull();
    expect(f.auth.signOut).not.toHaveBeenCalled();
  });

  it('removes private data on a permission denial without turning a table permission error into logout', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Ana Real');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualizar perfil' })).toBeEnabled());
    f.profileRequest.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' }, status: 403 });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar perfil' }));
    await screen.findByText('No hemos podido cargar tu perfil');
    expect(screen.queryByText('Ana Real')).toBeNull();
    expect(f.auth.signOut).not.toHaveBeenCalled();
    f.profileRequest.mockResolvedValue({ data: f.rows['account-a'], error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Real')).toBeInTheDocument();
  });

  it('retains the known profile during a transient authentication network failure', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Ana Real');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actualizar perfil' })).toBeEnabled());
    f.auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503, message: 'network temporarily unavailable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar perfil' }));
    await screen.findByText(/No hemos podido actualizar tu perfil/);
    expect(screen.getByText('Ana Real')).toBeInTheDocument();
    expect(f.auth.signOut).not.toHaveBeenCalled();
  });

  it('clears data after a batched logout and login of the same UID', async () => {
    const f = fixture(); render(<f.Page />); await screen.findByText('Ana Real');
    f.profileRequest.mockResolvedValue(failure);
    act(() => { f.switchTo(null); f.switchTo('account-a'); });
    expect(screen.queryByText('Ana Real')).toBeNull();
    await screen.findByText('No hemos podido cargar tu perfil');
    expect(screen.queryByText('Alicante')).toBeNull();
    expect(screen.queryByText('UA · Ingeniería · 2º')).toBeNull();
    f.profileRequest.mockResolvedValue({ data: f.rows['account-a'], error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Real')).toBeInTheDocument();
  });
});
