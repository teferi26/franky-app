import type { ProPayment } from "./types";

/**
 * Datos propios del motor de pistas y espacios por horas (pádel y coworking).
 *
 * Viven en `ProData.courts` para no inflar el modelo común. Todo es opcional
 * desde fuera: una pantalla que no los encuentre usa `courtsOps(data)`, que
 * devuelve valores por defecto. Importes en céntimos, fechas YYYY-MM-DD y
 * horas en minutos desde la medianoche de Madrid (pueden pasar de 1440 si el
 * local abre hasta las 2:00).
 */
export type ProCourtsData = {
  policy: ProCourtPolicy;
  /** Pistas cubiertas: el resto se tratan como exteriores al llover. */
  coveredIds: string[];
  blocks: ProCourtBlock[];
  series: ProCourtSeries[];
  /** Quién ha pagado su parte en cada reserva de pista (clave: reserva). */
  splits: Record<string, ProPlayerShare[]>;
  waitlist: ProWaitEntry[];
  /** Nivel de juego de cada jugador (clave: cliente). */
  levels: Record<string, ProPlayerLevel>;
  passes: ProCourtPass[];
  penalties: ProCourtPenalty[];
  americanas: ProAmericana[];
  league: ProLeague | null;
  school: ProSchoolGroup[];
  lessons: ProPrivateLesson[];
  /** Precio por hora de cada monitor para calcular lo que se le paga. */
  coachRates: Record<string, number>;
  shop: ProShopItem[];
  /** Extras de mostrador añadidos a cada reserva (clave: reserva). */
  extras: Record<string, ProBookingExtra[]>;
  /* ---- Salas de estudio y coworking ---- */
  seats: ProSeat[];
  /** Puesto que ocupa cada reserva de una zona compartida. */
  seatByBooking: Record<string, string>;
  /** Horas reales de entrada y salida marcadas en recepción. */
  checkins: Record<string, { inAt?: string; outAt?: string }>;
  lockers: ProLocker[];
  specialHours: ProSpecialHours[];
  amenities: string[];
  rules: string[];
  warnings: ProConductWarning[];
  /** Ausencias de socios (los clientes sueltos usan `ProClient.noShows`). */
  memberNoShows: Record<string, number>;
  /** Minutos de sala de grupo incluidos al mes por plan. */
  roomAllowance: Record<string, number>;
  /** Minutos de sala cubiertos por la cuota en cada reserva. */
  roomCredit: Record<string, number>;
  cashClosings: ProCashClosing[];
  /* ---- Crecer con estudiantes ---- */
  /** Convenios con universidades, asociaciones o empresas. */
  agreements: ProCourtAgreement[];
  /** Campañas de temporada ya montadas (pack de bienvenida de septiembre). */
  campaigns: ProCourtCampaign[];
  /** Facturas emitidas, con numeración correlativa por serie y año. */
  invoices: ProCourtInvoice[];
  /** Datos fiscales del negocio que salen en cada factura. */
  fiscal: ProCourtFiscal | null;
  /**
   * Versión guardada en la cuenta real (pro_courts_state). El servidor
   * rechaza un guardado hecho sobre una versión anterior, así dos
   * recepcionistas no se pisan. En la demo no se usa.
   */
  revision?: number;
};

export type ProCourtPolicy = {
  /** Horas de preaviso para cancelar sin coste. */
  noticeHours: number;
  /** Parte del precio que se cobra al cancelar tarde o no presentarse. */
  penaltyPct: number;
  /** A partir de cuántas ausencias se avisa en rojo. */
  noShowWarnAt: number;
  /** Horas antes del inicio en que un partido abierto incompleto libera la pista. */
  matchReleaseHours: number;
  /** Minutos sin llegar tras los que se libera un puesto reservado. */
  releaseAfterMinutes: number;
  /** Si llueve, cancelar no cuesta nada. */
  rainFree: boolean;
  /** Puntualidad y otras normas que se enlazan en la confirmación. */
  punctualityNote: string;
};

export type ProCourtBlockReason =
  | "maintenance"
  | "class"
  | "tournament"
  | "private";

