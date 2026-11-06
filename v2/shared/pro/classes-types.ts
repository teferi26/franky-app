/**
 * Datos propios del motor de clases que no caben en el horario ni en las
 * cuotas básicas: el cuidado de cada socio (riesgo, pausas, primeros 90 días),
 * los cobros del mes, la lista de espera que se mueve sola, la pizarra, las
 * salas de ocio y las normas de reserva.
 *
 * Todo cuelga de `ProData.classExtras`, que es opcional: un espacio real que
 * todavía no tiene estos datos en el servidor no lo trae, y las pantallas lo
 * tratan como "aún no hay nada" en vez de romperse. Fechas locales en
 * YYYY-MM-DD, instantes en ISO e importes en céntimos, como el resto de Pro.
 */

/** Por qué se va alguien. Se pregunta al dar de baja y se resume cada trimestre. */
export type ProLeaveReason =
  | "price"
  | "schedule"
  | "moving"
  | "injury"
  | "exams"
  | "results"
  | "other";

/** Por qué se pausa una cuota. La pausa siempre lleva fecha de vuelta. */
export type ProPauseReason = "summer" | "exams" | "injury" | "travel" | "other";

/** Clase a la que faltó y que puede recuperar en otro grupo (academias). */
export type ProRecovery = {
  id: string;
  fromSessionId: string;
  /** Día de la clase perdida (YYYY-MM-DD). */
  missedOn: string;
  /** Último día para recuperarla (YYYY-MM-DD). */
  expiresOn: string;
  usedSessionId?: string;
};

/** Seguimiento de cada socio o alumno, aparte de su cuota. */
export type ProMemberCare = {
  /** Día en que vuelve de la pausa (YYYY-MM-DD). */
  pausedUntil?: string;
  pauseReason?: ProPauseReason;
  /** La pausa se ofreció cuando iba a darse de baja: cuenta como baja evitada. */
  pausedInsteadOfLeaving?: boolean;
  leaveReason?: ProLeaveReason;
  /** Último día que vino (ISO). Si falta se deduce de la asistencia. */
  lastVisitAt?: string;
  /** Último mensaje que le mandó el equipo por verle poco (ISO). */
  contactedAt?: string;
  /** Semanas del recorrido de bienvenida ya hechas (1, 2, 4, 8, 12). */
  touchesDone?: number[];
  /** Lesiones o avisos breves. Solo los ve el equipo, junto a su nombre. */
  health?: string;
  /** Fin del bono (YYYY-MM-DD). Solo para planes de tipo bono. */
  bundleExpiresOn?: string;
  /** Veces que reservó y no vino. */
  noShows?: number;
  /** Oferta de vuelta enviada a un exsocio (ISO). */
  winbackAt?: string;
  recoveries?: ProRecovery[];
  /** Plaza para el curso siguiente (academias, se pregunta en julio). */
  nextCourse?: "confirmed" | "pending" | "declined";
  /** Nivel de idioma tras la prueba de nivel (academias de idiomas). */
  level?: ProCefrLevel;
  /**
   * Hasta qué día solo puede reservar clases llenas con poca antelación. Es
   * la consecuencia suave tras varias faltas sin avisar (YYYY-MM-DD).
   */
  bookingLimitedUntil?: string;
  /** Cuándo se le propuso el grupo siguiente al acabar el suyo (ISO). */
  continuityOfferedAt?: string;
};

/** Niveles del Marco Común Europeo, de menos a más. */
export type ProCefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type ProChargeMethod = "card" | "bizum" | "cash" | "transfer" | "sepa";

/** Una cuota de un mes: se cobra, queda pendiente o vuelve devuelta. */
export type ProMemberCharge = {
  id: string;
  memberId: string;
  memberName: string;
  /** Mes al que corresponde (YYYY-MM). */
  period: string;
  concept: string;
  amountCents: number;
  /** Día en que vence (YYYY-MM-DD). */
  dueOn: string;
  status: "paid" | "pending" | "returned";
  method?: ProChargeMethod;
  paidAt?: string;
  /** Último recordatorio enviado (ISO). */
  remindedAt?: string;
  /** Número de recibo correlativo por serie, p. ej. "R2026-0042". */
  receiptNo?: string;
};

