import type {
  ProCommissionRule,
  ProData,
  ProEvent,
  ProGroupRequest,
  ProGuest,
  ProOffer,
  ProPromoter,
  ProShift,
  ProStaff,
  ProTicketTier,
  ProVerticalId,
  ProZone,
  ToneKey,
} from "../types";
import { addDays, atLocal, weekdayIndex } from "../format";
import { commissionFor, nightOf } from "../night";
import { seedClubOps, seedPubOps } from "./night-ops";
import {
  emptyData,
  inbox,
  makeCampaigns,
  makeClients,
  makeHistory,
  makeReviews,
  makeSpace,
  personName,
  rng,
  seedFor,
  UNIVERSITIES,
  type Rng,
} from "./common";

/* ------------------------------------------------------------------ */
/* Piezas comunes                                                      */
/* ------------------------------------------------------------------ */

const ERASMUS_NAMES = [
  "Lukas Weber", "Chiara Rossi", "Emma Dubois", "Jan Kowalski", "Sofia Bianchi", "Lena Müller", "Tom Janssen",
  "Aino Virtanen", "Matteo Conti", "Julie Martin", "Anna Novak", "Pieter de Vries", "Marie Leroy", "Giulia Ferri",
  "Jonas Schmidt", "Eva Horváth", "Liam O'Brien", "Klara Nowak", "Hannah Fischer", "Luca Moretti",
];

function pickUni(r: Rng): string {
  const x = r.next();
  return x < 0.7 ? UNIVERSITIES[0] : x < 0.92 ? UNIVERSITIES[1] : UNIVERSITIES[2];
}

/** Próxima fecha (incluida `from`) que cae en `weekday` (0 = lunes). */
function nextWeekday(from: string, weekday: number): string {
  return addDays(from, (weekday - weekdayIndex(from) + 7) % 7);
}

/** Última fecha estrictamente anterior a `from` que cae en `weekday`. */
function prevWeekday(from: string, weekday: number): string {
  const back = (weekdayIndex(from) - weekday + 7) % 7 || 7;
  return addDays(from, -back);
}

type TierSeed = { name: string; priceCents: number; quantity: number; target: number; door?: boolean; includes?: string; closesDaysBefore?: number };

type EventSeed = {
  id: string;
  name: string;
  date: string;
  doors: number;
  /** Minutos desde la medianoche del día siguiente (o del mismo si es > doors). */
  close: number;
  capacity: number;
  poster: ToneKey;
  crushLive: boolean;
  lineup?: string;
  organizer?: string;
  tiers: TierSeed[];
  list: number;
  /** Hora de corte de lista (minutos del día siguiente si es menor que doors). */
  listCutoff?: number;
  reserved: number;
  walkIns: number;
  draft?: boolean;
  erasmus?: boolean;
};

type Built = { event: ProEvent; guests: ProGuest[] };

function instantAfter(date: string, doors: number, minute: number): string {
  // Si la hora es menor que la de apertura, es del día siguiente (la noche cruza la medianoche).
  return minute > doors ? atLocal(date, minute) : atLocal(addDays(date, 1), minute);
}

/**
 * Genera un evento con sus asistentes. Las ventas crecen según se acerca la
 * fecha, y en la noche en curso cada persona tiene su hora de llegada: solo
 * aparecen dentro las que ya han llegado a esta hora.
 */