export type ProCourtBlock = {
  id: string;
  resourceIds: string[];
  date: string;
  from: number;
  to: number;
  reason: ProCourtBlockReason;
  note?: string;
  /** Americana, liga o grupo de escuela que lo generó. */
  sourceId?: string;
  /** Bloqueos calculados (grupos de escuela): no se borran a mano. */
  virtual?: boolean;
};

export type ProSeriesClash = {
  date: string;
  reason: "booked" | "blocked" | "closed";
  withName?: string;
  status: "open" | "moved" | "skipped";
  movedTo?: { resourceId: string; from: number; bookingId: string };
};

/** Turno fijo semanal: la misma pista, el mismo día y la misma hora. */
export type ProCourtSeries = {
  id: string;
  resourceId: string;
  weekday: number;
  from: number;
  duration: number;
  clientId?: string;
  clientName: string;
  phone?: string;
  startDate: string;
  until: string;
  priceCents: number;
  bookingIds: string[];
  clashes: ProSeriesClash[];
  createdAt: string;
  active: boolean;
};

export type ProPlayerShare = {
  name: string;
  clientId?: string;
  phone?: string;
  paidCents: number;
  method?: ProPayment["method"];
  paidAt?: string;
  /** Pagado con saldo del monedero o del bono. */
  fromPassId?: string;
};

export type ProWaitEntry = {
  id: string;
  /** Pista o zona concreta; sin ella, vale cualquiera del mismo tipo. */
  resourceId?: string;
  date: string;
  from: number;
  duration: number;
  name: string;
  phone?: string;
  clientId?: string;
  createdAt: string;
  status: "waiting" | "notified" | "booked" | "dropped";
  notifiedAt?: string;
};

export type ProPlayerLevel = {
  /** De 1,0 a 7,0 en pasos de 0,25. */
  level: number;
  hand: "right" | "left";
  side: "drive" | "reves" | "both";
  history: { at: string; level: number }[];
};

export type ProCourtPassKind = "matches" | "hours" | "wallet";

/** Bono de partidos u horas, o monedero con saldo en céntimos. */
export type ProCourtPass = {
  id: string;
  clientId?: string;
  name: string;
  phone?: string;
  kind: ProCourtPassKind;
  label: string;
  /** Partidos, horas o céntimos comprados. */
  total: number;
  left: number;
  priceCents: number;
  soldAt: string;
  expiresAt: string;
  uses: { at: string; bookingId?: string; amount: number }[];
};

export type ProCourtPenalty = {
  id: string;
  bookingId: string;
  clientId?: string;
  clientName: string;
  at: string;
  kind: "late_cancel" | "no_show";
  amountCents: number;
  status: "charged" | "forgiven";
};

/* ---------- Competición ---------- */

export type ProAmericanaPlayer = {
  id: string;
  name: string;
  phone?: string;
  clientId?: string;
  level?: number;
  paid: boolean;
};

export type ProAmericanaGame = {
  resourceId: string;
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number | null;
  scoreB: number | null;
};

export type ProAmericanaRound = { index: number; games: ProAmericanaGame[] };

export type ProAmericana = {
  id: string;
  name: string;
  date: string;
  from: number;
  roundMinutes: number;
  roundsPlanned: number;
  resourceIds: string[];
  level: string;
  maxPlayers: number;
  pricePerPlayerCents: number;
  status: "open" | "playing" | "done";
  players: ProAmericanaPlayer[];
  rounds: ProAmericanaRound[];
  studentsOnly: boolean;
  createdAt: string;
};

export type ProLeagueTeam = {
  id: string;
  name: string;
  faculty: string;
  players: [string, string];
  phone?: string;
};

export type ProLeagueFixture = {
  id: string;
  round: number;
  date: string;
  from: number;
  resourceId: string;
  home: string;
  away: string;
  /** Sets ganados por cada pareja, null mientras no se juega. */
  homeSets: number | null;
  awaySets: number | null;
};

export type ProLeague = {
  id: string;
  name: string;
  weekday: number;
  from: number;
  startDate: string;
  resourceIds: string[];
  teams: ProLeagueTeam[];
  fixtures: ProLeagueFixture[];
};

/* ---------- Escuela ---------- */

export type ProSchoolStudent = {
  id: string;
  name: string;
  phone?: string;
  feeStatus: "paid" | "pending";
  /** Menor de edad: su contacto es el de su madre, padre o tutor. */
  minor?: boolean;
};

