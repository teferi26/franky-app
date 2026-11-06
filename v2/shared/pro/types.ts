/**
 * Modelo de datos de Franky Pro (la app de los negocios).
 *
 * Es un modelo de PRESENTACIÓN: lo que pintan las pantallas. La fuente puede
 * ser la demo local de cada sector o las RPC reales (professional_*, workspace_*),
 * que se adaptan a estas formas en `store.tsx`. Importes siempre en céntimos,
 * fechas en ISO 8601 y horas locales de Europe/Madrid.
 */

export type ProVerticalId =
  | "hairdresser"
  | "beauty"
  | "cafe"
  | "bar"
  | "restaurant"
  | "pub"
  | "nightclub"
  | "sports"
  | "sports_facility"
  | "academy"
  | "culture"
  | "coworking"
  | "agency"
  | "landlord"
  | "community"
  | "university";

/** Cada sector se apoya en un motor de operación; varios sectores comparten motor. */
export type ProEngine =
  | "agenda"
  | "tables"
  | "night"
  | "classes"
  | "courts"
  | "housing"
  | "community"
  | "university";

export type ProSectionId =
  | "hoy"
  | "agenda"
  | "reservas"
  | "sala"
  | "carta"
  | "validar"
  | "eventos"
  | "rrpp"
  | "puerta"
  | "reservados"
  | "horario"
  | "socios"
  | "pistas"
  | "clientes"
  | "servicios"
  | "caja"
  | "grupos"
  | "estudiantes"
  | "equipo"
  | "interesados"
  | "cartera"
  | "visitas"
  | "inquilinos"
  | "miembros"
  | "actividades"
  | "avisos"
  | "patrocinios"
  | "junta"
  | "subvenciones"
  | "asamblea"
  | "material"
  | "publicaciones"
  | "bienvenida"
  | "alojamiento"
  | "asociaciones"
  | "moderacion"
  | "calendario"
  | "memoria"
  | "atencion"
  | "mentores"
  | "preguntas"
  | "seguimiento"
  | "barra"
  | "cuadrante"
  | "incidencias"
  | "pedidos"
  | "appcc"
  | "compras"
  | "costes"
  | "mostrador"
  | "torneos"
  | "escuela"
  | "ocupacion"
  | "bonos"
  | "puestos"
  | "normas"
  | "convenios"
  | "ajustes"
  | "curso"
  | "cuentas"
  | "guia";

export type ProSpace = {
  id: string;
  name: string;
  vertical: ProVerticalId;
  city: string;
  address: string;
  /** Nombre corto para la URL pública de reservas: franky.es/n/<slug>. */
  slug: string;
  demo: boolean;
  plan: "free" | "pro" | "founder" | "unknown";
  timezone?: string;
  owner: { name: string; firstName: string };
  /** Minutos desde medianoche por día (0 = lunes). null = cerrado. */
  hours: ({ open: number; close: number } | null)[];
  /** Campus de referencia para "a X minutos de tu facultad". */
  campus: string;
  walkMinutesToCampus: number | null;
  rating: number | null;
  reviewsCount: number;
  publicProfile: {
    published?: boolean;
    description: string;
    photos: number;
    bookingEnabled: boolean;
    cardEnabled: boolean;
    cardDiscountPct: number;
  };
};

export type ProRole =
  | "owner"
  | "manager"
  | "staff"
  | "reception"
  | "rrpp"
  | "agent"
  | "board"
  | "editor";

export type ProStaff = {
  id: string;
  name: string;
  role: ProRole;
  /** Color de su columna en la agenda: clave de STAFF_TONES. */
  tone: ToneKey;
  title: string;
  commissionPct: number;
  /** Fichaje abierto ahora mismo (ISO) o null. */
  clockedInAt: string | null;
  weekMinutes: number;
  phone?: string;
  /** Comisión de producto y alquiler de sillón (agenda-types.ts). */
  agenda?: import("./agenda-types").ProStaffAgenda;
};

