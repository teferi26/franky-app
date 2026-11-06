import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from './supabase-server';
import { createAdminSupabase } from './supabase-admin';
import { validateBody, uuid } from './api-helpers';
import { closeMarketplacePayment, paymentRpc } from './marketplace-checkout';
import { rateLimit } from './rate-limit';
import { assertRealPaymentActors } from './payment-demo-guard';

export async function marketplaceCancel(req: NextRequest, type: 'ticket' | 'visit') {
  const rl = await rateLimit(req, { key: `marketplace-cancel-${type}`, limit: 15, windowMs: 60_000 });
  if (!rl.ok) return rl.response;
  const client = await createRequestSupabase(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const body = await validateBody(req, z.object({ ticket_id: uuid.optional(), booking_id: uuid.optional() }));
  if (body instanceof NextResponse) return body;
  const id = type === 'ticket' ? body.ticket_id : body.booking_id;
  if (!id) return NextResponse.json({ error: 'Falta la reserva' }, { status: 400 });
  try {
    await assertRealPaymentActors(user.id);
    if (type === 'ticket') {
      const { data: t, error } = await client.from('event_tickets').select('holder_id,status').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!t || t.holder_id !== user.id) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 });
      if (t.status !== 'pending_payment') return NextResponse.json({ error: 'Solo puedes cancelar una reserva sin pagar.' }, { status: 409 });
    } else {
      const { data: b, error } = await client.from('visit_bookings').select('visitor_id,slot_id,payment_status').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!b) return NextResponse.json({ error: 'Visita no encontrada' }, { status: 404 });
      const { data: slot, error: slotError } = await client.from('visit_slots').select('owner_id,accommodation_id').eq('id', b.slot_id).single();
      if (slotError) throw slotError;
      if (b.visitor_id !== user.id && slot?.owner_id !== user.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      if (b.payment_status === 'paid') {
        let refundUrl = `/devoluciones?booking=${id}`;
        if (b.visitor_id !== user.id) {
          const { data: home } = await client.from('accommodations').select('organization_id').eq('id', slot!.accommodation_id).maybeSingle();
          refundUrl = home?.organization_id ? `/espacios/devolucion-visita?organization=${home.organization_id}&booking=${id}` : '/contacto';
        }
        return NextResponse.json({ error: 'Esta visita está pagada. Abre su solicitud para revisar la devolución antes de cancelar.', refund_url: refundUrl }, { status: 409 });
      }
    }
    const { data: orders, error } = await createAdminSupabase().from('payments').select('id,status').eq('type', type).eq('ref_id', id)
      .in('status', ['pending', 'processing', 'failed', 'canceled']).order('id');
    if (error) throw error;
    for (const order of orders ?? []) {
      if (!await closeMarketplacePayment(order.id)) return NextResponse.json({ error: 'El pago ya se ha completado. Revisa tu reserva; no se ha cancelado.' }, { status: 409 });
    }
    if (type === 'ticket') {
      if (!await paymentRpc<boolean>('cancel_unpaid_ticket', { p_ticket: id, p_actor: user.id })) throw new Error('reservation_changed');
    } else {
      const { error: cancelError } = await client.rpc('cancel_visit_booking', { p_booking_id: id });
      if (cancelError) throw cancelError;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo confirmar el cierre del pago. La reserva se conserva. Reintenta en unos minutos o contacta con soporte.' }, { status: 503 });
  }
}
