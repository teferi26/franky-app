// @vitest-environment node
import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  APPLE_ROOT_CA_G3_PEM,
  APPLE_ROOT_CA_G3_SHA256,
  subscriptionState,
  verifyAppleJws,
  verifyNotification,
  verifyProTransaction,
  verifyRenewalInfo,
  type VerifyOptions,
} from '@/lib/apple-iap';
import { INTERMEDIATE_OID, LEAF_OID, makeCert, makePki, signJws, testPki } from './helpers/apple-pki';

const DAY = 86_400_000;
const now = Date.now();
const uid = '12345678-1234-4234-8234-123456789012';
const pki = testPki();
const opts: VerifyOptions = { roots: [pki.root.cert], environments: ['Production', 'Sandbox'] };

function transaction(extra: Record<string, unknown> = {}) {
  return {
    transactionId: '2000000123456790',
    originalTransactionId: '2000000123456789',
    bundleId: 'es.franky.app',
    productId: 'es.franky.app.pro.m29',
    appAccountToken: uid,
    environment: 'Sandbox',
    purchaseDate: now - 1000,
    expiresDate: now + 7 * DAY,
    offerType: 1,
    offerDiscountType: 'FREE_TRIAL',
    signedDate: now - 500,
    type: 'Auto-Renewable Subscription',
    ...extra,
  };
}

describe('raíz de Apple incrustada', () => {
  it('es la Apple Root CA - G3 publicada por Apple (huella SHA-256 y autofirma)', () => {
    const root = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
    expect(root.fingerprint256).toBe(APPLE_ROOT_CA_G3_SHA256);
    expect(root.subject).toContain('CN=Apple Root CA - G3');
    expect(root.verify(root.publicKey)).toBe(true);
  });

  it('sin raíces de prueba, una cadena sintética no es de confianza', async () => {
    await expect(verifyProTransaction(signJws(transaction()), { environments: ['Sandbox'] })).rejects.toThrow('apple_root_untrusted');
  });
});

describe('verificación de la cadena y la firma', () => {
  it('acepta una transacción bien firmada y lee el usuario del appAccountToken', async () => {
    const verified = await verifyProTransaction(signJws(transaction()), opts);
    expect(verified.userId).toBe(uid);
    expect(verified.tier).toBe('m29');
    expect(verified.environment).toBe('Sandbox');
  });

  it('rechaza otra raíz aunque se llame igual', async () => {
    const other = makePki();
    await expect(verifyProTransaction(signJws(transaction(), [other.leaf, other.intermediate, other.root]), opts)).rejects.toThrow('apple_root_untrusted');
  });

  it('rechaza una hoja firmada por un intermedio que no es el de la cadena', async () => {
    const rogueIntermediate = makeCert({ cn: pki.intermediate.cn, issuer: pki.root, ca: true, appleOid: INTERMEDIATE_OID });
    const leaf = makeCert({ cn: 'Rogue leaf', issuer: rogueIntermediate, ca: false, appleOid: LEAF_OID });
    await expect(verifyProTransaction(signJws(transaction(), [leaf, pki.intermediate, pki.root]), opts)).rejects.toThrow('apple_chain_invalid');
  });

  it('rechaza una hoja sin el OID de la App Store', async () => {
    const leaf = makeCert({ cn: 'No OID', issuer: pki.intermediate, ca: false });
    await expect(verifyProTransaction(signJws(transaction(), [leaf, pki.intermediate, pki.root]), opts)).rejects.toThrow('apple_chain_invalid');
  });

  it('rechaza una cadena caducada en la fecha de firma', async () => {
    const leaf = makeCert({ cn: 'Old', issuer: pki.intermediate, ca: false, appleOid: LEAF_OID, notBefore: new Date(now - 10 * DAY), notAfter: new Date(now - 5 * DAY) });
    await expect(verifyProTransaction(signJws(transaction(), [leaf, pki.intermediate, pki.root]), opts)).rejects.toThrow('apple_chain_expired');
  });

  it('rechaza un contenido manipulado después de firmar', async () => {
    const [h, , s] = signJws(transaction()).split('.');
    const forged = Buffer.from(JSON.stringify(transaction({ productId: 'es.franky.app.pro.m80' }))).toString('base64url');
    await expect(verifyProTransaction(`${h}.${forged}.${s}`, opts)).rejects.toThrow('apple_signature_invalid');
  });

  it('rechaza algoritmos distintos de ES256, cadenas incompletas y basura', async () => {
    await expect(verifyAppleJws(signJws(transaction(), undefined, 'HS256'), opts)).rejects.toThrow('apple_jws_algorithm');
    await expect(verifyAppleJws(signJws(transaction(), [pki.leaf, pki.intermediate]), opts)).rejects.toThrow('apple_chain_invalid');
    await expect(verifyAppleJws('no.es.jws', opts)).rejects.toThrow('apple_jws_malformed');
  });
});

