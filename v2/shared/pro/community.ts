import type { ProBoardSeat, ProData } from "./types";
import type {
  Attendee,
  CommunityActivity,
  CommunityActivityKind,
  CommunityAgendaItem,
  CommunityAssembly,
  CommunityExpenseCategory,
  CommunityIncomeCategory,
  CommunityMember,
  CommunityMovement,
  CommunityPayMethod,
  CommunityPeriod,
  CommunityPeriodKind,
  CommunityPrepItem,
  CommunitySettings,
  CommunityShift,
  CommunityTask,
  CommunityWaitEntry,
  ProCommunityOps,
} from "./community-types";
import { proCsvCell } from "./csv";
import { tripIncome } from "./community-trips";
import { addDays, atLocal, dayLabel, localDate, localMinutes, minutesToLabel, money, time } from "./format";
import { STUDIES, UNIVERSITIES } from "./demo/common";

/**
 * Reglas y cálculos del motor de comunidades. Todo es puro: recibe datos y
 * devuelve datos. Las pantallas de la web y de la app llaman a estas funciones
 * y guardan el resultado con `update`.
 */

/* ------------------------------------------------------------------ */
/* Reglas del sector                                                   */
/* ------------------------------------------------------------------ */

/** Comisión de Franky sobre entradas y cuotas cobradas. */
export const FRANKY_FEE = 0.05;
/** Comisión de Eventbrite por entrada vendida (plan Essentials). */
export const EVENTBRITE_FEE = 0.06;
/** Cuota anual del socio por defecto, en céntimos. */
export const MEMBER_FEE_CENTS = 1500;

export const DEFAULT_COMMUNITY_SETTINGS: CommunitySettings = {
  feeCents: MEMBER_FEE_CENTS,
  howToPay: "Se paga desde Franky con tu enlace de socio o por Bizum a la tesorería.",
  dormantWeeks: 6,
};

export function emptyCommunityOps(): ProCommunityOps {
  return {
    settings: { ...DEFAULT_COMMUNITY_SETTINGS },
    openingBalanceCents: 0,
    movements: [],
    documents: [],
    periods: [],
    assemblies: [],
    tasks: [],
  };
}

/** La operación del espacio, o una vacía si el espacio aún no la tiene. */
export function communityOps(data: ProData): ProCommunityOps {
  return data.communityOps ?? emptyCommunityOps();
}

/** Aplica un cambio a la operación, creándola si no existía. */
export function withCommunityOps(
  data: ProData,
  fn: (ops: ProCommunityOps) => ProCommunityOps,
): ProData {
  return { ...data, communityOps: fn(communityOps(data)) };
}

export function memberFeeCents(data: ProData): number {
  return data.communityOps?.settings.feeCents ?? MEMBER_FEE_CENTS;
}

/* ------------------------------------------------------------------ */
/* Curso académico                                                     */
/* ------------------------------------------------------------------ */

/** Año en que empezó el curso en marcha (el curso cambia el 1 de julio). */
export function courseStartYear(now: Date | string): number {
  const today = typeof now === "string" ? now.slice(0, 10) : localDate(now);
  const y = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 7 ? y : y - 1;
}

/** Primer día del curso en marcha (YYYY-MM-DD). */
export function courseStart(now: Date | string): string {
  return `${courseStartYear(now)}-07-01`;
}

/** "26/27". */
export function courseLabel(now: Date | string, offset = 0): string {
  const y = courseStartYear(now) + offset;
  return `${String(y).slice(2)}/${String(y + 1).slice(2)}`;
}

/* ------------------------------------------------------------------ */
/* Socios                                                              */
/* ------------------------------------------------------------------ */

export function isActiveMember(m: CommunityMember): boolean {
  return !m.leftAt;
}

/** Número de socio: orden de alta en el libro, estable aunque haya bajas. */
export function memberNumbers(members: CommunityMember[]): Map<string, number> {
  const sorted = [...members].sort(
    (a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id),
  );
  return new Map(sorted.map((m, i) => [m.id, i + 1]));
}

/** Socios activos que no han venido a nada en `weeks` semanas. */
export function dormantMembers(
  members: CommunityMember[],
  now: Date,
  weeks: number,
): CommunityMember[] {
  const limit = addDays(localDate(now), -weeks * 7);
  return members.filter(
    (m) =>
      isActiveMember(m) &&
      localDate(m.joinedAt) < limit &&
      (!m.lastSeenAt || localDate(m.lastSeenAt) < limit),
  );
}

/** Altas de un día concreto y lo cobrado en mano ese día (modo stand). */
export function standDay(members: CommunityMember[], date: string, feeCents: number) {
  const joined = members
    .filter((m) => localDate(m.joinedAt) === date)
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
  const paidCash = members.filter(
    (m) => m.feePaidVia === "efectivo" && m.feePaidAt && localDate(m.feePaidAt) === date,
  ).length;
  const paid = joined.filter((m) => m.fee === "paid").length;
  return { joined, paid, cashCents: paidCash * feeCents };
}

