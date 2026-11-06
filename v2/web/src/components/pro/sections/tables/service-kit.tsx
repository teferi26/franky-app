"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Combine,
  Heart,
  Star,
  Trophy,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProBooking } from "@/lib/pro/types";
import {
  bookingsToConfirm,
  confirmationMessage,
  joinOptions,
  noShowHistory,
  reviewMessage,
  upcomingEvents,
  usualFor,
  waitlistReadyMessage,
} from "@/lib/pro/tables-ops";
import {
  allergensInNote,
  canAskReview,
  droppedTables,
  eventToday,
  groupsClosingSoon,
  groupsOn,
  markContact,
  markDropped,
  rotaToday,
  safeDishes,
} from "@/lib/pro/tables-day";
import {
  addDays,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  plural,
  time,
} from "@/lib/pro/format";
import { hasAllergyNote, tableName, TURNS, turnOf } from "@/lib/pro/tables";
import { VENUE_EVENT_KIND_LABEL } from "@/lib/pro/tables-insights";
import { cn } from "@/lib/utils";
import { Avatar, LiveDot, Meter, Panel, Pill, RowList } from "../../kit";
import { sectionHref } from "../../shell";
import type { OfferPreset } from "../common/offer-composer";
import { AllergenCodes } from "./table-kit";
import { WhatsAppButton, useTablesOps } from "./ops-kit";

/**
 * Piezas del servicio de bar y restaurante: confirmar las reservas de
 * mañana, llenar la mesa que se cae, el grupo del día con su recuento de
 * platos, quién trabaja, el partido de hoy y lo que falta en cocina.
 */

/* ------------------------------------------------------------------ */
/* Confirmar por WhatsApp                                              */
/* ------------------------------------------------------------------ */

