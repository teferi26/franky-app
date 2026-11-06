import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';
import { motionMock } from './helpers/mobile-motion-mock';

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(platform = 'android', signedInBefore = true) {
  let token = 0, owner: { userId: string; generation: number } | null = null;
  const router = { replace: vi.fn(), back: vi.fn(), push: vi.fn(), canGoBack: () => false };
  const run = vi.fn(async (name: string, ..._args: any[]): Promise<any> => {
    if (name === 'signInWithOAuth') return { data: { url: 'https://provider.fixture.invalid' }, error: null };
    owner = { userId: 'signed-in', generation: 1 }; return { data: { user: { id: owner.userId } }, error: null };
  });
  const cancel = vi.fn();
  const beginAuthAttempt = vi.fn(() => {
    const current = ++token;
    return { run: (name: string, ...args: any[]) => { if (current !== token) throw Error('session_changed'); return run(name, ...args); }, isCurrent: () => current === token,
      cancel: () => { cancel(); if (current === token) token++; } };
  });
  const browser = vi.fn(async (): Promise<any> => ({ type: 'cancel' })), apple = vi.fn(async (): Promise<any> => ({ identityToken: 'synthetic-apple' }));
  const fetcher = vi.fn(async (_url: string, _options: { body: string }): Promise<any> => ({ ok: true })), tour = vi.fn(async () => true), toastError = vi.fn();
  const Box = ({ children }: any) => <div>{children}</div>, Btn = ({ label, children, accessibilityLabel, onPress, busy, disabled }: any) => <button aria-label={accessibilityLabel} onClick={onPress} disabled={busy || disabled}>{label ?? children}</button>;
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { university_id: 'uni' }, error: null }) };
  const mocks: Record<string, any> = { react: { ...React, default: React }, 'react/jsx-runtime': jsx,
    'react-native': { View: Box, Text: Box, KeyboardAvoidingView: Box, ScrollView: Box, Platform: { OS: platform }, Linking: { openURL: vi.fn() }, Animated: { Value: class { setValue() {} interpolate() { return 0; } }, View: Box },
      TextInput: ({ value, onChangeText, accessibilityLabel, onSubmitEditing, ref }: any) => <input ref={ref} aria-label={accessibilityLabel} value={value} onChange={e => onChangeText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSubmitEditing?.(); }} /> },
    'expo-router': { useRouter: () => router }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@react-native-async-storage/async-storage': { default: { getItem: async () => signedInBefore ? '1' : null, setItem: vi.fn(async () => {}) } },
    'expo-web-browser': { openAuthSessionAsync: browser }, 'expo-linking': { createURL: () => 'franky://auth-callback' },
    'expo-apple-authentication': { isAvailableAsync: async () => true, signInAsync: apple, AppleAuthenticationScope: {}, AppleAuthenticationButtonType: {}, AppleAuthenticationButtonStyle: {}, AppleAuthenticationButton: ({ onPress }: any) => <button onClick={onPress}>Apple</button> },
    'expo-haptics': { notificationAsync: async () => {}, NotificationFeedbackType: { Success: 'success' } }, 'lucide-react-native': new Proxy({}, { get: () => () => null }),
    '@/lib/supabase': { beginAuthAttempt, fetchConTimeout: fetcher, WEB_URL: 'https://fixture.invalid', supabase: { from: () => query } },
    '@/lib/session': { captureSessionIdentity: () => owner, isCurrentSessionIdentity: (value: any) => value === owner },
    '@/lib/workspaces': { rememberedWorkspaceDestination: async () => null },
    '@/lib/growth-attribution': { getGrowthSignupMetadata: async () => ({}), claimPendingGrowthInvite: async () => {}, setGrowthExplicitCode: async () => {} },
    '@/lib/owned-request': { withOwnedRequest: async (_owner: any, work: any) => work({ owner, query: (builder: any) => builder, check: () => {} }) },
    '@/components/motion': motionMock, '@/components/ui': { Btn, Tap: Btn, BrandWordmark: () => null, IconCircle: () => null }, '@/lib/i18n': { t: (key: string) => key }, '@/lib/tour': { hasSeenTour: tour }, '@/lib/toast': { toastError, toastInfo: vi.fn() }, '@/lib/a11y': { MAX_FONT_SCALE: 1.6, useReduceMotion: () => true }, '@/theme': { C: {}, R: {}, S: {}, F: {}, FONT: {} },
  };
  const load = nativeLoader(mocks, { process: { env: { EXPO_PUBLIC_APPLE_AUTH: '1' } } });
  return { Page: load('../mobile/app/welcome.tsx').default, run, browser, apple, beginAuthAttempt, cancel, fetcher, tour, router, toastError,
    invalidate() { token++; owner = null; } };
}
async function fillLogin() {
  fireEvent.change(await screen.findByRole('textbox', { name: 'welcome.emailPlaceholder' }), { target: { value: 'fixture@example.invalid' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'welcome.passwordPlaceholder' }), { target: { value: 'fixture-password' } });
}