export type ToneKey =
  | "violet"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "teal"
  | "slate";

export type ProClientSource =
  | "franky"
  | "hueco"
  | "card"
  | "instagram"
  | "phone"
  | "walkin"
  | "google"
  | "grupo"
  | "unknown";

export type ProClient = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  student?: { university: string; faculty: string; verified: boolean };
  tags: string[];
  visits: number;
  spentCents: number | null;
  lastVisit?: string;
  noShows: number;
  source: ProClientSource;
  notes?: string;
  /** Ficha técnica (fórmula de color, alergias no médicas, preferencias). */
  technical?: string;
  marketingConsent: boolean;
  cardMember: boolean;
  birthday?: string;
  createdAt: string;
  /** Fórmulas, salud, permisos y visitas anteriores (agenda-types.ts). */
  agenda?: import("./agenda-types").ProClientAgenda;
};

export type BookingStatus =
  | "requested"
  | "confirmed"
  | "arrived"
  | "in_service"
  | "done"
  | "no_show"
  | "cancelled";

export type ProService = {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  priceCents: number;
  /** Precio en horas valle para estudiantes verificados. */
  studentPriceCents?: number;
  staffIds: string[];
  online: boolean;
  popular?: boolean;
  /** Vuelta, pose, prueba, cabina, señal y comisión (agenda-types.ts). */
  agenda?: import("./agenda-types").ProServiceAgenda;
};

/** Cita, reserva de mesa, plaza de clase, reserva de pista o visita a un piso. */
export type ProBooking = {
  id: string;
  kind: "appointment" | "table" | "class" | "court" | "visit";
  clientId?: string;
  clientName: string;
  staffId?: string;
  resourceId?: string;
  resourceIds?: string[];
  serviceId?: string;
  sessionId?: string;
  start: string;
  end: string;
  blockedUntil?: string;
  reschedule?: { start: string; expiresAt: string };
  customerAccount?: boolean;
  tableOperation?: ProTableBookingOperation;
  partySize: number;
  status: BookingStatus;
  priceCents: number;
  paidCents: number | null;
  source: ProClientSource;
  note?: string;
  /** Plaza de clase en espera de confirmación, separada de la nota libre. */
  waitlisted?: boolean;
  /** Reserva de una clase de prueba. */
  trial?: boolean;
  offerId?: string;
  student?: boolean;
  /** Recordatorio, confirmación, señal y serie de la cita (agenda-types.ts). */
  agenda?: import("./agenda-types").ProBookingAgenda;
};

export type ProPayment = {
  id: string;
  at: string;
  bookingId?: string;
  clientName: string;
  staffId?: string;
  concept: string;
  amountCents: number;
  tipCents: number;
  method: "card" | "cash" | "bizum";
  /** Líneas, descuentos y pago mixto del cobro completo (agenda-types.ts). */
  agenda?: import("./agenda-types").ProPaymentAgenda;
};

/** Hueco relámpago, hora valle, ventaja Card, primera visita o menú de grupo. */
export type ProOffer = {
  id: string;
  kind: "flash" | "valley" | "card" | "first_visit" | "group" | "exam";
  title: string;
  detail: string;
  discountPct: number;
  /** Para huecos: franja concreta. Para recurrentes: días y horas. */
  startsAt?: string;
  endsAt?: string;
  days?: number[];
  fromMinute?: number;
  toMinute?: number;
  slots: number;
  claimed: number;
  audience: { studentsOnly: boolean; radiusKm: number; universities: string[] };
  status: "draft" | "live" | "scheduled" | "ended";
  reach: number;
  views: number;
  bookings: number;
  revenueCents: number;
  createdAt: string;
};

export type ProReview = {
  id: string;
  clientName: string;
  university?: string;
  rating: number;
  text: string;
  at: string;
  verifiedVisit: boolean;
  reply?: string;
};

export type ProShift = {
  id: string;
  staffId: string;
  date: string;
  inAt: string;
  outAt: string | null;
  breakMinutes: number;
};

