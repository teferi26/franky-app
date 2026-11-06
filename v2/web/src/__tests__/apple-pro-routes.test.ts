// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signJws } from './helpers/apple-pki';

const m = vi.hoisted(() => ({
  user: { id: '12345678-1234-4234-8234-123456789012' } as { id: string } | null,
  usable: true,
  adminRpc: vi.fn(),
}));

// Las rutas usan la raíz real de Apple; aquí verifican contra la CA sintética.
vi.mock('@/lib/apple-iap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apple-iap')>();
  const { testPki } = await import('./helpers/apple-pki');
  const opts = { roots: [testPki().root.cert], environments: ['Production', 'Sandbox'] as ('Production' | 'Sandbox')[] };
  return {
    ...actual,
    verifyProTransaction: (jws: string) => actual.verifyProTransaction(jws, opts),
    verifyRenewalInfo: (jws: string, id: string) => actual.verifyRenewalInfo(jws, id, opts),
    verifyNotification: (jws: string) => actual.verifyNotification(jws, opts),
  };
});
vi.mock('@/lib/supabase-server', () => ({
  createRequestSupabase: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: m.user } })) },
    rpc: vi.fn(async () => ({ data: m.usable, error: null })),
  })),
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: vi.fn(() => ({ rpc: m.adminRpc })) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ ok: true })) }));

import { POST as verify } from '@/app/api/apple/pro/verify/route';
import { POST as notifications } from '@/app/api/apple/notifications/route';

const DAY = 86_400_000;
const now = Date.now();
const uid = '12345678-1234-4234-8234-123456789012';
const access = { pro: true, status: 'trialing', tier: 'm29', product_id: 'es.franky.app.pro.m29', expires_at: new Date(now + 7 * DAY).toISOString(), is_trial: true, trial_eligible: false };

const tx = (extra: Record<string, unknown> = {}) => ({
  transactionId: '2000000000000002',
  originalTransactionId: '2000000000000001',
  bundleId: 'es.franky.app',
  productId: 'es.franky.app.pro.m29',
  appAccountToken: uid,
  environment: 'Sandbox',
  expiresDate: now + 7 * DAY,
  offerType: 1,
  offerDiscountType: 'FREE_TRIAL',
  signedDate: now,
  ...extra,
});
const post = (url: string, body: unknown) =>
  new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', authorization: 'Bearer token' } });
const verifyRequest = (body: unknown) => post('https://franky.es/api/apple/pro/verify', body);
const noteRequest = (payload: unknown) => post('https://franky.es/api/apple/notifications', { signedPayload: signJws(payload) });
const note = (notificationType: string, data: Record<string, unknown> = {}, subtype?: string) => ({
  notificationType,
  subtype,
  notificationUUID: `uuid-${notificationType}-${subtype ?? ''}`,
  signedDate: now + 1000,
  version: '2.0',
  data: { bundleId: 'es.franky.app', environment: 'Sandbox', appAppleId: 6794608974, ...data },
});
const applyCalls = () => m.adminRpc.mock.calls.filter(([name]) => name === 'pro_apply_apple_state');

beforeEach(() => {
  m.user = { id: uid };
  m.usable = true;
  m.adminRpc.mockReset();
  m.adminRpc.mockImplementation(async (name: string) =>
    name === 'pro_access_for_user'
      ? { data: access, error: null }
      : { data: { applied: true, duplicate: false, stale: false, created: true }, error: null },
  );
});

