import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
const task = (title: string) => ({ id: title, title, subject: null, due: null, priority: 'normal', done: false, doneAt: null, createdAt: '2026-09-06', notificationId: null });
const key = (name: string, user: string) => `franky.${name}.v1:user:${user}`;

/** Execute the real native modules without importing React Native's ambient types into Next. */
function fixture() {
  let owner = { userId: 'a', generation: 1 };
  const identityListeners = new Set<() => void>();
  const disk = new Map<string, string>();
  const storage = { getItem: vi.fn(async (k: string) => disk.get(k) ?? null), setItem: vi.fn(async (k: string, value: string) => { disk.set(k, value); }), removeItem: vi.fn(async (k: string) => { disk.delete(k); }) };
  const session = {
    captureSessionIdentity: () => ({ ...owner }), isCurrentSessionIdentity: (value: typeof owner) => value.userId === owner.userId && value.generation === owner.generation,
    onSessionIdentityChange: (fn: () => void) => { identityListeners.add(fn); return () => identityListeners.delete(fn); },
  };
  const notifications = { getPermissionsAsync: vi.fn(async () => ({ granted: false })), requestPermissionsAsync: vi.fn(async () => ({ granted: false })), scheduleNotificationAsync: vi.fn(async () => 'reminder'), cancelScheduledNotificationAsync: vi.fn(async () => {}), SchedulableTriggerInputTypes: { DATE: 'date' } };
  const upsert = vi.fn(async (_value: any) => ({ error: null }));
  const maybeSingle = vi.fn(async (): Promise<any> => ({ data: null, error: null }));
  const query: any = { select: () => query, eq: () => query, upsert, maybeSingle };
  const supabase = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: owner.userId } } })), getSession: vi.fn(async () => ({ data: { session: { user: { id: owner.userId } } } })) }, from: vi.fn(() => query), rpc: vi.fn(async (): Promise<any> => ({ data: null, error: null })) };
  const mocks: Record<string, any> = { '@react-native-async-storage/async-storage': { default: storage }, 'expo-notifications': notifications, 'expo-calendar': {}, 'react-native': { Platform: { OS: 'ios' } }, './supabase': { supabase }, './session': session };
  const cache = new Map<string, any>();
  const load = (file: string): any => {
    const path = resolve(file);
    if (cache.has(path)) return cache.get(path);
    const mod = { exports: {} }; cache.set(path, mod.exports);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(source, { exports: mod.exports, module: mod, Date, setTimeout, clearTimeout, console, require: (id: string) => {
      if (id in mocks) return mocks[id];
      if (!id.startsWith('.')) throw new Error(`Unexpected dependency: ${id}`);
      return load(resolve(dirname(path), `${id}.ts`));
    } }, { filename: path });
    return mod.exports;
  };
  const study = load('../mobile/src/lib/study.ts');
  const horario = load('../mobile/src/lib/horario.ts');
  const streak = load('../mobile/src/lib/streak.ts');
  const grades = load('../mobile/src/lib/study-grades.ts');
  return { study, horario, streak, grades, disk, storage, notifications, upsert, maybeSingle, supabase,
    switchTo(userId: string) { owner = { userId, generation: owner.generation + 1 }; for (const listener of identityListeners) listener(); },
  };
}

