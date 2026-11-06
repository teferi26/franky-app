"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, MessageCircle, Send, Sparkles, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { BookingStatus, ProBooking, ProClientSource, ProPayment, ProResource, ProVerticalId } from "@/lib/pro/types";
import { addDays, atLocal, dayLabel, durationLabel, localDate, localMinutes, minutesToLabel, money, time } from "@/lib/pro/format";
import { clockLabel } from "@/lib/pro/courts-base";
import {
  MATCH_MINUTES,
  bookingMinutes,
  freeStarts,
  isShared,
  occupancyAt,
  perPlayer,
  priceFor,
  resourceBookings,
  valleyApplies,
  type OpenMatchX,
} from "@/lib/pro/courts";
import { shortUni } from "@/lib/pro/classes";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Detail, Drawer, FormField, Meter, Pill, StatusPill, inputClass } from "../../kit";
import { TONES } from "../../tones";
import { sectionHref } from "../../shell";
import { RealCourtBookingDrawer, RealNewCourtBookingDrawer } from "./real-booking-drawers";
import { courtsOps } from "@/lib/pro/courts-base";
import {
  addNoShow,
  isFlagged,
  isSplitBooking,
  lateCancellation,
  noShowCount,
  passCost,
  passUnit,
  passesOf,
  settlePenalty,
  usePass as spendPass,
  waitersFor,
} from "@/lib/pro/courts-ops";
import { checkIn, checkOut, roomMinutesLeft, shiftPresets } from "@/lib/pro/courts-desk";
import { fourthPlayerCandidates, levelLabel, levelValue, matchDeadline } from "@/lib/pro/courts-ops";
import { agreementFor, agreementPrice } from "@/lib/pro/courts-growth";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { patchCourts } from "@/lib/pro/courts-base";
import {
  AddWaiterForm,
  BookingFlags,
  ExtrasPanel,
  FreedSlotPanel,
  LevelLine,
  SharesPanel,
  WhatsAppLink,
} from "./booking-ops";

/* ------------------------------------------------------------------ */
/* Palabras de cada sector                                             */
/* ------------------------------------------------------------------ */

export function courtsCopy(v: ProVerticalId) {
  if (v === "coworking") {
    return {
      one: "espacio",
      many: "espacios",
      person: "cliente",
      people: "clientes",
      playing: "Dentro",
      section: "Espacios",
      newBooking: "Nueva reserva",
      what: (r: ProResource) => (isShared(r) ? `Puesto en ${r.name.toLowerCase()}` : `${r.name}, 2 horas`),
    };
  }
  return {
    one: "pista",
    many: "pistas",
    person: "jugador",
    people: "jugadores",
    playing: "Jugando",
    section: "Pistas",
    newBooking: "Nueva reserva",
    what: (r: ProResource) => `${r.name}, partido de 90 min`,
  };
}

const FRANKY = new Set(["franky", "hueco", "card", "grupo"]);
export function fromFranky(source?: ProClientSource) {
  return Boolean(source && FRANKY.has(source));
}

const SOURCE_LABEL: Record<ProClientSource, string> = {
  franky: "Reserva en Franky",
  hueco: "Franja valle en Franky",
  card: "Franky Card",
  instagram: "Instagram",
  phone: "Teléfono",
  walkin: "En el mostrador",
  google: "Google",
  grupo: "Grupo",
  unknown: "Sin indicar",
};

export function BookingStatusPill({ status, playing }: { status: BookingStatus; playing: string }) {
  if (status === "in_service") return <StatusPill status={status} label={playing} />;
  if (status === "done") return <StatusPill status={status} label="Terminada" />;
  return <StatusPill status={status} />;
}

export function durationOptions(r: ProResource | undefined): number[] {
  if (!r) return [60, 90, 120];
  if (r.kind === "court") return [60, 90, 120];
  if (isShared(r)) return [60, 120, 240, 300];
  return [60, 120, 180];
}

/* ------------------------------------------------------------------ */
/* Nueva reserva                                                       */
/* ------------------------------------------------------------------ */

export type NewCourtPreset = { date: string; resourceId?: string; minute?: number } | null;

export function NewCourtBookingDrawer({ preset, onClose }: { preset: NewCourtPreset; onClose: () => void }) {
  const { demo } = usePro();
  return demo ? <DemoNewCourtBookingDrawer preset={preset} onClose={onClose} /> : <RealNewCourtBookingDrawer preset={preset} onClose={onClose} />;
}

