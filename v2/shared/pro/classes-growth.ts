import type {
  ProBooking,
  ProClassSession,
  ProClassType,
  ProData,
  ProMember,
  ProVerticalId,
} from "./types";
import type {
  ProClassLead,
  ProClassesExtras,
  ProDoorCheckin,
  ProLeadStage,
  ProRecovery,
  ProReferral,
} from "./classes-types";
import { addDays, localDate } from "./format";
import {
  careOf,
  extrasOf,
  firstName,
  patchCare,
  pausesReturning,
  withExtras,
} from "./classes-care";
import { freeSpots, isWaitlist, sessionRoster, sessionState, withRoster } from "./classes";

/**
 * Captación y día a día del motor de clases, segunda ola: el embudo de
 * interesados, la entrada con el QR de la puerta, "trae a un amigo", las
 * recuperaciones pendientes, las plazas de septiembre y la lista de la
 * temporada. Funciones puras sobre `ProData`, igual que `classes-care.ts`.
 */

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/* ------------------------------------------------------------------ */
/* Embudo de interesados                                               */
/* ------------------------------------------------------------------ */

export const LEAD_STAGES: ProLeadStage[] = ["new", "trial_booked", "came", "joined", "lost"];

/** Nombre de cada fase con las palabras del sector. */
export function leadStageLabel(stage: ProLeadStage, vertical: ProVerticalId): string {
  switch (stage) {
    case "new":
      return "Nuevo";
    case "trial_booked":
      return "Prueba reservada";
    case "came":
      return "Vino a probar";
    case "joined":
      return vertical === "academy" ? "Matriculado" : "Se apuntó";
    case "lost":
      return "No sigue";
  }
}

export const LEAD_SOURCE_LABEL: Record<ProClassLead["source"], string> = {
  franky: "Franky",
  instagram: "Instagram",
  friend: "Un amigo",
  walkin: "Pasó por aquí",
  web: "Web o Google",
  other: "Otro",
};

export function leadsOf(data: ProData): ProClassLead[] {
  return extrasOf(data).leads ?? [];
}

export function isOpenLead(lead: ProClassLead): boolean {
  return lead.stage !== "joined" && lead.stage !== "lost";
}

/**
 * Cuándo toca volver a hablar con alguien según su fase: al nuevo, hoy; al
 * que tiene la prueba, el día anterior para recordársela; al que ya vino, al
 * día siguiente, que es cuando se decide.
 */
export function suggestedFollowUp(
  stage: ProLeadStage,
  today: string,
  trialOn?: string,
): string | undefined {
  if (stage === "new") return today;
  if (stage === "trial_booked") return trialOn ? addDays(trialOn, -1) : addDays(today, 2);
  if (stage === "came") return addDays(today, 1);
  return undefined;
}

