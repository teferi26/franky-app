/**
 * Datos del motor de universidad (servicios de estudiantes) que no caben en
 * los tipos base de `types.ts`: públicos de las publicaciones, confirmaciones
 * de lectura, avisos urgentes, casos de quejas de alojamiento, sello con
 * caducidad, documentación y renovación de asociaciones, créditos con
 * asistencia, calendario del curso, comercios del pasaporte, cita previa,
 * "Pedir ayuda" y mentores de primero.
 *
 * Las ampliaciones de cada lista (publicaciones, paradas, pisos...) son campos
 * opcionales: un espacio real que todavía no los tenga se sigue pintando.
 * Lo que no pertenece a ninguna lista vive en `ProData.uniExtras`, también
 * opcional; se lee siempre con `uniExtrasOf()` de `university.ts`.
 *
 * Privacidad: todo lo que se enseña de estudiantes es agregado. Las únicas
 * listas nominales son las de créditos, que existen para que secretaría pueda
 * reconocerlos.
 */

import type {
  ProUniAssociation,
  ProUniHousing,
  ProUniModeration,
  ProUniPublication,
  ProUniWelcomeStop,
} from "./types";

/* ------------------------------------------------------------------ */
/* Públicos                                                            */
/* ------------------------------------------------------------------ */

/** A quién va una publicación. */
export type ProUniAudience =
  | "campus"
  | "first_year"
  | "faculties"
  | "erasmus"
  | "master"
  | "residences"
  | "welcome_absent";

/**
 * Tamaño de cada público: estudiantes activos en Franky que lo forman. Sirve
 * para estimar el alcance antes de publicar. Viene agregado del servidor.
 */
export type ProUniAudienceSizes = {
  campus: number;
  first_year: number;
  erasmus: number;
  master: number;
  residences: number;
  /** Primero que no ha ido a ninguna parada de la bienvenida. */
  welcome_absent: number;
  /** Activos por facultad. */
  faculties: Record<string, number>;
};

/* ------------------------------------------------------------------ */
/* Publicaciones                                                       */
/* ------------------------------------------------------------------ */

/** Lectura confirmada con "Lo he leído", agregada por facultad. */
export type ProUniReadStat = {
  faculty: string;
  /** Estudiantes de esa facultad a los que les llegó. */
  audience: number;
  /** Los que han pulsado "Lo he leído". */
  read: number;
};

export type ProUniReminder = {
  at: string;
  /** A cuántos se les recordó (solo a quien no lo había leído). */
  sentTo: number;
};

export type ProUniUrgentKind = "closure" | "suspension" | "weather" | "other";

/** Aviso urgente: se fija arriba del campus hasta `until` o hasta "Ya no aplica". */
export type ProUniUrgent = {
  kind: ProUniUrgentKind;
  until: string;
  endedAt?: string;
};

export type UniPublication = ProUniPublication & {
  body?: string;
  official?: boolean;
  audienceKey?: ProUniAudience;
  faculties?: string[];
  /** Pide al estudiante que confirme con "Lo he leído". */
  readReceipt?: boolean;
  reads?: ProUniReadStat[];
  reminders?: ProUniReminder[];
  urgent?: ProUniUrgent;
  /** Versión en inglés para Erasmus e internacionales. */
  titleEn?: string;
  bodyEn?: string;
  /** Botón fijo "Pedir ayuda" (semana de bienestar). */
  help?: boolean;
  /** Plazo del calendario del curso del que sale. */
  deadlineId?: string;
};

/* ------------------------------------------------------------------ */
/* Bienvenida                                                          */
/* ------------------------------------------------------------------ */

/** Encuesta de una pregunta que se abre al hacer check-in en la parada. */
export type ProUniSurvey = {
  question: string;
  /** Siempre tres respuestas. */
  options: [string, string, string];
  answers: [number, number, number];
};

export type UniWelcomeStop = ProUniWelcomeStop & {
  kind?: "bienvenida" | "erasmus";
  code?: string;
  titleEn?: string;
  survey?: ProUniSurvey;
};

/** Negocio de Franky cerca del campus que premia a quien completa el pasaporte. */
export type ProUniPerk = {
  id: string;
  business: string;
  sector: string;
  perk: string;
  walkMinutes: number;
  /** El servicio elige qué comercios aparecen en el pasaporte. */
  enabled: boolean;
  /** Ficha pública en franky.es/n/<slug>. */
  slug?: string;
  /** Ventajas canjeadas por estudiantes con el pasaporte completo. */
  redeemed: number;
};

