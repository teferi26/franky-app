import type { ProClient, ProData, ProResource, ProSectionId } from "./types";
import type {
  ProAmericana,
  ProCourtAgreement,
  ProCourtCampaign,
  ProSchoolGroup,
} from "./courts-types";
import {
  addDays,
  localDate,
  localMinutes,
  weekdayIndex,
} from "./format";
import {
  MATCH_MINUTES,
  SLOT_MINUTES,
  bookingMinutes,
  hoursFor,
  isFree,
  isValley,
  priceFor,
  type OpenMatchX,
} from "./courts";
import { clockLabel, courtsOps, patchCourts } from "./courts-base";
import { isActiveBooking, levelValue } from "./courts-ops";
import { checkGroup } from "./courts-admin";
import { americanaCourtsNeeded } from "./courts-compete";

/**
 * Crecer con estudiantes: jugadores que han dejado de venir, el pack de
 * bienvenida de septiembre, convenios con universidades y asociaciones, y el
 * calendario universitario con la campaña que toca en cada momento.
 *
 * Funciones puras sobre `ProData`, como el resto del motor. Todo lo que se
 * guarda va dentro de `ProData.courts`, así que en la cuenta real viaja en el
 * mismo documento que turnos fijos, bonos y torneos.
 */

const WEEKDAY_PLURAL = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábados",
  "domingos",
];

const WEEKDAY_ONE = [
  "el lunes",
  "el martes",
  "el miércoles",
  "el jueves",
  "el viernes",
  "el sábado",
  "el domingo",
];

function firstName(name: string): string {
  return name.trim().split(" ")[0] ?? name;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86_400_000,
  );
}

/** Primera fecha desde `from` (incluida) que cae en ese día de la semana. */
export function nextWeekday(from: string, weekday: number): string {
  let d = from;
  while (weekdayIndex(d) !== weekday) d = addDays(d, 1);
  return d;
}

/* ------------------------------------------------------------------ */
/* Jugadores dormidos                                                  */
/* ------------------------------------------------------------------ */

export type PlayHabit = { weekday: number; minute: number; times: number };

/**
 * Día y hora a los que más ha jugado alguien (de sus reservas pasadas),
 * redondeado a la media hora. Sin reservas guardadas, no hay costumbre.
 */