export const PAY_METHOD_LABEL: Record<CommunityPayMethod, string> = {
  efectivo: "Efectivo",
  bizum: "Bizum",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  franky: "Franky",
};

/** Libro de socios en CSV (separado por punto y coma, listo para Excel). */
export function membersCsv(
  members: CommunityMember[],
  opts: { feeCents: number; course: string },
): string {
  const numbers = memberNumbers(members);
  const header = [
    "N.º de socio",
    "Nombre",
    "Universidad",
    "Estudios",
    "Rol",
    "Fecha de alta",
    "Fecha de baja",
    `Cuota ${opts.course}`,
    "Importe",
    "Pagada por",
    "Cuenta universitaria verificada",
    "Consentimiento de imagen",
    "Teléfono",
  ];
  const role = { socio: "Socio", junta: "Junta", voluntario: "Voluntario" } as const;
  const fee = { paid: "Pagada", pending: "Pendiente", exempt: "Exento" } as const;
  const rows = [...members]
    .sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0))
    .map((m) => [
      String(numbers.get(m.id) ?? ""),
      m.name,
      m.university,
      m.studies,
      role[m.role],
      localDate(m.joinedAt),
      m.leftAt ? localDate(m.leftAt) : "",
      fee[m.fee],
      m.fee === "exempt" ? "0,00" : (opts.feeCents / 100).toFixed(2).replace(".", ","),
      m.feePaidVia ? PAY_METHOD_LABEL[m.feePaidVia] : "",
      m.verified === false ? "No" : "Sí",
      m.imageConsent === undefined ? "Sin respuesta" : m.imageConsent ? "Sí" : "No",
      m.phone ?? "",
    ]);
  return [header, ...rows].map((r) => r.map(proCsvCell).join(";")).join("\n");
}

/* ------------------------------------------------------------------ */
/* Inscritos, check-in y lista de espera                               */
/* ------------------------------------------------------------------ */

const GUEST_NAMES = [
  "Nora Beltrán", "Iker Sempere", "Chiara Rossi", "Lukas Weber", "Mireia Giner", "Daniel Poveda",
  "Emma Dubois", "Ángela Pina", "Álvaro Mas", "Sofía Guillén", "Jan Kowalski", "Carmen Albero",
  "Marc Bernabeu", "Lena Müller",
];
const GUEST_SURNAMES = ["Ramos", "Lillo", "Brotons", "Espí", "Cerdá"];

/**
 * Lista de inscritos de una actividad, estable entre visitas: primero socios
 * (rotando según la actividad) y después estudiantes que llegaron por Franky.
 * Quien se borró desaparece y quien entró desde la lista de espera va al final.
 */
