import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from './supabase-server';
import { createAdminSupabase } from './supabase-admin';
import { validateBody, uuid } from './api-helpers';
import { getSellerConnectAccount, refreshConnectAccount } from './connect';
import { rateLimit } from './rate-limit';
import { startMarketplaceCheckout } from './marketplace-checkout';
import { assertRealPaymentActors } from './payment-demo-guard';

const schemas = {
  ticket: z.object({ ticket_id: uuid, code: z.string().trim().min(1).max(64).optional(), return_to: z.literal('app').optional() }),
  visit: z.object({ booking_id: uuid, return_to: z.literal('app').optional() }),
  rent: z.object({ contract_id: uuid, kind: z.enum(['rent', 'deposit', 'both']), return_to: z.literal('app').optional() }),
};

export async function marketplacePay(req: NextRequest, type: 'ticket' | 'visit' | 'rent') {
  const rl = await rateLimit(req, { key: `marketplace-pay-${type}`, limit: 20, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const client = await createRequestSupabase(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const body = await validateBody(req, schemas[type] as z.ZodType<Record<string, string>>);
  if (body instanceof NextResponse) return body;
  try {
    await assertRealPaymentActors(user.id);
    const admin = createAdminSupabase();
    let resourceId: string, sellerId: string, amount: number, label: string, returnPath: string;
    const kind = type === 'rent' ? body.kind : type;
    let code: string | undefined = body.code;
    if (type === 'ticket') {
      const { data: t, error } = await client.from('event_tickets').select('id,event_id,holder_id,status,price_cents').eq('id', body.ticket_id).maybeSingle();
      if (error) throw error;
      if (!t || t.holder_id !== user.id) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 });
      if (['valid', 'used'].includes(t.status)) return NextResponse.json({ status: 'paid', free: true, url: '/mis-entradas' });
      if (t.status !== 'pending_payment') return NextResponse.json({ status: 'cancelled', error: 'Esta entrada ya no está pendiente de pago. Consulta Mis entradas.' }, { status: 409 });
      const { data: event, error: eventError } = await client.from('events').select('title,organizer_id').eq('id', t.event_id).single();
      if (eventError || !event) throw new Error('event_unavailable');
      resourceId = t.id; sellerId = event.organizer_id; amount = t.price_cents;
      label = `Entrada · ${event.title}`; returnPath = '/mis-entradas';
      // A retry may have consumed the LAST use of the code. Reuse its exact
      // existing quote; the transaction still verifies buyer/code/amount.
      const { data: previous, error: previousError } = await admin.from('payments')
        .select('amount_cents,metadata').eq('type', 'ticket').eq('ref_id', t.id).eq('buyer_id', user.id)
        .in('status', ['pending', 'processing']).order('created_at').limit(1).maybeSingle();
      if (previousError) throw previousError;
      if (previous) {
        const quotedCode = String(previous.metadata?.discount_code ?? '');
        // Missing code means resume, not remove the original discount. Changing
        // a frozen quote requires explicitly cancelling its existing order.
        if (code && code.toLowerCase() !== quotedCode.toLowerCase()) return NextResponse.json({ status: 'pending', error: 'Esta reserva ya tiene un precio guardado. Cancélala antes de cambiar el código.' }, { status: 409 });
        code = quotedCode || undefined;
        amount = previous.amount_cents;
      } else if (code) {
        const { data, error: codeError } = await client.rpc('check_discount_code', { p_event: t.event_id, p_code: code, p_price_cents: t.price_cents });
        if (codeError) throw codeError;
        const quote = Array.isArray(data) ? data[0] : data;
        if (!quote?.valid) return NextResponse.json({ error: 'El código no está disponible. Revisa si ha caducado o agotado sus usos.' }, { status: 409 });
        amount -= Math.min(amount, Math.max(0, quote.discount_cents));
      }
    } else if (type === 'visit') {
      const { data: b, error } = await client.from('visit_bookings').select('id,slot_id,visitor_id,price_cents,payment_status,status').eq('id', body.booking_id).maybeSingle();
      if (error) throw error;
      if (!b || b.visitor_id !== user.id) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
      if (b.status !== 'pending' || b.payment_status !== 'pending') return NextResponse.json({ error: 'Esta visita ya no está pendiente de pago.' }, { status: 409 });
      const { data: slot, error: slotError } = await client.from('visit_slots').select('owner_id,accommodation_id').eq('id', b.slot_id).single();
      if (slotError || !slot) throw new Error('slot_unavailable');
      resourceId = b.id; sellerId = slot.owner_id; amount = b.price_cents;
      label = 'Visita al piso (Franky)'; returnPath = `/alojamiento/${slot.accommodation_id}`;
    } else {
      const { data: c, error } = await client.from('contracts').select('id,owner_id,status,rent_cents,deposit_cents').eq('id', body.contract_id).maybeSingle();
      if (error) throw error;
      if (!c) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
      const { data: signer, error: signerError } = await client.from('contract_signers').select('role,status').eq('contract_id', c.id).eq('user_id', user.id).maybeSingle();
      if (signerError) throw signerError;
      if (c.status !== 'fully_signed' || signer?.role !== 'tenant' || signer.status !== 'signed') return NextResponse.json({ error: 'El contrato debe estar firmado por todas las partes y tú debes ser inquilino.' }, { status: 409 });
      resourceId = c.id; sellerId = c.owner_id;
      amount = kind === 'rent' ? c.rent_cents ?? 0 : kind === 'deposit' ? c.deposit_cents ?? 0 : (c.rent_cents ?? 0) + (c.deposit_cents ?? 0);
      label = kind === 'rent' ? 'Renta del alquiler (Franky)' : kind === 'deposit' ? 'Fianza del alquiler (Franky)' : 'Renta + fianza del alquiler (Franky)';
      returnPath = `/contratos/${c.id}`;
    }
    if (!Number.isSafeInteger(amount) || amount < 0 || (amount < 50 && !(type === 'ticket' && amount === 0 && code))) {
      return NextResponse.json({ error: 'El importe no permite un pago con tarjeta (mínimo 0,50 €).' }, { status: 409 });
    }
    await assertRealPaymentActors(sellerId);
    let seller = amount > 0 ? await getSellerConnectAccount(sellerId) : null;
    if (seller && !seller.charges_enabled) { await refreshConnectAccount(seller.stripe_connect_account_id); seller = await getSellerConnectAccount(sellerId); }
    if (amount > 0 && !seller?.charges_enabled) return NextResponse.json({ error: 'El vendedor todavía no puede recibir pagos.' }, { status: 409 });
    const origin = process.env.NODE_ENV === 'production' ? 'https://franky.es' : req.nextUrl.origin;
    if (body.return_to === 'app') returnPath = '/pago/retorno';
    const result = await startMarketplaceCheckout({ type, resourceId, user, kind, code, amount,
      connectAccount: seller?.stripe_connect_account_id ?? null, label,
      successUrl: `${origin}${returnPath}?pay=ok`, cancelUrl: `${origin}${returnPath}?pay=cancel` });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'demo_payments_disabled') return NextResponse.json({ status: 'failed', error: 'Esta cuenta es de demostración. Los cobros reales están desactivados.' }, { status: 403 });
    console.error('[marketplace-pay]', type, message.startsWith('payment_operation:') ? message : 'checkout_unavailable');
    const conflict = /already_|conflict|reconciliation|not_payable|not_open|quote_changed|discount_unavailable/.test(message);
    return NextResponse.json({ status: 'pending', error: conflict
      ? 'Hay un pago en curso o la reserva ha cambiado. Revisa tus reservas antes de intentarlo de nuevo. Para cambiar el código, cancela primero la reserva pendiente.'
      : 'No se ha podido confirmar el inicio del pago. Tu reserva se conserva; vuelve a intentarlo sin crear otra.' }, { status: conflict ? 409 : 503 });
  }
}
