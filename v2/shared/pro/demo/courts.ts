import type {
  ProBooking,
  ProClient,
  ProClientSource,
  ProData,
  ProMember,
  ProMembershipPlan,
  ProOffer,
  ProPayment,
  ProResource,
  ProStaff,
  ProVerticalId,
} from "../types";
import { addDays, atLocal, localDate, localMinutes, weekdayIndex } from "../format";
import { addMonths, memberPrice } from "../classes";
import { isValley, priceFor, type OpenMatchX } from "../courts";
import { emptyCourtsData } from "../courts-base";
import { createSeries, endOfCourse, levelValue } from "../courts-ops";
import { agreementApplies, agreementPrice, isAgreementMember } from "../courts-growth";
import {
  americanaRounds,
  leagueBlocks,
  leagueFixtures,
} from "../courts-compete";
import type {
  ProAmericana,
  ProCourtAgreement,
  ProCourtPass,
  ProCourtPenalty,
  ProPlayerShare,
  ProSeat,
  ProShopItem,
  ProWaitEntry,
} from "../courts-types";
import {
  clockIn,
  emptyData,
  inbox,
  makeCampaigns,
  makeClients,
  makeHistory,
  makeReviews,
  makeShifts,
  makeSpace,
  personName,
  rng,
  seedFor,
  STUDIES,
  UNIVERSITIES,
  weekHours,
  type Rng,
} from "./common";

const WEEKDAYS = [0, 1, 2, 3, 4];
const LEVELS = ["Iniciación", "2,5", "3,0", "3,5", "4,0"];

export function buildCourtsDemo(vertical: ProVerticalId, now: Date): ProData {
  return vertical === "coworking" ? buildCoworking(now) : buildPadel(now);
}

/* ------------------------------------------------------------------ */
/* Pádel Raspeig Club                                                  */
/* ------------------------------------------------------------------ */