describe('Native Welcome ignores expired external authentication attempts', () => {
  it('registers a ten-character password accepted by the server policy', async () => {
    const f = fixture('android', false); render(<f.Page />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'welcome.namePlaceholder' }), { target: { value: 'Cuenta de prueba' } });
    await fillLogin();
    fireEvent.change(screen.getByRole('textbox', { name: 'welcome.passwordPlaceholder' }), { target: { value: 'abcdefghij' } });
    fireEvent.click(screen.getByRole('button', { name: 'welcome.signupCta' }));
    await waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(1));
    expect(f.fetcher.mock.calls[0]?.[0]).toBe('https://fixture.invalid/api/auth/signup');
    expect(JSON.parse(f.fetcher.mock.calls[0]?.[1].body).password).toBe('abcdefghij');
    await waitFor(() => expect(f.router.replace).toHaveBeenCalledWith('/onboarding-intro'));
  });
  it.each([
    ['abcdefghi', 'tooShort'],
    ['abcde'.repeat(40) + 'f', 'tooLong'],
    ['          ', 'onlySpaces'],
    ['ababababab', 'repetitive'],
  ])('does not submit an invalid new password (%s)', async (password, issue) => {
    const f = fixture('android', false); render(<f.Page />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'welcome.namePlaceholder' }), { target: { value: 'Cuenta de prueba' } });
    await fillLogin();
    fireEvent.change(screen.getByRole('textbox', { name: 'welcome.passwordPlaceholder' }), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'welcome.signupCta' }));
    expect(await screen.findByText(`welcome.passwordErrors.${issue}`)).toBeInTheDocument();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
  });
  it('keeps login available to existing accounts with a shorter password', async () => {
    const f = fixture(); render(<f.Page />); await fillLogin();
    fireEvent.change(screen.getByRole('textbox', { name: 'welcome.passwordPlaceholder' }), { target: { value: 'old123' } });
    fireEvent.click(screen.getByRole('button', { name: 'welcome.login' }));
    await waitFor(() => expect(f.run).toHaveBeenCalledWith('signInWithPassword', { email: 'fixture@example.invalid', password: 'old123' }));
  });
  it('does not exchange a Google callback after leaving the screen', async () => {
    const f = fixture(), pending = deferred<any>(); f.browser.mockReturnValueOnce(pending.promise); const page = render(<f.Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'welcome.continueWithGoogle' })); await waitFor(() => expect(f.browser).toHaveBeenCalled()); page.unmount();
    await act(async () => pending.resolve({ type: 'success', url: 'franky://auth-callback?code=old' }));
    expect(f.run.mock.calls.map(call => call[0])).toEqual(['signInWithOAuth']); expect(f.cancel).toHaveBeenCalled(); expect(f.router.replace).not.toHaveBeenCalled();
  });
  it('does not use an Apple credential returned after a newer session transition', async () => {
    const f = fixture('ios'), pending = deferred<any>(); f.apple.mockReturnValueOnce(pending.promise); render(<f.Page />); fireEvent.click(await screen.findByRole('button', { name: 'Apple' }));
    f.invalidate(); await act(async () => pending.resolve({ identityToken: 'stale-token' })); expect(f.run).not.toHaveBeenCalled(); expect(f.toastError).not.toHaveBeenCalled();
  });
  it('rejects a callback pointing at a different app route', async () => {
    const f = fixture(); f.browser.mockResolvedValue({ type: 'success', url: 'franky://unexpected?code=old' }); render(<f.Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'welcome.continueWithGoogle' })); await waitFor(() => expect(f.toastError).toHaveBeenCalled()); expect(f.run.mock.calls.map(call => call[0])).toEqual(['signInWithOAuth']);
  });
  it('prevents duplicate email submissions even before the button rerenders', async () => {
    const f = fixture(), pending = deferred<any>(); f.run.mockReturnValueOnce(pending.promise); render(<f.Page />); await fillLogin();
    const field = screen.getByRole('textbox', { name: 'welcome.passwordPlaceholder' }); act(() => { fireEvent.keyDown(field, { key: 'Enter' }); fireEvent.keyDown(field, { key: 'Enter' }); });
    expect(f.run).toHaveBeenCalledTimes(1); await act(async () => pending.resolve({ error: { message: 'Invalid login credentials' } }));
  });
  it('restores the email form after a rejected authentication operation', async () => {
    const f = fixture(); f.run.mockRejectedValueOnce(new Error('offline')); render(<f.Page />); await fillLogin(); fireEvent.click(screen.getByRole('button', { name: 'welcome.login' }));
    await waitFor(() => expect(f.toastError).toHaveBeenCalled()); expect(screen.getByRole('button', { name: 'welcome.login' })).not.toBeDisabled();
  });
  it('does not navigate on an old tour lookup after the session is invalidated', async () => {
    const f = fixture(), pending = deferred<boolean>(); f.tour.mockReturnValueOnce(pending.promise); render(<f.Page />); await fillLogin(); fireEvent.click(screen.getByRole('button', { name: 'welcome.login' }));
    await waitFor(() => expect(f.tour).toHaveBeenCalled()); f.invalidate(); await act(async () => pending.resolve(false)); expect(f.router.replace).not.toHaveBeenCalled();
  });
});

