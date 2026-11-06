import 'server-only';
import { X509Certificate, createHash } from 'node:crypto';
import { compactVerify, decodeProtectedHeader, type JWK } from 'jose';
import { PRO_PRODUCT_IDS, tierForProduct, type ProIapTier } from '../../../shared/pro/iap';

/**
 * Verificación de los JWS que firma la App Store (StoreKit 2 y App Store
 * Server Notifications V2): signedTransactionInfo, signedRenewalInfo y el
 * signedPayload de cada aviso.
 *
 * Cada JWS trae en la cabecera x5c la cadena [hoja, intermedio, raíz]. Se
 * exige que la raíz sea exactamente la Apple Root CA - G3 incrustada abajo,
 * que cada eslabón esté firmado por el siguiente y vigente en la fecha de
 * firma, que hoja e intermedio lleven los OID de Apple para la App Store y que
 * la firma ES256 cuadre con la clave de la hoja. Sin dependencias nuevas: el
 * certificado lo valida node:crypto y la firma, jose.
 *
 * No se consulta OCSP (revocación de la hoja): el paquete oficial de Apple
 * tampoco lo hace salvo en su modo online.
 */

// Apple Root CA - G3, de https://www.apple.com/certificateauthority/
// SHA-256: 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;
export const APPLE_ROOT_CA_G3_SHA256 =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';

export const APPLE_BUNDLE_ID = 'es.franky.app';
export const APPLE_APP_ID = 6794608974;

// OID 1.2.840.113635.100.6.11.1 (hoja de firma de la App Store) y
// 1.2.840.113635.100.6.2.1 (intermedio WWDR), codificados en DER.
const LEAF_OID = Buffer.from('060a2a864886f76364060b01', 'hex');
const INTERMEDIATE_OID = Buffer.from('060a2a864886f76364060201', 'hex');

export class AppleVerificationError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'AppleVerificationError';
  }
}

let appleRoot: X509Certificate | null = null;
function trustedAppleRoot(): X509Certificate {
  if (appleRoot) return appleRoot;
  const root = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  // Si alguien toca el PEM, la huella deja de cuadrar y no se confía en nada.
  if (root.fingerprint256 !== APPLE_ROOT_CA_G3_SHA256) throw new AppleVerificationError('apple_root_mismatch');
  appleRoot = root;
  return root;
}

export type AppleEnvironment = 'Sandbox' | 'Production';

export interface VerifyOptions {
  /** Raíces de confianza. Solo las pruebas pasan otra; por defecto Apple G3. */
  roots?: X509Certificate[];
  /** Entornos aceptados. Por defecto los que permite appleEnvironments(). */
  environments?: AppleEnvironment[];
  bundleId?: string;
  appAppleId?: number;
  now?: number;
}

/**
 * Sandbox es donde compran App Review y TestFlight, así que se acepta salvo
 * que APPLE_IAP_ALLOW_SANDBOX=false. Xcode y LocalTesting nunca.
 */
export function appleEnvironments(): AppleEnvironment[] {
  return process.env.APPLE_IAP_ALLOW_SANDBOX === 'false' ? ['Production'] : ['Production', 'Sandbox'];
}

function validAt(cert: X509Certificate, at: number) {
  return Date.parse(cert.validFrom) <= at && at <= Date.parse(cert.validTo);
}

function hasOid(cert: X509Certificate, oid: Buffer) {
  return cert.raw.includes(oid);
}

