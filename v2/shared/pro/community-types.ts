import type {
  ProActivity,
  ProBoardSeat,
  ProCommunityMember,
  ProSponsor,
} from "./types";

/**
 * Asociaciones, clubes y delegaciones (motor "community").
 *
 * Lo que una junta de estudiantes lleva hoy entre Forms, Excel, WhatsApp,
 * Eventbrite y un Drive heredado: libro de socios, caja con tickets, lista de
 * espera, turnos de voluntarios, asambleas con quórum y actas, y el archivo
 * que sobrevive al cambio de junta.
 *
 * Importes en céntimos, fechas ISO y días como YYYY-MM-DD en hora de Madrid,
 * igual que el resto de Franky Pro. La operación vive en
 * `ProData.communityOps`: si no existe (espacio real todavía sin estas
 * tablas), las pantallas enseñan un estado vacío en lugar de romperse.
 */

/* ---------- Socios ---------- */

export type CommunityFeeStatus = ProCommunityMember["fee"];

export type CommunityPayMethod =
  | "efectivo"
  | "bizum"
  | "transferencia"
  | "tarjeta"
  | "franky";

/** Cuota de un curso ya cerrado, para la ficha del socio. */
export type CommunityFeeRecord = {
  /** "25/26". */
  course: string;
  status: CommunityFeeStatus;
  cents: number;
};

/** Cómo llegó el socio al libro. */
export type CommunityJoinChannel = "qr" | "stand" | "import" | "manual";

export type CommunityMember = ProCommunityMember & {
  /** Cuenta universitaria verificada. */
  verified?: boolean;
  /** Llegó a través de Franky (vio una actividad o la ficha). */
  viaFranky?: boolean;
  /** Curso de sus estudios (1 a 6). */
  course?: number;
  phone?: string;
  /** Fecha de baja. El socio sigue en el libro, pero ya no cuenta como activo. */
  leftAt?: string;
  /** Acepta salir en fotos. undefined: todavía no lo ha dicho. */
  imageConsent?: boolean;
  /** Último check-in en una actividad. */
  lastSeenAt?: string;
  /** Último recordatorio de cuota enviado. */
  feeRemindedAt?: string;
  feePaidAt?: string;
  feePaidVia?: CommunityPayMethod;
  /** Cuotas de cursos anteriores. */
  feeHistory?: CommunityFeeRecord[];
  joinChannel?: CommunityJoinChannel;
  /** Registro de voluntariado (Ley 45/2015): alta, acuerdo firmado y baja. */
  volunteer?: CommunityVolunteer;
};

export type CommunityVolunteer = {
  /** YYYY-MM-DD del alta como voluntario. */
  since: string;
  /** YYYY-MM-DD en que firmó el acuerdo de incorporación. */
  agreementAt?: string;
  /** YYYY-MM-DD de la baja. Sigue en el registro con su fecha. */
  leftAt?: string;
};

/** Persona inscrita en una actividad: socio o estudiante que llegó por Franky. */
export type Attendee = {
  id: string;
  name: string;
  studies: string;
  university: string;
  member: boolean;
  viaFranky: boolean;
  verified: boolean;
};

/* ---------- Actividades ---------- */

export type CommunityActivityKind =
  | "proyeccion"
  | "taller"
  | "viaje"
  | "fiesta"
  | "charla"
  | "deporte"
  | "solidaria"
  | "otra";

export type CommunityWaitEntry = Attendee & {
  joinedAt: string;
};

/** Hueco de voluntariado dentro de una actividad (puerta, montaje, redes...). */
export type CommunityShift = {
  id: string;
  role: string;
  /** Minutos desde medianoche del día de la actividad, hora de Madrid. */
  from: number;
  to: number;
  slots: number;
  /** Ids de socio apuntados. */
  people: string[];
};

export type CommunityBudgetLine = {
  id: string;
  concept: string;
  cents: number;
};

