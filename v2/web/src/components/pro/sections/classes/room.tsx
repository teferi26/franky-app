"use client";

import * as React from "react";
import { BadgeCheck, Cake, Check, Clock3, DoorOpen, Languages, MessageCircle, Sparkles, Star, UserX, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProBooking, ProClassSession, ProPayment } from "@/lib/pro/types";
import type { ProRoomBooking } from "@/lib/pro/classes-types";
import { addDays, dayLabel, localDate, money, plural, time } from "@/lib/pro/format";
import { withRoster } from "@/lib/pro/classes";
import { CHARGE_METHOD_LABEL, extrasOf, withExtras } from "@/lib/pro/classes-care";
import {
  arrivalWindow,
  cancelVerdict,
  lateMessage,
  patchRoomBooking,
  priceForPlayers,
  reminderMessage,
  reviewCandidates,
  reviewMessage,
  roomBookingOf,
  roomsReady,
  setPlayers,
  tomorrowGroups,
  typeExtra,
  type RoomGroup,
} from "@/lib/pro/classes-ops";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Empty, FormField, Panel, Pill, inputClass } from "../../kit";
import { Figure, Stepper } from "./ui";
import { RoomResultForm } from "./retos";
import { resultForBooking, formatRecord } from "@/lib/pro/classes-play";
import { setBirthday as saveBirthday } from "@/lib/pro/classes-leisure";
import { BirthdayExtras, CompanyInvoice } from "./leisure";

/**
 * Operación de salas de ocio (escape room y talleres): la ficha de cada
 * reserva, la llegada con sus minutos de cortesía, el cobro en recepción con
 * los jugadores reales, los recordatorios de mañana, la reseña al salir y la
 * caja del día.
 */

const DESK_METHODS: ProPayment["method"][] = ["card", "bizum", "cash"];

/** Mismo criterio que el resto del motor: llegó por Franky, un hueco, la Card o un grupo. */
function isFromFranky(source: ProBooking["source"] | undefined) {
  return source === "franky" || source === "hueco" || source === "card" || source === "grupo";
}

/* ------------------------------------------------------------------ */
/* Ficha de la reserva de sala                                         */
/* ------------------------------------------------------------------ */

