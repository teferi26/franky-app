import type { ProBoardSeat, ProData } from "./types";
import type {
  CommunityActivity,
  CommunityArchiveDoc,
  CommunityAssembly,
  CommunityMember,
} from "./community-types";
import {
  activityAttendees,
  checkedInSet,
  communityOps,
  courseLabel,
  courseStartYear,
  isActiveMember,
} from "./community";
import { localDate } from "./format";

/**
 * Papeles que la universidad pide cada curso y asistencia de la junta.
 *
 * Los registros de asociaciones (UJA, UGR, UM, UCO) piden en el primer
 * trimestre el certificado de la junta vigente, la lista de socios con al menos
 * un 80 % de comunidad universitaria y la memoria del curso anterior. Para los
 * créditos por representación se pide haber ido al 80 % de las sesiones del
 * órgano (criterio de la Universitat de València y RD 822/2021).
 */

/** Porcentaje mínimo de socios de la comunidad universitaria. */
export const REGISTRY_COMMUNITY_PCT = 80;

/** Asistencia mínima a las sesiones para el certificado de representación. */
export const REPRESENTATION_MIN_PCT = 80;

/* ------------------------------------------------------------------ */
/* Curso académico                                                     */
/* ------------------------------------------------------------------ */

export type CourseRange = {
  /** "25/26". */
  label: string;
  /** YYYY-MM-DD, ambos incluidos. */
  from: string;
  to: string;
};

/** Curso en marcha (offset 0), el anterior (-1) o el siguiente (1). */
export function courseRange(now: Date | string, offset = 0): CourseRange {
  const y = courseStartYear(now) + offset;
  return { label: courseLabel(now, offset), from: `${y}-07-01`, to: `${y + 1}-06-30` };
}

