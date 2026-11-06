"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BellRing,
  Phone,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type {
  Allergen,
  BookingStatus,
  ProBooking,
  ProClient,
  ProClientSource,
} from "@/lib/pro/types";
import {
  addDays,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  relative,
  time,
} from "@/lib/pro/format";
import { frankyResults } from "@/lib/pro/results";
import {
  ALLERGEN_BY_ID,
  CLEANING_MIN,
  TABLE_SOURCE,
  TURNS,
  currentTurn,
  freeTablesFor,
  fromFranky,
  hasAllergyNote,
  isWaitlist,
  isoAt,
  stayMinutes,
  tableBookingsOn,
  tableName,
  tableServices,
  realTablesForService,
  turnOf,
  turnSlots,
  type Turn,
} from "@/lib/pro/tables";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Detail,
  Drawer,
  FormField,
  Panel,
  Pill,
  RowList,
  Segmented,
  StatusPill,
  inputClass,
  textareaClass,
} from "../../kit";
import { sectionHref } from "../../shell";
import { BookingExtras } from "./service-kit";

/* ------------------------------------------------------------------ */
/* Piezas pequeñas                                                     */
/* ------------------------------------------------------------------ */

export const TABLE_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Por confirmar",
  confirmed: "Confirmada",
  arrived: "Sentada",
  in_service: "Sentada",
  done: "Se fue",
  no_show: "No vino",
  cancelled: "Cancelada",
};

export function TableStatus({ booking }: { booking: ProBooking }) {
  if (isWaitlist(booking)) return <Pill tone="warning">En espera</Pill>;
  return (
    <StatusPill
      status={booking.status}
      label={TABLE_STATUS_LABEL[booking.status]}
    />
  );
}

export function SourceTag({
  source,
  className,
}: {
  source: ProClientSource;
  className?: string;
}) {
  if (fromFranky(source)) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold text-violet",
          className,
        )}
      >
        <Sparkles className="h-3 w-3" strokeWidth={1.9} />
        {TABLE_SOURCE[source]}
      </span>
    );
  }
  return (
    <span className={cn("text-xs text-text-muted", className)}>
      {TABLE_SOURCE[source]}
    </span>
  );
}

export function StudentMark({
  university,
  className,
}: {
  university?: string;
  className?: string;
}) {
  const short = university ? shortUni(university) : "Estudiante";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold text-violet-deep",
        className,
      )}
      title={
        university
          ? `Estudiante verificado, ${university}`
          : "Estudiante verificado"
      }
    >
      <BadgeCheck className="h-3.5 w-3.5 text-violet" strokeWidth={1.9} />
      {short}
    </span>
  );
}

export function shortUni(name: string): string {
  if (/Alicante/.test(name)) return "UA";
  if (/Miguel Hern/.test(name)) return "UMH";
  if (/CEU/.test(name)) return "CEU";
  return name;
}

/** Siglas de alérgenos: pequeñas, legibles y con su nombre al pasar o leer. */
export function AllergenCodes({
  list,
  className,
}: {
  list: Allergen[];
  className?: string;
}) {
  if (!list.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {list.map((a) => (
        <abbr
          key={a}
          title={ALLERGEN_BY_ID[a].label}
          className="inline-flex h-5 min-w-[1.6rem] items-center justify-center rounded-md border border-border px-1 text-[0.62rem] font-bold tracking-wide text-text-secondary no-underline"
        >
          {ALLERGEN_BY_ID[a].code}
          <span className="sr-only">: {ALLERGEN_BY_ID[a].label}</span>
        </abbr>
      ))}
    </span>
  );
}

export function NoteLine({
  note,
  className,
}: {
  note?: string;
  className?: string;
}) {
  if (!note) return null;
  const allergy = hasAllergyNote(note);
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 text-xs",
        allergy
          ? "font-semibold text-amber-800 dark:text-amber-300"
          : "text-text-muted",
        className,
      )}
    >
      {allergy ? (
        <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
      ) : null}
      <span className="truncate">{note}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Acciones sobre reservas y mesas                                     */
/* ------------------------------------------------------------------ */