export type ProUniPassport = {
  /** Paradas que hay que completar para conseguir las ventajas. */
  goal: number;
  /** Estudiantes que ya han completado el pasaporte. */
  completed: number;
};

/* ------------------------------------------------------------------ */
/* Alojamiento                                                         */
/* ------------------------------------------------------------------ */

/**
 * Caso abierto por quejas de inquilinos en un piso verificado. El propietario
 * tiene hasta `dueAt` para responder; si no, se sugiere retirar el sello.
 */
export type ProUniHousingCase = {
  id: string;
  openedAt: string;
  dueAt: string;
  message: string;
  status: "open" | "answered" | "resolved";
  reply?: string;
  repliedAt?: string;
  closedAt?: string;
};

export type UniHousing = ProUniHousing & {
  /** Texto del anuncio tal y como lo escribió el propietario. */
  description?: string;
  rooms?: number;
  minutesToCampus?: number;
  submittedAt?: string;
  checks?: { label: string; ok: boolean }[];
  reason?: string;
  complaintNote?: string;
  /** Cuándo se concedió el sello y hasta cuándo vale (se renueva cada verano). */
  verifiedAt?: string;
  verifiedUntil?: string;
  renewalRequestedAt?: string;
  case?: ProUniHousingCase;
};

/**
 * Habitación o piso verificado, sin datos del propietario: la muestra con la
 * que se calcula el observatorio de precios y el mapa de distancia y precio.
 */
export type ProUniMarketRoom = {
  zone: string;
  priceCents: number;
  minutesToCampus: number;
  kind: "room" | "studio" | "flat";
};

/* ------------------------------------------------------------------ */
/* Asociaciones y créditos                                             */
/* ------------------------------------------------------------------ */

export type ProUniDocKey = "statutes" | "founding" | "board" | "members" | "plan";

export type ProUniDoc = { key: ProUniDocKey; ok: boolean };

export type UniAssociation = ProUniAssociation & {
  faculty?: string;
  ectsHours?: number;
  lastActivityAt?: string;
  subsidyCents?: number;
  pendingRegistration?: boolean;
  /** Documentación del registro: qué ha entregado y qué falta. */
  docs?: ProUniDoc[];
  docsRequestedAt?: string;
  /** Junta vigente. Solo cargos: la lista de socios la guarda la asociación. */
  board?: ProUniBoardMember[];
  /** Renovación anual del registro (cada septiembre). */
  renewal?: ProUniRenewal;
  /** Traspasos de junta anteriores, del más antiguo al más reciente. */
  handovers?: ProUniHandover[];
};

export type ProUniBoardRole = "presidencia" | "secretaria" | "tesoreria" | "vocal";

export type ProUniBoardMember = { role: ProUniBoardRole; name: string };

/**
 * Renovación del curso: la asociación confirma su junta y su número de socios.
 * `course` es el curso al que se refiere ("2026-27"); una renovación de un
 * curso anterior cuenta como pendiente.
 */
export type ProUniRenewal = {
  course: string;
  boardConfirmed: boolean;
  membersConfirmed: boolean;
  /** Cuándo se lo pidió el servicio por última vez. */
  requestedAt?: string;
  completedAt?: string;
};

/** Cambio de junta: la nueva hereda documentos, actividades y créditos. */
export type ProUniHandover = {
  at: string;
  course: string;
  /** Presidencia saliente y entrante. */
  from: string;
  to: string;
};

/**
 * Solicitud de reconocimiento de créditos de un estudiante por una actividad
 * de asociación. Las horas y la asistencia salen de los check-in.
 */
export type ProUniCreditRequest = {
  id: string;
  associationId: string;
  activity: string;
  student: string;
  email: string;
  faculty: string;
  /** Horas certificables de la actividad. */
  hours: number;
  /** Sesiones con check-in frente a las programadas. */
  attended: number;
  sessions: number;
  status: "pending" | "validated" | "revision";
  decidedAt?: string;
};

/** Actividad programada de una asociación (para detectar choques de espacio). */
export type ProUniAssocActivity = {
  id: string;
  associationId: string;
  title: string;
  start: string;
  end: string;
  place: string;
};

/* ------------------------------------------------------------------ */
/* Moderación                                                          */
/* ------------------------------------------------------------------ */

export type UniModeration = ProUniModeration & {
  where?: string;
  author?: string;
  /** Nota interna de la decisión (la ve el equipo y Franky si hay apelación). */
  note?: string;
  decidedAt?: string;
  decidedBy?: string;
};

/* ------------------------------------------------------------------ */
/* Calendario del curso y facultades                                   */
/* ------------------------------------------------------------------ */

