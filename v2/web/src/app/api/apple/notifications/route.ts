import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { readLimitedBody } from '@/lib/read-limited-body';
import {
  AppleVerificationError,
  HANDLED_NOTIFICATIONS,
  subscriptionState,
  transactionFingerprint,
  verifyNotification,
  verifyProTransaction,
  verifyRenewalInfo,
} from '@/lib/apple-iap';
import { ProStoreError, applyProState } from '@/lib/apple-iap-store';

/**
 * App Store Server Notifications V2 de Franky Pro. Apple llega sin sesión
 * (ruta pública en el middleware); lo único que se cree es lo firmado por
 * Apple. Cualquier aviso verificado responde 200, también si ya se procesó o
 * no afecta a Pro, para que Apple no lo reintente. Solo un fallo de la base
 * de datos responde 500 y deja que Apple vuelva a intentarlo.
 */
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { key: 'apple-notifications', limit: 300, windowMs: 60_000 });
  if (!limit.ok) return limit.response;

  let signedPayload: unknown;
  try {
    signedPayload = (JSON.parse(await readLimitedBody(req, 64_000)) as { signedPayload?: unknown }).signedPayload;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof signedPayload !== 'string') return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  let note;
  try {
    note = await verifyNotification(signedPayload);
  } catch (error) {
    const code = error instanceof AppleVerificationError ? error.code : 'apple_verification_failed';
    return NextResponse.json({ error: code }, { status: 400 });
  }

  if (!HANDLED_NOTIFICATIONS.has(note.notificationType) || !note.data?.signedTransactionInfo) {
    return NextResponse.json({ received: true, ignored: true });
  }

  let verified;
  let renewal = null;
  try {
    verified = await verifyProTransaction(note.data.signedTransactionInfo);
    if (note.data.signedRenewalInfo) {
      renewal = await verifyRenewalInfo(note.data.signedRenewalInfo, verified.transaction.originalTransactionId);
    }
  } catch (error) {
    // Otro producto (no es Pro) o datos que no cuadran: no hay nada que hacer
    // y reintentar no lo cambiaría.
    const code = error instanceof AppleVerificationError ? error.code : 'apple_verification_failed';
    return NextResponse.json({ received: true, ignored: true, reason: code });
  }

  const state = subscriptionState(verified, renewal, note);
  try {
    const result = await applyProState(createAdminSupabase(), state, {
      uuid: note.notificationUUID,
      type: note.notificationType,
      subtype: note.subtype ?? null,
    });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    const fingerprint = transactionFingerprint(verified.transaction.originalTransactionId);
    if (error instanceof ProStoreError && error.code !== 'pro_store_unavailable') {
      // Sin cuenta a la que asignarla o de otra cuenta: se registra y no se
      // reintenta.
      console.error('[apple-notifications] not applied', error.code, fingerprint);
      return NextResponse.json({ received: true, ignored: true, reason: error.code });
    }
    console.error('[apple-notifications] database unavailable', fingerprint);
    return NextResponse.json({ error: 'pro_store_unavailable' }, { status: 500 });
  }
}