export type ProGroupRequest = {
  id: string;
  organizer: string;
  organization: string;
  kind: string;
  people: number;
  date: string;
  budgetPerPersonCents: number;
  message: string;
  status: "new" | "quoted" | "accepted" | "declined";
  quoteCents?: number;
  createdAt: string;
};

export type ProInboxItem = {
  id: string;
  at: string;
  kind:
    | "booking"
    | "message"
    | "review"
    | "group"
    | "lead"
    | "payment"
    | "system"
    | "incident";
  title: string;
  body: string;
  href?: string;
  read: boolean;
};

/* ---------- Motor de mesas (restaurante, bar, cafetería, pub) ---------- */

export type ProTable = {
  id: string;
  name: string;
  seats: number;
  zone: string;
  /** Posición en el plano, en una rejilla de 12 x 8. */
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "square" | "round" | "bar";
  active?: boolean;
  exclusive?: boolean;
  cleaningMinutes?: number;
  version?: number;
};

export type ProTableBookingOperation = {
  tableId: string;
  seatedAt: string | null;
  leftAt: string | null;
  cleanedAt: string | null;
  cleaningMinutes: number;
};

export type ProTableWaitlistEntry = {
  id: string;
  customerId: string;
  customerName: string;
  customerContact?: string | null;
  serviceId: string;
  partySize: number;
  requestedAt: string;
  expiresAt: string;
  status: "waiting" | "expired" | "seated" | "cancelled";
  bookingId: string | null;
  serviceVersion: number;
  expectedTotalCents: number | null;
  note?: string;
};

export type Allergen =
  | "gluten"
  | "crustaceos"
  | "huevo"
  | "pescado"
  | "cacahuete"
  | "soja"
  | "lacteos"
  | "frutos_cascara"
  | "apio"
  | "mostaza"
  | "sesamo"
  | "sulfitos"
  | "altramuces"
  | "moluscos";

export type ProMenuItem = {
  id: string;
  section: string;
  name: string;
  description?: string;
  priceCents: number;
  allergens: Allergen[];
  available: boolean;
  studentFavorite?: boolean;
  vegetarian?: boolean;
};

export type ProDailyMenu = {
  date: string;
  priceCents: number;
  studentPriceCents?: number;
  starters: string[];
  mains: string[];
  desserts: string[];
  includes: string;
  published: boolean;
};

export type ProLoyalty = {
  stampsNeeded: number;
  reward: string;
  activeCards: number;
  stampsToday: number;
  rewardsThisMonth: number;
};

export type ProValidation = {
  id: string;
  at: string;
  clientName: string;
  university?: string;
  kind: "discount" | "stamp" | "reward";
  amountCents: number;
  discountCents: number;
  staffId?: string;
};

/* ---------- Motor de noche (pub, discoteca, promotor) ---------- */

export type ProTicketTier = {
  id: string;
  name: string;
  priceCents: number;
  quantity: number;
  sold: number;
  /** Hasta cuándo se vende este tramo (ISO) o null si hasta agotar. */
  until: string | null;
  includes?: string;
};

export type ProEvent = {
  id: string;
  name: string;
  date: string;
  doorsOpen: string;
  closes: string;
  capacity: number;
  checkedIn: number;
  tiers: ProTicketTier[];
  listCutoff?: string;
  ageMin: number;
  status: "draft" | "on_sale" | "tonight" | "past";
  crushLive: boolean;
  poster: ToneKey;
  lineup?: string;
  /** Personas que entran sin entrada ni lista. */
  walkIns?: number;
  organizer?: string;
  /** Noches creadas con "Repetir cada semana" comparten serie. */
  seriesId?: string;
  /** Precio en puerta para quien viene en lista y llega pasada la hora de corte. */
  afterCutoffCents?: number;
  /** Costes de la noche para saber si ha ganado o perdido dinero. */
  costs?: import("./night-types").ProNightCost[];
  /** Crush Live medido; sin este dato no se enseñan cifras. */
  crush?: import("./night-types").ProCrushTotals;
};

