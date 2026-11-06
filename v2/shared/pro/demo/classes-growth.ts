import type { ProData, ProVerticalId } from "../types";
import type {
  ProChallenge,
  ProClassLead,
  ProExamResult,
  ProGiftVoucher,
  ProLeadStage,
  ProPersonalRecord,
  ProReferral,
  ProRoomResult,
} from "../classes-types";
import { addDays, atLocal, localDate, weekdayIndex } from "../format";
import { extrasOf, withExtras } from "../classes-care";
import { voucherCode } from "../classes-play";
import { rng, seedFor, UNIVERSITIES, personName, type Rng } from "./common";

/**
 * Segunda ola de la demo del motor de clases: interesados en cada fase, el
 * reto entre carreras, marcas personales, "trae a un amigo", resultados de
 * examen de la academia y, en el escape room, ranking de salas y bonos
 * regalo. Semilla propia para no mover nada de lo que ya estaba.
 */

const FACULTIES = [
  "Escuela Politécnica Superior",
  "Facultad de Económicas",
  "Facultad de Derecho",
  "Facultad de Ciencias",
  "Facultad de Educación",
  "Facultad de Ciencias de la Salud",
];

const TEAMS = [
  "Los de Teleco",
  "Piso de la calle Italia",
  "Erasmus Crew",
  "Delegación de Derecho",
  "Las de Enfermería",
  "Cumple de Irene",
  "Colegio Mayor",
  "Tuna de Económicas",
  "Grupo de Arquitectura",
  "Los del bus 24",
  "Primero de Biología",
  "Asociación de Magisterio",
];

/* ------------------------------------------------------------------ */
/* Interesados                                                         */
/* ------------------------------------------------------------------ */

/** Fase, días desde que preguntó y día del próximo seguimiento (0 = hoy). */
const LEAD_PLAN: { stage: ProLeadStage; created: number; follow: number | null }[] = [
  { stage: "new", created: 0, follow: 0 },
  { stage: "new", created: 1, follow: 0 },
  { stage: "trial_booked", created: 3, follow: 1 },
  { stage: "came", created: 5, follow: 0 },
  { stage: "new", created: 2, follow: -1 },
  { stage: "joined", created: 12, follow: null },
  { stage: "trial_booked", created: 2, follow: 0 },
  { stage: "lost", created: 20, follow: null },
  { stage: "came", created: 4, follow: 1 },
  { stage: "joined", created: 25, follow: null },
  { stage: "joined", created: 33, follow: null },
  { stage: "lost", created: 40, follow: null },
];

const SPORTS_INTEREST = [
  "Empezar de cero",
  "Hyrox en primavera",
  "Ganar fuerza",
  "Perder 5 kg",
  "Movilidad y yoga",
  "Volver tras una lesión",
];

const LOST_REASONS = ["Le pilla lejos", "Precio", "Horario", "No vino"];