/** Plaza liberada que se ofrece a la primera persona de la lista de espera. */
export type ProWaitOffer = {
  id: string;
  sessionId: string;
  bookingId: string;
  clientName: string;
  offeredAt: string;
  expiresAt: string;
  status: "pending" | "accepted" | "expired";
};

/** Qué pasó después de una clase de prueba o una primera visita. */
export type ProTrialOutcome = {
  bookingId: string;
  sessionId: string;
  clientName: string;
  coachId: string;
  outcome: "joined" | "declined";
  reason?: string;
  planId?: string;
  at: string;
};

/** Un bloque de la pizarra del día: calentamiento, fuerza, WOD... */
export type ProBoardBlock = { id: string; title: string; body: string };

export type ProSessionExtra = {
  board?: ProBoardBlock[];
  /** Sesión en inglés (Erasmus y turistas). */
  language?: "es" | "en";
  /** Reserva de grupo grande repartida en varias salas a la misma hora. */
  linkId?: string;
  /** Quién la daba antes de una sustitución. */
  originalCoachId?: string;
};

/** Tarifa de una sala según cuántos juegan (precio total del grupo). */
export type ProPlayerPrice = {
  players: number;
  priceCents: number;
  studentPriceCents?: number;
};

export type ProClassTypeExtra = {
  /** Sala para un grupo cerrado (escape room): se reserva entera. */
  roomMode?: { minPlayers: number; maxPlayers: number };
  /** Minutos para preparar la sala entre partidas. */
  setupMin?: number;
  playerPrices?: ProPlayerPrice[];
  /** Fecha del examen del grupo (academias, YYYY-MM-DD). */
  examOn?: string;
  /** Nivel del grupo si es de idiomas (academias). */
  cefr?: ProCefrLevel;
  /** Grupo que sigue a este (Contabilidad I lleva a Estadística...). */
  nextTypeId?: string;
  /** Apuntes, temario o carpetas que el profesor comparte con el grupo. */
  materials?: ProGroupMaterial[];
  /** Material que se gasta por plaza en un taller (barro, lienzos...). */
  seatMaterial?: ProSeatMaterial;
};

/** Un enlace de material de un grupo: apuntes, temario, su Drive. */
export type ProGroupMaterial = { id: string; title: string; url: string; addedOn: string };

/** Lo que gasta cada plaza de un taller y lo que queda en el almacén. */
export type ProSeatMaterial = {
  /** Qué es: "barro", "lienzos", "velas". */
  item: string;
  /** Cuánto gasta cada plaza. */
  perSeat: number;
  unit: "kg" | "ud" | "l";
  /** Lo que hay ahora en el almacén. */
  stock: number;
};

/** Reglas propias de cada plan que no están en la cuota básica. */
export type ProPlanExtra = {
  /** Matrícula o cuota de alta: se cobra una vez, con el primer recibo. */
  enrollmentCents?: number;
};

/** Norma de recuperaciones de la academia. */
export type ProRecoveryRules = {
  /** Cuántas clases puede tener pendientes a la vez. */
  maxPending: number;
};

/** Nota de un simulacro, un examen parcial o una prueba de clase. */
export type ProGrade = {
  id: string;
  memberId: string;
  classTypeId?: string;
  /** Día de la prueba (YYYY-MM-DD). */
  on: string;
  /** Tema o parte: "Límites y derivadas", "Listening". */
  topic: string;
  /** Nota sobre 10. */
  grade: number;
  kind: "mock" | "partial" | "test";
};

/** Datos fiscales de una empresa que pide factura de su reserva. */
export type ProCompanyBilling = { name: string; taxId: string; address: string };

