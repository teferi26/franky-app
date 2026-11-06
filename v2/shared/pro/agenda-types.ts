/**
 * Datos propios del motor de agenda (peluquerías, barberías y estética) que
 * van más allá de la cita básica: recordatorios, señales, lista de espera,
 * fichas técnicas, bonos, productos y reglas del negocio.
 *
 * Todo es opcional. Los campos por entidad cuelgan de `agenda` en el servicio,
 * la cita, la ficha, la persona del equipo y el cobro; lo que es del negocio
 * cuelga de `ProData.agendaOps`. Un espacio real que todavía no guarda estos
 * datos en el servidor no los trae, y las pantallas lo tratan como "no hay
 * nada" en vez de romperse. Fechas locales en YYYY-MM-DD, instantes en ISO,
 * minutos desde medianoche e importes en céntimos, como el resto de Pro.
 */

/* ---------- Por servicio ---------- */

/** Tres tramos de un servicio de color: durante la pose el profesional queda libre. */
export type ProServicePhases = {
  applyMin: number;
  processMin: number;
  finishMin: number;
};

/** Días y horas en los que se aplica el precio estudiante (horas valle). */
export type ProValleyWindow = {
  /** 0 = lunes ... 6 = domingo. */
  days: number[];
  from: number;
  to: number;
};

/** Material técnico que gasta una sesión: `qty` en unidades del producto (0,25 = un cuarto de tubo). */
export type ProServiceMaterial = {
  productId: string;
  qty: number;
};

export type ProServiceAgenda = {
  /** Cada cuántas semanas suele volver quien se hace este servicio. */
  returnWeeks?: number;
  phases?: ProServicePhases;
  /** Necesita prueba de sensibilidad (tintes con PPD, lifting, tinte de cejas). */
  patchTest?: boolean;
  /** Minutos de preparación de cabina después de la cita. */
  bufferMin?: number;
  /** Cabina o máquina que ocupa (id de ProCabin). */
  cabinId?: string;
  /** Señal que se pide al reservar este servicio. */
  depositCents?: number;
  /** Cuidados posteriores que se mandan al terminar. */
  aftercare?: string;
  /** Comisión propia del servicio; si no hay, la de la persona. */
  commissionPct?: number;
  /** Plantilla de consentimiento que hay que firmar antes. */
  consentId?: string;
  valley?: ProValleyWindow;
  /** Lo que gasta cada sesión; se descuenta del stock al cobrar la cita. */
  materials?: ProServiceMaterial[];
  /**
   * Duración propia de algunas personas del equipo (id de ProStaff a
   * minutos). Quien no aparece usa la duración general del servicio.
   */
  staffMin?: Record<string, number>;
};

/* ---------- Por cita ---------- */

export type ProDepositStatus = "pending" | "paid" | "kept" | "returned";

export type ProBookingDeposit = {
  cents: number;
  status: ProDepositStatus;
  method?: "card" | "cash" | "bizum";
  at?: string;
};

export type ProBookingAgenda = {
  /** Cuándo se le mandó el recordatorio. */
  remindedAt?: string;
  /** Cuándo confirmó el cliente que viene. */
  confirmedAt?: string;
  deposit?: ProBookingDeposit;
  /** Citas periódicas: todas las de la serie comparten id. */
  seriesId?: string;
  cabinId?: string;
  reviewAskedAt?: string;
  aftercareSentAt?: string;
  /** La cita la cubrió una sesión de este bono. */
  bundleId?: string;
  /** Es la prueba de sensibilidad previa a un color. */
  patchTest?: boolean;
  /** Entró desde la cola de sin cita o desde la lista de espera. */
  recoveredFrom?: "waitlist" | "walkin";
  /** Cita de un grupo (graduación, club): id de la petición. */
  groupId?: string;
};

/* ---------- Por ficha ---------- */

/** Una fórmula de color con fecha: deja de irse con el profesional. */
export type ProColorFormula = {
  id: string;
  at: string;
  staffId?: string;
  brand: string;
  /** Tonos y proporción, como se escriben en el salón: "7.1 + 8.1 (1:1)". */
  mix: string;
  oxidant: string;
  processMin: number;
  zone: string;
  result?: string;
};

export type ProAllergy = "ppd" | "latex" | "cyanoacrylate" | "wax" | "nickel";

export type ProClientHealth = {
  allergies: ProAllergy[];
  sensitiveSkin?: boolean;
  pregnancy?: boolean;
  medication?: string;
  notes?: string;
  updatedAt: string;
  updatedBy?: string;
};

export type ProConsentKind = "marketing" | "photos" | "health";

/** Permiso con fecha y quién lo apuntó. */
export type ProConsentRecord = {
  granted: boolean;
  at: string;
  by?: string;
};

/** Consentimiento de un tratamiento firmado con el dedo en pantalla. */
export type ProSignedConsent = {
  id: string;
  consentId: string;
  at: string;
  /** Firma como imagen PNG en data URL. */
  signature: string;
  by?: string;
};

/** Visita pasada resumida para calcular el ritmo de vuelta. */
export type ProPastVisit = {
  at: string;
  serviceId: string;
  staffId?: string;
};

/** Foto de antes o de después de un servicio. Solo con permiso de fotos. */
export type ProClientPhoto = {
  id: string;
  at: string;
  kind: "before" | "after";
  /** Imagen reducida (JPEG en data URL) para no cargar la ficha. */
  src: string;
  serviceId?: string;
  /** Puede salir en el escaparate del negocio. */
  showcase?: boolean;
};