export function ConfirmPanel() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [all, setAll] = React.useState(false);
  if (!ops) return null;
  const today = localDate(now);
  const list = bookingsToConfirm(data, ops, now);
  if (!list.length) return null;
  const confirmed = list.filter((x) => x.state === "confirmed").length;
  const visible = all ? list : list.slice(0, 6);
  const mark = (id: string, field: "remindedAt" | "confirmedAt") =>
    save(`contact.${field}`, (o) => markContact(o, id, field, new Date().toISOString()));

  return (
    <Panel
      title="Confirma las reservas"
      description={`${confirmed} de ${list.length} confirmadas para hoy y mañana. Un mensaje el día antes evita la mayoría de plantones.`}
      flush
    >
      <Meter value={confirmed} max={list.length} className="rounded-none" tone="success" />
      <RowList>
        {visible.map(({ booking, state, phone }) => {
          const noShows = noShowHistory(data, {
            clientId: booking.clientId,
            name: booking.clientName,
            phone,
          });
          return (
            <div
              key={booking.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5"
            >
              <span className="w-14 shrink-0">
                <span className="block text-sm font-bold tabular">
                  {time(booking.start)}
                </span>
                <span className="block text-[0.7rem] text-text-muted">
                  {localDate(booking.start) === today ? "hoy" : "mañana"}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {booking.clientName}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                  {plural(booking.partySize, "persona", "personas")}
                  {noShows ? (
                    <Pill tone="danger">
                      No vino {plural(noShows, "vez", "veces")}
                    </Pill>
                  ) : null}
                </span>
              </span>
              {state === "confirmed" ? (
                <Pill tone="success">
                  <Check className="h-3 w-3" /> Confirmada
                </Pill>
              ) : (
                <div className="flex w-full gap-2 sm:w-auto">
                  <WhatsAppButton
                    phone={phone}
                    message={confirmationMessage(booking, data.space.name, today)}
                    label={state === "reminded" ? "Otra vez" : "Pedir"}
                    className="flex-1 sm:flex-none"
                    onOpen={() => {
                      if (state === "pending") void mark(booking.id, "remindedAt");
                    }}
                  />
                  <Button
                    size="sm"
                    variant={state === "reminded" ? "dark" : "secondary"}
                    className="h-10 flex-1 sm:flex-none"
                    onClick={async () => {
                      if (await mark(booking.id, "confirmedAt"))
                        toast.success("Confirmada", booking.clientName);
                    }}
                  >
                    Confirmó
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </RowList>
      {list.length > visible.length ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="flex h-11 w-full items-center justify-center border-t border-border-light text-sm font-semibold text-violet"
        >
          Ver las {list.length}
        </button>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Mesa que se cae                                                     */
/* ------------------------------------------------------------------ */

export function DroppedPanel({ onOffer }: { onOffer: (preset: OfferPreset) => void }) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  if (!ops) return null;
  const list = droppedTables(data, ops, now);
  if (!list.length) return null;
  const done = (id: string, how: "waitlist" | "flash" | "skip") =>
    save("dropped.handle", (o) => markDropped(o, id, how, new Date().toISOString()));

  return (
    <Panel
      title="Mesas que se han caído"
      description="Aún quedan horas de servicio: se pueden llenar."
      flush
    >
      <RowList>
        {list.map(({ booking, tables, seats, candidates }) => {
          const first = candidates.find((c) => c.phone) ?? candidates[0];
          const names = tables.length
            ? tables.map((t) => tableName(data, t.id)).join(" + ")
            : "Sin mesa";
          const turn = TURNS[turnOf(localMinutes(booking.start))].label.toLowerCase();
          return (
            <div key={booking.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
              <p className="text-sm">
                <span className="font-semibold">
                  {names} ({seats} p) libre hasta las {time(booking.end)}
                </span>
                <span className="block text-xs text-text-muted">
                  {booking.status === "no_show" ? "No vino" : "Canceló"}{" "}
                  {booking.clientName}
                  {first
                    ? ` · ${plural(candidates.length, "grupo espera", "grupos esperan")} y cabe${candidates.length === 1 ? "" : "n"}`
                    : ""}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {first ? (
                  <WhatsAppButton
                    variant="dark"
                    phone={first.phone}
                    message={waitlistReadyMessage(first.booking.clientName, data.space.name)}
                    label={`Avisar a ${first.booking.clientName.split(" ")[0]}`}
                    onOpen={() => void done(booking.id, "waitlist")}
                  />
                ) : null}
                <Button
                  size="sm"
                  variant={first ? "outline" : "dark"}
                  className="h-10"
                  onClick={() => {
                    onOffer({
                      title: "Mesa libre ahora",
                      what: `Mesa para ${seats} este ${turn}`,
                      from: Math.ceil(localMinutes(now) / 15) * 15,
                      to: localMinutes(booking.end),
                      slots: 1,
                    });
                    void done(booking.id, "flash");
                  }}
                >
                  Hueco relámpago
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10"
                  onClick={async () => {
                    if (await done(booking.id, "skip"))
                      toast.info("Mesa descartada", "Sigue libre en la sala.");
                  }}
                >
                  Dejar
                </Button>
              </div>
            </div>
          );
        })}
      </RowList>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Grupos de hoy: recuento para cocina                                 */
/* ------------------------------------------------------------------ */

export function GroupsTodayPanel() {
  const { data, now, spaceId } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const today = localDate(now);
  const groups = groupsOn(data, ops, today);
  const closing = groupsClosingSoon(data, ops, today);
  if (!groups.length && !closing.length) return null;

  return (
    <Panel
      title="Grupos"
      description={
        groups.length
          ? "El recuento de platos y las alergias, para cocina antes de abrir."
          : "Tienen que cerrar el número de personas."
      }
      action={
        <Link
          href={sectionHref(spaceId, "grupos")}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
        >
          Grupos <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        {groups.map(({ request, deal, menu, tally }) => (
          <article key={request.id} className="rounded-2xl border border-border p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{request.kind}</p>
                <p className="text-xs text-text-muted">
                  {request.organization} · {time(request.date)} ·{" "}
                  {plural(deal.finalPeople ?? request.people, "persona", "personas")}
                </p>
              </div>
              {menu ? <Pill tone="violet">{menu.name}</Pill> : null}
            </div>
            {tally ? (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {tally.courses
                    .filter((c) => c.counts.some((x) => x.n > 0))
                    .map((course) => (
                      <div key={course.label}>
                        <p className="text-xs font-semibold text-text-muted">
                          {course.label}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {course.counts
                            .filter((x) => x.n > 0)
                            .sort((a, b) => b.n - a.n)
                            .map((x) => (
                              <li key={x.dish} className="flex gap-2">
                                <span className="w-6 shrink-0 font-bold tabular">
                                  {x.n}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{x.dish}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                </div>
                {tally.allergies.length ? (
                  <ul className="mt-3 flex flex-col gap-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {tally.allergies.map((a) => (
                      <li key={a.name} className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
                        <span className="font-semibold">{a.name}:</span> {a.allergies}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {tally.missing ? (
                  <p className="mt-2 text-xs text-text-muted">
                    Faltan {plural(tally.missing, "persona", "personas")} por elegir
                    plato.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-xs text-text-muted">
                Sin menú cerrado: pregunta al organizador qué van a tomar.
              </p>
            )}
          </article>
        ))}
        {closing.length ? (
          <ul className="flex flex-col gap-2">
            {closing.map(({ deal, request, today: isToday }) => (
              <li key={deal.requestId}>
                <Link
                  href={sectionHref(spaceId, "grupos")}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm transition-colors hover:border-text-primary/25"
                >
                  <Users className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{request.kind}</span>
                    <span className="block truncate text-xs text-text-muted">
                      Cierra número {isToday ? "hoy" : "mañana"} · {request.organizer} ·{" "}
                      {dayLabel(request.date, { weekday: false })}
                    </span>
                  </span>
                  <Pill tone={isToday ? "warning" : "neutral"}>
                    {deal.finalPeople ?? request.people} p
                  </Pill>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Quién trabaja hoy                                                   */
/* ------------------------------------------------------------------ */

export function TeamTodayPanel() {
  const { data, now, spaceId, vertical } = usePro();
  const { ops } = useTablesOps();
  if (!ops || !vertical.nav.some((n) => n.id === "cuadrante")) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const list = rotaToday(ops, data.staff, today);
  if (!list.length) return null;
  const late = list.filter(
    (x) => x.from <= nowMin && x.to > nowMin && !x.person.clockedInAt,
  );
  return (
    <Panel
      title="Equipo de hoy"
      description={
        late.length
          ? `${plural(late.length, "persona no ha fichado", "personas no han fichado")} y ya le toca.`
          : "Según el cuadrante de la semana."
      }
      action={
        <Link
          href={sectionHref(spaceId, "cuadrante")}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
        >
          Turnos <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
      flush
    >
      <RowList>
        {list.map(({ person, from, to, label }) => {
          const on = from <= nowMin && to > nowMin;
          return (
            <div key={`${person.id}-${from}`} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <Avatar name={person.name} tone={person.tone} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {person.name.split(" ")[0]}
                  {label ? (
                    <span className="font-normal text-text-muted"> · {label}</span>
                  ) : null}
                </span>
                <span className="block text-xs text-text-muted tabular">
                  {minutesToLabel(from)} a {minutesToLabel(to % 1440)}
                </span>
              </span>
              {person.clockedInAt ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <LiveDot /> Fichado
                </span>
              ) : on ? (
                <Pill tone="warning">Sin fichar</Pill>
              ) : (
                <span className="text-xs text-text-muted">
                  {from > nowMin ? `Entra a las ${minutesToLabel(from)}` : "Ha salido"}
                </span>
              )}
            </div>
          );
        })}
      </RowList>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Partido o evento de hoy                                             */
/* ------------------------------------------------------------------ */

export function EventTodayPanel() {
  const { now, spaceId, vertical } = usePro();
  const { ops } = useTablesOps();
  if (!ops || !vertical.nav.some((n) => n.id === "eventos")) return null;
  const today = localDate(now);
  const current = eventToday(ops, today);
  const next = current
    ? null
    : upcomingEvents(ops, now).find(
        (e) => localDate(e.start) <= addDays(today, 7),
      );
  if (!current && !next) return null;
  const label = vertical.nav.find((n) => n.id === "eventos")?.label ?? "Eventos";
  if (!current && next) {
    return (
      <Link
        href={sectionHref(spaceId, "eventos")}
        className="flex items-center gap-3 rounded-2xl border border-border bg-bg-primary px-4 py-3 text-sm shadow-card transition-colors hover:border-text-primary/20 sm:px-5"
      >
        <Trophy className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{next.title}</span>
          <span className="block text-xs text-text-muted">
            {dayLabel(next.start)} a las {time(next.start)} ·{" "}
            {next.bookings.reduce((a, b) => a + b.people, 0)} de {next.capacity}{" "}
            apuntados
          </span>
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
      </Link>
    );
  }
  const { event, stats } = current!;
  return (
    <Panel
      title={`${VENUE_EVENT_KIND_LABEL[event.kind]} de hoy`}
      action={
        <Link
          href={sectionHref(spaceId, "eventos")}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
        >
          {label} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <p className="text-sm font-semibold">{event.title}</p>
      <p className="text-xs text-text-muted">
        {time(event.start)} a {time(event.end)}
        {event.menu ? ` · ${event.menu}` : ""}
      </p>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="font-heading text-3xl font-extrabold tracking-[-0.03em] tabular">
          {stats.free}
        </span>
        <span className="text-sm text-text-muted">
          plazas libres de {event.capacity}
        </span>
      </p>
      <Meter
        value={stats.people}
        max={event.capacity}
        className="mt-2"
        tone={stats.free <= 5 ? "warning" : "violet"}
      />
      {stats.depositsPending ? (
        <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
          {plural(stats.depositsPending, "señal pendiente", "señales pendientes")}
        </p>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Agotados                                                            */
/* ------------------------------------------------------------------ */

export function SoldOutPanel() {
  const { data, update, pending, can } = usePro();
  const toast = useToast();
  const soldOut = data.menu.filter((m) => !m.available);
  if (!soldOut.length) return null;
  return (
    <Panel
      title="Agotado ahora"
      description="No sale en la carta ni en el QR. Tócalo cuando vuelva a haber."
    >
      <div className="flex flex-wrap gap-2">
        {soldOut.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={pending || !can("menu.available")}
            onClick={async () => {
              const ok = await update("menu.available", (d) => ({
                ...d,
                menu: d.menu.map((x) => (x.id === m.id ? { ...x, available: true } : x)),
              }));
              if (ok) toast.success("Disponible otra vez", m.name);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition-colors hover:border-rose-300 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <UtensilsCrossed className="h-3.5 w-3.5" strokeWidth={1.9} />
            {m.name}
          </button>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Dentro de la ficha de una reserva                                   */
/* ------------------------------------------------------------------ */

/**
 * Lo que se sabe de esta reserva antes de sentarla: si ya falló otras
 * veces, lo de siempre, qué puede comer con su alergia, mesas para unir si
 * el grupo no cabe y la reseña al irse.
 */
export function BookingExtras({ booking }: { booking: ProBooking }) {
  const { data, now, vertical, update, pending } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  if (!ops) return null;
  const today = localDate(now);
  const client = data.clients.find((c) => c.id === booking.clientId);
  const open = booking.status === "requested" || booking.status === "confirmed";
  const noShows = noShowHistory(data, {
    clientId: booking.clientId,
    name: booking.clientName,
    phone: client?.phone,
  });
  const usual = usualFor(ops, booking.clientName);
  const avoid = hasAllergyNote(booking.note) ? allergensInNote(booking.note) : [];
  const safe = avoid.length ? safeDishes(data.menu, avoid) : [];

  // Unir mesas: solo si el grupo no cabe en la mesa que tiene.
  const date = localDate(booking.start);
  const from = localMinutes(booking.start);
  const duration = Math.round((Date.parse(booking.end) - Date.parse(booking.start)) / 60_000);
  const joined = booking.resourceIds && booking.resourceIds.length > 1 ? booking.resourceIds : null;
  const seatsNow = (joined ?? (booking.resourceId ? [booking.resourceId] : []))
    .map((id) => data.tables.find((t) => t.id === id)?.seats ?? 0)
    .reduce((a, b) => a + b, 0);
  const needsJoin =
    vertical.id !== "cafe" && open && date >= today && seatsNow < booking.partySize;
  const options = needsJoin
    ? joinOptions(data, date, from, duration, booking.partySize, booking.id)
    : [];

  const join = async (ids: string[]) => {
    const ok = await update("table.assign", (d) => ({
      ...d,
      bookings: d.bookings.map((b) =>
        b.id === booking.id ? { ...b, resourceId: ids[0], resourceIds: ids } : b,
      ),
    }));
    if (ok)
      toast.success(
        "Mesas unidas",
        `${ids.map((id) => tableName(data, id)).join(" + ")} para ${booking.clientName.split(" ")[0]}.`,
      );
  };

  const reviewReady = canAskReview(data, ops, booking);
  const reviewAsked = ops.contacts.some(
    (c) => c.bookingId === booking.id && c.reviewAskedAt,
  );

  if (!(open && noShows) && !usual && !avoid.length && !needsJoin && !joined && !reviewReady && !reviewAsked)
    return null;

  return (
    <div className="flex flex-col gap-3">
      {open && noShows ? (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.9} />
            No vino {plural(noShows, "vez", "veces")}
          </p>
          <p className="mt-0.5">
            Pídele que confirme el día antes{booking.partySize >= 6 ? " o una señal por Bizum" : ""}.
          </p>
          <WhatsAppButton
            phone={client?.phone}
            message={confirmationMessage(booking, data.space.name, today)}
            label="Pedir confirmación"
            className="mt-2"
            onOpen={() =>
              void save("contact.remindedAt", (o) =>
                markContact(o, booking.id, "remindedAt", new Date().toISOString()),
              )
            }
          />
        </div>
      ) : null}

      {usual ? (
        <p className="flex items-start gap-2 rounded-2xl border border-border px-4 py-3 text-sm">
          <Heart className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
          <span>
            <span className="font-semibold">Lo de siempre: </span>
            {usual}
          </span>
        </p>
      ) : null}

      {avoid.length ? (
        <div className="rounded-2xl border border-border px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            Puede tomar {safe.length} de {data.menu.filter((m) => m.available).length}
            <AllergenCodes list={avoid} />
          </p>
          <p className="mt-1 text-text-secondary">
            {safe
              .slice(0, 8)
              .map((m) => m.name)
              .join(", ")}
            {safe.length > 8 ? ` y ${safe.length - 8} más` : ""}
          </p>
        </div>
      ) : null}

      {joined ? (
        <p className="flex items-center gap-2 rounded-2xl border border-border px-4 py-3 text-sm">
          <Combine className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
          <span>
            <span className="font-semibold">Mesas unidas: </span>
            {joined.map((id) => tableName(data, id)).join(" + ")} ({seatsNow} p)
          </span>
        </p>
      ) : null}

      {needsJoin ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-3">
          <p className="text-sm font-semibold">
            No caben en una mesa: une dos o tres
          </p>
          {options.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {options.map((set) => (
                <button
                  key={set.map((t) => t.id).join("+")}
                  type="button"
                  disabled={pending}
                  onClick={() => void join(set.map((t) => t.id))}
                  className="flex min-h-10 flex-col items-start justify-center rounded-xl border border-border px-3 py-1 text-left text-sm hover:border-text-primary/25"
                >
                  <span className="font-semibold">
                    {set.map((t) => tableName(data, t.id)).join(" + ")}
                  </span>
                  <span className="text-xs text-text-muted">
                    {set.reduce((a, t) => a + t.seats, 0)} p · {set[0].zone}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-text-muted">
              A esa hora no quedan mesas libres juntas en la misma zona.
            </p>
          )}
        </div>
      ) : null}

      {reviewReady ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm">
          <Star className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
          <span className="min-w-0 flex-1">
            Se acaba de ir contento: es el momento de pedirle la reseña.
          </span>
          <WhatsAppButton
            phone={client?.phone}
            message={reviewMessage(booking.clientName, data.space.name, ops.reviewLink ?? "")}
            label="Pedir reseña"
            onOpen={() =>
              void save("contact.reviewAskedAt", (o) =>
                markContact(o, booking.id, "reviewAskedAt", new Date().toISOString()),
              )
            }
          />
        </div>
      ) : reviewAsked ? (
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <Check className="h-3.5 w-3.5" /> Reseña pedida
        </p>
      ) : null}
    </div>
  );
}
