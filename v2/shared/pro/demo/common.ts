import type {
  ProCampaign,
  ProClient,
  ProClientSource,
  ProData,
  ProInboxItem,
  ProReview,
  ProShift,
  ProSpace,
  ProStaff,
  ProVerticalId,
  ProWeekStat,
} from "../types";
import { addDays, atLocal, localDate, localMinutes } from "../format";

/** Generador pseudoaleatorio con semilla: la demo sale igual en cada visita. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

export function seedFor(vertical: ProVerticalId): number {
  return [...vertical].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 7) >>> 0;
}

const FIRST = [
  "Lucía", "Hugo", "Marta", "Pablo", "Carla", "Álex", "Paula", "Adrián", "Irene", "Sergio", "Nerea", "Javier",
  "Claudia", "Iván", "Sara", "Marcos", "Andrea", "Rubén", "Elena", "Mario", "Julia", "Nacho", "Laura", "Diego",
  "Noa", "Raúl", "Alba", "Óscar", "Inés", "Víctor", "Aitana", "Samuel", "Celia", "Jorge", "Lola", "Bruno",
  "Emma", "Gonzalo", "Vera", "Héctor", "Candela", "Tomás", "Martina", "Joel", "Ainhoa", "Leo", "Blanca", "Unai",
];
const LAST = [
  "García", "Martínez", "López", "Sánchez", "Pérez", "Gómez", "Ruiz", "Navarro", "Serrano", "Molina", "Ortega",
  "Soler", "Ferrer", "Pastor", "Llorca", "Mora", "Blasco", "Carbonell", "Vidal", "Íñiguez", "Esteve", "Castelló",
];
export const UNIVERSITIES = ["Universidad de Alicante", "Universidad Miguel Hernández", "CEU Cardenal Herrera"];
const FACULTIES_UA = [
  "Escuela Politécnica Superior", "Facultad de Económicas", "Facultad de Derecho", "Facultad de Ciencias",
  "Facultad de Educación", "Facultad de Filosofía y Letras", "Facultad de Ciencias de la Salud",
];
export const STUDIES = [
  "Ingeniería Informática", "ADE", "Derecho", "Enfermería", "Arquitectura", "Biología", "Magisterio",
  "Psicología", "Turismo", "Publicidad", "Química", "Traducción", "Criminología", "Nutrición",
];

export function personName(r: Rng): string {
  return `${r.pick(FIRST)} ${r.pick(LAST)}`;
}

export function shortName(full: string): string {
  const [first, last] = full.split(" ");
  return last ? `${first} ${last[0]}.` : first;
}

export function makeClients(r: Rng, now: Date, count: number, opts: { studentShare?: number; spendRange?: [number, number] } = {}): ProClient[] {
  const studentShare = opts.studentShare ?? 0.55;
  const [minSpend, maxSpend] = opts.spendRange ?? [1500, 42000];
  const sources: ProClientSource[] = ["franky", "franky", "hueco", "card", "instagram", "phone", "walkin", "google"];
  const today = localDate(now);
  const used = new Set<string>();
  const list: ProClient[] = [];
  for (let i = 0; i < count; i++) {
    let name = personName(r);
    while (used.has(name)) name = personName(r);
    used.add(name);
    const student = r.chance(studentShare);
    const visits = r.int(1, 18);
    const source = student ? r.pick(sources) : r.pick(["instagram", "phone", "walkin", "google", "franky"] as ProClientSource[]);
    list.push({
      id: `c${i + 1}`,
      name,
      phone: `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
      student: student
        ? { university: r.chance(0.78) ? UNIVERSITIES[0] : r.pick(UNIVERSITIES), faculty: r.pick(FACULTIES_UA), verified: r.chance(0.85) }
        : undefined,
      tags: [],
      visits,
      spentCents: Math.round((r.int(minSpend, maxSpend) * visits) / 6 / 100) * 100,
      lastVisit: atLocal(addDays(today, -r.int(1, 80)), r.int(10, 19) * 60),
      noShows: r.chance(0.12) ? r.int(1, 2) : 0,
      source,
      marketingConsent: r.chance(0.7),
      cardMember: student && r.chance(0.45),
      createdAt: atLocal(addDays(today, -r.int(20, 400)), 12 * 60),
    });
  }
  return list;
}

export type SpaceSeed = Omit<ProSpace, "id" | "demo" | "plan" | "vertical">;

export function makeSpace(vertical: ProVerticalId, seed: SpaceSeed): ProSpace {
  return { ...seed, id: `demo-${vertical}`, vertical, demo: true, plan: "founder" };
}

export function makeReviews(r: Rng, now: Date, texts: string[]): ProReview[] {
  const today = localDate(now);
  return texts.map((text, i) => {
    const name = personName(r);
    return {
      id: `rv${i + 1}`,
      clientName: shortName(name),
      university: r.chance(0.7) ? UNIVERSITIES[0] : undefined,
      rating: i === texts.length - 1 ? 4 : r.chance(0.8) ? 5 : 4,
      text,
      // Desde ayer hacia atrás: una reseña de hoy a las 18:00 saldría en el futuro.
      at: atLocal(addDays(today, -(i * 3 + 1 + r.int(0, 2))), 18 * 60),
      verifiedVisit: true,
      reply: i % 3 === 1 ? "¡Gracias por venir! Te esperamos pronto." : undefined,
    };
  });
}

/** Fichajes: hoy los que ya han entrado, y la semana pasada completa. */
export function makeShifts(staff: ProStaff[], now: Date, open: number, close: number): ProShift[] {
  const today = localDate(now);
  const shifts: ProShift[] = [];
  for (let d = 6; d >= 1; d--) {
    const date = addDays(today, -d);
    staff.forEach((s, i) => {
      if ((d + i) % 6 === 0) return;
      // Jornadas de unas 8 horas con turnos escalonados, no de apertura a cierre.
      const late = (d + i) % 2 === 1 && close - open > 9 * 60;
      const start = late ? close - 8 * 60 - 20 : open - 10 + i * 3;
      shifts.push({
        id: `sh-${s.id}-${date}`,
        staffId: s.id,
        date,
        inAt: atLocal(date, start),
        outAt: atLocal(date, Math.min(close + 5, start + 8 * 60 + 30 + ((d + i) % 3) * 5)),
        breakMinutes: 30,
      });
    });
  }
  const nowMin = localMinutes(now);
  staff.forEach((s, i) => {
    if (s.clockedInAt) {
      shifts.push({ id: `sh-${s.id}-${today}`, staffId: s.id, date: today, inAt: s.clockedInAt, outAt: null, breakMinutes: 0 });
    } else if (nowMin > open + 60 && i === staff.length - 1) {
      // Alguien que libra hoy no ficha.
    }
  });
  return shifts;
}