/** Actividades ya hechas dentro de un curso, de la más antigua a la más reciente. */
export function courseActivities(
  activities: CommunityActivity[],
  range: CourseRange,
): CommunityActivity[] {
  return activities
    .filter((a) => a.status === "done")
    .filter((a) => {
      const day = localDate(a.date);
      return day >= range.from && day <= range.to;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Comunidad universitaria                                             */
/* ------------------------------------------------------------------ */

/** Compara nombres sin tildes, mayúsculas ni espacios de más. */
export function sameName(a: string, b: string): boolean {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return clean(a) === clean(b);
}

export type CommunityShare = {
  total: number;
  /** Socios de la universidad de la asociación. */
  community: number;
  outside: number;
  /** Porcentaje redondeado hacia abajo: 79,6 % no cuenta como 80 %. */
  pct: number;
  meets: boolean;
};

/** Qué parte de los socios activos es de la universidad donde está registrada la asociación. */
export function universityCommunityShare(
  members: CommunityMember[],
  university: string,
): CommunityShare {
  const active = members.filter(isActiveMember);
  const community = active.filter((m) => sameName(m.university, university)).length;
  const total = active.length;
  return {
    total,
    community,
    outside: total - community,
    pct: total ? Math.floor((community * 100) / total) : 0,
    meets: total > 0 && community * 100 >= total * REGISTRY_COMMUNITY_PCT,
  };
}

/* ------------------------------------------------------------------ */
/* Papeles del registro universitario                                  */
/* ------------------------------------------------------------------ */

export type RegistryItemId = "board" | "members" | "memory";

export type RegistryItem = {
  id: RegistryItemId;
  title: string;
  detail: string;
  ready: boolean;
};

export type RegistryPack = {
  course: CourseRange;
  previous: CourseRange;
  /** Último día del primer trimestre del curso. */
  due: string;
  daysLeft: number;
  /** De septiembre a diciembre: es el momento de preparar los papeles. */
  inSeason: boolean;
  share: CommunityShare;
  previousActivities: CommunityActivity[];
  items: RegistryItem[];
  ready: boolean;
  /** Papeles ya preparados este curso, si los hay. */
  prepared?: CommunityArchiveDoc;
};

/** Etiqueta con la que se guardan en el archivo los papeles de un curso. */
export function registryTag(course: CourseRange): string {
  return `registro:${course.label}`;
}

/** Cargos imprescindibles para firmar los certificados. */
function boardGaps(board: ProBoardSeat[], today: string): string[] {
  const gaps: string[] = [];
  if (!board.some((b) => /presiden/i.test(b.role) && b.name.trim())) gaps.push("presidencia");
  if (!board.some((b) => /secretar/i.test(b.role) && b.name.trim())) gaps.push("secretaría");
  if (!board.some((b) => /tesor/i.test(b.role) && b.name.trim())) gaps.push("tesorería");
  if (board.length && board.every((b) => b.until < today)) gaps.push("mandato en vigor");
  return gaps;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function registryPack(data: ProData, now: Date): RegistryPack {
  const today = localDate(now);
  const course = courseRange(now);
  const previous = courseRange(now, -1);
  const due = `${course.from.slice(0, 4)}-12-31`;
  const members = data.communityMembers as CommunityMember[];
  const share = universityCommunityShare(members, data.space.campus);
  const previousActivities = courseActivities(data.activities as CommunityActivity[], previous);
  const gaps = boardGaps(data.board, today);
  const month = Number(today.slice(5, 7));

  const items: RegistryItem[] = [
    {
      id: "board",
      title: "Certificado de la junta directiva",
      detail: gaps.length
        ? `Falta: ${gaps.join(", ")}.`
        : `${data.board.length} cargos, firmado por la secretaría con el visto bueno de la presidencia.`,
      ready: gaps.length === 0,
    },
    {
      id: "members",
      title: "Lista de socios",
      detail: share.total
        ? `${share.total} socios activos, el ${share.pct} % de la ${data.space.campus}.` +
          (share.meets ? "" : ` Hace falta al menos el ${REGISTRY_COMMUNITY_PCT} %.`)
        : "Aún no hay socios en el libro.",
      ready: share.meets,
    },
    {
      id: "memory",
      title: `Memoria del curso ${previous.label}`,
      detail: previousActivities.length
        ? `${previousActivities.length} actividades con su asistencia registrada.`
        : `No hay actividades del curso ${previous.label} en Franky: sube la memoria al archivo.`,
      ready: previousActivities.length > 0,
    },
  ];

  const tag = registryTag(course);
  const prepared = communityOps(data)
    .documents.filter((d) => d.tag === tag)
    .sort((a, b) => b.at.localeCompare(a.at))[0];

  return {
    course,
    previous,
    due,
    daysLeft: Math.max(0, daysBetween(today, due)),
    inSeason: month >= 9 && today <= due,
    share,
    previousActivities,
    items,
    ready: items.every((i) => i.ready),
    prepared,
  };
}

/* ------------------------------------------------------------------ */
/* Asistencia de la junta a sus reuniones                              */
/* ------------------------------------------------------------------ */

export type RepresentationRow = {
  seat: ProBoardSeat;
  memberId?: string;
  /** Reuniones celebradas desde que tiene el cargo. */
  sessions: number;
  attended: number;
  pct: number;
  meets: boolean;
};

/** Reuniones de junta ya celebradas, de la más antigua a la más reciente. */
export function boardSessions(assemblies: CommunityAssembly[]): CommunityAssembly[] {
  return assemblies
    .filter((a) => a.kind === "junta" && a.status === "cerrada")
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Asistencia de cada cargo a las reuniones de junta de su mandato. Solo
 * cuentan las reuniones desde el día en que empezó en el cargo.
 */
export function representationAttendance(data: ProData): RepresentationRow[] {
  const members = data.communityMembers as CommunityMember[];
  const sessions = boardSessions(communityOps(data).assemblies);
  return data.board.map((seat) => {
    const member = members.find((m) => sameName(m.name, seat.name));
    const mine = sessions.filter((s) => localDate(s.date) >= seat.since);
    const attended = member ? mine.filter((s) => s.presentIds.includes(member.id)).length : 0;
    const pct = mine.length ? Math.round((attended * 100) / mine.length) : 0;
    return {
      seat,
      memberId: member?.id,
      sessions: mine.length,
      attended,
      pct,
      meets: mine.length > 0 && attended * 100 >= mine.length * REPRESENTATION_MIN_PCT,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Memoria de un curso                                                 */
/* ------------------------------------------------------------------ */

export type CourseMemoryNumbers = {
  activities: number;
  attendance: number;
  verified: number;
  photos: number;
  ectsActivities: number;
};

/** Cifras de la memoria: asistencia con check-in y cuántas con cuenta verificada. */
export function courseMemoryNumbers(
  activities: CommunityActivity[],
  members: CommunityMember[],
): CourseMemoryNumbers {
  let attendance = 0;
  let verified = 0;
  for (const a of activities) {
    const roster = activityAttendees(a, members);
    const inside = checkedInSet(a, roster);
    const present = roster.filter((p) => inside.has(p.id));
    attendance += present.length;
    verified += present.filter((p) => p.verified).length;
  }
  return {
    activities: activities.length,
    attendance,
    verified,
    photos: activities.reduce((acc, a) => acc + (a.photos ?? 0), 0),
    ectsActivities: activities.filter((a) => a.ectsHours).length,
  };
}

/** Días hasta una fecha (negativo si ya pasó). */
export function daysUntil(now: Date, date: string): number {
  return daysBetween(localDate(now), date.slice(0, 10));
}
