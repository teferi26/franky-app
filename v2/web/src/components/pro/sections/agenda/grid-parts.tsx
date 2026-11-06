"use client";

import * as React from "react";
import { BadgeCheck, Check, Lock, Plus, Sparkles } from "lucide-react";
import { usePro } from "@/lib/pro/store";
import type { ProBooking, ProData, ToneKey } from "@/lib/pro/types";
import type { ProAgendaBlock } from "@/lib/pro/agenda-types";
import {
  bookingDaySpan,
  bookingsOn,
  cabinFor,
  hoursOn,
  poseWindow,
  serviceFor,
} from "@/lib/pro/agenda";
import { awaitsClient } from "@/lib/pro/agenda-ops";
import { categoryIndex, serviceCategories } from "@/lib/pro/agenda-day";
import { localDate, localMinutes, minutesToLabel } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import { Empty } from "../../kit";
import { TONES } from "../../tones";
import { isFromFranky } from "./booking-drawers";

export const SLOT = 15;
export const ROW = 18; // píxeles por cuarto de hora: 72 px por hora

/** Rayado fino para lo que no se puede reservar (bloqueos, preparación, pose). */
export const HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-border) 0 1.5px, transparent 1.5px 8px)",
};

/* ------------------------------------------------------------------ */
/* Color por profesional o por tipo de servicio                        */
/* ------------------------------------------------------------------ */

export type ColorBy = "staff" | "category";

/** Colores de los tipos de servicio, en el orden de la carta. */
const CATEGORY_TONES: ToneKey[] = [
  "sky",
  "amber",
  "emerald",
  "rose",
  "teal",
  "violet",
  "slate",
];

/**
 * Tono de una cita: el de quien la hace o el de su tipo de servicio
 * (uñas, pestañas, facial...). Sin servicio, se queda con el de la persona.
 */
export function bookingTone(
  data: ProData,
  booking: ProBooking,
  colorBy: ColorBy,
): ToneKey {
  const staffTone =
    data.staff.find((x) => x.id === booking.staffId)?.tone ?? "slate";
  if (colorBy === "staff") return staffTone;
  const index = categoryIndex(data, booking);
  return index === -1
    ? staffTone
    : CATEGORY_TONES[index % CATEGORY_TONES.length];
}

