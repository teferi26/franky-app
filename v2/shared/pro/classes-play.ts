import type { ProClassSession, ProClassType, ProData, ProMember, ProPayment } from "./types";
import type {
  ProChallenge,
  ProChargeMethod,
  ProExamResult,
  ProGiftVoucher,
  ProPersonalRecord,
  ProRoomResult,
} from "./classes-types";
import { addDays, localDate } from "./format";
import { extrasOf, firstName, withExtras } from "./classes-care";
import { isRoomMode, sessionRoster } from "./classes";

/**
 * Lo que hace volver: retos entre carreras y marcas personales (gimnasios),
 * ranking de cada sala, colección del jugador y bonos regalo (ocio) y la tasa
 * de aprobados medida por la academia. Funciones puras sobre `ProData`.
 */

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

const ARRIVED = new Set(["arrived", "in_service", "done"]);

/* ------------------------------------------------------------------ */
/* Retos entre carreras                                                */
/* ------------------------------------------------------------------ */

export function challengesOf(data: ProData): ProChallenge[] {
  return extrasOf(data).challenges ?? [];
}

/** El reto que está en marcha hoy, o el siguiente que va a empezar. */
export function currentChallenge(data: ProData, now: Date): ProChallenge | undefined {
  const today = localDate(now);
  const list = [...challengesOf(data)].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return (
    list.find((c) => c.startsOn <= today && c.endsOn >= today) ??
    list.find((c) => c.startsOn > today)
  );
}

export function challengeState(ch: ProChallenge, now: Date): "upcoming" | "live" | "ended" {
  const today = localDate(now);
  if (today < ch.startsOn) return "upcoming";
  if (today > ch.endsOn) return "ended";
  return "live";
}

/** Equipo de un socio en el reto: su carrera. */
export function teamOf(member: ProMember | undefined): string | null {
  return member?.studies?.trim() || null;
}

export type ChallengeRow = {
  team: string;
  visits: number;
  /** Socios de esa carrera que han venido al menos una vez. */
  people: number;
  members: number;
};

/**
 * Clasificación: asistencias a clase de los socios de cada carrera entre el
 * primer y el último día del reto (hasta hoy), más las apuntadas a mano.
 */
export function challengeStandings(data: ProData, ch: ProChallenge, now: Date): ChallengeRow[] {
  const today = localDate(now);
  const to = ch.endsOn < today ? ch.endsOn : today;
  const byId = new Map(data.members.map((m) => [m.id, m]));
  const rows = new Map<string, ChallengeRow & { seen: Set<string> }>();
  const row = (team: string) => {
    let r = rows.get(team);
    if (!r) {
      r = { team, visits: 0, people: 0, members: 0, seen: new Set() };
      rows.set(team, r);
    }
    return r;
  };
  for (const m of data.members) {
    const team = teamOf(m);
    if (team && m.status !== "cancelled") row(team).members++;
  }
  for (const s of data.sessions) {
    const day = localDate(s.start);
    if (s.status === "cancelled" || day < ch.startsOn || day > to) continue;
    if (new Date(s.start).getTime() > now.getTime()) continue;
    for (const b of sessionRoster(data, s, now).booked) {
      if (!ARRIVED.has(b.status) || !b.clientId) continue;
      const team = teamOf(byId.get(b.clientId));
      if (!team) continue;
      const r = row(team);
      r.visits += b.partySize;
      r.seen.add(b.clientId);
    }
  }
  for (const [team, extra] of Object.entries(ch.bonus ?? {})) {
    row(team).visits += extra;
  }
  return [...rows.values()]
    .map(({ seen, ...r }) => ({ ...r, people: seen.size }))
    .filter((r) => r.visits > 0 || r.members > 0)
    .sort(
      (a, b) => b.visits - a.visits || b.people - a.people || a.team.localeCompare(b.team, "es"),
    );
}

export type NewChallenge = Pick<ProChallenge, "title" | "startsOn" | "endsOn" | "prize">;

