"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ticket, LogIn, CheckCircle2, Wallet, AlertCircle, Clock, ExternalLink, TicketPercent } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import EventShirtSize from "../components/event-shirt-size";
import { EVENT_ADMISSION_REJECTED } from '../../../../../shared/event-admission';
import { parsePaymentReply, safeStripeUrl } from '../../../../../shared/payment-contract';
import { useAccountScope } from '@/hooks/useAccountScope';

// Motivos de la RPC check_discount_code (migración 136) en español.
const DISCOUNT_REASONS: Record<string, string> = {
  not_found: "Ese código no existe para este evento.",
  expired: "Ese código ha caducado.",
  exhausted: "Ese código ya no tiene usos disponibles.",
  no_auth: "Inicia sesión para usar un código.",
};

// Céntimos a "12,50" en formato español para pintar precios.
function eurFromCents(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

type TicketPurchaseProps = {
  eventId: string;
  price: number;
  accountId: string | null;
  isLoggedIn: boolean;
  isPast: boolean;
  isOrganizer: boolean;
  hasTicket: boolean;
  pendingReservation?: boolean;
  soldOut: boolean;
  connectStatus: "active" | "pending" | "none";
  shirtsEnabled?: boolean;
};

export default function TicketPurchase(props: TicketPurchaseProps) {
  const account = useAccountScope(), router = useRouter();
  const mismatch = account.ready && account.userId !== props.accountId;
  useEffect(() => { if (mismatch) router.refresh(); }, [mismatch, account.revision, router]);
  if (!account.ready || mismatch) return <p role="status" className="text-sm text-text-secondary">Actualizando tu sesión…</p>;
  return <TicketPurchaseContent key={`${account.revision}:${props.eventId}`} {...props} />;
}

function TicketPurchaseContent({
  eventId,
  price,
  accountId,
  isLoggedIn,
  isPast,
  isOrganizer,
  hasTicket,
  pendingReservation = false,
  soldOut,
  connectStatus,
  shirtsEnabled = false,
}: TicketPurchaseProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useRef(createClient()).current;
  const alive = useRef(true), controller = useRef(new AbortController()), lock = useRef(false), codeRevision = useRef(0);
  const quote = useRef<{ ticketId: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reserved, setReserved] = useState(false);
  const [paid, setPaid] = useState(false);
  useEffect(() => {
    alive.current = true; controller.current = new AbortController();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (session?.user.id ?? null) !== accountId) {
        alive.current = false; controller.current.abort(); codeRevision.current++;
      }
    });
    return () => { alive.current = false; controller.current.abort(); codeRevision.current++; subscription.unsubscribe(); };
  }, [supabase, accountId]);
  // Código de descuento (migración 136): el cliente lo valida con la RPC para
  // enseñar el precio final ANTES de pagar; el importe real lo revalida y lo
  // fija SIEMPRE el servidor en /api/stripe/pay/ticket.
  const [codeInput, setCodeInput] = useState("");
  const [codeChecking, setCodeChecking] = useState(false);
  const [discount, setDiscount] = useState<{ code: string; cents: number } | null>(null);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const payStatus = searchParams.get("ticket");

  const priceCents = Math.round(price * 100);
  const finalCents = discount ? Math.max(0, priceCents - discount.cents) : priceCents;

  // Valida el código contra check_discount_code y guarda el descuento para
  // pintar el precio final. Es solo informativo: si algo cambia entre esta
  // validación y el pago, el servidor corta la compra con el motivo real.
  async function applyCode() {
    const code = codeInput.trim();
    if (!code || lock.current || quote.current) return;
    const revision = ++codeRevision.current, signal = controller.current.signal;
    const current = () => alive.current && !signal.aborted && codeRevision.current === revision;
    setCodeChecking(true);
    setCodeMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!current() || session?.user.id !== accountId) return;
      const { data, error: rpcErr } = await supabase.rpc("check_discount_code", {
        p_event: eventId,
        p_code: code,
        p_price_cents: priceCents,
      }).setHeader('Authorization', 'Bearer ' + session.access_token).abortSignal(signal);
      if (!current()) return;
      if (rpcErr) {
        setDiscount(null);
        setCodeMsg("No se pudo comprobar el código. Inténtalo de nuevo.");
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as
        | { valid: boolean; discount_cents: number; reason: string | null }
        | null;
      if (row?.valid) {
        setDiscount({ code, cents: row.discount_cents });
        setCodeMsg(null);
      } else {
        setDiscount(null);
        setCodeMsg(DISCOUNT_REASONS[row?.reason ?? ""] ?? "Ese código no es válido.");
      }
    } catch {
      if (!current()) return;
      setDiscount(null);
      setCodeMsg("No se pudo comprobar el código. Inténtalo de nuevo.");
    } finally {
      if (current()) setCodeChecking(false);
    }
  }

  function removeCode() {
    if (lock.current || quote.current) return;
    codeRevision.current++;
    setDiscount(null);
    setCodeInput("");
    setCodeMsg(null);
  }

  async function buy() {
    if (lock.current || codeChecking || !accountId) return;
    lock.current = true;
    const signal = controller.current.signal, current = () => alive.current && !signal.aborted;
    const selectedCode = discount?.code;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!current() || session?.user.id !== accountId) return;
      const authorization = 'Bearer ' + session.access_token;
      // Reserva la entrada (controla el aforo y crea la fila pending_payment).
      if (!quote.current) {
        const { data, error: rpcErr } = await supabase.rpc("reserve_event_ticket", { p_event_id: eventId })
          .setHeader('Authorization', authorization).abortSignal(signal);
        if (!current()) return;
        if (rpcErr) {
          setError(rpcErr.message?.includes('event_audience_forbidden') ? EVENT_ADMISSION_REJECTED : rpcErr.message || "No se pudo reservar la entrada");
          return;
        }
        const ticketId = (data as { ticket_id?: string } | null)?.ticket_id;
        if (!ticketId) throw new Error('reservation_unconfirmed');
        quote.current = { ticketId, ...(selectedCode ? { code: selectedCode } : {}) };
        setReserved(true);
      }
      const res = await fetch("/api/stripe/pay/ticket", {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          ticket_id: quote.current.ticketId,
          // Solo se manda el código si el comprador lo aplicó con éxito; el
          // servidor lo revalida igualmente antes de cobrar.
          ...(quote.current.code ? { code: quote.current.code } : {}),
        }),
      });
      const result = parsePaymentReply(await res.json());
      if (!current()) return;
      if (res.ok && result.status === 'paid') { setPaid(true); router.refresh(); return; }
      if (res.ok && result.status === 'checkout' && result.url && !result.invalid_url) { window.location.href = result.url; return; }
      setError(result.error ?? (result.status === 'cancelled' ? 'El pago figura cancelado. Revisa la entrada antes de reintentar.' : result.status === 'failed' ? 'No se ha confirmado el pago. Puedes revisar y retomar tu entrada.' : 'El pago sigue pendiente de confirmación. Tu reserva se conserva; revísala en Mis entradas.'));
    } catch {
      if (current()) setError('No se pudo confirmar el pago. Revisa Mis entradas antes de reintentar; no hemos cancelado tu reserva.');
    } finally {
      lock.current = false;
      if (current()) setLoading(false);
    }
  }

  // Onboarding de Stripe Connect para el organizador. Reutiliza la ruta genérica
  // por usuario y vuelve a esta página al terminar.
  async function connectPayouts() {
    if (lock.current || !accountId) return;
    lock.current = true;
    const signal = controller.current.signal, current = () => alive.current && !signal.aborted;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!current() || session?.user.id !== accountId) return;
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { Authorization: 'Bearer ' + session.access_token, "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({ return_to: `/eventos/${eventId}` }),
      });
      const json = await res.json();
      if (!current()) return;
      const url = json.url === 'https://franky.es/api/partners/origin/connect' ? json.url : safeStripeUrl(json.url, ['connect.stripe.com', 'dashboard.stripe.com']);
      if (!res.ok || !url) {
        setError(json.error || "No se pudo iniciar la conexión de cobros");
        setLoading(false);
        return;
      }
      window.location.href = url;
    } catch {
      if (current()) setError("Error de red al conectar los cobros");
    } finally {
      lock.current = false;
      if (current()) setLoading(false);
    }
  }

  if (hasTicket || paid) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Tienes tu entrada
        </p>
        {shirtsEnabled && <EventShirtSize eventId={eventId} />}
        <Button asChild variant="outline" className="w-full">
          <Link href="/mis-entradas">Ver mis entradas</Link>
        </Button>
      </div>
    );
  }

  if (pendingReservation) return <div className="space-y-3"><p role="status" className="text-sm text-amber-700">Tienes una reserva pendiente de pago. Comprueba su estado antes de comprar otra entrada.</p><Button asChild variant="outline" className="w-full"><Link href="/mis-entradas">Revisar Mis entradas</Link></Button></div>;

  if (isPast) {
    return (
      <p className="py-2 text-center text-sm text-text-muted">
        Este evento ya ha finalizado
      </p>
    );
  }

  if (isOrganizer) {
    return (
      <div className="space-y-3">
        {connectStatus === "active" ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Cobros activos · recibirás el dinero de las entradas
          </p>
        ) : connectStatus === "pending" ? (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden="true" />
              <span>
                Tus cobros están <strong>pendientes de verificación</strong> por
                Stripe. En cuanto activen tu cuenta podrás recibir el dinero de
                las entradas. Si falta algún dato, complétalo en Stripe.
              </span>
            </p>
            {error && <p role="alert" className="text-center text-xs font-medium text-error">{error}</p>}
            <Button onClick={connectPayouts} loading={loading} variant="outline" className="w-full">
              {!loading && <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
              Continuar en Stripe
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden="true" />
              <span>
                Conecta tus cobros para recibir el dinero de las entradas de
                este evento.
              </span>
            </p>
            {error && <p role="alert" className="text-center text-xs font-medium text-error">{error}</p>}
            <Button onClick={connectPayouts} loading={loading} className="w-full">
              {!loading && <Wallet className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
              Conectar cobros
            </Button>
          </div>
        )}
        <Button asChild variant="outline" className="w-full">
          <Link href={`/eventos/${eventId}/entradas`}>Validar entradas</Link>
        </Button>
      </div>
    );
  }

  // El organizador todavía no puede recibir dinero: reservar y pasar por
  // Stripe acabaría en error (409 "El organizador aún no puede recibir
  // cobros") DESPUÉS de haber consumido una plaza del aforo. Mejor decirlo.
  if (connectStatus !== "active" && priceCents > 0) {
    return (
      <p className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden="true" />
        <span>
          Las entradas todavía no están a la venta: el organizador está terminando
          de configurar sus cobros. Vuelve en un rato.
        </span>
      </p>
    );
  }

  if (!isLoggedIn) {
    return (
      <Button asChild className="w-full">
        <Link href={`/login?next=/eventos/${eventId}`}>
          <LogIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Inicia sesión para comprar
        </Link>
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      {payStatus === "cancel" && (
        <p className="text-center text-xs text-amber-700">
          Has vuelto del pago. Revisa su estado en Mis entradas antes de reintentar.
        </p>
      )}

      {/* Código de descuento (migración 136): precio final visible ANTES de pagar */}
      {!soldOut && (
        <div className="space-y-2">
          {discount ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-secondary/60 p-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-primary">
                <TicketPercent className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.75} aria-hidden="true" />
                <span className="truncate">
                  Código {discount.code.toUpperCase()}: -{eurFromCents(Math.min(discount.cents, priceCents))}€
                </span>
              </div>
              <button
                type="button"
                onClick={removeCode}
                disabled={loading || reserved}
                className="shrink-0 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
              >
                Quitar
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <label htmlFor="discount-code" className="sr-only">
                ¿Tienes un código?
              </label>
              <input
                id="discount-code"
                type="text"
                value={codeInput}
                disabled={loading || reserved || codeChecking}
                onChange={(e) => {
                  codeRevision.current++;
                  setCodeInput(e.target.value);
                  setCodeMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCode();
                  }
                }}
                placeholder="¿Tienes un código?"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={64}
                className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-bg-primary px-3.5 py-2 text-sm uppercase text-text-primary transition-[border-color,box-shadow] duration-200 placeholder:normal-case placeholder:text-text-muted hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={applyCode}
                loading={codeChecking}
                disabled={!codeInput.trim() || loading || reserved}
                className="h-10 shrink-0"
              >
                Aplicar
              </Button>
            </div>
          )}
          {codeMsg && <p role="alert" className="text-xs font-medium text-error">{codeMsg}</p>}
          {discount && finalCents !== priceCents && (
            <p className="text-center text-xs text-text-muted">
              Antes <span className="line-through">{eurFromCents(priceCents)}€</span>{" "}
              · ahora <span className="font-semibold text-violet">{eurFromCents(finalCents)}€</span>
            </p>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-center text-xs font-medium text-error">{error}</p>}
      {(reserved || error || payStatus === 'ok' || payStatus === 'cancel') && <Link className="block text-center text-sm font-semibold underline" href="/mis-entradas">Revisar Mis entradas</Link>}
      <Button onClick={buy} loading={loading} disabled={soldOut || codeChecking} size="lg" className="w-full">
        {!loading && <Ticket className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
        {soldOut
          ? "Entradas agotadas"
          : finalCents === 0
          ? "Conseguir entrada gratis"
          : `Comprar entrada · ${eurFromCents(finalCents)}€`}
      </Button>
    </div>
  );
}