export function activityAttendees(
  activity: CommunityActivity,
  members: CommunityMember[],
): Attendee[] {
  const cancelled = new Set(activity.cancelledIds ?? []);
  const joined = activity.joined ?? [];
  // La lista base se genera con el tamaño que tenía antes de altas y bajas.
  const base = Math.max(0, activity.registered - joined.length + cancelled.size);
  const seed = [...activity.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const memberShare = Math.round(base * 0.62);
  const list: Attendee[] = [];
  const pool = members.length ? members : [];
  for (let i = 0; i < memberShare && pool.length; i++) {
    const m = pool[(seed * 7 + i * 13) % pool.length];
    if (list.some((x) => x.id === m.id)) continue;
    list.push({
      id: m.id,
      name: m.name,
      studies: m.studies,
      university: m.university,
      member: true,
      viaFranky: Boolean(m.viaFranky),
      verified: m.verified !== false,
    });
  }
  let g = 0;
  while (list.length < base) {
    const first = GUEST_NAMES[(seed + g) % GUEST_NAMES.length];
    const name =
      g < GUEST_NAMES.length
        ? first
        : `${first.split(" ")[0]} ${GUEST_SURNAMES[g % GUEST_SURNAMES.length]}`;
    list.push({
      id: `x${activity.id}-${g}`,
      name,
      studies: STUDIES[(seed + g * 3) % STUDIES.length],
      university: g % 6 === 5 ? UNIVERSITIES[1] : UNIVERSITIES[0],
      member: false,
      viaFranky: true,
      verified: g % 9 !== 4,
    });
    g++;
  }
  return [...list.filter((x) => !cancelled.has(x.id)), ...joined];
}

/** Quién ha hecho check-in: lo guardado o, si no hay, los primeros `checkedIn` inscritos. */
export function checkedInSet(activity: CommunityActivity, attendees: Attendee[]): Set<string> {
  if (activity.checkedInIds) return new Set(activity.checkedInIds);
  return new Set(attendees.slice(0, activity.checkedIn).map((a) => a.id));
}

export function freeSeats(a: CommunityActivity): number {
  return Math.max(0, a.capacity - a.registered);
}

export type WaitlistResult = {
  activity: CommunityActivity;
  promoted: CommunityWaitEntry[];
};

function toAttendee(entry: CommunityWaitEntry): Attendee {
  return {
    id: entry.id,
    name: entry.name,
    studies: entry.studies,
    university: entry.university,
    member: entry.member,
    viaFranky: entry.viaFranky,
    verified: entry.verified,
  };
}

/** Sube a los primeros de la lista de espera hasta llenar `seats` plazas libres. */
export function promoteWaitlist(a: CommunityActivity, seats = freeSeats(a)): WaitlistResult {
  const waitlist = a.waitlist ?? [];
  const n = Math.max(0, Math.min(seats, waitlist.length, freeSeats(a)));
  if (!n) return { activity: a, promoted: [] };
  const promoted = waitlist.slice(0, n);
  return {
    activity: {
      ...a,
      waitlist: waitlist.slice(n),
      joined: [...(a.joined ?? []), ...promoted.map(toAttendee)],
      registered: a.registered + n,
    },
    promoted,
  };
}

/**
 * Alguien se borra: libera su plaza y, si hay lista de espera, entra el
 * primero. El check-in se fija antes para que no se mueva a otra persona.
 */
export function cancelRegistration(
  a: CommunityActivity,
  attendeeId: string,
  members: CommunityMember[],
): WaitlistResult {
  const roster = activityAttendees(a, members);
  if (!roster.some((p) => p.id === attendeeId)) return { activity: a, promoted: [] };
  const inside = checkedInSet(a, roster);
  inside.delete(attendeeId);
  const isJoined = (a.joined ?? []).some((p) => p.id === attendeeId);
  const next: CommunityActivity = {
    ...a,
    registered: Math.max(0, a.registered - 1),
    joined: isJoined ? (a.joined ?? []).filter((p) => p.id !== attendeeId) : a.joined,
    cancelledIds: isJoined ? a.cancelledIds : [...(a.cancelledIds ?? []), attendeeId],
    checkedInIds: [...inside],
    checkedIn: inside.size,
  };
  return promoteWaitlist(next, 1);
}

/** Más plazas: sube a tantos de la lista de espera como quepan. */
export function extendCapacity(a: CommunityActivity, extra: number): WaitlistResult {
  const next = { ...a, capacity: a.capacity + Math.max(0, Math.round(extra)) };
  return promoteWaitlist(next);
}

/* ------------------------------------------------------------------ */
/* Voluntarios                                                         */
/* ------------------------------------------------------------------ */

export const SHIFT_ROLES = ["Puerta y check-in", "Montaje", "Redes y fotos", "Recogida", "Barra", "Coordinación"];

export function shiftMinutes(s: CommunityShift): number {
  return Math.max(0, s.to - s.from);
}

/** Actividad que ya ha pasado (cerrada o con la fecha atrás). */
export function isPastActivity(a: CommunityActivity, now: Date): boolean {
  return a.status === "done" || (a.status === "published" && a.date < now.toISOString());
}

/** Minutos de voluntariado de un socio en actividades ya hechas. */
export function volunteerMinutes(
  memberId: string,
  activities: CommunityActivity[],
  now: Date,
): number {
  return activities
    .filter((a) => isPastActivity(a, now))
    .flatMap((a) => a.shifts ?? [])
    .filter((s) => s.people.includes(memberId))
    .reduce((acc, s) => acc + shiftMinutes(s), 0);
}

export function openShiftSlots(a: CommunityActivity): number {
  return (a.shifts ?? []).reduce((acc, s) => acc + Math.max(0, s.slots - s.people.length), 0);
}

/* ------------------------------------------------------------------ */
/* Historia del socio                                                  */
/* ------------------------------------------------------------------ */

export type MemberHistory = {
  attended: { activity: CommunityActivity; hours: number }[];
  ectsHours: number;
  volunteerMinutes: number;
  shifts: { activity: CommunityActivity; shift: CommunityShift }[];
};

/** Horas que cuenta una actividad: las de créditos si las tiene, si no su duración. */
export function activityHours(a: CommunityActivity): number {
  if (a.ectsHours) return a.ectsHours;
  return Math.round(((a.durationMinutes ?? 120) / 60) * 10) / 10;
}

export function memberHistory(
  memberId: string,
  activities: CommunityActivity[],
  members: CommunityMember[],
  now: Date,
  from?: string,
): MemberHistory {
  const past = activities
    .filter((a) => isPastActivity(a, now) && (!from || localDate(a.date) >= from))
    .sort((a, b) => b.date.localeCompare(a.date));
  const attended = past
    .filter((a) => checkedInSet(a, activityAttendees(a, members)).has(memberId))
    .map((a) => ({ activity: a, hours: activityHours(a) }));
  const shifts = past.flatMap((a) =>
    (a.shifts ?? [])
      .filter((s) => s.people.includes(memberId))
      .map((shift) => ({ activity: a, shift })),
  );
  return {
    attended,
    ectsHours: attended.reduce((acc, x) => acc + (x.activity.ectsHours ?? 0), 0),
    volunteerMinutes: shifts.reduce((acc, x) => acc + shiftMinutes(x.shift), 0),
    shifts,
  };
}

/* ------------------------------------------------------------------ */
/* Tipos de actividad y preparación                                    */
/* ------------------------------------------------------------------ */

export const ACTIVITY_KIND_LABEL: Record<CommunityActivityKind, string> = {
  proyeccion: "Proyección",
  taller: "Taller o curso",
  viaje: "Viaje o salida",
  fiesta: "Fiesta o concierto",
  charla: "Charla o mesa redonda",
  deporte: "Deporte o torneo",
  solidaria: "Solidaria",
  otra: "Otra",
};

/** Lo que suele hacer falta según el tipo de actividad y con cuántos días. */
export const PREP_TEMPLATES: Record<CommunityActivityKind, [string, number][]> = {
  proyeccion: [
    ["Reserva de la sala", 14],
    ["Derechos de proyección pública de la película", 10],
    ["Cartel con el logo del Consejo", 7],
    ["Prueba de proyector y sonido", 1],
  ],
  taller: [
    ["Reserva del aula", 14],
    ["Ponente confirmado", 10],
    ["Horas de créditos comunicadas a la universidad", 14],
    ["Material preparado", 2],
  ],
  viaje: [
    ["Autobús contratado y señal pagada", 21],
    ["Seguro de accidentes del grupo", 14],
    ["Lista de viajeros con DNI", 5],
    ["Teléfono de emergencia de la junta en el grupo", 2],
  ],
  fiesta: [
    ["Permiso del espacio y horario", 21],
    ["Aforo máximo confirmado con el local", 14],
    ["Seguro de responsabilidad civil", 14],
    ["Voluntarios de puerta asignados", 3],
  ],
  charla: [
    ["Reserva de la sala", 14],
    ["Ponentes confirmados", 10],
    ["Cartel publicado", 7],
  ],
  deporte: [
    ["Reserva de la instalación", 14],
    ["Cuadro de equipos cerrado", 3],
    ["Botiquín y agua", 1],
  ],
  solidaria: [
    ["Entidad colaboradora confirmada", 14],
    ["Punto de recogida preparado", 3],
    ["Cartel publicado", 7],
  ],
  otra: [
    ["Espacio reservado", 14],
    ["Cartel publicado", 7],
    ["Voluntarios asignados", 3],
  ],
};

export function prepFor(kind: CommunityActivityKind, idPrefix: string): CommunityPrepItem[] {
  return PREP_TEMPLATES[kind].map(([label, daysBefore], i) => ({
    id: `${idPrefix}-p${i + 1}`,
    label,
    daysBefore,
    done: false,
  }));
}

/** Tareas de preparación que ya deberían estar hechas y no lo están. */
export function prepAlerts(a: CommunityActivity, today: string): CommunityPrepItem[] {
  const day = localDate(a.date);
  if (a.status === "done" || day < today) return [];
  return (a.prep ?? []).filter((p) => !p.done && addDays(day, -p.daysBefore) <= today);
}

/* ------------------------------------------------------------------ */
/* Presupuesto y punto de equilibrio                                   */
/* ------------------------------------------------------------------ */

export type ActivityNumbers = {
  plannedCents: number;
  sponsorCents: number;
  /** Lo que te llega por entrada, ya sin la comisión de Franky. */
  netTicketCents: number;
  incomeCents: number;
  spentCents: number;
  /** Plazas que hay que vender para cubrir los gastos previstos. null si es gratis. */
  seatsNeeded: number | null;
  covered: boolean;
  /** Se pueden cubrir los gastos con el aforo que tiene. */
  reachable: boolean;
  /** Resultado previsto con lo inscrito hasta ahora. */
  resultCents: number;
  costPerPersonCents: number;
};

export function activityNumbers(
  a: CommunityActivity,
  movements: CommunityMovement[],
): ActivityNumbers {
  const plannedCents = (a.budget ?? []).reduce((acc, l) => acc + l.cents, 0);
  const sponsorCents = a.budgetSponsorCents ?? 0;
  const netTicketCents = Math.round(a.priceCents * (1 - FRANKY_FEE));
  const incomeCents = netTicketCents * a.registered;
  const spentCents = movements
    .filter((m) => m.kind === "expense" && m.activityId === a.id)
    .reduce((acc, m) => acc + m.amountCents, 0);
  const toCover = Math.max(0, plannedCents - sponsorCents);
  const seatsNeeded = netTicketCents > 0 ? Math.ceil(toCover / netTicketCents) : null;
  const cost = Math.max(plannedCents, spentCents);
  return {
    plannedCents,
    sponsorCents,
    netTicketCents,
    incomeCents,
    spentCents,
    seatsNeeded,
    covered: seatsNeeded === null ? toCover === 0 : a.registered >= seatsNeeded,
    reachable: seatsNeeded === null ? toCover === 0 : seatsNeeded <= a.capacity,
    resultCents: incomeCents + sponsorCents - cost,
    costPerPersonCents: a.registered ? Math.round(cost / a.registered) : cost,
  };
}

/* ------------------------------------------------------------------ */
/* Caja del curso                                                      */
/* ------------------------------------------------------------------ */

export const INCOME_LABEL: Record<CommunityIncomeCategory, string> = {
  venta: "Ventas (chapas, camisetas...)",
  subvencion: "Subvenciones",
  donacion: "Donaciones",
  patrocinio: "Patrocinios fuera de Franky",
  otros_ingresos: "Otros ingresos",
};

export const EXPENSE_LABEL: Record<CommunityExpenseCategory, string> = {
  transporte: "Transporte",
  entradas: "Entradas y reservas",
  comida: "Comida y bebida",
  material: "Material",
  imprenta: "Imprenta y carteles",
  derechos: "Derechos y licencias",
  premios: "Premios",
  local: "Local y espacios",
  seguros: "Seguros",
  banco: "Banco y trámites",
  otros_gastos: "Otros gastos",
};

export type LedgerLine = { key: string; label: string; cents: number };

export type CommunityLedger = {
  from: string;
  openingCents: number;
  incomes: LedgerLine[];
  expenses: LedgerLine[];
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /** Lo que ha entrado por Franky (entradas y cuotas), antes de comisión. */
  frankyCollectedCents: number;
  frankyFeeCents: number;
  pendingReimburse: CommunityMovement[];
  pendingReimburseCents: number;
  missingReceipts: number;
  byActivity: {
    id: string;
    title: string;
    date: string;
    incomeCents: number;
    expenseCents: number;
    resultCents: number;
  }[];
};

/**
 * Cuentas del curso en marcha: lo cobrado por Franky (entradas, cuotas y
 * patrocinios de Franky) más los apuntes a mano, menos los gastos y la
 * comisión de Franky. Es lo que se presenta en la asamblea.
 */
export function communityLedger(data: ProData, now: Date): CommunityLedger {
  const ops = communityOps(data);
  const from = courseStart(now);
  const fee = memberFeeCents(data);
  const acts = (data.activities as CommunityActivity[]).filter(
    (a) => a.status !== "draft" && localDate(a.date) >= from,
  );
  const movements = ops.movements.filter((m) => localDate(m.date) >= from);

  // Los viajes a plazos suman lo cobrado de verdad: por Franky a entradas y
  // lo cobrado a mano (Bizum, efectivo) en su propia línea.
  const ticketIncome = (a: CommunityActivity) =>
    tripIncome(a) ?? { frankyCents: a.priceCents * a.registered, handCents: 0 };
  const ticketsCents = acts.reduce((acc, a) => acc + ticketIncome(a).frankyCents, 0);
  const tripHandCents = acts.reduce((acc, a) => acc + ticketIncome(a).handCents, 0);
  const paidMembers = (data.communityMembers as CommunityMember[]).filter((m) => m.fee === "paid");
  const feesCents = paidMembers.length * fee;
  const sponsorsCents = data.sponsors
    .filter((s) => s.status === "active")
    .reduce((acc, s) => acc + s.amountCents, 0);
  const frankyFeeCents = Math.round((ticketsCents + feesCents) * FRANKY_FEE);

  const incomes: LedgerLine[] = [
    { key: "entradas", label: "Entradas de actividades", cents: ticketsCents },
    { key: "cuotas", label: `Cuotas de socio (${paidMembers.length})`, cents: feesCents },
    { key: "patrocinios", label: "Patrocinios de Franky", cents: sponsorsCents },
    { key: "viajes", label: "Plazos de viajes cobrados a mano", cents: tripHandCents },
  ];
  for (const key of Object.keys(INCOME_LABEL) as CommunityIncomeCategory[]) {
    const cents = movements
      .filter((m) => m.kind === "income" && m.category === key)
      .reduce((acc, m) => acc + m.amountCents, 0);
    if (cents) incomes.push({ key, label: INCOME_LABEL[key], cents });
  }

  const expenses: LedgerLine[] = [];
  for (const key of Object.keys(EXPENSE_LABEL) as CommunityExpenseCategory[]) {
    const cents = movements
      .filter((m) => m.kind === "expense" && m.category === key)
      .reduce((acc, m) => acc + m.amountCents, 0);
    if (cents) expenses.push({ key, label: EXPENSE_LABEL[key], cents });
  }
  if (frankyFeeCents) {
    expenses.push({
      key: "franky",
      label: `Comisión de Franky (${Math.round(FRANKY_FEE * 100)} % de entradas y cuotas)`,
      cents: frankyFeeCents,
    });
  }

  const incomeCents = incomes.reduce((acc, l) => acc + l.cents, 0);
  const expenseCents = expenses.reduce((acc, l) => acc + l.cents, 0);
  const pendingReimburse = movements.filter(
    (m) => m.kind === "expense" && m.paidBy && !m.reimbursed,
  );

  const byActivity = acts
    .map((a) => {
      const got = ticketIncome(a);
      const income = Math.round(got.frankyCents * (1 - FRANKY_FEE)) + got.handCents;
      const expense = movements
        .filter((m) => m.kind === "expense" && m.activityId === a.id)
        .reduce((acc, m) => acc + m.amountCents, 0);
      return {
        id: a.id,
        title: a.title,
        date: a.date,
        incomeCents: income,
        expenseCents: expense,
        resultCents: income - expense,
      };
    })
    .filter((x) => x.incomeCents || x.expenseCents)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    from,
    openingCents: ops.openingBalanceCents,
    incomes: incomes.filter((l) => l.cents),
    expenses,
    incomeCents,
    expenseCents,
    balanceCents: ops.openingBalanceCents + incomeCents - expenseCents,
    frankyCollectedCents: ticketsCents + feesCents,
    frankyFeeCents,
    pendingReimburse,
    pendingReimburseCents: pendingReimburse.reduce((acc, m) => acc + m.amountCents, 0),
    missingReceipts: movements.filter((m) => m.kind === "expense" && !m.receipt).length,
    byActivity,
  };
}

