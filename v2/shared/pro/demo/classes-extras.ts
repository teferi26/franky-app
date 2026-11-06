import type { ProBooking, ProData, ProMember, ProPayment, ProVerticalId } from "../types";
import type {
  ProBoardBlock,
  ProChargeMethod,
  ProClassesExtras,
  ProLeaveReason,
  ProMemberCare,
  ProMemberCharge,
  ProPauseReason,
  ProRoomBooking,
  ProTrialOutcome,
} from "../classes-types";
import { addDays, atLocal, localDate, localMinutes, weekdayIndex } from "../format";
import { deriveRoster, isRoomMode, memberPrice, priceForPlayers } from "../classes";
import { BUNDLE_DAYS, emptyClassExtras, monthOf, shiftMonth } from "../classes-care";
import { rng, seedFor, type Rng } from "./common";

/**
 * Datos de cuidado y operación de la demo del motor de clases: última visita
 * de cada socio, pausas con vuelta, bonos con caducidad, cobros de los tres
 * últimos meses, clases de prueba de ayer por cerrar, la pizarra del día y la
 * configuración de las salas del escape room. Todo sale de una semilla propia
 * para no alterar el resto de la demo y ser estable entre visitas.
 */

/**
 * Unos cuantos socios recién llegados, repartidos para que el recorrido de
 * bienvenida tenga toques pendientes hoy (semana 1, 2, 4, 8 y 12).
 */
export function welcomeCohort(members: ProMember[], now: Date): ProMember[] {
  const today = localDate(now);
  const offsets = [7, 15, 29, 57, 85, 3];
  let i = 0;
  return members.map((m) => {
    if (m.status !== "active" || i >= offsets.length) return m;
    const since = atLocal(addDays(today, -offsets[i++]), 12 * 60);
    return { ...m, since };
  });
}

const HEALTH_SPORTS = [
  "Hombro derecho operado: sin kipping ni snatch por encima de la cabeza.",
  "Lumbalgia: nada de peso muerto pesado este mes.",
  "Rodilla izquierda: sin saltos al cajón, step up en su lugar.",
  "Asma leve, lleva el inhalador en la mochila.",
  "Embarazada de 5 meses: escala todo, sin abdominales.",
  "Esguince de tobillo reciente: nada de comba.",
];

const HEALTH_ACADEMY = [
  "Dislexia: darle un 25 % más de tiempo en los simulacros.",
  "Prefiere sentarse delante, le cuesta ver la pizarra.",
  "Ansiedad ante los exámenes: repasar técnicas de gestión del tiempo.",
];

const BOARD_WOD: ProBoardBlock[] = [
  {
    id: "b1",
    title: "Calentamiento",
    body: "3 rondas: 250 m de remo, 10 sentadillas al aire, 10 pasos de oso, 5 inchworms.",
  },
  {
    id: "b2",
    title: "Fuerza",
    body: "Back squat 5 x 5 al 70 al 75 % de tu 1RM. Descanso de 2 min entre series.",
  },
  {
    id: "b3",
    title: "WOD",
    body: "AMRAP 14 min: 12 wall balls, 9 box jumps, 6 dominadas. Escalado: 9 kg, step up, dominadas con goma.",
  },
];

const BOARD_YOGA: ProBoardBlock[] = [
  { id: "b1", title: "Apertura", body: "Respiración en suelo, 5 min." },
  { id: "b2", title: "Práctica", body: "Movilidad de cadera y columna, saludos al sol A y B, equilibrios." },
  { id: "b3", title: "Cierre", body: "Estiramientos de isquios y savasana." },
];

function daysAgoIso(today: string, days: number, minute = 19 * 60): string {
  return atLocal(addDays(today, -days), minute);
}

