import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
function fixture() {
  const mod = { exports: {} as any };
  const code = ts.transpileModule(readFileSync(resolve('../mobile/src/lib/account-storage.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports: mod.exports, module: mod, Error, Set, Map, Promise });
  const disk = new Map<string, string>([['draft:user:A', 'private A'], ['draft:user:B', 'private B']]);
  const storage = { getItem: async (k: string) => disk.get(k) ?? null, setItem: async (k: string, v: string) => { disk.set(k, v); }, removeItem: async (k: string) => { disk.delete(k); },
    getAllKeys: async () => [...disk.keys()], multiRemove: async (keys: string[]) => { keys.forEach(k => disk.delete(k)); } };
  return { api: mod.exports, disk, storage };
}
describe('Native account erasure persistence', () => {
  it('waits for an in-flight write and prevents queued writes resurrecting A without deleting B', async () => {
    const f = fixture(); let release!: () => void;
    const gate = new Promise<void>(yes => { release = yes; });
    f.storage.setItem = async (k, v) => { if (k === 'draft:user:A') await gate; f.disk.set(k, v); };
    const owner = { userId: 'A', generation: 1 };
    const account = f.api.createAccountStorage(f.storage, { capture: () => owner, current: () => true });
    const writing = account.set(owner, 'draft', 'late write').catch(() => {});
    const erasing = f.api.eraseAccountStorage(f.storage, 'A');
    await expect(account.set(owner, 'draft', 'resurrection')).rejects.toThrow('session_changed');
    release(); await Promise.all([writing, erasing]);
    expect(f.disk.has('draft:user:A')).toBe(false); expect(f.disk.get('draft:user:B')).toBe('private B');
  });
  it('persists the pending erasure through a local storage failure and resumes it', async () => {
    const f = fixture(), remove = f.storage.multiRemove;
    f.storage.multiRemove = async () => { throw new Error('disk temporarily unavailable'); };
    await expect(f.api.eraseAccountStorage(f.storage, 'A')).rejects.toThrow();
    expect(f.disk.get('franky.account-erasure.pending:A')).toBe('1');
    f.storage.multiRemove = remove; await f.api.resumeAccountStorageErasure(f.storage);
    expect([...f.disk.keys()]).toEqual(['draft:user:B']);
  });
  it('erases the versioned community agreement cache with the deleted account only', async () => {
    const f = fixture();
    f.disk.set('franky:community-terms:2026-09-10:user:A', 'accepted');
    f.disk.set('franky:community-terms:2026-09-10:user:B', 'accepted');
    await f.api.eraseAccountStorage(f.storage, 'A');
    expect(f.disk.has('franky:community-terms:2026-09-10:user:A')).toBe(false);
    expect(f.disk.get('franky:community-terms:2026-09-10:user:B')).toBe('accepted');
  });
});
