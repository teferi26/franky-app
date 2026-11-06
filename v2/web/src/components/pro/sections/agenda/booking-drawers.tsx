"use client";

import * as React from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CalendarClock,
  FlaskConical,
  HeartPulse,
  ListPlus,
  MessageCircle,
  Repeat,
  Ticket,
  UserRound,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { BookingStatus, ProBooking, ProClient } from "@/lib/pro/types";
import type {
  ProColorFormula,
  ProConsentTemplate,
} from "@/lib/pro/agenda-types";
import {
  addDays,
  dayLabel,
  durationLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  relative,
  time,
} from "@/lib/pro/format";
import {
  durationFor,
  helpersFor,
  isoFor,
  staffForService,
} from "@/lib/pro/agenda";
import {
  addWaitlist,
  createSeries,
  depositRule,
  seriesPlan,
  setBookingStatus,
  type SeriesStep,
  studentPriceApplies,
  valleyLabel,
} from "@/lib/pro/agenda-ops";
import { healthAlerts, needsPatchTest } from "@/lib/pro/agenda-clients";
import { activeBundle, bundleRemaining } from "@/lib/pro/agenda-money";
import { seriesPosition } from "@/lib/pro/agenda-day";
import { useAgendaSlots } from "@/lib/pro/use-agenda-slots";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Detail,
  Drawer,
  FormField,
  Pill,
  StatusPill,
  inputClass,
  textareaClass,
} from "../../kit";
import { TONES } from "../../tones";
import { sectionHref } from "../../shell";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import {
  BookingSignals,
  ConsentSign,
  DepositBox,
  FormulaForm,
  FreedGapPanel,
  ReminderStrip,
} from "./booking-extras";
import { AfterCharge, CheckoutFields, useCheckout } from "./checkout";
import { Callout, OptionButton, staffFirst, useAgenda } from "./parts";

const SOURCE_LABEL: Record<ProBooking["source"], string> = {
  franky: "Reserva en Franky",
  hueco: "Hueco relámpago",
  card: "Franky Card",
  instagram: "Instagram",
  phone: "Teléfono",
  walkin: "Sin cita",
  google: "Google",
  grupo: "Grupo",
  unknown: "Sin indicar",
};

export function sourceLabel(source: ProBooking["source"]) {
  return SOURCE_LABEL[source];
}

export function isFromFranky(source: ProBooking["source"]) {
  return (
    source === "franky" ||
    source === "hueco" ||
    source === "card" ||
    source === "grupo"
  );
}

/** Servicio de prueba de sensibilidad del negocio, si lo tiene dado de alta. */
function patchTestService(data: ReturnType<typeof usePro>["data"]) {
  return data.services.find((s) => /sensibilidad/i.test(s.name));
}

/* ------------------------------------------------------------------ */
/* Detalle de una cita                                                 */
/* ------------------------------------------------------------------ */

type Mode = "view" | "charge" | "move" | "after" | "freed" | "formula" | "sign";