export type ProCommissionRule =
  | { kind: "per_scan"; cents: number }
  | { kind: "tiers"; upTo: number; lowCents: number; highCents: number };

export type ProPromoterPayout = {
  at: string;
  amountCents: number;
  scanned: number;
};

export type ProPromoter = {
  id: string;
  name: string;
  university?: string;
  code: string;
  listSize: number;
  sold: number;
  checkedIn: number;
  commissionCents: number;
  rule: string;
  active: boolean;
  spec?: ProCommissionRule;
  phone?: string;
  since?: string;
  /** Eventos ya liquidados con este RRPP. */
  settledEventIds?: string[];
  payouts?: ProPromoterPayout[];
  /** Cupo de apuntados por noche y hora de corte propia. */
  cap?: import("./night-types").ProPromoterCap;
};

export type ProGuest = {
  id: string;
  name: string;
  eventId: string;
  kind: "ticket" | "list" | "reserved";
  tierName?: string;
  promoterId?: string;
  checkedInAt: string | null;
  age18: boolean;
  /** Hora a la que la puerta vio su documento (sin foto ni número). */
  ageCheckedAt?: string;
  university?: string;
};

export type ProZone = {
  id: string;
  name: string;
  capacity: number;
  minimumSpendCents: number;
  depositCents: number;
  bookedBy?: string;
  people?: number;
  status: "free" | "held" | "booked" | "arrived";
  eventId?: string;
  birthday?: boolean;
  phone?: string;
  note?: string;
  /** Un apartado sin señal se libera solo a esta hora. */
  holdUntil?: string;
  /** Lo que lleva consumido el reservado esta noche. */
  tab?: import("./night-types").ProZoneTabLine[];
};

/* ---------- Motor de clases (deporte, academia, cultura) ---------- */

export type ProClassType = {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  capacity: number;
  coachId: string;
  tone: ToneKey;
  level?: string;
  active?: boolean;
  resourceIds?: string[];
  version?: number;
};

export type ProClassSession = {
  id: string;
  classTypeId: string;
  start: string;
  end: string;
  capacity: number;
  booked: number;
  waitlist: number;
  checkedIn: number | null;
  room: string;
  coachId: string;
  resourceIds?: string[];
  status?: "open" | "cancelled";
  seriesId?: string | null;
};

export type ProServiceBundle = {
  id: string;
  customerId: string;
  serviceId: string;
  label: string;
  remaining: number;
  granted: number;
};

export type ProMembershipPlan = {
  id: string;
  name: string;
  priceCents: number;
  period: "month" | "quarter" | "year" | "pack";
  sessions: number | null;
  studentPriceCents?: number;
  members: number;
};

export type ProMember = {
  id: string;
  clientId: string;
  name: string;
  planId: string;
  status: "active" | "overdue" | "paused" | "trial" | "cancelled";
  nextChargeAt: string | null;
  sessionsLeft: number | null;
  since: string;
  attendanceLast30: number;
  student?: { university: string; verified: boolean };
  studies?: string;
  phone?: string;
  source?: ProClientSource;
  /** Fecha ISO de la última baja o pausa. */
  changedAt?: string;
};

/* ---------- Motor de recursos por franja (pistas, coworking) ---------- */

export type ProResource = {
  id: string;
  name: string;
  kind: "court" | "desk" | "room" | "cabin" | "table";
  capacity: number;
  pricePerHourCents: number | null;
  valleyPricePerHourCents?: number;
  serviceIds?: string[];
  allocationMode?: "exclusive" | "shared";
  capacityUnit?: "concurrent_bookings" | "people";
  configured?: boolean;
  version?: number | null;
  tone: ToneKey;
  note?: string;
};

export type ProOpenMatch = {
  id: string;
  resourceId: string;
  start: string;
  level: string;
  players: string[];
  needed: number;
  university?: string;
};

