import React from 'react';
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

afterEach(cleanup);
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const row = (name: string) => ({ id: 'shared-chat', other_user: { id: 'peer', full_name: name, avatar_url: null }, is_group: false, unread_count: 0, last_message: null, last_message_at: null });

function fixture() {
  let owner: { userId: string; generation: number } | null = { userId: 'A', generation: 1 };
  const listeners = new Set<() => void>();
  const session = {
    captureSessionIdentity: () => owner,
    isCurrentSessionIdentity: (prior: any) => !!owner && prior?.userId === owner.userId && prior?.generation === owner.generation,
    onSessionIdentityChange: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: () => true };
  const storage = new Map<string, string>();
  const Box = ({ children }: any) => <div>{children}</div>;
  const Text = ({ children }: any) => <span>{children}</span>;
  const Tap = ({ children, onPress, accessibilityLabel, disabled }: any) => <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>{children}</button>;
  const EmptyState = ({ title, subtitle, cta, onCta }: any) => <div>{title}<span>{subtitle}</span>{cta && <button onClick={onCta}>{cta}</button>}</div>;
  const FlatList = React.forwardRef(function List({ data, renderItem, ListEmptyComponent, ListHeaderComponent }: any, _ref) {
    return <div>{ListHeaderComponent}{data?.length ? data.map((item: any, index: number) => <div key={item.key ?? item.id}>{renderItem({ item, index })}</div>) : ListEmptyComponent}</div>;
  });
  const native: any = {
    View: Box, Text, ScrollView: Box, KeyboardAvoidingView: Box, Pressable: Tap,
    TextInput: ({ value, onChangeText, accessibilityLabel }: any) => <input aria-label={accessibilityLabel} value={value} onChange={e => onChangeText?.(e.target.value)} />,
    FlatList, Modal: ({ visible, children }: any) => visible ? <div>{children}</div> : null,
    ActivityIndicator: () => <span>Loading</span>, RefreshControl: () => null, Switch: () => null,
    Platform: { OS: 'ios' }, Alert: { alert: vi.fn() }, StyleSheet: { absoluteFill: {} },
    Animated: { View: Box, Value: class { setValue() {} interpolate() { return 0; } }, spring: () => ({ start() {} }), timing: () => ({ start() {}, stop() {} }), loop: () => ({ start() {}, stop() {} }), sequence: () => ({}), delay: () => ({}) },
  };
  const channel = { on: () => channel, subscribe: () => channel, send: vi.fn() };
  const supabase: any = {
    auth: { getUser: vi.fn(async () => ({ data: { user: owner ? { id: owner.userId } : null } })) },
    from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }),
    channel: () => channel, removeChannel: vi.fn(),
  };
  const chat: any = new Proxy({
    getMyChats: vi.fn(async () => [row('Persona A')]), getMessages: vi.fn(async () => []),
    getConversationMuted: vi.fn(async () => false), getPresence: vi.fn(async () => ({ lastSeen: null })),
    getChatPolls: vi.fn(async () => []), getGroupMembers: vi.fn(async () => []), getMessageReactions: vi.fn(async () => []),
    subscribeToChat: vi.fn(() => channel), subscribeToChatList: vi.fn(() => channel), subscribeToChatPolls: vi.fn(() => channel), subscribeToReactions: vi.fn(() => channel),
    sendTextMessage: vi.fn(async () => ({ ok: true })),
  }, { get(target, key: string) { return Reflect.get(target, key) ?? (async () => ({ ok: true })); } });
  const theme = { id: 'franky', wallpaper: ['#fff', '#fff'], bubbleMine: ['#fff', '#fff'], bubbleMineText: '#111', bubbleOther: '#fff', bubbleOtherText: '#111', mutedOnWallpaper: '#555' };
  const styles = new Proxy({}, { get: () => ({}) });
  const kit = { Tap, Avatar: ({ name }: any) => <span>{name}</span>, Btn: ({ label, onPress, disabled }: any) => <button disabled={disabled} onClick={onPress}>{label}</button>,
    EmptyState, SkeletonList: () => <span>Loading chats</span>, Skeleton: () => null,
    Chip: ({ label, onPress }: any) => <button onClick={onPress}>{label}</button>, NavRow: () => null, OptionsSheet: () => null,
    SearchBar: () => null, Pill: () => null,
  };
  const mocks: Record<string, any> = {
    react: { ...React, default: React }, 'react/jsx-runtime': jsx, 'react-native': native,
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({ id: 'shared-chat', title: 'Stale navigation title' }), useFocusEffect: () => {} },
    'expo-haptics': { impactAsync: async () => {}, selectionAsync: async () => {}, notificationAsync: async () => {}, ImpactFeedbackStyle: {}, NotificationFeedbackType: {} },
    'lucide-react-native': new Proxy({}, { get: () => () => null }),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-image': { Image: () => null }, 'expo-linear-gradient': { LinearGradient: Box }, 'expo-image-picker': {}, 'expo-audio': {},
    '@react-native-community/datetimepicker': { default: () => null },
    '@react-native-async-storage/async-storage': { default: { getItem: vi.fn(async (key: string) => storage.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { storage.set(key, value); }), removeItem: vi.fn(async (key: string) => storage.delete(key)) } },
    '@/components/ui': kit, '@/components/Screen': { Screen: ({ children, data, renderItem, ListEmptyComponent, ListHeaderComponent }: any) => <div>{children}{ListHeaderComponent}{data?.length ? data.map((item: any, index: number) => <div key={item.id}>{renderItem({ item, index })}</div>) : ListEmptyComponent}</div> },
    '@/components/motion': { FadeIn: Box }, '@/components/Lightbox': { Lightbox: () => null }, '@/components/SocialDemoBanner': { SocialDemoBanner: () => null },
    '@/components/SocialDemoFeatureNotice': { SocialDemoFeatureNotice: () => null }, '@/components/VideoPlayer': { VideoPlayer: () => null },
    '@/components/VoiceRecorder': { useVoiceRecorder: () => ({ recording: false, busy: false, toggle: vi.fn() }), fmtDur: () => '0:00' },
    '@/lib/social-demo': { useSocialDemoAccessState: () => ({ access: { demo: true, active: true }, retry: vi.fn(), checking: false }), ensureSocialDemoFeature: async () => false },
    '@/lib/chat': chat, '@/lib/supabase': { supabase }, '@/lib/session': session, './session': session,
    '@/lib/owned-request': { withOwnedRequest: async (_owner: any, work: any) => work({}) },
    '@/lib/active-conversation': { setActiveConversation: vi.fn(), clearActiveConversation: vi.fn() },
    '@/lib/chat-themes': { CHAT_THEMES: [theme], themeById: () => theme, getChatTheme: async () => theme, setChatTheme: vi.fn() },
    '@/lib/media': { signedChatMediaUrl: vi.fn(async () => 'private-signed-url'), normalizeImage: vi.fn() },
    '@/lib/toast': { toast: vi.fn(), toastError: vi.fn() }, '@/lib/format': { timeAgo: () => 'ahora' }, '@/lib/i18n': { t: (value: string) => value },
    '@/lib/a11y': { MAX_FONT_SCALE: 2, useReduceMotion: () => true }, '@/theme': { C: styles, F: styles, S: {}, R: {}, FONT: {}, SHADOW: {} },
  };
  const load = (path: string) => {
    const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), '../mobile', path), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports: any = {};
    runInNewContext(compiled, { exports, require: (name: string) => { if (!(name in mocks)) throw Error('Missing mock ' + name); return mocks[name]; }, Date, Intl, setTimeout, clearTimeout, setInterval, clearInterval });
    return exports;
  };
  mocks['@/lib/useSessionOwner'] = load('src/lib/useSessionOwner.ts');
  return { Chats: load('app/(tabs)/chats.tsx').default, Detail: load('app/chat/[id].tsx').default, chat, storage, router, supabase,
    setOwner(next: typeof owner) { owner = next; listeners.forEach(fn => fn()); },
  };
}

