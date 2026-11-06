import type { ProData } from "./types";
import type { CommunityActivity, CommunityMember } from "./community-types";
import { activityAttendees, checkedInSet, firstName } from "./community";
import { courseRange, type CourseRange } from "./community-registry";
import { addDays, dayLabel, localDate, time } from "./format";

/**
 * Retención de la hornada de septiembre (motor "community").
 *
 * Los socios que entran en septiembre se apuntan con ganas y muchos no vuelven
 * después de la primera actividad. Aquí se cuenta cuántos de los que entraron
 * este curso han venido a 1, 2 o 3 actividades, y se compara con los que
 * entraron el curso anterior en las mismas fechas: mismo número de días desde
 * el 1 de julio, para que la comparación sea justa.
 */

export type CohortRetention = {
  course: CourseRange;
  /** Último día que se cuenta (YYYY-MM-DD). */
  cutoff: string;
  /** Socios que entraron en el curso hasta `cutoff`. */
  joined: number;
  /** Cuántos han venido al menos a 1, 2 y 3 actividades. */
  atLeast: [number, number, number];
  /** Lo mismo en porcentaje de `joined`. */
  pct: [number, number, number];
  /** Socios de la hornada que aún no han venido a nada. */
  neverCame: CommunityMember[];
  /** Socios de la hornada que vinieron una sola vez. */
  cameOnce: CommunityMember[];
};

export type CohortComparison = {
  current: CohortRetention;
  /** El curso anterior en las mismas fechas, o null si no hubo altas. */
  previous: CohortRetention | null;
};

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function share(part: number, total: number): number {
  return total ? Math.round((part * 100) / total) : 0;
}

/**
 * Hornada de un curso contada hasta el mismo día del curso que hoy.
 * `offset` -1 es el curso anterior.
 */
export function cohortRetention(data: ProData, now: Date, offset = 0): CohortRetention {
  const today = localDate(now);
  const current = courseRange(now);
  const course = courseRange(now, offset);
  const elapsed = Math.max(0, daysBetween(current.from, today));
  const cutoff = offset === 0 ? today : addDays(course.from, elapsed);
  const cutoffIso = offset === 0 ? now.toISOString() : `${cutoff}T23:59:59.999Z`;

  const members = data.communityMembers as CommunityMember[];
  const cohort = members.filter((m) => {
    const day = localDate(m.joinedAt);
    return day >= course.from && day <= cutoff;
  });

  // Asistencias de cada socio de la hornada en actividades ya hechas dentro del
  // curso, desde su alta hasta el día de corte.
  const joinedDay = new Map(cohort.map((m) => [m.id, localDate(m.joinedAt)]));
  const counts = new Map<string, number>();
  const activities = (data.activities as CommunityActivity[]).filter((a) => {
    if (a.status === "draft") return false;
    const day = localDate(a.date);
    return day >= course.from && day <= cutoff && a.date <= cutoffIso;
  });
  for (const a of activities) {
    const day = localDate(a.date);
    const inside = checkedInSet(a, activityAttendees(a, members));
    for (const id of inside) {
      const since = joinedDay.get(id);
      if (!since || since > day) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const at = (n: number) => cohort.filter((m) => (counts.get(m.id) ?? 0) >= n).length;
  const atLeast: [number, number, number] = [at(1), at(2), at(3)];
  return {
    course,
    cutoff,
    joined: cohort.length,
    atLeast,
    pct: [
      share(atLeast[0], cohort.length),
      share(atLeast[1], cohort.length),
      share(atLeast[2], cohort.length),
    ],
    neverCame: cohort.filter((m) => !counts.get(m.id) && !m.leftAt),
    cameOnce: cohort.filter((m) => counts.get(m.id) === 1 && !m.leftAt),
  };
}

export function cohortComparison(data: ProData, now: Date): CohortComparison {
  const previous = cohortRetention(data, now, -1);
  return {
    current: cohortRetention(data, now, 0),
    previous: previous.joined ? previous : null,
  };
}

/** Mensaje para quien se hizo socio y aún no ha venido a nada. */
export function newcomerInviteMessage(opts: {
  member: CommunityMember;
  spaceName: string;
  activity?: CommunityActivity;
  url: string;
}): string {
  const hello =
    `Hola ${firstName(opts.member.name)}, te diste de alta en ${opts.spaceName} ` +
    "y todavía no te hemos visto.";
  if (!opts.activity) return `${hello} Mira lo que tenemos preparado y vente: ${opts.url}`;
  const a = opts.activity;
  return (
    `${hello} El ${dayLabel(a.date)} a las ${time(a.date)} tenemos ${a.title} en ${a.place}. ` +
    `Es buen momento para empezar. Te apuntas aquí: ${opts.url}`
  );
}

/**
 * Diferencia en puntos entre este curso y el anterior para "han vuelto"
 * (al menos 2 actividades). null si no hay curso anterior con que comparar.
 */
export function cohortDelta(c: CohortComparison): number | null {
  if (!c.previous || !c.current.joined) return null;
  return c.current.pct[1] - c.previous.pct[1];
}