/** Verifica cadena y firma de un JWS de Apple y devuelve su contenido. */
export async function verifyAppleJws<T extends { signedDate?: number }>(jws: string, options: VerifyOptions = {}): Promise<T> {
  if (typeof jws !== 'string' || jws.length > 20_000 || jws.split('.').length !== 3) {
    throw new AppleVerificationError('apple_jws_malformed');
  }
  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(jws);
  } catch {
    throw new AppleVerificationError('apple_jws_malformed');
  }
  if (header.alg !== 'ES256') throw new AppleVerificationError('apple_jws_algorithm');
  const chain = header.x5c;
  if (!Array.isArray(chain) || chain.length !== 3 || !chain.every((c) => typeof c === 'string' && c.length < 8_000)) {
    throw new AppleVerificationError('apple_chain_invalid');
  }

  let leaf: X509Certificate, intermediate: X509Certificate, root: X509Certificate;
  try {
    [leaf, intermediate, root] = chain.map((c) => new X509Certificate(Buffer.from(c, 'base64')));
  } catch {
    throw new AppleVerificationError('apple_chain_invalid');
  }
  const roots = options.roots ?? [trustedAppleRoot()];
  const trusted = roots.find((r) => r.raw.equals(root.raw));
  if (!trusted) throw new AppleVerificationError('apple_root_untrusted');

  if (!intermediate.checkIssued(trusted) || !intermediate.verify(trusted.publicKey)) {
    throw new AppleVerificationError('apple_chain_invalid');
  }
  if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) {
    throw new AppleVerificationError('apple_chain_invalid');
  }
  if (!intermediate.ca || leaf.ca || !hasOid(leaf, LEAF_OID) || !hasOid(intermediate, INTERMEDIATE_OID)) {
    throw new AppleVerificationError('apple_chain_invalid');
  }

  let payload: T;
  try {
    const leafKey = leaf.publicKey.export({ format: 'jwk' }) as JWK;
    const { payload: bytes } = await compactVerify(jws, leafKey, { algorithms: ['ES256'] });
    payload = JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new AppleVerificationError('apple_signature_invalid');
  }

  // Como la librería oficial: la cadena debe estar vigente cuando Apple firmó.
  // Un aviso reintentado días después sigue siendo válido.
  const at = typeof payload.signedDate === 'number' ? payload.signedDate : options.now ?? Date.now();
  if ((options.now ?? Date.now()) + 5 * 60_000 < at) throw new AppleVerificationError('apple_signed_in_future');
  if (![leaf, intermediate, trusted].every((c) => validAt(c, at))) {
    throw new AppleVerificationError('apple_chain_expired');
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Contenido de los JWS
// ---------------------------------------------------------------------------

export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  appAccountToken?: string;
  environment: string;
  expiresDate?: number;
  purchaseDate?: number;
  offerType?: number;
  offerDiscountType?: string;
  revocationDate?: number;
  revocationReason?: number;
  signedDate: number;
  type?: string;
}

export interface AppleRenewalInfo {
  originalTransactionId: string;
  autoRenewStatus?: number;
  autoRenewProductId?: string;
  isInBillingRetryPeriod?: boolean;
  gracePeriodExpiresDate?: number;
  environment: string;
  signedDate: number;
}