export type ProSchoolGroup = {
  id: string;
  name: string;
  level: string;
  coachId: string;
  resourceId: string;
  weekday: number;
  from: number;
  duration: number;
  capacity: number;
  monthlyFeeCents: number;
  students: ProSchoolStudent[];
  /** Presentes por fecha de clase. */
  attendance: Record<string, string[]>;
  /** Primer y último día del curso de la escuela. */
  season: { from: string; to: string };
};

export type ProPrivateLesson = {
  id: string;
  coachId: string;
  resourceId: string;
  date: string;
  from: number;
  duration: number;
  studentName: string;
  phone?: string;
  priceCents: number;
  bookingId: string;
  status: "scheduled" | "done" | "cancelled";
};

/* ---------- Mostrador ---------- */

export type ProShopItem = {
  id: string;
  name: string;
  kind: "rental" | "sale";
  priceCents: number;
  /** null = sin control de existencias (alquiler de palas). */
  stock: number | null;
};

export type ProBookingExtra = {
  itemId: string;
  name: string;
  qty: number;
  priceCents: number;
};

/* ---------- Sala de estudio ---------- */

export type ProSeat = {
  id: string;
  resourceId: string;
  label: string;
  plug: boolean;
  lamp: boolean;
  /** Socio con puesto fijo (id de ProMember) y su nombre. */
  fixedMemberId?: string;
  fixedName?: string;
  /** Bloque de puestos por carrera u oposición ("Mesa de Medicina"). */
  group?: string;
};

export type ProLocker = {
  id: string;
  label: string;
  memberId?: string;
  name?: string;
  /** Hasta qué día está pagada (YYYY-MM-DD). */
  until?: string;
};

export type ProSpecialHours = {
  id: string;
  from: string;
  to: string;
  open: number;
  close: number;
  label: string;
  announced: boolean;
};

export type ProConductWarning = {
  id: string;
  name: string;
  memberId?: string;
  kind: "noise" | "phone" | "food" | "saving" | "other";
  note?: string;
  at: string;
};

export type ProCashClosing = {
  id: string;
  date: string;
  at: string;
  expectedCashCents: number;
  countedCashCents: number;
  by: string;
};

/* ---------- Convenios y campañas de temporada ---------- */

/**
 * Convenio con una universidad, una asociación o una empresa: sus miembros
 * reservan con el precio pactado y el responsable recibe un resumen al mes.
 * Con `university`, entra cualquier estudiante verificado de esa universidad;
 * además, se pueden apuntar personas una a una en `memberIds`.
 */
export type ProCourtAgreement = {
  id: string;
  name: string;
  kind: "university" | "association" | "company";
  /** Nombre de la universidad tal y como lo trae la ficha del estudiante. */
  university?: string;
  memberIds: string[];
  discountPct: number;
  /** Solo de 10 a 14 h entre semana (lo habitual para no tocar la tarde). */
  valleyOnly: boolean;
  from: string;
  to: string;
  contact: { name: string; phone?: string; email?: string };
  active: boolean;
  createdAt: string;
};

export type ProCourtCampaign = {
  id: string;
  kind: "welcome";
  /** Curso al que pertenece ("2026-27"). */
  course: string;
  createdAt: string;
  groupId?: string;
  americanaId?: string;
};

/* ---------- Facturas ---------- */

export type ProCourtFiscal = {
  /** Razón social o nombre del autónomo. */
  name: string;
  nif: string;
  address: string;
  /** IVA que se aplica a los servicios (21 % para alquiler de espacios). */
  vatPct: number;
};

export type ProInvoiceLine = { concept: string; amountCents: number };

export type ProCourtInvoice = {
  id: string;
  /** "F" facturas completas, "T" simplificadas (tique). */
  series: "F" | "T";
  year: number;
  seq: number;
  /** Número completo, por ejemplo F2026-0007. */
  number: string;
  date: string;
  customer: { name: string; nif?: string; address?: string };
  lines: ProInvoiceLine[];
  /** Importes con IVA incluido, como se cobran en el mostrador. */
  totalCents: number;
  baseCents: number;
  vatCents: number;
  vatPct: number;
  paymentId?: string;
  createdAt: string;
};
