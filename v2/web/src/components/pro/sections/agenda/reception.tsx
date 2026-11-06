"use client";

import * as React from "react";
import { Copy, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { bookingsOn, daySummary, freeGaps } from "@/lib/pro/agenda";
import { setBookingStatus, walkinQueue } from "@/lib/pro/agenda-ops";
import {
  bookingFlags,
  briefText,
  briefWarnings,
  staffDayBrief,
  type BriefFlag,
  type BriefTone,
} from "@/lib/pro/agenda-day";
import type { ProBooking } from "@/lib/pro/types";
import {
  dayLabel,
  durationLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  time,
} from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Drawer,
  Empty,
  FixedPortal,
  LiveDot,
  Pill,
  StatusPill,
} from "../../kit";
import { TONES } from "../../tones";
import {
  WhatsAppButton,
  serviceStaff,
  staffFirst,
  useAgenda,
  useCopy,
} from "./parts";

const PILL_TONE: Record<
  BriefTone,
  "danger" | "warning" | "violet" | "neutral"
> = {
  danger: "danger",
  warning: "warning",
  violet: "violet",
  neutral: "neutral",
};

/** Avisos en píldoras; con `compact` solo los que piden hacer algo. */
function Flags({ flags, compact }: { flags: BriefFlag[]; compact?: boolean }) {
  const list = compact
    ? flags.filter((flag) => flag.tone !== "neutral").slice(0, 3)
    : flags;
  if (!list.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {list.map((flag) => (
        <Pill key={flag.label} tone={PILL_TONE[flag.tone]}>
          {flag.label}
        </Pill>
      ))}
    </span>
  );
}

/**
 * En el mostrador no se lee la salud de nadie: todos los avisos de salud se
 * quedan en uno solo, "Mira la ficha", delante del resto.
 */
export function counterFlags(flags: BriefFlag[]): BriefFlag[] {
  const rest = flags.filter((flag) => flag.tone !== "danger");
  return rest.length === flags.length
    ? rest
    : [{ label: "Mira la ficha", tone: "danger" }, ...rest];
}

/* ------------------------------------------------------------------ */
/* El día de una persona                                               */
/* ------------------------------------------------------------------ */

/**
 * Lo que tiene hoy una persona del equipo con los avisos de cada ficha:
 * alergias, prueba pendiente, firma, bono, primera visita o estudiante. Se le
 * puede mandar por WhatsApp; la salud no sale en el mensaje.
 */