export function BookingDrawer({
  bookingId,
  onClose,
  onNewBooking,
}: {
  bookingId: string | null;
  onClose: () => void;
  /** Para citar la prueba de sensibilidad desde la cita. */
  onNewBooking?: (preset: NewBookingPreset) => void;
}) {
  const { data, spaceId, pending, can, demo, now, ops, run, vertical } =
    useAgenda();
  const toast = useToast();
  const booking = data.bookings.find((b) => b.id === bookingId) ?? null;
  const [mode, setMode] = React.useState<Mode>("view");
  const [moveDate, setMoveDate] = React.useState("");
  const [moveStaff, setMoveStaff] = React.useState("");
  const [moveMinute, setMoveMinute] = React.useState<number | null>(null);
  const [formulaBase, setFormulaBase] = React.useState<ProColorFormula>();
  const [consent, setConsent] = React.useState<ProConsentTemplate | null>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const checkout = useCheckout(mode === "charge" ? booking : null);
  const resetCheckout = checkout.reset;

  React.useEffect(() => {
    setMode("view");
    resetCheckout();
    if (booking) {
      setMoveDate(localDate(booking.start));
      setMoveStaff(booking.staffId ?? "");
      setMoveMinute(localMinutes(booking.start));
    }
    // Solo al cambiar de cita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (!booking)
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );

  const service = data.services.find((s) => s.id === booking.serviceId);
  const staff = data.staff.find((s) => s.id === booking.staffId);
  // Quien acompaña al titular en la cita (ayudante, segunda columna).
  const helperNames = (booking.resourceIds ?? [])
    .filter((id) => id !== booking.staffId)
    .map((id) => data.staff.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const client = data.clients.find((c) => c.id === booking.clientId);
  const series = seriesPosition(data, booking);
  const whatsapp = customerWhatsApp(
    client?.phone,
    `Hola ${client?.name.split(" ")[0] ?? ""}, te escribimos de ${data.space.name}.`,
  );
  const duration =
    (new Date(booking.end).getTime() - new Date(booking.start).getTime()) /
    60000;
  const showFinance = demo || can("finance.read");
  const chargeable =
    checkout.serviceCents + checkout.totals.productCents > 0 ||
    Boolean(checkout.bundle);

  const setStatus = async (status: BookingStatus, message: string) => {
    if (
      !(await run(`booking.${status}`, (d) =>
        setBookingStatus(d, booking.id, status),
      ))
    )
      return;
    toast.success(message);
    if (status === "cancelled" || status === "no_show") {
      // Si el hueco aún se puede aprovechar, enseñamos quién lo quería.
      if (ops && localDate(booking.start) >= localDate(now)) setMode("freed");
      else onClose();
    }
  };

  const charge = async () => {
    if (await checkout.submit()) setMode("after");
  };

  const move = async () => {
    if (moveMinute === null) return;
    if (
      !(await run("booking.move", (d) => ({
        ...d,
        bookings: d.bookings.map((b) =>
          b.id === booking.id
            ? {
                ...b,
                staffId: moveStaff || b.staffId,
                // La segunda persona sigue con la cita; el titular cambia.
                resourceIds: b.resourceIds?.map((id) =>
                  id === b.staffId ? moveStaff || id : id,
                ),
                start: isoFor(moveDate, moveMinute),
                end: isoFor(moveDate, moveMinute + duration),
              }
            : b,
        ),
      })))
    )
      return;
    toast.success("Cambio de cita guardado");
    setMode("view");
  };

  const patchBooking = () => {
    const test = patchTestService(data);
    if (!onNewBooking || !client) return;
    const date = localDate(booking.start);
    const twoBefore = addDays(date, -2);
    onNewBooking({
      date: twoBefore >= localDate(now) ? twoBefore : localDate(now),
      clientId: client.id,
      serviceId: test?.id,
    });
    onClose();
  };

  const back = (
    <Button variant="ghost" onClick={() => setMode("view")}>
      Volver
    </Button>
  );

  const footer = (() => {
    if (mode === "charge")
      return (
        <>
          {back}
          <Button
            variant="dark"
            onClick={charge}
            disabled={!checkout.ready || !chargeable}
          >
            Registrar cobro{" "}
            {checkout.prepaid !== null
              ? money(checkout.totals.chargeCents)
              : ""}
          </Button>
        </>
      );
    if (mode === "move")
      return (
        <>
          {back}
          <Button
            variant="dark"
            onClick={move}
            disabled={pending || !can("booking.move") || moveMinute === null}
          >
            {booking.customerAccount ? "Proponer cambio" : "Mover cita"}
          </Button>
        </>
      );
    if (mode === "formula" || mode === "sign") return back;
    if (mode === "after" || mode === "freed")
      return (
        <Button variant="dark" onClick={onClose}>
          Listo
        </Button>
      );
    switch (booking.status) {
      case "requested":
        return (
          <>
            <Button
              variant="ghost"
              disabled={pending || !can("booking.cancelled")}
              onClick={() => setStatus("cancelled", "Solicitud rechazada")}
            >
              Rechazar
            </Button>
            <Button
              variant="dark"
              disabled={pending || !can("booking.confirmed")}
              onClick={() => setStatus("confirmed", "Cita confirmada")}
            >
              Aceptar cita
            </Button>
          </>
        );
      case "confirmed":
        return (
          <>
            <Button
              variant="ghost"
              disabled={pending || !can("booking.no_show")}
              onClick={() => setStatus("no_show", "Marcada como no presentada")}
            >
              No vino
            </Button>
            <Button
              variant="outline"
              disabled={pending || !can("booking.move")}
              onClick={() => setMode("move")}
            >
              Mover
            </Button>
            <Button
              variant="dark"
              disabled={pending || !can("booking.arrived")}
              onClick={() => setStatus("arrived", "Ha llegado")}
            >
              Ha llegado
            </Button>
          </>
        );
      case "arrived":
        return (
          <>
            <Button
              variant="outline"
              disabled={pending || !can("booking.in_service")}
              onClick={() => setStatus("in_service", "Atendiendo")}
            >
              Empezar
            </Button>
            <Button
              variant="dark"
              disabled={pending || !can("booking.charge")}
              onClick={() => setMode("charge")}
            >
              Registrar cobro
            </Button>
          </>
        );
      case "in_service":
        return (
          <Button
            variant="dark"
            disabled={pending || !can("booking.charge")}
            onClick={() => setMode("charge")}
          >
            Registrar cobro
          </Button>
        );
      case "done":
        return ops ? (
          <Button variant="outline" onClick={() => setMode("after")}>
            Reseña y cuidados
          </Button>
        ) : null;
      default:
        return null;
    }
  })();

  const titles: Partial<Record<Mode, string>> = {
    charge: "Cobrar",
    after: "Cobrado",
    freed: "Aprovecha el hueco",
    formula: "Fórmula de color",
    sign: "Consentimiento",
  };

  return (
    <>
      <Drawer
        open={Boolean(booking)}
        onOpenChange={(v) => !v && onClose()}
        title={titles[mode] ?? service?.name ?? "Cita"}
        description={`${mode === "view" ? "" : `${booking.clientName} · `}${dayLabel(booking.start)} · ${time(booking.start)} a ${time(booking.end)}`}
        footer={footer}
      >
        {booking.reschedule && mode === "view" ? (
          <p
            className="mb-4 rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-secondary"
            role="status"
          >
            Cambio propuesto al {dayLabel(booking.reschedule.start)} a las{" "}
            {time(booking.reschedule.start)}. La cita mantiene su hora actual
            hasta que el cliente lo acepte.
          </p>
        ) : null}
        {mode === "charge" ? (
          <CheckoutFields checkout={checkout} />
        ) : mode === "after" ? (
          <AfterCharge bookingId={booking.id} />
        ) : mode === "freed" ? (
          <FreedGapPanel
            booking={booking}
            onOffer={(gap) => setOffer({ gap })}
            onDone={onClose}
          />
        ) : mode === "formula" && client ? (
          <FormulaForm
            client={client}
            booking={booking}
            base={formulaBase}
            onDone={() => setMode("view")}
          />
        ) : mode === "sign" && client && consent ? (
          <ConsentSign
            client={client}
            template={consent}
            onDone={() => setMode("view")}
          />
        ) : mode === "move" ? (
          <MoveForm
            booking={booking}
            duration={duration}
            date={moveDate}
            setDate={setMoveDate}
            staffId={moveStaff}
            setStaffId={setMoveStaff}
            minute={moveMinute}
            setMinute={setMoveMinute}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <Avatar
                name={booking.clientName}
                tone={staff?.tone ?? "slate"}
                size="lg"
              />
              <div className="min-w-0">
                <p className="truncate font-heading text-lg font-bold">
                  {booking.clientName}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusPill status={booking.status} />
                  {client?.student ? (
                    <Pill tone={client.student.verified ? "violet" : "neutral"}>
                      {client.student.verified ? (
                        <BadgeCheck className="h-3 w-3" />
                      ) : null}
                      {shortUni(client.student.university)}
                    </Pill>
                  ) : null}
                  {isFromFranky(booking.source) ? (
                    <Pill tone="success">Vino por Franky</Pill>
                  ) : null}
                  {series ? (
                    <Pill>
                      <Repeat className="h-3 w-3" />{" "}
                      {vertical.id === "beauty"
                        ? `Sesión ${series.index} de ${series.total}`
                        : "Cita fija"}
                    </Pill>
                  ) : null}
                  {booking.agenda?.recoveredFrom ? (
                    <Pill tone="success">Hueco recuperado</Pill>
                  ) : null}
                </div>
              </div>
            </div>

            <ReminderStrip booking={booking} />
            <DepositBox booking={booking} />
            <BookingSignals
              booking={booking}
              onSign={(template) => {
                setConsent(template);
                setMode("sign");
              }}
              onFormula={(base) => {
                setFormulaBase(base);
                setMode("formula");
              }}
              onPatchBooking={patchBooking}
              canPatchBooking={Boolean(onNewBooking)}
            />

            <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
              <Detail label="Profesional">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      TONES[staff?.tone ?? "slate"].dot,
                    )}
                  />
                  {staff?.name ?? "Sin asignar"}
                </span>
              </Detail>
              {helperNames.length ? (
                <Detail label="Con">{helperNames.join(", ")}</Detail>
              ) : null}
              <Detail label="Duración">{durationLabel(duration)}</Detail>
              <Detail label="Precio">{money(booking.priceCents)}</Detail>
              <Detail label="Origen">{SOURCE_LABEL[booking.source]}</Detail>
            </div>

            {booking.note ? (
              <section className="rounded-2xl border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Nota de la cita
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                  {booking.note}
                </p>
              </section>
            ) : null}

            {client ? (
              <div className="rounded-2xl bg-bg-secondary p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Ficha
                </p>
                <p className="mt-1.5 text-sm">
                  {client.visits} {client.visits === 1 ? "visita" : "visitas"}
                  {showFinance && client.spentCents !== null
                    ? ` · ${money(client.spentCents, { round: true })} en total`
                    : ""}
                  {client.lastVisit
                    ? ` · última ${relative(client.lastVisit)}`
                    : ""}
                </p>
                {client.noShows ? (
                  <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
                    No se presentó {client.noShows}{" "}
                    {client.noShows === 1 ? "vez" : "veces"}
                  </p>
                ) : null}
                {client.technical ? (
                  <p className="mt-2 text-sm text-text-secondary">
                    {client.technical}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`${sectionHref(spaceId, "clientes")}?c=${client.id}`}
                    className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-violet"
                  >
                    <UserRound className="h-4 w-4" /> Abrir ficha
                  </Link>
                  {whatsapp ? (
                    <a
                      href={whatsapp}
                      className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-violet"
                    >
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {booking.status !== "cancelled" &&
            booking.status !== "done" &&
            booking.status !== "no_show" ? (
              <button
                type="button"
                disabled={pending || !can("booking.cancelled")}
                onClick={() => setStatus("cancelled", "Cita cancelada")}
                className="inline-flex h-10 items-center self-start text-sm font-semibold text-rose-600"
              >
                Cancelar cita
              </button>
            ) : null}
          </div>
        )}
      </Drawer>
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </>
  );
}

function MoveForm({
  booking,
  duration,
  date,
  setDate,
  staffId,
  setStaffId,
  minute,
  setMinute,
}: {
  booking: ProBooking;
  duration: number;
  date: string;
  setDate: (v: string) => void;
  staffId: string;
  setStaffId: (v: string) => void;
  minute: number | null;
  setMinute: (v: number | null) => void;
}) {
  const { data, demo } = usePro();
  const service = data.services.find((s) => s.id === booking.serviceId);
  const slots = useAgendaSlots({
    date,
    serviceId: service?.id,
    staffId,
    duration,
    ignoreBookingId: booking.id,
  });
  const options = slots.minutes;
  return (
    <div className="flex flex-col gap-5">
      <FormField label="Día" htmlFor="move-date">
        <input
          id="move-date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setMinute(null);
          }}
          className={inputClass}
        />
      </FormField>
      <FormField label="Profesional">
        <ChoiceChips
          value={staffId}
          onChange={(v) => {
            setStaffId(v);
            setMinute(null);
          }}
          options={staffForService(data, service)
            .filter((s) => demo || s.id === booking.staffId)
            .map((s) => ({ value: s.id, label: s.name.split(" ")[0] }))}
        />
      </FormField>
      <FormField label="Hora">
        {options.length ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {options.map((m) => (
              <OptionButton
                key={m}
                active={minute === m}
                onClick={() => setMinute(m)}
              >
                {minutesToLabel(m)}
              </OptionButton>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted" role="status">
            {slots.loading
              ? "Comprobando huecos..."
              : (slots.error ?? "No hay huecos ese día para esta persona.")}
          </p>
        )}
      </FormField>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nueva cita                                                          */
/* ------------------------------------------------------------------ */

export type NewBookingPreset = {
  date: string;
  staffId?: string;
  minute?: number;
  serviceId?: string;
  clientId?: string;
} | null;

/**
 * Cada cuánto se repite. Además de 2, 3 y 4 semanas, el ritmo propio del
 * servicio (un láser cada 6 u 8 semanas) para montar un plan de sesiones.
 */
function repeatOptions(returnWeeks?: number) {
  const weeks = [2, 3, 4];
  if (returnWeeks && returnWeeks > 1 && !weeks.includes(returnWeeks))
    weeks.push(returnWeeks);
  return [
    { value: 0, label: "No se repite" },
    ...weeks
      .sort((a, b) => a - b)
      .map((value) => ({
        value,
        label: value === 1 ? "Cada semana" : `Cada ${value} semanas`,
      })),
  ];
}

/** Margen para mover una sesión del plan a la hora libre más cercana. */
const PLAN_SHIFT_MIN = 120;

export function NewBookingDrawer({
  preset,
  onClose,
}: {
  preset: NewBookingPreset;
  onClose: () => void;
}) {
  const { data, run, now, pending, can, ops, allowed, vertical } = useAgenda();
  const toast = useToast();
  const [query, setQuery] = React.useState("");
  const [clientId, setClientId] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState("");
  const [serviceId, setServiceId] = React.useState<string>("");
  const [staffId, setStaffId] = React.useState<string>("");
  const [date, setDate] = React.useState(localDate(now));
  const [minute, setMinute] = React.useState<number | null>(null);
  const [student, setStudent] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [askDeposit, setAskDeposit] = React.useState(true);
  const [repeat, setRepeat] = React.useState(0);
  const [repeatCount, setRepeatCount] = React.useState(6);
  const [waitlist, setWaitlist] = React.useState(false);
  const [waitSpan, setWaitSpan] = React.useState<
    "morning" | "afternoon" | "any"
  >("any");
  const [waitAnyDay, setWaitAnyDay] = React.useState(false);
  const [waitAnyStaff, setWaitAnyStaff] = React.useState(true);
  // Segunda persona de la cita (ayudante, novias, eventos). "" = nadie.
  const [helperId, setHelperId] = React.useState("");

  React.useEffect(() => {
    if (!preset) return;
    setHelperId("");
    const presetClient = data.clients.find((c) => c.id === preset.clientId);
    setQuery("");
    setClientId(presetClient?.id ?? null);
    setPhone("");
    setNote("");
    setDate(preset.date);
    setRepeat(0);
    setRepeatCount(6);
    setWaitlist(false);
    setAskDeposit(true);
    const firstService =
      data.services.find((s) => s.id === preset.serviceId) ??
      data.services.find(
        (s) => !preset.staffId || s.staffIds.includes(preset.staffId),
      );
    setServiceId(firstService?.id ?? "");
    setStaffId(
      preset.staffId && firstService?.staffIds.includes(preset.staffId)
        ? preset.staffId
        : (firstService?.staffIds[0] ?? ""),
    );
    setMinute(preset.minute ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const service = data.services.find((s) => s.id === serviceId);
  // Hay quien tarda más en un servicio: su duración propia manda.
  const duration = durationFor(service, staffId);
  const client = data.clients.find((c) => c.id === clientId) ?? null;
  const matches: ProClient[] =
    query.trim().length >= 2 && !client
      ? data.clients
          .filter((c) =>
            c.name.toLowerCase().includes(query.trim().toLowerCase()),
          )
          .slice(0, 5)
      : [];
  const slots = useAgendaSlots({
    date,
    serviceId: service?.id,
    staffId,
    duration,
    fromMinute: date === localDate(now) ? localMinutes(now) : 0,
    enabled: Boolean(preset),
  });
  const times = slots.minutes;
  const minuteValid = minute !== null && times.includes(minute);
  const verified = Boolean(client?.student?.verified);
  // El precio estudiante solo vale en las horas valle del servicio.
  const valleyOk =
    minute === null || studentPriceApplies(service, date, minute);
  const canStudent = Boolean(
    verified && service?.studentPriceCents && valleyOk,
  );
  const price = service
    ? student && canStudent
      ? service.studentPriceCents!
      : service.priceCents
    : 0;
  const name = client?.name ?? query.trim();
  const rule = ops ? depositRule(data, client?.id, service?.id) : null;
  const bundle = activeBundle(data, client?.id, service?.id, date);
  const alerts = healthAlerts(client ?? undefined);
  const patch = needsPatchTest(data, client ?? undefined, service, date);
  const testService = patchTestService(data);
  const seriesAllowed = allowed("agenda.series");
  const helpers =
    service && staffId && minuteValid && minute !== null && !repeat
      ? helpersFor(data, date, staffId, minute, minute + duration)
      : [];
  // Si cambia la hora y la segunda persona ya no está libre, no se guarda.
  const helper = helpers.find((h) => h.staff.id === helperId && h.free);
  const plan =
    repeat && service && staffId && minuteValid && minute !== null
      ? seriesPlan(data, {
          serviceId: service.id,
          staffId,
          date,
          minute,
          everyWeeks: repeat,
          count: repeatCount,
          // Un plan de sesiones prefiere mover la hora a perder la sesión.
          shiftMin: bundle || vertical.id === "beauty" ? PLAN_SHIFT_MIN : 0,
        })
      : [];
  const planLabel = vertical.id === "beauty" ? "Plan de sesiones" : "Cita fija";

  React.useEffect(() => {
    setStudent(verified);
  }, [verified]);

  const newClient = (id: string): ProClient => ({
    id,
    name,
    phone: phone || undefined,
    tags: [],
    visits: 0,
    spentCents: 0,
    noShows: 0,
    source: "phone",
    marketingConsent: false,
    cardMember: false,
    createdAt: new Date().toISOString(),
  });

  const save = async () => {
    if (!service || !staffId || minute === null || !name) return;
    const newClientId = client?.id ?? localId("c");
    const model: Omit<ProBooking, "id" | "start" | "end"> = {
      kind: "appointment",
      clientId: newClientId,
      clientName: name,
      staffId,
      serviceId: service.id,
      partySize: 1,
      status: "confirmed",
      priceCents: price,
      paidCents: 0,
      source: "phone",
      note: note || undefined,
      student: verified,
      ...(helper && !repeat ? { resourceIds: [staffId, helper.staff.id] } : {}),
      ...(rule && askDeposit
        ? { agenda: { deposit: { cents: rule.cents, status: "pending" } } }
        : {}),
    };
    const series = plan.length > 1 && seriesAllowed;
    const ok = await run(series ? "agenda.series" : "booking.create", (d) => {
      const clients = client
        ? d.clients
        : [newClient(newClientId), ...d.clients];
      const base = { ...d, clients };
      if (series)
        return createSeries(
          base,
          model,
          plan,
          plan.map(() => localId("b")),
          localId("sr"),
          duration,
        );
      return {
        ...base,
        bookings: [
          ...base.bookings,
          {
            ...model,
            id: localId("b"),
            start: isoFor(date, minute),
            end: isoFor(date, minute + duration),
          },
        ],
      };
    });
    if (!ok) return;
    const booked = series ? plan.filter((step) => step.free).length : 1;
    toast.success(
      booked > 1 ? `${booked} citas guardadas` : "Cita guardada",
      [
        `${name} · ${service.name} · ${minutesToLabel(minute)}`,
        helper ? ` con ${helper.staff.name.split(" ")[0]}` : "",
        rule && askDeposit ? ". Pide la señal desde la cita." : "",
      ].join(""),
    );
    onClose();
  };

  const saveWaitlist = async () => {
    if (!service || !name) return;
    const span =
      waitSpan === "morning"
        ? { from: 9 * 60, to: 14 * 60 }
        : waitSpan === "afternoon"
          ? { from: 15 * 60, to: 21 * 60 }
          : { from: 0, to: 1440 };
    const newClientId = client?.id ?? localId("c");
    const ok = await run("agenda.waitlist", (d) =>
      addWaitlist(
        client ? d : { ...d, clients: [newClient(newClientId), ...d.clients] },
        {
          id: localId("w"),
          clientId: newClientId,
          name,
          phone: client?.phone ?? (phone || undefined),
          serviceId: service.id,
          staffId: waitAnyStaff ? undefined : staffId || undefined,
          date: waitAnyDay ? undefined : date,
          ...span,
          createdAt: new Date().toISOString(),
          status: "waiting",
        },
      ),
    );
    if (!ok) return;
    toast.success(
      "Apuntado en la lista de espera",
      "Si se libera un hueco que le encaje, te lo enseñamos.",
    );
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      title={waitlist ? "Lista de espera" : "Nueva cita"}
      description={
        waitlist
          ? "Te avisamos cuando se libere un hueco que le encaje."
          : "El cliente no necesita tener Franky."
      }
      footer={
        waitlist ? (
          <>
            <Button variant="ghost" onClick={() => setWaitlist(false)}>
              Volver
            </Button>
            <Button
              variant="dark"
              onClick={saveWaitlist}
              disabled={!allowed("agenda.waitlist") || !service || !name}
            >
              Apuntar
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="dark"
              onClick={save}
              disabled={
                pending ||
                !can("booking.create") ||
                !service ||
                !staffId ||
                !minuteValid ||
                !name
              }
            >
              {plan.length > 1 && seriesAllowed
                ? `Guardar ${plural(plan.filter((s) => s.free).length, "cita", "citas")}`
                : "Guardar cita"}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Cliente" htmlFor="nb-client">
          {client ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={client.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {client.name}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {client.visits} {client.visits === 1 ? "visita" : "visitas"}
                    {client.student
                      ? ` · ${shortUni(client.student.university)}`
                      : ""}
                    {client.noShows ? ` · ${client.noShows} faltas` : ""}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setClientId(null);
                  setQuery("");
                }}
                className="inline-flex h-10 items-center text-xs font-semibold text-violet"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                id="nb-client"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre del cliente"
                className={inputClass}
              />
              {matches.length ? (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-bg-primary shadow-float">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setClientId(c.id)}
                        className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg-secondary"
                      >
                        <Avatar name={c.name} size="xs" />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-xs text-text-muted">
                          {c.visits} {c.visits === 1 ? "visita" : "visitas"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </FormField>
        {!client && query.trim().length >= 2 ? (
          <FormField
            label="Teléfono"
            htmlFor="nb-phone"
            hint="Para recordarle la cita. Opcional."
          >
            <input
              id="nb-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="600 000 000"
              className={inputClass}
            />
          </FormField>
        ) : null}

        <FormField label="Servicio">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setServiceId(s.id);
                  if (!s.staffIds.includes(staffId))
                    setStaffId(s.staffIds[0] ?? "");
                  setMinute(null);
                }}
                className={cn(
                  "flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm",
                  serviceId === s.id
                    ? "border-violet bg-violet-50"
                    : "border-border hover:border-text-primary/25",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.name}</span>
                  <span className="text-xs text-text-muted">
                    {durationLabel(s.durationMin)}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular">
                  {money(s.priceCents)}
                </span>
              </button>
            ))}
          </div>
        </FormField>

        {alerts.length ? (
          <Callout tone="danger" icon={HeartPulse} title="Ojo con su ficha">
            {alerts.join(" · ")}
          </Callout>
        ) : null}
        {patch && client ? (
          <Callout
            tone="warning"
            icon={FlaskConical}
            title="Necesita la prueba de sensibilidad antes"
            action={
              testService && testService.id !== serviceId ? (
                <Button
                  size="sm"
                  variant="dark"
                  onClick={() => {
                    const twoBefore = addDays(date, -2);
                    setServiceId(testService.id);
                    setStaffId(
                      testService.staffIds.includes(staffId)
                        ? staffId
                        : (testService.staffIds[0] ?? ""),
                    );
                    setDate(
                      twoBefore >= localDate(now) ? twoBefore : localDate(now),
                    );
                    setMinute(null);
                  }}
                >
                  Citar primero la prueba
                </Button>
              ) : null
            }
          >
            Al menos 48 horas antes del servicio. No consta una prueba vigente.
          </Callout>
        ) : null}
        {bundle ? (
          <Callout
            tone="violet"
            icon={Ticket}
            title={bundle.label}
            action={
              // Plan de tratamiento: reserva de una vez las sesiones del bono.
              seriesAllowed &&
              minuteValid &&
              !repeat &&
              bundleRemaining(bundle) > 1 &&
              service?.agenda?.returnWeeks ? (
                <Button
                  size="sm"
                  variant="dark"
                  onClick={() => {
                    setRepeat(service.agenda!.returnWeeks!);
                    setRepeatCount(bundleRemaining(bundle));
                  }}
                >
                  Reservar las {bundleRemaining(bundle)} sesiones
                </Button>
              ) : null
            }
          >
            {bundleRemaining(bundle) === 1
              ? "Le queda 1 sesión: esta cita se descontará al cobrar."
              : `Le quedan ${bundleRemaining(bundle)} sesiones: esta cita se descontará al cobrar.`}
            {service?.agenda?.returnWeeks &&
            !repeat &&
            bundleRemaining(bundle) > 1
              ? ` Puedes dejarlas todas citadas, ${service.agenda.returnWeeks === 1 ? "cada semana" : `cada ${service.agenda.returnWeeks} semanas`}.`
              : ""}
          </Callout>
        ) : null}

        <FormField label="Profesional">
          <ChoiceChips
            value={staffId}
            onChange={(v) => {
              setStaffId(v);
              setMinute(null);
            }}
            options={staffForService(data, service).map((s) => ({
              value: s.id,
              label: s.name.split(" ")[0],
            }))}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4">
          <FormField label="Día" htmlFor="nb-date">
            <div className="flex gap-2">
              <input
                id="nb-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setMinute(null);
                }}
                className={cn(inputClass, "min-w-0")}
              />
              <button
                type="button"
                onClick={() => {
                  setDate(localDate(now));
                  setMinute(null);
                }}
                className="h-10 shrink-0 rounded-xl border border-border px-3 text-sm font-semibold"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => {
                  setDate(addDays(localDate(now), 1));
                  setMinute(null);
                }}
                className="h-10 shrink-0 rounded-xl border border-border px-3 text-sm font-semibold"
              >
                Mañana
              </button>
            </div>
          </FormField>
          <FormField
            label="Hora"
            hint={
              service
                ? service.agenda?.phases
                  ? `Durante la pose (${service.agenda.phases.processMin} min) tu agenda queda libre para otra cita.`
                  : `Huecos libres de ${durationLabel(duration)}${duration !== service.durationMin ? ` (lo que tarda ${staffFirst(data, staffId)})` : ""}`
                : undefined
            }
          >
            {times.length ? (
              <div className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5 pro-scroll">
                {times.map((m) => (
                  <OptionButton
                    key={m}
                    active={minute === m}
                    onClick={() => setMinute(m)}
                  >
                    {minutesToLabel(m)}
                  </OptionButton>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-bg-secondary px-3 py-2.5 text-sm text-text-muted">
                <CalendarClock className="h-4 w-4" />{" "}
                {slots.loading
                  ? "Comprobando huecos..."
                  : (slots.error ??
                    "No quedan huecos ese día. Prueba otro día o profesional.")}
              </p>
            )}
            {ops && service && name ? (
              <button
                type="button"
                onClick={() => setWaitlist(true)}
                className="inline-flex h-10 items-center gap-1.5 self-start text-sm font-semibold text-violet"
              >
                <ListPlus className="h-4 w-4" /> Apuntar en lista de espera
              </button>
            ) : null}
          </FormField>
        </div>

        {waitlist ? (
          <WaitlistFields
            span={waitSpan}
            setSpan={setWaitSpan}
            anyDay={waitAnyDay}
            setAnyDay={setWaitAnyDay}
            anyStaff={waitAnyStaff}
            setAnyStaff={setWaitAnyStaff}
            date={date}
            staffName={data.staff.find((s) => s.id === staffId)?.name}
          />
        ) : null}

        {!waitlist && service ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg-secondary px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{money(price)}</p>
              {verified && service.studentPriceCents ? (
                canStudent ? (
                  <label className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                    <input
                      type="checkbox"
                      checked={student}
                      onChange={(e) => setStudent(e.target.checked)}
                      className="accent-[var(--color-violet)]"
                    />
                    Precio estudiante ({money(service.studentPriceCents)})
                  </label>
                ) : (
                  <p className="mt-1 text-xs text-text-muted">
                    Precio estudiante solo {valleyLabel(service)}
                  </p>
                )
              ) : null}
            </div>
            {minute !== null ? (
              <p className="shrink-0 text-right text-sm text-text-muted">
                {minutesToLabel(minute)} a {minutesToLabel(minute + duration)}
              </p>
            ) : null}
          </div>
        ) : null}

        {!waitlist && helpers.length ? (
          <FormField
            label="Con otra persona"
            hint="Para novias, eventos o cuando ayuda alguien: su columna queda ocupada toda la cita. Quien sale apagado ya tiene algo a esa hora."
          >
            <div className="flex flex-wrap gap-2">
              <OptionButton active={!helper} onClick={() => setHelperId("")}>
                Solo
              </OptionButton>
              {helpers.map(({ staff: person, free }) => (
                <OptionButton
                  key={person.id}
                  active={helper?.staff.id === person.id}
                  disabled={!free}
                  onClick={() => setHelperId(person.id)}
                >
                  {person.name.split(" ")[0]}
                </OptionButton>
              ))}
            </div>
          </FormField>
        ) : null}

        {!waitlist && rule ? (
          <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/30">
            <input
              type="checkbox"
              checked={askDeposit}
              onChange={(e) => setAskDeposit(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-violet)]"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-semibold">
                <Wallet className="h-4 w-4" strokeWidth={1.9} /> Pedir señal de{" "}
                {money(rule.cents)}
              </span>
              <span className="text-text-secondary">
                {rule.reason === "noshows"
                  ? `Ha faltado ${client?.noShows ?? 0} veces.`
                  : "Este servicio lleva señal."}{" "}
                Se descuenta al cobrar.
              </span>
            </span>
          </label>
        ) : null}

        {!waitlist && seriesAllowed && minuteValid ? (
          <FormField label={planLabel}>
            <div className="flex flex-wrap gap-2">
              {repeatOptions(service?.agenda?.returnWeeks).map((option) => (
                <OptionButton
                  key={option.value}
                  active={repeat === option.value}
                  onClick={() => setRepeat(option.value)}
                >
                  {option.label}
                </OptionButton>
              ))}
            </div>
            {repeat ? (
              <SeriesPreview
                plan={plan}
                count={repeatCount}
                setCount={setRepeatCount}
                bundleLeft={bundle ? bundleRemaining(bundle) : null}
              />
            ) : null}
          </FormField>
        ) : null}

        {!waitlist ? (
          <FormField label="Nota" htmlFor="nb-note">
            <textarea
              id="nb-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Por ejemplo: quiere probar un degradado bajo"
              className={textareaClass}
            />
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}

function WaitlistFields({
  span,
  setSpan,
  anyDay,
  setAnyDay,
  anyStaff,
  setAnyStaff,
  date,
  staffName,
}: {
  span: "morning" | "afternoon" | "any";
  setSpan: (v: "morning" | "afternoon" | "any") => void;
  anyDay: boolean;
  setAnyDay: (v: boolean) => void;
  anyStaff: boolean;
  setAnyStaff: (v: boolean) => void;
  date: string;
  staffName?: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-violet/25 bg-violet-50/60 p-4">
      <FormField label="Franja">
        <ChoiceChips
          value={span}
          onChange={setSpan}
          options={[
            { value: "morning", label: "Mañana" },
            { value: "afternoon", label: "Tarde" },
            { value: "any", label: "Cualquier hora" },
          ]}
        />
      </FormField>
      <FormField label="Día">
        <ChoiceChips
          value={anyDay ? "any" : "day"}
          onChange={(v) => setAnyDay(v === "any")}
          options={[
            {
              value: "day",
              label: dayLabel(`${date}T12:00:00Z`, { weekday: true }),
            },
            { value: "any", label: "Cualquier día" },
          ]}
        />
      </FormField>
      <FormField label="Con quién">
        <ChoiceChips
          value={anyStaff ? "any" : "staff"}
          onChange={(v) => setAnyStaff(v === "any")}
          options={[
            { value: "any", label: "Con cualquiera" },
            { value: "staff", label: `Solo ${staffName?.split(" ")[0] ?? ""}` },
          ]}
        />
      </FormField>
    </div>
  );
}

function SeriesPreview({
  plan,
  count,
  setCount,
  bundleLeft,
}: {
  plan: SeriesStep[];
  count: number;
  setCount: (n: number) => void;
  /** Sesiones que le quedan en el bono de este servicio, si tiene. */
  bundleLeft: number | null;
}) {
  const clashes = plan.filter((step) => !step.free).length;
  const moved = plan.filter((step) => step.movedFrom !== undefined).length;
  const booked = plan.length - clashes;
  const counts = [
    ...new Set([
      4,
      6,
      8,
      ...(bundleLeft && bundleLeft > 1 ? [bundleLeft] : []),
    ]),
  ].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border p-3.5">
      <div className="flex flex-wrap gap-2">
        {counts.map((n) => (
          <OptionButton
            key={n}
            active={count === n}
            onClick={() => setCount(n)}
          >
            {n === bundleLeft ? `Las ${n} del bono` : `${n} citas`}
          </OptionButton>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-1.5 text-sm sm:grid-cols-3">
        {plan.map((step, index) => (
          <li
            key={step.date}
            className={cn(
              "rounded-lg px-2 py-1.5 tabular",
              !step.free
                ? "bg-rose-50 text-rose-700 line-through dark:bg-rose-950/40 dark:text-rose-300"
                : step.movedFrom !== undefined
                  ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  : "bg-bg-secondary text-text-secondary",
            )}
          >
            <span className="block text-[0.68rem] font-semibold uppercase tracking-wider opacity-70">
              Sesión {index + 1}
            </span>
            {new Date(`${step.date}T12:00:00Z`).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
            })}{" "}
            {minutesToLabel(step.minute)}
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">
        {[
          clashes
            ? `${clashes} ${clashes === 1 ? "fecha choca" : "fechas chocan"} con otra cita y no se reserva${clashes === 1 ? "" : "n"}.`
            : "",
          moved
            ? `${moved} ${moved === 1 ? "sesión cambia" : "sesiones cambian"} de hora para no perderla${moved === 1 ? "" : "s"}.`
            : "",
          !clashes && !moved ? "Todas las fechas están libres." : "",
          bundleLeft !== null && booked > bundleLeft
            ? `El bono cubre ${bundleLeft}: las otras ${booked - bundleLeft} se cobran aparte.`
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      </p>
    </div>
  );
}

export function shortUni(name: string) {
  if (name.includes("Alicante")) return "UA";
  if (name.includes("Miguel Hernández")) return "UMH";
  if (name.includes("CEU")) return "CEU";
  return name;
}