/** Cuentas del curso en CSV para el tesorero o la gestoría. */
export function ledgerCsv(
  ledger: CommunityLedger,
  movements: CommunityMovement[],
  activities: CommunityActivity[],
): string {
  const title = new Map(activities.map((a) => [a.id, a.title]));
  const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const header = ["Fecha", "Tipo", "Categoría", "Concepto", "Actividad", "Importe", "Pagado por", "Ticket"];
  const rows = movements
    .filter((m) => localDate(m.date) >= ledger.from)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => [
      localDate(m.date),
      m.kind === "income" ? "Ingreso" : "Gasto",
      m.kind === "income"
        ? INCOME_LABEL[m.category as CommunityIncomeCategory]
        : EXPENSE_LABEL[m.category as CommunityExpenseCategory],
      m.concept,
      m.activityId ? title.get(m.activityId) ?? "" : "",
      euros(m.kind === "income" ? m.amountCents : -m.amountCents),
      m.paidBy ?? "",
      m.receipt ? "Sí" : "No",
    ]);
  const auto = [
    ...ledger.incomes
      .filter((l) => ["entradas", "cuotas", "patrocinios"].includes(l.key))
      .map((l) => ["", "Ingreso", "Cobrado con Franky", l.label, "", euros(l.cents), "", ""]),
    ...ledger.incomes
      .filter((l) => l.key === "viajes")
      .map((l) => ["", "Ingreso", "Cobrado a mano", l.label, "", euros(l.cents), "", ""]),
    ...ledger.expenses
      .filter((l) => l.key === "franky")
      .map((l) => ["", "Gasto", "Comisiones", l.label, "", euros(-l.cents), "", ""]),
  ];
  return [header, ...auto, ...rows].map((r) => r.map(proCsvCell).join(";")).join("\n");
}