export function StaffDayDrawer({
  staffId,
  date,
  onClose,
  onOpenBooking,
}: {
  staffId: string | null;
  date: string;
  onClose: () => void;
  onOpenBooking?: (bookingId: string) => void;
}) {
  const { data } = useAgenda();
  const copy = useCopy();
  const person = data.staff.find((s) => s.id === staffId);
  const rows = person ? staffDayBrief(data, date, person.id) : [];
  const warnings = briefWarnings(rows);
  const text = person ? briefText(data, date, person.id) : "";

  return (
    <Drawer
      open={Boolean(person)}
      onOpenChange={(v) => !v && onClose()}
      title={person ? `El día de ${person.name.split(" ")[0]}` : ""}
      description={
        rows.length
          ? `${rows.length} ${rows.length === 1 ? "cita" : "citas"}${warnings ? `, ${warnings} con algo que mirar antes` : ", sin avisos en las fichas"}.`
          : `Sin citas el ${dayLabel(`${date}T12:00:00Z`)}.`
      }
      footer={
        person && rows.length ? (
          <>
            <Button variant="ghost" onClick={() => void copy(text)}>
              <Copy className="h-4 w-4" strokeWidth={1.9} /> Copiar
            </Button>
            <WhatsAppButton
              phone={person.phone}
              share={!person.phone}
              message={text}
              label={`Mandar a ${person.name.split(" ")[0]}`}
              variant="dark"
              size="default"
            />
          </>
        ) : null
      }
    >
      {rows.length ? (
        <ol className="flex flex-col divide-y divide-border-light">
          {rows.map((row) => (
            <li key={row.booking.id}>
              <button
                type="button"
                disabled={!onOpenBooking}
                onClick={() => onOpenBooking?.(row.booking.id)}
                className="flex w-full items-start gap-3 py-3 text-left disabled:cursor-default"
              >
                <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular">
                  {time(row.booking.start)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {row.booking.clientName}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {row.service?.name ?? "Cita"} ·{" "}
                    {durationLabel(
                      (Date.parse(row.booking.end) -
                        Date.parse(row.booking.start)) /
                        60000,
                    )}
                  </span>
                  <Flags flags={row.flags} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <Empty
          icon={UserCheck}
          title="Día libre de citas"
          body="Si entra alguien, aparecerá aquí con los avisos de su ficha."
        />
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Recepción a pantalla completa                                       */
/* ------------------------------------------------------------------ */

/** En una pantalla que puede ver el cliente: nombre y la inicial del apellido. */
function counterName(name: string) {
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
}

/**
 * Agenda del día para la tablet del mostrador: quién está con quién, quién
 * viene después y un toque para decir que ha llegado. Los datos de salud no
 * se enseñan: solo "mira la ficha".
 */
export function ReceptionScreen({ onClose }: { onClose: () => void }) {
  const { data, now, run, pending, can, ops, vertical } = useAgenda();
  const toast = useToast();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const summary = daySummary(data, today, nowMin);
  const free = freeGaps(data, today, nowMin, 30).reduce(
    (total, gap) => total + gap.to - gap.from,
    0,
  );
  const people = serviceStaff(data);
  const queue =
    ops && vertical.id === "hairdresser" ? walkinQueue(data, now) : [];

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const arrived = async (booking: ProBooking) => {
    if (
      await run("booking.arrived", (d) =>
        setBookingStatus(d, booking.id, "arrived"),
      )
    )
      toast.success(`${counterName(booking.clientName)} ha llegado`);
  };

  return (
    <FixedPortal>
      <div
        role="dialog"
        aria-label="Recepción"
        className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-bg-primary px-4 pb-8 pt-6 sm:px-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">{data.space.name}</p>
            <p className="mt-1 font-heading text-5xl font-extrabold tracking-[-0.03em] tabular sm:text-6xl">
              {time(now.toISOString())}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              {dayLabel(now.toISOString())} · {summary.total}{" "}
              {summary.total === 1 ? "cita" : "citas"} · {summary.pending} por
              delante
              {free ? ` · ${durationLabel(free)} libres` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar recepción"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border text-text-secondary hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {queue.length ? (
          <p className="mt-5 rounded-2xl border border-border px-4 py-3 text-sm">
            <span className="font-semibold">
              Sin cita: {queue.length}{" "}
              {queue.length === 1 ? "persona espera" : "personas esperan"}.
            </span>{" "}
            {queue[0].startMinute !== null && queue[0].staffId
              ? `Siguiente, ${counterName(queue[0].entry.name)} con ${staffFirst(data, queue[0].staffId)} a las ${minutesToLabel(queue[0].startMinute)}.`
              : "Ahora mismo no hay hueco para atenderle hoy."}
          </p>
        ) : null}

        <div
          className={cn(
            "mt-6 grid gap-4",
            people.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2",
          )}
        >
          {people.map((person) => {
            const list = bookingsOn(data, today, person.id).filter(
              (b) =>
                !["done", "no_show", "cancelled"].includes(b.status) &&
                Date.parse(b.end) > now.getTime(),
            );
            // Como en Hoy: la que está en marcha o la que ya ha empezado.
            const current = list.find(
              (b) =>
                b.status === "in_service" ||
                Date.parse(b.start) <= now.getTime(),
            );
            const next = list.filter((b) => b !== current);
            return (
              <section
                key={person.id}
                className="flex min-w-0 flex-col rounded-3xl border border-border"
              >
                <div className="flex items-center gap-3 border-b border-border-light px-4 py-3">
                  <Avatar name={person.name} tone={person.tone} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading text-lg font-bold">
                      {person.name.split(" ")[0]}
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-text-muted">
                      {current ? (
                        <>
                          <LiveDot /> Con {counterName(current.clientName)}{" "}
                          hasta las {time(current.end)}
                        </>
                      ) : (
                        "Libre ahora"
                      )}
                    </p>
                  </div>
                </div>
                {next.length ? (
                  <ol className="flex flex-col divide-y divide-border-light">
                    {next.slice(0, 6).map((b) => (
                      <li
                        key={b.id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <span
                          className={cn(
                            "h-10 w-1 shrink-0 rounded-full",
                            TONES[person.tone].bar,
                          )}
                        />
                        <span className="w-12 shrink-0 font-heading text-lg font-bold tabular">
                          {time(b.start)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold">
                            {counterName(b.clientName)}
                          </span>
                          <span className="block truncate text-xs text-text-muted">
                            {data.services.find((s) => s.id === b.serviceId)
                              ?.name ?? "Cita"}
                          </span>
                          <Flags
                            compact
                            flags={counterFlags(bookingFlags(data, b, today))}
                          />
                        </span>
                        {b.status === "arrived" ? (
                          <StatusPill status="arrived" />
                        ) : b.status === "confirmed" ||
                          b.status === "requested" ? (
                          <Button
                            variant="outline"
                            className="h-10 shrink-0"
                            disabled={
                              pending ||
                              b.status === "requested" ||
                              !can("booking.arrived")
                            }
                            onClick={() => void arrived(b)}
                          >
                            Ha llegado
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="px-4 py-5 text-sm text-text-muted">
                    Nada más hoy.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </FixedPortal>
  );
}