export interface AppleNotification {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  version?: string;
  signedDate: number;
  data?: {
    appAppleId?: number;
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    status?: number;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_ID = /^[0-9A-Za-z._-]{1,64}$/;

function checkEnvironment(value: unknown, options: VerifyOptions): AppleEnvironment {
  const allowed = options.environments ?? appleEnvironments();
  if (value !== 'Sandbox' && value !== 'Production') throw new AppleVerificationError('apple_environment_invalid');
  if (!allowed.includes(value)) throw new AppleVerificationError('apple_environment_invalid');
  return value;
}

export interface VerifiedProTransaction {
  transaction: AppleTransaction;
  environment: AppleEnvironment;
  tier: ProIapTier;
  /** UUID del usuario de Supabase que compró, si la app lo mandó. */
  userId: string | null;
}

export async function verifyProTransaction(jws: string, options: VerifyOptions = {}): Promise<VerifiedProTransaction> {
  const transaction = await verifyAppleJws<AppleTransaction>(jws, options);
  if (transaction.bundleId !== (options.bundleId ?? APPLE_BUNDLE_ID)) throw new AppleVerificationError('apple_bundle_mismatch');
  if (!PRO_PRODUCT_IDS.includes(transaction.productId)) throw new AppleVerificationError('apple_product_unknown');
  const tier = tierForProduct(transaction.productId);
  if (!tier) throw new AppleVerificationError('apple_product_unknown');
  if (!TRANSACTION_ID.test(String(transaction.originalTransactionId)) || !TRANSACTION_ID.test(String(transaction.transactionId))) {
    throw new AppleVerificationError('apple_transaction_invalid');
  }
  const environment = checkEnvironment(transaction.environment, options);
  const token = transaction.appAccountToken;
  const userId = typeof token === 'string' && UUID.test(token) ? token.toLowerCase() : null;
  return { transaction, environment, tier, userId };
}

export async function verifyRenewalInfo(jws: string, originalTransactionId: string, options: VerifyOptions = {}): Promise<AppleRenewalInfo> {
  const renewal = await verifyAppleJws<AppleRenewalInfo>(jws, options);
  if (renewal.originalTransactionId !== originalTransactionId) throw new AppleVerificationError('apple_renewal_mismatch');
  checkEnvironment(renewal.environment, options);
  return renewal;
}

export async function verifyNotification(signedPayload: string, options: VerifyOptions = {}): Promise<AppleNotification> {
  const note = await verifyAppleJws<AppleNotification>(signedPayload, options);
  if (typeof note.notificationType !== 'string' || typeof note.notificationUUID !== 'string' || note.notificationUUID.length > 80) {
    throw new AppleVerificationError('apple_notification_invalid');
  }
  if (note.data) {
    if (note.data.bundleId !== (options.bundleId ?? APPLE_BUNDLE_ID)) throw new AppleVerificationError('apple_bundle_mismatch');
    const environment = checkEnvironment(note.data.environment, options);
    const appId = options.appAppleId ?? APPLE_APP_ID;
    if (environment === 'Production' && note.data.appAppleId !== appId) throw new AppleVerificationError('apple_app_mismatch');
  }
  return note;
}

// ---------------------------------------------------------------------------
// Estado de la suscripción
// ---------------------------------------------------------------------------

export type ProSubscriptionStatus = 'trialing' | 'active' | 'billing_retry' | 'grace' | 'expired' | 'revoked' | 'refunded';

/** Lo que recibe la RPC pro_apply_apple_state. */
export interface ProSubscriptionState {
  user_id: string | null;
  product_id: string;
  tier: ProIapTier;
  original_transaction_id: string;
  latest_transaction_id: string;
  environment: AppleEnvironment;
  status: ProSubscriptionStatus;
  is_trial: boolean;
  auto_renew?: boolean;
  expires_at: string | null;
  grace_expires_at?: string | null;
  signed_at: string;
  notification_type: string;
}

export const HANDLED_NOTIFICATIONS = new Set([
  'SUBSCRIBED',
  'DID_RENEW',
  'DID_CHANGE_RENEWAL_STATUS',
  'DID_FAIL_TO_RENEW',
  'GRACE_PERIOD_EXPIRED',
  'EXPIRED',
  'REFUND',
  'REVOKE',
  'OFFER_REDEEMED',
]);

const iso = (ms: number | undefined) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/**
 * Traduce una transacción verificada (y su renovación, si la hay) al estado
 * que guarda Franky. Sin notificación es la llamada de la app tras comprar o
 * restaurar.
 */
export function subscriptionState(
  verified: VerifiedProTransaction,
  renewal: AppleRenewalInfo | null,
  notification: Pick<AppleNotification, 'notificationType' | 'subtype' | 'signedDate'> | null,
  now = Date.now(),
): ProSubscriptionState {
  const { transaction: tx } = verified;
  const type = notification?.notificationType ?? 'VERIFY';
  const isTrial = tx.offerDiscountType === 'FREE_TRIAL';
  const expires = typeof tx.expiresDate === 'number' ? tx.expiresDate : null;
  const grace = typeof renewal?.gracePeriodExpiresDate === 'number' ? renewal.gracePeriodExpiresDate : null;

  let status: ProSubscriptionStatus;
  let graceExpires: number | null | undefined;
  if (type === 'REVOKE') status = 'revoked';
  else if (type === 'REFUND' || typeof tx.revocationDate === 'number') status = 'refunded';
  else if (type === 'EXPIRED' || type === 'GRACE_PERIOD_EXPIRED') {
    status = 'expired';
    graceExpires = null;
  } else if (type === 'DID_FAIL_TO_RENEW') {
    if (notification?.subtype === 'GRACE_PERIOD' || (grace !== null && grace > now)) {
      status = 'grace';
      graceExpires = grace;
    } else {
      status = 'billing_retry';
      graceExpires = null;
    }
  } else if (renewal?.isInBillingRetryPeriod) {
    status = grace !== null && grace > now ? 'grace' : 'billing_retry';
    graceExpires = status === 'grace' ? grace : null;
  } else if (expires !== null && expires > now) {
    status = isTrial ? 'trialing' : 'active';
    graceExpires = null;
  } else {
    status = 'expired';
  }

  let autoRenew: boolean | undefined;
  if (renewal && typeof renewal.autoRenewStatus === 'number') autoRenew = renewal.autoRenewStatus === 1;
  else if (type === 'DID_CHANGE_RENEWAL_STATUS') autoRenew = notification?.subtype === 'AUTO_RENEW_ENABLED';

  const state: ProSubscriptionState = {
    user_id: verified.userId,
    product_id: tx.productId,
    tier: verified.tier,
    original_transaction_id: String(tx.originalTransactionId),
    latest_transaction_id: String(tx.transactionId),
    environment: verified.environment,
    status,
    is_trial: isTrial,
    expires_at: iso(expires ?? undefined),
    signed_at: new Date(notification?.signedDate ?? tx.signedDate ?? now).toISOString(),
    notification_type: type,
  };
  if (autoRenew !== undefined) state.auto_renew = autoRenew;
  if (graceExpires !== undefined) state.grace_expires_at = iso(graceExpires ?? undefined);
  return state;
}

/** Huella corta para los logs, nunca el identificador completo. */
export function transactionFingerprint(id: string) {
  return createHash('sha256').update(id).digest('hex').slice(0, 12);
}
