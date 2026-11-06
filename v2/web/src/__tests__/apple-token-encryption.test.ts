// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openAppleToken, sealAppleToken } from '@/lib/apple-account';

beforeEach(() => vi.stubEnv('APPLE_TOKEN_ENCRYPTION_KEY', randomBytes(32).toString('base64')));
afterEach(() => vi.unstubAllEnvs());

describe('Apple credential authenticated encryption', () => {
  it('round trips with a fresh nonce and authenticates the owning account', () => {
    const token = 'synthetic-apple-refresh-credential';
    const sealed = sealAppleToken('account-one', token);
    expect(openAppleToken('account-one', sealed)).toBe(token);
    expect(sealAppleToken('account-one', token)).not.toBe(sealed);
    expect(() => openAppleToken('account-two', sealed)).toThrow();
  });
  it('rejects shortened authentication tags and modified ciphertext', () => {
    const parts = sealAppleToken('account-one', 'synthetic-credential').split('.');
    const shortened = [...parts];
    shortened[1] = Buffer.from(parts[1], 'base64url').subarray(0, 12).toString('base64url');
    expect(() => openAppleToken('account-one', shortened.join('.'))).toThrow('apple_credential_invalid');
    const bytes = Buffer.from(parts[2], 'base64url');
    bytes[0] ^= 1;
    parts[2] = bytes.toString('base64url');
    expect(() => openAppleToken('account-one', parts.join('.'))).toThrow();
  });
});