export type ProClientAgenda = {
  formulas?: ProColorFormula[];
  photos?: ProClientPhoto[];
  patchTestAt?: string;
  health?: ProClientHealth;
  consents?: Partial<Record<ProConsentKind, ProConsentRecord>>;
  signed?: ProSignedConsent[];
  /** Visitas anteriores a las que se cargan en la agenda. */
  visits?: ProPastVisit[];
  /** Último aviso de "te toca volver" o de cumpleaños. */
  comebackSentAt?: string;
  birthdaySentAt?: string;
};

/* ---------- Por persona del equipo ---------- */

export type ProStaffAgenda = {
  /** Comisión sobre producto vendido. */
  productCommissionPct?: number;
  /** Alquiler de sillón o cabina: cuota fija al mes y sin comisión. */
  chairRentCents?: number;
};

/* ---------- Por cobro ---------- */

export type ProPaymentLine = {
  kind: "service" | "product" | "bundle" | "gift";
  refId?: string;
  name: string;
  qty: number;
  /** Importe total de la línea ya multiplicado por la cantidad. */
  cents: number;
};

export type ProPaymentAgenda = {
  lines: ProPaymentLine[];
  /** Descuento aplicado sobre servicios y productos. */
  discountCents: number;
  discountLabel?: string;
  /** Señal cobrada antes y descontada ahora. */
  depositAppliedCents: number;
  giftCardCents: number;
  bundleId?: string;
  /** Pago mixto: cuánto con cada método. Si no hay, todo con `method`. */
  split?: { method: "card" | "cash" | "bizum"; cents: number }[];
  /** Cobro de una señal, de un bono o de una tarjeta regalo. */
  kind?: "deposit" | "bundle" | "gift" | "sale";
};

/* ---------- Del negocio ---------- */

export type ProTemplateKind =
  | "reminder"
  | "change"
  | "thanks"
  | "comeback"
  | "birthday"
  | "waitlist"
  | "deposit"
  | "aftercare";

export type ProAgendaSettings = {
  /** Pide señal a partir de este número de faltas. 0 = nunca. */
  depositAfterNoShows: number;
  depositCents: number;
  /** Días que vale una prueba de sensibilidad. */
  patchTestValidDays: number;
  /** Política de cancelación que ve el cliente al reservar. */
  cancellationPolicy: string;
  /** Enlace para dejar reseña (Google o la ficha de Franky). */
  reviewUrl: string;
};

/** Hueco que alguien quiere si se libera. */
export type ProWaitlistEntry = {
  id: string;
  clientId?: string;
  name: string;
  phone?: string;
  serviceId: string;
  staffId?: string;
  /** Día concreto; sin día, cualquiera de los próximos. */
  date?: string;
  from: number;
  to: number;
  createdAt: string;
  status: "waiting" | "offered" | "booked" | "removed";
  offeredAt?: string;
  bookingId?: string;
};

/** Bloqueo de un tramo en la columna de alguien. */
export type ProAgendaBlock = {
  id: string;
  staffId: string;
  date: string;
  from: number;
  to: number;
  reason: string;
  /** Se repite el mismo día de cada semana desde `date`. */
  weekly?: boolean;
};

/** Vacaciones o baja: la columna queda cerrada esos días. */
export type ProAgendaAbsence = {
  id: string;
  staffId: string;
  from: string;
  to: string;
  reason: string;
};

export type ProProduct = {
  id: string;
  name: string;
  brand?: string;
  /** Reventa al cliente o material técnico del salón. */
  kind: "retail" | "tech";
  priceCents: number;
  costCents: number;
  stock: number;
  min: number;
  supplier?: { name: string; phone?: string };
};

export type ProBundleMove = {
  at: string;
  delta: number;
  bookingId?: string;
  reason?: string;
};

/** Bono de N sesiones de un servicio. */
export type ProAgendaBundle = {
  id: string;
  clientId: string;
  clientName: string;
  serviceId: string;
  label: string;
  sessions: number;
  used: number;
  priceCents: number;
  soldAt: string;
  expiresAt?: string;
  moves: ProBundleMove[];
};

export type ProGiftCard = {
  id: string;
  code: string;
  amountCents: number;
  balanceCents: number;
  buyer: string;
  recipient?: string;
  soldAt: string;
  expiresAt: string;
};

/** Cliente que ha llegado sin cita y espera turno. */
export type ProWalkin = {
  id: string;
  name: string;
  serviceId: string;
  staffId?: string;
  arrivedAt: string;
  status: "waiting" | "served" | "left";
  bookingId?: string;
};

/** Cabina o máquina que no puede estar en dos citas a la vez. */
export type ProCabin = {
  id: string;
  name: string;
  kind: "room" | "machine";
};

export type ProConsentTemplate = {
  id: string;
  title: string;
  body: string;
};

/* ---------- Apertura y cierre ---------- */

export type ProChecklistMoment = "open" | "close";

/** Tarea del día que alguien del equipo marca al abrir o al cerrar. */
export type ProChecklistItem = {
  id: string;
  label: string;
  moment: ProChecklistMoment;
};

/** Quién hizo una tarea y cuándo. */
export type ProChecklistMark = {
  itemId: string;
  date: string;
  at: string;
  staffId?: string;
};

export type ProAgendaOps = {
  settings: ProAgendaSettings;
  /**
   * Tareas de apertura y cierre. Opcionales: una visita guardada antes de
   * que existieran usa la lista por defecto del sector.
   */
  checklist?: ProChecklistItem[];
  checklistLog?: ProChecklistMark[];
  templates: Record<ProTemplateKind, string>;
  waitlist: ProWaitlistEntry[];
  blocks: ProAgendaBlock[];
  absences: ProAgendaAbsence[];
  products: ProProduct[];
  bundles: ProAgendaBundle[];
  giftCards: ProGiftCard[];
  walkins: ProWalkin[];
  cabins: ProCabin[];
  consentTemplates: ProConsentTemplate[];
};