/* ---------- Vivienda (inmobiliaria y propietario) ---------- */

export type ProRoom = {
  id: string;
  name: string;
  sizeM2: number;
  priceCents: number;
  status: "free" | "reserved" | "occupied" | "leaving";
  tenantId?: string;
  availableFrom: string;
  exterior: boolean;
  privateBath: boolean;
  /** Libre en julio y agosto para estancias cortas (cursos de verano, prácticas). */
  summer?: boolean;
};

export type ProProperty = {
  id: string;
  title: string;
  address: string;
  zone: string;
  minutesToCampus: number;
  rooms: ProRoom[];
  photos: number;
  views30: number;
  published: boolean;
  agentId?: string;
  wholeFlatPriceCents?: number;
  /** Lo que pediría el dueño por el piso entero, solo para compararlo con las habitaciones. */
  wholeFlatReferenceCents?: number;
  /** NRUA, letra energética y catastro (housing-types.ts). */
  compliance?: import("./housing-types").ProPropertyCompliance;
  /** Normas de la casa que ve cada inquilino en su Franky. */
  rules?: string[];
  /** Tope mensual de suministros por inquilino; lo que pase lo paga el dueño. */
  utilitiesCapCents?: number;
  /** Propietario del piso cuando lo gestiona una inmobiliaria. */
  ownerId?: string;
  /** Nota interna del equipo (solo la ve el negocio). */
  note?: string;
  /** Etiquetas internas: "reforma pendiente", "llaves en oficina"... */
  tags?: string[];
};

export type LeadStage =
  | "new"
  | "contacted"
  | "visit"
  | "reserved"
  | "signed"
  | "lost";

export type ProLeadContract = {
  kind: ProTenant["contractKind"];
  start: string;
  months: number;
  rentCents: number;
  /** Por qué es temporal (estudios en la UA el curso 26/27...). */
  reason?: string;
  utilities?: "included" | "split" | "cap";
  utilitiesCapCents?: number;
};

export type ProLead = {
  id: string;
  name: string;
  university: string;
  studies: string;
  verified: boolean;
  erasmus: boolean;
  budgetCents: number;
  moveIn: string;
  months: number;
  propertyId?: string;
  roomId?: string;
  stage: LeadStage;
  roomieGroup?: { size: number; compatibility: number; names: string[] };
  message: string;
  createdAt: string;
  lastContactAt?: string;
  agentId?: string;
  guarantor: boolean;
  lostReason?: string;
  contractSentAt?: string;
  contract?: ProLeadContract;
  note?: string;
  /** Los interesados añadidos por el negocio se distinguen de los de Franky. */
  source?: "manual";
  /** Documentación pedida antes del contrato (housing-types.ts). */
  docs?: import("./housing-types").ProTenantDocs;
  /** Respuestas rápidas ya enviadas, por plantilla. */
  replies?: { id: string; at: string }[];
  /** Etiquetas internas: "padres llaman mucho", "prefiere exterior"... */
  tags?: string[];
};

export type ProVisit = {
  id: string;
  leadId: string;
  propertyId: string;
  start: string;
  mode: "in_person" | "video";
  status: "scheduled" | "done" | "no_show" | "cancelled";
  agentId?: string;
  /** El interesado ha confirmado que viene. */
  confirmedAt?: string;
  /** Pedida por el estudiante desde la ficha del piso. */
  source?: "public";
};

export type ProTenant = {
  id: string;
  name: string;
  university: string;
  propertyId: string;
  roomId: string;
  rentCents: number;
  contractStart: string;
  contractEnd: string;
  contractKind: "temporada" | "habitacion" | "vivienda";
  deposit: {
    amountCents: number;
    status: "pending" | "lodged" | "returned";
    dueAt: string;
  };
  rentStatus: "paid" | "pending" | "late";
  paidThisMonthAt?: string;
  leavingAt?: string;
  remindedAt?: string;
  renewalSentAt?: string;
  lodgedAt?: string;
  returnedAt?: string;
  /** Mensualidades anteriores (housing-types.ts). */
  payments?: import("./housing-types").ProRentPayment[];
  docs?: import("./housing-types").ProTenantDocs;
  inventory?: import("./housing-types").ProInventory;
  moveOut?: import("./housing-types").ProMoveOut;
  renewal?: import("./housing-types").ProRenewal;
  /** Nota interna del equipo y etiquetas, como en el interesado. */
  note?: string;
  tags?: string[];
};

