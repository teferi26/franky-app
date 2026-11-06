import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { validateBody } from '@/lib/api-helpers';
import { AppleVerificationError, subscriptionState, transactionFingerprint, verifyProTransaction } from '@/lib/apple-iap';
import { ProStoreError, applyProState, readProAccess } from '@/lib/apple-iap-store';

const schema = z.object({ signedTransaction: z.string().min(20).max(20_000) });
const noStore = { 'Cache-Control': 'no-store' };

/**
 * La app manda aquí la transacción firmada por Apple tras comprar o restaurar
 * Franky Pro. Solo cuenta si la firma es de Apple, el producto es de Pro y el
 * appAccountToken de la compra es el usuario de esta sesión.
 *
 * Respuesta: { pro, status, tier, product_id, expires_at, is_trial }.
 */
export async function POST(req: NextRequest) {
  const client = await createRequestSupabase(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { data: usable, error: accountError } = await client.rpc('account_session_usable');
  if (accountError || usable !== true) return NextResponse.json({ error: 'Cuenta no disponible' }, { status: 403 });

  const limit = await rateLimit(req, { key: 'apple-pro-verify', limit: 10, windowMs: 60_000, subject: user.id });
  if (!limit.ok) return limit.response;

  const body = await validateBody(req, schema, { maxBytes: 32_000 });
  if (body instanceof NextResponse) return body;

  let verified;
  try {
    verified = await verifyProTransaction(body.signedTransaction);
  } catch (error) {
    const code = error instanceof AppleVerificationError ? error.code : 'apple_verification_failed';
    return NextResponse.json({ error: code, message: 'No hemos podido comprobar la compra con Apple.' }, { status: 400 });
  }
  if (verified.userId !== user.id.toLowerCase()) {
    return NextResponse.json(
      { error: 'apple_account_mismatch', message: 'Esta compra se hizo con otra cuenta de Franky.' },
      { status: 403 },
    );
  }

  const admin = createAdminSupabase();
  try {
    await applyProState(admin, subscriptionState(verified, null, null));
    return NextResponse.json(await readProAccess(admin, user.id), { headers: noStore });
  } catch (error) {
    if (error instanceof ProStoreError && error.code === 'pro_subscription_owner_conflict') {
      return NextResponse.json(
        { error: 'apple_account_mismatch', message: 'Esta suscripción ya está unida a otra cuenta de Franky.' },
        { status: 409 },
      );
    }
    console.error('[apple-pro] could not persist verified transaction', transactionFingerprint(verified.transaction.originalTransactionId));
    return NextResponse.json({ error: 'pro_store_unavailable', message: 'Inténtalo de nuevo en unos segundos.' }, { status: 503 });
  }
}
