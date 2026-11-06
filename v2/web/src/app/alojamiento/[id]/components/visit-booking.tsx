"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, Users, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useToast } from "@/components/ui/toast";
import { useAccountScope } from '@/hooks/useAccountScope';
import { parsePaymentReply } from '../../../../../../shared/payment-contract';
import { cn } from "@/lib/utils";

/**
 * Huecos de visita de la ficha. Migración 161: get_bookable_visit_times mezcla
 * los visit_slots manuales (con slot_id) y el horario semanal de la
 * inmobiliaria (slot_id null, se materializa al reservar con book_visit_at).
 * Si la RPC nueva no existe todavía (deploy a medias), caemos al método viejo
 * get_slot_availability para no dejar la ficha sin reservas.
 */
interface BookableTime {
  slot_id: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  price_cents: number;
  available: number;
}

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2 });
}

function hhmm(t: string) {
  return t.slice(0, 5);
}

function timeKey(s: BookableTime) {
  return `${s.slot_date}|${s.start_time}`;
}

export default function VisitBooking(props: { accommodationId: string; ownerId: string | null }) {
  const account = useAccountScope();
  if (!account.ready) return null;
  return <VisitBookingContent key={account.revision + ':' + props.accommodationId} {...props} userId={account.userId} />;
}
function VisitBookingContent({ accommodationId, ownerId, userId }: { accommodationId: string; ownerId: string | null; userId: string | null }) {
  const toast = useToast();
  const supabase = useRef(createClient()).current;
  const alive = useRef(true), controller = useRef(new AbortController()), lock = useRef(false), loadRevision = useRef(0);
  const [slots, setSlots] = useState<BookableTime[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);
  const [myBookedSlots, setMyBookedSlots] = useState<Set<string>>(new Set());
  const [paymentNotice, setPaymentNotice] = useState('');
  // Retrying an uncertain payment resumes its reservation, never creates another.
  const reservations = useRef(new Map<string, string>());
  useEffect(() => {
    alive.current = true; controller.current = new AbortController();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Invalidate before React renders the replacement account's component.
      if ((session?.user.id ?? null) !== userId) controller.current.abort();
    });
    return () => { alive.current = false; controller.current.abort(); loadRevision.current++; subscription.unsubscribe(); };
  }, [supabase, userId]);
  const load = useCallback(async () => {
    const revision = ++loadRevision.current, signal = controller.current.signal;
    const current = () => alive.current && !signal.aborted && revision === loadRevision.current;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!current() || (session?.user.id ?? null) !== userId) return;
      const authorize = <T extends { setHeader(name: string, value: string): T; abortSignal(signal: AbortSignal): T }>(query: T): T => {
        if (session) query.setHeader('Authorization', 'Bearer ' + session.access_token);
        return query.abortSignal(signal);
      };
      const { data, error } = await authorize(supabase.rpc('get_bookable_visit_times', { p_accommodation_id: accommodationId, p_days: 14 }));
      if (!current()) return;
      if (!error && data) setSlots(data as BookableTime[]);
      else {
        const { data: legacy } = await authorize(supabase.rpc('get_slot_availability', { p_accommodation_id: accommodationId }));
        if (!current()) return;
        setSlots(((legacy ?? []) as Array<BookableTime & { id: string }>).map(s => ({ ...s, slot_id: s.id })));
      }
      if (session) {
        const { data: mine } = await authorize(supabase.from('visit_bookings').select('slot_id, status').eq('visitor_id', userId!).in('status', ['pending', 'confirmed']));
        if (!current()) return;
        setMyBookedSlots(new Set((mine ?? []).map(b => b.slot_id as string)));
      }
    } catch { /* Existing slots remain visible during a temporary read failure. */ }
    finally { if (current()) setLoaded(true); }
  }, [accommodationId, supabase, userId]);
  useEffect(() => { void load(); }, [load]);
  const reserve = async (slot: BookableTime) => {
    if (!userId) { toast.info('Inicia sesión para reservar una visita'); return; }
    if (lock.current) return;
    lock.current = true; setBooking(timeKey(slot)); setPaymentNotice('');
    const signal = controller.current.signal, current = () => alive.current && !signal.aborted;
    let requiresPayment = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!current() || session?.user.id !== userId) return;
      const authorization = 'Bearer ' + session.access_token;
      let bookingId = reservations.current.get(timeKey(slot));
      if (!bookingId) {
        const query = slot.slot_id ? supabase.rpc('book_visit_slot', { p_slot_id: slot.slot_id }) : supabase.rpc('book_visit_at', { p_accommodation_id: accommodationId, p_slot_date: slot.slot_date, p_start_time: slot.start_time });
        const { data, error } = await query.setHeader('Authorization', authorization).abortSignal(signal);
        if (!current()) return;
        if (error) { toast.error('No se pudo reservar', error.message); return; }
        const result = data as { booking_id?: string; requires_payment?: boolean } | null;
        if (!result?.booking_id) throw new Error('booking_unavailable');
        bookingId = result.booking_id; requiresPayment = result.requires_payment === true;
        if (requiresPayment) reservations.current.set(timeKey(slot), bookingId);
      } else requiresPayment = true;
      if (requiresPayment) {
        const response = await fetch('/api/stripe/pay/visit', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: bookingId }), signal });
        const result = parsePaymentReply(await response.json());
        if (!current()) return;
        if (response.ok && result.status === 'checkout' && result.url && !result.invalid_url) { window.location.href = result.url; return; }
        if (response.ok && result.status === 'paid') {
          reservations.current.delete(timeKey(slot)); toast.success('Pago confirmado', 'Consulta el estado de la visita en Mis visitas.'); await load(); return;
        }
        setPaymentNotice(result.error ?? (result.status === 'cancelled' ? 'El pago figura cancelado. Revisa la reserva en Mis visitas antes de intentarlo de nuevo.' : result.status === 'failed' ? 'No se ha confirmado el pago. Puedes revisar y retomar la reserva en Mis visitas.' : 'El pago sigue pendiente de confirmación. Tu reserva se conserva; revísala en Mis visitas.'));
        return;
      }
      toast.success('Visita reservada', 'Consulta sus detalles en Mis visitas.'); await load();
    } catch {
      if (current()) {
        if (requiresPayment) setPaymentNotice('No se pudo confirmar el pago. Tu reserva se conserva; puedes retomarla en Mis visitas.');
        else toast.error('No se pudo confirmar la reserva', 'Revisa Mis visitas antes de intentarlo de nuevo.');
      }
    } finally { lock.current = false; if (current()) setBooking(null); }
  };

  if (!loaded) return null;
  if (slots.length === 0) return null;

  const isOwner = ownerId != null && userId === ownerId;

  // Agrupar por día para no pintar una lista interminable de medias horas.
  const byDay = new Map<string, BookableTime[]>();
  for (const s of slots) {
    const list = byDay.get(s.slot_date) ?? [];
    list.push(s);
    byDay.set(s.slot_date, list);
  }

  // v3: tarjeta blanca con borde hairline; los huecos son chips outline que se
  // vuelven oscuros al pasar el ratón y al estar reservados. Entra con
  // animate-scale-in porque aparece después de la primera pintura.
  return (
    <div
      id="reservar-visita"
      className="animate-scale-in scroll-mt-24 rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-6"
    >
      <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
        <CalendarDays className="h-4.5 w-4.5 text-violet" />
        Reserva una visita
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Elige un hueco del horario de visitas del anunciante.
      </p>
      <div className="mt-4 max-h-96 space-y-4 overflow-y-auto pr-1">
        {[...byDay.entries()].map(([day, daySlots]) => (
          <div key={day}>
            <p className="mb-2 text-sm font-semibold capitalize text-text-primary">
              {new Date(day + "T00:00:00").toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {daySlots.map((s) => {
                const key = timeKey(s);
                const mine = s.slot_id != null && myBookedSlots.has(s.slot_id);
                const full = s.available <= 0;
                if (mine) {
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 rounded-full border border-text-primary bg-text-primary px-3 py-1.5 text-xs font-semibold text-bg-primary tabular"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      {hhmm(s.start_time)}
                    </span>
                  );
                }
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => reserve(s)}
                    disabled={isOwner || full || booking !== null}
                    title={
                      s.price_cents > 0
                        ? `Visita de pago: ${euros(s.price_cents)} €`
                        : "Visita gratuita"
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-primary px-3 py-1.5 text-xs font-semibold text-text-primary tabular transition-[background-color,color,border-color] duration-200",
                      "hover:border-text-primary hover:bg-text-primary hover:text-bg-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-bg-primary disabled:hover:text-text-primary"
                    )}
                  >
                    {booking === key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {hhmm(s.start_time)}
                    {s.price_cents > 0 && (
                      <span className="text-[11px] font-medium opacity-70">
                        {euros(s.price_cents)} €
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-1.5 border-t border-border-light pt-3 text-[11px] text-text-muted">
        <Users className="h-3 w-3" />
        Los huecos con precio se pagan online al reservar (Stripe).
      </p>
      {paymentNotice && <p role="status" className="mt-3 text-sm text-text-secondary">{paymentNotice} <Link className="underline font-semibold" href="/mis-visitas">Ver Mis visitas</Link></p>}
      {!userId && (
        <p className="mt-2 text-xs text-text-muted">
          <Link href="/login" className="link-underline font-semibold text-text-primary">
            Inicia sesión
          </Link>{" "}
          para reservar.
        </p>
      )}
    </div>
  );
}