export type ProUniDeadlineKind =
  | "becas"
  | "matricula"
  | "examenes"
  | "erasmus"
  | "elecciones"
  | "bienestar"
  | "otro";

/** Plazo clave del curso. Cada uno sugiere la publicación que le toca. */
export type ProUniDeadline = {
  id: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  kind: ProUniDeadlineKind;
  audience: ProUniAudience;
};

/** Embudo de integración de primero en una facultad. Siempre agregado. */
export type ProUniFacultyStat = {
  faculty: string;
  firstYear: number;
  /** Han ido a alguna parada de la bienvenida. */
  participated: number;
  /** Se han apuntado a alguna asociación. */
  joinedAssociation: number;
  /** Con actividad en Franky en los últimos 30 días. */
  active30: number;
};

/** Recurso de ayuda que aparece en el botón fijo "Pedir ayuda". */
export type ProUniHelpResource = {
  label: string;
  detail: string;
  /** tel:, https: o ruta interna. */
  href: string;
};

/* ------------------------------------------------------------------ */
/* Atención al estudiante: cita previa                                 */
/* ------------------------------------------------------------------ */

/** Mesa o servicio que atiende. */
export type ProUniDesk = "general" | "becas" | "alojamiento" | "internacional" | "matricula";

/**
 * Franja de atención que publica el servicio: se repite cada semana el mismo
 * día. El estudiante pide hueco desde Franky dentro de la franja.
 */
export type ProUniOfficeSlot = {
  id: string;
  /** 0 = lunes. */
  weekday: number;
  /** Minutos desde medianoche. */
  start: number;
  end: number;
  /** Duración de cada cita en minutos. */
  minutes: number;
  desk: ProUniDesk;
  /** Quién atiende. */
  staff: string;
  place: string;
  /** Se atiende por videollamada en vez de en persona. */
  online: boolean;
};

export type ProUniAppointmentStatus = "booked" | "done" | "no_show" | "cancelled";

/** Cita pedida por un estudiante (o apuntada en el mostrador por el equipo). */
export type ProUniAppointment = {
  id: string;
  slotId: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Minutos desde medianoche. */
  start: number;
  desk: ProUniDesk;
  student: string;
  faculty: string;
  /** Lo que el estudiante escribió al pedirla. */
  topic: string;
  status: ProUniAppointmentStatus;
  /** Desde Franky o apuntada por el equipo (teléfono, mostrador). */
  via: "franky" | "desk";
  createdAt: string;
  /** Pregunta frecuente que el equipo le envió porque ya respondía su duda. */
  faqId?: string;
  faqSentAt?: string;
  /**
   * Móvil para recordarle la cita por WhatsApp: el de su perfil de Franky o el
   * que dejó al llamar. Solo lo ve el equipo que atiende.
   */
  phone?: string;
  /** Cuándo se le recordó la cita por WhatsApp. */
  remindedAt?: string;
};

/* ------------------------------------------------------------------ */
/* Preguntas frecuentes del servicio                                   */
/* ------------------------------------------------------------------ */

/**
 * Pregunta frecuente que el estudiante busca en Franky antes de pedir cita.
 * Las cifras son agregadas: cuántas veces se abrió y cuántas personas dijeron
 * si les sirvió, nunca quién.
 */
export type ProUniFaq = {
  id: string;
  desk: ProUniDesk;
  question: string;
  answer: string;
  /** Versión en inglés para Erasmus e internacionales. */
  questionEn?: string;
  answerEn?: string;
  /** Palabras con las que la buscan aunque no salgan en el texto ("padrón", "NIE"). */
  keywords?: string[];
  /** Oculta: el equipo la está revisando y no aparece en Franky. */
  hidden?: boolean;
  /** Veces que se ha abierto en total y en los últimos 7 días. */
  opens: number;
  opensWeek: number;
  /** Respuestas a "¿Te ha servido?". */
  helpful: number;
  unhelpful: number;
  updatedAt: string;
};

/** Pulsaciones de "Pedir ayuda" de una semana. Solo el total, nunca quién. */
export type ProUniHelpWeek = {
  /** Lunes de la semana, YYYY-MM-DD. */
  week: string;
  presses: number;
};

/* ------------------------------------------------------------------ */
/* Mentores de primero                                                 */
/* ------------------------------------------------------------------ */

/** Estudiante de cursos superiores que acompaña a gente de primero. */
export type ProUniMentor = {
  id: string;
  name: string;
  faculty: string;
  /** Curso que estudia: 2, 3, 4 o 5 (máster). */
  year: number;
  /** Cuántas personas de primero puede acompañar a la vez. */
  capacity: number;
  active: boolean;
  since: string;
};

