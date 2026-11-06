import { describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { findAuthUser, reconciledProfile, authUserSummary, LookupIncompleteError, LookupUnavailableError } from '../lib/admin-user-lookup';

const user = (email: string, extra: Partial<User> = {}) => ({ id: '11111111-1111-4111-8111-111111111111', email,
  created_at: '2020-01-01T10:00:00Z', email_confirmed_at: '2020-01-02T10:00:00Z', user_metadata: {}, app_metadata: {}, ...extra }) as User;
const limits = { pages: 3, perPage: 2, milliseconds: 15000 };

describe('Admin lookup completeness and reconciliation metadata', () => {
  it('finds the requested account beyond the first Auth page', async () => {
    const wanted = user('TARGET@example.es');
    const list = vi.fn().mockResolvedValueOnce({ data: { users: [user('one@example.es'), user('two@example.es')] }, error: null })
      .mockResolvedValueOnce({ data: { users: [wanted] }, error: null });
    expect(await findAuthUser('target@example.es', list, limits)).toBe(wanted);
    expect(list.mock.calls).toEqual([[1, 2], [2, 2]]);
  });
  it('only diagnoses absence after exhausting the catalogue', async () => {
    expect(await findAuthUser('absent@example.es', async () => ({ data: { users: [] }, error: null }), limits)).toBeNull();
  });
  it('does not diagnose absence when the page budget expires', async () => {
    const list = vi.fn(async () => ({ data: { users: [user('one@example.es'), user('two@example.es')] }, error: null }));
    await expect(findAuthUser('absent@example.es', list, limits)).rejects.toBeInstanceOf(LookupIncompleteError);
    expect(list).toHaveBeenCalledTimes(3);
  });
  it.each([{ data: null, error: new Error('auth failed') }, { data: null, error: null }])('does not confuse an Auth failure with an absent user', async result => {
    await expect(findAuthUser('test@example.es', async () => result, limits)).rejects.toBeInstanceOf(LookupUnavailableError);
  });
  it('stops before starting another page outside the time budget', async () => {
    const list = vi.fn();
    await expect(findAuthUser('test@example.es', list, { ...limits, milliseconds: 0 })).rejects.toBeInstanceOf(LookupIncompleteError);
    expect(list).not.toHaveBeenCalled();
  });
  it('preserves the real signup and verification dates without adopting metadata roles', () => {
    const u = user('test@example.es', { user_metadata: { role: 'admin', full_name: { invalid: true }, name: ' Ana\u0000 ', avatar_url: 'javascript:alert(1)', email_verified: true } });
    expect(reconciledProfile(u)).toMatchObject({ role: 'user', full_name: 'Ana', avatar_url: null,
      created_at: u.created_at, email_verified_at: u.email_confirmed_at });
  });
  it('does not mark an unconfirmed account verified based on metadata', () => {
    expect(reconciledProfile(user('test@example.es', { email_confirmed_at: undefined, user_metadata: { email_verified: true } })).email_verified_at).toBeNull();
  });
  it('rejects a corrupt signup date instead of giving an existing account a fresh age', () => {
    expect(() => reconciledProfile(user('test@example.es', { created_at: 'invalid' }))).toThrow(LookupUnavailableError);
  });
  it('does not expose raw identity metadata in diagnostic output', () => {
    const summary = authUserSummary(user('test@example.es', { user_metadata: { private: 'secret' }, app_metadata: { provider: 'google', permissions: ['admin'] } }));
    expect(summary.provider).toBe('google'); expect(JSON.stringify(summary)).not.toMatch(/private|secret|permissions/);
  });
});