function buildEvent(r: Rng, seed: EventSeed, now: Date, promoters: { id: string; weight: number }[]): Built {
  const night = nightOf(now);
  const daysAway = Math.round((new Date(`${seed.date}T12:00:00Z`).getTime() - new Date(`${night}T12:00:00Z`).getTime()) / 86400000);
  const doorsOpen = atLocal(seed.date, seed.doors);
  const closes = instantAfter(seed.date, seed.doors, seed.close);
  const cutoff = seed.listCutoff !== undefined ? instantAfter(seed.date, seed.doors, seed.listCutoff) : undefined;
  const doorsMs = new Date(doorsOpen).getTime();
  const cutoffMs = cutoff ? new Date(cutoff).getTime() : null;
  const past = now.getTime() >= new Date(closes).getTime();
  const progress = seed.draft ? 0 : daysAway <= 0 ? 1 : Math.max(0.28, 1 - daysAway * 0.1);
  const totalWeight = promoters.reduce((a, p) => a + p.weight, 0);
  const pickPromoter = () => {
    let x = r.next() * totalWeight;
    for (const p of promoters) {
      x -= p.weight;
      if (x <= 0) return p.id;
    }
    return promoters[0]?.id;
  };
  const nameFor = () => (seed.erasmus && r.chance(0.7) ? r.pick(ERASMUS_NAMES) : personName(r));

  /** Hora de llegada: pico hacia la hora y media de abrir, más tarde para la taquilla. */
  const arrival = (kind: "ticket" | "list" | "reserved" | "door") => {
    const tri = (r.next() + r.next()) / 2;
    let min = kind === "door" ? 90 + tri * 170 : kind === "reserved" ? 45 + tri * 120 : 8 + tri * 210;
    if (kind === "list" && cutoffMs) {
      const limit = (cutoffMs - doorsMs) / 60000;
      if (min > limit || r.chance(0.35)) min = Math.max(5, limit - r.int(2, 55));
    }
    return doorsMs + Math.round(min) * 60000;
  };
  const showRate = { ticket: 0.91, list: 0.63, reserved: 0.96, door: 1 };

  const guests: ProGuest[] = [];
  let n = 0;
  const addGuest = (kind: "ticket" | "list" | "reserved", tierName: string | undefined, arrivalKind: "ticket" | "list" | "reserved" | "door", promoterChance: number) => {
    const at = arrival(arrivalKind);
    const shows = r.chance(showRate[arrivalKind]);
    const inside = !seed.draft && shows && (past || at <= now.getTime());
    const uni = r.chance(seed.erasmus ? 0.92 : 0.8) ? pickUni(r) : undefined;
    n++;
    guests.push({
      id: `${seed.id}-g${n}`,
      name: nameFor(),
      eventId: seed.id,
      kind,
      tierName,
      promoterId: promoters.length && r.chance(promoterChance) ? pickPromoter() : undefined,
      checkedInAt: inside ? new Date(at).toISOString() : null,
      age18: inside ? true : r.chance(0.95),
      university: uni,
    });
    return at;
  };

  const tiers: ProTicketTier[] = seed.tiers.map((t, i) => {
    let sold = 0;
    if (t.door) {
      // La taquilla se vende en la puerta: solo cuenta quien ya ha pagado.
      for (let k = 0; k < t.target; k++) {
        const at = arrival("door");
        if (past || at <= now.getTime()) {
          n++;
          guests.push({
            id: `${seed.id}-g${n}`,
            name: nameFor(),
            eventId: seed.id,
            kind: "ticket",
            tierName: t.name,
            checkedInAt: new Date(at).toISOString(),
            age18: true,
            university: r.chance(0.6) ? pickUni(r) : undefined,
          });
          sold++;
        }
      }
    } else {
      const share = i === 0 ? Math.min(1, progress * 1.5) : progress;
      sold = Math.min(t.quantity, Math.round(t.target * share));
      for (let k = 0; k < sold; k++) addGuest("ticket", t.name, "ticket", 0.52);
    }
    return {
      id: `${seed.id}-t${i + 1}`,
      name: t.name,
      priceCents: t.priceCents,
      quantity: t.quantity,
      sold,
      until: t.door ? null : t.closesDaysBefore !== undefined ? atLocal(addDays(seed.date, -t.closesDaysBefore), 20 * 60) : doorsOpen,
      includes: t.includes,
    };
  });

  const listSize = Math.round(seed.list * progress);
  for (let k = 0; k < listSize; k++) addGuest("list", undefined, "list", 0.88);
  const reservedSize = Math.round(seed.reserved * progress);
  for (let k = 0; k < reservedSize; k++) addGuest("reserved", `VIP ${1 + (k % 6)}`, "reserved", 0);

  // Entrada libre (pubs): gente que llega sin lista. Crece durante la noche.
  const liveShare = past ? 1 : now.getTime() > doorsMs ? Math.min(1, (now.getTime() - doorsMs) / (new Date(closes).getTime() - doorsMs) * 1.6) : 0;
  const walkIns = Math.round(seed.walkIns * liveShare);

  const checked = guests.filter((g) => g.checkedInAt).length;
  const event: ProEvent = {
    id: seed.id,
    name: seed.name,
    date: seed.date,
    doorsOpen,
    closes,
    capacity: seed.capacity,
    checkedIn: checked + walkIns,
    tiers,
    listCutoff: cutoff,
    ageMin: 18,
    status: seed.draft ? "draft" : past ? "past" : daysAway === 0 ? "tonight" : "on_sale",
    crushLive: seed.crushLive,
    poster: seed.poster,
    lineup: seed.lineup,
    walkIns,
    organizer: seed.organizer,
  };
  if (seed.crushLive && !seed.draft) {
    // Crush Live de ejemplo: quién juega entre los que han entrado (o se han apuntado).
    const soldNow = tiers.reduce((a, t) => a + t.sold, 0);
    const players = event.checkedIn ? Math.round(event.checkedIn * 0.41) : Math.round(soldNow * 0.34);
    event.crush = { players, matches: event.checkedIn ? Math.round(players * 0.23) : 0 };
  }
  return { event, guests };
}

function nightShifts(staff: ProStaff[], now: Date, openDays: number[], inMin: number, outMin: number): ProShift[] {
  const night = nightOf(now);
  const shifts: ProShift[] = [];
  for (let d = 7; d >= 1; d--) {
    const date = addDays(night, -d);
    if (!openDays.includes(weekdayIndex(date))) continue;
    staff.forEach((s, i) => {
      if (s.role === "owner" && d % 2 === 0) return;
      shifts.push({
        id: `sh-${s.id}-${date}`,
        staffId: s.id,
        date,
        inAt: atLocal(date, inMin + i * 5),
        outAt: atLocal(addDays(date, 1), outMin - i * 5),
        breakMinutes: 20,
      });
    });
  }
  staff.forEach((s) => {
    if (s.clockedInAt) shifts.push({ id: `sh-${s.id}-${night}`, staffId: s.id, date: night, inAt: s.clockedInAt, outAt: null, breakMinutes: 0 });
  });
  return shifts;
}

function finishStaff(staff: ProStaff[], shifts: ProShift[]) {
  staff.forEach((s) => {
    s.weekMinutes = shifts
      .filter((sh) => sh.staffId === s.id && sh.outAt)
      .reduce((a, sh) => a + (new Date(sh.outAt as string).getTime() - new Date(sh.inAt).getTime()) / 60000 - sh.breakMinutes, 0);
  });
}