/** Tarea de preparación que vence unos días antes de la actividad. */
export type CommunityPrepItem = {
  id: string;
  label: string;
  /** Días antes de la actividad en los que debería estar hecho. */
  daysBefore: number;
  done: boolean;
};

export type CommunityActivity = ProActivity & {
  description?: string;
  kind?: CommunityActivityKind;
  /** Duración en minutos, para el calendario y el archivo .ics. */
  durationMinutes?: number;
  /** Ids de asistentes con check-in (socios `m…` o externos `x…`). */
  checkedInIds?: string[];
  /** Fotos subidas para la memoria de la subvención. */
  photos?: number;
  /** La publicidad llevó el logo del Consejo de Estudiantes. */
  councilLogo?: boolean;
  /** Personas que no te seguían y la vieron en Franky. */
  reachOutside?: number;
  /** Certificados de asistencia ya generados. */
  certificates?: boolean;
  certificatesAt?: string;
  /** Lista de espera por orden de llegada. */
  waitlist?: CommunityWaitEntry[];
  /** Inscritos que entraron desde la lista de espera o a mano. */
  joined?: Attendee[];
  /** Inscritos que se borraron (su plaza pasó a otra persona). */
  cancelledIds?: string[];
  shifts?: CommunityShift[];
  /** Costes previstos de la actividad. */
  budget?: CommunityBudgetLine[];
  /** Lo que pone el patrocinador para esta actividad. */
  budgetSponsorCents?: number;
  prep?: CommunityPrepItem[];
  /** Notas de quienes vinieron. Franky las pide 24 horas después de acabar. */
  ratings?: CommunityRating[];
  /** La junta pidió la valoración antes de las 24 horas. */
  ratingAskedAt?: string;
  /** Viaje pagado a plazos: señal y resto con fecha, y quién ha pagado cada uno. */
  trip?: CommunityTrip;
};

/* ---------- Viajes con pagos a plazos ---------- */

/** Un plazo del viaje ("Señal", "Resto"). La suma de plazos es el precio del viaje. */
export type CommunityInstallment = {
  id: string;
  label: string;
  cents: number;
  /** YYYY-MM-DD en que vence. */
  due: string;
};

/** Pago de un plazo por un viajero. */
export type CommunityTripPayment = {
  attendeeId: string;
  installmentId: string;
  /** ISO del cobro. */
  at: string;
  via: CommunityPayMethod;
};

/** Lo que piden el autobús y el seguro de cada viajero. */
export type CommunityTraveller = {
  /** DNI, NIE o pasaporte. */
  idDoc?: string;
  phone?: string;
  /** Persona a la que llamar si pasa algo ("Madre, 600 000 000"). */
  emergency?: string;
};

export type CommunityTrip = {
  installments: CommunityInstallment[];
  payments: CommunityTripPayment[];
  /** Datos de viaje por id de asistente. */
  travellers?: Record<string, CommunityTraveller>;
  /** Último recordatorio de pago enviado, por id de asistente. */
  remindedAt?: Record<string, string>;
};

/** Nota de un asistente con check-in, de 1 a 5, con comentario opcional. */
export type CommunityRating = {
  id: string;
  stars: number;
  comment?: string;
  at: string;
  /** Nombre de pila de quien valora; las notas sin comentario pueden ir sin nombre. */
  name?: string;
};

export type CommunitySponsor = ProSponsor & {
  /** Ventaja que ven los socios en su carné ("Caña y tapa por 2,50 €"). */
  perk?: string;
};

/* ---------- Caja ---------- */

export type CommunityIncomeCategory =
  | "venta"
  | "subvencion"
  | "donacion"
  | "patrocinio"
  | "otros_ingresos";

export type CommunityExpenseCategory =
  | "transporte"
  | "entradas"
  | "comida"
  | "material"
  | "imprenta"
  | "derechos"
  | "premios"
  | "local"
  | "seguros"
  | "banco"
  | "otros_gastos";

