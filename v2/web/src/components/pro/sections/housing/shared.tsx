"use client";

import * as React from "react";
import { BadgeCheck, Bath, Camera, Globe2, MapPin, Sun, Users } from "lucide-react";
import type { ProData, ProProperty, ProRoom, ToneKey } from "@/lib/pro/types";
import { money } from "@/lib/pro/format";
import { ROOM_STATUS, shortDate, uniShort } from "@/lib/pro/housing";
import { cn } from "@/lib/utils";
import { Pill } from "../../kit";
import { TONES } from "../../tones";

/** Universidad con la marca de verificado de Franky. */
export function UniBadge({ university, verified, long, className }: { university: string; verified: boolean; long?: boolean; className?: string }) {
  if (!verified)
    return <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-text-muted", className)}>{uniShort(university)}, sin verificar</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold text-violet-deep", className)} title="Verificado por su universidad en Franky">
      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" strokeWidth={1.9} />
      {long ? `Verificado por la ${uniShort(university)}` : uniShort(university)}
    </span>
  );
}

export function RoomieBadge({ group, className }: { group: { size: number; compatibility: number }; className?: string }) {
  return (
    <Pill tone="violet" className={className}>
      <Users className="h-3 w-3" strokeWidth={1.9} /> Grupo de {group.size} · {group.compatibility} %
    </Pill>
  );
}

export function ErasmusBadge() {
  return (
    <Pill tone="info">
      <Globe2 className="h-3 w-3" strokeWidth={1.9} /> Erasmus
    </Pill>
  );
}

const ROOM_CHIP: Record<ProRoom["status"], string> = {
  free: "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  reserved: "border-violet/30 bg-violet-50 text-violet-deep",
  occupied: "border-border bg-bg-secondary text-text-muted",
  leaving: "border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
};

/** Una habitación como píldora: estado por color, número y precio. */
export function RoomChip({ room, onClick, showPrice = true }: { room: ProRoom; onClick?: () => void; showPrice?: boolean }) {
  const label = `${room.name}: ${ROOM_STATUS[room.status].label.toLowerCase()}${room.status === "leaving" ? ` el ${shortDate(room.availableFrom)}` : ""}, ${money(room.priceCents)}`;
  const content = (
    <>
      <span className="font-semibold">{room.name.replace("Habitación ", "H")}</span>
      {showPrice ? <span className="tabular opacity-80">{Math.round(room.priceCents / 100)} €</span> : null}
    </>
  );
  const cls = cn("inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[0.72rem]", ROOM_CHIP[room.status]);
  if (onClick)
    return (
      <button type="button" onClick={onClick} title={label} aria-label={label} className={cn(cls, "transition-transform hover:-translate-y-px")}>
        {content}
      </button>
    );
  return (
    <span title={label} className={cls}>
      {content}
    </span>
  );
}

export function RoomLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted", className)}>
      {(Object.keys(ROOM_STATUS) as ProRoom["status"][]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-[4px] border", ROOM_CHIP[s])} />
          {ROOM_STATUS[s].label}
        </span>
      ))}
    </div>
  );
}

const ZONE_TONE: Record<string, ToneKey> = {
  "San Vicente centro": "violet",
  Tómbola: "sky",
  "Ciudad Jardín": "emerald",
  "Alicante centro": "amber",
};

export function zoneTone(zone: string): ToneKey {
  return ZONE_TONE[zone] ?? "slate";
}

/** Portada del piso: bloque de color por zona (las fotos reales las sube el dueño). */
export function PropertyCover({ property, className, children }: { property: ProProperty; className?: string; children?: React.ReactNode }) {
  const tone = TONES[zoneTone(property.zone)];
  const plan = property.rooms.length;
  return (
    <div className={cn("relative overflow-hidden", tone.block, className)}>
      {/* Plano esquemático: una celda por habitación. */}
      <div aria-hidden className="absolute inset-x-5 bottom-0 top-6 grid gap-1.5 opacity-60" style={{ gridTemplateColumns: `repeat(${Math.min(plan, 3)}, minmax(0, 1fr))` }}>
        {property.rooms.map((r) => (
          <span key={r.id} className={cn("rounded-t-md border border-b-0 border-text-primary/10", r.status === "free" ? "bg-bg-primary/80" : "bg-bg-primary/40")} />
        ))}
      </div>
      <div className="relative flex h-full flex-col justify-between p-3">
        <span className={cn("inline-flex w-fit items-center gap-1 rounded-full bg-bg-primary/90 px-2 py-0.5 text-[0.7rem] font-semibold", tone.text)}>
          <MapPin className="h-3 w-3" strokeWidth={1.9} /> {property.zone}
        </span>
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-bg-primary/90 px-2 py-0.5 text-[0.7rem] font-semibold text-text-secondary">
          <Camera className="h-3 w-3" strokeWidth={1.9} /> {property.photos} fotos
        </span>
      </div>
      {children}
    </div>
  );
}

/** Rasgos de una habitación en pequeño. */
export function RoomTraits({ room }: { room: ProRoom }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
      <span className="tabular">{room.sizeM2} m²</span>
      {room.exterior ? (
        <span className="inline-flex items-center gap-0.5">
          <Sun className="h-3 w-3" strokeWidth={1.9} /> Exterior
        </span>
      ) : (
        <span>Interior</span>
      )}
      {room.privateBath ? (
        <span className="inline-flex items-center gap-0.5">
          <Bath className="h-3 w-3" strokeWidth={1.9} /> Baño propio
        </span>
      ) : null}
    </span>
  );
}

/** Si una habitación entra en el presupuesto del interesado. */
export function BudgetFit({ budgetCents, priceCents }: { budgetCents: number; priceCents: number }) {
  const diff = priceCents - budgetCents;
  if (diff <= 0) return <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Entra en su presupuesto</span>;
  return <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 tabular">{money(diff)} por encima de su presupuesto</span>;
}

export function staffName(data: ProData, id?: string) {
  return data.staff.find((s) => s.id === id)?.name;
}

/** Selector nativo con el estilo de los campos del kit. */
export const selectClass =
  "h-10 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20";

/** Día corto para chips: "hoy", "mañana", "vie 26". */
export function dayChip(date: string, today: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export function euros(input: string): number {
  return Math.round(Number(input.replace(",", ".")) * 100) || 0;
}