/** Ficha de una reserva de sala o taller: lo que recepción necesita a la vista. */
export type ProRoomBooking = {
  players?: number;
  language?: "es" | "en";
  minors?: boolean;
  birthdayOf?: string;
  notes?: string;
  howFound?: string;
  phone?: string;
  remindedAt?: string;
  reviewAskedAt?: string;
  lateNotifiedAt?: string;
  arrival?: "arrived" | "late" | "no_show";
  paidMethod?: ProChargeMethod;
  paidCents?: number;
  /** Extras del pack de cumpleaños: tarta propia, sala de celebración... */
  extras?: string[];
  /**
   * Día de la celebración y quién reservó, guardados al apuntar el
   * cumpleaños: sirven para felicitarle al año siguiente aunque la reserva
   * ya no esté en el horario.
   */
  partyOn?: string;
  contactName?: string;
  /** Cuándo se le mandó la felicitación del año siguiente (ISO). */
  greetedAt?: string;
  /** Empresa que pide factura con sus datos. */
  company?: ProCompanyBilling;
  /** Número de factura emitida para esta reserva, p. ej. "F2026-0003". */
  invoiceNo?: string;
  /** Cuándo se emitió la factura (ISO). */
  invoicedAt?: string;
};

/** Norma de reservas del negocio. Franky la aplica al cancelar. */
export type ProBookingPolicy = {
  /** Horas de antelación para cambiar o cancelar sin coste. */
  freeChangeHours: number;
  /** Si avisa tarde, se le da un bono para otra fecha en vez de perderlo. */
  lateNoticeVoucher: boolean;
  /** Minutos de cortesía antes de dar la reserva por perdida. */
  courtesyMin: number;
  /** Enlace para dejar reseña (Google o la ficha de Franky). */
  reviewUrl?: string;
};

/** Lo que sabe hacer cada persona del equipo (salas e idiomas). */
export type ProStaffSkills = { languages: string[]; rooms: string[] };

export type ProClassesExtras = {
  members: Record<string, ProMemberCare>;
  charges: ProMemberCharge[];
  /** Último número de recibo emitido en el año en curso. */
  receiptSeq: number;
  waitOffers: ProWaitOffer[];
  trials: ProTrialOutcome[];
  sessions: Record<string, ProSessionExtra>;
  types: Record<string, ProClassTypeExtra>;
  roomBookings: Record<string, ProRoomBooking>;
  staff: Record<string, ProStaffSkills>;
  policy: ProBookingPolicy;
  /** Días para recuperar una clase perdida. */
  recoveryDays: number;
  /** Horas que tiene la persona de la lista de espera para confirmar su plaza. */
  waitHoldHours: number;
  reviews: { asked: number; received: number };

  /*
   * Lo que sigue llegó en la segunda ola del motor. Es opcional para que los
   * datos guardados antes (demo en la sesión, espacios reales) sigan valiendo:
   * `extrasOf` rellena lo que falte.
   */
  /** Interesados que todavía no son socios ni alumnos, fase a fase. */
  leads?: ProClassLead[];
  /** Entradas con el QR de la puerta. */
  checkins?: ProDoorCheckin[];
  /** Retos de un mes entre facultades (gimnasios y boxes). */
  challenges?: ProChallenge[];
  /** Marcas personales de cada socio: 1RM, benchmarks, tiempos. */
  records?: ProPersonalRecord[];
  /** Quién trae a quién con su enlace de clase de prueba. */
  referrals?: ProReferral[];
  /** Premio que da el centro por traer a un amigo que se apunta. */
  referralReward?: string;
  /** Resultado de cada partida de sala (ranking). */
  roomResults?: ProRoomResult[];
  /** Bonos regalo con código. */
  vouchers?: ProGiftVoucher[];
  /** Último número de bono regalo emitido. */
  voucherSeq?: number;
  /** Resultado del examen de cada alumno por grupo (academias). */
  examResults?: ProExamResult[];
  /** Tareas de la temporada de septiembre ya hechas, por año. */
  seasonDone?: Record<string, string[]>;

  /* Tercera ola: academias (notas, niveles, matrícula) y ocio (facturas). */
  /** Notas de simulacros y parciales de cada alumno. */
  grades?: ProGrade[];
  /** Matrícula y otras reglas de cada plan, por id de plan. */
  plans?: Record<string, ProPlanExtra>;
  /** Norma de recuperaciones (tope de clases pendientes). */
  recoveryRules?: ProRecoveryRules;
  /** Último número de factura emitido en el año en curso. */
  invoiceSeq?: number;
};

