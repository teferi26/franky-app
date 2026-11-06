import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

// Franky Tap: el hook debe (1) pedir permisos SIEMPRE y encender la radio
// aunque no haya medición precisa (Android/Bluetooth), (2) hacer match con
// un acercamiento Bluetooth, (3) enterarse por sondeo cuando es el otro
// móvil quien detecta, (4) no destruir la sesión al ir a segundo plano.
const own = '10000000-0000-4000-8000-000000000001', peer = '20000000-0000-4000-8000-000000000002';
const match = { match: true, conversation_id: '30000000-0000-4000-8000-000000000003', ig_matched: true, event_id: null,
  peer: { id: '40000000-0000-4000-8000-000000000004', full_name: 'Bea Ruiz', avatar_url: null, university: 'UA', instagram_handle: 'bea_r', instagram_verified: false }, created_at: 'now' };

function load(file: string, mocks: Record<string, unknown>) {
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync(resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { module, exports: module.exports, console, Date, Map, Set, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, globalThis: {}, require: (id: string) => {
    if (id === 'react') return React; if (id === 'react/jsx-runtime') return require('react/jsx-runtime'); if (id in mocks) return mocks[id]; throw Error('Unmocked ' + id);
  } }, { filename: file });
  return module.exports;
}
function fixture(capability = { available: true, precise: false, reason: 'ok' }) {
  let uid = 'alice'; let appState: (s: string) => void = () => {}; let onTap: (v: any) => void = () => {}; let onSighting: (v: any) => void = () => {}; let blur: () => void = () => {};
  const awake = { activateKeepAwakeAsync: vi.fn(async () => {}), deactivateKeepAwake: vi.fn(async () => {}) };
  const radio = { isAvailable: vi.fn(async () => capability), requestPermissions: vi.fn(async () => capability), start: vi.fn(async () => true), stop: vi.fn(async () => {}),
    addTapListener: vi.fn((fn: any) => { onTap = fn; return { remove: vi.fn() }; }), addSightingListener: vi.fn((fn: any) => { onSighting = fn; return { remove: vi.fn() }; }), addErrorListener: vi.fn(() => ({ remove: vi.fn() })) };
  const api = { tapStart: vi.fn(async () => ({ token: own, expires_at: new Date(Date.now() + 300000).toISOString() })), tapConnect: vi.fn(async () => match), tapPoll: vi.fn(async () => ({ match: false })), tapStop: vi.fn(async () => null),
    isUuid: (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v), newTapKey: () => '55555555-5555-4555-8555-555555555555', tapErrorMessage: (e: any) => String(e?.message ?? e) };
  const haptics = { impactAsync: vi.fn(async () => {}), notificationAsync: vi.fn(async () => {}), ImpactFeedbackStyle: { Medium: 'medium' }, NotificationFeedbackType: { Success: 'success' } };
  const { useTap } = load('../mobile/src/lib/useTap.ts', {
    'react-native': { AppState: { addEventListener: (_: string, fn: any) => { appState = fn; return { remove: vi.fn() }; } } },
    'expo-router': { useFocusEffect: (fn: any) => React.useEffect(() => { blur = fn(); return blur; }, [fn]) }, 'expo-haptics': haptics, 'expo-keep-awake': awake, '../../modules/franky-tap': radio,
    './useSessionGuard': { useSessionGuard: (owner: string) => React.useCallback(() => uid === owner, [owner]) }, './tap': api,
  });
  let latest: any;
  function Page() { latest = useTap('alice', null); return <div><p>{latest.phase}</p><p>{latest.error}</p><p>{latest.result?.peer.full_name}</p><p>{latest.session ? 'armed' : 'idle'}</p><p>{latest.candidate?.reference}</p><button onClick={() => latest.confirm(peer)}>Confirm</button></div>; }
  return { Page, radio, api, haptics, state: (s: string) => appState(s), tap: (v: any) => onTap(v), sight: (v: any) => onSighting(v), get: () => latest, changeUser: () => { uid = 'bob'; } };
}
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
async function arm(f: ReturnType<typeof fixture>) { render(<f.Page />); await settle(); await settle(); expect(screen.getByText('armed')).toBeTruthy(); }
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('arms on focus, asks Bluetooth permission and starts the radio even without precise ranging (Android)', async () => {
  const f = fixture(); await arm(f);
  expect(f.radio.requestPermissions).toHaveBeenCalledTimes(1);
  expect(f.api.tapStart).toHaveBeenCalledWith(null);
  expect(f.radio.start).toHaveBeenCalledWith(own);
  expect(screen.getByText('searching')).toBeTruthy();
});
it('does not start the radio when the module is unavailable (Expo Go) but still issues a code', async () => {
  const f = fixture({ available: false, precise: false, reason: 'unavailable' }); await arm(f);
  expect(f.radio.start).not.toHaveBeenCalled();
  expect(f.get().session.token).toBe(own);
});
it('a Bluetooth tap makes the match at once and celebrates', async () => {
  const f = fixture(); await arm(f);
  act(() => f.tap({ token: peer, distanceCm: null, precise: false, rssi: -40 })); await settle();
  expect(f.api.tapConnect).toHaveBeenCalledWith(peer, '55555555-5555-4555-8555-555555555555', null);
  expect(screen.getByText('matched')).toBeTruthy(); expect(screen.getByText('Bea Ruiz')).toBeTruthy();
  expect(f.haptics.notificationAsync).toHaveBeenCalled(); expect(f.radio.stop).toHaveBeenCalled();
});
it('ignores a precise reading that is too far and ignores its own token', async () => {
  const f = fixture({ available: true, precise: true, reason: 'ok' }); await arm(f);
  act(() => f.tap({ token: peer, distanceCm: 120, precise: true })); await settle();
  act(() => f.tap({ token: own, distanceCm: 5, precise: true })); await settle();
  expect(f.api.tapConnect).not.toHaveBeenCalled(); expect(screen.getByText('searching')).toBeTruthy();
});
it('a sighting without distance offers a confirm card, and confirming calls the server', async () => {
  const f = fixture(); await arm(f);
  act(() => f.sight({ token: peer, distanceCm: null, precise: false })); await settle();
  expect(screen.getByText(peer.slice(-6).toUpperCase())).toBeTruthy();
  fireEvent.click(screen.getByText('Confirm')); await settle();
  expect(f.api.tapConnect).toHaveBeenCalledTimes(1); expect(screen.getByText('matched')).toBeTruthy();
});
it('learns about a match made by the other phone through polling', async () => {
  const f = fixture(); await arm(f);
  f.api.tapPoll.mockResolvedValueOnce(match as any);
  await act(async () => { vi.advanceTimersByTime(700); }); await settle(); await settle();
  expect(f.api.tapPoll).toHaveBeenCalledWith(own);
  expect(screen.getByText('matched')).toBeTruthy(); expect(screen.getByText('Bea Ruiz')).toBeTruthy();
});
it('background pauses the radio but keeps the session; foreground restarts it with the same token', async () => {
  const f = fixture(); await arm(f);
  const starts = f.radio.start.mock.calls.length;
  act(() => f.state('background')); await settle();
  expect(screen.getByText('armed')).toBeTruthy(); expect(f.api.tapStop).not.toHaveBeenCalled();
  act(() => f.state('active')); await settle();
  expect(f.radio.start.mock.calls.length).toBe(starts + 1); expect(f.radio.start).toHaveBeenLastCalledWith(own);
});
it('a server error shows a message and returns to searching without losing the session', async () => {
  const f = fixture(); await arm(f);
  f.api.tapConnect.mockRejectedValueOnce(new Error('peer_unavailable'));
  act(() => f.tap({ token: peer, distanceCm: null, precise: false })); await settle();
  expect(screen.getByText('peer_unavailable')).toBeTruthy(); expect(screen.getByText('searching')).toBeTruthy(); expect(screen.getByText('armed')).toBeTruthy();
});
it('stops everything and releases the token when the screen blurs', async () => {
  const f = fixture(); await arm(f);
  cleanup(); await settle();
  expect(f.api.tapStop).toHaveBeenCalledWith(own); expect(f.radio.stop).toHaveBeenCalled();
});