/** Leyenda de los tipos de servicio cuando la agenda se colorea por tipo. */
export function CategoryLegend({ data }: { data: ProData }) {
  const categories = serviceCategories(data.services);
  if (categories.length < 2) return null;
  return (
    <ul
      aria-label="Colores por tipo de servicio"
      className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5"
    >
      {categories.map((category, index) => (
        <li
          key={category}
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary"
        >
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              TONES[CATEGORY_TONES[index % CATEGORY_TONES.length]].dot,
            )}
          />
          {category}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Bloque de una cita                                                  */
/* ------------------------------------------------------------------ */

/**
 * Una cita en su columna. Si es un color con pose, el tramo de pose se ve
 * rayado (manos libres); si el servicio lleva preparación, se pinta debajo.
 * `nested` desplaza la cita que se ha colado dentro de la pose de otra.
 */
export function BookingBlock({
  booking: b,
  date,
  start,
  onOpen,
  nested,
  colorBy = "staff",
}: {
  booking: ProBooking;
  date: string;
  start: number;
  onOpen: (id: string) => void;
  nested?: boolean;
  colorBy?: ColorBy;
}) {
  const { data, now } = usePro();
  const service = data.services.find((x) => x.id === b.serviceId);
  const { from, to } = bookingDaySpan(b, date)!;
  const top = ((from - start) / SLOT) * ROW;
  const height = Math.max(ROW * 1.5, ((to - from) / SLOT) * ROW);
  const tone = TONES[bookingTone(data, b, colorBy)];
  const short = height < ROW * 2.6;
  const pose = poseWindow(data, b);
  const poseTop = pose ? ((localMinutes(pose.start) - from) / SLOT) * ROW : 0;
  const poseHeight = pose
    ? ((localMinutes(pose.end) - localMinutes(pose.start)) / SLOT) * ROW
    : 0;
  const buffer = serviceFor(data, b)?.agenda?.bufferMin ?? 0;
  const unconfirmed =
    Boolean(data.agendaOps) &&
    awaitsClient(b) &&
    b.status === "confirmed" &&
    Date.parse(b.start) > now.getTime();

  return (
    <>
      <button
        type="button"
        onClick={() => onOpen(b.id)}
        className={cn(
          "group absolute z-[5] overflow-hidden rounded-lg text-left transition-[transform,box-shadow] duration-200 hover:z-[8] hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
          nested ? "left-[38%] right-1 z-[7] shadow-card" : "inset-x-1",
          tone.block,
          b.status === "requested" &&
            "border border-dashed border-amber-500 bg-amber-50 dark:bg-amber-950/40",
          b.status === "in_service" &&
            "ring-2 ring-offset-1 ring-offset-bg-primary " + tone.ring,
          (b.status === "done" || b.status === "no_show") && "opacity-60",
        )}
        style={{ top: top + 1, height: height - 2 }}
        aria-label={`${b.clientName}, ${service?.name ?? "cita"} a las ${minutesToLabel(from)}${unconfirmed ? ", sin confirmar" : ""}`}
      >
        <span
          className={cn(
            "absolute inset-y-0 left-0 w-[3px]",
            b.status === "requested" ? "bg-amber-500" : tone.bar,
          )}
        />
        {pose && poseHeight >= ROW ? (
          <span
            aria-hidden
            className="absolute inset-x-0 flex items-center bg-bg-primary/55 pl-2.5 text-[0.62rem] font-semibold uppercase tracking-wider text-text-muted"
            style={{ ...HATCH, top: poseTop, height: poseHeight }}
          >
            Pose · manos libres
          </span>
        ) : null}
        <span
          className={cn("relative flex h-full flex-col px-2.5 py-1", tone.text)}
        >
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "truncate text-[0.8rem] font-semibold leading-tight",
                b.status === "no_show" && "line-through",
              )}
            >
              {b.clientName}
            </span>
            {b.student ? (
              <BadgeCheck
                className="h-3.5 w-3.5 shrink-0 opacity-70"
                aria-label="Estudiante verificado"
              />
            ) : null}
            {isFromFranky(b.source) ? (
              <Sparkles
                className="h-3 w-3 shrink-0 text-violet"
                aria-label="Vino por Franky"
              />
            ) : null}
            {unconfirmed ? (
              <span
                className="ml-auto h-2 w-2 shrink-0 rounded-full bg-amber-500"
                title="Sin confirmar"
              />
            ) : null}
            {b.status === "done" ? (
              <Check
                className="ml-auto h-3.5 w-3.5 shrink-0"
                aria-label="Atendida"
              />
            ) : null}
          </span>
          {!short && (!pose || poseTop > ROW * 1.6) ? (
            <span className="truncate text-[0.72rem] opacity-75">
              {minutesToLabel(from)} · {service?.name}
            </span>
          ) : null}
          {!short && b.status === "requested" ? (
            <span className="mt-auto text-[0.68rem] font-semibold text-amber-700 dark:text-amber-300">
              Por confirmar
            </span>
          ) : null}
          {!short && b.status === "arrived" ? (
            <span className="mt-auto text-[0.68rem] font-semibold">
              Ha llegado
            </span>
          ) : null}
        </span>
      </button>
      {buffer && to < 1440 ? (
        <div
          aria-hidden
          title="Preparación de cabina"
          className="pointer-events-none absolute inset-x-1 z-[4] rounded-md border border-dashed border-border"
          style={{
            ...HATCH,
            top: top + height,
            height: Math.max(4, (buffer / SLOT) * ROW - 2),
          }}
        />
      ) : null}
    </>
  );
}

/** Citas de una columna que caen dentro de la pose de otra de la misma persona. */
export function nestedInPose(
  data: ReturnType<typeof usePro>["data"],
  list: ProBooking[],
): Set<string> {
  const out = new Set<string>();
  for (const host of list) {
    const pose = poseWindow(data, host);
    if (!pose) continue;
    for (const guest of list) {
      if (guest.id === host.id) continue;
      if (guest.start >= pose.start && guest.start < pose.end)
        out.add(guest.id);
    }
  }
  return out;
}

/** Bloqueo pintado en su columna: rayado, con el motivo. */
export function BlockBlock({
  block,
  start,
  onOpen,
}: {
  block: ProAgendaBlock;
  start: number;
  onOpen?: (block: ProAgendaBlock) => void;
}) {
  const top = ((block.from - start) / SLOT) * ROW;
  const height = Math.max(ROW, ((block.to - block.from) / SLOT) * ROW);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(block)}
      disabled={!onOpen}
      aria-label={`Bloqueado: ${block.reason} de ${minutesToLabel(block.from)} a ${minutesToLabel(block.to)}`}
      className="absolute inset-x-1 z-[4] overflow-hidden rounded-lg border border-border bg-bg-primary text-left transition-colors hover:border-text-primary/25 disabled:pointer-events-none"
      style={{ ...HATCH, top: top + 1, height: height - 2 }}
    >
      <span className="m-1 inline-flex items-center gap-1 rounded-md bg-bg-primary px-1.5 py-0.5 text-[0.68rem] font-semibold text-text-secondary">
        <Lock className="h-3 w-3" strokeWidth={1.9} /> {block.reason}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Vista por cabina (estética)                                         */
/* ------------------------------------------------------------------ */

/**
 * Una columna por cabina o máquina: se ve de un vistazo qué sala está libre.
 * La agenda ya impide dos citas a la vez en la misma cabina.
 */
export function CabinGrid({
  date,
  onOpen,
  onNew,
  colorBy = "staff",
}: {
  date: string;
  onOpen: (id: string) => void;
  onNew: (minute: number, serviceId?: string) => void;
  colorBy?: ColorBy;
}) {
  const { data, now, can, pending } = usePro();
  const cabins = data.agendaOps?.cabins ?? [];
  const hours = hoursOn(data, date);
  const today = localDate(now);
  const nowMin = localMinutes(now);

  if (!hours) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty icon={Lock} title="Cerrado este día" />
      </div>
    );
  }
  const start = Math.floor(hours.open / 60) * 60;
  const end = Math.ceil(hours.close / 60) * 60;
  const rows = (end - start) / SLOT;
  const all = bookingsOn(data, date);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <div className="max-h-[calc(100dvh-15rem)] min-h-[420px] overflow-auto pro-scroll">
        <div
          className="relative"
          style={{ minWidth: `${56 + cabins.length * 150}px` }}
        >
          <div className="sticky top-0 z-20 flex border-b border-border bg-bg-primary">
            <div className="w-14 shrink-0" />
            {cabins.map((cabin) => {
              const count = all.filter(
                (b) => cabinFor(data, b) === cabin.id && b.status !== "no_show",
              ).length;
              return (
                <div
                  key={cabin.id}
                  className="min-w-[150px] flex-1 border-l border-border-light px-3 py-2.5"
                >
                  <p className="truncate text-sm font-semibold">{cabin.name}</p>
                  <p className="text-xs text-text-muted">
                    {cabin.kind === "machine" ? "Máquina" : "Cabina"} · {count}{" "}
                    {count === 1 ? "cita" : "citas"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="relative flex" style={{ height: rows * ROW }}>
            <div className="relative w-14 shrink-0">
              {Array.from(
                { length: (end - start) / 60 },
                (_, i) => start + i * 60,
              ).map((m) => (
                <span
                  key={m}
                  className="absolute right-2 -translate-y-1/2 text-[0.7rem] font-medium text-text-muted tabular"
                  style={{ top: ((m - start) / SLOT) * ROW }}
                >
                  {minutesToLabel(m)}
                </span>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-14 right-0">
              {Array.from({ length: rows }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "border-t",
                    (start + i * SLOT) % 60 === 0
                      ? "border-border-light"
                      : "border-transparent",
                  )}
                  style={{ height: ROW }}
                />
              ))}
            </div>
            {cabins.map((cabin) => {
              const list = all.filter((b) => cabinFor(data, b) === cabin.id);
              const serviceId = data.services.find(
                (s) => s.agenda?.cabinId === cabin.id,
              )?.id;
              return (
                <div
                  key={cabin.id}
                  className="relative min-w-[150px] flex-1 border-l border-border-light"
                >
                  {Array.from({ length: rows }, (_, i) => {
                    const minute = start + i * SLOT;
                    const past =
                      date < today || (date === today && minute < nowMin);
                    return (
                      <button
                        key={minute}
                        type="button"
                        disabled={pending || !can("booking.create") || past}
                        aria-label={`Nueva cita a las ${minutesToLabel(minute)} en ${cabin.name}`}
                        onClick={() => onNew(minute, serviceId)}
                        className="group absolute inset-x-1 rounded-md transition-colors hover:bg-violet-50 focus-visible:bg-violet-50 focus-visible:outline-none disabled:pointer-events-none"
                        style={{ top: i * ROW, height: ROW }}
                      >
                        <span className="hidden items-center gap-1 pl-1.5 text-[0.68rem] font-semibold text-violet group-hover:flex group-focus-visible:flex">
                          <Plus className="h-3 w-3" /> {minutesToLabel(minute)}
                        </span>
                      </button>
                    );
                  })}
                  {list.map((b) => (
                    <BookingBlock
                      key={b.id}
                      booking={b}
                      date={date}
                      start={start}
                      onOpen={onOpen}
                      colorBy={colorBy}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
