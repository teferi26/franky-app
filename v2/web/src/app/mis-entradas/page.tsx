import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { Calendar, MapPin, Ticket, ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, RevealItem } from "@/components/motion";
import { cn } from "@/lib/utils";
import { createServerSupabase } from "@/lib/supabase-server";
import { MADRID_TZ } from "@/lib/event-time";
import { holdDeadlineLabel, holdHasExpired, holdIsLive } from "@/lib/ticket-hold";
import PendingTicketActions from "./pending-ticket-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis entradas",
  description: "Tus entradas para eventos. Muestra el QR en la puerta.",
  robots: { index: false, follow: false },
};

// Estado de la entrada como rótulo con un punto de color: sin cajas tintadas.
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  valid: { label: "Válida", cls: "text-emerald-700 before:bg-emerald-500" },
  used: { label: "Usada", cls: "text-text-muted before:bg-text-muted" },
  refunded: { label: "Reembolsada", cls: "text-rose-700 before:bg-rose-500" },
  pending_payment: { label: "Pago pendiente", cls: "text-amber-800 before:bg-amber-500" },
};

export default async function MisEntradasPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mis-entradas");

  const { data: tickets } = await supabase
    .from("event_tickets")
    // select("*") en vez de la lista de columnas: así reserved_until (migración
    // 165) se pinta cuando existe y la página no se rompe si aún no está
    // aplicada. RLS solo devuelve las entradas del propio titular.
    .select("*")
    .eq("holder_id", user.id)
    .in("status", ["valid", "used", "pending_payment"])
    .order("created_at", { ascending: false });

  // Importe REALMENTE cobrado por entrada. event_tickets.price_cents es el
  // precio de tarifa ANTES de aplicar el código de descuento, así que pintarlo
  // como "importe pagado" mentía a quien usó un código. El importe de verdad
  // vive en el ledger `payments` (amount_cents ya lleva el descuento) y solo
  // cuenta si el pago está liquidado: 'succeeded' o reembolsado. RLS deja al
  // comprador leer sus propios pagos (payments_select_buyer, migración 085).
  const paidCentsByTicket = new Map<string, number>();
  const ticketIds = (tickets ?? []).map((t) => t.id as string);
  if (ticketIds.length > 0) {
    const { data: pagos } = await supabase
      .from("payments")
      .select("ref_id, amount_cents, status")
      .eq("ref_table", "event_tickets")
      .in("ref_id", ticketIds)
      .in("status", ["succeeded", "refunded", "partially_refunded"]);
    for (const p of pagos ?? [])
      paidCentsByTicket.set(p.ref_id as string, (p.amount_cents as number) ?? 0);
  }

  const eventIds = [...new Set((tickets ?? []).map((t) => t.event_id as string))];
  const events = new Map<
    string,
    { title: string; start_date: string; venue: string | null; city: string | null; image_url: string | null }
  >();
  if (eventIds.length > 0) {
    const { data: evs } = await supabase
      .from("events")
      .select("id, title, start_date, venue, city, image_url")
      .in("id", eventIds);
    for (const e of evs ?? [])
      events.set(e.id as string, {
        title: e.title as string,
        start_date: e.start_date as string,
        venue: (e.venue as string) ?? null,
        city: (e.city as string) ?? null,
        image_url: (e.image_url as string) ?? null,
      });
  }

  // QR por entrada válida (PNG data-URL, render servidor), en paralelo.
  const qrByTicket = new Map<string, string>();
  const validTickets = (tickets ?? []).filter((t) => t.status === "valid");
  const qrDataUrls = await Promise.all(
    validTickets.map((t) =>
      QRCode.toDataURL(t.qr_token as string, { margin: 1, width: 260 })
    )
  );
  validTickets.forEach((t, i) => qrByTicket.set(t.id as string, qrDataUrls[i]));

  const list = tickets ?? [];

  return (
    <div className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <Reveal>
            <p className="eyebrow text-violet">Tu cartera</p>
            <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary">Mis entradas</h1>
            <p className="mt-3 max-w-xl text-text-muted">
              Cada entrada lleva su QR. Enséñalo en la puerta y listo.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-10 pb-20">
        {list.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="Aún no tienes entradas"
            description="Cuando compres una entrada para un evento de pago, aparecerá aquí con su QR."
            action={{ href: "/eventos", label: "Ver eventos" }}
          />
        ) : (
          <Reveal stagger className="space-y-5">
            {list.map((t, i) => {
              const ev = events.get(t.event_id as string);
              const st = STATUS_LABEL[t.status as string] ?? STATUS_LABEL.valid;
              const qr = qrByTicket.get(t.id as string);
              const paidCents = paidCentsByTicket.get(t.id as string);
              const start = ev ? new Date(ev.start_date) : null;
              const dayNum = start?.toLocaleDateString("es-ES", { timeZone: MADRID_TZ, day: "numeric" });
              const monthShort = start?.toLocaleDateString("es-ES", { timeZone: MADRID_TZ, month: "short" }).replace(".", "");
              return (
                <RevealItem
                  key={t.id as string}
                  index={i}
                  className={cn(
                    "overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card",
                    t.status === "used" && "opacity-80"
                  )}
                >
                  {/* Tarjeta tipo ticket: cuerpo a la izquierda y talón con el QR
                      separado por una línea perforada. */}
                  <div className="flex flex-col sm:flex-row">
                    <div className="flex flex-1 gap-5 p-5 sm:p-6">
                      {start && (
                        <div className="flex w-12 shrink-0 flex-col items-center border-r border-border-light pr-5 pt-0.5">
                          <span className="font-heading text-[28px] font-extrabold leading-none tracking-tight text-text-primary tabular">{dayNum}</span>
                          <span className="eyebrow mt-1 text-[10px] text-text-muted">{monthShort}</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em]",
                          "before:inline-block before:h-1.5 before:w-1.5 before:rounded-full",
                          st.cls
                        )}>
                          {st.label}
                        </p>
                        <Link
                          href={`/eventos/${t.event_id}`}
                          className="group mt-1.5 inline-flex items-start gap-1 font-heading text-lg font-bold leading-snug text-text-primary transition-colors hover:text-violet"
                        >
                          {ev?.title ?? "Evento"}
                          <ArrowUpRight className="arrow-nudge mt-1 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
                        </Link>
                        {ev && (
                          <div className="mt-2 space-y-1 text-sm text-text-secondary">
                            <p className="flex items-center gap-1.5 capitalize">
                              <Calendar className="h-3.5 w-3.5 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                              {new Date(ev.start_date).toLocaleDateString("es-ES", {
                                timeZone: MADRID_TZ,
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                              })}
                            </p>
                            {(ev.venue || ev.city) && (
                              <p className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                                {ev.venue ? `${ev.venue}, ${ev.city}` : ev.city}
                              </p>
                            )}
                          </div>
                        )}
                        {paidCents !== undefined ? (
                          <p className="mt-3 text-sm text-text-muted">
                            Importe pagado{" "}
                            <span className="font-semibold text-text-primary tabular">
                              {(paidCents / 100).toLocaleString("es-ES", {
                                style: "currency",
                                currency: "EUR",
                              })}
                            </span>
                          </p>
                        ) : t.status === "pending_payment" &&
                          typeof t.price_cents === "number" &&
                          t.price_cents > 0 ? (
                          // Reserva sin pagar: es un importe PENDIENTE, no pagado, y
                          // puede bajar si el comprador aplica un código al pagar.
                          <p className="mt-3 text-sm text-text-muted">
                            Pendiente de pago{" "}
                            <span className="font-semibold text-amber-800 tabular">
                              {(t.price_cents / 100).toLocaleString("es-ES", {
                                style: "currency",
                                currency: "EUR",
                              })}
                            </span>
                          </p>
                        ) : null}
                        {/* La reserva guarda la plaza un rato, no para siempre
                            (migración 165): se dice cuándo caduca para que nadie
                            crea que la tiene asegurada sin pagar. */}
                        {t.status === "pending_payment" && t.reserved_until && (
                          <p className="mt-1 text-xs text-text-muted">
                            {holdIsLive(t.reserved_until as string)
                              ? `Reserva guardada hasta las ${holdDeadlineLabel(
                                  t.reserved_until as string
                                )}: si no pagas antes, la plaza vuelve a estar libre.`
                              : "La reserva ha caducado: la plaza ya está libre para otra persona. Vuelve al evento para intentarlo de nuevo."}
                          </p>
                        )}
                      </div>
                    </div>

                    {(qr || t.status === "pending_payment") && (
                      <div className="relative flex flex-col items-center justify-center gap-2 border-t border-dashed border-border bg-bg-secondary/60 p-5 sm:w-52 sm:border-l sm:border-t-0">
                        {/* Muescas de la perforación */}
                        <span aria-hidden="true" className="absolute -left-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 rounded-full border border-border bg-bg-primary sm:block" />
                        <span aria-hidden="true" className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border border-border bg-bg-primary sm:hidden" />
                        {qr ? (
                          <>
                            <Image
                              src={qr}
                              alt="QR de la entrada"
                              width={130}
                              height={130}
                              unoptimized
                              className="rounded-lg border border-border bg-bg-primary p-1"
                            />
                            <span className="eyebrow text-[10px] text-text-muted">Enséñalo en la puerta</span>
                          </>
                        ) : (
                          <PendingTicketActions
                            ticketId={t.id as string}
                            eventId={t.event_id as string}
                            expired={holdHasExpired(t.reserved_until as string | null)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </RevealItem>
              );
            })}
          </Reveal>
        )}
      </div>
    </div>
  );
}
