import type { ProData } from "./types";
import type {
  ProCourtBlock,
  ProCourtPolicy,
  ProCourtsData,
  ProSchoolGroup,
  ProSpecialHours,
} from "./courts-types";
import { weekdayIndex } from "./format";

/**
 * Base del motor de pistas: valores por defecto, lectura segura de
 * `ProData.courts` y lo que el calendario necesita saber (bloqueos, grupos de
 * escuela y horarios especiales). No importa nada de `courts.ts` para que este
 * pueda usarlo sin dependencias circulares.
 */

export const DEFAULT_POLICY: ProCourtPolicy = {
  noticeHours: 24,
  penaltyPct: 50,
  noShowWarnAt: 3,
  matchReleaseHours: 3,
  releaseAfterMinutes: 30,
  rainFree: true,
  punctualityNote: "",
};

export function emptyCourtsData(): ProCourtsData {
  return {
    policy: { ...DEFAULT_POLICY },
    coveredIds: [],
    blocks: [],
    series: [],
    splits: {},
    waitlist: [],
    levels: {},
    passes: [],
    penalties: [],
    americanas: [],
    league: null,
    school: [],
    lessons: [],
    coachRates: {},
    shop: [],
    extras: {},
    seats: [],
    seatByBooking: {},
    checkins: {},
    lockers: [],
    specialHours: [],
    amenities: [],
    rules: [],
    warnings: [],
    memberNoShows: {},
    roomAllowance: {},
    roomCredit: {},
    cashClosings: [],
    agreements: [],
    campaigns: [],
    invoices: [],
    fiscal: null,
  };
}

/**
 * Datos del motor con todos los campos presentes. Una demo guardada antes de
 * que existiera un campo, o un espacio real sin estos datos, no rompe nada.
 */
export function courtsOps(data: ProData): ProCourtsData {
  const base = emptyCourtsData();
  const stored = data.courts;
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    policy: { ...base.policy, ...stored.policy },
  };
}

/** Aplica un cambio a los datos del motor y devuelve el `ProData` nuevo. */
export function patchCourts(
  data: ProData,
  patch:
    | Partial<ProCourtsData>
    | ((ops: ProCourtsData) => Partial<ProCourtsData>),
): ProData {
  const ops = courtsOps(data);
  const next = typeof patch === "function" ? patch(ops) : patch;
  return { ...data, courts: { ...ops, ...next } };
}

/** Horario especial que manda ese día (exámenes, festivos), si lo hay. */
export function specialHoursOn(
  data: ProData,
  date: string,
): ProSpecialHours | null {
  const list = data.courts?.specialHours;
  if (!list?.length) return null;
  return list.find((s) => s.from <= date && date <= s.to) ?? null;
}

/** Grupos de escuela que tienen clase ese día (dentro de su curso). */
export function schoolOn(data: ProData, date: string): ProSchoolGroup[] {
  const groups = data.courts?.school;
  if (!groups?.length) return [];
  const weekday = weekdayIndex(date);
  return groups.filter(
    (g) =>
      g.weekday === weekday && g.season.from <= date && date <= g.season.to,
  );
}

/**
 * Bloqueos de ese día: los guardados a mano (mantenimiento, torneo, evento
 * privado) más los grupos de escuela, que ocupan su pista cada semana.
 */
export function blocksOn(
  data: ProData,
  date: string,
  resourceId?: string,
): ProCourtBlock[] {
  const saved = (data.courts?.blocks ?? []).filter((b) => b.date === date);
  const school: ProCourtBlock[] = schoolOn(data, date).map((g) => ({
    id: `school-${g.id}-${date}`,
    resourceIds: [g.resourceId],
    date,
    from: g.from,
    to: g.from + g.duration,
    reason: "class",
    note: `Escuela: ${g.name}`,
    sourceId: g.id,
    virtual: true,
  }));
  return [...saved, ...school]
    .filter((b) => !resourceId || b.resourceIds.includes(resourceId))
    .sort((a, b) => a.from - b.from);
}

export const BLOCK_REASON_LABEL: Record<ProCourtBlock["reason"], string> = {
  maintenance: "Mantenimiento",
  class: "Clase",
  tournament: "Torneo",
  private: "Evento privado",
};

/** Hora del reloj para minutos que pueden pasar de medianoche (25:30 → 01:30). */
export function clockLabel(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
