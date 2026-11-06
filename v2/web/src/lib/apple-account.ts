import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import type { createAdminSupabase } from './supabase-admin';

type Admin = ReturnType<typeof createAdminSupabase>;
const issuer = 'https://appleid.apple.com';
const appleKeys = createRemoteJWKSet(new URL(`${issuer}/auth/keys`));
const bundle = () => process.env.APPLE_BUNDLE_ID || 'es.franky.app';
function encryptionKey() {
  const value = Buffer.from(process.env.APPLE_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (value.length !== 32) throw new Error('apple_configuration_unavailable');
  return value;
}

// The authenticated account ID is authenticated encryption context. A copied
// database row cannot be decrypted on behalf of another account.
export function sealAppleToken(userId: string, token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.');
}
export function openAppleToken(userId: string, sealed: string) {
  const parts = sealed.split('.').map(value => Buffer.from(value, 'base64url'));
  if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16) throw new Error('apple_credential_invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), parts[0], { authTagLength: 16 });
  decipher.setAAD(Buffer.from(userId)); decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString('utf8');
}
async function clientSecret() {
  const team = process.env.APPLE_TEAM_ID, keyId = process.env.APPLE_KEY_ID;
  const pem = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!team || !keyId || !pem) throw new Error('apple_configuration_unavailable');
  return new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(team).setSubject(bundle()).setAudience(issuer)
    .setIssuedAt().setExpirationTime('5m').sign(await importPKCS8(pem, 'ES256'));
}
async function verifyIdentity(token: string, subject: string) {
  const { payload } = await jwtVerify(token, appleKeys, { issuer, audience: bundle(), algorithms: ['RS256'], maxTokenAge: '10m' });
  if (payload.sub !== subject) throw new Error('apple_identity_mismatch');
}
async function appleRequest(path: 'token' | 'revoke', params: Record<string, string>) {
  return fetch(`${issuer}/auth/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: bundle(), client_secret: await clientSecret(), ...params }),
    signal: AbortSignal.timeout(12_000), redirect: 'error', cache: 'no-store',
  });
}

export async function saveAppleCredentials(admin: Admin, userId: string, subject: string, idToken: string, code: string) {
  await verifyIdentity(idToken, subject);
  const reserved = await admin.rpc('begin_apple_account_credential', { p_user: userId, p_subject: subject });
  if (reserved.error || typeof reserved.data !== 'string') throw new Error('apple_session_unavailable');
  const response = await appleRequest('token', { grant_type: 'authorization_code', code });
  if (!response.ok) throw new Error('apple_exchange_failed');
  const tokens = await response.json() as { id_token?: unknown; refresh_token?: unknown };
  if (typeof tokens.refresh_token !== 'string') throw new Error('apple_exchange_invalid');
  try {
    if (typeof tokens.id_token !== 'string') throw new Error('apple_exchange_invalid');
    await verifyIdentity(tokens.id_token, subject);
    const { error } = await admin.rpc('store_apple_account_credential', {
      p_user: userId, p_revision: reserved.data, p_token: sealAppleToken(userId, tokens.refresh_token),
    });
    if (error) throw new Error('apple_credential_store_failed');
  } catch {
    // A reservation remains visible to the erasure worker during an exchange.
    // If persistence fails, revoke the newly issued grant immediately.
    const revoked = await appleRequest('revoke', { token: tokens.refresh_token, token_type_hint: 'refresh_token' });
    if (!revoked.ok) throw new Error('apple_revocation_retry_required');
    throw new Error('apple_credential_store_failed');
  }
}

/** Apple accepts repeated revocations, including already invalid tokens. */
export async function revokeAppleCredentials(admin: Admin, userId: string) {
  const read = await admin.rpc('get_apple_account_credential', { p_user: userId });
  if (read.error) throw new Error('apple_credential_read_failed');
  const rows = (read.data ?? []) as { token: string | null; revision: string }[];
  for (const row of rows) {
    if (!row.token) throw new Error('apple_exchange_pending');
    const response = await appleRequest('revoke', { token: openAppleToken(userId, row.token), token_type_hint: 'refresh_token' });
    if (!response.ok) throw new Error('apple_revocation_failed');
    const removed = await admin.rpc('remove_apple_account_credential', { p_user: userId, p_revision: row.revision });
    if (removed.error || removed.data !== true) throw new Error('apple_revocation_changed');
  }
}