/**
 * Petición de mentor de alguien de primero. El servicio solo ve facultad y
 * fechas: la conversación es entre las dos personas, en el chat de Franky.
 */
export type ProUniMentorRequest = {
  id: string;
  faculty: string;
  at: string;
  /** Llega de fuera (Erasmus o internacional). */
  international?: boolean;
  status: "waiting" | "matched";
  mentorId?: string;
  matchedAt?: string;
  /** Ya se han escrito al menos una vez (sin ver qué). */
  talked?: boolean;
};

/* ------------------------------------------------------------------ */
/* Espacios para asociaciones                                          */
/* ------------------------------------------------------------------ */

/** Aula o sala que el servicio presta a las asociaciones. */
export type ProUniRoom = {
  id: string;
  /** "Aula 12": junto con el edificio forma el lugar de las actividades. */
  name: string;
  building: string;
  capacity: number;
  /** Minutos desde medianoche en los que se puede reservar. */
  open: number;
  close: number;
  /** Días que se presta (0 = lunes). */
  weekdays: number[];
  /** Proyector, piano, cocina...: lo que suele preguntar quien la pide. */
  features?: string[];
  active: boolean;
};

export type ProUniRoomBookingStatus = "requested" | "approved" | "rejected" | "cancelled";

/**
 * Petición de una asociación para usar una sala. Al aprobarla se crea la
 * actividad (`activityId`) y entra en el calendario y en los choques.
 */
export type ProUniRoomBooking = {
  id: string;
  roomId: string;
  associationId: string;
  title: string;
  start: string;
  end: string;
  /** Personas que esperan: se compara con el aforo de la sala. */
  attendees: number;
  status: ProUniRoomBookingStatus;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  /** Motivo del rechazo, que le llega a la asociación. */
  reason?: string;
  activityId?: string;
};

/* ------------------------------------------------------------------ */
/* Residencias y colegios mayores                                      */
/* ------------------------------------------------------------------ */

/** Residencia o colegio mayor con el que el servicio trabaja como canal. */
export type ProUniResidence = {
  id: string;
  name: string;
  kind: "colegio_mayor" | "residencia";
  zone: string;
  /** Persona responsable con la que habla el servicio. */
  manager: string;
  phone?: string;
  places: number;
  /** Residentes que usan Franky, agregado. */
  inFranky: number;
  walkMinutes: number;
  /** Tiene convenio con la universidad (plazas reservadas, precio pactado). */
  agreement: boolean;
};

/* ------------------------------------------------------------------ */
/* Cierre de curso para comparar                                       */
/* ------------------------------------------------------------------ */

/**
 * Cifras del informe guardadas al cerrar un curso. El informe del curso
 * siguiente las enseña al lado de las suyas. Las claves son las de las filas
 * del informe (`publications`, `checkins`...).
 */
export type ProUniSeasonSnapshot = {
  /** "2025-26". */
  course: string;
  savedAt: string;
  values: Record<string, number>;
};

/** Todo lo del motor que no cuelga de una lista de `ProData`. */
export type ProUniExtras = {
  audiences: ProUniAudienceSizes;
  faculties: ProUniFacultyStat[];
  deadlines: ProUniDeadline[];
  credits: ProUniCreditRequest[];
  assocActivities: ProUniAssocActivity[];
  market: ProUniMarketRoom[];
  perks: ProUniPerk[];
  passport: ProUniPassport;
  help: ProUniHelpResource[];
  /** Horas que equivalen a un crédito ECTS según la normativa del centro. */
  hoursPerEcts: number;
  /** Primer día del curso (YYYY-MM-DD): marca el inicio del informe. */
  courseStart: string;
  /*
   * Lo que sigue llegó después: es opcional para que un espacio (o una demo
   * guardada en la sesión) que aún no lo tenga siga pintándose. Se lee siempre
   * con los accesores de university-office.ts y university-mentors.ts.
   */
  officeSlots?: ProUniOfficeSlot[];
  appointments?: ProUniAppointment[];
  helpWeeks?: ProUniHelpWeek[];
  mentors?: ProUniMentor[];
  mentorRequests?: ProUniMentorRequest[];
  faqs?: ProUniFaq[];
  rooms?: ProUniRoom[];
  roomBookings?: ProUniRoomBooking[];
  residences?: ProUniResidence[];
  seasons?: ProUniSeasonSnapshot[];
};