describe('POST /api/apple/pro/verify', () => {
  it('exige sesión', async () => {
    m.user = null;
    expect((await verify(verifyRequest({ signedTransaction: signJws(tx()) }))).status).toBe(401);
  });

  it('guarda la compra verificada y devuelve el acceso', async () => {
    const res = await verify(verifyRequest({ signedTransaction: signJws(tx()) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pro: true, status: 'trialing', tier: 'm29', product_id: 'es.franky.app.pro.m29', expires_at: access.expires_at, is_trial: true });
    const [[, args]] = applyCalls();
    expect(args.p_state).toMatchObject({ user_id: uid, original_transaction_id: '2000000000000001', status: 'trialing', environment: 'Sandbox', tier: 'm29' });
    expect(args.p_notification).toBeNull();
  });

  it('rechaza una compra hecha con otra cuenta de Franky o sin token', async () => {
    const other = await verify(verifyRequest({ signedTransaction: signJws(tx({ appAccountToken: '99999999-1234-4234-8234-123456789012' })) }));
    expect(other.status).toBe(403);
    const none = await verify(verifyRequest({ signedTransaction: signJws(tx({ appAccountToken: undefined })) }));
    expect(none.status).toBe(403);
    expect(applyCalls()).toHaveLength(0);
  });

  it('rechaza producto ajeno, otra app y firma inválida', async () => {
    for (const bad of [tx({ productId: 'es.franky.pro.monthly' }), tx({ bundleId: 'com.other' })]) {
      expect((await verify(verifyRequest({ signedTransaction: signJws(bad) }))).status).toBe(400);
    }
    const [h, p] = signJws(tx()).split('.');
    expect((await verify(verifyRequest({ signedTransaction: `${h}.${p}.${'A'.repeat(86)}` }))).status).toBe(400);
    expect(applyCalls()).toHaveLength(0);
  });

  it('una suscripción ya unida a otra cuenta responde 409', async () => {
    m.adminRpc.mockImplementation(async () => ({ data: null, error: { message: 'pro_subscription_owner_conflict' } }));
    expect((await verify(verifyRequest({ signedTransaction: signJws(tx()) }))).status).toBe(409);
  });

  it('cuerpo inválido', async () => {
    expect((await verify(verifyRequest({ signedTransaction: 3 }))).status).toBe(400);
  });
});

describe('POST /api/apple/notifications', () => {
  const renewal = (extra: Record<string, unknown> = {}) =>
    signJws({ originalTransactionId: '2000000000000001', environment: 'Sandbox', signedDate: now, autoRenewStatus: 1, ...extra });

  const cases: [string, string | undefined, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>][] = [
    ['SUBSCRIBED', 'INITIAL_BUY', {}, {}, { status: 'trialing', auto_renew: true }],
    ['DID_RENEW', undefined, { offerDiscountType: undefined, transactionId: '2000000000000003' }, {}, { status: 'active', latest_transaction_id: '2000000000000003' }],
    ['DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_DISABLED', {}, { autoRenewStatus: 0 }, { auto_renew: false }],
    ['DID_FAIL_TO_RENEW', 'GRACE_PERIOD', { expiresDate: now - DAY }, { isInBillingRetryPeriod: true, gracePeriodExpiresDate: now + 3 * DAY }, { status: 'grace' }],
    ['DID_FAIL_TO_RENEW', undefined, { expiresDate: now - DAY }, { isInBillingRetryPeriod: true }, { status: 'billing_retry' }],
    ['GRACE_PERIOD_EXPIRED', undefined, { expiresDate: now - DAY }, {}, { status: 'expired' }],
    ['EXPIRED', 'VOLUNTARY', { expiresDate: now - DAY }, { autoRenewStatus: 0 }, { status: 'expired' }],
    ['REFUND', undefined, { revocationDate: now, revocationReason: 0 }, {}, { status: 'refunded' }],
    ['REVOKE', undefined, { revocationDate: now }, {}, { status: 'revoked' }],
    ['OFFER_REDEEMED', 'UPGRADE', { offerDiscountType: 'PAY_AS_YOU_GO', productId: 'es.franky.app.pro.m39' }, {}, { status: 'active', tier: 'm39' }],
  ];
  for (const [type, subtype, txExtra, renewalExtra, expected] of cases) {
    it(`${type}${subtype ? ` (${subtype})` : ''}`, async () => {
      const res = await notifications(noteRequest(note(type, { signedTransactionInfo: signJws(tx(txExtra)), signedRenewalInfo: renewal(renewalExtra) }, subtype)));
      expect(res.status).toBe(200);
      const [[, args]] = applyCalls();
      expect(args.p_state).toMatchObject({ original_transaction_id: '2000000000000001', notification_type: type, signed_at: new Date(now + 1000).toISOString(), ...expected });
      expect(args.p_notification).toEqual({ uuid: `uuid-${type}-${subtype ?? ''}`, type, subtype: subtype ?? null });
    });
  }

  it('un aviso ya procesado responde 200', async () => {
    m.adminRpc.mockImplementation(async () => ({ data: { applied: false, duplicate: true, stale: false, created: false }, error: null }));
    const res = await notifications(noteRequest(note('DID_RENEW', { signedTransactionInfo: signJws(tx()) })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
  });

  it('sin fila ni cuenta conocida responde 200 sin reintento; la base caída responde 500', async () => {
    m.adminRpc.mockImplementation(async () => ({ data: null, error: { message: 'pro_subscription_owner_unknown' } }));
    expect((await notifications(noteRequest(note('SUBSCRIBED', { signedTransactionInfo: signJws(tx({ appAccountToken: undefined })) })))).status).toBe(200);
    m.adminRpc.mockImplementation(async () => ({ data: null, error: { message: 'connection refused' } }));
    expect((await notifications(noteRequest(note('SUBSCRIBED', { signedTransactionInfo: signJws(tx()) })))).status).toBe(500);
  });

  it('avisos de otros tipos o de otros productos se aceptan sin tocar nada', async () => {
    expect((await notifications(noteRequest({ notificationType: 'TEST', notificationUUID: 't', signedDate: now }))).status).toBe(200);
    const other = await notifications(noteRequest(note('DID_RENEW', { signedTransactionInfo: signJws(tx({ productId: 'es.franky.pro.monthly' })) })));
    expect(other.status).toBe(200);
    expect(applyCalls()).toHaveLength(0);
  });

  it('una firma que no es de Apple o de otra app se rechaza', async () => {
    const [h, p] = signJws(note('DID_RENEW')).split('.');
    const forged = new NextRequest('https://franky.es/api/apple/notifications', { method: 'POST', body: JSON.stringify({ signedPayload: `${h}.${p}.${'A'.repeat(86)}` }) });
    expect((await notifications(forged)).status).toBe(400);
    expect((await notifications(noteRequest(note('DID_RENEW', { bundleId: 'com.other' })))).status).toBe(400);
    expect((await notifications(post('https://franky.es/api/apple/notifications', { nope: 1 }))).status).toBe(400);
    expect(applyCalls()).toHaveLength(0);
  });
});