/** Cuidado de cada socio: última visita, salud, pausas, bajas y bonos. */
function makeCare(r: Rng, data: ProData, vertical: ProVerticalId, now: Date): Record<string, ProMemberCare> {
  const today = localDate(now);
  const care: Record<string, ProMemberCare> = {};
  const health = vertical === "academy" ? HEALTH_ACADEMY : HEALTH_SPORTS;
  const pauseReasons: ProPauseReason[] = vertical === "academy" ? ["exams", "summer", "travel"] : ["summer", "injury", "exams", "travel"];
  const leaveReasons: ProLeaveReason[] = ["price", "schedule", "moving", "exams", "results", "other"];
  let healthIdx = 0;
  let pauseIdx = 0;
  let leaveIdx = 0;
  let riskContacted = false;

  data.members.forEach((m, i) => {
    const c: ProMemberCare = {};
    // Última visita coherente con la asistencia del mes.
    if (m.status === "active" || m.status === "overdue") {
      const away = m.attendanceLast30 >= 8 ? r.int(0, 3) : m.attendanceLast30 >= 4 ? r.int(2, 8) : r.int(9, 24);
      c.lastVisitAt = daysAgoIso(today, away, r.pick([7 * 60, 14 * 60, 18 * 60, 19 * 60]));
      if (!riskContacted && away >= 14) {
        c.contactedAt = atLocal(addDays(today, -2), 11 * 60);
        riskContacted = true;
      }
    }
    if (m.status === "trial") c.lastVisitAt = daysAgoIso(today, r.int(0, 2));
    if (i % 9 === 2 && healthIdx < health.length && m.status !== "cancelled") c.health = health[healthIdx++];
    if (m.status === "paused") {
      const reason = pauseReasons[pauseIdx % pauseReasons.length];
      // La primera pausa vuelve en tres días: sale en Hoy como "vuelve esta semana".
      c.pausedUntil = pauseIdx === 0 ? addDays(today, 3) : addDays(today, 18 + pauseIdx * 9);
      c.pauseReason = reason;
      c.pausedInsteadOfLeaving = pauseIdx % 2 === 0;
      pauseIdx++;
    }
    if (m.status === "cancelled") c.leaveReason = leaveReasons[leaveIdx++ % leaveReasons.length];
    const plan = data.plans.find((p) => p.id === m.planId);
    if (plan?.period === "pack" && plan.sessions && plan.sessions > 1) {
      const used = plan.sessions - (m.sessionsLeft ?? 0);
      c.bundleExpiresOn = addDays(today, Math.max(2, BUNDLE_DAYS - used * 7 - r.int(0, 40)));
    }
    // Recorrido de bienvenida: los toques anteriores al de hoy ya están hechos.
    const age = Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${localDate(m.since)}T12:00:00Z`).getTime()) / 86400000);
    if (age <= 91) c.touchesDone = [1, 2, 4, 8, 12].filter((w) => w * 7 < age - 1);
    if (Object.keys(c).length) care[m.id] = c;
  });

  // Faltas sin avisar y clases por recuperar.
  const active = data.members.filter((m) => m.status === "active");
  active.slice(0, 5).forEach((m, i) => {
    care[m.id] = { ...care[m.id], noShows: i === 0 ? 3 : i < 3 ? 1 : 0 };
  });
  if (vertical === "academy") {
    const past = data.sessions.filter((s) => localDate(s.start) < today && localDate(s.start) >= addDays(today, -14));
    active.slice(2, 5).forEach((m, i) => {
      const s = past[i * 2] ?? past[0];
      if (!s) return;
      const missed = localDate(s.start);
      care[m.id] = {
        ...care[m.id],
        recoveries: [{ id: `rc${i + 1}`, fromSessionId: s.id, missedOn: missed, expiresOn: addDays(missed, 30) }],
      };
    });
    active.slice(0, 18).forEach((m, i) => {
      care[m.id] = { ...care[m.id], nextCourse: i % 3 === 0 ? "pending" : "confirmed" };
    });
  }
  return care;
}

/** Cuotas de los tres últimos meses con su estado y su recibo. */
function makeCharges(r: Rng, data: ProData, now: Date): { charges: ProMemberCharge[]; seq: number } {
  const today = localDate(now);
  const current = monthOf(today);
  const charges: ProMemberCharge[] = [];
  let seq = 0;
  const receipt = (paidAt: string) => `R${paidAt.slice(0, 4)}-${String(++seq).padStart(4, "0")}`;
  const methods: ProChargeMethod[] = ["sepa", "sepa", "sepa", "card", "card", "bizum", "cash", "transfer"];

  data.members.forEach((m) => {
    const plan = data.plans.find((p) => p.id === m.planId);
    if (!plan || plan.period === "pack" || m.status === "trial" || m.status === "cancelled") return;
    const amount = memberPrice(m, plan);
    const concept = `Cuota ${plan.name}`;
    const method = r.pick(methods);
    // Día del mes en que se cobra: el de su próximo cobro, o el día de alta.
    const anchor = m.nextChargeAt ? localDate(m.nextChargeAt) : localDate(m.since);
    const day = anchor.slice(8, 10);
    for (let back = 2; back >= 0; back--) {
      const period = shiftMonth(current, -back);
      const dueOn = `${period}-${day > "28" ? "28" : day}`;
      if (dueOn < localDate(m.since)) continue;
      if (m.status === "paused" && back === 0) continue;
      const base = { id: `ch-${m.id}-${period}`, memberId: m.id, memberName: m.name, period, concept, amountCents: amount, dueOn };
      if (back > 0 || (dueOn <= today && m.status !== "overdue")) {
        const paidAt = atLocal(dueOn, 9 * 60 + r.int(0, 600));
        charges.push({ ...base, status: "paid", method, paidAt, receiptNo: receipt(paidAt) });
      } else if (m.status === "overdue") {
        // Los recibos domiciliados vuelven devueltos; el resto queda pendiente.
        const returned = method === "sepa";
        charges.push({
          ...base,
          dueOn: localDate(m.nextChargeAt ?? atLocal(dueOn, 9 * 60)),
          status: returned ? "returned" : "pending",
          method: returned ? "sepa" : undefined,
        });
      } else {
        charges.push({ ...base, status: "pending" });
      }
    }
  });
  return { charges, seq };
}

/** Clases de prueba de ayer, guardadas como reservas, para cerrar hoy. */
function yesterdayTrials(data: ProData, now: Date): ProBooking[] {
  const today = localDate(now);
  const yesterday = addDays(today, -1);
  const clients = data.clients.filter((c) => c.student?.verified).slice(4, 7);
  const sessions = data.sessions
    .filter((s) => localDate(s.start) === yesterday && s.booked > 3)
    .sort((a, b) => b.booked - a.booked)
    .slice(0, clients.length);
  const out: ProBooking[] = [];
  sessions.forEach((s, i) => {
    const roster = deriveRoster(data, s, now);
    const idx = roster.findIndex((b) => b.status === "arrived");
    const c = clients[i];
    if (idx < 0 || !c) return;
    roster[idx] = {
      ...roster[idx],
      clientId: c.id,
      clientName: c.name,
      trial: true,
      source: "franky",
      student: true,
      status: i === 2 ? "no_show" : "arrived",
    };
    out.push(...roster);
  });
  return out;
}

/** Historial de pruebas cerradas, para la conversión por coach. */
function pastTrialOutcomes(data: ProData, now: Date): ProTrialOutcome[] {
  const coaches = data.staff.filter((s) => s.role !== "reception").map((s) => s.id);
  const reasons = ["Le pilla lejos", "Prefiere entrenar por libre", "Lo decide en enero", "Precio"];
  const list: ProTrialOutcome[] = [];
  for (let i = 0; i < 14; i++) {
    const joined = i % 3 !== 2;
    list.push({
      bookingId: `hist-${i + 1}`,
      sessionId: "",
      clientName: `Prueba ${i + 1}`,
      coachId: coaches[i % coaches.length] ?? "",
      outcome: joined ? "joined" : "declined",
      reason: joined ? undefined : reasons[i % reasons.length],
      at: atLocal(addDays(localDate(now), -(3 + i * 3)), 20 * 60),
    });
  }
  return list;
}

/* ------------------------------------------------------------------ */

export function seedClassExtras(vertical: ProVerticalId, data: ProData, now: Date): ProData {
  const r = rng(seedFor(vertical) ^ 0x5eed);
  const today = localDate(now);
  const x: ProClassesExtras = {
    ...emptyClassExtras(),
    policy: {
      freeChangeHours: vertical === "culture" ? 48 : 12,
      lateNoticeVoucher: true,
      courtesyMin: 10,
      reviewUrl: `https://franky.es/n/${data.space.slug}`,
    },
  };

  if (vertical === "culture") return seedCulture(r, data, x, now);

  x.members = makeCare(r, data, vertical, now);
  const { charges, seq } = makeCharges(r, data, now);
  x.charges = charges;
  x.receiptSeq = seq;
  x.trials = pastTrialOutcomes(data, now);

  // Pizarra de hoy en las clases del box.
  if (vertical === "sports") {
    for (const s of data.sessions) {
      if (localDate(s.start) !== today) continue;
      if (s.classTypeId === "ct1") x.sessions[s.id] = { board: BOARD_WOD };
      if (s.classTypeId === "ct4") x.sessions[s.id] = { board: BOARD_YOGA };
    }
  }

  // Fechas de examen de los grupos de la academia (convocatorias de la UA).
  if (vertical === "academy") {
    const year = Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 2 ? 1 : 0);
    x.types = {
      ct1: { examOn: `${year}-01-14` },
      ct2: { examOn: addDays(today, 38) },
      ct3: { examOn: addDays(today, 52) },
      ct4: { examOn: `${year}-01-20` },
    };
  }

  const trials = yesterdayTrials({ ...data, classExtras: x }, now);
  return { ...data, bookings: [...data.bookings, ...trials], classExtras: x };
}