describe('mobile chat session ownership', () => {
  it.each([{ userId: 'B', generation: 2 }, { userId: 'A', generation: 2 }])('clears the previous chat list for $userId/$generation even when the new load fails', async next => {
    const f = fixture(); render(<f.Chats />); await screen.findAllByText('Persona A');
    f.chat.getMyChats.mockRejectedValue(new Error('offline'));
    act(() => f.setOwner(next));
    await screen.findByText('No se pudo cargar');
    expect(screen.queryAllByText('Persona A')).toHaveLength(0);
  });
  it('discards a late previous-account list and unsubscribes its realtime channel', async () => {
    const f = fixture(); const late = deferred<any[]>(); f.chat.getMyChats.mockReturnValueOnce(late.promise);
    render(<f.Chats />); await waitFor(() => expect(f.chat.getMyChats).toHaveBeenCalled());
    f.chat.getMyChats.mockResolvedValue([row('Persona B')]); act(() => f.setOwner({ userId: 'B', generation: 2 }));
    await screen.findAllByText('Persona B'); await act(async () => late.resolve([row('Persona A')]));
    expect(screen.queryAllByText('Persona A')).toHaveLength(0); expect(f.supabase.removeChannel).toHaveBeenCalled();
  });
  it('separates local drafts and chat title between accounts, including a direct link', async () => {
    const f = fixture(); f.storage.set('franky_chat_draft_v2_A_shared-chat', 'Private draft A');
    render(<f.Detail />); await screen.findByDisplayValue('Private draft A');
    expect(screen.queryByText('Stale navigation title')).toBeNull();
    f.chat.getMyChats.mockResolvedValue([]); f.chat.getMessages.mockRejectedValue(new Error('denied'));
    act(() => f.setOwner({ userId: 'B', generation: 2 }));
    await waitFor(() => expect(screen.queryByDisplayValue('Private draft A')).toBeNull());
    expect(screen.queryByText('Persona A')).toBeNull();
  });
  it('remounts the same account generation and never restores a delayed previous send', async () => {
    const f = fixture(); const send = deferred<{ ok: boolean }>(); f.chat.sendTextMessage.mockReturnValueOnce(send.promise);
    render(<f.Detail />); await screen.findAllByText('Persona A');
    const input = screen.getByLabelText('Mensaje'); fireEvent.change(input, { target: { value: 'Old pending message' } });
    fireEvent.click(screen.getByLabelText('Enviar mensaje')); await waitFor(() => expect(f.chat.sendTextMessage).toHaveBeenCalled());
    act(() => f.setOwner({ userId: 'A', generation: 2 }));
    await act(async () => send.resolve({ ok: false }));
    expect(screen.queryByDisplayValue('Old pending message')).toBeNull();
  });
});
