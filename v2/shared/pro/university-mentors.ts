/**
 * Mentores de primero: estudiantes de cursos superiores que acompañan a
 * quien acaba de llegar. El servicio da de alta a los mentores, empareja cada
 * petición con alguien de su facultad y ve cifras; la conversación es entre
 * las dos personas en el chat de Franky y el servicio nunca la ve.
 */

import type { ProData } from "./types";
import type { ProUniMentor, ProUniMentorRequest } from "./university-types";
import { addDays, localDate, pct } from "./format";
import { PRIVACY_MIN_GROUP, uniExtrasOf } from "./university";

export type MentorData = { mentors: ProUniMentor[]; requests: ProUniMentorRequest[] };

export function mentorsOf(data: Pick<ProData, "uniExtras">): MentorData {
  const extras = uniExtrasOf(data);
  return { mentors: extras.mentors ?? [], requests: extras.mentorRequests ?? [] };
}

export function withMentors(data: ProData, fn: (m: MentorData) => Partial<MentorData>): ProData {
  const extras = uniExtrasOf(data);
  const next = fn(mentorsOf(data));
  return {
    ...data,
    uniExtras: {
      ...extras,
      mentors: next.mentors ?? extras.mentors ?? [],
      mentorRequests: next.requests ?? extras.mentorRequests ?? [],
    },
  };
}

export const MENTOR_YEAR_LABEL: Record<number, string> = {
  2: "Segundo",
  3: "Tercero",
  4: "Cuarto",
  5: "Máster",
};

/** Personas de primero que acompaña ahora mismo. */
export function mentorLoad(mentor: ProUniMentor, requests: ProUniMentorRequest[]): number {
  return requests.filter((r) => r.status === "matched" && r.mentorId === mentor.id).length;
}

export function hasRoom(mentor: ProUniMentor, requests: ProUniMentorRequest[]): boolean {
  return mentor.active && mentorLoad(mentor, requests) < mentor.capacity;
}

/**
 * Mentor para una petición: de su facultad, activo, con hueco y el menos
 * cargado (a igualdad, el que lleva más tiempo). null si no hay nadie libre.
 */
export function pickMentor(
  mentors: ProUniMentor[],
  requests: ProUniMentorRequest[],
  request: Pick<ProUniMentorRequest, "faculty">,
): ProUniMentor | null {
  const candidates = mentors
    .filter((m) => m.faculty === request.faculty && hasRoom(m, requests))
    .sort(
      (a, b) =>
        mentorLoad(a, requests) - mentorLoad(b, requests) ||
        a.since.localeCompare(b.since) ||
        a.name.localeCompare(b.name),
    );
  return candidates[0] ?? null;
}

export type MatchResult = {
  requests: ProUniMentorRequest[];
  matched: number;
  /** Facultades donde queda gente esperando porque no hay mentor libre. */
  withoutMentor: string[];
};

/**
 * Empareja de una vez a todo el que espera, del que más lleva esperando al que
 * menos, con la regla de `pickMentor`.
 */
export function autoMatch(
  mentors: ProUniMentor[],
  requests: ProUniMentorRequest[],
  now: Date,
): MatchResult {
  let next = [...requests];
  let matched = 0;
  const withoutMentor = new Set<string>();
  const waiting = next
    .filter((r) => r.status === "waiting")
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const r of waiting) {
    const mentor = pickMentor(mentors, next, r);
    if (!mentor) {
      withoutMentor.add(r.faculty);
      continue;
    }
    next = next.map((x) =>
      x.id === r.id
        ? { ...x, status: "matched", mentorId: mentor.id, matchedAt: now.toISOString() }
        : x,
    );
    matched += 1;
  }
  return { requests: next, matched, withoutMentor: [...withoutMentor].sort() };
}

/** Asigna una petición a un mentor concreto (o la cambia de mentor). */
export function assignMentor(
  requests: ProUniMentorRequest[],
  requestId: string,
  mentorId: string,
  now: Date,
): ProUniMentorRequest[] {
  return requests.map((r) =>
    r.id === requestId
      ? { ...r, status: "matched", mentorId, matchedAt: now.toISOString(), talked: false }
      : r,
  );
}

/**
 * Pausar a un mentor: deja de recibir gente nueva. Si `release` es true, las
 * personas que acompañaba vuelven a la cola para darles otro.
 */
export function pauseMentor(
  data: MentorData,
  mentorId: string,
  release: boolean,
): MentorData {
  return {
    mentors: data.mentors.map((m) => (m.id === mentorId ? { ...m, active: false } : m)),
    requests: release
      ? data.requests.map((r) =>
          r.mentorId === mentorId && r.status === "matched"
            ? { ...r, status: "waiting", mentorId: undefined, matchedAt: undefined, talked: false }
            : r,
        )
      : data.requests,
  };
}

/** Días que lleva esperando una petición. */
export function waitingDays(r: ProUniMentorRequest, now: Date): number {
  const from = localDate(r.at);
  const to = localDate(now);
  return Math.max(
    0,
    Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000),
  );
}

export type FacultyMentoring = {
  faculty: string;
  mentors: number;
  /** Plazas libres entre todos los mentores activos. */
  room: number;
  waiting: number;
  matched: number;
  /** De los emparejados, cuántos ya se han escrito. */
  talked: number;
  talkedPct: number;
  /** Menos de 10 emparejados: el porcentaje no se enseña. */
  hidden: boolean;
};

/** Cifras por facultad, sin nombres de primero. */
export function mentoringByFaculty(data: MentorData): FacultyMentoring[] {
  const faculties = new Set([
    ...data.mentors.map((m) => m.faculty),
    ...data.requests.map((r) => r.faculty),
  ]);
  return [...faculties]
    .map((faculty) => {
      const mentors = data.mentors.filter((m) => m.faculty === faculty && m.active);
      const requests = data.requests.filter((r) => r.faculty === faculty);
      const matched = requests.filter((r) => r.status === "matched");
      const talked = matched.filter((r) => r.talked).length;
      return {
        faculty,
        mentors: mentors.length,
        room: mentors.reduce((a, m) => a + Math.max(0, m.capacity - mentorLoad(m, data.requests)), 0),
        waiting: requests.filter((r) => r.status === "waiting").length,
        matched: matched.length,
        talked,
        talkedPct: pct(talked, matched.length),
        hidden: matched.length < PRIVACY_MIN_GROUP,
      };
    })
    .sort((a, b) => b.waiting - a.waiting || b.matched - a.matched || a.faculty.localeCompare(b.faculty));
}

/** Emparejados hace más de `days` días que aún no se han escrito. */
export function silentMatches(requests: ProUniMentorRequest[], now: Date, days = 5) {
  const limit = addDays(localDate(now), -days);
  return requests.filter(
    (r) => r.status === "matched" && !r.talked && r.matchedAt && localDate(r.matchedAt) <= limit,
  );
}