export function playHabit(data: ProData, clientId: string): PlayHabit | null {
  const count = new Map<string, number>();
  for (const b of data.bookings) {
    if (b.clientId !== clientId || !b.resourceId) continue;
    if (b.status === "cancelled" || b.status === "no_show") continue;
    const minute =
      Math.round(localMinutes(b.start) / SLOT_MINUTES) * SLOT_MINUTES;
    const key = `${weekdayIndex(localDate(b.start))}-${minute}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  let best: PlayHabit | null = null;
  for (const [key, times] of count) {
    const [weekday, minute] = key.split("-").map(Number);
    if (
      !best ||
      times > best.times ||
      (times === best.times && weekday * 1440 + minute < best.weekday * 1440 + best.minute)
    )
      best = { weekday, minute, times };
  }
  return best;
}

export type DormantPlayer = {
  client: ProClient;
  /** Días desde su última visita. */
  daysAway: number;
  habit: PlayHabit | null;
  level?: number;
  /** Partido abierto de su nivel en la próxima semana, si lo hay. */
  match?: OpenMatchX;
  /** Pista libre a su hora de siempre en la próxima semana, si la hay. */
  freeSlot?: { date: string; minute: number; resourceId: string };
  message: string;
};

/**
 * Quien venía a menudo (seis visitas o más) y lleva tres semanas sin reservar
 * ni tener nada reservado. Para cada uno, la mejor excusa para volver: un
 * partido abierto de su nivel o su pista de siempre libre a su hora.
 */
export function dormantDetails(
  data: ProData,
  now: Date,
  options: { minVisits?: number; days?: number } = {},
): DormantPlayer[] {
  const today = localDate(now);
  const minVisits = options.minVisits ?? 6;
  const limit = addDays(today, -(options.days ?? 21));
  const levels = courtsOps(data).levels;
  const courts = data.resources.filter((r) => r.kind === "court");
  const matches = (data.openMatches as OpenMatchX[]).filter(
    (m) =>
      !m.releasedAt &&
      m.needed > 0 &&
      Date.parse(m.start) > now.getTime() &&
      localDate(m.start) <= addDays(today, 7),
  );

  return data.clients
    .filter(
      (c) =>
        c.visits >= minVisits &&
        c.lastVisit &&
        localDate(c.lastVisit) <= limit &&
        !data.bookings.some(
          (b) =>
            b.clientId === c.id &&
            isActiveBooking(b) &&
            localDate(b.start) >= today,
        ),
    )
    .map((client) => {
      const level = levels[client.id]?.level;
      const habit = playHabit(data, client.id);
      const match =
        level === undefined
          ? undefined
          : matches
              .filter(
                (m) =>
                  Math.abs(levelValue(m.level) - level) <= 0.5 &&
                  !m.players.some(
                    (p) => p.toLowerCase() === client.name.toLowerCase(),
                  ),
              )
              .sort((a, b) => a.start.localeCompare(b.start))[0];
      let freeSlot: DormantPlayer["freeSlot"];
      if (!match && habit && courts.length) {
        const date = nextWeekday(addDays(today, 1), habit.weekday);
        const court = courts.find((r) =>
          isFree(data, r, date, habit.minute, MATCH_MINUTES),
        );
        if (court) freeSlot = { date, minute: habit.minute, resourceId: court.id };
      }
      const daysAway = daysBetween(localDate(client.lastVisit!), today);
      return {
        client,
        daysAway,
        habit,
        level,
        match,
        freeSlot,
        message: dormantMessage({
          name: client.name,
          club: data.space.name,
          match,
          freeSlot,
          habit,
          today,
        }),
      };
    })
    .sort((a, b) => b.client.visits - a.client.visits || a.daysAway - b.daysAway);
}

/** Mensaje de vuelta: concreto, con día y hora, nunca un "te echamos de menos" vacío. */
export function dormantMessage(input: {
  name: string;
  club: string;
  match?: OpenMatchX;
  freeSlot?: { date: string; minute: number };
  habit?: PlayHabit | null;
  /** Para decir "hoy" o "mañana" en vez del día de la semana. */
  today?: string;
}): string {
  const hi = `Hola ${firstName(input.name)}, hace tiempo que no te vemos por ${input.club}.`;
  if (input.match) {
    const date = localDate(input.match.start);
    const day =
      date === input.today
        ? "hoy"
        : input.today && date === addDays(input.today, 1)
          ? "mañana"
          : WEEKDAY_ONE[weekdayIndex(date)];
    const missing = input.match.needed === 1 ? "le falta uno" : `le faltan ${input.match.needed}`;
    return `${hi} ${capital(day)} a las ${clockLabel(localMinutes(input.match.start))} hay un partido de nivel ${input.match.level} y ${missing}. ¿Te apuntamos?`;
  }
  if (input.freeSlot) {
    return `${hi} Solías jugar los ${WEEKDAY_PLURAL[weekdayIndex(input.freeSlot.date)]} a las ${clockLabel(input.freeSlot.minute)} y esta semana tenemos pista libre a esa hora. ¿Te la guardamos?`;
  }
  return `${hi} ¿Te buscamos pista esta semana? Dinos qué día te viene bien.`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ------------------------------------------------------------------ */
/* Pack de bienvenida de septiembre                                    */
/* ------------------------------------------------------------------ */

/** Curso académico de una fecha: de julio a junio ("2026-27"). */
export function courseOf(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Del 20 de agosto al 31 de octubre: cuando los nuevos buscan club. */
export function isWelcomeSeason(date: string): boolean {
  const md = date.slice(5);
  return md >= "08-20" && md <= "10-31";
}

export function welcomePackOf(
  data: ProData,
  date: string,
): ProCourtCampaign | undefined {
  const course = courseOf(date);
  return courtsOps(data).campaigns.find(
    (c) => c.kind === "welcome" && c.course === course,
  );
}

export type WelcomePackPlan = {
  course: string;
  clinic: {
    name: string;
    resourceId: string;
    coachId: string;
    weekday: number;
    from: number;
    duration: number;
    capacity: number;
    monthlyFeeCents: number;
    seasonFrom: string;
    seasonTo: string;
  };
  americana: {
    name: string;
    date: string;
    from: number;
    maxPlayers: number;
    pricePerPlayerCents: number;
    rounds: number;
  };
};

function monitors(data: ProData) {
  const rates = courtsOps(data).coachRates;
  const withRate = data.staff.filter((s) => rates[s.id] !== undefined);
  if (withRate.length) return withRate;
  const titled = data.staff.filter((s) => /monitor/i.test(s.title ?? ""));
  return titled.length ? titled : data.staff;
}

/** Hueco valle entre semana que no pisa a otro grupo ni al monitor. */
function freeValleySlot(
  data: ProData,
  base: Omit<ProSchoolGroup, "weekday" | "from">,
): { weekday: number; from: number } | null {
  for (const from of [11 * 60, 10 * 60, 12 * 60, 12 * 60 + 30]) {
    for (const weekday of [1, 3, 0, 2, 4]) {
      const group = { ...base, weekday, from } as ProSchoolGroup;
      if (checkGroup(data, group).ok) return { weekday, from };
    }
  }
  return null;
}

/**
 * Propuesta lista para aceptar: un clínic de iniciación semanal en hora valle
 * hasta Navidad y una americana de bienvenida un jueves por la tarde a dos
 * semanas vista. Todo se puede cambiar antes de crearlo.
 */
export function welcomePackDefaults(
  data: ProData,
  today: string,
): WelcomePackPlan | null {
  const court = data.resources.find((r) => r.kind === "court");
  const coach = monitors(data)[0];
  if (!court || !coach) return null;
  const course = courseOf(today);
  const startYear = Number(course.slice(0, 4));
  const seasonFrom = today;
  const seasonTo = `${startYear}-12-18`;
  const base = {
    id: "welcome-check",
    name: "Clínic de iniciación",
    level: "Iniciación",
    coachId: coach.id,
    resourceId: court.id,
    duration: 60,
    capacity: 8,
    monthlyFeeCents: 0,
    students: [],
    attendance: {},
    season: { from: seasonFrom, to: seasonTo },
  };
  const slot = freeValleySlot(data, base) ?? { weekday: 1, from: 11 * 60 };
  const peak = priceFor(court, today, 19 * 60, 60) ?? 0;
  // Cuota de partida: lo que cuesta una hora de pista en punta, al mes y por
  // persona. Es solo el valor inicial: el club pone la suya antes de crear.
  const monthlyFeeCents = Math.max(2000, Math.round(peak / 500) * 500);
  const americanaDate = nextWeekday(addDays(today, 10), 3);
  const matchPrice = priceFor(court, americanaDate, 19 * 60, MATCH_MINUTES) ?? 0;
  return {
    course,
    clinic: {
      name: "Clínic de iniciación",
      resourceId: court.id,
      coachId: coach.id,
      weekday: slot.weekday,
      from: slot.from,
      duration: 60,
      capacity: 8,
      monthlyFeeCents,
      seasonFrom,
      seasonTo,
    },
    americana: {
      name: "Americana de bienvenida",
      date: americanaDate,
      from: 19 * 60,
      maxPlayers: 12,
      pricePerPlayerCents: Math.max(500, Math.round(matchPrice / 4 / 50) * 50),
      rounds: 6,
    },
  };
}

export type WelcomePackCheck =
  | { ok: true; courts: string[] }
  | { ok: false; reason: "clinic_coach" | "clinic_court" | "clinic_hours" | "americana_hours" | "americana_courts" };

/** Pistas libres para la americana y hueco para el clínic, antes de crear nada. */
export function checkWelcomePack(
  data: ProData,
  plan: WelcomePackPlan,
): WelcomePackCheck {
  const group = clinicGroup(plan, "welcome-check");
  const g = checkGroup(data, group);
  if (!g.ok) return { ok: false, reason: `clinic_${g.reason}` as const };
  const a = plan.americana;
  const minutes = a.rounds * 20;
  const hours = hoursFor(data, a.date);
  if (!hours || a.from < hours.open || a.from + minutes > hours.close)
    return { ok: false, reason: "americana_hours" };
  const needed = americanaCourtsNeeded(a.maxPlayers);
  const free = data.resources
    .filter((r) => r.kind === "court" && isFree(data, r, a.date, a.from, minutes))
    .map((r) => r.id);
  if (free.length < needed) return { ok: false, reason: "americana_courts" };
  return { ok: true, courts: free.slice(0, needed) };
}

function clinicGroup(plan: WelcomePackPlan, id: string): ProSchoolGroup {
  const c = plan.clinic;
  return {
    id,
    name: c.name.trim(),
    level: "Iniciación",
    coachId: c.coachId,
    resourceId: c.resourceId,
    weekday: c.weekday,
    from: c.from,
    duration: c.duration,
    capacity: c.capacity,
    monthlyFeeCents: c.monthlyFeeCents,
    students: [],
    attendance: {},
    season: { from: c.seasonFrom, to: c.seasonTo },
  };
}

/**
 * Crea de una vez el clínic (grupo de escuela, que ya ocupa su pista cada
 * semana), la americana de bienvenida con sus pistas bloqueadas y la marca de
 * campaña del curso para no proponerla dos veces. El bono del primer mes se
 * publica después como oferta a estudiantes.
 */
export function createWelcomePack(
  data: ProData,
  plan: WelcomePackPlan,
  ids: { group: string; americana: string; block: string; campaign: string },
  nowIso: string,
): ProData {
  const check = checkWelcomePack(data, plan);
  if (!check.ok) return data;
  const group = clinicGroup(plan, ids.group);
  const a = plan.americana;
  const americana: ProAmericana = {
    id: ids.americana,
    name: a.name.trim(),
    date: a.date,
    from: a.from,
    roundMinutes: 20,
    roundsPlanned: a.rounds,
    resourceIds: check.courts,
    level: "Iniciación a 3,0",
    maxPlayers: a.maxPlayers,
    pricePerPlayerCents: a.pricePerPlayerCents,
    status: "open",
    players: [],
    rounds: [],
    studentsOnly: true,
    createdAt: nowIso,
  };
  return patchCourts(data, (ops) => ({
    school: [...ops.school, group],
    americanas: [...ops.americanas, americana],
    blocks: [
      ...ops.blocks,
      {
        id: ids.block,
        resourceIds: check.courts,
        date: a.date,
        from: a.from,
        to: a.from + a.rounds * 20,
        reason: "tournament",
        note: americana.name,
        sourceId: americana.id,
      },
    ],
    campaigns: [
      ...ops.campaigns,
      {
        id: ids.campaign,
        kind: "welcome",
        course: plan.course,
        createdAt: nowIso,
        groupId: group.id,
        americanaId: americana.id,
      },
    ],
  }));
}

/** Texto para el grupo de WhatsApp del club o las historias de Instagram. */
export function welcomePackShareText(
  plan: WelcomePackPlan,
  club: string,
): string {
  const c = plan.clinic;
  const a = plan.americana;
  const fee = (c.monthlyFeeCents / 100).toLocaleString("es-ES");
  const price = (a.pricePerPlayerCents / 100).toLocaleString("es-ES");
  return [
    `Empieza el curso en ${club}.`,
    `${c.name}: los ${WEEKDAY_PLURAL[c.weekday]} a las ${clockLabel(c.from)}, ${c.capacity} plazas, ${fee} € al mes.`,
    `${a.name}: ${WEEKDAY_ONE[weekdayIndex(a.date)]} ${Number(a.date.slice(8))} a las ${clockLabel(a.from)}, ${price} € por persona. Da igual tu nivel, te emparejamos.`,
    "Escríbenos para apuntarte.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Convenios con universidades, asociaciones y empresas                */
/* ------------------------------------------------------------------ */

export const AGREEMENT_KIND_LABEL: Record<ProCourtAgreement["kind"], string> = {
  university: "Universidad",
  association: "Asociación",
  company: "Empresa",
};

export function isAgreementMember(
  agreement: ProCourtAgreement,
  client: Pick<ProClient, "id" | "student"> | undefined,
): boolean {
  if (!client) return false;
  if (agreement.memberIds.includes(client.id)) return true;
  return Boolean(
    agreement.university &&
      client.student?.verified &&
      client.student.university === agreement.university,
  );
}

/** Si el convenio vale ese día y a esa hora (vigencia y, si toca, solo valle). */
export function agreementApplies(
  agreement: ProCourtAgreement,
  date: string,
  minute: number,
): boolean {
  if (!agreement.active) return false;
  if (date < agreement.from || date > agreement.to) return false;
  return !agreement.valleyOnly || isValley(date, minute);
}

/** El convenio con más descuento que le toca a ese cliente en esa franja. */
export function agreementFor(
  data: ProData,
  clientId: string | undefined,
  date: string,
  minute: number,
): ProCourtAgreement | null {
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return null;
  return (
    courtsOps(data)
      .agreements.filter(
        (a) => isAgreementMember(a, client) && agreementApplies(a, date, minute),
      )
      .sort((a, b) => b.discountPct - a.discountPct)[0] ?? null
  );
}

/** Precio pactado, redondeado a 50 céntimos como el resto de tarifas. */
export function agreementPrice(priceCents: number, discountPct: number): number {
  const pct = Math.min(100, Math.max(0, discountPct));
  return Math.round((priceCents * (100 - pct)) / 100 / 50) * 50;
}

export function agreementMembers(
  data: ProData,
  agreement: ProCourtAgreement,
): ProClient[] {
  return data.clients
    .filter((c) => isAgreementMember(agreement, c))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type AgreementMonth = {
  bookings: number;
  minutes: number;
  amountCents: number;
  /** Lo que se han ahorrado frente a la tarifa normal de esa franja. */
  savedCents: number;
  players: { clientId: string; name: string; bookings: number }[];
};

/**
 * Lo que han jugado los miembros de un convenio en un mes, con la tarifa que
 * les tocaba: es el resumen que se manda al responsable.
 */
export function agreementMonth(
  data: ProData,
  agreement: ProCourtAgreement,
  month: string,
): AgreementMonth {
  const byClient = new Map<string, { name: string; bookings: number }>();
  let bookings = 0;
  let minutes = 0;
  let amountCents = 0;
  let savedCents = 0;
  for (const b of data.bookings) {
    if (!b.resourceId || !b.clientId) continue;
    if (b.status === "cancelled" || b.status === "no_show") continue;
    const date = localDate(b.start);
    if (date.slice(0, 7) !== month) continue;
    const client = data.clients.find((c) => c.id === b.clientId);
    if (!isAgreementMember(agreement, client)) continue;
    const from = localMinutes(b.start);
    if (!agreementApplies({ ...agreement, active: true }, date, from)) continue;
    const resource = data.resources.find((r) => r.id === b.resourceId);
    const length = bookingMinutes(b);
    const list = resource ? (priceFor(resource, date, from, length) ?? 0) : 0;
    bookings++;
    minutes += length;
    amountCents += b.priceCents;
    savedCents += Math.max(0, list - b.priceCents);
    const hit = byClient.get(b.clientId);
    if (hit) hit.bookings++;
    else byClient.set(b.clientId, { name: b.clientName, bookings: 1 });
  }
  return {
    bookings,
    minutes,
    amountCents,
    savedCents,
    players: [...byClient.entries()]
      .map(([clientId, v]) => ({ clientId, ...v }))
      .sort((a, b) => b.bookings - a.bookings || a.name.localeCompare(b.name)),
  };
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-09" → "septiembre". */
export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

/** Resumen del mes para el responsable del convenio, listo para enviar. */
export function agreementReport(
  agreement: ProCourtAgreement,
  month: string,
  summary: AgreementMonth,
  club: string,
): string {
  const hours = Math.round((summary.minutes / 60) * 10) / 10;
  const euros = (cents: number) =>
    (cents / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 });
  const lines = [
    `Hola ${firstName(agreement.contact.name)}, te pasamos el resumen de ${monthName(month)} del convenio ${agreement.name} en ${club}.`,
    `${summary.bookings} ${summary.bookings === 1 ? "reserva" : "reservas"}, ${hours.toLocaleString("es-ES")} h de pista y ${summary.players.length} ${summary.players.length === 1 ? "persona" : "personas"} distintas.`,
    `Importe: ${euros(summary.amountCents)} €. Ahorro para vuestra gente: ${euros(summary.savedCents)} €.`,
  ];
  if (summary.players.length)
    lines.push(
      `Quién más ha jugado: ${summary.players
        .slice(0, 3)
        .map((p) => `${p.name} (${p.bookings})`)
        .join(", ")}.`,
    );
  lines.push("Cualquier cosa, nos dices.");
  return lines.join("\n");
}

export function saveAgreement(
  data: ProData,
  agreement: ProCourtAgreement,
): ProData {
  return patchCourts(data, (ops) => ({
    agreements: [
      ...ops.agreements.filter((a) => a.id !== agreement.id),
      agreement,
    ],
  }));
}

export function removeAgreement(data: ProData, id: string): ProData {
  return patchCourts(data, (ops) => ({
    agreements: ops.agreements.filter((a) => a.id !== id),
  }));
}

export function toggleAgreementMember(
  data: ProData,
  agreementId: string,
  clientId: string,
): ProData {
  return patchCourts(data, (ops) => ({
    agreements: ops.agreements.map((a) =>
      a.id !== agreementId
        ? a
        : {
            ...a,
            memberIds: a.memberIds.includes(clientId)
              ? a.memberIds.filter((id) => id !== clientId)
              : [...a.memberIds, clientId],
          },
    ),
  }));
}

/* ------------------------------------------------------------------ */
/* Calendario universitario                                            */
/* ------------------------------------------------------------------ */

/** Qué propone cada momento del curso. La pantalla decide cómo abrirlo. */
export type UniMomentAction =
  | { kind: "welcome" }
  | { kind: "offer"; title: string }
  | { kind: "section"; section: ProSectionId; query?: string };

export type UniMoment = {
  id: string;
  from: string;
  to: string;
  title: string;
  /** Qué pasa con los estudiantes esas semanas. */
  what: string;
  /** La campaña que tiene sentido y el botón que la lanza. */
  idea: string;
  cta: string;
  action: UniMomentAction;
  demand: "alta" | "baja" | "normal";
};

type MomentSeed = Omit<UniMoment, "from" | "to"> & {
  from: string;
  to: string;
};

/**
 * Domingo de Pascua (algoritmo anónimo gregoriano). Las vacaciones de Semana
 * Santa de las universidades se mueven con él cada año.
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Momentos de un curso según el calendario habitual de las universidades
 * españolas (cada una publica el suyo: conviene revisarlo en septiembre).
 * `startYear` es el año en que empieza el curso.
 */
function courseMoments(
  startYear: number,
  vertical: "sports_facility" | "coworking",
): MomentSeed[] {
  const y1 = startYear;
  const y2 = startYear + 1;
  const easter = easterSunday(y2);
  const study = vertical === "coworking";
  return [
    {
      id: `${y1}-inicio`,
      from: `${y1}-09-01`,
      to: `${y1}-10-15`,
      title: "Inicio de curso",
      what: study
        ? "Llegan los de primero y los que cambian de piso: buscan sitio para todo el año."
        : "Los nuevos buscan club, horario y gente de su nivel para todo el curso.",
      idea: study
        ? "Un bono mensual de bienvenida para quien empieza ahora."
        : "Pack de bienvenida: clínic de iniciación en valle y americana para conocerse.",
      cta: study ? "Crear oferta" : "Montar el pack",
      action: study
        ? { kind: "offer", title: "Bono de bienvenida" }
        : { kind: "welcome" },
      demand: "normal",
    },
    {
      id: `${y1}-antes`,
      from: `${y1}-12-01`,
      to: `${y1}-12-21`,
      title: "Antes de exámenes",
      what: study
        ? "Empieza la cuenta atrás: más horas de estudio y más gente por la noche."
        : "Última semana de clases: muchos buscan desconectar antes de encerrarse.",
      idea: study
        ? "Pon el horario de noche de enero y anúncialo con tiempo."
        : "Torneo de Navidad para cerrar el trimestre con el club lleno.",
      cta: study ? "Horario de noche" : "Crear americana",
      action: study
        ? { kind: "section", section: "normas" }
        : { kind: "section", section: "torneos" },
      demand: study ? "alta" : "normal",
    },
    {
      id: `${y1}-navidad`,
      from: `${y1}-12-22`,
      to: `${y2}-01-06`,
      title: "Navidad",
      what: "Muchos estudiantes vuelven a casa; quedan los de aquí y los que preparan exámenes.",
      idea: study
        ? "Mantén abierto con horario reducido: quien se queda estudia más que nunca."
        : "Bonos regalo y partidos entre amigos que vuelven por vacaciones.",
      cta: study ? "Horario especial" : "Vender bonos",
      action: study
        ? { kind: "section", section: "normas" }
        : { kind: "section", section: "bonos" },
      demand: "baja",
    },
    {
      id: `${y2}-enero`,
      from: `${y2}-01-07`,
      to: `${y2}-02-07`,
      title: "Exámenes de enero",
      what: study
        ? "Semanas de más demanda del año: las salas se llenan de mañana a noche."
        : "Mañanas en la biblioteca y mediodías para despejarse una hora.",
      idea: study
        ? "Bono exámenes para las carreras que tienen examen esas semanas."
        : "Partido de mediodía a precio valle, solo para estudiantes.",
      cta: "Crear oferta",
      action: {
        kind: "offer",
        title: study ? "Bono exámenes" : "Mediodías de desconexión",
      },
      demand: study ? "alta" : "baja",
    },
    {
      id: `${y2}-segundo`,
      from: `${y2}-02-08`,
      to: `${y2}-03-15`,
      title: "Segundo cuatrimestre",
      what: "Horarios nuevos y ganas de empezar algo: es el segundo septiembre del año.",
      idea: study
        ? "Recupera a quien se fue en Navidad con su puesto fijo de siempre."
        : "Liga entre facultades de primavera, con jornadas en hora valle.",
      cta: study ? "Ver socios" : "Crear liga",
      action: study
        ? { kind: "section", section: "socios" }
        : { kind: "section", section: "torneos", query: "?vista=liga" },
      demand: "normal",
    },
    {
      id: `${y2}-pascua`,
      from: addDays(easter, -9),
      to: addDays(easter, 1),
      title: "Semana Santa",
      what: "Vacaciones de una semana: mañanas libres y muchos que se quedan en la ciudad.",
      idea: study
        ? "Horario de vacaciones y bono de días sueltos para quien adelanta temario."
        : "Clínic intensivo de mañana para quien quiere subir de nivel en una semana.",
      cta: study ? "Horario especial" : "Abrir escuela",
      action: study
        ? { kind: "section", section: "normas" }
        : { kind: "section", section: "escuela" },
      demand: "baja",
    },
    {
      id: `${y2}-junio`,
      from: `${y2}-05-15`,
      to: `${y2}-06-20`,
      title: "Exámenes de junio",
      what: study
        ? "Segundo gran pico del año, con días largos y calor: el aire acondicionado vende."
        : "Mediodías tranquilos y tardes que se alargan con la luz.",
      idea: study
        ? "Bono exámenes de junio y horario de noche anunciado."
        : "Partido de desconexión en valle y americana de fin de exámenes.",
      cta: "Crear oferta",
      action: {
        kind: "offer",
        title: study ? "Bono exámenes de junio" : "Mediodías de desconexión",
      },
      demand: study ? "alta" : "baja",
    },
    {
      id: `${y2}-julio`,
      from: `${y2}-06-21`,
      to: `${y2}-07-10`,
      title: "Convocatoria de julio",
      what: study
        ? "Quedan los que se juegan la asignatura: pocos, pero vienen todos los días."
        : "Se acaba el curso y empiezan las tardes largas de verano.",
      idea: study
        ? "Bono de dos semanas para la recuperación."
        : "Americana de fin de curso y horario de verano.",
      cta: study ? "Crear oferta" : "Crear americana",
      action: study
        ? { kind: "offer", title: "Bono recuperación" }
        : { kind: "section", section: "torneos" },
      demand: study ? "alta" : "normal",
    },
    {
      id: `${y2}-verano`,
      from: `${y2}-07-11`,
      to: `${y2}-08-31`,
      title: "Verano",
      what: study
        ? "La sala se vacía: Erasmus, prácticas y vacaciones."
        : "Mañanas de calor y noches con más ambiente.",
      idea: study
        ? "Pausa de cuota hasta septiembre para no perder a tus socios."
        : "Horario de verano con más horas de noche.",
      cta: study ? "Ver socios" : "Horario de verano",
      action: study
        ? { kind: "section", section: "socios" }
        : { kind: "section", section: "normas" },
      demand: "baja",
    },
  ];
}

/**
 * Lo que está pasando ahora y lo que viene en los próximos meses, en orden.
 * El primero es el momento actual (si hay uno) o el siguiente.
 */
export function uniCalendar(
  today: string,
  vertical: "sports_facility" | "coworking",
  horizonDays = 240,
): UniMoment[] {
  const course = Number(courseOf(today).slice(0, 4));
  const limit = addDays(today, horizonDays);
  return [...courseMoments(course, vertical), ...courseMoments(course + 1, vertical)]
    .filter((m) => m.to >= today && m.from <= limit)
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** Días que faltan para un momento (0 si ya ha empezado). */
export function daysUntil(today: string, date: string): number {
  return Math.max(0, daysBetween(today, date));
}

/**
 * Precio de una franja de mañana en valle del primer espacio con tarifa, para
 * rellenar una oferta de temporada: 90 minutos de pista o 4 h de puesto.
 */
export function valleyOfferPrice(
  resources: ProResource[],
  date: string,
): number | null {
  const court = resources.find((r) => r.kind === "court");
  if (court) return priceFor(court, date, 11 * 60, MATCH_MINUTES);
  const desk = resources.find((r) => r.pricePerHourCents !== null);
  if (!desk || desk.pricePerHourCents === null) return null;
  return (desk.valleyPricePerHourCents ?? desk.pricePerHourCents) * 4;
}