function DemoNewCourtBookingDrawer({ preset, onClose }: { preset: NewCourtPreset; onClose: () => void }) {
  const { data, update, now, vertical } = usePro();
  const toast = useToast();
  const copy = courtsCopy(vertical.id);
  const [resourceId, setResourceId] = React.useState("");
  const [date, setDate] = React.useState(localDate(now));
  const [duration, setDuration] = React.useState(90);
  const [minute, setMinute] = React.useState<number | null>(null);
  const [name, setName] = React.useState("");
  const [clientId, setClientId] = React.useState<string | undefined>();
  const [student, setStudent] = React.useState(false);
  const [source, setSource] = React.useState<ProClientSource>("phone");
  const [people, setPeople] = React.useState(4);
  const [passId, setPassId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!preset) return;
    setPassId(null);
    const r = data.resources.find((x) => x.id === preset.resourceId) ?? data.resources[0];
    setResourceId(r?.id ?? "");
    setDate(preset.date);
    const d = r?.kind === "court" ? 90 : r && isShared(r) ? 240 : 120;
    setDuration(d);
    setMinute(preset.minute ?? null);
    setName("");
    setClientId(undefined);
    setStudent(false);
    setSource("phone");
    setPeople(r?.kind === "court" ? 4 : r && isShared(r) ? 1 : 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const resource = data.resources.find((r) => r.id === resourceId);
  const today = localDate(now);
  const starts = resource ? freeStarts(data, resource, date, duration, date === today ? localMinutes(now) : 0) : [];
  const chosen = minute !== null && starts.includes(minute) ? minute : null;
  const basePrice = resource && chosen !== null ? priceFor(resource, date, chosen, duration) : null;
  const listPrice = basePrice === null ? null : basePrice * (resource && isShared(resource) ? people : 1);
  // Convenio con su universidad o su asociación: el precio pactado sale solo.
  const deal = resource?.kind === "court" && chosen !== null ? agreementFor(data, clientId, date, chosen) : null;
  const price = deal && listPrice !== null ? agreementPrice(listPrice, deal.discountPct) : listPrice;
  const valley = resource && chosen !== null ? valleyApplies(resource, date, chosen, duration) : false;
  const occ = resource && isShared(resource) && chosen !== null ? occupancyAt(data, resource, date, chosen) : 0;

  // Bonos y monedero del jugador elegido (solo pistas).
  const passes = resource?.kind === "court" && clientId ? passesOf(data, { clientId }, date) : [];
  const pass = passes.find((x) => x.id === passId) ?? null;
  const passAmount = pass && price !== null ? passCost(pass, duration, price) : 0;
  const passFits = pass ? pass.left >= passAmount : false;

  // Socios de la sala: los puestos van con su bono; las salas, con las horas incluidas en su cuota.
  const selectedMember = data.members.find((m) => m.id === clientId);
  const roomLeft =
    selectedMember && resource?.kind === "room" ? roomMinutesLeft(data, selectedMember.id, date.slice(0, 7)) : null;
  const roomCovered = roomLeft !== null ? Math.min(roomLeft, duration) : 0;
  const finalPrice =
    price === null
      ? null
      : selectedMember && resource && isShared(resource)
        ? 0
        : roomCovered
          ? Math.round((price * (duration - roomCovered)) / duration / 50) * 50
          : pass && passFits && pass.kind !== "wallet"
            ? 0
            : price;
  const shifts = resource && isShared(resource) ? shiftPresets(data, date, date === today ? localMinutes(now) : undefined) : [];

  const q = name.trim().toLowerCase();
  const suggestions =
    q.length >= 2 && !clientId
      ? [
          ...data.clients.filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({ id: c.id, name: c.name, sub: c.tags[0] ?? "", student: Boolean(c.student?.verified), source: c.source })),
          ...data.members.filter((m) => m.name.toLowerCase().includes(q)).map((m) => ({ id: m.id, name: m.name, sub: "Socio", student: Boolean(m.student?.verified), source: "walkin" as ProClientSource })),
        ].slice(0, 4)
      : [];

  const save = () => {
    if (!resource || chosen === null || price === null || finalPrice === null) return;
    const member = selectedMember && isShared(resource);
    const withPass = Boolean(pass && passFits);
    const wallet = withPass && pass?.kind === "wallet";
    const booking: ProBooking = {
      id: localId("b"),
      kind: "court",
      clientId,
      clientName: name.trim(),
      resourceId: resource.id,
      start: atLocal(date, chosen),
      end: atLocal(date, chosen + duration),
      partySize: people,
      status: "confirmed",
      priceCents: finalPrice,
      paidCents: wallet ? finalPrice : 0,
      source,
      student,
      note:
        member || (withPass && !wallet)
          ? "Con bono"
          : wallet
            ? "Pagada con monedero"
            : roomCovered
              ? "Incluida en su cuota"
              : deal
                ? `Convenio ${deal.name}`
                : undefined,
    };
    update("court.create", (d) => {
      let next: typeof d = { ...d, bookings: [...d.bookings, booking] };
      if (withPass && pass)
        next = spendPass(next, { passId: pass.id, bookingId: booking.id, amount: passAmount, at: new Date().toISOString() });
      if (roomCovered) next = patchCourts(next, (ops) => ({ roomCredit: { ...ops.roomCredit, [booking.id]: roomCovered } }));
      return next;
    });
    const left = withPass && pass ? Math.round((pass.left - passAmount) * 100) / 100 : null;
    toast.success(
      "Reserva hecha",
      `${resource.name}, ${dayLabel(booking.start)} de ${minutesToLabel(chosen)} a ${minutesToLabel(chosen + duration)}${
        member ? ", con su bono" : withPass && pass ? `, con su ${pass.label.toLowerCase()}` : `, ${money(finalPrice)}`
      }.${left !== null && pass && pass.kind !== "wallet" && left <= 1 ? ` Le ${left === 1 ? `queda 1 ${passUnit(pass).slice(0, -1)}` : "quedan 0"}: recuérdale renovar.` : ""}`,
    );
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      title={copy.newBooking}
      description={vertical.id === "coworking" ? "Puesto, sala de grupo o bono. Se cobra al llegar o con su bono." : "El precio valle se aplica solo de 10 a 14 h entre semana."}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!resource || chosen === null || name.trim().length < 2 || price === null}>
            Reservar{finalPrice ? ` · ${money(finalPrice)}` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label={vertical.id === "coworking" ? "Espacio" : "Pista"}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.resources.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={resourceId === r.id}
                onClick={() => {
                  setResourceId(r.id);
                  const opts = durationOptions(r);
                  if (!opts.includes(duration)) setDuration(opts[1] ?? opts[0]);
                  setPeople(r.kind === "court" ? 4 : isShared(r) ? 1 : Math.min(4, r.capacity));
                }}
                className={cn(
                  "flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                  resourceId === r.id ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                )}
              >
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONES[r.tone].dot)} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block truncate text-xs text-text-muted">{r.note}</span>
                </span>
              </button>
            ))}
          </div>
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Día" htmlFor="cb-date">
            <input
              id="cb-date"
              type="date"
              min={today}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setMinute(null);
              }}
              className={inputClass}
            />
          </FormField>
          <FormField label="Duración">
            <ChoiceChips value={String(duration)} onChange={(v) => setDuration(Number(v))} options={durationOptions(resource).map((d) => ({ value: String(d), label: durationLabel(d) }))} />
          </FormField>
        </div>

        {shifts.length ? (
          <FormField label="Turno" hint="Las horas se ajustan solas a tu horario de ese día.">
            <div className="flex flex-wrap gap-2">
              {shifts.map((sh) => {
                const active = chosen === sh.from && duration === sh.to - sh.from;
                return (
                  <button
                    key={sh.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setDuration(sh.to - sh.from);
                      setMinute(sh.from);
                    }}
                    className={cn(
                      "flex min-h-12 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left text-sm transition-colors",
                      active ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                    )}
                  >
                    <span className="font-semibold">{sh.label}</span>
                    <span className="text-xs text-text-muted tabular">
                      {clockLabel(sh.from)} a {clockLabel(sh.to)}
                    </span>
                  </button>
                );
              })}
            </div>
          </FormField>
        ) : null}

        <FormField label="Hora de inicio" hint={starts.length ? `${starts.length} horas libres ese día.` : "No queda hueco con esa duración. Prueba otra duración o día."}>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pro-scroll">
            {starts.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={chosen === m}
                onClick={() => setMinute(m)}
                className={cn(
                  "h-10 min-w-16 rounded-xl border px-2.5 text-sm font-semibold tabular transition-colors",
                  chosen === m ? "border-violet bg-violet text-white" : "border-border text-text-secondary hover:border-text-primary/25",
                  resource && valleyApplies(resource, date, m, duration) && chosen !== m && "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
                )}
              >
                {clockLabel(m)}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label={vertical.id === "coworking" ? "Quién reserva" : "Jugador que reserva"} htmlFor="cb-name">
          <input
            id="cb-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setClientId(undefined);
            }}
            placeholder="Nombre y apellido"
            autoComplete="off"
            className={inputClass}
          />
          {suggestions.length ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setName(s.name);
                    setClientId(s.id);
                    setStudent(s.student);
                    setSource(s.source === "franky" || s.source === "hueco" ? s.source : "phone");
                    const own = resource?.kind === "court" ? passesOf(data, { clientId: s.id }, date) : [];
                    setPassId(own[0]?.id ?? null);
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-violet/40 hover:text-violet"
                >
                  {s.student ? <BadgeCheck className="h-3.5 w-3.5 text-violet" /> : null}
                  {s.name}
                  {s.sub ? <span className="font-normal text-text-muted">· {s.sub}</span> : null}
                  {isFlagged(data, s.id) ? <span className="font-semibold text-rose-600">· {noShowCount(data, s.id)} ausencias</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </FormField>

        {clientId && isFlagged(data, clientId) ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {name.split(" ")[0]} no se ha presentado {noShowCount(data, clientId)} veces. Puedes pedirle que pague por adelantado.
          </p>
        ) : null}

        {passes.length ? (
          <FormField label="Pagar con">
            <ChoiceChips
              value={passId ?? "none"}
              onChange={(v) => setPassId(v === "none" ? null : v)}
              options={[
                ...passes.map((x) => ({
                  value: x.id,
                  label: x.label,
                  hint: x.kind === "wallet" ? `Saldo ${money(x.left)}` : `Quedan ${x.left.toLocaleString("es-ES")} ${passUnit(x)}`,
                })),
                { value: "none", label: "Pago normal" },
              ]}
            />
          </FormField>
        ) : null}

        {resource && !isShared(resource) && resource.kind !== "court" ? (
          <FormField label="Personas">
            <ChoiceChips value={String(people)} onChange={(v) => setPeople(Number(v))} options={Array.from({ length: resource.capacity - 1 }, (_, i) => ({ value: String(i + 2), label: String(i + 2) }))} />
          </FormField>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={student} onChange={(e) => setStudent(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
            Estudiante verificado
          </label>
          <ChoiceChips
            value={source}
            onChange={setSource}
            options={[
              { value: "phone", label: "Teléfono" },
              { value: "walkin", label: "Mostrador" },
              { value: "franky", label: "Franky" },
            ]}
          />
        </div>

        {resource && chosen !== null ? (
          <div className="rounded-2xl bg-bg-secondary p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-heading text-2xl font-extrabold tabular">{finalPrice === null ? "Precio según servicio" : money(finalPrice)}</p>
              {deal ? (
                <Pill tone="violet">Convenio, {deal.discountPct} %</Pill>
              ) : price !== null ? (
                valley ? <Pill tone="success">Precio valle</Pill> : <Pill>Precio normal</Pill>
              ) : null}
            </div>
            {deal && listPrice !== null && price !== null ? (
              <p className="mt-1 text-sm font-semibold text-violet-deep">
                {deal.name}: {money(price)} en vez de {money(listPrice)}.
              </p>
            ) : null}
            {pass && passFits ? (
              <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {pass.kind === "wallet"
                  ? `Se paga con su monedero: le quedarán ${money(pass.left - passAmount)}.`
                  : `Se descuenta de su bono: le quedarán ${(Math.round((pass.left - passAmount) * 100) / 100).toLocaleString("es-ES")} ${passUnit(pass)}.`}
              </p>
            ) : pass ? (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">No le queda saldo suficiente en ese bono.</p>
            ) : null}
            {roomLeft !== null ? (
              <p className="mt-1 text-sm text-text-muted">
                {roomCovered
                  ? `Su cuota incluye horas de sala: se descuentan ${durationLabel(roomCovered)} de las ${durationLabel(roomLeft)} que le quedan este mes.`
                  : "Ya ha usado las horas de sala de su cuota este mes: se cobra la reserva."}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-text-muted">
              {price === null ? "Selecciona un servicio con precio antes de reservar." : resource.kind === "court"
                ? `${money(perPlayer(price))} por jugador si pagan entre los cuatro desde Franky.`
                : isShared(resource)
                  ? `${occ} de ${resource.capacity} puestos ocupados a esa hora. Si tiene bono, no se le cobra.`
                  : `${money(Math.round(price / people / 5) * 5)} por persona.`}
            </p>
            {valley ? <p className="mt-1 text-xs text-text-muted">De 10 a 14 h entre semana se aplica solo el precio valle.</p> : null}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de una reserva                                              */
/* ------------------------------------------------------------------ */

export function CourtBookingDrawer({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { demo } = usePro();
  return demo ? <DemoCourtBookingDrawer bookingId={bookingId} onClose={onClose} /> : <RealCourtBookingDrawer bookingId={bookingId} onClose={onClose} />;
}

function DemoCourtBookingDrawer({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { data, update, now, vertical, spaceId } = usePro();
  const toast = useToast();
  const copy = courtsCopy(vertical.id);
  const booking = data.bookings.find((b) => b.id === bookingId) ?? null;
  const [mode, setMode] = React.useState<"view" | "charge" | "move" | "cancel" | "noshow" | "freed">("view");
  const [method, setMethod] = React.useState<ProPayment["method"]>("card");
  const [freed, setFreed] = React.useState<{ resourceId?: string; date: string; from: number; duration: number } | null>(null);
  const [moveDate, setMoveDate] = React.useState("");
  const [moveResource, setMoveResource] = React.useState("");
  const [moveMinute, setMoveMinute] = React.useState<number | null>(null);

  React.useEffect(() => {
    setMode("view");
    setMethod("card");
    setFreed(null);
    if (booking) {
      setMoveDate(localDate(booking.start));
      setMoveResource(booking.resourceId ?? "");
      setMoveMinute(localMinutes(booking.start));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (!booking) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const resource = data.resources.find((r) => r.id === booking.resourceId);
  const client = data.clients.find((c) => c.id === booking.clientId);
  const minutes = bookingMinutes(booking);
  const due = booking.paidCents === null ? null : Math.max(0, booking.priceCents - booking.paidCents);
  const valley = resource ? valleyApplies(resource, localDate(booking.start), localMinutes(booking.start), minutes) : false;
  const started = new Date(booking.start).getTime() <= now.getTime();

  const setStatus = (status: BookingStatus, title: string, detail?: string) => {
    update(`court.${status}`, (d) => ({ ...d, bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, status } : b)) }));
    toast.success(title, detail);
    if (status === "cancelled" || status === "no_show") onClose();
  };

  // Cancelar y no presentarse siguen la norma del club: dentro del preaviso
  // se propone cobrar la penalización o perdonarla, y queda en su ficha.
  const policy = courtsOps(data).policy;
  const late = lateCancellation(data, booking, now);
  const shared = resource ? isShared(resource) : false;
  const slot = {
    resourceId: booking.resourceId,
    date: localDate(booking.start),
    from: localMinutes(booking.start),
    duration: minutes,
  };

  const finishCancel = (charge: boolean | null) => {
    update("court.cancelled", (d) => {
      let next = { ...d, bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, status: "cancelled" as const } : b)) };
      if (charge !== null)
        next = settlePenalty(next, {
          bookingId: booking.id,
          kind: "late_cancel",
          charge,
          amountCents: late.penaltyCents,
          method,
          at: new Date().toISOString(),
          penaltyId: localId("pn"),
          paymentId: localId("p"),
        });
      return next;
    });
    toast.success(
      "Reserva cancelada",
      charge ? `Cobrados ${money(late.penaltyCents)} de penalización.` : `La ${copy.one} queda libre y avisamos a ${booking.clientName.split(" ")[0]}.`,
    );
    if (!started && waitersFor(data, slot).length) {
      setFreed(slot);
      setMode("freed");
    } else onClose();
  };

  const cancelBooking = () => {
    if (!started && late.late && late.penaltyCents > 0) setMode("cancel");
    else finishCancel(null);
  };

  const finishNoShow = (charge: boolean | null) => {
    update("court.no_show", (d) => {
      let next = addNoShow({ ...d, bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, status: "no_show" as const } : b)) }, booking.clientId);
      if (charge !== null)
        next = settlePenalty(next, {
          bookingId: booking.id,
          kind: "no_show",
          charge,
          amountCents: late.penaltyCents,
          method,
          at: new Date().toISOString(),
          penaltyId: localId("pn"),
          paymentId: localId("p"),
        });
      return next;
    });
    toast.success("Marcada como no presentada", charge ? `Cobrados ${money(late.penaltyCents)}.` : "Queda anotado en su ficha.");
    onClose();
  };

  const markNoShow = () => {
    if (late.penaltyCents > 0) setMode("noshow");
    else finishNoShow(null);
  };

  // En una sala de estudio, llegar da puesto y descuenta el bono; salir libera el sitio.
  const arrive = () => {
    if (!shared) {
      setStatus("arrived", "Han llegado", due === null ? undefined : due ? `Quedan ${money(due)} por cobrar.` : "Ya estaba pagada.");
      return;
    }
    const result = checkIn(data, booking.id, now);
    update("court.checkin", () => result.data);
    const detail = [
      result.seat ? `Puesto ${result.seat.label}` : null,
      result.bonoLeft !== undefined ? `le ${result.bonoLeft === 1 ? "queda 1 uso" : `quedan ${result.bonoLeft} usos`} en su bono` : null,
    ]
      .filter(Boolean)
      .join(", ");
    toast.success(`${booking.clientName.split(" ")[0]} ha llegado`, detail || undefined);
  };

  const leave = () => {
    update("court.checkout", (d) => checkOut(d, booking.id, new Date()));
    toast.success(`${booking.clientName.split(" ")[0]} se ha ido`, "Su puesto vuelve a estar libre.");
    onClose();
  };

  const charge = () => {
    if (due === null) return;
    update("court.charge", (d) => ({
      ...d,
      bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, paidCents: b.priceCents, status: started ? "done" : b.status } : b)),
      payments: [
        ...d.payments,
        {
          id: localId("p"),
          at: new Date().toISOString(),
          bookingId: booking.id,
          clientName: booking.clientName,
          concept: `${resource?.name ?? "Reserva"} ${durationLabel(minutes)}`,
          amountCents: due,
          tipCents: 0,
          method,
        },
      ],
    }));
    toast.success("Cobrada", `${money(due)} con ${method === "card" ? "tarjeta" : method === "cash" ? "efectivo" : "Bizum"}.`);
    onClose();
  };

  const moveTarget = data.resources.find((r) => r.id === moveResource);
  const moveOptions = moveTarget ? freeStarts(data, moveTarget, moveDate, minutes, moveDate === localDate(now) ? localMinutes(now) : 0, booking.id) : [];
  const move = () => {
    if (moveMinute === null || !moveTarget) return;
    const basePrice = priceFor(moveTarget, moveDate, moveMinute, minutes);
    if (basePrice === null) return;
    const price = basePrice * (isShared(moveTarget) ? booking.partySize : 1);
    update("court.move", (d) => ({
      ...d,
      bookings: d.bookings.map((b) =>
        b.id === booking.id
          ? { ...b, resourceId: moveTarget.id, start: atLocal(moveDate, moveMinute), end: atLocal(moveDate, moveMinute + minutes), priceCents: b.note === "Con bono" ? 0 : price }
          : b,
      ),
    }));
    toast.success("Reserva movida", `${moveTarget.name}, ${dayLabel(atLocal(moveDate, moveMinute))} a las ${minutesToLabel(moveMinute)}. Avisamos a ${booking.clientName.split(" ")[0]}.`);
    setMode("view");
  };

  const footer = (() => {
    if (mode === "freed") return <Button variant="dark" onClick={onClose}>Listo</Button>;
    if (mode === "cancel")
      return (
        <>
          <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
          <Button variant="outline" onClick={() => finishCancel(false)}>Perdonar y cancelar</Button>
          <Button variant="dark" onClick={() => finishCancel(true)}>Cobrar {money(late.penaltyCents)}</Button>
        </>
      );
    if (mode === "noshow")
      return (
        <>
          <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
          <Button variant="outline" onClick={() => finishNoShow(false)}>Perdonar</Button>
          <Button variant="dark" onClick={() => finishNoShow(true)}>Cobrar {money(late.penaltyCents)}</Button>
        </>
      );
    if (mode === "charge" && due !== null)
      return (
        <>
          <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
          <Button variant="dark" onClick={charge}>Cobrar {money(due)}</Button>
        </>
      );
    if (mode === "move")
      return (
        <>
          <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
          <Button variant="dark" onClick={move} disabled={moveMinute === null || !moveOptions.includes(moveMinute) || moveTarget?.pricePerHourCents === null}>Mover reserva</Button>
        </>
      );
    switch (booking.status) {
      case "requested":
        return (
          <>
            <Button variant="ghost" onClick={() => setStatus("cancelled", "Solicitud rechazada", "Le avisamos para que elija otra hora.")}>Rechazar</Button>
            <Button variant="dark" onClick={() => setStatus("confirmed", "Reserva confirmada", "Le llega el aviso con la pista y la hora.")}>Aceptar</Button>
          </>
        );
      case "confirmed":
        return (
          <>
            {started ? <Button variant="ghost" onClick={markNoShow}>No vino</Button> : null}
            <Button variant="outline" onClick={() => setMode("move")}>Mover</Button>
            <Button variant="dark" onClick={arrive}>Han llegado</Button>
          </>
        );
      case "arrived":
      case "in_service":
        if (shared)
          return (
            <>
              {due ? <Button variant="outline" onClick={() => setMode("charge")}>Cobrar {money(due)}</Button> : null}
              <Button variant="dark" onClick={leave}>Se va</Button>
            </>
          );
        return (
          <>
            <Button variant="outline" onClick={() => setMode("move")}>Mover</Button>
            {due ? (
              <Button variant="dark" onClick={() => setMode("charge")}>Cobrar {money(due)}</Button>
            ) : (
              <Button variant="dark" onClick={() => setStatus("done", "Terminada")}>Terminar</Button>
            )}
          </>
        );
      default:
        return due ? <Button variant="dark" onClick={() => setMode("charge")}>Cobrar {money(due)}</Button> : null;
    }
  })();

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={booking.clientName}
      description={`${resource?.name ?? ""} · ${dayLabel(booking.start)} · ${time(booking.start)} a ${time(booking.end)}`}
      footer={footer}
    >
      {mode === "freed" && freed ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">La reserva está cancelada y la {copy.one} vuelve a estar libre.</p>
          <FreedSlotPanel slot={freed} onDone={onClose} />
        </div>
      ) : mode === "cancel" || mode === "noshow" ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-bg-secondary p-4">
            <p className="text-sm text-text-muted">
              {mode === "cancel"
                ? `Cancela con ${late.hoursLeft < 1 ? "menos de una hora" : `${Math.floor(late.hoursLeft)} h`} de antelación. Tu norma pide ${policy.noticeHours} h.`
                : "No se ha presentado a su reserva."}
            </p>
            <p className="mt-1 font-heading text-3xl font-extrabold tabular">{money(late.penaltyCents)}</p>
            <p className="mt-1 text-xs text-text-muted">
              El {policy.penaltyPct} % del precio. Puedes cobrarlo o perdonarlo; en los dos casos queda anotado en su ficha.
            </p>
          </div>
          <FormField label="Si lo cobras, con qué">
            <ChoiceChips
              value={method}
              onChange={setMethod}
              options={[
                { value: "card", label: "Tarjeta" },
                { value: "bizum", label: "Bizum" },
                { value: "cash", label: "Efectivo" },
              ]}
            />
          </FormField>
        </div>
      ) : mode === "charge" && due !== null ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-bg-secondary p-4">
            <p className="text-sm text-text-muted">{booking.paidCents ? `Ya pagado ${money(booking.paidCents)} de ${money(booking.priceCents)}` : "Pendiente"}</p>
            <p className="mt-1 font-heading text-3xl font-extrabold tabular">{money(due)}</p>
            {resource?.kind === "court" ? <p className="mt-1 text-xs text-text-muted">{money(perPlayer(booking.priceCents))} por jugador</p> : null}
          </div>
          <FormField label="Método de pago">
            <ChoiceChips
              value={method}
              onChange={setMethod}
              options={[
                { value: "card", label: "Tarjeta" },
                { value: "cash", label: "Efectivo" },
                { value: "bizum", label: "Bizum" },
              ]}
            />
          </FormField>
        </div>
      ) : mode === "move" ? (
        <div className="flex flex-col gap-5">
          <FormField label="Día" htmlFor="mv-date">
            <input
              id="mv-date"
              type="date"
              value={moveDate}
              onChange={(e) => {
                setMoveDate(e.target.value);
                setMoveMinute(null);
              }}
              className={inputClass}
            />
          </FormField>
          <FormField label={vertical.id === "coworking" ? "Espacio" : "Pista"}>
            <ChoiceChips
              value={moveResource}
              onChange={(v) => {
                setMoveResource(v);
                setMoveMinute(null);
              }}
              options={data.resources.filter((r) => r.kind === resource?.kind).map((r) => ({ value: r.id, label: r.name }))}
            />
          </FormField>
          <FormField label="Hora" hint={moveOptions.length ? undefined : "No hay hueco ese día con la misma duración."}>
            <div className="flex flex-wrap gap-1.5">
              {moveOptions.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={moveMinute === m}
                  onClick={() => setMoveMinute(m)}
                  className={cn(
                    "h-10 min-w-16 rounded-xl border px-2.5 text-sm font-semibold tabular",
                    moveMinute === m ? "border-violet bg-violet text-white" : "border-border text-text-secondary",
                  )}
                >
                  {minutesToLabel(m)}
                </button>
              ))}
            </div>
          </FormField>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <BookingStatusPill status={booking.status} playing={copy.playing} />
            {booking.student ? (
              <Pill tone="violet">
                <BadgeCheck className="h-3 w-3" /> {client?.student ? shortUni(client.student.university) : "Estudiante"}
              </Pill>
            ) : null}
            {fromFranky(booking.source) ? <Pill tone="success">Vino por Franky</Pill> : null}
            {valley ? <Pill tone="success">Precio valle</Pill> : null}
            <BookingFlags booking={booking} />
          </div>

          <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
            <Detail label={vertical.id === "coworking" ? "Espacio" : "Pista"}>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", TONES[resource?.tone ?? "slate"].dot)} />
                {resource?.name}
              </span>
            </Detail>
            <Detail label="Duración">{durationLabel(minutes)}</Detail>
            {resource && !isShared(resource) ? <Detail label="Personas">{booking.partySize}</Detail> : null}
            <Detail label="Precio">{booking.note === "Con bono" ? "Con bono" : money(booking.priceCents)}</Detail>
            {resource?.kind === "court" ? <Detail label="Por jugador">{money(perPlayer(booking.priceCents))}</Detail> : null}
            <Detail label="Origen">{SOURCE_LABEL[booking.source]}</Detail>
            {booking.note && booking.note !== "Con bono" ? <Detail label="Nota">{booking.note}</Detail> : null}
          </div>

          {shared && (courtsOps(data).checkins[booking.id] || courtsOps(data).seatByBooking[booking.id]) ? (
            <DeskStay bookingId={booking.id} />
          ) : null}

          {isSplitBooking(data, booking) && booking.status !== "cancelled" ? (
            <SharesPanel booking={booking} />
          ) : booking.priceCents && booking.paidCents !== null ? (
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Pagado</span>
                <span className="text-text-muted tabular">
                  {money(booking.paidCents)} de {money(booking.priceCents)}
                </span>
              </div>
              <Meter value={booking.paidCents} max={booking.priceCents} className="mt-2" tone={due ? "warning" : "success"} />
            </div>
          ) : null}

          {resource?.kind === "court" && booking.status !== "cancelled" && booking.status !== "no_show" ? <ExtrasPanel booking={booking} /> : null}

          {client ? (
            <div className="rounded-2xl bg-bg-secondary p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Ficha</p>
              <p className="mt-1.5 text-sm">
                {client.visits} {client.visits === 1 ? "visita" : "visitas"}
                {client.spentCents !== null ? ` · ${money(client.spentCents, { round: true })} en total` : ""}
              </p>
              {resource?.kind === "court" ? (
                <LevelLine clientId={client.id} />
              ) : client.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {client.tags.map((t) => (
                    <Pill key={t}>{t}</Pill>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href={`${sectionHref(spaceId, "clientes")}?c=${client.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet">
                  <Users className="h-4 w-4" /> Abrir ficha
                </Link>
                {client.phone ? (
                  <a
                    href={`https://wa.me/34${client.phone.replace(/\s/g, "")}?text=${encodeURIComponent(`Hola ${client.name.split(" ")[0]}, te escribimos de ${data.space.name}.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {!started && !shared && (booking.status === "confirmed" || booking.status === "requested") ? <AddWaiterForm booking={booking} /> : null}

          {booking.status !== "cancelled" && booking.status !== "done" && booking.status !== "no_show" ? (
            <button
              type="button"
              onClick={cancelBooking}
              className="min-h-10 self-start text-sm font-semibold text-rose-600"
            >
              Cancelar reserva
              {!started && late.late && late.penaltyCents > 0 ? (
                <span className="ml-1.5 font-normal text-text-muted">(dentro de las {policy.noticeHours} h de preaviso)</span>
              ) : null}
            </button>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

/** Puesto y horas reales de entrada y salida en la sala de estudio. */
function DeskStay({ bookingId }: { bookingId: string }) {
  const { data } = usePro();
  const ops = courtsOps(data);
  const seat = ops.seats.find((s) => s.id === ops.seatByBooking[bookingId]);
  const stay = ops.checkins[bookingId];
  return (
    <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
      {seat ? (
        <Detail label="Puesto">
          {seat.label}
          {seat.group ? ` · ${seat.group}` : ""}
        </Detail>
      ) : null}
      {stay?.inAt ? <Detail label="Entró">{time(stay.inAt)}</Detail> : null}
      {stay?.outAt ? <Detail label="Salió">{time(stay.outAt)}</Detail> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partidos abiertos                                                   */
/* ------------------------------------------------------------------ */

/** Estudiantes de nivel parecido que verían el partido (aproximado). */
export function matchReach(level: string) {
  const base: Record<string, number> = { Iniciación: 210, "2,5": 160, "3,0": 140, "3,5": 95, "4,0": 60 };
  return base[level] ?? 120;
}

export function MatchDrawer({ matchId, onClose }: { matchId: string | null; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const match = (data.openMatches as OpenMatchX[]).find((m) => m.id === matchId) ?? null;
  const [player, setPlayer] = React.useState("");
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  React.useEffect(() => setPlayer(""), [matchId]);

  if (!match) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const resource = data.resources.find((r) => r.id === match.resourceId);
  const from = localMinutes(match.start);
  const date = localDate(match.start);
  const price = resource ? priceFor(resource, date, from, MATCH_MINUTES) : 0;

  const publish = () => {
    const reach = matchReach(match.level);
    update("match.publish", (d) => ({
      ...d,
      openMatches: d.openMatches.map((m) => (m.id === match.id ? ({ ...m, publishedAt: now.toISOString(), reach } as OpenMatchX) : m)),
    }));
    toast.success("Publicado a estudiantes", `Lo verán unos ${reach} jugadores de nivel ${match.level} de ${match.university ? shortUni(match.university) : "tu zona"}. Sin comisión por jugador.`);
  };

  const addPlayer = () => {
    const name = player.trim();
    if (!name || price === null) return;
    const complete = match.needed <= 1;
    update("match.add", (d) => {
      if (!complete) {
        return { ...d, openMatches: d.openMatches.map((m) => (m.id === match.id ? { ...m, players: [...m.players, name], needed: m.needed - 1 } : m)) };
      }
      const booking: ProBooking = {
        id: localId("b"),
        kind: "court",
        clientName: match.players[0] ?? name,
        resourceId: match.resourceId,
        start: match.start,
        end: atLocal(date, from + MATCH_MINUTES),
        partySize: 4,
        status: "confirmed",
        priceCents: price,
        paidCents: 0,
        source: "franky",
        student: true,
        note: `Partido abierto: ${[...match.players, name].join(", ")}`,
      };
      return { ...d, openMatches: d.openMatches.filter((m) => m.id !== match.id), bookings: [...d.bookings, booking] };
    });
    toast.success(complete ? "Partido completo" : "Jugador añadido", complete ? "Pasa a ser una reserva normal. Cada uno paga su parte desde Franky." : `Faltan ${match.needed - 1}.`);
    setPlayer("");
    if (complete) onClose();
  };

  const cancel = () => {
    update("match.cancel", (d) => ({ ...d, openMatches: d.openMatches.filter((m) => m.id !== match.id) }));
    toast.success("Partido cancelado", "La pista queda libre y avisamos a los apuntados.");
    onClose();
  };

  // Hora límite: un partido incompleto no bloquea la pista para siempre.
  const deadline = matchDeadline(data, match);
  const released = Boolean(match.releasedAt);
  const candidates = released
    ? []
    : fourthPlayerCandidates(data, { level: levelValue(match.level), minute: from, exclude: match.players, limit: 4 });
  const offerSlot = () =>
    setOffer({
      what: `${resource?.name ?? "Pista"}, partido de 90 min`,
      date,
      from,
      to: from + MATCH_MINUTES,
      priceCents: resource ? (priceFor({ ...resource, valleyPricePerHourCents: undefined }, date, from, MATCH_MINUTES) ?? 0) : 0,
      slots: 1,
    });

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Partido abierto, nivel ${match.level}`}
      description={`${resource?.name} · ${dayLabel(match.start)} · ${time(match.start)} a ${minutesToLabel(from + MATCH_MINUTES)}`}
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-rose-600" onClick={cancel}>
            Cancelar partido
          </Button>
          <Button variant="dark" onClick={publish} disabled={Boolean(match.publishedAt)}>
            <Send className="h-4 w-4" /> {match.publishedAt ? "Ya publicado" : "Publicar a estudiantes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-heading text-2xl font-extrabold tabular">
              {match.players.length}
              <span className="text-base text-text-muted">/4</span>
            </p>
            <Pill tone={match.needed === 1 ? "warning" : "violet"}>
              Faltan {match.needed}
            </Pill>
          </div>
          <Meter value={match.players.length} max={4} className="mt-2" />
          <ul className="mt-4 flex flex-col gap-2">
            {match.players.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm">
                <Avatar name={p} size="sm" tone="violet" />
                <span className="min-w-0 flex-1 truncate font-medium">{p}</span>
                <BadgeCheck className="h-3.5 w-3.5 text-violet" aria-label="Estudiante verificado" />
              </li>
            ))}
            {Array.from({ length: match.needed }, (_, i) => (
              <li key={`e${i}`} className="flex items-center gap-2.5 text-sm text-text-muted">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border">
                  <UserPlus className="h-3.5 w-3.5" />
                </span>
                Hueco libre
              </li>
            ))}
          </ul>
        </div>

        {released ? (
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">No se completó a tiempo: la pista quedó libre a las {time(match.releasedAt!)}.</p>
            <p className="mt-1">Ya se puede reservar. Si nadie la coge, ofrécela a estudiantes como franja de última hora.</p>
            <Button size="sm" variant="dark" className="mt-3" onClick={offerSlot}>
              <Send className="h-3.5 w-3.5" /> Ofrecer la franja a estudiantes
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Si a las <span className="font-semibold text-text-primary">{time(deadline)}</span> todavía faltan jugadores, la pista se libera sola y no pierdes la hora.
          </p>
        )}

        {candidates.length ? (
          <div>
            <p className="text-[0.82rem] font-semibold">Jugadores del club que encajan</p>
            <p className="text-xs text-text-muted">Nivel parecido y suelen jugar a esta hora.</p>
            <ul className="mt-2 flex flex-col gap-2">
              {candidates.map((c) => (
                <li key={c.client.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5">
                  <Avatar name={c.client.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.client.name}</span>
                    <span className="block text-xs text-text-muted">
                      Nivel {levelLabel(c.level)}
                      {c.sameHour ? ` · ${c.sameHour} ${c.sameHour === 1 ? "partido" : "partidos"} a esta hora` : ""}
                    </span>
                  </span>
                  <WhatsAppLink
                    phone={c.client.phone}
                    label="Invitar"
                    message={`Hola ${c.client.name.split(" ")[0]}, en ${data.space.name} buscamos ${match.needed === 1 ? "al cuarto jugador" : "jugadores"} de nivel ${match.level} para ${dayLabel(match.start)} a las ${time(match.start)} en la ${resource?.name.toLowerCase() ?? "pista"}.${price ? ` Sale a ${money(perPlayer(price))} por persona.` : ""} ¿Te apuntas?`}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
          <Detail label="Nivel">{match.level}</Detail>
          <Detail label="Universidad">{match.university ?? "Cualquiera"}</Detail>
          <Detail label="Precio por jugador">{price === null ? "Precio según servicio" : money(perPlayer(price))}</Detail>
          <Detail label="Publicado">{match.publishedAt ? `Sí, lo han visto ${match.reach ?? matchReach(match.level)} estudiantes` : "Todavía no"}</Detail>
        </div>

        <FormField label="Añadir un jugador que te ha llamado" htmlFor="mt-player">
          <div className="flex gap-2">
            <input
              id="mt-player"
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
              placeholder="Nombre"
              className={inputClass}
            />
            <Button variant="outline" onClick={addPlayer} disabled={!player.trim()}>
              Añadir
            </Button>
          </div>
        </FormField>

        <p className="flex items-start gap-2 rounded-2xl bg-violet-50 p-3 text-sm text-violet-deep">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          Franky enseña el partido a estudiantes de {match.university ? shortUni(match.university) : "tu zona"} con nivel {match.level} que suelen jugar a esa hora. Cuando se completa, pasa a ser una reserva y cada uno paga su parte.
        </p>
      </div>
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </Drawer>
  );
}

export type NewMatchPreset = { date: string } | null;

export function NewMatchDrawer({ preset, onClose }: { preset: NewMatchPreset; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const [date, setDate] = React.useState(localDate(now));
  const [resourceId, setResourceId] = React.useState("");
  const [minute, setMinute] = React.useState<number | null>(null);
  const [level, setLevel] = React.useState("3,0");
  const [names, setNames] = React.useState("");

  React.useEffect(() => {
    if (!preset) return;
    setDate(preset.date);
    setResourceId(data.resources[0]?.id ?? "");
    setMinute(null);
    setLevel("3,0");
    setNames("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const resource = data.resources.find((r) => r.id === resourceId);
  const starts = resource ? freeStarts(data, resource, date, MATCH_MINUTES, date === localDate(now) ? localMinutes(now) : 0) : [];
  const players = names
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 3);

  const save = () => {
    if (!resource || minute === null || !players.length) return;
    const match: OpenMatchX = {
      id: localId("om"),
      resourceId: resource.id,
      start: atLocal(date, minute),
      level,
      players,
      needed: 4 - players.length,
      university: "Universidad de Alicante",
      publishedAt: now.toISOString(),
      reach: matchReach(level),
    };
    update("match.create", (d) => ({ ...d, openMatches: [...d.openMatches, match] }));
    toast.success("Partido abierto publicado", `Faltan ${match.needed}. Lo verán unos ${match.reach} estudiantes de nivel ${level}.`);
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      title="Nuevo partido abierto"
      description="Para quien quiere jugar y no tiene con quién. Se completa con estudiantes de nivel parecido."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!resource || minute === null || !players.length}>
            <Send className="h-4 w-4" /> Publicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Día" htmlFor="nmt-date">
            <input id="nmt-date" type="date" min={localDate(now)} max={addDays(localDate(now), 13)} value={date} onChange={(e) => { setDate(e.target.value); setMinute(null); }} className={inputClass} />
          </FormField>
          <FormField label="Pista" htmlFor="nmt-res">
            <select id="nmt-res" value={resourceId} onChange={(e) => { setResourceId(e.target.value); setMinute(null); }} className={inputClass}>
              {data.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Hora (90 min)" hint={starts.length ? undefined : "Esa pista no tiene hueco de 90 minutos ese día."}>
          <div className="flex flex-wrap gap-1.5">
            {starts.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minute === m}
                onClick={() => setMinute(m)}
                className={cn("h-10 min-w-16 rounded-xl border px-2.5 text-sm font-semibold tabular", minute === m ? "border-violet bg-violet text-white" : "border-border text-text-secondary")}
              >
                {minutesToLabel(m)}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Nivel">
          <ChoiceChips value={level} onChange={setLevel} options={["Iniciación", "2,5", "3,0", "3,5", "4,0"].map((l) => ({ value: l, label: l }))} />
        </FormField>
        {minute !== null ? (
          <p className="text-sm text-text-muted">
            Si a las {clockLabel(minute - courtsOps(data).policy.matchReleaseHours * 60)} no se ha completado, la pista se libera sola. Cambia la antelación en Normas.
          </p>
        ) : null}
        <FormField label="Quién juega ya" htmlFor="nmt-names" hint="Separa los nombres con comas. Entre 1 y 3.">
          <input id="nmt-names" value={names} onChange={(e) => setNames(e.target.value)} placeholder="Hugo Pastor, Irene Mora" className={inputClass} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Lo que te ha traído Franky                                          */
/* ------------------------------------------------------------------ */

export function CourtsFrankyCard() {
  const { data, now, spaceId, vertical } = usePro();
  const coworking = vertical.id === "coworking";
  const last4 = data.history.slice(-4);
  const people = last4.reduce((a, w) => a + w.franky, 0);
  const revenue = last4.reduce((a, w) => a + (w.total ? Math.round((w.revenueCents * w.franky) / w.total) : 0), 0);
  const since = addDays(localDate(now), -60);
  const newOnes = data.clients.filter((c) => fromFranky(c.source) && localDate(c.createdAt) >= since).length;
  const todayFranky = resourceBookings(data, localDate(now)).filter((b) => fromFranky(b.source)).length;
  const matches = data.openMatches.filter((m) => (m as OpenMatchX).publishedAt).length;

  return (
    <section className="rounded-2xl bg-bg-dark p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Lo que te ha traído Franky, 4 semanas</p>
      <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">{people}</p>
      <p className="text-sm text-white/70">{coworking ? "reservas de estudiantes llegaron por Franky" : "reservas llegaron por Franky"}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <p className="font-heading text-xl font-bold tabular">{money(revenue, { round: true })}</p>
          <p className="text-xs text-white/60">facturado, sin comisión por reserva</p>
        </div>
        <div>
          <p className="font-heading text-xl font-bold tabular">{newOnes}</p>
          <p className="text-xs text-white/60">{coworking ? "clientes nuevos en 60 días" : "jugadores nuevos en 60 días"}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-white/60">
        {todayFranky} de las reservas de hoy vienen de Franky.{matches ? ` ${matches} partidos abiertos se están enseñando a estudiantes.` : ""} El cliente y su teléfono son tuyos.
      </p>
      <Link href={sectionHref(spaceId, "estudiantes")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white">
        Ver resultados y ofertas <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
