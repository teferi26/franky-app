/**
 * Equipo de la noche: fichajes contados por noche (entrar a las 00:30 es de
 * la noche anterior), comparados con el cuadrante, y controladores de acceso
 * habilitados en puerta.
 *
 * Funciones puras: la web y la app nativa cuentan igual.
 */
import type { ProData, ProShift, ProStaff } from "./types";
import type { ProNightOps, ProPlannedShift, ProRotaRole } from "./night-types";
import { atLocal, addDays, localMinutes, minutesToLabel } from "./format";
import { nightOf } from "./night";
import { ROTA_ROLES, nightOpsOf, rotaOf, shiftMinutes } from "./night-ops";

/** Minutos de margen antes de marcar una llegada como tarde. */
export const LATE_MARGIN_MINUTES = 15;

/** La noche a la que pertenece un fichaje: la de su hora de entrada. */
export function shiftNight(sh: Pick<ProShift, "inAt">): string {
  return nightOf(new Date(sh.inAt));
}

/** Minutos trabajados en un fichaje, descanso fuera. Si sigue abierto, hasta ahora. */
export function workedMinutes(sh: Pick<ProShift, "inAt" | "outAt" | "breakMinutes">, now: Date): number {
  const end = sh.outAt ? new Date(sh.outAt).getTime() : now.getTime();
  const raw = Math.round((end - new Date(sh.inAt).getTime()) / 60000) - (sh.breakMinutes || 0);
  return Math.max(0, raw);
}

/** Instante de inicio de un turno planificado (si empieza de madrugada, es el día siguiente). */
export function plannedStartAt(s: Pick<ProPlannedShift, "night" | "fromMinute">): string {
  return s.fromMinute < 12 * 60 ? atLocal(addDays(s.night, 1), s.fromMinute) : atLocal(s.night, s.fromMinute);
}

export type ShiftCheckStatus = "ok" | "late" | "open" | "missing" | "unplanned";

export const SHIFT_CHECK_LABEL: Record<ShiftCheckStatus, string> = {
  ok: "Cuadra",
  late: "Llegó tarde",
  open: "Sin fichar la salida",
  missing: "No fichó",
  unplanned: "Fichó sin turno",
};

export type ShiftCheck = {
  staffId: string;
  night: string;
  planned: ProPlannedShift[];
  shifts: ProShift[];
  plannedMinutes: number;
  workedMinutes: number;
  /** Trabajado menos planificado (positivo: se quedó más). */
  diffMinutes: number;
  /** Minutos de retraso en la entrada frente al primer turno planificado. */
  lateMinutes: number;
  status: ShiftCheckStatus;
};

/**
 * Fichado frente al cuadrante, por persona y noche. Solo noches ya pasadas o
 * la de hoy; una noche futura aún no puede cuadrar.
 */
export function timesheetVsRota(data: Pick<ProData, "shifts" | "nightOps">, nights: string[], now: Date): ShiftCheck[] {
  const ops = nightOpsOf(data);
  const today = nightOf(now);
  const out: ShiftCheck[] = [];
  for (const night of nights) {
    if (night > today) continue;
    const planned = rotaOf(ops, night);
    const worked = data.shifts.filter((sh) => shiftNight(sh) === night);
    const people = new Set([...planned.map((s) => s.staffId), ...worked.map((s) => s.staffId)]);
    for (const staffId of people) {
      const own = planned.filter((s) => s.staffId === staffId);
      const shifts = worked.filter((s) => s.staffId === staffId).sort((a, b) => a.inAt.localeCompare(b.inAt));
      const plannedMinutes = own.reduce((a, s) => a + shiftMinutes(s), 0);
      // Un fichaje de una noche pasada sin salida no cuenta horas: no se sabe cuándo se fue.
      const workedTotal = shifts.reduce(
        (a, s) => a + (!s.outAt && night !== today ? 0 : workedMinutes(s, now)),
        0,
      );
      const first = own[0];
      const lateMinutes =
        first && shifts[0]
          ? Math.max(0, Math.round((new Date(shifts[0].inAt).getTime() - new Date(plannedStartAt(first)).getTime()) / 60000))
          : 0;
      let status: ShiftCheckStatus = "ok";
      if (!own.length) status = "unplanned";
      else if (!shifts.length) {
        // Esta noche aún puede llegar: solo es "no fichó" si ya pasó su hora.
        if (night === today && now.getTime() < new Date(plannedStartAt(first)).getTime()) continue;
        status = "missing";
      } else if (shifts.some((s) => !s.outAt) && night !== today) status = "open";
      else if (lateMinutes > LATE_MARGIN_MINUTES) status = "late";
      out.push({
        staffId,
        night,
        planned: own,
        shifts,
        plannedMinutes,
        workedMinutes: workedTotal,
        diffMinutes: workedTotal - plannedMinutes,
        lateMinutes,
        status,
      });
    }
  }
  return out.sort((a, b) => b.night.localeCompare(a.night) || a.staffId.localeCompare(b.staffId));
}

