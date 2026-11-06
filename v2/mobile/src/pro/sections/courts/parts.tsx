import React from "react";
import { Alert, Linking, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, BadgeCheck, MessageCircle, Send, Sparkles, UserPlus, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import { localId, usePro } from "../../store";
import { sectionHref, useGoSection } from "../../shell";
import type { BookingStatus, ProBooking, ProClientSource, ProPayment, ProResource, ProVerticalId } from "../../../../../shared/pro/types";
import { addDays, atLocal, dayLabel, durationLabel, localDate, localMinutes, minutesToLabel, money, time } from "../../../../../shared/pro/format";
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
} from "../../../../../shared/pro/courts";
import { shortUni } from "../../../../../shared/pro/classes";
import { clockLabel, courtsOps, patchCourts } from "../../../../../shared/pro/courts-base";
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
} from "../../../../../shared/pro/courts-ops";
import { checkIn, checkOut, roomMinutesLeft, shiftPresets } from "../../../../../shared/pro/courts-desk";
import { agreementFor, agreementPrice } from "../../../../../shared/pro/courts-growth";
import { AddWaiterForm, BookingFlags, ExtrasPanel, FreedSlotPanel, METHOD_LABEL, SharesPanel } from "./booking-ops";
import { ChoiceGrid, DarkBlock, DarkText, DayChips, Detail, Field, Input, Meter, PAvatar, PButton, PText, Pill, Sheet, StatusPill, Toggle, tone } from "../../kit";
import { RealCourtBookingDrawer, RealNewCourtBookingDrawer } from "./real-booking-drawers";
import { HourGrid, ResourcePicker, TextLink } from "./ui";

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

/** Bloque gris con una cifra grande (precio, pendiente). */
function Figure({ children }: { children: React.ReactNode }) {
  return <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.lg, gap: 4 }}>{children}</View>;
}