/* ------------------------------------------------------------------ */
/* Segunda ola: captación, retos, ranking, bonos regalo y resultados    */
/* ------------------------------------------------------------------ */

/** Fase de un interesado: de la primera pregunta a la matrícula. */
export type ProLeadStage = "new" | "trial_booked" | "came" | "joined" | "lost";

/** Alguien que ha preguntado y todavía no es socio o alumno. */
export type ProClassLead = {
  id: string;
  name: string;
  phone?: string;
  stage: ProLeadStage;
  /** Asignatura, nivel u objetivo ("Cálculo I", "B2 de inglés", "perder 5 kg"). */
  interest?: string;
  /** Día del examen que le preocupa (YYYY-MM-DD, academias). */
  examOn?: string;
  /** Próximo día para volver a llamar o escribir (YYYY-MM-DD). */
  followUpOn?: string;
  source: "franky" | "instagram" | "friend" | "walkin" | "web" | "other";
  university?: string;
  studies?: string;
  note?: string;
  /** Por qué no sigue, si se pierde. */
  lostReason?: string;
  /** Quién le trajo (id de socio), si vino por "trae a un amigo". */
  referredBy?: string;
  createdAt: string;
  updatedAt: string;
};

/** Entrada por el QR de la puerta: la reserva pasa a "llegó" o entra de paso. */
export type ProDoorCheckin = {
  id: string;
  sessionId: string;
  name: string;
  at: string;
  kind: "booked" | "walkin";
};

/** Reto de un mes: gana la facultad que más entrena. */
export type ProChallenge = {
  id: string;
  title: string;
  /** Qué cuenta: asistencias a clase de los socios de cada facultad. */
  metric: "visits";
  startsOn: string;
  endsOn: string;
  prize: string;
  /** Asistencias apuntadas a mano (una clase fuera de horario, un evento). */
  bonus?: Record<string, number>;
};

/** Marca personal de un socio (1RM de sentadilla, Fran, 5 km...). */
export type ProPersonalRecord = {
  id: string;
  memberId: string;
  /** Movimiento o benchmark: "Back squat", "Fran", "Remo 2 km". */
  lift: string;
  /** Valor y unidad: 120 "kg", 245 "s", 21 "reps". */
  value: number;
  unit: "kg" | "s" | "reps";
  on: string;
  /** El coach ya le ha felicitado. */
  cheeredAt?: string;
};

/** Un amigo que llega con el enlace de un socio. */
export type ProReferral = {
  id: string;
  memberId: string;
  friendName: string;
  status: "invited" | "trial" | "joined";
  at: string;
  /** El premio ya se le ha dado a quien le trajo. */
  rewardedAt?: string;
};

/** Resultado de una partida de sala de escape. */
export type ProRoomResult = {
  id: string;
  classTypeId: string;
  bookingId?: string;
  team: string;
  players: number;
  escaped: boolean;
  /** Segundos que tardaron (si escaparon). */
  seconds?: number;
  hints: number;
  on: string;
  university?: string;
  faculty?: string;
};

/** Bono regalo con código que se canjea en recepción. */
export type ProGiftVoucher = {
  id: string;
  code: string;
  /** Qué regala: "Sala para 4", "Taller de cerámica". */
  concept: string;
  amountCents: number;
  buyer: string;
  recipient: string;
  soldOn: string;
  expiresOn: string;
  redeemedAt?: string;
  method?: ProChargeMethod;
};

/** Cómo le fue a un alumno en el examen de su grupo. */
export type ProExamResult = {
  memberId: string;
  classTypeId: string;
  result: "passed" | "failed" | "absent";
  /** Nota sobre 10, si la comparte. */
  grade?: number;
  on: string;
};