afterEach(() => vi.useRealTimers());
describe('real native study modules keep each account separate', () => {
  it('does not overwrite grades or sync after a load failure', async () => {
    const f = fixture(); const owner = { userId: 'a', generation: 1 };
    f.storage.getItem.mockRejectedValue(new Error('disk unavailable'));
    await expect(f.grades.getStudyGrades(owner)).rejects.toThrow('disk unavailable');
    await expect(f.grades.addStudyGrade(owner, { id: 'g', name: 'Math', credits: 6, grade: 8 })).rejects.toThrow('disk unavailable');
    expect(f.storage.setItem).not.toHaveBeenCalled(); expect(f.upsert).not.toHaveBeenCalled();
  });
  it('waits for restoration before loading or editing grades', async () => {
    vi.useFakeTimers(); const f = fixture(); const pending = deferred<any>(); f.maybeSingle.mockReturnValue(pending.promise);
    const restoring = f.study.pullStudyFromCloudIfEmpty(); await vi.waitFor(() => expect(f.maybeSingle).toHaveBeenCalled());
    const owner = { userId: 'a', generation: 1 };
    const loading = f.grades.getStudyGrades(owner);
    const editing = f.grades.addStudyGrade(owner, { id: 'local', name: 'Local', credits: 6, grade: 8 });
    pending.resolve({ data: { data: { v: 1, notaMedia: [{ id: 'cloud', name: 'Cloud', credits: 6, grade: 7 }] } }, error: null });
    expect(await restoring).toBe(true); expect((await loading)[0].id).toBe('cloud');
    expect((await editing).map((item: any) => item.id)).toEqual(['cloud', 'local']);
  });
  it('never attributes unowned legacy tasks to the next account or uploads them', async () => {
    const f = fixture(); const legacy = JSON.stringify([task('private-a')]); f.disk.set('franky.estudio.tareas.v1', legacy); f.switchTo('b');
    expect(await f.study.getTasks()).toEqual([]);
    expect(await f.study.pushStudyToCloud()).toBe(true);
    expect(f.upsert.mock.calls[0][0]).toMatchObject({ user_id: 'b', data: { tasks: [] } });
    expect(f.disk.get('franky.estudio.tareas.v1')).toBe(legacy);
  });
  it('loads only the current account and retains the previous account data', async () => {
    const f = fixture(); f.disk.set(key('estudio.tareas', 'a'), JSON.stringify([task('a')])); f.disk.set(key('estudio.tareas', 'b'), JSON.stringify([task('b')]));
    expect((await f.study.getTasks())[0].title).toBe('a'); f.switchTo('b');
    expect((await f.study.getTasks())[0].title).toBe('b'); expect(await f.study.pushStudyToCloud()).toBe(true);
    expect(f.upsert.mock.calls[0][0].data.tasks[0].title).toBe('b');
  });
  it('discards a cloud restore from A that arrives after switching to B', async () => {
    const f = fixture(); const pending = deferred<any>(); f.maybeSingle.mockReturnValue(pending.promise);
    const restoring = f.study.pullStudyFromCloudIfEmpty(); await vi.waitFor(() => expect(f.maybeSingle).toHaveBeenCalled()); f.switchTo('b');
    pending.resolve({ data: { data: { v: 1, tasks: [{ ...task('private-a'), due: '2099-01-20T10:00:00Z' }] } }, error: null });
    expect(await restoring).toBe(false); expect(f.storage.setItem).not.toHaveBeenCalled(); expect(f.notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('rejects a task edit if account changes during the disk read', async () => {
    const f = fixture(); const pending = deferred<string | null>(); f.storage.getItem.mockReturnValueOnce(pending.promise);
    const adding = f.study.addTask({ title: 'private-a' }); const result = expect(adding).rejects.toThrow('session_changed');
    await vi.waitFor(() => expect(f.storage.getItem).toHaveBeenCalled()); f.switchTo('b'); pending.resolve('[]'); await result;
    expect(f.storage.setItem).not.toHaveBeenCalled();
  });
  it('serializes concurrent timetable edits without losing the first one', async () => {
    const f = fixture(); const input = { subject: 'one', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', room: null, teacher: null };
    await Promise.all([f.horario.addClass(input), f.horario.addClass({ ...input, subject: 'two' })]);
    expect((await f.horario.getClasses()).map((c: any) => c.subject)).toEqual(['one', 'two']);
  });
  it('cancels a queued cloud sync when the session changes', async () => {
    vi.useFakeTimers(); const f = fixture(); f.study.scheduleCloudSync(); f.switchTo('b'); await vi.advanceTimersByTimeAsync(4000);
    expect(f.upsert).not.toHaveBeenCalled(); expect(f.supabase.auth.getUser).not.toHaveBeenCalled();
  });
  it('does not upload any snapshot after a delayed authentication check changes owner', async () => {
    const f = fixture(); const pending = deferred<any>(); f.supabase.auth.getUser.mockReturnValue(pending.promise);
    const uploading = f.study.pushStudyToCloud(); f.switchTo('b'); pending.resolve({ data: { user: { id: 'a' } } });
    expect(await uploading).toBe(false); expect(f.upsert).not.toHaveBeenCalled();
  });
  it('never replaces local tasks after a failed disk read', async () => {
    const f = fixture(); f.storage.getItem.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(f.study.addTask({ title: 'new' })).rejects.toThrow('disk unavailable'); expect(f.storage.setItem).not.toHaveBeenCalled();
  });
  it('preserves an edit started during a cloud restore', async () => {
    vi.useFakeTimers(); const f = fixture(); const pending = deferred<any>(); f.maybeSingle.mockReturnValue(pending.promise);
    const restoring = f.study.pullStudyFromCloudIfEmpty(); await vi.waitFor(() => expect(f.maybeSingle).toHaveBeenCalled());
    const editing = f.study.addTask({ title: 'new-local' });
    pending.resolve({ data: { data: { v: 1, tasks: [task('cloud')] } }, error: null });
    expect(await restoring).toBe(true); await editing;
    expect((await f.study.getTasks()).map((t: any) => t.title).sort()).toEqual(['cloud', 'new-local']);
  });
  it('discards a previous account streak response and cache', async () => {
    const f = fixture(); const pending = deferred<any>(); f.supabase.rpc.mockReturnValue(pending.promise);
    const touching = f.streak.touchStreak(); await vi.waitFor(() => expect(f.supabase.rpc).toHaveBeenCalled()); f.switchTo('b');
    pending.resolve({ data: { streak_count: 55, streak_best: 55 }, error: null }); await touching;
    expect((await f.streak.getStreak()).count).toBe(0); expect(f.disk.has(key('racha', 'b'))).toBe(false);
  });
});