function syncPromoters(promoters: ProPromoter[], guests: ProGuest[]) {
  for (const p of promoters) {
    const own = guests.filter((g) => g.promoterId === p.id);
    p.sold = own.filter((g) => g.kind === "ticket").length;
    p.listSize = own.filter((g) => g.kind === "list").length;
    p.checkedIn = own.filter((g) => g.checkedInAt).length;
    const perEvent = new Map<string, number>();
    own.filter((g) => g.checkedInAt).forEach((g) => perEvent.set(g.eventId, (perEvent.get(g.eventId) ?? 0) + 1));
    p.commissionCents = [...perEvent.values()].reduce((a, scanned) => a + commissionFor(p.spec, scanned), 0);
  }
}

/* ------------------------------------------------------------------ */
/* Discoteca: Sala Aurora                                              */
/* ------------------------------------------------------------------ */

const PER_SCAN: ProCommissionRule = { kind: "per_scan", cents: 100 };
const TIERED: ProCommissionRule = { kind: "tiers", upTo: 25, lowCents: 50, highCents: 150 };

const CLUB_PROMOTERS: { name: string; uni: string; studies: string; code: string; spec: ProCommissionRule; weight: number; active?: boolean }[] = [
  { name: "Hugo Llorca", uni: UNIVERSITIES[0], studies: "ADE", code: "hugo26", spec: TIERED, weight: 16 },
  { name: "Carla Mora", uni: UNIVERSITIES[0], studies: "Publicidad", code: "carla26", spec: PER_SCAN, weight: 13 },
  { name: "Adrián Ferrer", uni: UNIVERSITIES[1], studies: "Derecho", code: "adri26", spec: PER_SCAN, weight: 10 },
  { name: "Nerea Soler", uni: UNIVERSITIES[0], studies: "Turismo", code: "nerea26", spec: TIERED, weight: 9 },
  { name: "Iván Castelló", uni: UNIVERSITIES[0], studies: "Ingeniería Informática", code: "ivan26", spec: PER_SCAN, weight: 7 },
  { name: "Paula Blasco", uni: UNIVERSITIES[1], studies: "Psicología", code: "paula26", spec: PER_SCAN, weight: 6 },
  { name: "Joel Serrano", uni: UNIVERSITIES[0], studies: "Criminología", code: "joel26", spec: TIERED, weight: 4 },
  { name: "Martina Vidal", uni: UNIVERSITIES[0], studies: "Magisterio", code: "martina26", spec: PER_SCAN, weight: 2, active: false },
];