export function createChallenge(d: ProData, input: NewChallenge, id: string): ProData {
  const ch: ProChallenge = {
    ...input,
    id,
    metric: "visits",
    title: input.title.trim(),
    prize: input.prize.trim(),
  };
  return withExtras(d, (x) => ({ ...x, challenges: [...(x.challenges ?? []), ch] }));
}

export function addChallengeBonus(
  d: ProData,
  challengeId: string,
  team: string,
  visits: number,
): ProData {
  return withExtras(d, (x) => ({
    ...x,
    challenges: (x.challenges ?? []).map((c) =>
      c.id === challengeId
        ? { ...c, bonus: { ...c.bonus, [team]: Math.max(0, (c.bonus?.[team] ?? 0) + visits) } }
        : c,
    ),
  }));
}

export function removeChallenge(d: ProData, challengeId: string): ProData {
  return withExtras(d, (x) => ({
    ...x,
    challenges: (x.challenges ?? []).filter((c) => c.id !== challengeId),
  }));
}

/** Texto para compartir la clasificación (stories, grupos de clase). */
export function challengeShareText(
  ch: ProChallenge,
  rows: ChallengeRow[],
  place: string,
  daysLeft: number,
): string {
  const top = rows
    .slice(0, 3)
    .map((r, i) => `${i + 1}. ${r.team}: ${r.visits}`)
    .join("\n");
  const tail =
    daysLeft > 0
      ? `Quedan ${daysLeft} días. Premio para la carrera ganadora: ${ch.prize}.`
      : `Ganadora: ${rows[0]?.team ?? "por decidir"}. Premio: ${ch.prize}.`;
  return `${ch.title} en ${place}\n${top}\n${tail}`;
}

export function challengeDaysLeft(ch: ProChallenge, now: Date): number {
  return Math.max(0, daysBetween(localDate(now), ch.endsOn));
}

/* ------------------------------------------------------------------ */
/* Marcas personales                                                   */
/* ------------------------------------------------------------------ */

/** Movimientos y benchmarks más habituales para apuntar sin escribir. */
export const COMMON_LIFTS: { lift: string; unit: ProPersonalRecord["unit"] }[] = [
  { lift: "Back squat", unit: "kg" },
  { lift: "Peso muerto", unit: "kg" },
  { lift: "Clean", unit: "kg" },
  { lift: "Snatch", unit: "kg" },
  { lift: "Press estricto", unit: "kg" },
  { lift: "Fran", unit: "s" },
  { lift: "Remo 2 km", unit: "s" },
  { lift: "Dominadas seguidas", unit: "reps" },
];

export function recordsOf(data: ProData): ProPersonalRecord[] {
  return extrasOf(data).records ?? [];
}

/** En tiempo gana el menor; en kilos y repeticiones, el mayor. */
export function isBetter(a: ProPersonalRecord, b: ProPersonalRecord): boolean {
  return a.unit === "s" ? a.value < b.value : a.value > b.value;
}

/** ¿Es la mejor marca de ese socio en ese movimiento hasta ese día? */
export function isPersonalBest(data: ProData, rec: ProPersonalRecord): boolean {
  const key = rec.lift.toLowerCase();
  return !recordsOf(data).some(
    (r) =>
      r.id !== rec.id &&
      r.memberId === rec.memberId &&
      r.lift.toLowerCase() === key &&
      r.unit === rec.unit &&
      r.on <= rec.on &&
      !isBetter(rec, r),
  );
}

export type MemberBest = {
  lift: string;
  best: ProPersonalRecord;
  previous?: ProPersonalRecord;
  count: number;
};

