import type { User } from '@supabase/supabase-js';

export class LookupIncompleteError extends Error {}
export class LookupUnavailableError extends Error {}
type AuthPage = { data: { users: User[]; nextPage?: number | null } | null; error: unknown };

/** A failed or truncated Auth scan cannot establish that a user is absent. */
export async function findAuthUser(email: string, list: (page: number, perPage: number) => Promise<AuthPage>,
  limits = { pages: 20, perPage: 500, milliseconds: 15_000 }): Promise<User | null> {
  const started = Date.now();
  for (let page = 1; page <= limits.pages; page++) {
    if (Date.now() - started >= limits.milliseconds) throw new LookupIncompleteError();
    const result = await list(page, limits.perPage);
    if (result.error || !result.data || !Array.isArray(result.data.users)) throw new LookupUnavailableError();
    const users = result.data.users;
    const match = users.find(user => user.email?.trim().toLowerCase() === email);
    if (match) return match;
    if (users.length < limits.perPage) return null;
  }
  throw new LookupIncompleteError();
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || null;
}

export function reconciledProfile(user: User) {
  const meta = user.user_metadata ?? {};
  const avatar = cleanText(meta.avatar_url, 2048) ?? cleanText(meta.picture, 2048);
  let avatarUrl: string | null = null;
  if (avatar) {
    try { const url = new URL(avatar); if (url.protocol === 'https:' && !url.username && !url.password) avatarUrl = url.href; } catch { /* Invalid metadata is optional. */ }
  }
  if (!user.email || !Number.isFinite(Date.parse(user.created_at))) throw new LookupUnavailableError();
  return { id: user.id, email: user.email, role: 'user' as const,
    full_name: cleanText(meta.full_name, 150) ?? cleanText(meta.name, 150) ?? user.email.split('@')[0].slice(0, 150),
    avatar_url: avatarUrl, created_at: user.created_at,
    email_verified_at: user.email_confirmed_at && Number.isFinite(Date.parse(user.email_confirmed_at)) ? user.email_confirmed_at : null };
}

export function authUserSummary(user: User) {
  return { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at,
    email_confirmed_at: user.email_confirmed_at, provider: cleanText(user.app_metadata?.provider, 40) };
}