function buildClub(vertical: ProVerticalId, now: Date): ProData {
  const r = rng(seedFor(vertical));
  const night = nightOf(now);
  const space = makeSpace(vertical, {
    name: "Sala Aurora",
    city: "Alicante",
    address: "Muelle de Levante 6, Puerto de Alicante",
    slug: "sala-aurora",
    owner: { name: "Nacho Berenguer", firstName: "Nacho" },
    hours: [null, null, { open: 23 * 60 + 30, close: 6 * 60 }, { open: 23 * 60 + 30, close: 6 * 60 }, { open: 23 * 60 + 30, close: 6 * 60 + 30 }, { open: 23 * 60 + 30, close: 6 * 60 + 30 }, null],
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 22,
    rating: 4.5,
    reviewsCount: 684,
    publicProfile: {
      description: "Sala de 900 personas en el Puerto. Jueves universitario, fiestas de facultad y Crush Live en las pantallas.",
      photos: 16,
      bookingEnabled: true,
      cardEnabled: true,
      cardDiscountPct: 10,
    },
  });

  const promoters: ProPromoter[] = CLUB_PROMOTERS.map((p, i) => ({
    id: `rp${i + 1}`,
    name: p.name,
    university: p.uni,
    code: p.code,
    listSize: 0,
    sold: 0,
    checkedIn: 0,
    commissionCents: 0,
    rule: "",
    active: p.active ?? true,
    spec: p.spec,
    phone: `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
    since: atLocal(addDays(night, -r.int(30, 400)), 12 * 60),
    settledEventIds: [],
    payouts: [
      { at: atLocal(addDays(night, -weekdayIndex(night)), 11 * 60), amountCents: r.int(18, 70) * 100, scanned: r.int(20, 60) },
    ],
  }));
  const weights = CLUB_PROMOTERS.map((p, i) => ({ id: `rp${i + 1}`, weight: (p.active ?? true) ? p.weight : 0.5 }));

  const juevesDate = nextWeekday(night, 3);
  const seeds: EventSeed[] = [
    {
      id: "ev-jueves",
      name: "Jueves Universitario",
      date: juevesDate,
      doors: 23 * 60 + 30,
      close: 6 * 60,
      capacity: 900,
      poster: "violet",
      crushLive: true,
      lineup: "Residentes Aurora: Dani Vives b2b Clara M.",
      tiers: [
        { name: "Anticipada", priceCents: 800, quantity: 250, target: 250, closesDaysBefore: 1, includes: "Entrada y copa antes de la 1:00" },
        { name: "Segunda", priceCents: 1000, quantity: 300, target: 214, includes: "Entrada y copa" },
        { name: "Taquilla", priceCents: 1200, quantity: 150, target: 110, door: true, includes: "Entrada y copa" },
      ],
      list: 290,
      listCutoff: 90,
      reserved: 42,
      walkIns: 0,
    },
    {
      id: "ev-erasmus",
      name: "Welcome Erasmus con ESN",
      date: nextWeekday(night, 2),
      doors: 23 * 60 + 30,
      close: 5 * 60 + 30,
      capacity: 900,
      poster: "sky",
      crushLive: true,
      lineup: "Dress code: la bandera de tu país",
      organizer: "ESN Alicante",
      erasmus: true,
      tiers: [
        { name: "Con ESNcard", priceCents: 600, quantity: 250, target: 250, closesDaysBefore: 0 },
        { name: "General", priceCents: 900, quantity: 250, target: 180 },
        { name: "Taquilla", priceCents: 1200, quantity: 100, target: 70, door: true },
      ],
      list: 120,
      listCutoff: 60,
      reserved: 18,
      walkIns: 0,
    },
    {
      id: "ev-eco",
      name: "Fiesta de Económicas",
      date: nextWeekday(night, 5),
      doors: 23 * 60 + 45,
      close: 6 * 60 + 30,
      capacity: 900,
      poster: "amber",
      crushLive: false,
      lineup: "Con la Delegación de Económicas UA",
      organizer: "Delegación de Económicas UA",
      tiers: [
        { name: "Anticipada", priceCents: 1000, quantity: 300, target: 300, closesDaysBefore: 2 },
        { name: "Segunda", priceCents: 1200, quantity: 250, target: 190 },
        { name: "Taquilla", priceCents: 1500, quantity: 100, target: 60, door: true },
      ],
      list: 80,
      listCutoff: 60,
      reserved: 36,
      walkIns: 0,
    },
    {
      id: "ev-past-thu",
      name: "Jueves Universitario",
      date: prevWeekday(night, 3),
      doors: 23 * 60 + 30,
      close: 6 * 60,
      capacity: 900,
      poster: "violet",
      crushLive: true,
      lineup: "Residentes Aurora",
      tiers: [
        { name: "Anticipada", priceCents: 800, quantity: 250, target: 250, closesDaysBefore: 1 },
        { name: "Segunda", priceCents: 1000, quantity: 300, target: 268 },
        { name: "Taquilla", priceCents: 1200, quantity: 150, target: 96, door: true },
      ],
      list: 310,
      listCutoff: 90,
      reserved: 40,
      walkIns: 0,
    },
    {
      id: "ev-past-sat",
      name: "Fiesta de Bienvenida UA",
      date: prevWeekday(night, 5),
      doors: 23 * 60 + 45,
      close: 6 * 60 + 30,
      capacity: 900,
      poster: "emerald",
      crushLive: true,
      lineup: "Fiesta de inicio de curso",
      tiers: [
        { name: "Anticipada", priceCents: 1000, quantity: 300, target: 300, closesDaysBefore: 2 },
        { name: "Segunda", priceCents: 1200, quantity: 250, target: 250 },
        { name: "Taquilla", priceCents: 1500, quantity: 100, target: 64, door: true },
      ],
      list: 120,
      listCutoff: 60,
      reserved: 34,
      walkIns: 0,
    },
    {
      id: "ev-draft",
      name: "Fiesta fin de parciales",
      date: addDays(juevesDate, 21),
      doors: 23 * 60 + 30,
      close: 6 * 60,
      capacity: 900,
      poster: "rose",
      crushLive: true,
      tiers: [
        { name: "Anticipada", priceCents: 800, quantity: 250, target: 0 },
        { name: "Segunda", priceCents: 1000, quantity: 300, target: 0 },
        { name: "Taquilla", priceCents: 1200, quantity: 150, target: 0, door: true },
      ],
      list: 0,
      listCutoff: 90,
      reserved: 0,
      walkIns: 0,
      draft: true,
    },
  ];

  const built = seeds.map((s) => buildEvent(r, s, now, weights));
  const events: ProEvent[] = built.map((b) => b.event);
  const guests = built.flatMap((b) => b.guests);

  // Las noches de hace más de una semana ya están liquidadas.
  promoters.forEach((p) => {
    p.settledEventIds = events.filter((e) => e.date < addDays(night, -8)).map((e) => e.id);
  });
  syncPromoters(promoters, guests);
  promoters.forEach((p) => {
    p.rule = p.spec?.kind === "per_scan" ? "1 € por entrada escaneada" : "Tramos: 0,50 € hasta 25, 1,50 € desde la 26";
  });

  // Reservados de la próxima noche (la de hoy o la siguiente).
  const focus = events.filter((e) => e.status === "tonight" || e.status === "on_sale").sort((a, b) => a.doorsOpen.localeCompare(b.doorsOpen))[0];
  const live = focus && now.getTime() >= new Date(focus.doorsOpen).getTime();
  const zoneArrived = (min: number) => Boolean(live && focus && now.getTime() >= new Date(focus.doorsOpen).getTime() + min * 60000);
  const zones: ProZone[] = [
    { id: "z1", name: "VIP 1", capacity: 10, minimumSpendCents: 25000, depositCents: 7500, bookedBy: "Lucía García", people: 10, status: zoneArrived(70) ? "arrived" : "booked", birthday: true, phone: "644 218 903", note: "Cumple de Lucía, 21. Bengala con la botella.", eventId: focus?.id },
    { id: "z2", name: "VIP 2", capacity: 8, minimumSpendCents: 18000, depositCents: 5000, bookedBy: "Delegación de Enfermería", people: 8, status: zoneArrived(40) ? "arrived" : "booked", phone: "655 902 144", note: "Fin de prácticas de 4º.", eventId: focus?.id },
    { id: "z3", name: "VIP 3", capacity: 8, minimumSpendCents: 15000, depositCents: 5000, bookedBy: "Marcos Ruiz", people: 7, status: "held", phone: "622 407 518", note: "Pendiente de la señal por Bizum.", eventId: focus?.id },
    { id: "z4", name: "VIP 4", capacity: 12, minimumSpendCents: 30000, depositCents: 10000, status: "free", eventId: focus?.id },
    { id: "z5", name: "VIP 5", capacity: 15, minimumSpendCents: 40000, depositCents: 10000, bookedBy: "Club de Rugby UA", people: 14, status: zoneArrived(95) ? "arrived" : "booked", phone: "611 553 870", eventId: focus?.id },
    { id: "z6", name: "VIP 6", capacity: 6, minimumSpendCents: 15000, depositCents: 5000, status: "free", eventId: focus?.id },
  ];

  const staff: ProStaff[] = [
    { id: "s1", name: "Nacho Berenguer", role: "owner", tone: "violet", title: "Dueño", commissionPct: 0, phone: "600 000 000", clockedInAt: null, weekMinutes: 0 },
    { id: "s2", name: "Toni Carbonell", role: "manager", tone: "slate", title: "Encargado de sala", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
    { id: "s3", name: "Kike Martínez", role: "reception", tone: "sky", title: "Jefe de puerta", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
    { id: "s4", name: "Samuel Ortega", role: "reception", tone: "teal", title: "Portero", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
    { id: "s5", name: "Ana Llorca", role: "reception", tone: "amber", title: "Taquilla y guardarropa", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
    { id: "s6", name: "Alba Pastor", role: "rrpp", tone: "rose", title: "Jefa de RRPP", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
  ];
  if (live && focus) {
    staff.forEach((s, i) => {
      s.clockedInAt = new Date(new Date(focus.doorsOpen).getTime() - (60 - i * 6) * 60000).toISOString();
    });
  }
  const shifts = nightShifts(staff, now, [2, 3, 4, 5], 22 * 60 + 45, 6 * 60 + 30);
  finishStaff(staff, shifts);

  const offers: ProOffer[] = [
    {
      id: "o1",
      kind: "valley",
      title: "Jueves universitario",
      detail: "Gratis con lista antes de la 1:30 y anticipada a 8 € con copa",
      discountPct: 100,
      days: [3],
      fromMinute: 23 * 60 + 30,
      toMinute: 90,
      slots: 300,
      claimed: 241,
      audience: { studentsOnly: true, radiusKm: 10, universities: [UNIVERSITIES[0], UNIVERSITIES[1]] },
      status: "live",
      reach: 11800,
      views: 4210,
      bookings: 612,
      revenueCents: 498000,
      createdAt: atLocal(addDays(night, -45), 12 * 60),
    },
    {
      id: "o2",
      kind: "group",
      title: "Cumpleaños en Aurora",
      detail: "Entrada gratis para quien cumple y 20 % en la botella del reservado",
      discountPct: 20,
      slots: 6,
      claimed: 4,
      audience: { studentsOnly: false, radiusKm: 15, universities: [] },
      status: "live",
      reach: 6400,
      views: 1130,
      bookings: 19,
      revenueCents: 412000,
      createdAt: atLocal(addDays(night, -60), 12 * 60),
    },
    {
      id: "o3",
      kind: "card",
      title: "Franky Card",
      detail: "2x1 en la primera copa antes de la 1:00",
      discountPct: 50,
      slots: 0,
      claimed: 0,
      audience: { studentsOnly: false, radiusKm: 50, universities: [] },
      status: "live",
      reach: 14200,
      views: 3900,
      bookings: 388,
      revenueCents: 0,
      createdAt: atLocal(addDays(night, -80), 12 * 60),
    },
  ];

  const groupRequests: ProGroupRequest[] = [
    {
      id: "g1",
      organizer: "Irene Navarro",
      organization: "Cumpleaños",
      kind: "Cumpleaños (22)",
      people: 9,
      date: focus?.doorsOpen ?? atLocal(juevesDate, 23 * 60 + 30),
      budgetPerPersonCents: 2500,
      message: "Cumplo 22 y vamos 9 de Publicidad. ¿Nos guardáis un reservado con botella? Llegamos sobre la 1.",
      status: "new",
      createdAt: new Date(now.getTime() - 38 * 60000).toISOString(),
    },
    {
      id: "g2",
      organizer: "Jonas Schmidt",
      organization: "Despedida Erasmus",
      kind: "Despedida de Erasmus",
      people: 12,
      date: atLocal(nextWeekday(night, 2), 23 * 60 + 30),
      budgetPerPersonCents: 2000,
      message: "We are 12 Erasmus leaving Alicante. Queremos el reservado más cerca de la cabina, por favor.",
      status: "new",
      createdAt: new Date(now.getTime() - 5 * 3600000).toISOString(),
    },
    {
      id: "g3",
      organizer: "Delegación de 4º de ADE",
      organization: "Fin de exámenes",
      kind: "Fin de exámenes",
      people: 15,
      date: atLocal(nextWeekday(night, 5), 23 * 60 + 45),
      budgetPerPersonCents: 3000,
      message: "Somos 15 para la fiesta de Económicas. Si hay precio por dos botellas, cerramos hoy.",
      status: "quoted",
      quoteCents: 40000,
      createdAt: new Date(now.getTime() - 26 * 3600000).toISOString(),
    },
  ];

  const top = [...promoters].sort((a, b) => b.sold - a.sold)[0];
  const data = emptyData(space);
  return seedClubOps({
    ...data,
    history: makeHistory(r, now, 1450, 0.46, 950),
    staff,
    shifts,
    clients: makeClients(r, now, 96, { studentShare: 0.86, spendRange: [1200, 9000] }),
    offers,
    reviews: makeReviews(r, now, [
      "El mejor jueves de Alicante. Entré con la lista de Franky antes de la 1:30 y sin colas.",
      "Lo de Crush Live en las pantallas es una locura, acabé hablando con media facultad.",
      "Celebramos mi cumple en el VIP 1 y nos trataron genial. La bengala con la botella, top.",
      "Buen sonido y el puerto al lado. La taquilla a partir de las 2 se llena, mejor anticipada.",
      "La Welcome Erasmus fue increíble, gente de todas partes y precios de estudiante.",
      "Mucha gente a las 2:30 y costaba pedir en barra, pero volveré.",
    ]),
    events,
    promoters,
    guests,
    zones,
    groupRequests,
    inbox: inbox(now, [
      { kind: "booking", title: "Piden un reservado", body: "Irene Navarro: cumpleaños de 9 personas con botella", href: "reservados", minutesAgo: 38 },
      { kind: "system", title: `${top?.name.split(" ")[0] ?? "Hugo"} ha vendido 20 entradas`, body: "Su enlace va a buen ritmo para el jueves", href: "rrpp", minutesAgo: 95 },
      { kind: "incident", title: "Aforo al 80 %", body: "El jueves pasado se llegó al 80 % a la 1:40. Refuerza la puerta a esa hora.", href: "puerta", minutesAgo: 60 * 30 },
      { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“Lo de Crush Live en las pantallas es una locura…”", href: "estudiantes", minutesAgo: 300 },
      { kind: "payment", title: "Liquidación de RRPP lista", body: "Las comisiones de la semana, calculadas con lo escaneado en puerta", href: "rrpp", minutesAgo: 60 * 20, read: true },
    ]),
    campaigns: makeCampaigns(now, [
      { moment: "Semana de bienvenida", title: "Fiesta de Bienvenida UA", when: "Hecho en septiembre", status: "done", audience: "Primer curso UA y UMH", idea: "614 entradas vendidas y 41 % por Franky." },
      { moment: "Fiestas de facultad", title: "Fiesta de Económicas", when: "Este sábado", status: "live", audience: "Facultad de Económicas", idea: "Con la delegación: anticipada a 10 € y lista hasta la 1:00." },
      { moment: "Exámenes de enero", title: "Fiesta fin de exámenes", when: "Finales de enero", status: "suggested", audience: "Toda la UA y la UMH", idea: "El último examen abre la lista gratis. Se lanza la tarde del último examen de cada facultad." },
      { moment: "Erasmus de febrero", title: "Welcome Erasmus de febrero", when: "Mediados de febrero", status: "scheduled", audience: "Erasmus que llegan en el segundo cuatrimestre", idea: "Con ESN: precio con ESNcard y Crush Live en inglés." },
      { moment: "Hogueras de San Juan", title: "Noche de Hogueras", when: "Del 20 al 24 de junio", status: "suggested", audience: "Estudiantes que se quedan en junio", idea: "Apertura especial después de la cremà con lista gratis." },
      { moment: "Graduaciones", title: "Fiesta de graduación", when: "Junio", status: "suggested", audience: "Último curso", idea: "Reservados por promoción con precio por grupo." },
    ]),
  }, now);
}

/* ------------------------------------------------------------------ */
/* Pub: The Loft                                                       */
/* ------------------------------------------------------------------ */

function buildPub(vertical: ProVerticalId, now: Date): ProData {
  const r = rng(seedFor(vertical));
  const night = nightOf(now);
  const open = { open: 20 * 60, close: 2 * 60 + 30 };
  const space = makeSpace(vertical, {
    name: "The Loft Pub",
    city: "San Vicente del Raspeig",
    address: "Calle Alicante 18, San Vicente del Raspeig",
    slug: "the-loft",
    owner: { name: "Marta Esteve", firstName: "Marta" },
    hours: [null, open, open, { open: 20 * 60, close: 3 * 60 }, { open: 20 * 60, close: 3 * 60 }, { open: 20 * 60, close: 3 * 60 }, null],
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 7,
    rating: 4.6,
    reviewsCount: 318,
    publicProfile: {
      description: "Pub a siete minutos del campus. Karaoke los miércoles, jueves universitario y todos los partidos en pantalla grande.",
      photos: 11,
      bookingEnabled: true,
      cardEnabled: true,
      cardDiscountPct: 10,
    },
  });

  const seeds: EventSeed[] = [
    {
      id: "ev-champions",
      name: "Noche de Champions",
      date: nextWeekday(night, 1),
      doors: 20 * 60 + 30,
      close: 60,
      capacity: 160,
      poster: "emerald",
      crushLive: false,
      lineup: "Partido en pantalla grande y cubo de 5 tercios a 10 €",
      tiers: [],
      list: 0,
      reserved: 0,
      walkIns: 120,
    },
    {
      id: "ev-karaoke",
      name: "Miércoles de karaoke",
      date: nextWeekday(night, 2),
      doors: 22 * 60,
      close: 2 * 60 + 30,
      capacity: 160,
      poster: "rose",
      crushLive: false,
      lineup: "Apúntate a cantar en la barra",
      tiers: [],
      list: 40,
      listCutoff: 23 * 60 + 30,
      reserved: 0,
      walkIns: 95,
    },
    {
      id: "ev-jueves",
      name: "Jueves Universitario",
      date: nextWeekday(night, 3),
      doors: 23 * 60,
      close: 3 * 60,
      capacity: 160,
      poster: "violet",
      crushLive: true,
      lineup: "Gratis con lista antes de las 0:30. Después, entrada con copa.",
      tiers: [{ name: "Entrada con copa", priceCents: 600, quantity: 80, target: 46, door: true, includes: "Una copa o dos cañas" }],
      list: 120,
      listCutoff: 30,
      reserved: 0,
      walkIns: 0,
    },
    {
      id: "ev-past-thu",
      name: "Jueves Universitario",
      date: prevWeekday(night, 3),
      doors: 23 * 60,
      close: 3 * 60,
      capacity: 160,
      poster: "violet",
      crushLive: true,
      tiers: [{ name: "Entrada con copa", priceCents: 600, quantity: 80, target: 52, door: true }],
      list: 128,
      listCutoff: 30,
      reserved: 0,
      walkIns: 0,
    },
  ];
  // Embajadores: estudiantes con enlace propio que cobran por quien entra de verdad.
  const ambassadors: ProPromoter[] = [
    { name: "Aitor Sempere", uni: UNIVERSITIES[0], code: "aitor26", weight: 9 },
    { name: "Lara Guijarro", uni: UNIVERSITIES[0], code: "lara26", weight: 7 },
    { name: "Mireia Cano", uni: UNIVERSITIES[1], code: "mireia26", weight: 4 },
  ].map((a, i) => ({
    id: `rp${i + 1}`,
    name: a.name,
    university: a.uni,
    code: a.code,
    listSize: 0,
    sold: 0,
    checkedIn: 0,
    commissionCents: 0,
    rule: "0,50 € por persona que entra",
    active: true,
    spec: { kind: "per_scan", cents: 50 },
    phone: `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
    since: atLocal(addDays(night, -r.int(20, 120)), 12 * 60),
    settledEventIds: [],
    payouts: [],
    cap: { maxPerNight: 40, cutoffMinute: 30 },
  }));
  const ambassadorWeights = ambassadors.map((a, i) => ({ id: a.id, weight: [9, 7, 4][i] }));

  const built = seeds.map((s) => buildEvent(r, s, now, s.name === "Jueves Universitario" ? ambassadorWeights : []));
  const events: ProEvent[] = built.map((b) => b.event);
  const guests = built.flatMap((b) => b.guests);
  ambassadors.forEach((p) => {
    p.settledEventIds = events.filter((e) => e.date < addDays(night, -8)).map((e) => e.id);
  });
  syncPromoters(ambassadors, guests);

  const focus = events.filter((e) => e.status === "tonight" || e.status === "on_sale").sort((a, b) => a.doorsOpen.localeCompare(b.doorsOpen))[0];
  const live = focus && now.getTime() >= new Date(focus.doorsOpen).getTime();
  const zones: ProZone[] = [
    { id: "z1", name: "Sofás del fondo", capacity: 12, minimumSpendCents: 12000, depositCents: 3000, bookedBy: "Sara Molina", people: 11, status: live ? "arrived" : "booked", birthday: true, phone: "688 120 447", note: "Cumple de Sara. Tarta a las 0:00, la trae ella.", eventId: focus?.id },
    { id: "z2", name: "Rincón del karaoke", capacity: 10, minimumSpendCents: 10000, depositCents: 2500, status: "free", eventId: focus?.id },
    { id: "z3", name: "Mesa alta de barra", capacity: 8, minimumSpendCents: 8000, depositCents: 2000, bookedBy: "Pablo Gómez", people: 6, status: "held", phone: "699 310 552", note: "Confirma la señal antes de las 20:00.", eventId: focus?.id },
    { id: "z4", name: "Frente a la pantalla", capacity: 10, minimumSpendCents: 9000, depositCents: 2000, bookedBy: "Peña madridista UA", people: 10, status: "booked", phone: "644 872 015", eventId: focus?.id },
    { id: "z5", name: "Terraza cubierta", capacity: 14, minimumSpendCents: 15000, depositCents: 4000, status: "free", eventId: focus?.id },
  ];

  const staff: ProStaff[] = [
    { id: "s1", name: "Marta Esteve", role: "owner", tone: "violet", title: "Dueña", commissionPct: 0, phone: "600 000 000", clockedInAt: null, weekMinutes: 0 },
    { id: "s2", name: "Rubén Pastor", role: "staff", tone: "sky", title: "Barra", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
    { id: "s3", name: "Celia Ruiz", role: "staff", tone: "emerald", title: "Barra y karaoke", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
    { id: "s4", name: "Iván Molina", role: "reception", tone: "slate", title: "Puerta", commissionPct: 0, clockedInAt: null, weekMinutes: 0 },
  ];
  if (live && focus) {
    staff.forEach((s, i) => {
      s.clockedInAt = new Date(new Date(focus.doorsOpen).getTime() - (45 - i * 5) * 60000).toISOString();
    });
  }
  const shifts = nightShifts(staff, now, [1, 2, 3, 4, 5], 19 * 60 + 30, 3 * 60 + 15);
  finishStaff(staff, shifts);

  const offers: ProOffer[] = [
    {
      id: "o1",
      kind: "valley",
      title: "Happy hour universitaria",
      detail: "2x1 en cañas y tercios de 20:00 a 22:00",
      discountPct: 50,
      days: [1, 2, 3],
      fromMinute: 20 * 60,
      toMinute: 22 * 60,
      slots: 0,
      claimed: 0,
      audience: { studentsOnly: true, radiusKm: 2, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 3900,
      views: 1240,
      bookings: 214,
      revenueCents: 96300,
      createdAt: atLocal(addDays(night, -30), 12 * 60),
    },
    {
      id: "o2",
      kind: "valley",
      title: "Jueves universitario",
      detail: "Entrada libre con lista hasta las 0:30 y chupito de bienvenida",
      discountPct: 100,
      days: [3],
      fromMinute: 23 * 60,
      toMinute: 30,
      slots: 120,
      claimed: 96,
      audience: { studentsOnly: true, radiusKm: 3, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 4600,
      views: 1710,
      bookings: 388,
      revenueCents: 0,
      createdAt: atLocal(addDays(night, -40), 12 * 60),
    },
    {
      id: "o3",
      kind: "card",
      title: "Franky Card",
      detail: "-10 % en la cuenta, todos los días",
      discountPct: 10,
      slots: 0,
      claimed: 0,
      audience: { studentsOnly: false, radiusKm: 50, universities: [] },
      status: "live",
      reach: 5200,
      views: 1350,
      bookings: 142,
      revenueCents: 61200,
      createdAt: atLocal(addDays(night, -70), 12 * 60),
    },
  ];

  const groupRequests: ProGroupRequest[] = [
    {
      id: "g1",
      organizer: "Aitana Llorca",
      organization: "Cumpleaños",
      kind: "Cumpleaños (20)",
      people: 12,
      date: atLocal(nextWeekday(night, 3), 23 * 60),
      budgetPerPersonCents: 1200,
      message: "Somos 12 de Magisterio, cumplo 20. ¿Podemos tener los sofás y poner una canción a las 12?",
      status: "new",
      createdAt: new Date(now.getTime() - 50 * 60000).toISOString(),
    },
    {
      id: "g2",
      organizer: "Club de Baloncesto UA",
      organization: "Club deportivo",
      kind: "Partido de Champions en grupo",
      people: 10,
      date: atLocal(nextWeekday(night, 1), 20 * 60 + 30),
      budgetPerPersonCents: 1000,
      message: "Queremos ver el partido juntos, 10 personas. ¿Mesa delante de la pantalla?",
      status: "new",
      createdAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
    },
  ];

  const data = emptyData(space);
  return seedPubOps({
    ...data,
    history: makeHistory(r, now, 560, 0.32, 1150),
    staff,
    shifts,
    clients: makeClients(r, now, 70, { studentShare: 0.78, spendRange: [800, 4500] }),
    offers,
    reviews: makeReviews(r, now, [
      "El karaoke de los miércoles es lo mejor de San Vicente. Acabamos cantando toda la mesa.",
      "Jueves con lista de Franky y chupito de bienvenida. Al lado del campus, perfecto.",
      "Celebré mi cumple en los sofás del fondo y Marta nos puso la canción. Un diez.",
      "Buen ambiente para ver el fútbol, se ve de lujo desde cualquier sitio.",
      "La happy hour con 2x1 salva el final de mes.",
    ]),
    events,
    promoters: ambassadors,
    guests,
    zones,
    groupRequests,
    inbox: inbox(now, [
      { kind: "booking", title: "Piden un reservado", body: "Aitana Llorca: cumpleaños de 12 en los sofás", href: "reservados", minutesAgo: 50 },
      { kind: "system", title: "La lista del jueves pasa de 100", body: "Apúntate a otra persona en la puerta a partir de las 0:00", href: "puerta", minutesAgo: 140 },
      { kind: "incident", title: "Aforo al 80 %", body: "El jueves pasado se llegó a 128 de 160 a las 0:20", href: "puerta", minutesAgo: 60 * 30 },
      { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“El karaoke de los miércoles es lo mejor de San Vicente…”", href: "estudiantes", minutesAgo: 400, read: true },
    ]),
    campaigns: makeCampaigns(now, [
      { moment: "Semana de bienvenida", title: "Jueves de bienvenida", when: "Hecho en septiembre", status: "done", audience: "Primer curso UA", idea: "Lista gratis y chupito: 131 personas por Franky." },
      { moment: "Exámenes de enero", title: "Happy hour de estudio", when: "Enero", status: "suggested", audience: "Toda la UA", idea: "2x1 de 20:00 a 22:00 para desconectar después de la biblioteca." },
      { moment: "Fiestas de facultad", title: "Previa de Económicas", when: "Este sábado", status: "scheduled", audience: "Facultad de Económicas", idea: "La previa oficial antes de la fiesta grande, con cubo a precio de grupo." },
      { moment: "Erasmus de febrero", title: "Karaoke internacional", when: "Febrero", status: "suggested", audience: "Erasmus UA", idea: "Canciones en todos los idiomas y lista gratis con ESN." },
    ]),
  }, now);
}

export function buildNightDemo(vertical: ProVerticalId, now: Date): ProData {
  return vertical === "pub" ? buildPub(vertical, now) : buildClub(vertical, now);
}