describe('contenido de la transacción', () => {
  it('rechaza otra app, un producto que no es Pro y entornos no permitidos', async () => {
    await expect(verifyProTransaction(signJws(transaction({ bundleId: 'com.other.app' })), opts)).rejects.toThrow('apple_bundle_mismatch');
    await expect(verifyProTransaction(signJws(transaction({ productId: 'es.franky.pro.monthly' })), opts)).rejects.toThrow('apple_product_unknown');
    await expect(verifyProTransaction(signJws(transaction({ environment: 'Xcode' })), opts)).rejects.toThrow('apple_environment_invalid');
    await expect(verifyProTransaction(signJws(transaction()), { ...opts, environments: ['Production'] })).rejects.toThrow('apple_environment_invalid');
  });

  it('un token que no es UUID no identifica a nadie', async () => {
    expect((await verifyProTransaction(signJws(transaction({ appAccountToken: 'otra-cosa' })), opts)).userId).toBeNull();
    expect((await verifyProTransaction(signJws(transaction({ appAccountToken: undefined })), opts)).userId).toBeNull();
  });

  it('la renovación debe ser de la misma suscripción', async () => {
    const jws = signJws({ originalTransactionId: 'otra', environment: 'Sandbox', signedDate: now, autoRenewStatus: 1 });
    await expect(verifyRenewalInfo(jws, '2000000123456789', opts)).rejects.toThrow('apple_renewal_mismatch');
  });

  it('un aviso de producción debe ser de esta app', async () => {
    const payload = { notificationType: 'DID_RENEW', notificationUUID: 'n-1', signedDate: now, data: { bundleId: 'es.franky.app', environment: 'Production', appAppleId: 1 } };
    await expect(verifyNotification(signJws(payload), opts)).rejects.toThrow('apple_app_mismatch');
    const ok = await verifyNotification(signJws({ ...payload, data: { ...payload.data, appAppleId: 6794608974 } }), opts);
    expect(ok.notificationType).toBe('DID_RENEW');
  });
});

describe('estado según cada aviso', () => {
  const verified = async (extra: Record<string, unknown> = {}) => verifyProTransaction(signJws(transaction(extra)), opts);
  const note = (notificationType: string, subtype?: string) => ({ notificationType, subtype, signedDate: now });

  it('compra con prueba: trialing; compra normal o renovación: active', async () => {
    expect(subscriptionState(await verified(), null, null, now)).toMatchObject({ status: 'trialing', is_trial: true, user_id: uid, notification_type: 'VERIFY' });
    const paid = await verified({ offerType: undefined, offerDiscountType: undefined });
    expect(subscriptionState(paid, null, note('SUBSCRIBED', 'INITIAL_BUY'), now).status).toBe('active');
    expect(subscriptionState(paid, null, note('DID_RENEW'), now).status).toBe('active');
    expect(subscriptionState(paid, null, note('OFFER_REDEEMED'), now).status).toBe('active');
  });

  it('cambio de renovación automática', async () => {
    const tx = await verified();
    expect(subscriptionState(tx, null, note('DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_DISABLED'), now)).toMatchObject({ auto_renew: false, status: 'trialing' });
    expect(subscriptionState(tx, null, note('DID_CHANGE_RENEWAL_STATUS', 'AUTO_RENEW_ENABLED'), now).auto_renew).toBe(true);
  });

  it('fallo de cobro: gracia con su fin o reintento', async () => {
    const tx = await verified({ expiresDate: now - DAY, offerDiscountType: undefined });
    const renewal = { originalTransactionId: '2000000123456789', environment: 'Sandbox', signedDate: now, isInBillingRetryPeriod: true, gracePeriodExpiresDate: now + 3 * DAY, autoRenewStatus: 1 };
    const grace = subscriptionState(tx, renewal, note('DID_FAIL_TO_RENEW', 'GRACE_PERIOD'), now);
    expect(grace).toMatchObject({ status: 'grace', grace_expires_at: new Date(now + 3 * DAY).toISOString(), auto_renew: true });
    const retry = subscriptionState(tx, { ...renewal, gracePeriodExpiresDate: undefined }, note('DID_FAIL_TO_RENEW'), now);
    expect(retry).toMatchObject({ status: 'billing_retry', grace_expires_at: null });
  });

  it('fin de gracia, caducidad, reembolso y revocación', async () => {
    const tx = await verified({ expiresDate: now - DAY });
    expect(subscriptionState(tx, null, note('GRACE_PERIOD_EXPIRED'), now).status).toBe('expired');
    expect(subscriptionState(tx, null, note('EXPIRED', 'VOLUNTARY'), now).status).toBe('expired');
    const revoked = await verified({ revocationDate: now, revocationReason: 0 });
    expect(subscriptionState(revoked, null, note('REFUND'), now).status).toBe('refunded');
    expect(subscriptionState(revoked, null, note('REVOKE'), now).status).toBe('revoked');
    expect(subscriptionState(revoked, null, null, now).status).toBe('refunded');
  });

  it('la fecha de orden es la del aviso cuando lo hay', async () => {
    const tx = await verified();
    expect(subscriptionState(tx, null, { notificationType: 'DID_RENEW', signedDate: now + 1000 }, now).signed_at).toBe(new Date(now + 1000).toISOString());
    expect(subscriptionState(tx, null, null, now).signed_at).toBe(new Date(now - 500).toISOString());
  });
});