/** Mejor marca de cada movimiento de un socio, con la anterior para comparar. */
export function memberBests(data: ProData, memberId: string): MemberBest[] {
  const groups = new Map<string, ProPersonalRecord[]>();
  for (const r of recordsOf(data)) {
    if (r.memberId !== memberId) continue;
    const key = `${r.lift.toLowerCase()}|${r.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) =>
        isBetter(a, b) ? -1 : isBetter(b, a) ? 1 : b.on.localeCompare(a.on),
      );
      return { lift: sorted[0].lift, best: sorted[0], previous: sorted[1], count: list.length };
    })
    .sort((a, b) => b.best.on.localeCompare(a.best.on) || a.lift.localeCompare(b.lift, "es"));
}

export function addRecord(d: ProData, rec: Omit<ProPersonalRecord, "cheeredAt">): ProData {
  return withExtras(d, (x) => ({
    ...x,
    records: [...(x.records ?? []), { ...rec, lift: rec.lift.trim() }],
  }));
}

export function cheerRecord(d: ProData, recordId: string, now: Date): ProData {
  return withExtras(d, (x) => ({
    ...x,
    records: (x.records ?? []).map((r) =>
      r.id === recordId ? { ...r, cheeredAt: now.toISOString() } : r,
    ),
  }));
}

/** Marcas batidas en los últimos días que el coach todavía no ha celebrado. */
export function recordsToCheer(
  data: ProData,
  now: Date,
  days = 7,
): { record: ProPersonalRecord; member: ProMember }[] {
  const from = addDays(localDate(now), -days);
  return recordsOf(data)
    .filter((r) => !r.cheeredAt && r.on >= from && isPersonalBest(data, r))
    .map((record) => ({ record, member: data.members.find((m) => m.id === record.memberId) }))
    .filter((x): x is { record: ProPersonalRecord; member: ProMember } => Boolean(x.member))
    .sort((a, b) => b.record.on.localeCompare(a.record.on));
}

export function formatRecord(value: number, unit: ProPersonalRecord["unit"]): string {
  if (unit === "s") {
    const m = Math.floor(value / 60);
    const s = Math.round(value % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
  return unit === "kg" ? `${n} kg` : `${n} reps`;
}

/** "3:25" o "205" a segundos. Devuelve null si no se entiende. */
export function parseRecordValue(text: string, unit: ProPersonalRecord["unit"]): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  if (unit === "s" && t.includes(":")) {
    const [m, s] = t.split(":");
    const mm = Number(m);
    const ss = Number(s);
    if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss >= 60 || mm < 0 || ss < 0) return null;
    return mm * 60 + ss;
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function cheerMessage(
  member: ProMember,
  rec: ProPersonalRecord,
  previous: ProPersonalRecord | undefined,
  sender: string,
  place: string,
): string {
  const before = previous ? ` (antes ${formatRecord(previous.value, previous.unit)})` : "";
  return `¡${firstName(member.name)}, marca nueva en ${rec.lift}: ${formatRecord(rec.value, rec.unit)}${before}! Enhorabuena, se nota el trabajo. ${sender}, ${place}.`;
}

/* ------------------------------------------------------------------ */
/* Ranking de las salas (escape room)                                  */
/* ------------------------------------------------------------------ */

export function roomResultsOf(data: ProData): ProRoomResult[] {
  return extrasOf(data).roomResults ?? [];
}

export function saveRoomResult(d: ProData, result: ProRoomResult): ProData {
  return withExtras(d, (x) => ({
    ...x,
    roomResults: [
      ...(x.roomResults ?? []).filter((r) => !result.bookingId || r.bookingId !== result.bookingId),
      result,
    ],
  }));
}

export function resultForBooking(data: ProData, bookingId: string): ProRoomResult | undefined {
  return roomResultsOf(data).find((r) => r.bookingId === bookingId);
}

/** Mejor primero: escaparon, menos tiempo y menos pistas. */
function compareResults(a: ProRoomResult, b: ProRoomResult): number {
  if (a.escaped !== b.escaped) return a.escaped ? -1 : 1;
  return (
    (a.seconds ?? Infinity) - (b.seconds ?? Infinity) ||
    a.hints - b.hints ||
    a.on.localeCompare(b.on)
  );
}

export function roomRanking(
  data: ProData,
  classTypeId: string | "all",
  scope: "month" | "all",
  now: Date,
): ProRoomResult[] {
  const month = localDate(now).slice(0, 7);
  return roomResultsOf(data)
    .filter((r) => r.escaped && r.seconds)
    .filter((r) => classTypeId === "all" || r.classTypeId === classTypeId)
    .filter((r) => scope === "all" || r.on.slice(0, 7) === month)
    .sort(compareResults);
}

export type UniversityRow = {
  label: string;
  games: number;
  escapes: number;
  bestSeconds: number | null;
};

/** Partidas y récords por universidad o facultad: gasolina para un torneo. */
export function rankingByUniversity(data: ProData, by: "university" | "faculty"): UniversityRow[] {
  const rows = new Map<string, UniversityRow>();
  for (const r of roomResultsOf(data)) {
    const label = (by === "faculty" ? r.faculty : r.university)?.trim();
    if (!label) continue;
    const row = rows.get(label) ?? { label, games: 0, escapes: 0, bestSeconds: null };
    row.games++;
    if (r.escaped) {
      row.escapes++;
      if (r.seconds && (row.bestSeconds === null || r.seconds < row.bestSeconds))
        row.bestSeconds = r.seconds;
    }
    rows.set(label, row);
  }
  return [...rows.values()].sort(
    (a, b) => b.escapes - a.escapes || b.games - a.games || a.label.localeCompare(b.label, "es"),
  );
}

/** Puesto que ocuparía un tiempo en el ranking histórico de la sala. */
export function rankFor(data: ProData, classTypeId: string, seconds: number): number {
  return (
    roomRanking(data, classTypeId, "all", new Date(0)).filter(
      (r) => (r.seconds ?? Infinity) < seconds,
    ).length + 1
  );
}

/* ------------------------------------------------------------------ */
/* Colección del jugador                                               */
/* ------------------------------------------------------------------ */

export type PlayerCollection = { played: ProClassType[]; next: ProClassType[] };

/** Salas que ya ha jugado un cliente (por su ficha o por su nombre) y las que le faltan. */
export function playerCollection(
  data: ProData,
  client: { id?: string; name: string },
  now: Date,
): PlayerCollection {
  const rooms = data.classTypes.filter((ct) => ct.active !== false && isRoomMode(data, ct));
  const playedIds = new Set<string>();
  const nameKey = client.name.trim().toLowerCase();
  for (const b of data.bookings) {
    if (!b.sessionId || !ARRIVED.has(b.status)) continue;
    const mine = client.id
      ? b.clientId === client.id
      : b.clientName.trim().toLowerCase() === nameKey;
    if (!mine) continue;
    const s = data.sessions.find((x) => x.id === b.sessionId);
    if (s && new Date(s.start).getTime() <= now.getTime()) playedIds.add(s.classTypeId);
  }
  for (const r of roomResultsOf(data)) {
    if (r.team.trim().toLowerCase() === nameKey) playedIds.add(r.classTypeId);
  }
  return {
    played: rooms.filter((ct) => playedIds.has(ct.id)),
    next: rooms.filter((ct) => !playedIds.has(ct.id)),
  };
}

export function nextRoomMessage(
  name: string,
  played: ProClassType,
  next: ProClassType,
  place: string,
  url: string,
): string {
  return `Hola ${firstName(name)}, gracias por venir a ${played.name}. Os queda ${next.name} por descubrir: reservad cuando queráis aquí ${url}. ¡Os esperamos en ${place}!`;
}

/** Próxima sesión libre de una sala, para proponer fecha. */
export function nextFreeSession(
  data: ProData,
  classTypeId: string,
  now: Date,
): ProClassSession | undefined {
  return data.sessions
    .filter((s) => s.classTypeId === classTypeId && s.status !== "cancelled" && s.booked === 0)
    .filter((s) => new Date(s.start).getTime() > now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

/* ------------------------------------------------------------------ */
/* Bonos regalo                                                        */
/* ------------------------------------------------------------------ */

/** Meses que vale un bono regalo si no se dice otra cosa. */
export const VOUCHER_MONTHS = 6;

export function vouchersOf(data: ProData): ProGiftVoucher[] {
  return extrasOf(data).vouchers ?? [];
}

/** Código corto y fácil de dictar: prefijo del negocio y número. */
export function voucherCode(slug: string, seq: number): string {
  const prefix =
    slug
      .replace(/[^a-z]/gi, "")
      .slice(0, 3)
      .toUpperCase() || "REG";
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function voucherStatus(v: ProGiftVoucher, today: string): "active" | "redeemed" | "expired" {
  if (v.redeemedAt) return "redeemed";
  if (v.expiresOn < today) return "expired";
  return "active";
}

export type NewVoucher = {
  concept: string;
  amountCents: number;
  buyer: string;
  recipient: string;
  expiresOn: string;
  method: ProChargeMethod;
};

/** Vende un bono: queda con su código y el cobro entra en la caja del día. */
export function sellVoucher(
  d: ProData,
  input: NewVoucher,
  now: Date,
  id: string,
  opts: { recordPayment?: boolean } = {},
): { data: ProData; voucher: ProGiftVoucher } {
  const x = extrasOf(d);
  const seq = (x.voucherSeq ?? 0) + 1;
  const voucher: ProGiftVoucher = {
    id,
    code: voucherCode(d.space.slug, seq),
    concept: input.concept.trim(),
    amountCents: input.amountCents,
    buyer: input.buyer.trim(),
    recipient: input.recipient.trim(),
    soldOn: localDate(now),
    expiresOn: input.expiresOn,
    method: input.method,
  };
  const deskMethod: ProPayment["method"] | null =
    input.method === "card" || input.method === "bizum" || input.method === "cash"
      ? input.method
      : null;
  // Solo lo cobrado en el mostrador entra en la caja del día.
  const payments =
    deskMethod && opts.recordPayment !== false
      ? [
          ...d.payments,
          {
            id: `${id}-p`,
            at: now.toISOString(),
            clientName: voucher.buyer || voucher.recipient,
            concept: `Bono regalo ${voucher.code}`,
            amountCents: voucher.amountCents,
            tipCents: 0,
            method: deskMethod,
          },
        ]
      : d.payments;
  const data = withExtras({ ...d, payments }, (e) => ({
    ...e,
    voucherSeq: seq,
    vouchers: [voucher, ...(e.vouchers ?? [])],
  }));
  return { data, voucher };
}

export function findVoucher(data: ProData, code: string): ProGiftVoucher | undefined {
  const key = normalizeCode(code);
  return vouchersOf(data).find((v) => normalizeCode(v.code) === key);
}

export type RedeemResult =
  | { ok: true; data: ProData; voucher: ProGiftVoucher }
  | { ok: false; reason: "unknown" | "redeemed" | "expired" };

export function redeemVoucher(d: ProData, code: string, now: Date): RedeemResult {
  const voucher = findVoucher(d, code);
  if (!voucher) return { ok: false, reason: "unknown" };
  const status = voucherStatus(voucher, localDate(now));
  if (status !== "active") return { ok: false, reason: status };
  const redeemed = { ...voucher, redeemedAt: now.toISOString() };
  return {
    ok: true,
    voucher: redeemed,
    data: withExtras(d, (x) => ({
      ...x,
      vouchers: (x.vouchers ?? []).map((v) => (v.id === voucher.id ? redeemed : v)),
    })),
  };
}

/** Bonos sin canjear que caducan en los próximos días. */
export function vouchersExpiring(data: ProData, now: Date, days = 30): ProGiftVoucher[] {
  const today = localDate(now);
  const limit = addDays(today, days);
  return vouchersOf(data)
    .filter((v) => voucherStatus(v, today) === "active" && v.expiresOn <= limit)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
}

export function voucherGiftText(
  v: ProGiftVoucher,
  place: string,
  money: string,
  until: string,
): string {
  return `${v.recipient ? `Para ${v.recipient}: ` : ""}${v.concept} en ${place} (${money}). Código ${v.code}, válido hasta el ${until}. Resérvalo con este código en recepción o desde Franky.`;
}

/* ------------------------------------------------------------------ */
/* Resultados de examen (academias)                                    */
/* ------------------------------------------------------------------ */

export const EXAM_RESULT_LABEL: Record<ProExamResult["result"], string> = {
  passed: "Aprobó",
  failed: "Suspendió",
  absent: "No se presentó",
};

export function examResultsOf(data: ProData): ProExamResult[] {
  return extrasOf(data).examResults ?? [];
}

export function resultOf(
  data: ProData,
  memberId: string,
  classTypeId: string,
): ProExamResult | undefined {
  return examResultsOf(data).find((r) => r.memberId === memberId && r.classTypeId === classTypeId);
}

export function setExamResult(d: ProData, result: ProExamResult): ProData {
  return withExtras(d, (x) => ({
    ...x,
    examResults: [
      ...(x.examResults ?? []).filter(
        (r) => !(r.memberId === result.memberId && r.classTypeId === result.classTypeId),
      ),
      result,
    ],
  }));
}

export function clearExamResult(d: ProData, memberId: string, classTypeId: string): ProData {
  return withExtras(d, (x) => ({
    ...x,
    examResults: (x.examResults ?? []).filter(
      (r) => !(r.memberId === memberId && r.classTypeId === classTypeId),
    ),
  }));
}

export type PassRate = {
  classType: ProClassType;
  passed: number;
  failed: number;
  absent: number;
  /** Aprobados sobre presentados, de 0 a 100. Null si nadie se ha presentado. */
  rate: number | null;
  averageGrade: number | null;
};

/** Tasa de aprobados por grupo con lo que ha apuntado la academia. */
export function passRates(data: ProData): PassRate[] {
  return data.classTypes
    .map((classType) => {
      const list = examResultsOf(data).filter((r) => r.classTypeId === classType.id);
      const passed = list.filter((r) => r.result === "passed").length;
      const failed = list.filter((r) => r.result === "failed").length;
      const absent = list.filter((r) => r.result === "absent").length;
      const grades = list.map((r) => r.grade).filter((g): g is number => typeof g === "number");
      return {
        classType,
        passed,
        failed,
        absent,
        rate: passed + failed ? Math.round((passed / (passed + failed)) * 100) : null,
        averageGrade: grades.length
          ? Math.round((grades.reduce((a, g) => a + g, 0) / grades.length) * 10) / 10
          : null,
      };
    })
    .filter((r) => r.passed + r.failed + r.absent > 0);
}

export function overallPassRate(data: ProData): {
  rate: number | null;
  presented: number;
  passed: number;
} {
  const list = examResultsOf(data).filter((r) => r.result !== "absent");
  const passed = list.filter((r) => r.result === "passed").length;
  return {
    rate: list.length ? Math.round((passed / list.length) * 100) : null,
    presented: list.length,
    passed,
  };
}

/**
 * Alumnos de un grupo cuyo examen ya pasó y a los que no se les ha
 * preguntado. Un alumno es del grupo si ha reservado alguna de sus clases.
 */
export function groupStudents(data: ProData, classTypeId: string): ProMember[] {
  const ids = new Set(
    data.bookings
      .filter((b) => b.clientId && b.status !== "cancelled")
      .filter((b) => data.sessions.find((s) => s.id === b.sessionId)?.classTypeId === classTypeId)
      .map((b) => b.clientId as string),
  );
  return data.members
    .filter((m) => ids.has(m.id) && m.status !== "cancelled")
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function passedMessage(
  member: ProMember,
  group: string,
  sender: string,
  place: string,
  reviewUrl?: string,
): string {
  const review = reviewUrl
    ? ` Si te ha servido, me ayuda mucho que lo cuentes aquí: ${reviewUrl}`
    : "";
  return `¡Enhorabuena, ${firstName(member.name)}! Aprobado en ${group}. Me alegro muchísimo, te lo has currado.${review} ${sender}, ${place}.`;
}