function buildPadel(now: Date): ProData {
  const vertical: ProVerticalId = "sports_facility";
  const r = rng(seedFor(vertical));
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const space = makeSpace(vertical, {
    name: "Pádel Raspeig Club",
    city: "San Vicente del Raspeig",
    address: "Carrer del Pla 14",
    slug: "padel-raspeig",
    owner: { name: "Víctor Carbonell", firstName: "Víctor" },
    hours: weekHours(8 * 60, 23 * 60, { saturday: [8 * 60, 22 * 60], sunday: [8 * 60, 21 * 60] }),
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 10,
    rating: 4.7,
    reviewsCount: 241,
    publicProfile: {
      description: "Seis pistas de cristal, dos cubiertas, a diez minutos del campus. Alquiler de palas, escuela y liga universitaria.",
      photos: 10,
      bookingEnabled: true,
      cardEnabled: true,
      cardDiscountPct: 10,
    },
  });
  const todayHours = space.hours[weekdayIndex(today)] ?? { open: 8 * 60, close: 23 * 60 };

  const staff: ProStaff[] = [
    { id: "s1", name: "Víctor Carbonell", role: "owner", tone: "violet", title: "Dueño", commissionPct: 0, phone: "600 000 000" },
    { id: "s2", name: "Claudia Íñiguez", role: "reception", tone: "sky", title: "Recepción mañanas", commissionPct: 0 },
    { id: "s3", name: "Gonzalo Mora", role: "staff", tone: "emerald", title: "Monitor de la escuela", commissionPct: 0 },
    { id: "s4", name: "Blanca Soler", role: "reception", tone: "amber", title: "Recepción tardes", commissionPct: 0 },
  ].map((s, i) => ({ ...s, role: s.role as ProStaff["role"], tone: s.tone as ProStaff["tone"], clockedInAt: i < 3 ? clockIn(today, todayHours.open, i, now) : null, weekMinutes: 2100 - i * 180 }));

  const resources: ProResource[] = [
    { id: "r1", name: "Pista 1", kind: "court", capacity: 4, pricePerHourCents: 2400, valleyPricePerHourCents: 1400, tone: "violet", note: "Cristal, exterior" },
    { id: "r2", name: "Pista 2", kind: "court", capacity: 4, pricePerHourCents: 2400, valleyPricePerHourCents: 1400, tone: "sky", note: "Cristal, exterior" },
    { id: "r3", name: "Pista 3", kind: "court", capacity: 4, pricePerHourCents: 2400, valleyPricePerHourCents: 1400, tone: "emerald", note: "Cristal, exterior" },
    { id: "r4", name: "Pista 4", kind: "court", capacity: 4, pricePerHourCents: 2400, valleyPricePerHourCents: 1400, tone: "amber", note: "Cristal, central con grada" },
    { id: "r5", name: "Pista 5", kind: "court", capacity: 4, pricePerHourCents: 2800, valleyPricePerHourCents: 1600, tone: "rose", note: "Cubierta" },
    { id: "r6", name: "Pista 6", kind: "court", capacity: 4, pricePerHourCents: 2800, valleyPricePerHourCents: 1600, tone: "teal", note: "Cubierta" },
  ];

  const clients: ProClient[] = makeClients(r, now, 72, { studentShare: 0.55, spendRange: [600, 2400] }).map((c) => ({
    ...c,
    tags: [`Nivel ${r.pick(LEVELS)}`, ...(r.chance(0.25) ? ["Liga UA"] : []), ...(r.chance(0.15) ? ["Diestro de revés"] : [])],
  }));

  // Reservas: huecos de 90 minutos desde las 8:00, más llenos por la tarde.
  const starts = [8 * 60, 9 * 60 + 30, 11 * 60, 12 * 60 + 30, 14 * 60, 15 * 60 + 30, 17 * 60, 18 * 60 + 30, 20 * 60, 21 * 60 + 30];
  const bookings: ProBooking[] = [];
  const payments: ProPayment[] = [];
  const openMatches: OpenMatchX[] = [];
  let n = 0;
  let requested = 0;
  for (let d = -6; d <= 6; d++) {
    const date = addDays(today, d);
    const hours = space.hours[weekdayIndex(date)];
    if (!hours) continue;
    const weekend = weekdayIndex(date) >= 5;
    for (const res of resources) {
      for (const from of starts) {
        if (from + 90 > hours.close || from < hours.open) continue;
        let p = from >= 17 * 60 ? 0.92 : from >= 14 * 60 ? 0.45 : isValley(date, from) ? 0.28 : 0.4;
        if (weekend) p = from >= 11 * 60 && from < 20 * 60 ? 0.85 : 0.5;
        if (d === 0 && isValley(date, from)) p = 0.22;
        if (d > 2) p *= 0.75;
        if (!r.chance(p)) continue;
        const client = r.pick(clients);
        const student = Boolean(client.student?.verified);
        const price = priceFor(res, date, from, 90);
        if (price === null) throw new Error("Falta la tarifa de la pista de demostración.");
        const end = from + 90;
        let status: ProBooking["status"] = "confirmed";
        if (d < 0) status = r.chance(0.04) ? "no_show" : "done";
        else if (d === 0) {
          if (end <= nowMin) status = "done";
          else if (from <= nowMin) status = "in_service";
          else if (from - nowMin < 30) status = r.chance(0.5) ? "arrived" : "confirmed";
          else if (requested < 2 && r.chance(0.15)) {
            status = "requested";
            requested++;
          }
        } else if (d <= 2 && requested < 3 && r.chance(0.05)) {
          status = "requested";
          requested++;
        }
        const source: ProClientSource = student && r.chance(0.6) ? (isValley(date, from) ? "hueco" : "franky") : client.source === "franky" ? "franky" : r.pick(["phone", "walkin", "instagram", "phone"] as ProClientSource[]);
        const paid = status === "done" ? price : source === "franky" || source === "hueco" ? price : r.chance(0.3) ? Math.round(price / 4) : 0;
        n++;
        const b: ProBooking = {
          id: `b${n}`,
          kind: "court",
          clientId: client.id,
          clientName: client.name,
          resourceId: res.id,
          start: atLocal(date, from),
          end: atLocal(date, end),
          partySize: 4,
          status,
          priceCents: price,
          paidCents: paid,
          source,
          student,
          note: r.chance(0.08) ? "Alquilan 2 palas" : undefined,
        };
        bookings.push(b);
        if (status === "done") {
          payments.push({ id: `p${n}`, at: b.end, bookingId: b.id, clientName: client.name, concept: `${res.name} 90 min`, amountCents: price, tipCents: 0, method: r.pick(["card", "card", "bizum", "cash"] as const) });
        }
      }
    }
  }

  // Partidos abiertos de hoy y mañana en pistas libres: faltan jugadores.
  const matchSeeds: { d: number; from: number; level: string; have: number }[] = [
    { d: 0, from: 12 * 60 + 30, level: "2,5", have: 2 },
    { d: 0, from: 17 * 60, level: "3,0", have: 3 },
    { d: 0, from: 20 * 60, level: "3,5", have: 3 },
    { d: 1, from: 11 * 60, level: "Iniciación", have: 1 },
    { d: 1, from: 18 * 60 + 30, level: "3,0", have: 2 },
    { d: 2, from: 9 * 60 + 30, level: "2,5", have: 2 },
  ];
  matchSeeds.forEach((m, i) => {
    const date = addDays(today, m.d);
    if (!space.hours[weekdayIndex(date)]) return;
    if (m.d === 0 && m.from + 30 < nowMin) return;
    // Buscamos una pista libre en esa franja; si no la hay, liberamos la última.
    const free = resources.find((res) => !bookings.some((b) => b.resourceId === res.id && localDate(b.start) === date && localMinutes(b.start) < m.from + 90 && localMinutes(b.end) > m.from));
    const res = free ?? resources[resources.length - 1];
    if (!free) {
      for (let k = bookings.length - 1; k >= 0; k--) {
        const b = bookings[k];
        if (b.resourceId === res.id && localDate(b.start) === date && localMinutes(b.start) < m.from + 90 && localMinutes(b.end) > m.from) bookings.splice(k, 1);
      }
    }
    const players = Array.from({ length: m.have }, () => personName(r));
    openMatches.push({
      id: `om${i + 1}`,
      resourceId: res.id,
      start: atLocal(date, m.from),
      level: m.level,
      players,
      needed: 4 - m.have,
      university: i % 3 === 2 ? UNIVERSITIES[1] : UNIVERSITIES[0],
      publishedAt: i % 2 === 0 ? new Date(now.getTime() - (i + 1) * 45 * 60000).toISOString() : undefined,
      reach: i % 2 === 0 ? 120 + i * 35 : undefined,
    });
  });

  const offers: ProOffer[] = [
    {
      id: "o1",
      kind: "valley",
      title: "Mañanas universitarias",
      detail: "Pista a 14 € la hora de 10 a 14 h entre semana, 3,50 € por jugador",
      discountPct: 42,
      days: WEEKDAYS,
      fromMinute: 10 * 60,
      toMinute: 14 * 60,
      slots: 60,
      claimed: 38,
      audience: { studentsOnly: true, radiusKm: 3, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 3600,
      views: 1204,
      bookings: 38,
      revenueCents: 79800,
      createdAt: atLocal(addDays(today, -32), 10 * 60),
    },
    {
      id: "o2",
      kind: "first_visit",
      title: "Primer partido con pala incluida",
      detail: "Alquiler de pala gratis en tu primera reserva",
      discountPct: 0,
      slots: 50,
      claimed: 27,
      audience: { studentsOnly: true, radiusKm: 5, universities: [UNIVERSITIES[0], UNIVERSITIES[1]] },
      status: "live",
      reach: 2800,
      views: 760,
      bookings: 27,
      revenueCents: 56700,
      createdAt: atLocal(addDays(today, -18), 10 * 60),
    },
    {
      id: "o3",
      kind: "group",
      title: "Liga entre facultades",
      detail: "8 parejas, jornada los miércoles a las 12:30, final en diciembre",
      discountPct: 0,
      startsAt: atLocal(addDays(today, -20), 12 * 60 + 30),
      slots: 8,
      claimed: 8,
      audience: { studentsOnly: true, radiusKm: 5, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 4200,
      views: 1330,
      bookings: 8,
      revenueCents: 0,
      createdAt: atLocal(addDays(today, -34), 12 * 60),
    },
  ];

  const data: ProData = {
    ...emptyData(space),
    history: makeHistory(r, now, 190, 0.3, 3400),
    staff,
    clients,
    resources,
    bookings,
    payments,
    openMatches,
    offers,
    reviews: makeReviews(r, now, [
      "Encontré partido de mi nivel con gente de la UA en diez minutos. Así da gusto.",
      "A mediodía la pista sale a 3,50 € por cabeza. Entre clases es el plan perfecto.",
      "Pistas cuidadas y la cubierta salva los días de viento.",
      "La liga entre facultades está muy bien montada, ya vamos por la tercera jornada.",
      "Reservar por Franky y dividir el pago entre los cuatro es comodísimo.",
      "Por la tarde cuesta encontrar pista, hay que reservar con tiempo.",
    ]),
    shifts: makeShifts(staff, now, todayHours.open, todayHours.close),
    groupRequests: [
      {
        id: "g1",
        organizer: "Samuel Ferrer",
        organization: "Delegación de Económicas",
        kind: "Torneo de pádel de la facultad",
        people: 32,
        date: atLocal(addDays(today, 10), 10 * 60),
        budgetPerPersonCents: 600,
        message: "Queremos las 6 pistas un sábado por la mañana para un torneo de 16 parejas.",
        status: "new",
        createdAt: new Date(now.getTime() - 4 * 3600000).toISOString(),
      },
    ],
    inbox: inbox(now, [
      { kind: "booking", title: "Reserva por confirmar", body: "Pista 3 esta tarde, pedida online", href: "pistas", minutesAgo: 18 },
      { kind: "lead", title: "Partido abierto casi completo", body: "Falta 1 jugador de nivel 3,0 para las 17:00", href: "pistas", minutesAgo: 35 },
      { kind: "group", title: "Torneo de Económicas", body: "32 personas, las 6 pistas un sábado", href: "estudiantes", minutesAgo: 240 },
      { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“Encontré partido de mi nivel con gente de la UA…”", href: "estudiantes", minutesAgo: 800, read: true },
    ]),
    campaigns: makeCampaigns(now, [
      { moment: "Semana de bienvenida", title: "Primer partido con pala", when: "Hecho en septiembre", status: "done", audience: "Primer curso", idea: "27 jugadores nuevos, 19 han repetido." },
      { moment: "Fiestas de facultad", title: "Liga entre facultades", when: "En marcha", status: "live", audience: "Toda la UA", idea: "8 parejas, miércoles a mediodía: llena las pistas en hora valle." },
      { moment: "Exámenes de enero", title: "Pádel para desconectar", when: "Enero", status: "suggested", audience: "Toda la UA", idea: "Partidos de 60 min a 12 € de 12 a 14 h para despejarse." },
      { moment: "Erasmus de febrero", title: "Partidos abiertos Erasmus", when: "Febrero", status: "suggested", audience: "Erasmus recién llegados", idea: "Partidos de iniciación mezclados con estudiantes locales." },
    ]),
  };
  return seedPadelOps(data, now);
}

/* ------------------------------------------------------------------ */
/* Sala Silencio (sala de estudio y coworking)                         */
/* ------------------------------------------------------------------ */

function buildCoworking(now: Date): ProData {
  const vertical: ProVerticalId = "coworking";
  const r = rng(seedFor(vertical));
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const space = makeSpace(vertical, {
    name: "Sala Silencio",
    city: "San Vicente del Raspeig",
    address: "Avenida de la Libertad 5",
    slug: "sala-silencio",
    owner: { name: "Laura Esteve", firstName: "Laura" },
    hours: weekHours(8 * 60, 23 * 60, { saturday: [9 * 60, 21 * 60], sunday: [10 * 60, 20 * 60] }),
    campus: "Universidad de Alicante",
    walkMinutesToCampus: 3,
    rating: 4.8,
    reviewsCount: 134,
    publicProfile: {
      description: "Sala de estudio a tres minutos del campus: zona de silencio total, zona con portátil y salas para trabajos en grupo. Wifi de fibra y taquillas.",
      photos: 8,
      bookingEnabled: true,
      cardEnabled: true,
      cardDiscountPct: 10,
    },
  });
  const todayHours = space.hours[weekdayIndex(today)] ?? { open: 8 * 60, close: 23 * 60 };

  const staff: ProStaff[] = [
    { id: "s1", name: "Laura Esteve", role: "owner" as const, tone: "violet" as const, title: "Dueña", commissionPct: 0, phone: "600 000 000" },
    { id: "s2", name: "Mario Pérez", role: "reception" as const, tone: "sky" as const, title: "Recepción mañanas", commissionPct: 0 },
    { id: "s3", name: "Celia Gómez", role: "reception" as const, tone: "emerald" as const, title: "Recepción tardes y noches", commissionPct: 0 },
  ].map((s, i) => ({ ...s, clockedInAt: i < 2 ? clockIn(today, todayHours.open, i, now) : null, weekMinutes: 1800 - i * 120 }));

  const resources: ProResource[] = [
    { id: "r1", name: "Zona silencio", kind: "desk", capacity: 14, pricePerHourCents: 150, valleyPricePerHourCents: 100, tone: "violet", note: "Silencio total, sin llamadas" },
    { id: "r2", name: "Zona portátil", kind: "desk", capacity: 8, pricePerHourCents: 150, valleyPricePerHourCents: 100, tone: "sky", note: "Se puede teclear y hablar bajo" },
    { id: "r3", name: "Sala grupos 1", kind: "room", capacity: 4, pricePerHourCents: 800, valleyPricePerHourCents: 500, tone: "emerald", note: "Pizarra y pantalla" },
    { id: "r4", name: "Sala grupos 2", kind: "room", capacity: 4, pricePerHourCents: 800, valleyPricePerHourCents: 500, tone: "amber", note: "Pizarra" },
  ];

  const plans: ProMembershipPlan[] = [
    { id: "pl1", name: "Pase de día", priceCents: 500, period: "pack", sessions: 1, members: 0 },
    { id: "pl2", name: "Semana", priceCents: 1800, period: "pack", sessions: 7, members: 0 },
    { id: "pl3", name: "Mes", priceCents: 4500, period: "month", sessions: null, studentPriceCents: 3900, members: 0 },
    { id: "pl4", name: "Bono exámenes (2 semanas)", priceCents: 2500, period: "pack", sessions: 14, members: 0 },
  ];

  const members: ProMember[] = makeStudyMembers(r, now, plans);
  plans.forEach((p) => {
    p.members = members.filter((m) => m.planId === p.id && m.status !== "cancelled").length;
  });

  const clients: ProClient[] = makeClients(r, now, 60, { studentShare: 0.9, spendRange: [500, 4500] }).map((c) => ({
    ...c,
    tags: c.student ? [r.pick(STUDIES)] : ["Opositor"],
  }));

  const bookings: ProBooking[] = [];
  const payments: ProPayment[] = [];
  let n = 0;
  const pool = [...members.filter((m) => m.status !== "cancelled" && m.status !== "paused").map((m) => ({ id: m.id, name: m.name, student: Boolean(m.student?.verified), member: true })), ...clients.map((c) => ({ id: c.id, name: c.name, student: Boolean(c.student?.verified), member: false }))];
  const blocks: [number, number][] = [
    [9 * 60, 14 * 60],
    [8 * 60 + 30, 13 * 60 + 30],
    [16 * 60, 21 * 60],
    [15 * 60 + 30, 20 * 60],
    [16 * 60, 22 * 60],
    [17 * 60, 22 * 60 + 30],
    [11 * 60, 13 * 60],
    [18 * 60, 21 * 60],
  ];
  for (let d = -6; d <= 6; d++) {
    const date = addDays(today, d);
    const hours = space.hours[weekdayIndex(date)];
    if (!hours) continue;
    const weekend = weekdayIndex(date) >= 5;
    for (const res of resources.filter((x) => x.kind === "desk")) {
      const people = Math.round(res.capacity * (weekend ? 0.9 : 1.35) * (d > 2 ? 0.6 : 1));
      for (let k = 0; k < people; k++) {
        const [a, b] = r.pick(blocks);
        const from = Math.max(hours.open, a);
        const to = Math.min(hours.close, b);
        if (to - from < 60) continue;
        // No pasamos del aforo en ningún momento.
        const clash = bookings.filter((x) => x.resourceId === res.id && localDate(x.start) === date);
        let full = false;
        for (let m = from; m < to; m += 30) {
          if (clash.filter((x) => localMinutes(x.start) <= m && localMinutes(x.end) > m).length >= res.capacity) {
            full = true;
            break;
          }
        }
        if (full) continue;
        const who = r.pick(pool);
        const price = who.member ? 0 : priceFor(res, date, from, to - from);
        if (price === null) throw new Error("Falta la tarifa del puesto de demostración.");
        let status: ProBooking["status"] = "confirmed";
        if (d < 0) status = "done";
        else if (d === 0) status = to <= nowMin ? "done" : from <= nowMin ? "arrived" : "confirmed";
        n++;
        bookings.push({
          id: `b${n}`,
          kind: "court",
          clientId: who.id,
          clientName: who.name,
          resourceId: res.id,
          start: atLocal(date, from),
          end: atLocal(date, to),
          partySize: 1,
          status,
          priceCents: price,
          paidCents: status === "done" || who.member ? price : 0,
          source: who.student ? r.pick(["franky", "franky", "card", "walkin"] as ProClientSource[]) : "walkin",
          student: who.student,
          note: who.member ? "Con bono" : undefined,
        });
      }
    }
    for (const res of resources.filter((x) => x.kind === "room")) {
      for (const from of [10 * 60, 12 * 60, 16 * 60, 18 * 60, 20 * 60]) {
        if (from + 120 > hours.close || !r.chance(weekend ? 0.3 : from >= 16 * 60 ? 0.7 : 0.35)) continue;
        const who = r.pick(pool);
        const price = priceFor(res, date, from, 120);
        if (price === null) throw new Error("Falta la tarifa de la sala de demostración.");
        let status: ProBooking["status"] = "confirmed";
        if (d < 0) status = "done";
        else if (d === 0) status = from + 120 <= nowMin ? "done" : from <= nowMin ? "in_service" : "confirmed";
        n++;
        bookings.push({
          id: `b${n}`,
          kind: "court",
          clientId: who.id,
          clientName: who.name,
          resourceId: res.id,
          start: atLocal(date, from),
          end: atLocal(date, from + 120),
          partySize: r.int(3, 4),
          status,
          priceCents: price,
          paidCents: status === "done" ? price : 0,
          source: who.student ? "franky" : "phone",
          student: who.student,
          note: r.pick(["Trabajo de Redes, EPS", "TFG de ADE", "Práctica de Derecho Civil", "Estudio en grupo de Anatomía", "Proyecto de Arquitectura"]),
        });
        if (status === "done") payments.push({ id: `p${n}`, at: atLocal(date, from + 120), bookingId: `b${n}`, clientName: who.name, concept: `${res.name} 2 h`, amountCents: price, tipCents: 0, method: "card" });
      }
    }
  }

  members.forEach((m, i) => {
    const plan = plans.find((p) => p.id === m.planId);
    if (!plan || m.status === "trial") return;
    const at = m.nextChargeAt && plan.period === "month" ? addMonths(m.nextChargeAt, -1) : m.since;
    payments.push({ id: `pm${i + 1}`, at, clientName: m.name, concept: plan.name, amountCents: memberPrice(m, plan), tipCents: 0, method: r.pick(["card", "bizum"] as const) });
  });

  const offers: ProOffer[] = [
    {
      id: "o1",
      kind: "exam",
      title: "Bono exámenes",
      detail: "2 semanas de puesto por 25 €, con horario hasta las 2:00 en enero",
      discountPct: 30,
      startsAt: atLocal(addDays(today, 95), 8 * 60),
      endsAt: atLocal(addDays(today, 130), 23 * 60),
      slots: 80,
      claimed: 9,
      audience: { studentsOnly: true, radiusKm: 3, universities: [UNIVERSITIES[0]] },
      status: "scheduled",
      reach: 5200,
      views: 640,
      bookings: 9,
      revenueCents: 22500,
      createdAt: atLocal(addDays(today, -2), 10 * 60),
    },
    {
      id: "o2",
      kind: "valley",
      title: "Mañanas a 1 € la hora",
      detail: "Puesto a 1 € la hora de 10 a 14 h entre semana",
      discountPct: 33,
      days: WEEKDAYS,
      fromMinute: 10 * 60,
      toMinute: 14 * 60,
      slots: 40,
      claimed: 26,
      audience: { studentsOnly: true, radiusKm: 2, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 2400,
      views: 870,
      bookings: 26,
      revenueCents: 10400,
      createdAt: atLocal(addDays(today, -25), 10 * 60),
    },
    {
      id: "o3",
      kind: "first_visit",
      title: "Primer día gratis",
      detail: "Prueba la zona de silencio un día entero sin pagar",
      discountPct: 100,
      slots: 50,
      claimed: 33,
      audience: { studentsOnly: true, radiusKm: 3, universities: [UNIVERSITIES[0]] },
      status: "live",
      reach: 3100,
      views: 990,
      bookings: 33,
      revenueCents: 0,
      createdAt: atLocal(addDays(today, -28), 10 * 60),
    },
  ];

  const data: ProData = {
    ...emptyData(space),
    history: makeHistory(r, now, 260, 0.36, 420),
    staff,
    clients,
    resources,
    bookings,
    payments,
    plans,
    members,
    offers,
    reviews: makeReviews(r, now, [
      "Silencio de verdad, no como la biblioteca en exámenes. Y a tres minutos de clase.",
      "El bono de exámenes me salvó enero: 25 € y abierto hasta las 2.",
      "Las salas de grupo con pantalla son perfectas para preparar la exposición del TFG.",
      "Veo en Franky cuántos puestos quedan antes de salir de casa. Genial.",
      "Wifi rápido, enchufes en cada puesto y café a buen precio.",
      "En junio se llena mucho por la tarde, conviene reservar.",
    ]),
    shifts: makeShifts(staff, now, todayHours.open, todayHours.close),
    inbox: inbox(now, [
      { kind: "booking", title: "Sala grupos 1 reservada", body: "Grupo de 4 para un trabajo de Redes esta tarde", href: "pistas", minutesAgo: 30 },
      { kind: "payment", title: "Cuotas pendientes", body: "Hay cuotas del mes sin cobrar, míralas en Socios", href: "socios", minutesAgo: 200 },
      { kind: "lead", title: "Bono exámenes", body: "9 estudiantes ya lo han reservado para enero", href: "estudiantes", minutesAgo: 420 },
      { kind: "review", title: "Nueva reseña de 5 estrellas", body: "“Silencio de verdad…”", href: "estudiantes", minutesAgo: 900, read: true },
    ]),
    campaigns: makeCampaigns(now, [
      { moment: "Semana de bienvenida", title: "Primer día gratis", when: "Hecho en septiembre", status: "done", audience: "Primer curso", idea: "33 estudiantes probaron la sala, 12 se hicieron socios." },
      { moment: "Exámenes de enero", title: "Bono exámenes y horario nocturno", when: "Desde el 15 de diciembre", status: "scheduled", audience: "Carreras con exámenes esa semana", idea: "Bono de 2 semanas a 25 € y apertura hasta las 2:00." },
      { moment: "Exámenes de junio", title: "Bono exámenes de junio", when: "Mayo", status: "suggested", audience: "Toda la UA", idea: "Mismo bono con prioridad para quien lo usó en enero." },
      { moment: "Graduaciones", title: "Salas para preparar el TFG", when: "Junio", status: "suggested", audience: "Último curso", idea: "Sala de grupo con pantalla a 5 € la hora por la mañana para ensayar la defensa." },
    ]),
  };
  return seedStudyOps(data, now);
}

function makeStudyMembers(r: Rng, now: Date, plans: ProMembershipPlan[]): ProMember[] {
  const today = localDate(now);
  const list: ProMember[] = [];
  const used = new Set<string>();
  const weights = [0.15, 0.2, 0.45, 0.2];
  const statuses: ProMember["status"][] = ["overdue", "overdue", "overdue", "trial", "trial", "paused", "cancelled", "cancelled"];
  for (let i = 0; i < 52; i++) {
    let name = personName(r);
    while (used.has(name)) name = personName(r);
    used.add(name);
    const x = r.next();
    let acc = 0;
    let pi = 0;
    for (let k = 0; k < weights.length; k++) {
      acc += weights[k];
      if (x < acc) {
        pi = k;
        break;
      }
    }
    const plan = plans[pi];
    const status = i < statuses.length ? statuses[i] : "active";
    const student = r.chance(0.88);
    const sinceDays = status === "trial" ? 0 : plan.period === "pack" ? r.int(0, plan.sessions ?? 1) : r.int(20, 300);
    list.push({
      id: `m${i + 1}`,
      clientId: `m${i + 1}`,
      name,
      planId: plan.id,
      status: plan.period !== "month" && status === "overdue" ? "active" : status,
      nextChargeAt:
        plan.period === "month"
          ? status === "overdue"
            ? atLocal(addDays(today, -r.int(1, 8)), 9 * 60)
            : status === "active"
              ? atLocal(addDays(today, r.int(1, 29)), 9 * 60)
              : null
          : null,
      sessionsLeft: plan.sessions ? Math.max(0, plan.sessions - sinceDays) : null,
      since: atLocal(addDays(today, -sinceDays), 9 * 60),
      attendanceLast30: status === "paused" || status === "cancelled" ? r.int(0, 2) : plan.period === "month" ? r.int(8, 24) : r.int(1, 7),
      student: student ? { university: r.chance(0.85) ? UNIVERSITIES[0] : r.pick(UNIVERSITIES), verified: r.chance(0.9) } : undefined,
      studies: student ? r.pick(STUDIES) : "Oposiciones",
      phone: `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
      source: student ? r.pick(["franky", "franky", "card", "walkin", "instagram"] as ProClientSource[]) : "walkin",
      changedAt: status === "cancelled" || status === "paused" ? atLocal(addDays(today, -r.int(1, 15)), 12 * 60) : undefined,
    });
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* Operación del club y de la sala (turnos, pagos, torneos, puestos)   */
/* ------------------------------------------------------------------ */

/** Identificadores estables: la demo sale igual en cada visita. */
function counterIds(prefix: string) {
  let n = 0;
  return (kind: string) => `${prefix}-${kind}${++n}`;
}

function phoneOf(r: Rng): string {
  return `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`;
}

/** Quita las reservas sueltas que pisarían un hueco fijo de la demo. */
function clearSlot(
  data: ProData,
  resourceId: string,
  date: string,
  from: number,
  to: number,
) {
  data.bookings = data.bookings.filter((b) => {
    if (b.resourceId !== resourceId || localDate(b.start) !== date) return true;
    return !(localMinutes(b.start) < to && localMinutes(b.end) > from);
  });
}

function seedPadelOps(data: ProData, now: Date): ProData {
  const r = rng(seedFor("sports_facility") + 17);
  const newId = counterIds("dm");
  const today = localDate(now);
  const tomorrow = addDays(today, 1);
  const nowIso = now.toISOString();
  const ops = emptyCourtsData();
  ops.coveredIds = ["r5", "r6"];
  ops.policy.punctualityNote =
    "Llega 10 minutos antes. La pista se entrega a la hora en punto y se deja libre 5 minutos antes de acabar.";

  // Segunda monitora de la escuela.
  data.staff = [
    ...data.staff,
    {
      id: "s5",
      name: "Lorena Vidal",
      role: "staff",
      tone: "rose",
      title: "Monitora de la escuela",
      commissionPct: 0,
      clockedInAt: null,
      weekMinutes: 960,
    },
  ];
  ops.coachRates = { s3: 1500, s5: 1400 };

  // Nivel de cada jugador a partir de la etiqueta de su ficha.
  for (const c of data.clients) {
    const tag = c.tags.find((t) => t.startsWith("Nivel "));
    const base = tag ? levelValue(tag.slice(6)) : 3;
    const level = Math.min(7, Math.max(1, base + r.pick([0, 0, 0.25, -0.25])));
    ops.levels[c.id] = {
      level,
      hand: r.chance(0.86) ? "right" : "left",
      side: r.pick(["drive", "reves", "both"] as const),
      history: [
        {
          at: atLocal(addDays(today, -r.int(120, 300)), 12 * 60),
          level: Math.max(1, level - 0.5),
        },
        { at: atLocal(addDays(today, -r.int(10, 90)), 12 * 60), level },
      ],
    };
  }
  // Dos jugadores con ausencias repetidas: la ficha avisa en rojo.
  data.clients = data.clients.map((c, i) =>
    i === 4 || i === 11 ? { ...c, noShows: 3 } : c,
  );

  // Grupos de escuela: ocupan su pista cada semana del curso.
  const [year, month] = today.split("-").map(Number);
  const seasonYear = month >= 7 ? year : year - 1;
  const season = {
    from: `${seasonYear}-09-15`,
    to: `${seasonYear + 1}-06-15`,
  };
  const schoolSeeds = [
    { name: "Iniciación adultos", level: "Iniciación", coachId: "s3", resourceId: "r6", weekday: 1, from: 18 * 60, fee: 4000 },
    { name: "Perfeccionamiento", level: "3,0", coachId: "s3", resourceId: "r6", weekday: 3, from: 18 * 60, fee: 4500 },
    { name: "Mañanas universitarias", level: "2,5", coachId: "s5", resourceId: "r5", weekday: 0, from: 10 * 60, fee: 3200 },
    { name: "Menores de 8 a 12 años", level: "Iniciación", coachId: "s5", resourceId: "r5", weekday: 2, from: 17 * 60, fee: 3500 },
  ];
  ops.school = schoolSeeds.map((s, i) => {
    const students = Array.from({ length: i === 3 ? 6 : 4 }, (_, k) => ({
      id: `al${i + 1}-${k + 1}`,
      name: personName(r),
      phone: phoneOf(r),
      feeStatus: r.chance(0.8) ? ("paid" as const) : ("pending" as const),
      minor: i === 3 ? true : undefined,
    }));
    const attendance: Record<string, string[]> = {};
    for (let w = 1; w <= 4; w++) {
      let d = addDays(today, -7 * w);
      while (weekdayIndex(d) !== s.weekday) d = addDays(d, 1);
      if (d >= today || d < season.from) continue;
      attendance[d] = students
        .filter(() => r.chance(0.82))
        .map((st) => st.id);
    }
    return {
      id: `es${i + 1}`,
      name: s.name,
      level: s.level,
      coachId: s.coachId,
      resourceId: s.resourceId,
      weekday: s.weekday,
      from: s.from,
      duration: 60,
      capacity: i === 3 ? 8 : 4,
      monthlyFeeCents: s.fee,
      students,
      attendance,
      season,
    };
  });
  for (let d = -6; d <= 6; d++) {
    const date = addDays(today, d);
    for (const g of ops.school) {
      if (weekdayIndex(date) === g.weekday && date >= season.from)
        clearSlot(data, g.resourceId, date, g.from, g.from + g.duration);
    }
  }

  // Clases particulares: cada una reserva su pista.
  const lessonSeeds = [
    { d: 0, from: 9 * 60 + 30, coachId: "s3", resourceId: "r4" },
    { d: 0, from: 16 * 60, coachId: "s5", resourceId: "r3" },
    { d: 1, from: 11 * 60, coachId: "s3", resourceId: "r2" },
    { d: 2, from: 19 * 60, coachId: "s5", resourceId: "r6" },
    { d: -2, from: 12 * 60, coachId: "s3", resourceId: "r1" },
    { d: -5, from: 10 * 60, coachId: "s5", resourceId: "r2" },
  ];
  for (const l of lessonSeeds) {
    const date = addDays(today, l.d);
    if (!data.space.hours[weekdayIndex(date)]) continue;
    clearSlot(data, l.resourceId, date, l.from, l.from + 60);
    const name = personName(r);
    const bookingId = newId("b");
    const past =
      date < today || (date === today && l.from + 60 <= localMinutes(now));
    const coach = data.staff.find((s) => s.id === l.coachId);
    data.bookings.push({
      id: bookingId,
      kind: "court",
      clientName: name,
      resourceId: l.resourceId,
      start: atLocal(date, l.from),
      end: atLocal(date, l.from + 60),
      partySize: 1,
      status: past ? "done" : "confirmed",
      priceCents: 3000,
      paidCents: past ? 3000 : 0,
      source: "phone",
      note: `Clase particular con ${coach?.name.split(" ")[0] ?? "el monitor"}`,
    });
    ops.lessons.push({
      id: newId("cl"),
      coachId: l.coachId,
      resourceId: l.resourceId,
      date,
      from: l.from,
      duration: 60,
      studentName: name,
      phone: phoneOf(r),
      priceCents: 3000,
      bookingId,
      status: past ? "done" : "scheduled",
    });
  }

  // Liga entre facultades: empezó hace unas semanas, miércoles a las 12:30.
  const faculties = [
    ["Económicas", "Facultad de Económicas"],
    ["Politécnica", "Escuela Politécnica Superior"],
    ["Derecho", "Facultad de Derecho"],
    ["Ciencias", "Facultad de Ciencias"],
    ["Educación", "Facultad de Educación"],
    ["Letras", "Facultad de Filosofía y Letras"],
    ["Salud", "Facultad de Ciencias de la Salud"],
    ["Arquitectura", "Escuela Politécnica Superior"],
  ];
  const teams = faculties.map(([name, faculty], i) => ({
    id: `eq${i + 1}`,
    name,
    faculty,
    players: [personName(r), personName(r)] as [string, string],
    phone: phoneOf(r),
  }));
  let firstWednesday = addDays(today, -21);
  while (weekdayIndex(firstWednesday) !== 2)
    firstWednesday = addDays(firstWednesday, 1);
  const leagueCourts = ["r1", "r2", "r3", "r4"];
  const fixtures = leagueFixtures(teams, {
    startDate: firstWednesday,
    weekday: 2,
    from: 12 * 60 + 30,
    resourceIds: leagueCourts,
    newId,
  }).map((f) => {
    if (f.date >= today) return f;
    const homeWins = r.chance(0.5);
    const close = r.chance(0.4);
    return {
      ...f,
      homeSets: homeWins ? 2 : close ? 1 : 0,
      awaySets: homeWins ? (close ? 1 : 0) : 2,
    };
  });
  ops.league = {
    id: "liga-ua",
    name: "Liga entre facultades",
    weekday: 2,
    from: 12 * 60 + 30,
    startDate: firstWednesday,
    resourceIds: leagueCourts,
    teams,
    fixtures,
  };
  for (const f of fixtures) {
    if (f.date >= addDays(today, -6) && f.date <= addDays(today, 6))
      clearSlot(data, f.resourceId, f.date, f.from, f.from + 90);
  }
  ops.blocks.push(...leagueBlocks(ops.league, today, newId));

  // Americanas: una jugada el viernes pasado y otra abierta para el próximo.
  let lastFriday = addDays(today, -7);
  while (weekdayIndex(lastFriday) !== 4) lastFriday = addDays(lastFriday, 1);
  if (lastFriday >= today) lastFriday = addDays(lastFriday, -7);
  const nextFriday =
    addDays(lastFriday, 7) > today
      ? addDays(lastFriday, 7)
      : addDays(lastFriday, 14);
  const amCourts = ["r1", "r2", "r3"];
  const pastPlayers = Array.from({ length: 12 }, (_, i) => {
    const c = data.clients[(i * 5) % data.clients.length];
    return {
      id: `ap${i + 1}`,
      name: c.name,
      phone: c.phone,
      clientId: c.id,
      level: ops.levels[c.id]?.level,
      paid: true,
    };
  });
  const past: ProAmericana = {
    id: "am1",
    name: "Americana de los viernes",
    date: lastFriday,
    from: 19 * 60,
    roundMinutes: 20,
    roundsPlanned: 6,
    resourceIds: amCourts,
    level: "3,0",
    maxPlayers: 12,
    pricePerPlayerCents: 1200,
    status: "done",
    players: pastPlayers,
    rounds: americanaRounds(
      pastPlayers.map((p) => p.id),
      amCourts,
      6,
    ).map((round) => ({
      ...round,
      games: round.games.map((g) => {
        const a = r.int(2, 6);
        return { ...g, scoreA: a, scoreB: a === 6 ? r.int(1, 5) : 6 };
      }),
    })),
    studentsOnly: false,
    createdAt: atLocal(addDays(lastFriday, -10), 11 * 60),
  };
  const nextPlayers = Array.from({ length: 9 }, (_, i) => {
    const c = data.clients[(i * 7 + 3) % data.clients.length];
    return {
      id: `np${i + 1}`,
      name: c.name,
      phone: c.phone,
      clientId: c.id,
      level: ops.levels[c.id]?.level,
      paid: i < 6,
    };
  });
  ops.americanas = [
    past,
    {
      id: "am2",
      name: "Americana universitaria",
      date: nextFriday,
      from: 19 * 60,
      roundMinutes: 20,
      roundsPlanned: 6,
      resourceIds: amCourts,
      level: "2,5 a 3,5",
      maxPlayers: 12,
      pricePerPlayerCents: 1000,
      status: "open",
      players: nextPlayers,
      rounds: [],
      studentsOnly: true,
      createdAt: atLocal(addDays(today, -3), 10 * 60),
    },
  ];
  for (const id of amCourts) clearSlot(data, id, nextFriday, 19 * 60, 21 * 60);
  ops.blocks.push({
    id: newId("blk"),
    resourceIds: amCourts,
    date: nextFriday,
    from: 19 * 60,
    to: 21 * 60,
    reason: "tournament",
    note: "Americana universitaria",
    sourceId: "am2",
  });

  // Mantenimiento mañana a primera hora y un evento privado el sábado.
  clearSlot(data, "r2", tomorrow, 8 * 60, 9 * 60 + 30);
  ops.blocks.push({
    id: newId("blk"),
    resourceIds: ["r2"],
    date: tomorrow,
    from: 8 * 60,
    to: 9 * 60 + 30,
    reason: "maintenance",
    note: "Cambio de red y cepillado del césped",
  });
  let saturday = addDays(today, 1);
  while (weekdayIndex(saturday) !== 5) saturday = addDays(saturday, 1);
  for (const id of ["r4", "r5"]) clearSlot(data, id, saturday, 10 * 60, 13 * 60);
  ops.blocks.push({
    id: newId("blk"),
    resourceIds: ["r4", "r5"],
    date: saturday,
    from: 10 * 60,
    to: 13 * 60,
    reason: "private",
    note: "Torneo de empresa, Grupo Levante",
  });

  // Turnos fijos: tres grupos que juegan cada semana hasta junio. El del
  // viernes choca con la americana y queda para resolver.
  let working: ProData = { ...data, courts: ops };
  const seriesSeeds = [
    { resourceId: "r4", weekday: 1, from: 19 * 60 + 30, client: data.clients[2] },
    { resourceId: "r5", weekday: 3, from: 20 * 60, client: data.clients[8] },
    { resourceId: "r2", weekday: 4, from: 19 * 60 + 30, client: data.clients[15] },
  ];
  seriesSeeds.forEach((s, i) => {
    for (let d = -6; d <= 6; d++) {
      const date = addDays(today, d);
      if (weekdayIndex(date) === s.weekday)
        clearSlot(working, s.resourceId, date, s.from, s.from + 90);
    }
    const created = createSeries(
      working,
      {
        resourceId: s.resourceId,
        weekday: s.weekday,
        from: s.from,
        duration: 90,
        startDate: addDays(today, -6),
        until: endOfCourse(today),
        clientId: s.client.id,
        clientName: s.client.name,
        phone: s.client.phone,
      },
      { id: `tf${i + 1}`, now: atLocal(addDays(today, -40), 11 * 60), newId },
    );
    working = created.data;
  });
  // Las semanas ya jugadas quedan cobradas.
  const seriesIds = new Set(
    (working.courts?.series ?? []).flatMap((s) => s.bookingIds),
  );
  working.bookings = working.bookings.map((b) =>
    seriesIds.has(b.id) && Date.parse(b.end) <= now.getTime()
      ? { ...b, status: "done", paidCents: b.priceCents }
      : b,
  );

  // Pago por jugador en las reservas de hoy y mañana.
  const courtIds = new Set(["r1", "r2", "r3", "r4", "r5", "r6"]);
  const splits: Record<string, ProPlayerShare[]> = {};
  working.bookings = working.bookings.map((b) => {
    const date = localDate(b.start);
    if (
      !b.resourceId ||
      !courtIds.has(b.resourceId) ||
      (date !== today && date !== tomorrow) ||
      b.status === "cancelled" ||
      b.status === "done" ||
      !b.priceCents ||
      b.partySize < 4 ||
      !r.chance(0.6)
    )
      return b;
    const paidCount =
      b.source === "franky" || b.source === "hueco"
        ? 4
        : r.pick([0, 1, 2, 3, 3]);
    const each = Math.floor(b.priceCents / 4 / 5) * 5;
    const names = [b.clientName, personName(r), personName(r), personName(r)];
    splits[b.id] = names.map((name, k) => ({
      name,
      clientId: k === 0 ? b.clientId : undefined,
      phone: k === 0 ? undefined : phoneOf(r),
      paidCents:
        k < paidCount ? (k === 3 ? b.priceCents - each * 3 : each) : 0,
      method:
        k < paidCount ? r.pick(["card", "bizum", "cash"] as const) : undefined,
      paidAt: k < paidCount ? nowIso : undefined,
    }));
    const paid = splits[b.id].reduce((a, s) => a + s.paidCents, 0);
    return { ...b, paidCents: paid };
  });

  // Lista de espera en las horas punta de hoy y mañana.
  const waitSeeds = [
    { date: today, from: 19 * 60 },
    { date: today, from: 20 * 60 },
    { date: today, from: 20 * 60 },
    { date: tomorrow, from: 18 * 60 + 30 },
  ];
  const waitlist: ProWaitEntry[] = waitSeeds.map((w, i) => ({
    id: `le${i + 1}`,
    date: w.date,
    from: w.from,
    duration: 90,
    name: personName(r),
    phone: phoneOf(r),
    createdAt: new Date(now.getTime() - (5 - i) * 3600000).toISOString(),
    status: "waiting",
  }));

  // Bonos y monedero: cliente, tipo, nombre, total, quedan, precio, días.
  const passSeeds: [
    number,
    ProCourtPass["kind"],
    string,
    number,
    number,
    number,
    number,
  ][] = [
    [0, "matches", "Bono 10 partidos", 10, 1, 32000, 60],
    [3, "matches", "Bono 10 partidos", 10, 6, 32000, 90],
    [6, "hours", "Bono mañanas 10 horas", 10, 4.5, 12000, 45],
    [9, "wallet", "Monedero 100 €", 11000, 640, 10000, 180],
    [12, "matches", "Bono 5 partidos", 5, 3, 16500, 40],
    [18, "wallet", "Monedero 50 €", 5500, 3450, 5000, 150],
    [21, "hours", "Bono mañanas 10 horas", 10, 1, 12000, 6],
    [27, "matches", "Bono 10 partidos", 10, 9, 32000, 120],
  ];
  const passes: ProCourtPass[] = passSeeds.map(
    ([ci, kind, label, total, left, price, days], i) => {
      const c = data.clients[ci % data.clients.length];
      return {
        id: `bn${i + 1}`,
        clientId: c.id,
        name: c.name,
        phone: c.phone,
        kind,
        label,
        total,
        left,
        priceCents: price,
        soldAt: atLocal(addDays(today, -r.int(10, 60)), 18 * 60),
        expiresAt: atLocal(addDays(today, days), 23 * 60),
        uses: [],
      };
    },
  );

  const shop: ProShopItem[] = [
    { id: "it1", name: "Alquiler de pala", kind: "rental", priceCents: 300, stock: null },
    { id: "it2", name: "Bote de 3 bolas", kind: "sale", priceCents: 600, stock: 18 },
    { id: "it3", name: "Agua 50 cl", kind: "sale", priceCents: 150, stock: 36 },
    { id: "it4", name: "Bebida isotónica", kind: "sale", priceCents: 220, stock: 4 },
    { id: "it5", name: "Overgrip", kind: "sale", priceCents: 250, stock: 30 },
  ];

  const penalties: ProCourtPenalty[] = [
    {
      id: "pn1",
      bookingId: "hist-1",
      clientId: data.clients[4].id,
      clientName: data.clients[4].name,
      at: atLocal(addDays(today, -9), 20 * 60),
      kind: "no_show",
      amountCents: 1800,
      status: "charged",
    },
    {
      id: "pn2",
      bookingId: "hist-2",
      clientId: data.clients[20].id,
      clientName: data.clients[20].name,
      at: atLocal(addDays(today, -4), 13 * 60),
      kind: "late_cancel",
      amountCents: 1200,
      status: "forgiven",
    },
  ];

  // Convenios: la universidad de al lado (mañanas a precio pactado para sus
  // estudiantes verificados) y una asociación con sus socios apuntados.
  const course = `${seasonYear}-09-01`;
  const agreements: ProCourtAgreement[] = [
    {
      id: "cv1",
      name: "Deportes UA",
      kind: "university",
      university: "Universidad de Alicante",
      memberIds: [],
      discountPct: 20,
      valleyOnly: true,
      from: course,
      to: `${seasonYear + 1}-07-31`,
      contact: { name: "Nuria Pastor", phone: "611 204 318" },
      active: true,
      createdAt: atLocal(course, 10 * 60),
    },
    {
      id: "cv2",
      name: "Club Deportivo Politécnica",
      kind: "association",
      memberIds: [1, 5, 9, 14, 17, 23].map(
        (i) => data.clients[i % data.clients.length].id,
      ),
      discountPct: 10,
      valleyOnly: false,
      from: course,
      to: `${seasonYear + 1}-06-30`,
      contact: { name: "Álvaro Mira", phone: "622 918 407" },
      active: true,
      createdAt: atLocal(addDays(course, 12), 18 * 60),
    },
  ];

  // Las reservas ya jugadas por sus miembros se cobraron con el precio
  // pactado (las que se pagan por jugador se dejan como están).
  const pacted = new Map<string, number>();
  for (const b of working.bookings) {
    if (b.status !== "done" || !b.resourceId || splits[b.id]) continue;
    const c = working.clients.find((x) => x.id === b.clientId);
    const date = localDate(b.start);
    const from = localMinutes(b.start);
    const deal = agreements
      .filter((a) => isAgreementMember(a, c) && agreementApplies(a, date, from))
      .sort((a, b2) => b2.discountPct - a.discountPct)[0];
    if (deal) pacted.set(b.id, agreementPrice(b.priceCents, deal.discountPct));
  }
  const bookings = working.bookings.map((b) => {
    const price = pacted.get(b.id);
    if (price === undefined) return b;
    return {
      ...b,
      priceCents: price,
      paidCents: b.paidCents === null ? null : Math.min(b.paidCents, price),
    };
  });
  const payments = working.payments.map((p) => {
    const price = p.bookingId ? pacted.get(p.bookingId) : undefined;
    return price === undefined ? p : { ...p, amountCents: Math.min(p.amountCents, price) };
  });

  return {
    ...working,
    bookings,
    payments,
    courts: {
      ...(working.courts ?? ops),
      splits,
      waitlist,
      passes,
      shop,
      penalties,
      agreements,
    },
  };
}

function seedStudyOps(data: ProData, now: Date): ProData {
  const r = rng(seedFor("coworking") + 23);
  const newId = counterIds("dm");
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const ops = emptyCourtsData();
  ops.policy = {
    ...ops.policy,
    noticeHours: 12,
    penaltyPct: 0,
    releaseAfterMinutes: 30,
  };
  ops.amenities = [
    "silencio",
    "portatil",
    "salas",
    "taquillas",
    "enchufes",
    "wifi",
    "cafe",
    "impresora",
    "clima",
  ];
  ops.rules = [
    "Silencio total en la zona de silencio: las llamadas, fuera.",
    "El puesto no se guarda: si sales más de 30 minutos, se libera.",
    "Solo agua y bebidas con tapa en los puestos. Para comer, la zona de café.",
    "Deja el puesto como lo encontraste y la lámpara apagada.",
    "Las salas de grupo son para trabajar en grupo, no para estudiar solo.",
  ];
  ops.roomAllowance = { pl3: 240 };

  // Puestos numerados: silencio S-01 a S-14 y portátil P-01 a P-08.
  const seats: ProSeat[] = [
    ...Array.from({ length: 14 }, (_, i) => ({
      id: `st-s${i + 1}`,
      resourceId: "r1",
      label: `S-${String(i + 1).padStart(2, "0")}`,
      plug: true,
      lamp: i % 2 === 0,
      group:
        i >= 10
          ? "Opositores de Justicia"
          : i < 4
            ? "Mesa de Derecho"
            : undefined,
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `st-p${i + 1}`,
      resourceId: "r2",
      label: `P-${String(i + 1).padStart(2, "0")}`,
      plug: true,
      lamp: false,
    })),
  ];
  const monthly = data.members.filter(
    (m) => m.planId === "pl3" && m.status === "active",
  );
  [5, 11, 12].forEach((seatIndex, i) => {
    const m = monthly[i];
    if (!m) return;
    seats[seatIndex] = {
      ...seats[seatIndex],
      fixedMemberId: m.id,
      fixedName: m.name,
    };
  });
  ops.seats = seats;

  // Hoy casi todos los que ya empezaron han llegado; dos llevan más de media
  // hora de retraso y su puesto se puede liberar.
  let late = 0;
  let bookings = data.bookings.map((b) => {
    if (b.resourceId !== "r1" && b.resourceId !== "r2") return b;
    if (
      localDate(b.start) === today &&
      b.status === "arrived" &&
      late < 2 &&
      nowMin - localMinutes(b.start) >= 40 &&
      Date.parse(b.end) > now.getTime()
    ) {
      late++;
      return { ...b, status: "confirmed" as const };
    }
    return b;
  });
  const checkins: Record<string, { inAt?: string; outAt?: string }> = {};
  for (const b of bookings) {
    if (b.resourceId !== "r1" && b.resourceId !== "r2") continue;
    if (b.status !== "arrived" && b.status !== "done") continue;
    checkins[b.id] = {
      inAt: new Date(Date.parse(b.start) + r.int(0, 25) * 60000).toISOString(),
      outAt:
        b.status === "done"
          ? new Date(Date.parse(b.end) - r.int(0, 40) * 60000).toISOString()
          : undefined,
    };
  }
  ops.checkins = checkins;

  // Cada persona que está dentro ahora tiene su puesto.
  const seatByBooking: Record<string, string> = {};
  for (const zone of ["r1", "r2"]) {
    const inside = bookings.filter(
      (b) =>
        b.resourceId === zone &&
        b.status === "arrived" &&
        localDate(b.start) === today &&
        Date.parse(b.end) > now.getTime(),
    );
    const zoneSeats = seats.filter((s) => s.resourceId === zone);
    const used = new Set<string>();
    for (const b of inside) {
      const own = zoneSeats.find(
        (s) => s.fixedMemberId && s.fixedMemberId === b.clientId,
      );
      const seat =
        own ?? zoneSeats.find((s) => !s.fixedMemberId && !used.has(s.id));
      if (!seat) continue;
      used.add(seat.id);
      seatByBooking[b.id] = seat.id;
    }
  }
  ops.seatByBooking = seatByBooking;

  // Taquillas: 20, la mayoría alquiladas junto a la cuota.
  ops.lockers = Array.from({ length: 20 }, (_, i) => {
    const label = `T-${String(i + 1).padStart(2, "0")}`;
    const m = data.members[i * 2];
    if (i >= 13 || !m || m.status === "cancelled")
      return { id: `tq${i + 1}`, label };
    const until =
      i === 3 || i === 9
        ? addDays(today, -r.int(2, 9))
        : addDays(today, r.int(4, 40));
    return { id: `tq${i + 1}`, label, memberId: m.id, name: m.name, until };
  });

  // Horario de exámenes de enero, ya anunciado en Franky, y una noche de
  // estudio antes de los parciales por anunciar.
  const [year, month] = today.split("-").map(Number);
  const janYear = month >= 2 ? year + 1 : year;
  ops.specialHours = [
    {
      id: "hs1",
      from: `${janYear}-01-08`,
      to: `${janYear}-02-03`,
      open: 8 * 60,
      close: 26 * 60,
      label: "Exámenes de enero",
      announced: true,
    },
    {
      id: "hs2",
      from: addDays(today, 5),
      to: addDays(today, 6),
      open: 8 * 60,
      close: 24 * 60,
      label: "Noche de parciales",
      announced: false,
    },
  ];

  const m = data.members;
  ops.warnings = [
    { id: "av1", name: m[14].name, memberId: m[14].id, kind: "phone", note: "Llamada en la zona de silencio", at: atLocal(addDays(today, -12), 17 * 60) },
    { id: "av2", name: m[14].name, memberId: m[14].id, kind: "saving", note: "Dejó el puesto guardado dos horas", at: atLocal(addDays(today, -3), 11 * 60) },
    { id: "av3", name: m[21].name, memberId: m[21].id, kind: "food", at: atLocal(addDays(today, -6), 13 * 60 + 30) },
    { id: "av4", name: m[30].name, memberId: m[30].id, kind: "noise", note: "Hablaba en voz alta con su grupo", at: atLocal(addDays(today, -1), 19 * 60) },
  ];
  ops.memberNoShows = { [m[9].id]: 3, [m[17].id]: 1 };

  // Horas de sala incluidas en la cuota mensual ya usadas este mes.
  const roomCredit: Record<string, number> = {};
  const monthlyIds = new Set(monthly.map((x) => x.id));
  bookings = bookings.map((b) => {
    if (
      (b.resourceId === "r3" || b.resourceId === "r4") &&
      b.clientId &&
      monthlyIds.has(b.clientId) &&
      localDate(b.start).slice(0, 7) === today.slice(0, 7)
    ) {
      roomCredit[b.id] = bookingMinutesOf(b.start, b.end);
      return { ...b, priceCents: 0, paidCents: 0 };
    }
    return b;
  });
  ops.roomCredit = roomCredit;

  ops.shop = [
    { id: "it1", name: "Café", kind: "sale", priceCents: 120, stock: null },
    { id: "it2", name: "Impresión de 10 hojas", kind: "sale", priceCents: 100, stock: null },
    { id: "it3", name: "Candado para taquilla", kind: "sale", priceCents: 500, stock: 6 },
  ];

  ops.cashClosings = [
    {
      id: newId("cc"),
      date: addDays(today, -1),
      at: atLocal(addDays(today, -1), 23 * 60 + 5),
      expectedCashCents: 4200,
      countedCashCents: 4000,
      by: "Celia Gómez",
    },
  ];

  // Lo que cubre la cuota no pasa por caja.
  const payments = data.payments.filter(
    (p) => !p.bookingId || !roomCredit[p.bookingId],
  );

  // Datos fiscales y las primeras facturas del mes, para que Caja enseñe la
  // numeración correlativa tal y como queda en la cuenta real.
  ops.fiscal = {
    name: "Sala Silencio Estudio SL",
    nif: "B54837216",
    address: "Calle Pintor Picasso 14, 03690 San Vicente del Raspeig",
    vatPct: 21,
  };
  const invoiceSeeds: [string, string, string | undefined, string | undefined, number, string][] = [
    ["T", "Irene Soler", undefined, undefined, 5500, "Bono 10 días"],
    ["F", "Academia Opositas Levante SL", "B42985119", "Avenida de Novelda 51, 03009 Alicante", 18000, "Sala de grupo, 12 h"],
    ["T", "Pablo Ferrández", undefined, undefined, 1200, "Pase de día"],
  ];
  ops.invoices = invoiceSeeds.map(([series, name, nif, address, total, concept], i) => {
    const base = Math.round(total / 1.21);
    const date = addDays(today, -(6 - i * 2));
    const year = Number(date.slice(0, 4));
    // Correlativa por serie y año, también si la semana cruza el 1 de enero.
    const seq = invoiceSeeds
      .slice(0, i + 1)
      .filter((s, k) => s[0] === series && addDays(today, -(6 - k * 2)).slice(0, 4) === date.slice(0, 4)).length;
    return {
      id: `fc${i + 1}`,
      series: series as "F" | "T",
      year,
      seq,
      number: `${series}${year}-${String(seq).padStart(4, "0")}`,
      date,
      customer: { name, nif, address },
      lines: [{ concept, amountCents: total }],
      totalCents: total,
      baseCents: base,
      vatCents: total - base,
      vatPct: 21,
      createdAt: atLocal(date, 18 * 60),
    };
  });

  return { ...data, bookings, payments, courts: ops };
}

function bookingMinutesOf(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 60000);
}