/* ------------------------------------------------------------------ */
/* Escape room y taller                                                */
/* ------------------------------------------------------------------ */

const NOTES = [
  "Cumpleaños de Irene, traen tarta",
  "Primera vez en un escape room",
  "Quieren la foto para Instagram",
  "Vienen de la delegación de Derecho",
  "Una persona con movilidad reducida: sala 1 accesible",
];

const FOUND = ["Franky", "Instagram", "Google", "Se lo contó un amigo", "Franky"];

function seedCulture(r: Rng, data: ProData, x: ProClassesExtras, now: Date): ProData {
  const today = localDate(now);
  const escape = [
    { players: 2, priceCents: 5000, studentPriceCents: 4400 },
    { players: 3, priceCents: 6000, studentPriceCents: 5100 },
    { players: 4, priceCents: 7000, studentPriceCents: 6000 },
    { players: 5, priceCents: 7800, studentPriceCents: 6500 },
    { players: 6, priceCents: 8400, studentPriceCents: 7000 },
  ];
  x.types = {
    ct1: { roomMode: { minPlayers: 2, maxPlayers: 6 }, setupMin: 15, playerPrices: escape },
    ct2: { roomMode: { minPlayers: 2, maxPlayers: 6 }, setupMin: 15, playerPrices: escape },
    ct3: { setupMin: 0 },
  };
  x.staff = {
    s1: { languages: ["es", "en"], rooms: ["Sala 1", "Sala 2"] },
    s2: { languages: ["es"], rooms: ["Sala 1", "Sala 2"] },
    s3: { languages: ["es", "en"], rooms: ["Sala 2"] },
    s4: { languages: ["es", "en"], rooms: ["Taller"] },
  };
  x.reviews = { asked: 64, received: 41 };

  const withTypes: ProData = { ...data, classExtras: x };

  // Los jueves por la tarde, sesiones en inglés para Erasmus.
  for (const s of data.sessions) {
    if (weekdayIndex(localDate(s.start)) === 3 && localMinutes(s.start) >= 19 * 60 && isRoomMode(withTypes, data.classTypes.find((c) => c.id === s.classTypeId))) {
      x.sessions[s.id] = { language: "en" };
    }
  }

  // Ficha de las reservas de hoy y de mañana (se guardan como reservas).
  const tomorrow = addDays(today, 1);
  const extra: ProBooking[] = [];
  const saved = new Set(data.bookings.map((b) => b.sessionId));
  for (const s of data.sessions) {
    const day = localDate(s.start);
    if (day === tomorrow && s.booked && !saved.has(s.id)) extra.push(...deriveRoster(withTypes, s, now));
  }
  // Las reservas de hoy se crearon antes de tener la tabla de precios de cada
  // sala: se recalculan con ella para que caja y fichas cuadren.
  const bookings = [...data.bookings, ...extra].map((b) => {
    const s = data.sessions.find((x2) => x2.id === b.sessionId);
    if (!s || !isRoomMode(withTypes, data.classTypes.find((c) => c.id === s.classTypeId))) return b;
    const price = priceForPlayers(x.types[s.classTypeId]?.playerPrices, b.partySize, Boolean(b.student));
    return { ...b, priceCents: price, paidCents: b.paidCents ? price : b.paidCents };
  });
  const priceById = new Map(bookings.map((b) => [b.id, b.priceCents]));
  let n = 0;
  for (const b of bookings) {
    const s = data.sessions.find((x2) => x2.id === b.sessionId);
    if (!s) continue;
    const day = localDate(s.start);
    if (day !== today && day !== tomorrow) continue;
    const info: ProRoomBooking = {
      players: b.partySize,
      phone: `6${r.int(10, 99)} ${r.int(100, 999)} ${r.int(100, 999)}`,
      howFound: FOUND[n % FOUND.length],
      language: x.sessions[s.id]?.language,
    };
    if (n % 4 === 0) info.notes = NOTES[(n / 4) % NOTES.length];
    if (n % 6 === 1) info.minors = true;
    if (n === 0) info.birthdayOf = "Irene";
    // Ayer por la tarde se mandaron algunos recordatorios de hoy.
    if (day === today && n % 2 === 0) info.remindedAt = atLocal(addDays(today, -1), 18 * 60);
    x.roomBookings[b.id] = info;
    n++;
  }

  // La caja de hoy con formas de pago reales del mostrador.
  const methods: ProPayment["method"][] = ["card", "card", "bizum", "cash"];
  const payments = data.payments.map((p, i) => {
    const amountCents = p.bookingId ? priceById.get(p.bookingId) ?? p.amountCents : p.amountCents;
    return localDate(p.at) === today ? { ...p, amountCents, method: methods[i % methods.length] } : { ...p, amountCents };
  });
  return { ...data, bookings, payments, classExtras: x };
}