export function useTableActions() {
  const { data, update, now, vertical, demo, pending, can } = usePro();
  const toast = useToast();

  const patch = (
    id: string,
    fn: (b: ProBooking) => ProBooking,
    label: string,
  ) =>
    pending || !can(label)
      ? Promise.resolve(false)
      : update(label, (d) => ({
          ...d,
          bookings: d.bookings.map((b) => (b.id === id ? fn(b) : b)),
        }));

  return {
    async confirm(b: ProBooking) {
      if (
        !(await patch(
          b.id,
          (x) => ({ ...x, status: "confirmed" }),
          "table.confirm",
        ))
      )
        return false;
      toast.success("Reserva confirmada");
      return true;
    },
    async decline(b: ProBooking) {
      if (
        !(await patch(
          b.id,
          (x) => ({ ...x, status: "cancelled" }),
          "table.decline",
        ))
      )
        return false;
      toast.success(
        isWaitlist(b) ? "Quitado de la lista de espera" : "Solicitud rechazada",
      );
      return true;
    },
    async seat(b: ProBooking, tableId?: string) {
      const target = tableId ?? b.resourceId;
      if (!demo && (!target || target !== b.resourceId)) return false;
      const stay = stayMinutes(vertical.id, turnOf(localMinutes(now)));
      if (
        !(await patch(
          b.id,
          (x) =>
            isWaitlist(x)
              ? {
                  ...x,
                  status: "arrived",
                  resourceId: target,
                  start: now.toISOString(),
                  end: new Date(now.getTime() + stay * 60000).toISOString(),
                }
              : { ...x, status: "arrived", resourceId: target },
          "table.seat",
        ))
      )
        return false;
      toast.success(
        "Mesa sentada",
        `${b.clientName.split(" ")[0]} en ${tableName(data, target) ?? "sala"}.`,
      );
      return true;
    },
    async leave(b: ProBooking) {
      if (
        !(await patch(
          b.id,
          (x) =>
            demo
              ? {
                  ...x,
                  status: "done",
                  end: now.toISOString(),
                  paidCents: x.priceCents,
                }
              : { ...x, status: "done" },
          "table.leave",
        ))
      )
        return false;
      toast.success(
        "Salida registrada",
        "Comprueba la mesa antes de marcarla lista.",
      );
      return true;
    },
    async noShow(b: ProBooking) {
      if (pending || !can("table.no_show")) return false;
      if (
        !(await update("table.no_show", (d) => ({
          ...d,
          bookings: d.bookings.map((x) =>
            x.id === b.id ? { ...x, status: "no_show" } : x,
          ),
          clients:
            demo && b.clientId
              ? d.clients.map((c) =>
                  c.id === b.clientId ? { ...c, noShows: c.noShows + 1 } : c,
                )
              : d.clients,
        })))
      )
        return false;
      toast.success(
        "Marcada como no presentada",
        "Queda anotado en su ficha y la mesa se libera.",
      );
      return true;
    },
    async clean(b: ProBooking) {
      if (
        !(await patch(
          b.id,
          (x) =>
            demo
              ? {
                  ...x,
                  end: new Date(
                    now.getTime() - (CLEANING_MIN + 1) * 60000,
                  ).toISOString(),
                }
              : {
                  ...x,
                  tableOperation: x.tableOperation
                    ? { ...x.tableOperation, cleanedAt: now.toISOString() }
                    : undefined,
                },
          "table.clean",
        ))
      )
        return false;
      toast.success(
        "Mesa lista",
        `Limpieza confirmada en ${tableName(data, b.resourceId) ?? "la mesa"}.`,
      );
      return true;
    },
    async assign(b: ProBooking, tableId: string) {
      if (
        !demo ||
        !(await patch(
          b.id,
          (x) => ({ ...x, resourceId: tableId }),
          "table.assign",
        ))
      )
        return false;
      toast.success(
        "Mesa cambiada",
        `${b.clientName.split(" ")[0]} pasa a ${tableName(data, tableId)}.`,
      );
      return true;
    },
    notify(b: ProBooking) {
      toast.info(
        "Contacta con el cliente",
        `Llama a ${b.clientName.split(" ")[0]} cuando su mesa esté lista.`,
      );
    },
    async walkIn(tableId: string, party: number) {
      if (!demo || pending || !can("table.walkin")) return false;
      const stay = stayMinutes(vertical.id, turnOf(localMinutes(now)));
      const booking: ProBooking = {
        id: localId("rb"),
        kind: "table",
        clientName: "Sin reserva",
        resourceId: tableId,
        start: now.toISOString(),
        end: new Date(now.getTime() + stay * 60000).toISOString(),
        partySize: party,
        status: "arrived",
        priceCents: 0,
        paidCents: 0,
        source: "walkin",
      };
      if (
        !(await update("table.walkin", (d) => ({
          ...d,
          bookings: [...d.bookings, booking],
        })))
      )
        return false;
      toast.success(
        "Mesa sentada sin reserva",
        `${plural(party, "persona", "personas")} en ${tableName(data, tableId)}.`,
      );
      return true;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Detalle de una reserva                                              */
/* ------------------------------------------------------------------ */

export function ReservationDrawer({
  bookingId,
  onClose,
}: {
  bookingId: string | null;
  onClose: () => void;
}) {
  const { data, now, vertical, demo, pending, can } = usePro();
  const actions = useTableActions();
  const booking = data.bookings.find((b) => b.id === bookingId) ?? null;
  const [pick, setPick] = React.useState<string | null>(null);

  React.useEffect(() => setPick(null), [bookingId]);

  if (!booking)
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );

  const waiting = isWaitlist(booking);
  const client: ProClient | undefined = data.clients.find(
    (c) => c.id === booking.clientId,
  );
  const date = localDate(booking.start);
  const start = waiting ? localMinutes(now) : localMinutes(booking.start);
  const duration = Math.round(
    (new Date(booking.end).getTime() - new Date(booking.start).getTime()) /
      60000,
  );
  const options = freeTablesFor(
    data,
    waiting ? localDate(now) : date,
    start,
    duration,
    booking.partySize,
    booking.id,
  ).slice(0, 8);
  const chosen =
    pick ?? (waiting ? options[0]?.id : booking.resourceId) ?? null;
  const done = (fn: () => Promise<boolean | null>) => async () => {
    if (!(await fn())) return;
    onClose();
  };

  const footer = (() => {
    if (waiting)
      return (
        <>
          <Button
            variant="ghost"
            disabled={pending || !can("table.decline")}
            onClick={done(() => actions.decline(booking))}
          >
            Quitar
          </Button>
          <Button variant="outline" onClick={() => actions.notify(booking)}>
            <BellRing className="h-4 w-4" /> Avisar
          </Button>
          <Button
            variant="dark"
            disabled={pending || !can("table.seat") || !chosen}
            onClick={done(async () =>
              chosen ? actions.seat(booking, chosen) : false,
            )}
          >
            Sentar{chosen ? ` en ${tableName(data, chosen)}` : ""}
          </Button>
        </>
      );
    switch (booking.status) {
      case "requested":
        return (
          <>
            <Button
              variant="ghost"
              disabled={pending || !can("table.decline")}
              onClick={done(() => actions.decline(booking))}
            >
              Rechazar
            </Button>
            <Button
              variant="dark"
              disabled={pending || !can("table.confirm")}
              onClick={done(() => actions.confirm(booking))}
            >
              Confirmar reserva
            </Button>
          </>
        );
      case "confirmed":
        return (
          <>
            <Button
              variant="ghost"
              disabled={pending || !can("table.no_show")}
              onClick={done(() => actions.noShow(booking))}
            >
              No vino
            </Button>
            {demo && pick && pick !== booking.resourceId ? (
              <Button
                variant="outline"
                onClick={() => actions.assign(booking, pick)}
              >
                Cambiar mesa
              </Button>
            ) : null}
            <Button
              variant="dark"
              disabled={pending || !can("table.seat")}
              onClick={done(() => actions.seat(booking, chosen ?? undefined))}
            >
              Sentar
            </Button>
          </>
        );
      case "arrived":
        return (
          <>
            {demo && pick && pick !== booking.resourceId ? (
              <Button
                variant="outline"
                onClick={() => actions.assign(booking, pick)}
              >
                Cambiar mesa
              </Button>
            ) : null}
            <Button
              variant="dark"
              disabled={pending || !can("table.leave")}
              onClick={done(() => actions.leave(booking))}
            >
              Se fue
            </Button>
          </>
        );
      default:
        return null;
    }
  })();

  const turn = turnOf(localMinutes(booking.start));
  const canMove =
    waiting ||
    booking.status === "confirmed" ||
    booking.status === "arrived" ||
    booking.status === "requested";

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={booking.clientName}
      description={
        waiting
          ? `En espera desde hace ${Math.max(1, Math.round((now.getTime() - new Date(booking.start).getTime()) / 60000))} min · ${plural(booking.partySize, "persona", "personas")}`
          : `${dayLabel(booking.start)} · ${TURNS[turn].label} a las ${time(booking.start)}`
      }
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Avatar
            name={booking.clientName}
            size="lg"
            tone={booking.student ? "violet" : "slate"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <TableStatus booking={booking} />
              {booking.student || client?.student?.verified ? (
                <StudentMark university={client?.student?.university} />
              ) : null}
              <SourceTag source={booking.source} />
            </div>
            {client ? (
              <p className="mt-1.5 text-sm text-text-muted">
                {client.visits > 1
                  ? `${client.visits}.ª visita`
                  : "Primera visita"}
                {client.noShows
                  ? ` · no vino ${plural(client.noShows, "vez", "veces")}`
                  : ""}
                {client.phone ? (
                  <a
                    href={`tel:${client.phone.replace(/\s/g, "")}`}
                    className="ml-2 inline-flex items-center gap-1 font-semibold text-text-primary"
                  >
                    <Phone className="h-3.5 w-3.5" strokeWidth={1.9} />{" "}
                    {client.phone}
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        {booking.note ? (
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-sm",
              hasAllergyNote(booking.note)
                ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                : "bg-bg-secondary text-text-secondary",
            )}
          >
            <p className="flex items-center gap-1.5 font-semibold">
              {hasAllergyNote(booking.note) ? (
                <AlertTriangle className="h-4 w-4" strokeWidth={1.9} />
              ) : null}
              {hasAllergyNote(booking.note)
                ? "Alergia o dieta avisada"
                : "Nota"}
            </p>
            <p className="mt-0.5">{booking.note}</p>
          </div>
        ) : null}

        <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
          <Detail label="Personas">
            <span className="tabular">{booking.partySize}</span>
          </Detail>
          <Detail label="Mesa">
            {tableName(data, booking.resourceId) ?? "Sin asignar"}
          </Detail>
          {!waiting ? (
            <Detail label="Hora">{`${time(booking.start)} a ${time(booking.end)}`}</Detail>
          ) : null}
          <Detail label="Origen">{TABLE_SOURCE[booking.source]}</Detail>
          {(demo || can("finance.read")) && booking.priceCents ? (
            <Detail
              label={
                booking.source === "grupo" ? "Presupuesto" : "Gasto previsto"
              }
            >
              <span className="tabular">
                {money(booking.priceCents, { round: true })}
              </span>
              {booking.paidCents && booking.status !== "done" ? (
                <span className="block text-xs text-text-muted">
                  Señal pagada: {money(booking.paidCents, { round: true })}
                </span>
              ) : null}
            </Detail>
          ) : null}
        </div>

        {demo && !waiting ? <BookingExtras booking={booking} /> : null}

        {demo && canMove && vertical.id !== "cafe" ? (
          <FormField
            label={waiting ? "Mesa libre ahora" : "Cambiar de mesa"}
            hint={
              options.length
                ? "Ordenadas de la más ajustada a la más grande."
                : "No queda ninguna mesa libre de ese tamaño a esa hora."
            }
          >
            <div className="flex flex-wrap gap-2">
              {options.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={chosen === t.id}
                  onClick={() => setPick(t.id)}
                  className={cn(
                    "flex min-h-10 flex-col items-start justify-center rounded-xl border px-3 py-1 text-left text-sm",
                    chosen === t.id
                      ? "border-violet bg-violet-50 text-violet-deep"
                      : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  <span className="font-semibold">{tableName(data, t.id)}</span>
                  <span className="text-xs text-text-muted">
                    {t.seats} pax · {t.zone}
                  </span>
                </button>
              ))}
            </div>
          </FormField>
        ) : null}

        {client ? (
          <p className="text-xs text-text-muted">
            Cliente desde {relative(client.createdAt, now.getTime())}
            {(demo || can("finance.read")) && client.spentCents !== null
              ? ` · ${money(client.spentCents, { round: true })} gastados en total`
              : ""}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Nueva reserva y lista de espera                                     */
/* ------------------------------------------------------------------ */

export type NewReservationPreset = {
  date: string;
  turn?: Turn;
  minute?: number;
  tableId?: string;
  waitlist?: boolean;
  walkIn?: boolean;
} | null;

const QUICK_NOTES = [
  "Sin gluten",
  "Frutos secos",
  "Lactosa",
  "Marisco",
  "Vegano",
  "Trona",
  "Cumpleaños",
  "Terraza",
];

export function NewReservationDrawer({
  preset,
  onClose,
}: {
  preset: NewReservationPreset;
  onClose: () => void;
}) {
  const { demo } = usePro();
  if (!demo) return <RealReservationDrawer preset={preset} onClose={onClose} />;
  return <DemoReservationDrawer preset={preset} onClose={onClose} />;
}

function DemoReservationDrawer({
  preset,
  onClose,
}: {
  preset: NewReservationPreset;
  onClose: () => void;
}) {
  const { data, update, now, vertical, pending } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const waitlist = Boolean(preset?.waitlist);

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [party, setParty] = React.useState(2);
  const [bigParty, setBigParty] = React.useState(false);
  const [date, setDate] = React.useState(today);
  const [turn, setTurn] = React.useState<Turn>(currentTurn(nowMin));
  const [minute, setMinute] = React.useState<number | null>(null);
  const [tableId, setTableId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [source, setSource] = React.useState<
    "phone" | "instagram" | "walkin" | "google"
  >("phone");

  React.useEffect(() => {
    if (!preset) return;
    setName("");
    setPhone("");
    setParty(2);
    setBigParty(false);
    setDate(preset.date);
    const tn = preset.turn ?? currentTurn(nowMin);
    setTurn(tn);
    setMinute(preset.minute ?? null);
    setTableId(preset.tableId ?? null);
    setNote("");
    setSource(preset.waitlist ? "walkin" : "phone");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const stay = stayMinutes(vertical.id, turn);
  const slots = turnSlots(turn);
  const past = (m: number) =>
    date < today || (date === today && m < nowMin - 15);
  const freeAt = (m: number) => freeTablesFor(data, date, m, stay, party);
  const tables = minute !== null ? freeAt(minute) : [];
  const chosenTable =
    tableId && tables.some((t) => t.id === tableId)
      ? tableId
      : (tables[0]?.id ?? null);
  const valid =
    name.trim().length > 1 && party > 0 && (waitlist || minute !== null);

  const save = async () => {
    if (pending) return;
    const existing = data.clients.find(
      (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
    );
    const clientSource: ProClientSource = source;
    const client: ProClient | null = existing
      ? null
      : {
          id: localId("c"),
          name: name.trim(),
          phone: phone.trim() || undefined,
          tags: [],
          visits: 0,
          spentCents: 0,
          noShows: 0,
          source: clientSource,
          marketingConsent: false,
          cardMember: false,
          createdAt: new Date().toISOString(),
        };
    const clientId = existing?.id ?? client?.id;
    const cover = vertical.id === "restaurant" ? 3200 : 1400;
    const booking: ProBooking = waitlist
      ? {
          id: localId("rw"),
          kind: "table",
          clientId,
          clientName: name.trim(),
          start: now.toISOString(),
          end: new Date(now.getTime() + stay * 60000).toISOString(),
          partySize: party,
          status: "requested",
          priceCents: party * cover,
          paidCents: 0,
          source: "walkin",
          note:
            [note.trim(), phone.trim() ? `Tel. ${phone.trim()}` : ""]
              .filter(Boolean)
              .join(". ") || undefined,
          student: Boolean(existing?.student?.verified),
        }
      : {
          id: localId("rb"),
          kind: "table",
          clientId,
          clientName: name.trim(),
          resourceId: chosenTable ?? undefined,
          start: isoAt(date, minute ?? TURNS[turn].from),
          end: isoAt(date, (minute ?? TURNS[turn].from) + stay),
          partySize: party,
          status: "confirmed",
          priceCents: party * cover,
          paidCents: 0,
          source,
          note: note.trim() || undefined,
          student: Boolean(existing?.student?.verified),
        };
    if (
      !(await update(waitlist ? "table.waitlist" : "table.reserve", (d) => ({
        ...d,
        bookings: [...d.bookings, booking],
        clients: client ? [client, ...d.clients] : d.clients,
      })))
    )
      return;
    if (waitlist) toast.success("Apuntado en la lista de espera");
    else
      toast.success(
        "Reserva guardada",
        `${name.trim().split(" ")[0]}, ${plural(party, "persona", "personas")}, ${date === today ? "hoy" : dayLabel(isoAt(date, 720))} a las ${minutesToLabel(minute ?? 0)}${chosenTable ? ` en ${tableName(data, chosenTable)}` : ""}.`,
      );
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      wide
      title={waitlist ? "Apuntar en lista de espera" : "Nueva reserva"}
      description={
        waitlist
          ? "Para quien llega sin reservar y la sala está llena."
          : "Por teléfono, Instagram o en la puerta. Las de Franky entran solas."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={pending || !valid}>
            {waitlist ? "Apuntar" : "Guardar reserva"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nombre" htmlFor="nr-name">
            <input
              id="nr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre y apellido"
              autoComplete="off"
              className={inputClass}
            />
          </FormField>
          <FormField label="Teléfono" htmlFor="nr-phone">
            <input
              id="nr-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="600 000 000"
              className={inputClass}
            />
          </FormField>
        </div>

        <FormField label="Personas">
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={!bigParty && party === n}
                onClick={() => {
                  setBigParty(false);
                  setParty(n);
                }}
                className={cn(
                  "h-11 rounded-xl border text-sm font-bold tabular transition-colors",
                  !bigParty && party === n
                    ? "border-violet bg-violet-50 text-violet-deep"
                    : "border-border text-text-secondary hover:border-text-primary/25",
                )}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={bigParty}
              onClick={() => {
                setBigParty(true);
                setParty((p) => Math.max(p, 11));
              }}
              className={cn(
                "h-11 rounded-xl border text-sm font-bold transition-colors",
                bigParty
                  ? "border-violet bg-violet-50 text-violet-deep"
                  : "border-border text-text-secondary hover:border-text-primary/25",
              )}
            >
              10+
            </button>
          </div>
          {bigParty ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                aria-label="Número de personas"
                type="number"
                min={11}
                max={80}
                value={party}
                onChange={(e) =>
                  setParty(Math.max(1, Number(e.target.value) || 1))
                }
                className={cn(inputClass, "w-28")}
              />
              <span className="text-xs text-text-muted">
                Para más de 12, mejor como grupo con menú cerrado y señal.
              </span>
            </div>
          ) : null}
        </FormField>

        {!waitlist ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Día" htmlFor="nr-date" className="w-44">
                <input
                  id="nr-date"
                  type="date"
                  min={today}
                  max={addDays(today, 90)}
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <Segmented
                label="Turno"
                value={turn}
                onChange={(v) => {
                  setTurn(v);
                  setMinute(null);
                }}
                options={[
                  { value: "comida", label: "Comida" },
                  { value: "cena", label: "Cena" },
                ]}
              />
            </div>

            <FormField
              label="Hora"
              hint={`Cada mesa se guarda ${stay} minutos.`}
            >
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {slots.map((m) => {
                  const disabled = past(m);
                  const free = disabled ? 0 : freeAt(m).length;
                  const full = !disabled && free === 0;
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={disabled || full}
                      aria-pressed={minute === m}
                      onClick={() => setMinute(m)}
                      className={cn(
                        "flex h-12 flex-col items-center justify-center rounded-xl border text-sm font-bold tabular transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        minute === m
                          ? "border-violet bg-violet-50 text-violet-deep"
                          : "border-border text-text-primary hover:border-text-primary/25",
                      )}
                    >
                      {minutesToLabel(m)}
                      <span className="text-[0.62rem] font-medium text-text-muted">
                        {full ? "Lleno" : disabled ? "" : `${free} mesas`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </FormField>

            {minute !== null ? (
              <FormField
                label="Mesa sugerida"
                hint={
                  tables.length
                    ? "La más ajustada al grupo va primero. Puedes cambiarla."
                    : "No hay mesa libre para ese grupo a esa hora. Prueba otra hora o apúntalo en espera."
                }
              >
                <div className="flex flex-wrap gap-2">
                  {tables.slice(0, 8).map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={chosenTable === t.id}
                      onClick={() => setTableId(t.id)}
                      className={cn(
                        "flex min-h-10 flex-col items-start justify-center rounded-xl border px-3 py-1 text-left text-sm",
                        chosenTable === t.id
                          ? "border-violet bg-violet-50 text-violet-deep"
                          : "border-border text-text-secondary hover:border-text-primary/25",
                      )}
                    >
                      <span className="font-semibold">
                        {tableName(data, t.id)}
                        {i === 0 ? (
                          <span className="ml-1 text-[0.68rem] font-bold text-violet">
                            Sugerida
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-text-muted">
                        {t.seats} pax · {t.zone}
                      </span>
                    </button>
                  ))}
                </div>
              </FormField>
            ) : null}
          </>
        ) : null}

        <FormField
          label="Alergias y notas"
          htmlFor="nr-note"
          hint="Lo que escribas aquí lo ve la sala al sentarles y cocina en la comanda."
        >
          <textarea
            id="nr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Celíaca, cumpleaños, trona..."
            className={textareaClass}
          />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {QUICK_NOTES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() =>
                  setNote((prev) =>
                    prev.includes(q)
                      ? prev
                      : prev
                        ? `${prev}, ${q.toLowerCase()}`
                        : q,
                  )
                }
                className="h-8 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-text-primary/25 hover:text-text-primary"
              >
                + {q}
              </button>
            ))}
          </div>
        </FormField>

        {!waitlist ? (
          <FormField label="Cómo ha reservado">
            <ChoiceChips
              value={source}
              onChange={setSource}
              options={[
                { value: "phone", label: "Teléfono" },
                { value: "instagram", label: "Instagram" },
                { value: "google", label: "Google" },
                { value: "walkin", label: "En persona" },
              ]}
            />
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Lo que trae Franky                                                  */
/* ------------------------------------------------------------------ */

function RealReservationDrawer({
  preset,
  onClose,
}: {
  preset: NewReservationPreset;
  onClose: () => void;
}) {
  const { data, now, pending, can, update, loadDate } = usePro();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [date, setDate] = React.useState(localDate(now));
  const [minute, setMinute] = React.useState("");
  const [party, setParty] = React.useState(2);
  const [tableId, setTableId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [failure, setFailure] = React.useState(false);
  const waitlist = Boolean(preset?.waitlist);
  const walkIn = Boolean(preset?.walkIn);
  const label = waitlist
    ? "table.waitlist"
    : walkIn
      ? "table.walkin"
      : "table.reserve";
  const services = tableServices(data);
  const service = services.find((item) => item.id === serviceId);
  const customer = data.clients.find((item) => item.id === customerId);
  const customerName = customer?.name ?? name.trim();
  const actualMinute =
    walkIn || waitlist
      ? localMinutes(now) +
        now.getUTCSeconds() / 60 +
        now.getUTCMilliseconds() / 60_000
      : Number(minute);
  const tables = service
    ? realTablesForService(data, service.id, date, actualMinute, party, now)
    : [];
  const chosen = tables.find((table) => table.id === tableId) ?? tables[0];
  const total = service
    ? service.price_cents * (service.price_basis === "person" ? party : 1)
    : null;
  const slots =
    service && !walkIn && !waitlist
      ? Array.from({ length: 96 }, (_, index) => index * 15).filter(
          (value) =>
            (date > localDate(now) || value >= localMinutes(now)) &&
            realTablesForService(data, service.id, date, value, party, now)
              .length > 0,
        )
      : [];
  const valid =
    service &&
    customerName.length >= 2 &&
    Number.isInteger(party) &&
    party > 0 &&
    party <= service.capacity &&
    (waitlist ||
      (chosen &&
        (walkIn || (minute !== "" && slots.includes(Number(minute))))));

  React.useEffect(() => {
    if (!preset) return;
    setName("");
    setPhone("");
    setCustomerId("");
    setServiceId("");
    setParty(2);
    setDate(preset.date);
    setMinute(preset.minute === undefined ? "" : String(preset.minute));
    setTableId(preset.tableId ?? "");
    setNote("");
    setFailure(false);
  }, [preset]);
  React.useEffect(() => {
    if (preset) loadDate(date);
  }, [date, loadDate, preset]);

  const save = async () => {
    if (pending || !can(label) || !valid || !service || total === null) return;
    setFailure(false);
    const client: ProClient | null = customer
      ? null
      : {
          id: localId("customer"),
          name: customerName,
          phone: phone.trim() || undefined,
          tags: [],
          visits: 0,
          spentCents: null,
          noShows: 0,
          source: walkIn || waitlist ? "walkin" : "phone",
          marketingConsent: false,
          cardMember: false,
          createdAt: now.toISOString(),
        };
    const clientId = customer?.id ?? client!.id;
    const saved = await update(label, (before) => {
      const clients = client ? [...before.clients, client] : before.clients;
      if (waitlist && before.tableOperations)
        return {
          ...before,
          clients,
          tableOperations: {
            ...before.tableOperations,
            waitlist: [
              ...before.tableOperations.waitlist,
              {
                id: localId("waitlist"),
                customerId: clientId,
                customerName,
                customerContact:
                  customer?.phone ?? customer?.email ?? phone.trim(),
                serviceId: service.id,
                partySize: party,
                requestedAt: now.toISOString(),
                expiresAt: now.toISOString(),
                status: "waiting",
                bookingId: null,
                serviceVersion: service.version,
                expectedTotalCents: can("finance.read") ? total : null,
                note: note.trim(),
              },
            ],
          },
        };
      if (waitlist || !chosen) return before;
      return {
        ...before,
        clients,
        bookings: [
          ...before.bookings,
          {
            id: localId("reservation"),
            kind: "table",
            clientId,
            clientName: customerName,
            serviceId: service.id,
            resourceId: chosen.id,
            start: isoAt(date, actualMinute),
            end: isoAt(date, actualMinute + service.duration_minutes),
            partySize: party,
            status: walkIn ? "arrived" : "confirmed",
            priceCents: total,
            paidCents: null,
            source: walkIn ? "walkin" : "phone",
            note: note.trim() || undefined,
          },
        ],
      };
    });
    if (!saved) {
      setFailure(true);
      return;
    }
    toast.success(
      waitlist
        ? "Apuntado en la lista de espera"
        : walkIn
          ? "Mesa sentada"
          : "Reserva guardada",
    );
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(open) => !open && onClose()}
      title={
        waitlist
          ? "Apuntar en lista de espera"
          : walkIn
            ? "Sentar sin reserva"
            : "Nueva reserva"
      }
      description="Elige el servicio del catálogo y revisa la disponibilidad de la mesa."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            disabled={pending || !can(label) || !valid}
            onClick={save}
          >
            {waitlist ? "Apuntar" : walkIn ? "Sentar" : "Guardar reserva"}
          </Button>
        </>
      }
    >
      <fieldset disabled={pending} className="flex flex-col gap-4">
        {!services.length ? (
          <p className="text-sm text-text-muted">
            Añade un servicio de reserva de mesa sin señal en el panel de tu
            negocio para empezar.
          </p>
        ) : null}
        {failure ? (
          <p role="alert" className="text-sm text-danger">
            No se ha guardado. Revisa la disponibilidad y vuelve a intentarlo.
          </p>
        ) : null}
        <FormField label="Servicio" htmlFor="real-table-service">
          <select
            id="real-table-service"
            className={inputClass}
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value);
              setMinute("");
            }}
          >
            <option value="">Elige un servicio</option>
            {services.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Cliente" htmlFor="real-table-customer">
          <select
            id="real-table-customer"
            className={inputClass}
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          >
            <option value="">Cliente nuevo</option>
            {data.clients.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </FormField>
        {!customer ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Nombre" htmlFor="real-table-name">
              <input
                id="real-table-name"
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </FormField>
            <FormField label="Teléfono" htmlFor="real-table-phone">
              <input
                id="real-table-phone"
                className={inputClass}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                type="tel"
              />
            </FormField>
          </div>
        ) : null}
        <FormField label="Personas" htmlFor="real-table-party">
          <input
            id="real-table-party"
            className={inputClass}
            value={party}
            min={1}
            max={service?.capacity ?? 500}
            type="number"
            onChange={(event) =>
              setParty(Math.max(1, Number(event.target.value) || 1))
            }
          />
        </FormField>
        {!waitlist && !walkIn ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Día" htmlFor="real-table-date">
              <input
                id="real-table-date"
                className={inputClass}
                type="date"
                min={localDate(now)}
                max={addDays(localDate(now), 90)}
                value={date}
                onChange={(event) =>
                  event.target.value && setDate(event.target.value)
                }
              />
            </FormField>
            <FormField label="Hora" htmlFor="real-table-time">
              <select
                id="real-table-time"
                className={inputClass}
                value={minute}
                onChange={(event) => setMinute(event.target.value)}
              >
                <option value="">Elige una hora</option>
                {slots.map((value) => (
                  <option key={value} value={value}>
                    {minutesToLabel(value)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        ) : null}
        {!waitlist ? (
          <FormField
            label="Mesa"
            htmlFor="real-table-id"
            hint={
              service && !tables.length
                ? "No hay una mesa disponible con estas condiciones."
                : "La disponibilidad se vuelve a comprobar al guardar."
            }
          >
            <select
              id="real-table-id"
              className={inputClass}
              value={chosen?.id ?? ""}
              onChange={(event) => setTableId(event.target.value)}
            >
              <option value="">Elige una mesa</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {tableName(data, table.id)} · {table.seats} personas
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
        <FormField label="Alergias y notas" htmlFor="real-table-note">
          <textarea
            id="real-table-note"
            className={textareaClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
        {service && total !== null ? (
          <p className="text-sm text-text-muted">
            {service.duration_minutes} minutos · {money(total)}
            {service.price_basis === "person"
              ? ` para ${party} personas`
              : " por reserva"}
          </p>
        ) : null}
      </fieldset>
    </Drawer>
  );
}

export function RealWaitlistPanel({ onAdd }: { onAdd: () => void }) {
  const { data, now, pending, can, update } = usePro();
  const toast = useToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [tableId, setTableId] = React.useState("");
  const [failure, setFailure] = React.useState(false);
  const waiting =
    data.tableOperations?.waitlist.filter(
      (entry) =>
        entry.status === "waiting" &&
        Date.parse(entry.expiresAt) > now.getTime(),
    ) ?? [];
  const selected = waiting.find((entry) => entry.id === selectedId);
  const tables = selected
    ? realTablesForService(
        data,
        selected.serviceId,
        localDate(now),
        localMinutes(now) +
          now.getUTCSeconds() / 60 +
          now.getUTCMilliseconds() / 60_000,
        selected.partySize,
        now,
      )
    : [];
  const chosen = tables.find((table) => table.id === tableId) ?? tables[0];
  const submit = async (action: "seat" | "cancel") => {
    if (
      !selected ||
      pending ||
      !can(`table.waitlist.${action}`) ||
      (action === "seat" && !chosen)
    )
      return;
    const saved = await update(
      `table.waitlist.${action}`,
      (before) => before,
      action === "seat"
        ? {
            type: "table.waitlist.seat",
            waitlistId: selected.id,
            tableId: chosen!.id,
          }
        : { type: "table.waitlist.cancel", waitlistId: selected.id },
    );
    if (!saved) {
      setFailure(true);
      return;
    }
    toast.success(
      action === "seat" ? "Mesa sentada" : "Quitado de la lista de espera",
    );
    setSelectedId(null);
  };
  return (
    <>
      <Panel
        title="Lista de espera"
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !can("table.waitlist")}
            onClick={onAdd}
          >
            Apuntar
          </Button>
        }
        flush
      >
        {waiting.length ? (
          <RowList>
            {waiting.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setSelectedId(entry.id);
                  setTableId("");
                  setFailure(false);
                }}
                className="w-full px-4 py-3 text-left sm:px-5"
              >
                <span className="block text-sm font-semibold">
                  {entry.customerName} · {entry.partySize} personas
                </span>
                <span className="block text-xs text-text-muted">
                  Desde las {time(entry.requestedAt)}
                </span>
              </button>
            ))}
          </RowList>
        ) : (
          <p className="px-4 py-4 text-sm text-text-muted sm:px-5">
            Nadie esperando ahora.
          </p>
        )}
      </Panel>
      <Drawer
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        title={selected?.customerName ?? "Lista de espera"}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={pending || !can("table.waitlist.cancel")}
              onClick={() => submit("cancel")}
            >
              Quitar de la espera
            </Button>
            <Button
              variant="dark"
              disabled={pending || !can("table.waitlist.seat") || !chosen}
              onClick={() => submit("seat")}
            >
              Sentar
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {selected.partySize} personas ·{" "}
              {data.services.find(
                (service) => service.id === selected.serviceId,
              )?.name ?? "Servicio reservado"}
            </p>
            {selected.customerContact ? (
              <p className="text-sm">Contacto: {selected.customerContact}</p>
            ) : null}
            {selected.note ? <NoteLine note={selected.note} /> : null}
            <FormField label="Mesa libre" htmlFor="real-waitlist-table">
              <select
                id="real-waitlist-table"
                className={inputClass}
                value={chosen?.id ?? ""}
                disabled={pending}
                onChange={(event) => setTableId(event.target.value)}
              >
                <option value="">Sin mesa disponible</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {tableName(data, table.id)} · {table.seats} personas
                  </option>
                ))}
              </select>
            </FormField>
            {failure ? (
              <p role="alert" className="text-sm text-danger">
                La espera no ha cambiado. Actualiza la sala y revisa las
                condiciones.
              </p>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

export function FrankyBlock() {
  const { data, now, spaceId, vertical, demo } = usePro();
  if (!demo) return null;
  const results = frankyResults(data, now, 30);
  const today = localDate(now);
  const from = addDays(today, -29);

  if (vertical.id === "cafe") {
    const last30 = data.validations.filter((v) => localDate(v.at) >= from);
    const students = new Set(last30.map((v) => v.clientName)).size;
    const revenue = last30.reduce(
      (a, v) => a + v.amountCents - v.discountCents,
      0,
    );
    const byClient = new Map<string, number>();
    last30.forEach((v) =>
      byClient.set(v.clientName, (byClient.get(v.clientName) ?? 0) + 1),
    );
    const repeat = [...byClient.values()].filter((n) => n >= 3).length;
    return (
      <section className="rounded-2xl bg-bg-dark p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
          Franky, últimos 30 días
        </p>
        <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">
          {students}
        </p>
        <p className="text-sm text-white/70">
          estudiantes han pagado con su Franky Card
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
          <div>
            <p className="font-heading text-xl font-bold tabular">
              {money(revenue, { round: true })}
            </p>
            <p className="text-xs text-white/60">facturado con ellos</p>
          </div>
          <div>
            <p className="font-heading text-xl font-bold tabular">{repeat}</p>
            <p className="text-xs text-white/60">vuelven 3 veces o más</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-white/60">
          {last30.length} visitas validadas. Sin comisión por ninguna.
        </p>
        <Link
          href={sectionHref(spaceId, "estudiantes")}
          className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-white"
        >
          Ver resultados <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    );
  }

  const todays = tableBookingsOn(data, today);
  const franky = todays.filter((b) => fromFranky(b.source));
  const frankyCovers = franky.reduce((a, b) => a + b.partySize, 0);
  // Los marketplaces de reservas cobran unos 2 € por comensal que llega por ellos.
  const covers30 = data.bookings
    .filter(
      (b) =>
        b.kind === "table" &&
        fromFranky(b.source) &&
        b.status !== "cancelled" &&
        b.status !== "no_show" &&
        localDate(b.start) >= from &&
        localDate(b.start) <= today,
    )
    .reduce((a, b) => a + b.partySize, 0);
  return (
    <section className="rounded-2xl bg-bg-dark p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
        Franky, últimos 30 días
      </p>
      <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">
        {results.people}
      </p>
      <p className="text-sm text-white/70">clientes han llegado por Franky</p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <p className="font-heading text-xl font-bold tabular">
            {money(results.revenueCents, { round: true })}
          </p>
          <p className="text-xs text-white/60">facturado con ellos</p>
        </div>
        <div>
          <p className="font-heading text-xl font-bold tabular">
            {money(covers30 * 200, { round: true })}
          </p>
          <p className="text-xs text-white/60">
            que no pagas en comisión por comensal
          </p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-white/60">
        <Users className="h-3.5 w-3.5" strokeWidth={1.9} />
        Hoy: {franky.length} reservas y {frankyCovers} cubiertos vienen de
        Franky.
      </p>
      <Link
        href={sectionHref(spaceId, "estudiantes")}
        className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-white"
      >
        Ver resultados <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

export function StampDots({ value, max }: { value: number; max: number }) {
  return (
    <span
      className="flex shrink-0 items-center gap-0.5"
      aria-label={`${value} de ${max} sellos`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-full",
            i < value ? "bg-violet" : "bg-bg-tertiary",
          )}
        />
      ))}
    </span>
  );
}