/* ------------------------------------------------------------------ */
/* Calendario del curso                                                */
/* ------------------------------------------------------------------ */

export const PERIOD_LABEL: Record<CommunityPeriodKind, string> = {
  examenes: "Exámenes",
  acogida: "Acogida",
  festivo: "Vacaciones",
  erasmus: "Llegada de Erasmus",
  otro: "Fecha clave",
};

/** Épocas típicas de un curso universitario; cada asociación las ajusta. */
export function defaultPeriods(now: Date): CommunityPeriod[] {
  const y = courseStartYear(now);
  const n = y + 1;
  return [
    { id: "per-acogida", title: "Jornadas de acogida", from: `${y}-09-07`, to: `${y}-09-18`, kind: "acogida" },
    { id: "per-navidad", title: "Vacaciones de Navidad", from: `${y}-12-23`, to: `${n}-01-06`, kind: "festivo" },
    { id: "per-ex-enero", title: "Exámenes de enero", from: `${n}-01-08`, to: `${n}-01-31`, kind: "examenes" },
    { id: "per-erasmus", title: "Llegan los Erasmus del segundo cuatrimestre", from: `${n}-02-02`, to: `${n}-02-13`, kind: "erasmus" },
    { id: "per-ex-junio", title: "Exámenes de junio", from: `${n}-05-25`, to: `${n}-06-13`, kind: "examenes" },
    { id: "per-ex-julio", title: "Exámenes de recuperación", from: `${n}-06-22`, to: `${n}-07-10`, kind: "examenes" },
  ];
}