export type CommunityMovement = {
  id: string;
  kind: "income" | "expense";
  /** ISO del día del gasto o ingreso. */
  date: string;
  concept: string;
  amountCents: number;
  category: CommunityIncomeCategory | CommunityExpenseCategory;
  activityId?: string;
  method?: CommunityPayMethod;
  /** Foto del ticket (miniatura en data URL) o solo el nombre del archivo. */
  receipt?: { name: string; dataUrl?: string };
  /** Quién lo adelantó de su bolsillo. Vacío: salió de la cuenta. */
  paidBy?: string;
  reimbursed?: boolean;
  createdBy?: string;
};

/* ---------- Archivo ---------- */

export type CommunityArchiveKind =
  | "estatutos"
  | "acta"
  | "cuentas"
  | "registro"
  | "certificado"
  | "memoria"
  | "otro";

/** Documento que se puede volver a generar con los datos del momento. */
export type CommunityArchiveSource =
  | { type: "certificates"; activityId: string }
  | { type: "memory"; subsidyId: string };

export type CommunityArchiveDoc = {
  id: string;
  title: string;
  kind: CommunityArchiveKind;
  at: string;
  by: string;
  /** Texto del documento (párrafos separados por línea en blanco). */
  body?: string;
  /** Documento generado por Franky guardado tal cual (cuentas aprobadas). */
  html?: string;
  /** Archivo subido por la junta. */
  file?: { name: string; mime: string; size: number; dataUrl?: string };
  source?: CommunityArchiveSource;
  /** Marca para encontrarlo luego ("registro:26/27" son los papeles de ese curso). */
  tag?: string;
};

/* ---------- Calendario del curso ---------- */

export type CommunityPeriodKind =
  | "examenes"
  | "acogida"
  | "festivo"
  | "erasmus"
  | "otro";

export type CommunityPeriod = {
  id: string;
  title: string;
  /** YYYY-MM-DD, ambos incluidos. */
  from: string;
  to: string;
  kind: CommunityPeriodKind;
};

/* ---------- Asambleas y tareas ---------- */

export type CommunityAssemblyKind = "ordinaria" | "extraordinaria" | "junta";

export type CommunityAgendaItem = {
  id: string;
  title: string;
  /** Se vota este punto. */
  vote: boolean;
  yes?: number;
  no?: number;
  abstain?: number;
  /** Resultado al cerrar la votación. */
  result?: "approved" | "rejected";
  /** Acuerdo tal y como quedará en el acta. */
  agreement?: string;
};

export type CommunityAssembly = {
  id: string;
  kind: CommunityAssemblyKind;
  title: string;
  date: string;
  place: string;
  status: "convocada" | "en_curso" | "cerrada";
  agenda: CommunityAgendaItem[];
  /** Ids de socio con check-in en la sala. */
  presentIds: string[];
  /** Quórum de la primera convocatoria según los estatutos (% de socios con voto). */
  quorumPct: number;
  /** Minutos hasta la segunda convocatoria, que vale con los presentes. */
  secondCallMinutes: number;
  convokedAt?: string;
  startedAt?: string;
  closedAt?: string;
  /** Texto del acta, editable por la secretaría. */
  minutes?: string;
  archivedDocId?: string;
};

export type CommunityTask = {
  id: string;
  title: string;
  owner: string;
  /** YYYY-MM-DD. */
  due: string;
  done: boolean;
  assemblyId?: string;
  createdAt: string;
};

/* ---------- Guía del relevo ---------- */

/** Paso del cambio de junta que no se hace dentro de Franky (banco, registro, redes...). */
export type CommunityHandoverItem = {
  id: string;
  label: string;
  detail: string;
  /** Quién se encarga. */
  owner?: string;
  doneAt?: string;
  /** Quién lo marcó como hecho. */
  doneBy?: string;
};

