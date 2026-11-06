import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as passwordPolicy from '../../../mobile/src/lib/password-policy';
import { passwordSchema, PASSWORD_MIN_LENGTH } from '@/lib/password-strength';

const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() {
  let owner = { userId: 'account-a', generation: 1 };
  const signIn = vi.fn(async (): Promise<any> => ({ data: { session: { user: { id: 'account-a' } } }, error: null }));
  const signOut = vi.fn(async () => ({ error: null }));
  const updateUser = vi.fn(async () => ({ error: null }));
  const getUser = vi.fn(async () => ({ data: { user: { id: owner.userId, email: `${owner.userId}@example.invalid` } } }));
  const supabase = { auth: { getUser, updateUser, mfa: { unenroll: vi.fn(async () => ({ error: null })) } } };
  const mocks: Record<string, any> = { '@supabase/supabase-js': { createClient: () => ({ auth: { signInWithPassword: signIn, signOut } }) }, '@/lib/supabase': { supabase, SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test' }, '@/lib/session': { captureSessionIdentity: () => ({ ...owner }), isCurrentSessionIdentity: (captured: typeof owner) => captured.userId === owner.userId && captured.generation === owner.generation } };
  mocks['@/lib/password-policy'] = passwordPolicy;
  const file = resolve('../mobile/src/lib/security.ts'), mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { module: mod, exports: mod.exports, Error, Set, require: (id: string) => { if (id in mocks) return mocks[id]; throw Error(id); } }, { filename: file });
  return { api: mod.exports as any, signIn, signOut, updateUser, getUser, changeAccount() { owner = { userId: 'account-b', generation: 2 }; } };
}
describe('Native password changes stay bound to the reauthenticated account', () => {
  it.each([
    ['abcdefghij', true],
    ['abcdefghi', false],
    ['abcde'.repeat(40), true],
    ['abcde'.repeat(40) + 'f', false],
    ['          ', false],
    ['ababababab', false],
    ['una frase que recuerdo', true],
  ])('uses the same registration policy as the API for %j', (password, accepted) => {
    const f = fixture();
    expect(f.api.PASSWORD_MIN).toBe(PASSWORD_MIN_LENGTH);
    expect(f.api.validarPassword(password) === null).toBe(accepted);
    expect(passwordSchema.safeParse(password).success).toBe(accepted);
  });
  it('allows a ten-character change only after reauthentication', async () => {
    const f = fixture();
    await f.api.cambiarPassword('old-password', 'abcdefghij');
    expect(f.signIn).toHaveBeenCalledTimes(1);
    expect(f.updateUser).toHaveBeenCalledWith({ password: 'abcdefghij' });
  });
  it('rejects a short new password before starting reauthentication', async () => {
    const f = fixture();
    await expect(f.api.cambiarPassword('old-password', 'abcdefghi')).rejects.toThrow('Mínimo 10');
    expect(f.signIn).not.toHaveBeenCalled();
    expect(f.updateUser).not.toHaveBeenCalled();
  });
  it('does not change B after the password check for A completes late', async () => {
    const f = fixture(), pending = deferred<any>(); f.signIn.mockReturnValueOnce(pending.promise);
    const request = f.api.cambiarPassword('old-password', 'a-new-secret-2026'); const rejected = expect(request).rejects.toThrow('session_changed');
    await vi.waitFor(() => expect(f.signIn).toHaveBeenCalled()); f.changeAccount(); pending.resolve({ data: { session: { user: { id: 'account-a' } } }, error: null }); await rejected;
    expect(f.updateUser).not.toHaveBeenCalled(); expect(f.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
  it('checks the old password without replacing the global session', async () => {
    const f = fixture(); await f.api.cambiarPassword('old-password', 'a-new-secret-2026');
    expect(f.signIn).toHaveBeenCalledWith({ email: 'account-a@example.invalid', password: 'old-password' }); expect(f.updateUser).toHaveBeenCalledWith({ password: 'a-new-secret-2026' });
  });
  it('does not submit a new password after failed reauthentication', async () => {
    const f = fixture(); f.signIn.mockResolvedValue({ data: { session: null }, error: new Error('invalid credentials') }); await expect(f.api.cambiarPassword('wrong', 'a-new-secret-2026')).rejects.toThrow(/actual no es correcta/); expect(f.updateUser).not.toHaveBeenCalled();
  });
  it('does not start a password change from a stale screen', async () => {
    const f = fixture(); await expect(f.api.cambiarPassword('old-password', 'a-new-secret-2026', () => false)).rejects.toThrow('session_changed'); expect(f.getUser).not.toHaveBeenCalled(); expect(f.signIn).not.toHaveBeenCalled();
  });
});