function makeLeads(r: Rng, data: ProData, vertical: ProVerticalId, now: Date): ProClassLead[] {
  const today = localDate(now);
  const exams = extrasOf(data).types;
  return data.clients.slice(0, LEAD_PLAN.length).map((c, i) => {
    const plan = LEAD_PLAN[i];
    const created = atLocal(addDays(today, -plan.created), (10 + (i % 8)) * 60);
    const subject =
      vertical === "academy" ? c.tags[0] : SPORTS_INTEREST[i % SPORTS_INTEREST.length];
    const type = data.classTypes.find((t) => t.name === subject);
    return {
      id: `ld${i + 1}`,
      name: c.name,
      phone: c.phone,
      stage: plan.stage,
      interest: subject,
      examOn: vertical === "academy" && type ? exams[type.id]?.examOn : undefined,
      followUpOn: plan.follow === null ? undefined : addDays(today, plan.follow),
      source:
        c.source === "instagram"
          ? "instagram"
          : i % 5 === 4
            ? "friend"
            : c.source === "walkin"
              ? "walkin"
              : "franky",
      university: c.student?.university,
      studies: c.student
        ? r.pick(["Ingeniería Informática", "ADE", "Derecho", "Enfermería", "Química", "Biología"])
        : undefined,
      note: vertical === "academy" ? `Examen de ${subject} en la primera convocatoria.` : undefined,
      lostReason: plan.stage === "lost" ? LOST_REASONS[i % LOST_REASONS.length] : undefined,
      createdAt: created,
      updatedAt: created,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Gimnasio: reto, marcas y amigos                                     */
/* ------------------------------------------------------------------ */

function makeChallenge(now: Date): ProChallenge {
  const today = localDate(now);
  const monday = addDays(today, -weekdayIndex(today));
  return {
    id: "rt1",
    title: "Reto de otoño entre carreras",
    metric: "visits",
    startsOn: monday,
    endsOn: addDays(monday, 27),
    prize: "Camiseta del box para toda la carrera ganadora",
  };
}

const LIFTS: {
  lift: string;
  unit: ProPersonalRecord["unit"];
  base: [number, number];
  step: number;
}[] = [
  { lift: "Back squat", unit: "kg", base: [60, 140], step: 5 },
  { lift: "Peso muerto", unit: "kg", base: [80, 180], step: 5 },
  { lift: "Fran", unit: "s", base: [210, 480], step: -15 },
  { lift: "Remo 2 km", unit: "s", base: [420, 560], step: -6 },
];

function makeRecords(r: Rng, data: ProData, now: Date): ProPersonalRecord[] {
  const today = localDate(now);
  const members = data.members.filter((m) => m.status === "active").slice(0, 16);
  const list: ProPersonalRecord[] = [];
  let n = 0;
  members.forEach((m, i) => {
    const lifts = LIFTS.filter((_, j) => (i + j) % 2 === 0);
    lifts.forEach((l) => {
      let value = r.int(l.base[0], l.base[1]);
      if (l.unit === "kg") value = Math.round(value / 2.5) * 2.5;
      // Tres marcas por movimiento en los últimos meses, cada una un poco mejor.
      [84, 45, i < 4 && l === lifts[0] ? 2 + i : 16].forEach((ago, k) => {
        list.push({
          id: `pr${++n}`,
          memberId: m.id,
          lift: l.lift,
          unit: l.unit,
          value: value + l.step * k,
          on: addDays(today, -ago),
          cheeredAt: ago > 7 ? atLocal(addDays(today, -ago + 1), 10 * 60) : undefined,
        });
      });
    });
  });
  return list;
}

function makeReferrals(data: ProData, now: Date): ProReferral[] {
  const today = localDate(now);
  const members = data.members.filter((m) => m.status === "active").slice(3, 9);
  const friends = [
    "Nuria Pastor",
    "Álvaro Ruiz",
    "Claudia Sempere",
    "Jaime Bernabeu",
    "Elena Crespo",
    "Marcos Gil",
    "Paula Ivorra",
  ];
  const plan: { m: number; status: ProReferral["status"]; ago: number; rewarded?: boolean }[] = [
    { m: 0, status: "joined", ago: 20, rewarded: true },
    { m: 0, status: "joined", ago: 6 },
    { m: 1, status: "trial", ago: 2 },
    { m: 2, status: "joined", ago: 9 },
    { m: 3, status: "invited", ago: 1 },
    { m: 4, status: "invited", ago: 4 },
    { m: 5, status: "trial", ago: 3 },
  ];
  return plan
    .filter((p) => members[p.m])
    .map((p, i) => ({
      id: `rf${i + 1}`,
      memberId: members[p.m].id,
      friendName: friends[i % friends.length],
      status: p.status,
      at: atLocal(addDays(today, -p.ago), 18 * 60),
      rewardedAt: p.rewarded ? atLocal(addDays(today, -p.ago + 3), 12 * 60) : undefined,
    }));
}

/* ------------------------------------------------------------------ */
/* Academia: resultados de la última convocatoria                      */
/* ------------------------------------------------------------------ */

function makeExamResults(r: Rng, data: ProData, now: Date): ProExamResult[] {
  const today = localDate(now);
  const on = addDays(today, -96);
  const members = data.members.filter((m) => m.status !== "trial").slice(0, 30);
  const groups = data.classTypes.slice(0, 4);
  return members.map((m, i) => {
    const roll = r.next();
    const result: ProExamResult["result"] =
      roll < 0.76 ? "passed" : roll < 0.93 ? "failed" : "absent";
    return {
      memberId: m.id,
      classTypeId: groups[i % groups.length].id,
      result,
      grade:
        result === "passed"
          ? Math.round((5 + r.next() * 4) * 10) / 10
          : result === "failed"
            ? Math.round((2.5 + r.next() * 2.3) * 10) / 10
            : undefined,
      on,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Escape room: ranking y bonos regalo                                  */
/* ------------------------------------------------------------------ */

function makeRoomResults(r: Rng, data: ProData, now: Date): ProRoomResult[] {
  const today = localDate(now);
  const rooms = data.classTypes.filter((c) => extrasOf(data).types[c.id]?.roomMode);
  const list: ProRoomResult[] = [];
  for (let i = 0; i < 38 && rooms.length; i++) {
    const room = rooms[i % rooms.length];
    const escaped = r.chance(0.72);
    const uni = r.chance(0.75) ? UNIVERSITIES[0] : r.pick(UNIVERSITIES);
    list.push({
      id: `rr${i + 1}`,
      classTypeId: room.id,
      team: TEAMS[i % TEAMS.length],
      players: r.int(3, 6),
      escaped,
      seconds: escaped ? r.int(37 * 60, 59 * 60) : undefined,
      hints: r.int(0, 5),
      on: addDays(today, -r.int(1, 58)),
      university: uni,
      faculty: uni === UNIVERSITIES[0] ? r.pick(FACULTIES) : undefined,
    });
  }
  return list;
}

function makeVouchers(data: ProData, now: Date): ProGiftVoucher[] {
  const today = localDate(now);
  const rows: {
    concept: string;
    cents: number;
    sold: number;
    months: number;
    redeemed?: number;
  }[] = [
    { concept: "Sala para 4", cents: 7000, sold: 3, months: 6 },
    { concept: "Sala para 6", cents: 8400, sold: 12, months: 6 },
    { concept: "Taller de cerámica para 2", cents: 7000, sold: 30, months: 6, redeemed: 4 },
    { concept: "Sala para 5", cents: 7800, sold: 160, months: 6 },
    { concept: "Sala para 4", cents: 7000, sold: 55, months: 6, redeemed: 20 },
    { concept: "Taller de cerámica", cents: 3500, sold: 172, months: 6 },
  ];
  const buyers = [
    "Marta Sanchis",
    "Jorge Llorca",
    "Andrea Pérez",
    "Víctor Soler",
    "Laura Company",
    "Rubén Maestre",
  ];
  return rows.map((row, i) => {
    const soldOn = addDays(today, -row.sold);
    return {
      id: `vc${i + 1}`,
      code: voucherCode(data.space.slug, i + 1),
      concept: row.concept,
      amountCents: row.cents,
      buyer: buyers[i],
      recipient: personNameFor(i),
      soldOn,
      expiresOn: addDays(soldOn, row.months * 30),
      redeemedAt: row.redeemed ? atLocal(addDays(today, -row.redeemed), 18 * 60) : undefined,
      method: i % 2 ? "bizum" : "card",
    };
  });
}

function personNameFor(i: number): string {
  return personName(rng(0x6f7 + i));
}

/* ------------------------------------------------------------------ */

export function seedClassGrowth(vertical: ProVerticalId, data: ProData, now: Date): ProData {
  const r = rng(seedFor(vertical) ^ 0x9a0b);
  if (vertical === "culture") {
    const results = makeRoomResults(r, data, now);
    const vouchers = makeVouchers(data, now);
    return withExtras(data, (x) => ({
      ...x,
      roomResults: results,
      vouchers,
      voucherSeq: vouchers.length,
    }));
  }
  const leads = makeLeads(r, data, vertical, now);
  if (vertical === "academy") {
    const examResults = makeExamResults(r, data, now);
    return withExtras(data, (x) => ({ ...x, leads, examResults }));
  }
  const records = makeRecords(r, data, now);
  const referrals = makeReferrals(data, now);
  return withExtras(data, (x) => ({
    ...x,
    leads,
    records,
    referrals,
    referralReward: "un mes de cuota a mitad de precio",
    challenges: [makeChallenge(now)],
  }));
}