export type CommunityHandover = {
  /** Cuándo se empezó el relevo (YYYY-MM-DD). */
  startedAt: string;
  items: CommunityHandoverItem[];
};

/* ---------- Material de la asociación ---------- */

export type CommunityItemCategory =
  | "sonido"
  | "imagen"
  | "informatica"
  | "mobiliario"
  | "merchandising"
  | "deporte"
  | "otro";

/** Préstamo de una pieza del material. Sin `returnedAt`, la tiene esa persona. */
export type CommunityLoan = {
  id: string;
  holder: string;
  /** Socio que se lo lleva, si está en el libro (para el teléfono). */
  memberId?: string;
  /** ISO de cuando se lo llevó. */
  from: string;
  /** YYYY-MM-DD en que debería devolverlo. */
  due?: string;
  returnedAt?: string;
  /** Para qué se lo llevó ("Cinefórum del martes"). */
  note?: string;
};

/** Pieza del inventario (LO 1/2002, art. 14): qué hay, cuánto vale y dónde está. */
export type CommunityItem = {
  id: string;
  name: string;
  category: CommunityItemCategory;
  units: number;
  /** Valor de compra en céntimos, para el inventario de la asamblea. */
  valueCents?: number;
  /** YYYY-MM-DD de la compra o donación. */
  acquiredAt?: string;
  /** Dónde se guarda cuando no está prestado ("Local 3, armario gris"). */
  location: string;
  note?: string;
  /** Préstamos, del más reciente al más antiguo. */
  loans: CommunityLoan[];
  /** Baja del inventario (roto, perdido, regalado). Sigue en la lista con su fecha. */
  retiredAt?: string;
  retiredReason?: string;
};

/* ---------- Pedidos de sudaderas y merchandising ---------- */

export type CommunityMerchLine = {
  id: string;
  name: string;
  memberId?: string;
  phone?: string;
  size: string;
  qty: number;
  paidAt?: string;
  paidVia?: CommunityPayMethod;
  deliveredAt?: string;
};

export type CommunityMerchStatus = "abierto" | "encargado" | "entregado";

export type CommunityMerchOrder = {
  id: string;
  /** "Sudadera Hilo Rojo 26/27". */
  title: string;
  /** Prenda y acabado, tal y como se pide al proveedor. */
  garment: string;
  /** Lo que paga cada socio por unidad, en céntimos. */
  priceCents: number;
  /** Lo que cobra el proveedor por unidad, en céntimos. */
  unitCostCents?: number;
  sizes: string[];
  supplier?: string;
  /** YYYY-MM-DD: último día para elegir talla. */
  closesOn: string;
  status: CommunityMerchStatus;
  orderedAt?: string;
  lines: CommunityMerchLine[];
  /** Apunte de caja del pago al proveedor, creado al encargar. */
  supplierMovementId?: string;
};

/* ---------- Todo junto ---------- */

export type CommunitySettings = {
  /** Cuota del curso en céntimos. */
  feeCents: number;
  /** Cómo se paga la cuota, tal y como sale en el recordatorio. */
  howToPay: string;
  /** Semanas sin venir para considerar a un socio dormido. */
  dormantWeeks: number;
};

export type ProCommunityOps = {
  settings: CommunitySettings;
  /** Saldo con el que empezó el curso (lo que dejó la junta anterior). */
  openingBalanceCents: number;
  movements: CommunityMovement[];
  documents: CommunityArchiveDoc[];
  periods: CommunityPeriod[];
  assemblies: CommunityAssembly[];
  tasks: CommunityTask[];
  /** Relevo programado para el final del mandato. */
  scheduledBoard?: ProBoardSeat[];
  /** Guía del último relevo: lo que hay que cambiar fuera de Franky. */
  handover?: CommunityHandover;
  /** Material de la asociación y sus préstamos. */
  inventory?: CommunityItem[];
  /** Pedidos de sudaderas, camisetas y demás. */
  merch?: CommunityMerchOrder[];
};