export type ProIncident = {
  id: string;
  propertyId: string;
  roomId?: string;
  tenantName: string;
  title: string;
  priority: "low" | "normal" | "urgent";
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
  assignee?: string;
  /** Fotos que adjuntó el inquilino al abrirla. */
  photos?: number;
  /** Fotos reales guardadas con la incidencia (reducidas, en JPEG). */
  photoUrls?: string[];
  providerId?: string;
  resolvedAt?: string;
  /** Lo que ha costado arreglarla. */
  costCents?: number;
};

/* ---------- Asociaciones y comunidades ---------- */

export type ProCommunityMember = {
  id: string;
  name: string;
  university: string;
  studies: string;
  role: "socio" | "junta" | "voluntario";
  fee: "paid" | "pending" | "exempt";
  joinedAt: string;
  activities: number;
};

export type ProActivity = {
  id: string;
  title: string;
  date: string;
  place: string;
  capacity: number;
  registered: number;
  checkedIn: number;
  priceCents: number;
  ectsHours?: number;
  status: "draft" | "published" | "done";
  sponsorId?: string;
};

export type ProAnnouncement = {
  id: string;
  title: string;
  body: string;
  at: string;
  audience: "todos" | "socios" | "junta";
  reads: number;
  pinned?: boolean;
};

export type ProSponsor = {
  id: string;
  business: string;
  vertical: ProVerticalId;
  packageName: string;
  amountCents: number;
  status: "proposed" | "active" | "finished";
  reach: number;
  redemptions: number;
  franky: boolean;
};

export type ProBoardSeat = {
  id: string;
  role: string;
  name: string;
  since: string;
  until: string;
};

export type ProSubsidy = {
  id: string;
  call: string;
  window: string;
  requestedCents: number;
  status: "preparing" | "submitted" | "granted" | "justified";
  checklist: { label: string; done: boolean }[];
};

/* ---------- Universidad ---------- */

export type ProUniMetric = {
  key: string;
  label: string;
  value: number;
  unit?: string;
  delta?: number;
  hint?: string;
};

export type ProUniPublication = {
  id: string;
  title: string;
  channel: "fomo" | "aviso" | "evento";
  at: string;
  reach: number;
  reactions: number;
  status: "published" | "scheduled" | "draft";
  audience: string;
};

export type ProUniWelcomeStop = {
  id: string;
  title: string;
  date: string;
  place: string;
  checkins: number;
  capacity: number;
};

export type ProUniHousing = {
  id: string;
  title: string;
  owner: string;
  zone: string;
  priceCents: number;
  verified: boolean;
  complaints: number;
  status: "pending" | "verified" | "rejected";
};

export type ProUniAssociation = {
  id: string;
  name: string;
  members: number;
  activities: number;
  registered: boolean;
  subsidyStatus: "none" | "submitted" | "granted";
  ectsRequests: number;
};

export type ProUniModeration = {
  id: string;
  content: string;
  reason: string;
  reports: number;
  at: string;
  status: "pending" | "hidden" | "kept";
};

export type ProCampaign = {
  id: string;
  moment: string;
  title: string;
  when: string;
  status: "suggested" | "scheduled" | "live" | "done";
  audience: string;
  idea: string;
};

/** Una semana de actividad: sirve para las tendencias de Hoy y Resultados. */
export type ProWeekStat = {
  /** Lunes de esa semana (YYYY-MM-DD). */
  week: string;
  /** Clientes, reservas o asistentes que llegaron por Franky. */
  franky: number;
  /** Total de clientes, reservas o asistentes de la semana. */
  total: number;
  /** Ingresos de la semana en céntimos (lo que corresponda al sector). */
  revenueCents: number;
};