export function clockIn(date: string, open: number, idx: number, now: Date): string | null {
  const nowMin = localMinutes(now);
  if (nowMin < open - 15) return null;
  return atLocal(date, Math.min(nowMin, open - 8 + idx * 4));
}

export function makeCampaigns(now: Date, items: Omit<ProCampaign, "id">[]): ProCampaign[] {
  void now;
  return items.map((c, i) => ({ ...c, id: `cp${i + 1}` }));
}

export type InboxSeed = Omit<ProInboxItem, "id" | "at" | "read"> & { minutesAgo: number; read?: boolean };

export function inbox(now: Date, items: InboxSeed[]): ProInboxItem[] {
  return items.map((it, i) => ({
    id: `in${i + 1}`,
    at: new Date(now.getTime() - it.minutesAgo * 60000).toISOString(),
    kind: it.kind,
    title: it.title,
    body: it.body,
    href: it.href,
    read: it.read ?? false,
  }));
}

/** Datos vacíos de todos los motores; cada demo rellena lo suyo encima. */
export function emptyData(space: ProSpace): ProData {
  return {
    space,
    history: [],
    staff: [],
    clients: [],
    offers: [],
    reviews: [],
    shifts: [],
    groupRequests: [],
    inbox: [],
    campaigns: [],
    services: [],
    bookings: [],
    payments: [],
    tables: [],
    menu: [],
    dailyMenu: null,
    loyalty: null,
    validations: [],
    events: [],
    promoters: [],
    guests: [],
    zones: [],
    classTypes: [],
    sessions: [],
    plans: [],
    members: [],
    resources: [],
    openMatches: [],
    properties: [],
    leads: [],
    visits: [],
    tenants: [],
    incidents: [],
    communityMembers: [],
    activities: [],
    announcements: [],
    sponsors: [],
    board: [],
    subsidies: [],
    uniMetrics: [],
    uniPublications: [],
    uniWelcome: [],
    uniHousing: [],
    uniAssociations: [],
    uniModeration: [],
  };
}

/**
 * Ocho semanas de historia con una tendencia creíble: arranca bajo y crece a
 * medida que el negocio usa Franky. `base` es el total semanal típico.
 */
export function makeHistory(r: Rng, now: Date, base: number, frankyShare: number, ticketCents: number): ProWeekStat[] {
  const today = localDate(now);
  const monday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 8 }, (_, i) => {
    const growth = 0.55 + (i / 7) * 0.45;
    const total = Math.round(base * (0.9 + r.next() * 0.2));
    const franky = Math.round(total * frankyShare * growth);
    return {
      week: addDays(monday, -7 * (7 - i)),
      franky,
      total,
      revenueCents: Math.round(total * ticketCents * (0.95 + r.next() * 0.1)),
    };
  });
}

/** Semana laboral típica: lunes a sábado con horario partido o continuo. */
export function weekHours(open: number, close: number, opts: { saturday?: [number, number] | null; sunday?: [number, number] | null; closedMonday?: boolean } = {}) {
  const day = { open, close };
  return [
    opts.closedMonday ? null : day,
    day,
    day,
    day,
    day,
    opts.saturday === undefined ? { open, close: Math.min(close, 14 * 60) } : opts.saturday ? { open: opts.saturday[0], close: opts.saturday[1] } : null,
    opts.sunday ? { open: opts.sunday[0], close: opts.sunday[1] } : null,
  ];
}