export function RoomBookingCard({ session, booking }: { session: ProClassSession; booking: ProBooking }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const info = roomBookingOf(data, booking.id);
  const extra = typeExtra(data, session.classTypeId);
  const ct = data.classTypes.find((c) => c.id === session.classTypeId);
  const policy = extrasOf(data).policy;
  const players = info.players ?? booking.partySize;
  const min = extra.roomMode?.minPlayers ?? 1;
  const max = extra.roomMode?.maxPlayers ?? Math.max(players, ct?.capacity ?? 6);
  const price = priceForPlayers(extra.playerPrices, players, Boolean(booking.student));
  const arrival = arrivalWindow(session, now, policy.courtesyMin);
  const paid = Boolean(info.paidMethod);
  const [method, setMethod] = React.useState<ProPayment["method"]>("card");
  const [editing, setEditing] = React.useState(false);
  const [notes, setNotes] = React.useState(info.notes ?? "");
  const [birthday, setBirthday] = React.useState(info.birthdayOf ?? "");
  const place = data.space.name;
  const group: RoomGroup = { session, booking, info, typeName: ct?.name ?? "la sala" };

  const patch = (label: string, changes: Partial<ProRoomBooking>) => void update(label, (d) => patchRoomBooking(d, booking.id, changes));

  const changePlayers = (n: number) => void update("room.players", (d) => setPlayers(d, session.id, booking.id, n, now));

  const arrive = () => {
    void update("room.arrived", (d) =>
      patchRoomBooking(
        withRoster(d, session.id, now, (list) => list.map((b) => (b.id === booking.id ? { ...b, status: "arrived" as const } : b))),
        booking.id,
        { arrival: "arrived" },
      ),
    );
  };

  const noShow = () => {
    void update("room.no_show", (d) => {
      const marked = withRoster(d, session.id, now, (list) => list.map((b) => (b.id === booking.id ? { ...b, status: "no_show" as const } : b)));
      const withClient = booking.clientId
        ? { ...marked, clients: marked.clients.map((c) => (c.id === booking.clientId ? { ...c, noShows: c.noShows + 1 } : c)) }
        : marked;
      return patchRoomBooking(withClient, booking.id, { arrival: "no_show" });
    });
    toast.success("No presentado", `Queda en la ficha de ${booking.clientName.split(" ")[0]}. ${cancelVerdict(policy, session.start, now).detail}`);
  };

  const charge = () => {
    const payment: ProPayment = {
      id: localId("pt"),
      at: now.toISOString(),
      bookingId: booking.id,
      clientName: booking.clientName,
      staffId: session.coachId,
      concept: ct?.name ?? "Sala",
      amountCents: price,
      tipCents: 0,
      method,
    };
    void update("room.charge", (d) => {
      const withPay = { ...d, payments: [...d.payments, payment] };
      const marked = withRoster(withPay, session.id, now, (list) =>
        list.map((b) => (b.id === booking.id ? { ...b, priceCents: price, paidCents: price, status: b.status === "confirmed" ? ("arrived" as const) : b.status } : b)),
      );
      return patchRoomBooking(marked, booking.id, { paidMethod: method, paidCents: price, arrival: "arrived" });
    });
    toast.success("Cobrado", `${money(price)} por ${CHARGE_METHOD_LABEL[method].toLowerCase()}, ${plural(players, "jugador", "jugadores")}.`);
  };

  const lateLink =
    arrival.phase === "courtesy" ? customerWhatsApp(info.phone, lateMessage(group, place, arrival.minutesLeft)) : undefined;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border p-4">
      <div className="flex items-start gap-3">
        <Avatar name={booking.clientName} tone={booking.status === "arrived" ? "emerald" : "violet"} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{booking.clientName}</span>
            {booking.student ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
            {info.language === "en" ? (
              <Pill tone="info">
                <Languages className="h-3 w-3" /> En inglés
              </Pill>
            ) : null}
            {info.birthdayOf ? (
              <Pill tone="violet">
                <Cake className="h-3 w-3" /> Cumple de {info.birthdayOf}
              </Pill>
            ) : null}
            {info.minors ? <Pill tone="warning">Con menores</Pill> : null}
            {isFromFranky(booking.source) ? (
              <span className="inline-flex items-center gap-1 text-violet-deep">
                <Sparkles className="h-3 w-3" /> Vino por Franky
              </span>
            ) : info.howFound ? (
              <span>Nos conoció por {info.howFound.toLowerCase()}</span>
            ) : null}
          </p>
          {info.notes ? <p className="mt-1.5 text-sm text-text-secondary">{info.notes}</p> : null}
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} className="h-10 shrink-0 rounded-xl px-2 text-sm font-semibold text-violet">
          {editing ? "Cerrar" : "Editar"}
        </button>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-bg-secondary p-3">
          <FormField label="Idioma de la partida">
            <ChoiceChips
              value={info.language ?? "es"}
              onChange={(v) => patch("room.language", { language: v })}
              options={[
                { value: "es" as const, label: "Español" },
                { value: "en" as const, label: "Inglés" },
              ]}
            />
          </FormField>
          <label className="flex min-h-10 items-center gap-2.5 text-sm">
            <input type="checkbox" checked={Boolean(info.minors)} onChange={(e) => patch("room.minors", { minors: e.target.checked })} className="h-4 w-4 accent-[var(--color-violet)]" />
            Vienen menores (con un adulto)
          </label>
          <FormField label="Cumpleaños de" htmlFor={`bd-${booking.id}`}>
            <input id={`bd-${booking.id}`} value={birthday} onChange={(e) => setBirthday(e.target.value)} onBlur={() => void update("room.birthday", (d) => saveBirthday(d, booking, session, birthday))} className={inputClass} placeholder="Nombre" />
          </FormField>
          <FormField label="Notas para recepción" htmlFor={`nt-${booking.id}`}>
            <input id={`nt-${booking.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => patch("room.notes", { notes: notes.trim() || undefined })} className={inputClass} placeholder="Traen tarta, alergias..." />
          </FormField>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-text-muted">Jugadores</p>
          <Stepper value={players} onChange={changePlayers} min={min} max={max} label="Jugadores" />
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-text-muted">{booking.student ? "Precio estudiante" : "Precio"}</p>
          <p className="font-heading text-2xl font-extrabold tabular">{money(price)}</p>
          <p className="text-xs text-text-muted tabular">{money(Math.round(price / Math.max(1, players)))} por persona</p>
        </div>
      </div>

      {booking.status !== "arrived" && booking.status !== "no_show" && arrival.phase !== "over" ? (
        <div className={cn("rounded-2xl p-3", arrival.phase === "lost" ? "bg-rose-50 dark:bg-rose-950/40" : arrival.phase === "courtesy" ? "bg-amber-50 dark:bg-amber-950/40" : "bg-bg-secondary")}>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Clock3 className="h-4 w-4" strokeWidth={1.8} />
            {arrival.phase === "before"
              ? arrival.minutes > 90
                ? `Empieza a las ${time(session.start)}`
                : `Empieza en ${arrival.minutes} min`
              : arrival.phase === "courtesy"
                ? `Llegan tarde: quedan ${arrival.minutesLeft} min de cortesía`
                : `Cortesía agotada, ${arrival.minutesLate} min tarde`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="dark" onClick={arrive}>
              <Check className="h-3.5 w-3.5" /> Han llegado
            </Button>
            {lateLink ? (
              <Button size="sm" variant="secondary" asChild>
                <a href={lateLink} target="_blank" rel="noreferrer" onClick={() => patch("room.late", { lateNotifiedAt: now.toISOString(), arrival: "late" })}>
                  <MessageCircle className="h-3.5 w-3.5" /> Llegan tarde
                </a>
              </Button>
            ) : null}
            {arrival.phase !== "before" ? (
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={noShow}>
                <UserX className="h-3.5 w-3.5" /> No se han presentado
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <BirthdayExtras bookingId={booking.id} />

      {booking.status === "no_show" ? <Pill tone="danger">No se presentaron</Pill> : null}

      {booking.status === "arrived" && new Date(session.start).getTime() <= now.getTime() ? <ResultBlock session={session} booking={booking} /> : null}

      {booking.status !== "no_show" ? (
        paid ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" /> Cobrado {money(info.paidCents ?? price)} por {CHARGE_METHOD_LABEL[info.paidMethod!].toLowerCase()}
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2 border-t border-border-light pt-3">
            <FormField label="Cobrar en recepción" className="min-w-0 flex-1">
              <ChoiceChips value={method} onChange={setMethod} options={DESK_METHODS.map((m) => ({ value: m, label: CHARGE_METHOD_LABEL[m] }))} />
            </FormField>
            <Button variant="dark" onClick={charge}>
              <Wallet className="h-4 w-4" /> Cobrar {money(price)}
            </Button>
          </div>
        )
      ) : null}

      {booking.status !== "no_show" ? <CompanyInvoice session={session} booking={booking} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hoy: salas, recordatorios de mañana y reseñas                       */
/* ------------------------------------------------------------------ */

export function RoomsReadyLine() {
  const { data, now } = usePro();
  const rooms = roomsReady(data, now);
  if (!rooms.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {rooms.map((r) => (
        <span key={r.room} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-primary px-3 py-1.5 text-sm">
          <DoorOpen className={cn("h-3.5 w-3.5", r.busy ? "text-amber-600" : "text-emerald-600")} strokeWidth={1.8} />
          <span className="font-semibold">{r.room}</span>
          <span className="text-text-muted">{r.busy ? `lista a las ${time(r.readyAt)}` : "lista"}</span>
        </span>
      ))}
    </div>
  );
}

export function TomorrowReminders() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const groups = tomorrowGroups(data, now);
  const policy = extrasOf(data).policy;
  const pending = groups.filter((g) => !g.info.remindedAt);

  const mark = (g: RoomGroup) => void update("room.remind", (d) => patchRoomBooking(d, g.booking.id, { remindedAt: now.toISOString() }));

  return (
    <Panel
      title="Recordatorios de mañana"
      description={groups.length ? `${plural(groups.length, "grupo", "grupos")} mañana, ${pending.length ? `${pending.length} sin recordar` : "todos recordados"}. Es lo que más baja los no presentados.` : undefined}
      flush
    >
      {groups.length ? (
        <ul className="divide-y divide-border-light">
          {groups.map((g) => {
            const link = customerWhatsApp(g.info.phone, reminderMessage(g, data.space.name, data.space.address, policy.courtesyMin));
            const done = Boolean(g.info.remindedAt);
            return (
              <li key={g.booking.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="w-11 shrink-0 font-heading text-sm font-bold tabular">{time(g.session.start)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{g.booking.clientName}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {g.typeName} · {plural(g.info.players ?? g.booking.partySize, "jugador", "jugadores")}
                    {g.info.language === "en" ? " · en inglés" : ""}
                  </span>
                </span>
                {done ? (
                  <Pill tone="success">
                    <Check className="h-3 w-3" /> Recordado
                  </Pill>
                ) : link ? (
                  <Button size="sm" variant="secondary" asChild>
                    <a href={link} target="_blank" rel="noreferrer" onClick={() => mark(g)}>
                      <MessageCircle className="h-3.5 w-3.5" /> Recordar
                    </a>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      mark(g);
                      toast.success("Marcado como recordado");
                    }}
                  >
                    Hecho
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={MessageCircle} title="Mañana no hay grupos" body="Cuando alguien reserve para mañana, aquí tendrás su recordatorio listo para enviar." />
      )}
    </Panel>
  );
}

export function ReviewAsk() {
  const { data, now, update } = usePro();
  const x = extrasOf(data);
  const list = reviewCandidates(data, now);
  if (!list.length && !x.reviews.asked) return null;

  const ask = (g: RoomGroup) =>
    void update("room.review", (d) =>
      withExtras(patchRoomBooking(d, g.booking.id, { reviewAskedAt: now.toISOString() }), (e) => ({ ...e, reviews: { ...e.reviews, asked: e.reviews.asked + 1 } })),
    );

  return (
    <Panel
      title="Acaban de salir"
      description={`Pide la reseña ahora, que salen contentos. Llevas ${x.reviews.asked} pedidas y ${x.reviews.received} conseguidas.`}
      flush
    >
      {list.length ? (
        <ul className="divide-y divide-border-light">
          {list.map((g) => {
            const link = customerWhatsApp(g.info.phone, reviewMessage(g, data.space.name, x.policy.reviewUrl));
            return (
              <li key={g.booking.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <Avatar name={g.booking.clientName} size="sm" tone="emerald" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{g.booking.clientName}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {g.typeName}, salieron a las {time(g.session.end)}
                  </span>
                </span>
                {link ? (
                  <Button size="sm" variant="secondary" asChild>
                    <a href={link} target="_blank" rel="noreferrer" onClick={() => ask(g)}>
                      <Star className="h-3.5 w-3.5" /> Pedir reseña
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => ask(g)}>
                    Pedida en persona
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={Star} title="Nadie acaba de salir" body="Cuando termine una partida, el grupo aparecerá aquí para pedirle la reseña." />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Caja del día                                                        */
/* ------------------------------------------------------------------ */

export function CashOfDay() {
  const { data, now } = usePro();
  const today = localDate(now);
  const [day, setDay] = React.useState(today);
  const payments = data.payments.filter((p) => localDate(p.at) === day).sort((a, b) => a.at.localeCompare(b.at));
  const total = payments.reduce((a, p) => a + p.amountCents, 0);
  const byMethod = DESK_METHODS.map((m) => ({ m, cents: payments.filter((p) => p.method === m).reduce((a, p) => a + p.amountCents, 0) })).filter((x) => x.cents);
  const roomOf = (p: ProPayment) => {
    const b = data.bookings.find((x) => x.id === p.bookingId);
    return data.sessions.find((s) => s.id === b?.sessionId)?.room ?? "Otros";
  };
  const rooms = [...new Set(payments.map(roomOf))].map((room) => ({ room, cents: payments.filter((p) => roomOf(p) === room).reduce((a, p) => a + p.amountCents, 0) }));
  const fromFranky = payments
    .filter((p) => isFromFranky(data.bookings.find((b) => b.id === p.bookingId)?.source))
    .reduce((a, p) => a + p.amountCents, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {[addDays(today, -2), addDays(today, -1), today].map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === day}
            onClick={() => setDay(d)}
            className={cn(
              "h-10 rounded-xl border px-3 text-sm font-semibold transition-colors",
              d === day ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-text-secondary",
            )}
          >
            {d === today ? "Hoy" : d === addDays(today, -1) ? "Ayer" : dayLabel(`${d}T12:00:00Z`, { weekday: true }).split(",")[0]}
          </button>
        ))}
      </div>
      <section className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Figure label="Total del día" value={money(total, { round: true })} hint={plural(payments.length, "cobro", "cobros")} tone="success" />
          {byMethod.map((x) => (
            <Figure key={x.m} label={CHARGE_METHOD_LABEL[x.m]} value={money(x.cents, { round: true })} />
          ))}
          <Figure label="Vino por Franky" value={money(fromFranky, { round: true })} hint="sin comisión" />
        </div>
        {rooms.length ? (
          <ul className="mt-4 grid gap-2 border-t border-border-light pt-4 sm:grid-cols-3">
            {rooms.map((r) => (
              <li key={r.room} className="flex items-center justify-between rounded-xl bg-bg-secondary px-3 py-2 text-sm">
                <span className="font-semibold">{r.room}</span>
                <span className="tabular">{money(r.cents, { round: true })}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <Panel flush title="Cobros">
        {payments.length ? (
          <ul className="divide-y divide-border-light">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="w-11 shrink-0 text-sm font-semibold tabular">{time(p.at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.clientName}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {p.concept} · {roomOf(p)}
                  </span>
                </span>
                <Pill>{CHARGE_METHOD_LABEL[p.method]}</Pill>
                <span className="w-16 shrink-0 text-right text-sm font-semibold tabular">{money(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Wallet} title="Sin cobros este día" body="Al cobrar un grupo en su ficha, el cobro aparece aquí con su sala y su forma de pago." />
        )}
      </Panel>
    </div>
  );
}

/** Al terminar la partida: escaparon o no, tiempo y pistas, para el ranking. */
function ResultBlock({ session, booking }: { session: ProClassSession; booking: ProBooking }) {
  const { data } = usePro();
  const saved = resultForBooking(data, booking.id);
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-2xl bg-bg-secondary p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {saved
            ? saved.escaped
              ? `Escaparon en ${formatRecord(saved.seconds ?? 0, "s")} con ${saved.hints} pistas`
              : "No escaparon"
            : "Resultado de la partida"}
        </p>
        <button type="button" onClick={() => setOpen((v) => !v)} className="h-10 shrink-0 rounded-xl px-2 text-sm font-semibold text-violet">
          {open ? "Cerrar" : saved ? "Cambiar" : "Guardar tiempo"}
        </button>
      </div>
      {open ? (
        <div className="mt-3">
          <RoomResultForm booking={booking} session={session} onSaved={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