/** Todo lo que una pantalla puede leer de un espacio. Cada motor rellena lo suyo. */
export type ProData = {
  /** Caja, archivo, asambleas y calendario del motor de comunidades (community-types.ts). */
  communityOps?: import("./community-types").ProCommunityOps;
  /** Proveedores, gastos, suministros, llaves y propietarios del motor de vivienda (housing-types.ts). */
  housingOps?: import("./housing-types").ProHousingOps;
  /** Recordatorios, lista de espera, bonos, productos y reglas del motor de agenda (agenda-types.ts). */
  agendaOps?: import("./agenda-types").ProAgendaOps;
  /** Turnos fijos, pagos por jugador, torneos y puestos del motor de pistas (courts-types.ts). */
  courts?: import("./courts-types").ProCourtsData;
  /** Caja, barra, turnos e incidencias del motor de noche (night-types.ts). */
  nightOps?: import("./night-types").ProNightOps;
  /** Cuidado de socios, cobros y operación del motor de clases (classes-types.ts). */
  classExtras?: import("./classes-types").ProClassesExtras;
  classOperations?: {
    bundles: ProServiceBundle[];
    rosterVisible: boolean;
    resources: import("../professional-services").ProfessionalResource[];
  };
  /** Operación diaria de hostelería (APPCC, compras, cierre...). Solo si existe. */
  tablesOps?: import("./tables-types").ProTablesOps;
  tableOperations?: {
    unmappedResourceIds: string[];
    unmappedResources?: import("../professional-services").ProfessionalResource[];
    canManage: boolean;
    canOperate: boolean;
    waitlist: ProTableWaitlistEntry[];
  };
  calendar?: {
    range: { from: string; until: string };
    availability: import("../professional-services").ProfessionalAvailability[];
    exceptions: import("../professional-services").ProfessionalException[];
    services: import("../professional-services").ProfessionalService[];
    bookings: import("../professional-services").ProfessionalBooking[];
    sessions: import("../professional-services").ProfessionalSession[];
  };
  space: ProSpace;
  history: ProWeekStat[];
  staff: ProStaff[];
  clients: ProClient[];
  offers: ProOffer[];
  reviews: ProReview[];
  shifts: ProShift[];
  groupRequests: ProGroupRequest[];
  inbox: ProInboxItem[];
  campaigns: ProCampaign[];
  services: ProService[];
  bookings: ProBooking[];
  payments: ProPayment[];
  tables: ProTable[];
  menu: ProMenuItem[];
  dailyMenu: ProDailyMenu | null;
  loyalty: ProLoyalty | null;
  validations: ProValidation[];
  events: ProEvent[];
  promoters: ProPromoter[];
  guests: ProGuest[];
  zones: ProZone[];
  classTypes: ProClassType[];
  sessions: ProClassSession[];
  plans: ProMembershipPlan[];
  members: ProMember[];
  resources: ProResource[];
  openMatches: ProOpenMatch[];
  properties: ProProperty[];
  leads: ProLead[];
  visits: ProVisit[];
  tenants: ProTenant[];
  incidents: ProIncident[];
  communityMembers: ProCommunityMember[];
  activities: ProActivity[];
  announcements: ProAnnouncement[];
  sponsors: ProSponsor[];
  board: ProBoardSeat[];
  subsidies: ProSubsidy[];
  uniMetrics: ProUniMetric[];
  uniPublications: ProUniPublication[];
  uniWelcome: ProUniWelcomeStop[];
  uniHousing: ProUniHousing[];
  uniAssociations: ProUniAssociation[];
  uniModeration: ProUniModeration[];
  /** Públicos, créditos, calendario y embudo del motor de universidad (university-types.ts). */
  uniExtras?: import("./university-types").ProUniExtras;
};