/** A quién llamar hoy: seguimientos vencidos primero, después los nuevos. */
export function leadsToCall(data: ProData, now: Date): ProClassLead[] {
  const today = localDate(now);
  return leadsOf(data)
    .filter(isOpenLead)
    .filter((lead) => (lead.followUpOn ?? today) <= today)
    .sort(
      (a, b) =>
        (a.followUpOn ?? today).localeCompare(b.followUpOn ?? today) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

export type NewLead = Pick<
  ProClassLead,
  | "name"
  | "phone"
  | "interest"
  | "examOn"
  | "source"
  | "university"
  | "studies"
  | "note"
  | "referredBy"
>;

export function addLead(d: ProData, input: NewLead, now: Date, id: string): ProData {
  const at = now.toISOString();
  const lead: ProClassLead = {
    ...input,
    id,
    name: input.name.trim(),
    stage: "new",
    followUpOn: localDate(now),
    createdAt: at,
    updatedAt: at,
  };
  return withExtras(d, (x) => ({ ...x, leads: [lead, ...(x.leads ?? [])] }));
}

export function patchLead(
  d: ProData,
  leadId: string,
  changes: Partial<Omit<ProClassLead, "id" | "createdAt">>,
  now: Date,
): ProData {
  return withExtras(d, (x) => ({
    ...x,
    leads: (x.leads ?? []).map((lead) =>
      lead.id === leadId ? { ...lead, ...changes, updatedAt: now.toISOString() } : lead,
    ),
  }));
}

/**
 * Pasa a alguien de fase y le pone el siguiente seguimiento. Si llega con el
 * enlace de un socio, su "trae a un amigo" avanza a la vez.
 */
export function moveLead(
  d: ProData,
  leadId: string,
  stage: ProLeadStage,
  now: Date,
  extra: { trialOn?: string; lostReason?: string } = {},
): ProData {
  const lead = leadsOf(d).find((l) => l.id === leadId);
  if (!lead) return d;
  const today = localDate(now);
  let next = patchLead(
    d,
    leadId,
    {
      stage,
      followUpOn: suggestedFollowUp(stage, today, extra.trialOn),
      lostReason: stage === "lost" ? extra.lostReason : undefined,
    },
    now,
  );
  if (lead.referredBy && (stage === "trial_booked" || stage === "joined")) {
    const referral = (extrasOf(next).referrals ?? []).find(
      (r) =>
        r.memberId === lead.referredBy &&
        sameName(r.friendName, lead.name) &&
        r.status !== "joined",
    );
    if (referral)
      next = setReferralStatus(next, referral.id, stage === "joined" ? "joined" : "trial", now);
  }
  return next;
}

/** Aplaza el seguimiento sin cambiar de fase. */
export function snoozeLead(d: ProData, leadId: string, days: number, now: Date): ProData {
  return patchLead(d, leadId, { followUpOn: addDays(localDate(now), days) }, now);
}

export type LeadFunnel = {
  counts: Record<ProLeadStage, number>;
  /** De cada 100 que vinieron a probar, cuántos se apuntaron. */
  trialToJoin: number;
  /** De cada 100 interesados cerrados, cuántos se apuntaron. */
  overall: number;
  total: number;
};

/** Embudo de los últimos `days` días (por fecha de alta del interesado). */
export function leadFunnel(data: ProData, now: Date, days = 90): LeadFunnel {
  const from = addDays(localDate(now), -days);
  const list = leadsOf(data).filter((l) => localDate(l.createdAt) >= from);
  const counts = Object.fromEntries(
    LEAD_STAGES.map((stage) => [stage, list.filter((l) => l.stage === stage).length]),
  ) as Record<ProLeadStage, number>;
  // "Vino a probar" incluye a quien después se apuntó o dijo que no.
  const cameEver =
    counts.came +
    counts.joined +
    list.filter((l) => l.stage === "lost" && l.lostReason !== "No vino").length;
  const closed = counts.joined + counts.lost;
  return {
    counts,
    trialToJoin: cameEver ? Math.round((counts.joined / cameEver) * 100) : 0,
    overall: closed ? Math.round((counts.joined / closed) * 100) : 0,
    total: list.length,
  };
}

/** Mensaje de WhatsApp listo según la fase, en primera persona. */
export function leadMessage(
  lead: ProClassLead,
  sender: string,
  place: string,
  vertical: ProVerticalId,
): string {
  const who = firstName(lead.name);
  const topic = lead.interest ? ` para ${lead.interest}` : "";
  switch (lead.stage) {
    case "new":
      return `Hola ${who}, soy ${sender} de ${place}. Vi que preguntaste por nosotros${topic}. ¿Te viene bien venir a una clase de prueba esta semana? Dime qué día te encaja.`;
    case "trial_booked":
      return `Hola ${who}, soy ${sender} de ${place}. Te espero para tu clase de prueba. Si te surge algo, dímelo y lo cambiamos.`;
    case "came":
      return vertical === "academy"
        ? `Hola ${who}, soy ${sender} de ${place}. ¿Qué tal la clase de ayer? Si quieres seguir${topic}, te guardo plaza en el grupo.`
        : `Hola ${who}, soy ${sender} de ${place}. ¿Qué tal la clase de ayer? Si te animas, te explico las cuotas y el precio de estudiante.`;
    default:
      return `Hola ${who}, soy ${sender} de ${place}.`;
  }
}

/* ------------------------------------------------------------------ */
/* Entrada con el QR de la puerta                                      */
/* ------------------------------------------------------------------ */

/** Minutos antes de empezar en los que ya se puede entrar con el QR. */
export const DOOR_BEFORE_MIN = 30;
/** Minutos después de empezar en los que todavía se puede entrar. */
export const DOOR_AFTER_MIN = 20;

/** Enlace que lleva el QR de la puerta de una sala. */
export function doorUrl(slug: string, room?: string): string {
  const base = `https://franky.es/n/${encodeURIComponent(slug)}/entrada`;
  return room ? `${base}?sala=${encodeURIComponent(room)}` : base;
}

/** Salas donde hay clases, para imprimir un QR por sala. */
export function doorRooms(data: ProData): string[] {
  return [
    ...new Set(
      data.sessions
        .filter((s) => s.status !== "cancelled" && s.room.trim())
        .map((s) => s.room.trim()),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
}

/** Clases a las que se puede entrar ahora mismo (en esa sala, si se indica). */
export function doorSessions(data: ProData, now: Date, room?: string): ProClassSession[] {
  const t = now.getTime();
  return data.sessions
    .filter((s) => s.status !== "cancelled")
    .filter((s) => !room || s.room.trim() === room.trim())
    .filter((s) => {
      const start = new Date(s.start).getTime();
      return t >= start - DOOR_BEFORE_MIN * 60000 && t <= start + DOOR_AFTER_MIN * 60000;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Nombre sin tildes, en minúscula y con un solo espacio. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Lucía" coincide con "Lucía Soler"; "lucia soler" con "Lucía Soler". */
export function sameName(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `);
}

export type DoorOutcome = "booked" | "walkin" | "already" | "full" | "ambiguous" | "closed";

export type DoorResult = {
  outcome: DoorOutcome;
  data: ProData;
  /** Nombre tal y como está en la lista, si se ha encontrado. */
  matched?: string;
};

/**
 * Alguien escanea el QR y escribe su nombre. Si tiene reserva, pasa a
 * "llegó"; si no la tiene y queda plaza, entra de paso; si hay dos personas
 * que encajan con lo que ha escrito, se le pide el apellido.
 */
export function doorCheckIn(
  d: ProData,
  sessionId: string,
  name: string,
  now: Date,
  id: string,
): DoorResult {
  const s = d.sessions.find((x) => x.id === sessionId);
  const clean = name.trim().replace(/\s+/g, " ");
  if (!s || s.status === "cancelled" || !clean || sessionState(s, now) === "past")
    return { outcome: "closed", data: d };
  const { booked } = sessionRoster(d, s, now);
  const matches = booked.filter((b) => sameName(b.clientName, clean));
  if (matches.length > 1) {
    const exact = matches.filter((b) => normalizeName(b.clientName) === normalizeName(clean));
    if (exact.length !== 1) return { outcome: "ambiguous", data: d };
    matches.splice(0, matches.length, exact[0]);
  }
  const found = matches[0];
  const record = (kind: ProDoorCheckin["kind"], who: string): ProDoorCheckin => ({
    id,
    sessionId,
    name: who,
    at: now.toISOString(),
    kind,
  });
  const arrivedStatus = (b: ProBooking) =>
    b.status === "arrived" || b.status === "in_service" || b.status === "done";

  if (found) {
    if (arrivedStatus(found)) return { outcome: "already", data: d, matched: found.clientName };
    const marked = withRoster(d, sessionId, now, (list) =>
      list.map((b) => (b.id === found.id ? { ...b, status: "arrived" as const } : b)),
    );
    return {
      outcome: "booked",
      matched: found.clientName,
      data: withExtras(marked, (x) => ({
        ...x,
        checkins: [...(x.checkins ?? []), record("booked", found.clientName)],
      })),
    };
  }
  if (freeSpots(s) <= 0) return { outcome: "full", data: d };
  const walkin: ProBooking = {
    id: `${id}-b`,
    kind: "class",
    sessionId,
    staffId: s.coachId,
    start: s.start,
    end: s.end,
    clientName: clean,
    partySize: 1,
    status: "arrived",
    priceCents: 0,
    paidCents: 0,
    source: "walkin",
    note: "Entró con el QR de la puerta",
  };
  const added = withRoster(d, sessionId, now, (list) => [...list, walkin]);
  return {
    outcome: "walkin",
    matched: clean,
    data: withExtras(added, (x) => ({
      ...x,
      checkins: [...(x.checkins ?? []), record("walkin", clean)],
    })),
  };
}

/** Entradas con el QR de hoy, de la más reciente a la más antigua. */
export function checkinsToday(data: ProData, now: Date): ProDoorCheckin[] {
  const today = localDate(now);
  return (extrasOf(data).checkins ?? [])
    .filter((c) => localDate(c.at) === today)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* ------------------------------------------------------------------ */
/* Trae a un amigo                                                     */
/* ------------------------------------------------------------------ */

/** Enlace personal de un socio: la ficha pública recuerda quién invitó. */
export function referralUrl(slug: string, memberId: string): string {
  return `https://franky.es/n/${encodeURIComponent(slug)}?amigo=${encodeURIComponent(memberId)}`;
}

export function referralsOf(data: ProData): ProReferral[] {
  return extrasOf(data).referrals ?? [];
}

export function addReferral(
  d: ProData,
  memberId: string,
  friendName: string,
  now: Date,
  id: string,
): ProData {
  const referral: ProReferral = {
    id,
    memberId,
    friendName: friendName.trim(),
    status: "invited",
    at: now.toISOString(),
  };
  return withExtras(d, (x) => ({
    ...x,
    referrals: [referral, ...(x.referrals ?? [])],
  }));
}

export function setReferralStatus(
  d: ProData,
  referralId: string,
  status: ProReferral["status"],
  now: Date,
): ProData {
  return withExtras(d, (x) => ({
    ...x,
    referrals: (x.referrals ?? []).map((r) =>
      r.id === referralId ? { ...r, status, at: now.toISOString() } : r,
    ),
  }));
}

export function rewardReferral(d: ProData, referralId: string, now: Date): ProData {
  return withExtras(d, (x) => ({
    ...x,
    referrals: (x.referrals ?? []).map((r) =>
      r.id === referralId ? { ...r, rewardedAt: now.toISOString() } : r,
    ),
  }));
}

export type ReferrerRow = {
  member: ProMember;
  invited: number;
  trials: number;
  joined: number;
  /** Amigos que se han apuntado y cuyo premio falta por dar. */
  unrewarded: ProReferral[];
};

/** Quién trae a quién, de más a menos altas. */
export function referralBoard(data: ProData): ReferrerRow[] {
  const byMember = new Map<string, ReferrerRow>();
  for (const r of referralsOf(data)) {
    const member = data.members.find((m) => m.id === r.memberId);
    if (!member) continue;
    const row = byMember.get(member.id) ?? {
      member,
      invited: 0,
      trials: 0,
      joined: 0,
      unrewarded: [],
    };
    row.invited++;
    if (r.status === "trial") row.trials++;
    if (r.status === "joined") {
      row.joined++;
      if (!r.rewardedAt) row.unrewarded.push(r);
    }
    byMember.set(member.id, row);
  }
  return [...byMember.values()].sort(
    (a, b) =>
      b.joined - a.joined ||
      b.trials - a.trials ||
      b.invited - a.invited ||
      a.member.name.localeCompare(b.member.name, "es"),
  );
}

/** Texto que el socio reenvía a su amigo, con su enlace. */
export function referralMessage(member: ProMember, place: string, url: string): string {
  return `Soy ${firstName(member.name)}. Entreno en ${place} y te invito a probar una clase conmigo. Reserva tu prueba aquí: ${url}`;
}

/** Texto para pedirle al socio que invite a alguien. */
export function askReferralMessage(
  member: ProMember,
  sender: string,
  place: string,
  url: string,
  reward?: string,
): string {
  const prize = reward?.trim()
    ? ` Si se apunta, te llevas ${reward.trim().replace(/\.$/, "")}.`
    : "";
  return `Hola ${firstName(member.name)}, soy ${sender} de ${place}. ¿Te apetece traer a alguien a entrenar contigo? Este es tu enlace para que reserve su clase de prueba: ${url}.${prize}`;
}

/* ------------------------------------------------------------------ */
/* Recuperaciones pendientes (academias)                               */
/* ------------------------------------------------------------------ */

export type RecoveryItem = {
  member: ProMember;
  recovery: ProRecovery;
  /** Grupo de la clase que perdió. */
  fromType?: ProClassType;
  daysLeft: number;
};

/** Todas las recuperaciones por usar, las que caducan antes primero. */
export function recoveriesPending(data: ProData, now: Date): RecoveryItem[] {
  const today = localDate(now);
  const items: RecoveryItem[] = [];
  for (const member of data.members) {
    if (member.status === "cancelled") continue;
    for (const recovery of careOf(data, member.id).recoveries ?? []) {
      if (recovery.usedSessionId || recovery.expiresOn < today) continue;
      const from = data.sessions.find((s) => s.id === recovery.fromSessionId);
      items.push({
        member,
        recovery,
        fromType: data.classTypes.find((c) => c.id === from?.classTypeId),
        daysLeft: daysBetween(today, recovery.expiresOn),
      });
    }
  }
  return items.sort(
    (a, b) =>
      a.recovery.expiresOn.localeCompare(b.recovery.expiresOn) ||
      a.member.name.localeCompare(b.member.name, "es"),
  );
}

/**
 * Clases con hueco donde recuperar: primero el mismo grupo, después otros
 * grupos de la misma asignatura o nivel, siempre antes de que caduque.
 */
export function recoverySlots(
  data: ProData,
  item: RecoveryItem,
  now: Date,
  limit = 4,
): ProClassSession[] {
  const t = now.getTime();
  const sameCategory = new Set(
    data.classTypes
      .filter((c) => item.fromType && c.category === item.fromType.category)
      .map((c) => c.id),
  );
  const rank = (s: ProClassSession) =>
    s.classTypeId === item.fromType?.id ? 0 : sameCategory.has(s.classTypeId) ? 1 : 2;
  return data.sessions
    .filter((s) => s.status !== "cancelled" && freeSpots(s) > 0)
    .filter((s) => new Date(s.start).getTime() > t)
    .filter((s) => localDate(s.start) <= item.recovery.expiresOn)
    .filter((s) => rank(s) < 2)
    .filter(
      (s) =>
        !data.bookings.some(
          (b) => b.sessionId === s.id && b.clientId === item.member.id && b.status !== "cancelled",
        ),
    )
    .sort((a, b) => rank(a) - rank(b) || a.start.localeCompare(b.start))
    .slice(0, limit);
}

/** Apunta al alumno en otra clase y gasta esa recuperación concreta. */
export function bookRecovery(
  d: ProData,
  memberId: string,
  recoveryId: string,
  sessionId: string,
  now: Date,
  bookingId: string,
): ProData {
  const member = d.members.find((m) => m.id === memberId);
  const s = d.sessions.find((x) => x.id === sessionId);
  const list = careOf(d, memberId).recoveries ?? [];
  const recovery = list.find((r) => r.id === recoveryId);
  if (!member || !s || !recovery || recovery.usedSessionId || freeSpots(s) <= 0) return d;
  const booking: ProBooking = {
    id: bookingId,
    kind: "class",
    sessionId,
    clientId: member.id,
    clientName: member.name,
    staffId: s.coachId,
    start: s.start,
    end: s.end,
    partySize: 1,
    status: "confirmed",
    priceCents: 0,
    paidCents: 0,
    source: member.source ?? "walkin",
    student: Boolean(member.student?.verified),
    note: "Recuperación",
  };
  const withBooking = withRoster(d, sessionId, now, (roster) => [
    ...roster.filter((b) => !(isWaitlist(b) && b.clientId === member.id)),
    booking,
  ]);
  return patchCare(withBooking, memberId, {
    recoveries: list.map((r) => (r.id === recoveryId ? { ...r, usedSessionId: sessionId } : r)),
  });
}

export function recoveryMessage(
  item: RecoveryItem,
  session: ProClassSession | undefined,
  sender: string,
  place: string,
  when: string,
): string {
  const who = firstName(item.member.name);
  const group = item.fromType?.name ?? "tu grupo";
  return session
    ? `Hola ${who}, soy ${sender} de ${place}. Te he apuntado a recuperar la clase de ${group} ${when}. Si no te viene bien, dímelo y buscamos otro hueco.`
    : `Hola ${who}, soy ${sender} de ${place}. Tienes una clase de ${group} por recuperar. Dime qué día te viene bien y te guardo sitio.`;
}

/* ------------------------------------------------------------------ */
/* Plazas del curso que viene (academias, en julio)                    */
/* ------------------------------------------------------------------ */

export type NextCourseSummary = {
  confirmed: ProMember[];
  pending: ProMember[];
  declined: ProMember[];
  /** Alumnos a los que todavía no se les ha preguntado. */
  unasked: ProMember[];
};

export function nextCourseSummary(data: ProData): NextCourseSummary {
  const out: NextCourseSummary = {
    confirmed: [],
    pending: [],
    declined: [],
    unasked: [],
  };
  for (const m of data.members) {
    if (m.status === "cancelled") continue;
    const answer = careOf(data, m.id).nextCourse;
    if (answer === "confirmed") out.confirmed.push(m);
    else if (answer === "declined") out.declined.push(m);
    else if (answer === "pending") out.pending.push(m);
    else out.unasked.push(m);
  }
  const byName = (a: ProMember, b: ProMember) => a.name.localeCompare(b.name, "es");
  out.confirmed.sort(byName);
  out.pending.sort(byName);
  out.declined.sort(byName);
  out.unasked.sort(byName);
  return out;
}

/** Curso que empieza en septiembre (p. ej. "2026/27"). */
export function nextCourseLabel(now: Date): string {
  const today = localDate(now);
  const year = Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 9 ? 1 : 0);
  return `${year}/${String(year + 1).slice(2)}`;
}

export function nextCourseMessage(
  member: ProMember,
  sender: string,
  place: string,
  course: string,
): string {
  return `Hola ${firstName(member.name)}, soy ${sender} de ${place}. Estoy organizando los grupos del curso ${course}. ¿Te guardo tu plaza para septiembre? Con un sí me vale.`;
}

/* ------------------------------------------------------------------ */
/* Temporada de septiembre                                             */
/* ------------------------------------------------------------------ */

export type SeasonTask = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  /** Se marca solo con los datos; si no, a mano. */
  auto: boolean;
  section: "horario" | "socios" | "estudiantes" | "clientes" | "grupos";
};

/** La lista se enseña del 15 de julio al 30 de septiembre. */
export function inSeasonWindow(now: Date): boolean {
  const md = localDate(now).slice(5);
  return md >= "07-15" && md <= "09-30";
}

/** Año de la temporada que se prepara (la de este septiembre). */
export function seasonYear(now: Date): string {
  return localDate(now).slice(0, 4);
}

/**
 * Lo que conviene tener listo antes de septiembre, que concentra buena parte
 * de las altas del año. Lo que se puede comprobar con los datos se marca solo.
 */
export function seasonTasks(data: ProData, now: Date, vertical: ProVerticalId): SeasonTask[] {
  const year = seasonYear(now);
  const manual = new Set(extrasOf(data).seasonDone?.[year] ?? []);
  const today = localDate(now);
  const septStart = `${year}-09-01`;
  const horizonFrom = today > septStart ? today : septStart;
  const horizonTo = addDays(horizonFrom, 14);
  const hasSchedule = data.sessions.some(
    (s) =>
      s.status !== "cancelled" &&
      localDate(s.start) >= horizonFrom &&
      localDate(s.start) <= horizonTo,
  );
  const studentPrice = data.plans.some(
    (p) => p.studentPriceCents !== undefined && p.studentPriceCents < p.priceCents,
  );
  const campusOffer = data.offers.some(
    (o) => (o.status === "live" || o.status === "scheduled") && o.audience.studentsOnly,
  );
  const returning = pausesReturning(data, now, 75);
  const returningDone =
    returning.length === 0 ||
    returning.every((r) => {
      const c = careOf(data, r.member.id).contactedAt;
      return Boolean(c && localDate(c) >= addDays(today, -30));
    });
  const culture = vertical === "culture";
  const tasks: SeasonTask[] = [
    {
      id: "schedule",
      title: "Horario de septiembre publicado",
      detail: culture
        ? "Las sesiones de las dos primeras semanas, para que los grupos reserven ya."
        : "Las clases de las dos primeras semanas, para que se puedan reservar ya.",
      done: hasSchedule,
      auto: true,
      section: "horario",
    },
    {
      id: "student_price",
      title: culture ? "Precio de estudiante en tus packs" : "Precio de estudiante en tus planes",
      detail: culture
        ? "Un precio universitario para las tardes de lunes a jueves."
        : "Un precio universitario, mejor en horas valle.",
      done: studentPrice,
      auto: true,
      section: "socios",
    },
    {
      id: "campus_offer",
      title: "Oferta de bienvenida para el campus",
      detail: "Clase de prueba o primer mes para quien llega a la ciudad.",
      done: campusOffer,
      auto: true,
      section: "estudiantes",
    },
    {
      id: "returning",
      title: "Avisar a los que vuelven de la pausa",
      detail: returning.length
        ? `${returning.length} vuelven antes de octubre. Un mensaje la semana antes.`
        : "Nadie tiene la vuelta pendiente.",
      done: returningDone,
      auto: true,
      section: "socios",
    },
  ];
  // Ocio vende packs y sesiones sueltas, sin cuotas que pausar.
  if (culture) tasks.splice(tasks.findIndex((t) => t.id === "returning"), 1);
  if (vertical === "academy") {
    const next = nextCourseSummary(data);
    tasks.push({
      id: "next_course",
      title: "Plazas del curso confirmadas",
      detail: next.pending.length
        ? `${next.pending.length} alumnos sin contestar si siguen.`
        : "Todos han contestado.",
      done: next.pending.length === 0,
      auto: true,
      section: "socios",
    });
  }
  tasks.push({
    id: "groups",
    title: "Escribir a asociaciones y delegaciones",
    detail:
      vertical === "academy"
        ? "Un grupo de compañeros de asignatura llena una clase de golpe."
        : culture
          ? "Las delegaciones montan planes de bienvenida en octubre: un pack de grupo les resuelve la tarde."
          : "Un reto entre carreras trae grupos enteros en octubre.",
    done: manual.has("groups"),
    auto: false,
    section: culture ? "grupos" : "clientes",
  });
  return tasks.map((t) => (t.auto ? t : { ...t, done: manual.has(t.id) }));
}

export function toggleSeasonTask(d: ProData, year: string, taskId: string): ProData {
  return withExtras(d, (x): ProClassesExtras => {
    const done = new Set(x.seasonDone?.[year] ?? []);
    if (done.has(taskId)) done.delete(taskId);
    else done.add(taskId);
    return { ...x, seasonDone: { ...x.seasonDone, [year]: [...done] } };
  });
}

/* ------------------------------------------------------------------ */
/* No presentados con consecuencias suaves                             */
/* ------------------------------------------------------------------ */

/** A partir de cuántas faltas sin avisar se le escribe. */
export const NO_SHOW_WARN = 3;

export function noShowMessage(name: string, sender: string, place: string, count: number): string {
  return `Hola ${firstName(name)}, soy ${sender} de ${place}. Llevas ${count} clases reservadas sin venir y sin cancelar. Cuando no puedas, cancela desde Franky: así la plaza le llega a quien está en la lista de espera. ¡Gracias!`;
}

/** Días que dura la reserva limitada tras varias faltas sin avisar. */
export const NO_SHOW_LIMIT_DAYS = 14;

/**
 * Consecuencia suave: durante unos días solo puede reservar las clases
 * llenas el mismo día, así la plaza anticipada le llega a quien sí viene.
 * Con `until` vacío se quita el límite.
 */
export function limitBooking(d: ProData, memberId: string, until: string | undefined): ProData {
  return patchCare(d, memberId, { bookingLimitedUntil: until });
}

export function bookingLimited(data: ProData, memberId: string, today: string): boolean {
  const until = careOf(data, memberId).bookingLimitedUntil;
  return Boolean(until && until >= today);
}

export function limitMessage(name: string, sender: string, place: string, until: string): string {
  const day = `${Number(until.slice(8))}/${Number(until.slice(5, 7))}`;
  return `Hola ${firstName(name)}, soy ${sender} de ${place}. Como llevas varias clases sin venir ni cancelar, hasta el ${day} las clases que están llenas solo las podrás reservar el mismo día. Las demás, como siempre. ¡Te esperamos!`;
}