function BigNumber({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontFamily: FONT.display, fontSize: 28, letterSpacing: -0.6, color: C.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.2}>
      {children}
    </Text>
  );
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

  // Socios de la sala: los puestos van con su bono; las salas, con las horas de su cuota.
  const selectedMember = data.members.find((m) => m.id === clientId);
  const roomLeft = selectedMember && resource?.kind === "room" ? roomMinutesLeft(data, selectedMember.id, date.slice(0, 7)) : null;
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
  // Turnos de un toque (mañana, tarde, noche, día) en salas de estudio.
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
    void update("court.create", (d) => {
      let next: typeof d = { ...d, bookings: [...d.bookings, booking] };
      if (withPass && pass)
        next = spendPass(next, { passId: pass.id, bookingId: booking.id, amount: passAmount, at: new Date().toISOString() });
      if (roomCovered) next = patchCourts(next, (ops) => ({ roomCredit: { ...ops.roomCredit, [booking.id]: roomCovered } }));
      return next;
    });
    toast("Reserva hecha", {
      kind: "success",
      body: `${resource.name}, ${dayLabel(booking.start)} de ${minutesToLabel(chosen)} a ${minutesToLabel(chosen + duration)}${
        member ? ", con su bono" : withPass && pass ? `, con su ${pass.label.toLowerCase()}` : `, ${money(finalPrice)}`
      }.`,
    });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title={copy.newBooking}
      description={vertical.id === "coworking" ? "Puesto, sala de grupo o bono. Se cobra al llegar o con su bono." : "El precio valle se aplica solo de 10 a 14 h entre semana."}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={`Reservar${finalPrice ? ` · ${money(finalPrice)}` : ""}`} onPress={save} disabled={!resource || chosen === null || name.trim().length < 2 || price === null} />
        </>
      }
    >
      <Field label={vertical.id === "coworking" ? "Espacio" : "Pista"}>
        <ResourcePicker
          resources={data.resources}
          value={resourceId}
          onChange={(id) => {
            const r = data.resources.find((x) => x.id === id);
            if (!r) return;
            setResourceId(r.id);
            const opts = durationOptions(r);
            if (!opts.includes(duration)) setDuration(opts[1] ?? opts[0]);
            setPeople(r.kind === "court" ? 4 : isShared(r) ? 1 : Math.min(4, r.capacity));
          }}
        />
      </Field>

      <Field label="Día">
        <DayChips
          value={date}
          today={today}
          onChange={(v) => {
            setDate(v);
            setMinute(null);
          }}
        />
      </Field>
      <Field label="Duración">
        <ChoiceGrid value={String(duration)} onChange={(v) => setDuration(Number(v))} options={durationOptions(resource).map((d) => ({ value: String(d), label: durationLabel(d) }))} />
      </Field>

      {shifts.length ? (
        <Field label="Turno" hint="Las horas se ajustan solas a tu horario de ese día.">
          <ChoiceGrid
            value={shifts.find((sh) => chosen === sh.from && duration === sh.to - sh.from)?.id ?? ""}
            onChange={(id) => {
              const sh = shifts.find((x) => x.id === id);
              if (!sh) return;
              setDuration(sh.to - sh.from);
              setMinute(sh.from);
            }}
            options={shifts.map((sh) => ({ value: sh.id, label: sh.label, hint: `${clockLabel(sh.from)} a ${clockLabel(sh.to)}` }))}
          />
        </Field>
      ) : null}

      <Field label="Hora de inicio" hint={starts.length ? `${starts.length} horas libres ese día.` : "No queda hueco con esa duración. Prueba otra duración o día."}>
        <HourGrid minutes={starts} value={chosen} onChange={setMinute} valley={(m) => Boolean(resource && valleyApplies(resource, date, m, duration))} />
      </Field>

      <Field label={vertical.id === "coworking" ? "Quién reserva" : "Jugador que reserva"}>
        <Input
          value={name}
          onChangeText={(v) => {
            setName(v);
            setClientId(undefined);
          }}
          placeholder="Nombre y apellido"
          autoComplete="off"
          label={vertical.id === "coworking" ? "Quién reserva" : "Jugador que reserva"}
        />
        {suggestions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {suggestions.map((s) => (
              <Tap
                key={s.id}
                onPress={() => {
                  setName(s.name);
                  setClientId(s.id);
                  setStudent(s.student);
                  setSource(s.source === "franky" || s.source === "hueco" ? s.source : "phone");
                  const own = resource?.kind === "court" ? passesOf(data, { clientId: s.id }, date) : [];
                  setPassId(own[0]?.id ?? null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${s.name}${s.sub ? `, ${s.sub}` : ""}`}
                style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}
              >
                {s.student ? <BadgeCheck size={14} color={C.blue} /> : null}
                <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: C.text }} maxFontSizeMultiplier={1.3}>{s.name}</Text>
                {s.sub ? <Text style={{ fontSize: 12.5, color: C.muted }} maxFontSizeMultiplier={1.3}>{`· ${s.sub}`}</Text> : null}
              </Tap>
            ))}
          </View>
        ) : null}
      </Field>

      {clientId && isFlagged(data, clientId) ? (
        <View style={{ borderRadius: R.lg, backgroundColor: `${C.error}14`, padding: S.md }}>
          <PText v="small" color={C.errorText}>
            {`${name.split(" ")[0]} no se ha presentado ${noShowCount(data, clientId)} veces. Puedes pedirle que pague por adelantado.`}
          </PText>
        </View>
      ) : null}

      {passes.length ? (
        <Field label="Pagar con">
          <ChoiceGrid
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
        </Field>
      ) : null}

      {resource && !isShared(resource) && resource.kind !== "court" ? (
        <Field label="Personas">
          <ChoiceGrid value={String(people)} onChange={(v) => setPeople(Number(v))} options={Array.from({ length: resource.capacity - 1 }, (_, i) => ({ value: String(i + 2), label: String(i + 2) }))} />
        </Field>
      ) : null}

      <Toggle label="Estudiante verificado" value={student} onChange={setStudent} />
      <Field label="Origen">
        <ChoiceGrid
          value={source}
          onChange={setSource}
          options={[
            { value: "phone", label: "Teléfono" },
            { value: "walkin", label: "Mostrador" },
            { value: "franky", label: "Franky" },
          ]}
        />
      </Field>

      {resource && chosen !== null ? (
        <Figure>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md }}>
            <View style={{ flexShrink: 1 }}>
              <BigNumber>{finalPrice === null ? "Precio según servicio" : money(finalPrice)}</BigNumber>
            </View>
            {deal ? (
              <Pill tone="violet" label={`Convenio, ${deal.discountPct} %`} />
            ) : price !== null ? (
              valley ? <Pill tone="success" label="Precio valle" /> : <Pill label="Precio normal" />
            ) : null}
          </View>
          {deal && listPrice !== null && price !== null ? (
            <PText v="small" color={C.blueDeep}>{`${deal.name}: ${money(price)} en vez de ${money(listPrice)}.`}</PText>
          ) : null}
          {pass && passFits ? (
            <PText v="small" color={C.success}>
              {pass.kind === "wallet"
                ? `Se paga con su monedero: le quedarán ${money(pass.left - passAmount)}.`
                : `Se descuenta de su bono: le quedarán ${(Math.round((pass.left - passAmount) * 100) / 100).toLocaleString("es-ES")} ${passUnit(pass)}.`}
            </PText>
          ) : pass ? (
            <PText v="small" color={C.warning}>No le queda saldo suficiente en ese bono.</PText>
          ) : null}
          {roomLeft !== null ? (
            <PText v="small">
              {roomCovered
                ? `Su cuota incluye horas de sala: se descuentan ${durationLabel(roomCovered)} de las ${durationLabel(roomLeft)} que le quedan este mes.`
                : "Ya ha usado las horas de sala de su cuota este mes: se cobra la reserva."}
            </PText>
          ) : null}
          <PText v="small">
            {price === null
              ? "Selecciona un servicio con precio antes de reservar."
              : resource.kind === "court"
                ? `${money(perPlayer(price))} por jugador si pagan entre los cuatro desde Franky.`
                : isShared(resource)
                  ? `${occ} de ${resource.capacity} puestos ocupados a esa hora. Si tiene bono, no se le cobra.`
                  : `${money(Math.round(price / people / 5) * 5)} por persona.`}
          </PText>
          {valley ? <PText v="tiny">De 10 a 14 h entre semana se aplica solo el precio valle.</PText> : null}
        </Figure>
      ) : null}
    </Sheet>
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
  const router = useRouter();
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

  if (!booking) return null;

  const resource = data.resources.find((r) => r.id === booking.resourceId);
  const client = data.clients.find((c) => c.id === booking.clientId);
  const minutes = bookingMinutes(booking);
  const due = booking.paidCents === null ? null : Math.max(0, booking.priceCents - booking.paidCents);
  const valley = resource ? valleyApplies(resource, localDate(booking.start), localMinutes(booking.start), minutes) : false;
  const started = new Date(booking.start).getTime() <= now.getTime();
  const firstName = booking.clientName.split(" ")[0];

  const setStatus = (status: BookingStatus, title: string, detail?: string) => {
    void update(`court.${status}`, (d) => ({ ...d, bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, status } : b)) }));
    toast(title, { kind: "success", body: detail });
    if (status === "cancelled" || status === "no_show") onClose();
  };

  // Cancelar y no presentarse siguen la norma del club: dentro del preaviso
  // se propone cobrar la penalización o perdonarla, y queda en su ficha.
  const policy = courtsOps(data).policy;
  const late = lateCancellation(data, booking, now);
  const shared = resource ? isShared(resource) : false;
  const slot = { resourceId: booking.resourceId, date: localDate(booking.start), from: localMinutes(booking.start), duration: minutes };

  const finishCancel = (chargePenalty: boolean | null) => {
    void update("court.cancelled", (d) => {
      let next = { ...d, bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, status: "cancelled" as const } : b)) };
      if (chargePenalty !== null)
        next = settlePenalty(next, {
          bookingId: booking.id,
          kind: "late_cancel",
          charge: chargePenalty,
          amountCents: late.penaltyCents,
          method,
          at: new Date().toISOString(),
          penaltyId: localId("pn"),
          paymentId: localId("p"),
        });
      return next;
    });
    toast("Reserva cancelada", {
      kind: "success",
      body: chargePenalty ? `Cobrados ${money(late.penaltyCents)} de penalización.` : `La ${copy.one} queda libre y avisamos a ${firstName}.`,
    });
    if (!started && waitersFor(data, slot).length) {
      setFreed(slot);
      setMode("freed");
    } else onClose();
  };

  const confirmCancel = () => {
    if (!started && late.late && late.penaltyCents > 0) {
      setMode("cancel");
      return;
    }
    Alert.alert("Cancelar reserva", `${booking.clientName} · ${time(booking.start)}`, [
      { text: "Volver", style: "cancel" },
      { text: "Cancelar reserva", style: "destructive", onPress: () => finishCancel(null) },
    ]);
  };

  const finishNoShow = (chargePenalty: boolean | null) => {
    void update("court.no_show", (d) => {
      let next = addNoShow({ ...d, bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, status: "no_show" as const } : b)) }, booking.clientId);
      if (chargePenalty !== null)
        next = settlePenalty(next, {
          bookingId: booking.id,
          kind: "no_show",
          charge: chargePenalty,
          amountCents: late.penaltyCents,
          method,
          at: new Date().toISOString(),
          penaltyId: localId("pn"),
          paymentId: localId("p"),
        });
      return next;
    });
    toast("Marcada como no presentada", { kind: "success", body: chargePenalty ? `Cobrados ${money(late.penaltyCents)}.` : "Queda anotado en su ficha." });
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
    void update("court.checkin", () => result.data);
    const detail = [
      result.seat ? `Puesto ${result.seat.label}` : null,
      result.bonoLeft !== undefined ? `le ${result.bonoLeft === 1 ? "queda 1 uso" : `quedan ${result.bonoLeft} usos`} en su bono` : null,
    ]
      .filter(Boolean)
      .join(", ");
    toast(`${firstName} ha llegado`, { kind: "success", body: detail || undefined });
  };

  const leave = () => {
    void update("court.checkout", (d) => checkOut(d, booking.id, new Date()));
    toast(`${firstName} se ha ido`, { kind: "success", body: "Su puesto vuelve a estar libre." });
    onClose();
  };

  const charge = () => {
    if (due === null) return;
    void update("court.charge", (d) => ({
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
    toast("Cobrada", { kind: "success", body: `${money(due)} con ${method === "card" ? "tarjeta" : method === "cash" ? "efectivo" : "Bizum"}.` });
    onClose();
  };

  const moveTarget = data.resources.find((r) => r.id === moveResource);
  const moveOptions = moveTarget ? freeStarts(data, moveTarget, moveDate, minutes, moveDate === localDate(now) ? localMinutes(now) : 0, booking.id) : [];
  const move = () => {
    if (moveMinute === null || !moveTarget) return;
    const basePrice = priceFor(moveTarget, moveDate, moveMinute, minutes);
    if (basePrice === null) return;
    const price = basePrice * (isShared(moveTarget) ? booking.partySize : 1);
    void update("court.move", (d) => ({
      ...d,
      bookings: d.bookings.map((b) =>
        b.id === booking.id
          ? { ...b, resourceId: moveTarget.id, start: atLocal(moveDate, moveMinute), end: atLocal(moveDate, moveMinute + minutes), priceCents: b.note === "Con bono" ? 0 : price }
          : b,
      ),
    }));
    toast("Reserva movida", { kind: "success", body: `${moveTarget.name}, ${dayLabel(atLocal(moveDate, moveMinute))} a las ${minutesToLabel(moveMinute)}. Avisamos a ${firstName}.` });
    setMode("view");
  };

  const footer = (() => {
    if (mode === "freed") return <PButton label="Listo" onPress={onClose} />;
    if (mode === "cancel")
      return (
        <>
          <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
          <PButton label="Perdonar" variant="outline" onPress={() => finishCancel(false)} />
          <PButton label={`Cobrar ${money(late.penaltyCents)}`} onPress={() => finishCancel(true)} />
        </>
      );
    if (mode === "noshow")
      return (
        <>
          <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
          <PButton label="Perdonar" variant="outline" onPress={() => finishNoShow(false)} />
          <PButton label={`Cobrar ${money(late.penaltyCents)}`} onPress={() => finishNoShow(true)} />
        </>
      );
    if (mode === "charge" && due !== null)
      return (
        <>
          <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
          <PButton label={`Cobrar ${money(due)}`} onPress={charge} />
        </>
      );
    if (mode === "move")
      return (
        <>
          <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
          <PButton label="Mover reserva" onPress={move} disabled={moveMinute === null || !moveOptions.includes(moveMinute) || moveTarget?.pricePerHourCents === null} />
        </>
      );
    switch (booking.status) {
      case "requested":
        return (
          <>
            <PButton label="Rechazar" variant="ghost" onPress={() => setStatus("cancelled", "Solicitud rechazada", "Le avisamos para que elija otra hora.")} />
            <PButton label="Aceptar" onPress={() => setStatus("confirmed", "Reserva confirmada", "Le llega el aviso con la pista y la hora.")} />
          </>
        );
      case "confirmed":
        return (
          <>
            {started ? <PButton label="No vino" variant="ghost" onPress={markNoShow} /> : null}
            <PButton label="Mover" variant="outline" onPress={() => setMode("move")} />
            <PButton label="Han llegado" onPress={arrive} />
          </>
        );
      case "arrived":
      case "in_service":
        if (shared)
          return (
            <>
              {due ? <PButton label={`Cobrar ${money(due)}`} variant="outline" onPress={() => setMode("charge")} /> : null}
              <PButton label="Se va" onPress={leave} />
            </>
          );
        return (
          <>
            <PButton label="Mover" variant="outline" onPress={() => setMode("move")} />
            {due ? <PButton label={`Cobrar ${money(due)}`} onPress={() => setMode("charge")} /> : <PButton label="Terminar" onPress={() => setStatus("done", "Terminada")} />}
          </>
        );
      default:
        return due ? <PButton label={`Cobrar ${money(due)}`} onPress={() => setMode("charge")} /> : undefined;
    }
  })();

  return (
    <Sheet
      open
      onClose={onClose}
      title={booking.clientName}
      description={`${resource?.name ?? ""} · ${dayLabel(booking.start)} · ${time(booking.start)} a ${time(booking.end)}`}
      footer={footer}
    >
      {mode === "freed" && freed ? (
        <>
          <PText v="small">{`La reserva está cancelada y la ${copy.one} vuelve a estar libre.`}</PText>
          <FreedSlotPanel slot={freed} onDone={onClose} />
        </>
      ) : mode === "cancel" || mode === "noshow" ? (
        <>
          <Figure>
            <PText v="small">
              {mode === "cancel"
                ? `Cancela con ${late.hoursLeft < 1 ? "menos de una hora" : `${Math.floor(late.hoursLeft)} h`} de antelación. Tu norma pide ${policy.noticeHours} h.`
                : "No se ha presentado a su reserva."}
            </PText>
            <BigNumber>{money(late.penaltyCents)}</BigNumber>
            <PText v="tiny">{`El ${policy.penaltyPct} % del precio. Puedes cobrarlo o perdonarlo; en los dos casos queda anotado en su ficha.`}</PText>
          </Figure>
          <Field label="Si lo cobras, con qué">
            <ChoiceGrid
              value={method}
              onChange={setMethod}
              options={(["card", "bizum", "cash"] as const).map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
            />
          </Field>
        </>
      ) : mode === "charge" && due !== null ? (
        <>
          <Figure>
            <PText v="small">{booking.paidCents ? `Ya pagado ${money(booking.paidCents)} de ${money(booking.priceCents)}` : "Pendiente"}</PText>
            <BigNumber>{money(due)}</BigNumber>
            {resource?.kind === "court" ? <PText v="tiny">{`${money(perPlayer(booking.priceCents))} por jugador`}</PText> : null}
          </Figure>
          <Field label="Método de pago">
            <ChoiceGrid
              value={method}
              onChange={setMethod}
              options={[
                { value: "card", label: "Tarjeta" },
                { value: "cash", label: "Efectivo" },
                { value: "bizum", label: "Bizum" },
              ]}
            />
          </Field>
        </>
      ) : mode === "move" ? (
        <>
          <Field label="Día">
            <DayChips
              value={moveDate}
              today={localDate(now)}
              onChange={(v) => {
                setMoveDate(v);
                setMoveMinute(null);
              }}
            />
          </Field>
          <Field label={vertical.id === "coworking" ? "Espacio" : "Pista"}>
            <ChoiceGrid
              value={moveResource}
              onChange={(v) => {
                setMoveResource(v);
                setMoveMinute(null);
              }}
              options={data.resources.filter((r) => r.kind === resource?.kind).map((r) => ({ value: r.id, label: r.name }))}
            />
          </Field>
          <Field label="Hora" hint={moveOptions.length ? undefined : "No hay hueco ese día con la misma duración."}>
            <HourGrid minutes={moveOptions} value={moveMinute} onChange={setMoveMinute} />
          </Field>
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <BookingStatusPill status={booking.status} playing={copy.playing} />
            {booking.student ? <Pill tone="violet" icon={BadgeCheck} label={client?.student ? shortUni(client.student.university) : "Estudiante"} /> : null}
            {fromFranky(booking.source) ? <Pill tone="success" label="Vino por Franky" /> : null}
            {valley ? <Pill tone="success" label="Precio valle" /> : null}
            <BookingFlags booking={booking} />
          </View>

          <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}>
            <Detail
              label={vertical.id === "coworking" ? "Espacio" : "Pista"}
              value={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone(resource?.tone).bar }} />
                  <PText v="h3" numberOfLines={1}>{resource?.name ?? ""}</PText>
                </View>
              }
            />
            <Detail label="Duración" value={durationLabel(minutes)} />
            {resource && !isShared(resource) ? <Detail label="Personas" value={booking.partySize} /> : null}
            <Detail label="Precio" value={booking.note === "Con bono" ? "Con bono" : money(booking.priceCents)} />
            {resource?.kind === "court" ? <Detail label="Por jugador" value={money(perPlayer(booking.priceCents))} /> : null}
            <Detail label="Origen" value={SOURCE_LABEL[booking.source]} last={!(booking.note && booking.note !== "Con bono")} />
            {booking.note && booking.note !== "Con bono" ? <Detail label="Nota" value={booking.note} last /> : null}
          </View>

          {isSplitBooking(data, booking) && booking.status !== "cancelled" ? (
            <SharesPanel booking={booking} />
          ) : booking.priceCents && booking.paidCents !== null ? (
            <View style={{ gap: S.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
                <PText v="h3">Pagado</PText>
                <PText v="small">{`${money(booking.paidCents)} de ${money(booking.priceCents)}`}</PText>
              </View>
              <Meter value={booking.paidCents} max={booking.priceCents} tone={due ? "warning" : "success"} />
              {resource?.kind === "court" && due ? <PText v="tiny">Con Franky cada jugador paga su parte desde el móvil y no persigues a nadie.</PText> : null}
            </View>
          ) : null}

          {resource?.kind === "court" && booking.status !== "cancelled" && booking.status !== "no_show" ? <ExtrasPanel booking={booking} /> : null}

          {client ? (
            <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.lg, gap: S.sm }}>
              <PText v="label">Ficha</PText>
              <PText v="small" color={C.text}>
                {`${client.visits} ${client.visits === 1 ? "visita" : "visitas"}${client.spentCents !== null ? ` · ${money(client.spentCents, { round: true })} en total` : ""}`}
              </PText>
              {client.tags.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {client.tags.map((t) => (
                    <Pill key={t} label={t} />
                  ))}
                </View>
              ) : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: S.lg }}>
                <TextLink
                  label="Abrir ficha"
                  icon={Users}
                  onPress={() => {
                    onClose();
                    router.replace(`${sectionHref(spaceId, "clientes")}?c=${client.id}` as never);
                  }}
                />
                {client.phone ? (
                  <TextLink
                    label="WhatsApp"
                    icon={MessageCircle}
                    onPress={() =>
                      void Linking.openURL(
                        `https://wa.me/34${client.phone!.replace(/\s/g, "")}?text=${encodeURIComponent(`Hola ${client.name.split(" ")[0]}, te escribimos de ${data.space.name}.`)}`,
                      )
                    }
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          {!started && !shared && (booking.status === "confirmed" || booking.status === "requested") ? <AddWaiterForm booking={booking} /> : null}

          {booking.status !== "cancelled" && booking.status !== "done" && booking.status !== "no_show" ? (
            <Tap onPress={confirmCancel} accessibilityRole="button" accessibilityLabel="Cancelar reserva" style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.errorText }} maxFontSizeMultiplier={1.3}>
                {`Cancelar reserva${!started && late.late && late.penaltyCents > 0 ? ` (dentro de las ${policy.noticeHours} h de preaviso)` : ""}`}
              </Text>
            </Tap>
          ) : null}
        </>
      )}
    </Sheet>
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
  const match = (data.openMatches as OpenMatchX[]).find((m) => m.id === matchId) ?? null;
  const [player, setPlayer] = React.useState("");

  React.useEffect(() => setPlayer(""), [matchId]);

  if (!match) return null;
  const resource = data.resources.find((r) => r.id === match.resourceId);
  const from = localMinutes(match.start);
  const date = localDate(match.start);
  const price = resource ? priceFor(resource, date, from, MATCH_MINUTES) : 0;

  const publish = () => {
    const reach = matchReach(match.level);
    void update("match.publish", (d) => ({
      ...d,
      openMatches: d.openMatches.map((m) => (m.id === match.id ? ({ ...m, publishedAt: now.toISOString(), reach } as OpenMatchX) : m)),
    }));
    toast("Publicado a estudiantes", {
      kind: "success",
      body: `Lo verán unos ${reach} jugadores de nivel ${match.level} de ${match.university ? shortUni(match.university) : "tu zona"}. Sin comisión por jugador.`,
    });
  };

  const addPlayer = () => {
    const name = player.trim();
    if (!name || price === null) return;
    const complete = match.needed <= 1;
    void update("match.add", (d) => {
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
    toast(complete ? "Partido completo" : "Jugador añadido", {
      kind: "success",
      body: complete ? "Pasa a ser una reserva normal. Cada uno paga su parte desde Franky." : `Faltan ${match.needed - 1}.`,
    });
    setPlayer("");
    if (complete) onClose();
  };

  const cancel = () =>
    Alert.alert("Cancelar partido", `Nivel ${match.level} · ${time(match.start)}`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cancelar partido",
        style: "destructive",
        onPress: () => {
          void update("match.cancel", (d) => ({ ...d, openMatches: d.openMatches.filter((m) => m.id !== match.id) }));
          toast("Partido cancelado", { kind: "success", body: "La pista queda libre y avisamos a los apuntados." });
          onClose();
        },
      },
    ]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Partido abierto, nivel ${match.level}`}
      description={`${resource?.name ?? ""} · ${dayLabel(match.start)} · ${time(match.start)} a ${minutesToLabel(from + MATCH_MINUTES)}`}
      footer={
        <>
          <Tap onPress={cancel} accessibilityRole="button" accessibilityLabel="Cancelar partido" style={{ minHeight: 46, justifyContent: "center", paddingHorizontal: S.sm, marginRight: "auto" }}>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.errorText }} maxFontSizeMultiplier={1.3}>Cancelar partido</Text>
          </Tap>
          <PButton label={match.publishedAt ? "Ya publicado" : "Publicar a estudiantes"} icon={Send} onPress={publish} disabled={Boolean(match.publishedAt)} />
        </>
      }
    >
      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, gap: S.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 26, color: C.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.2}>
            {match.players.length}
            <Text style={{ fontSize: 16, color: C.muted }}>/4</Text>
          </Text>
          <Pill tone={match.needed === 1 ? "warning" : "violet"} label={`Faltan ${match.needed}`} />
        </View>
        <Meter value={match.players.length} max={4} />
        <View style={{ gap: S.sm }}>
          {match.players.map((p) => (
            <View key={p} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <PAvatar name={p} size={32} toneKey="violet" />
              <PText v="body" numberOfLines={1} color={C.text} style={{ flex: 1 }}>{p}</PText>
              <View accessible accessibilityLabel="Estudiante verificado">
                <BadgeCheck size={15} color={C.blue} />
              </View>
            </View>
          ))}
          {Array.from({ length: match.needed }, (_, i) => (
            <View key={`e${i}`} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, alignItems: "center", justifyContent: "center" }}>
                <UserPlus size={14} color={C.muted} />
              </View>
              <PText v="small">Hueco libre</PText>
            </View>
          ))}
        </View>
      </View>

      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}>
        <Detail label="Nivel" value={match.level} />
        <Detail label="Universidad" value={match.university ?? "Cualquiera"} />
        <Detail label="Precio por jugador" value={price === null ? "Precio según servicio" : money(perPlayer(price))} />
        <Detail label="Publicado" value={match.publishedAt ? `Sí, lo han visto ${match.reach ?? matchReach(match.level)} estudiantes` : "Todavía no"} last />
      </View>

      <Field label="Añadir un jugador que te ha llamado">
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <View style={{ flex: 1 }}>
            <Input value={player} onChangeText={setPlayer} onSubmitEditing={addPlayer} returnKeyType="done" placeholder="Nombre" label="Añadir un jugador que te ha llamado" />
          </View>
          <PButton label="Añadir" variant="outline" onPress={addPlayer} disabled={!player.trim()} />
        </View>
      </Field>

      <View style={{ flexDirection: "row", gap: S.sm, borderRadius: R.lg, backgroundColor: C.accentSoft, padding: S.md }}>
        <Sparkles size={16} color={C.blueDeep} style={{ marginTop: 2 }} />
        <PText v="small" color={C.blueDeep} style={{ flex: 1 }}>
          {`Franky enseña el partido a estudiantes de ${match.university ? shortUni(match.university) : "tu zona"} con nivel ${match.level} que suelen jugar a esa hora. Cuando se completa, pasa a ser una reserva y cada uno paga su parte.`}
        </PText>
      </View>
    </Sheet>
  );
}

export type NewMatchPreset = { date: string } | null;

export function NewMatchDrawer({ preset, onClose }: { preset: NewMatchPreset; onClose: () => void }) {
  const { data, update, now } = usePro();
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
    void update("match.create", (d) => ({ ...d, openMatches: [...d.openMatches, match] }));
    toast("Partido abierto publicado", { kind: "success", body: `Faltan ${match.needed}. Lo verán unos ${match.reach} estudiantes de nivel ${level}.` });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title="Nuevo partido abierto"
      description="Para quien quiere jugar y no tiene con quién. Se completa con estudiantes de nivel parecido."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Publicar" icon={Send} onPress={save} disabled={!resource || minute === null || !players.length} />
        </>
      }
    >
      <Field label="Día">
        <DayChips
          value={date}
          today={localDate(now)}
          days={14}
          onChange={(v) => {
            setDate(v);
            setMinute(null);
          }}
        />
      </Field>
      <Field label="Pista">
        <ResourcePicker
          resources={data.resources}
          value={resourceId}
          onChange={(id) => {
            setResourceId(id);
            setMinute(null);
          }}
        />
      </Field>
      <Field label="Hora (90 min)" hint={starts.length ? undefined : "Esa pista no tiene hueco de 90 minutos ese día."}>
        <HourGrid minutes={starts} value={minute} onChange={setMinute} />
      </Field>
      <Field label="Nivel">
        <ChoiceGrid value={level} onChange={setLevel} options={["Iniciación", "2,5", "3,0", "3,5", "4,0"].map((l) => ({ value: l, label: l }))} />
      </Field>
      <Field label="Quién juega ya" hint="Separa los nombres con comas. Entre 1 y 3.">
        <Input value={names} onChangeText={setNames} placeholder="Hugo Pastor, Irene Mora" label="Quién juega ya" />
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Lo que te ha traído Franky                                          */
/* ------------------------------------------------------------------ */

export function CourtsFrankyCard() {
  const { data, now, vertical } = usePro();
  const go = useGoSection();
  const coworking = vertical.id === "coworking";
  const last4 = data.history.slice(-4);
  const people = last4.reduce((a, w) => a + w.franky, 0);
  const revenue = last4.reduce((a, w) => a + (w.total ? Math.round((w.revenueCents * w.franky) / w.total) : 0), 0);
  const since = addDays(localDate(now), -60);
  const newOnes = data.clients.filter((c) => fromFranky(c.source) && localDate(c.createdAt) >= since).length;
  const todayFranky = resourceBookings(data, localDate(now)).filter((b) => fromFranky(b.source)).length;
  const matches = data.openMatches.filter((m) => (m as OpenMatchX).publishedAt).length;

  return (
    <DarkBlock>
      <DarkText v="label" dim>Lo que te ha traído Franky, 4 semanas</DarkText>
      <DarkText v="display">{people}</DarkText>
      <DarkText v="small" dim>{coworking ? "reservas de estudiantes llegaron por Franky" : "reservas llegaron por Franky"}</DarkText>
      <View style={{ flexDirection: "row", gap: S.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: S.md, marginTop: S.xs }}>
        <View style={{ flex: 1, gap: 2 }}>
          <DarkText v="h2">{money(revenue, { round: true })}</DarkText>
          <DarkText v="small" dim>facturado, sin comisión por reserva</DarkText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <DarkText v="h2">{newOnes}</DarkText>
          <DarkText v="small" dim>{coworking ? "clientes nuevos en 60 días" : "jugadores nuevos en 60 días"}</DarkText>
        </View>
      </View>
      <DarkText v="small" dim>
        {`${todayFranky} de las reservas de hoy vienen de Franky.${matches ? ` ${matches} partidos abiertos se están enseñando a estudiantes.` : ""} El cliente y su teléfono son tuyos.`}
      </DarkText>
      <Tap onPress={() => go("estudiantes")} accessibilityRole="link" accessibilityLabel="Ver resultados y ofertas" style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}>
        <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: "#FFFFFF" }} maxFontSizeMultiplier={1.3}>Ver resultados y ofertas</Text>
        <ArrowRight size={14} color="#FFFFFF" />
      </Tap>
    </DarkBlock>
  );
}