export function periodsOn(date: string, periods: CommunityPeriod[]): CommunityPeriod[] {
  return periods.filter((p) => p.from <= date && date <= p.to);
}

/** La fecha cae en época de exámenes: se avisa antes de programar nada. */
export function examClash(date: string, periods: CommunityPeriod[]): CommunityPeriod | null {
  return periodsOn(date, periods).find((p) => p.kind === "examenes") ?? null;
}

/** Semanas (lunes a domingo) que cubren un mes, para la vista de calendario. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  let cursor = addDays(first, -weekday);
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  } while (cursor.slice(0, 7) === month);
  return weeks;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/* ------------------------------------------------------------------ */
/* Archivo de calendario (.ics)                                        */
/* ------------------------------------------------------------------ */

function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function activityIcs(
  a: CommunityActivity,
  opts: { spaceName: string; url: string; now: Date },
): string {
  const end = new Date(new Date(a.date).getTime() + (a.durationMinutes ?? 120) * 60000);
  const description = [a.description, `Organiza ${opts.spaceName}.`, opts.url]
    .filter(Boolean)
    .join("\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Franky//Franky Pro//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${a.id}@franky.es`,
    `DTSTAMP:${icsDate(opts.now.toISOString())}`,
    `DTSTART:${icsDate(a.date)}`,
    `DTEND:${icsDate(end.toISOString())}`,
    `SUMMARY:${icsText(a.title)}`,
    `LOCATION:${icsText(a.place)}`,
    `DESCRIPTION:${icsText(description)}`,
    `URL:${opts.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/* ------------------------------------------------------------------ */
/* Asambleas                                                           */
/* ------------------------------------------------------------------ */

export const ASSEMBLY_KIND_LABEL: Record<CommunityAssembly["kind"], string> = {
  ordinaria: "Asamblea general ordinaria",
  extraordinaria: "Asamblea general extraordinaria",
  junta: "Reunión de junta",
};

/** Quién vota: socios activos al corriente de la cuota, o la junta en sus reuniones. */
export function assemblyVoters(
  assembly: CommunityAssembly,
  members: CommunityMember[],
  board: ProBoardSeat[],
): CommunityMember[] {
  const active = members.filter(isActiveMember);
  if (assembly.kind === "junta") {
    const names = new Set(board.map((b) => b.name));
    return active.filter((m) => names.has(m.name));
  }
  return active.filter((m) => m.fee === "paid" || m.fee === "exempt");
}

export type QuorumState = {
  voters: number;
  presentVoters: number;
  /** Presentes que no votan (cuota pendiente o de fuera de la junta). */
  presentOthers: number;
  needed: number;
  firstCall: boolean;
  secondCallAt: string;
  secondCallOpen: boolean;
  /** Se puede votar: quórum en primera o ya en segunda convocatoria. */
  valid: boolean;
};

export function quorumState(
  assembly: CommunityAssembly,
  members: CommunityMember[],
  board: ProBoardSeat[],
  now: Date,
): QuorumState {
  const voters = assemblyVoters(assembly, members, board);
  const voterIds = new Set(voters.map((m) => m.id));
  const presentVoters = assembly.presentIds.filter((id) => voterIds.has(id)).length;
  const needed = Math.max(1, Math.ceil((voters.length * assembly.quorumPct) / 100));
  const secondCallAt = new Date(
    new Date(assembly.date).getTime() + assembly.secondCallMinutes * 60000,
  ).toISOString();
  const firstCall = presentVoters >= needed;
  const secondCallOpen = now.toISOString() >= secondCallAt;
  return {
    voters: voters.length,
    presentVoters,
    presentOthers: assembly.presentIds.length - presentVoters,
    needed,
    firstCall,
    secondCallAt,
    secondCallOpen,
    valid: firstCall || (secondCallOpen && presentVoters > 0),
  };
}

/** Votos emitidos en un punto y si cuadran con los presentes que votan. */
export function voteCheck(item: CommunityAgendaItem, presentVoters: number) {
  const yes = item.yes ?? 0;
  const no = item.no ?? 0;
  const abstain = item.abstain ?? 0;
  const cast = yes + no + abstain;
  return {
    yes,
    no,
    abstain,
    cast,
    tooMany: cast > presentVoters,
    // Mayoría simple de presentes: más votos a favor que en contra (LO 1/2002, art. 12).
    approved: yes > no,
  };
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** Borrador del acta con lo que ha pasado en la sala. La secretaría lo retoca. */
export function assemblyMinutesText(
  assembly: CommunityAssembly,
  data: ProData,
  now: Date,
): string {
  const members = data.communityMembers as CommunityMember[];
  const q = quorumState(assembly, members, data.board, now);
  const president = data.board.find((b) => /presiden/i.test(b.role));
  const secretary = data.board.find((b) => /secretar/i.test(b.role));
  const call = q.firstCall ? "primera" : "segunda";
  const start = assembly.startedAt ?? assembly.date;
  const end = assembly.closedAt ?? now.toISOString();
  const kind = ASSEMBLY_KIND_LABEL[assembly.kind];
  const present = members.filter((m) => assembly.presentIds.includes(m.id));

  const lines: string[] = [];
  lines.push(`Acta de la ${kind.toLowerCase()} de ${data.space.name}`);
  lines.push(
    `En ${data.space.city}, el ${dayLabel(start, { weekday: false })}, a las ${time(start)}, ` +
      `en ${assembly.place}, se reúne la ${kind.toLowerCase()} en ${call} convocatoria, ` +
      `con la asistencia de ${present.length} personas, de las que ${q.presentVoters} tienen derecho a voto ` +
      `(de ${q.voters} con derecho a voto).`,
  );
  if (assembly.kind === "junta" && present.length) {
    lines.push(`Asisten: ${listNames(present.map((m) => m.name))}.`);
  }
  const chair = [
    president ? `Preside ${president.name} (${president.role.toLowerCase()})` : "",
    secretary ? `actúa como ${secretary.role.toLowerCase()} ${secretary.name}` : "",
  ].filter(Boolean);
  if (chair.length) lines.push(`${chair.join(" y ")}.`);
  lines.push("Orden del día:");
  assembly.agenda.forEach((item, i) => lines.push(`${i + 1}. ${item.title}`));
  lines.push("Desarrollo y acuerdos:");
  assembly.agenda.forEach((item, i) => {
    const parts = [`${i + 1}. ${item.title}.`];
    if (item.vote && item.result) {
      const v = voteCheck(item, q.presentVoters);
      parts.push(
        `Votación: ${v.yes} a favor, ${v.no} en contra y ${v.abstain} abstenciones. ` +
          `${item.result === "approved" ? "Se aprueba" : "No se aprueba"}.`,
      );
    } else if (item.vote) {
      parts.push("Queda pendiente de votación.");
    }
    if (item.agreement) parts.push(`Acuerdo: ${item.agreement}`);
    lines.push(parts.join(" "));
  });
  lines.push(`Sin más asuntos que tratar, se levanta la sesión a las ${time(end)}.`);
  lines.push(
    `${secretary ? `La secretaría, ${secretary.name}` : "La secretaría"}. ` +
      `Visto bueno de la presidencia${president ? `, ${president.name}` : ""}.`,
  );
  return lines.join("\n\n");
}

export function openTasks(tasks: CommunityTask[]): CommunityTask[] {
  return tasks.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due));
}

/* ------------------------------------------------------------------ */
/* Mensajes listos para WhatsApp                                       */
/* ------------------------------------------------------------------ */

/** Enlace para compartir en un grupo: WhatsApp pregunta a qué chat enviarlo. */
export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function feeReminderMessage(opts: {
  member: CommunityMember;
  spaceName: string;
  sender?: string;
  feeCents: number;
  howToPay: string;
  course: string;
}): string {
  const from = opts.sender ? `, soy ${firstName(opts.sender)} de ${opts.spaceName}` : `, te escribimos de ${opts.spaceName}`;
  return (
    `Hola ${firstName(opts.member.name)}${from}. ` +
    `Te queda pendiente la cuota del curso ${opts.course}: ${money(opts.feeCents)}. ` +
    `${opts.howToPay} Muchas gracias por formar parte.`
  );
}

export function dormantInviteMessage(opts: {
  member: CommunityMember;
  spaceName: string;
  activity?: CommunityActivity;
  url: string;
}): string {
  const hello = `Hola ${firstName(opts.member.name)}, hace tiempo que no te vemos por ${opts.spaceName}.`;
  if (!opts.activity) return `${hello} Mira lo que tenemos preparado: ${opts.url}`;
  const a = opts.activity;
  return (
    `${hello} El ${dayLabel(a.date)} a las ${time(a.date)} tenemos ${a.title} en ${a.place}. ` +
    `Nos encantaría verte. Te apuntas aquí: ${opts.url}`
  );
}

export function announcementShareMessage(opts: { title: string; body: string; url: string }): string {
  return `*${opts.title}*\n\n${opts.body}\n\n${opts.url}`;
}

export function volunteerCallMessage(a: CommunityActivity, spaceName: string): string {
  const open = (a.shifts ?? []).filter((s) => s.people.length < s.slots);
  const lines = open.map(
    (s) =>
      `- ${s.role}, de ${minutesToLabel(s.from)} a ${minutesToLabel(s.to)}: ` +
      `faltan ${s.slots - s.people.length}`,
  );
  return (
    `Necesitamos voluntarios para ${a.title} (${dayLabel(a.date)}), de ${spaceName}.\n` +
    `${lines.join("\n")}\n` +
    "Contesta con el turno que quieres y te apuntamos. Las horas de voluntariado salen en tu certificado del curso."
  );
}

export function assemblyCallText(a: CommunityAssembly, spaceName: string): string {
  const agenda = a.agenda.map((item, i) => `${i + 1}. ${item.title}`).join("\n");
  const second = new Date(new Date(a.date).getTime() + a.secondCallMinutes * 60000).toISOString();
  return (
    `${spaceName} convoca ${ASSEMBLY_KIND_LABEL[a.kind].toLowerCase()} el ${dayLabel(a.date)} ` +
    `a las ${time(a.date)} en primera convocatoria y a las ${time(second)} en segunda, en ${a.place}.\n\n` +
    `Orden del día:\n${agenda}\n\n` +
    "Trae tu carné de Franky para el check-in: con él se cuenta el quórum y se vota."
  );
}

/* ------------------------------------------------------------------ */
/* Resumen para el día                                                 */
/* ------------------------------------------------------------------ */

/** Minutos desde medianoche a partir de "HH:MM". */
export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Hora de inicio de la actividad en minutos locales. */
export function activityStartMinutes(a: CommunityActivity): number {
  return localMinutes(a.date);
}

/** Crea un instante a partir de fecha y "HH:MM" en hora de Madrid. */
export function atClock(date: string, clock: string): string {
  return atLocal(date, parseClock(clock) ?? 0);
}