/** Resumen para la cabecera: cuántas noches y personas no cuadran. */
export function timesheetSummary(checks: ShiftCheck[]) {
  const issues = checks.filter((c) => c.status !== "ok");
  return {
    checks: checks.length,
    issues: issues.length,
    missing: issues.filter((c) => c.status === "missing").length,
    late: issues.filter((c) => c.status === "late").length,
    open: issues.filter((c) => c.status === "open").length,
    unplanned: issues.filter((c) => c.status === "unplanned").length,
    workedMinutes: checks.reduce((a, c) => a + c.workedMinutes, 0),
    plannedMinutes: checks.reduce((a, c) => a + c.plannedMinutes, 0),
  };
}

function hhmm(iso: string | null): string {
  return iso ? minutesToLabel(localMinutes(iso)) : "";
}

function hours(minutes: number): string {
  return (minutes / 60).toFixed(2).replace(".", ",");
}

/**
 * Registro de jornada por noche para la gestoría o una inspección: una fila
 * por persona y noche, con lo planificado y lo fichado.
 */
export function timesheetRows(data: Pick<ProData, "shifts" | "nightOps" | "staff">, nights: string[], now: Date): string[][] {
  const rows: string[][] = [
    ["Noche", "Persona", "Puesto", "Turno planificado", "Entrada", "Salida", "Descanso (min)", "Horas fichadas", "Horas planificadas", "Diferencia (h)"],
  ];
  const checks = timesheetVsRota(data, nights, now).sort(
    (a, b) => a.night.localeCompare(b.night) || a.staffId.localeCompare(b.staffId),
  );
  for (const c of checks) {
    const person = data.staff.find((s) => s.id === c.staffId);
    const first = c.shifts[0];
    const last = c.shifts[c.shifts.length - 1];
    rows.push([
      c.night,
      person?.name ?? c.staffId,
      c.planned.map((p) => ROTA_ROLES[p.role].label).join(" y "),
      c.planned.map((p) => `${minutesToLabel(p.fromMinute)} a ${minutesToLabel(p.toMinute % 1440)}`).join(" y "),
      first ? hhmm(first.inAt) : "",
      last ? hhmm(last.outAt) : "",
      String(c.shifts.reduce((a, s) => a + (s.breakMinutes || 0), 0)),
      hours(c.workedMinutes),
      hours(c.plannedMinutes),
      hours(c.diffMinutes),
    ]);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Controladores de acceso habilitados                                 */
/* ------------------------------------------------------------------ */

export function doorLicenseOf(ops: ProNightOps, staffId: string): string | null {
  const value = ops.settings.doorLicenses?.[staffId]?.trim();
  return value ? value : null;
}

/** Personas que suelen estar en puerta: por su rol o porque tienen turnos de puerta. */
export function doorStaff(staff: ProStaff[], ops: ProNightOps): ProStaff[] {
  const inRota = new Set(ops.rota.filter((s) => s.role === "puerta").map((s) => s.staffId));
  return staff.filter((s) => s.role !== "rrpp" && (s.role === "reception" || inRota.has(s.id) || doorLicenseOf(ops, s.id)));
}

/** Puestos que cuentan como control de acceso. */
const DOOR_ROLES: ProRotaRole[] = ["puerta"];

/**
 * Noches con gente en puerta pero ninguna habilitada. Solo avisa si el local
 * ha dicho que lo necesita.
 */
export function nightsWithoutLicensedDoor(ops: ProNightOps, nights: string[]): string[] {
  if (!ops.settings.licenseRequired) return [];
  return nights.filter((night) => {
    const door = rotaOf(ops, night).filter((s) => DOOR_ROLES.includes(s.role));
    return door.length > 0 && !door.some((s) => doorLicenseOf(ops, s.staffId));
  });
}

export function setDoorLicense(ops: ProNightOps, staffId: string, value: string): ProNightOps {
  const licenses = { ...(ops.settings.doorLicenses ?? {}) };
  const clean = value.trim();
  if (clean) licenses[staffId] = clean;
  else delete licenses[staffId];
  return { ...ops, settings: { ...ops.settings, doorLicenses: licenses } };
}
