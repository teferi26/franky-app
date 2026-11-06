/**
 * Lógica del motor de universidad: públicos y alcance, confirmaciones de
 * lectura, avisos urgentes, plantillas, pasaporte, alojamiento con sello que
 * caduca, créditos con asistencia, moderación por daño, calendario del curso e
 * informe de temporada.
 *
 * Todo son funciones puras: las usan la web, la app nativa y los tests. Las
 * pantallas nunca leen `data.uniExtras` directamente: usan `uniExtrasOf()`,
 * que devuelve listas vacías en un espacio real que aún no tiene estos datos.
 */

import type { ProData, ProUniPublication } from "./types";
import type {
  ProUniAssocActivity,
  ProUniAudience,
  ProUniAudienceSizes,
  ProUniCreditRequest,
  ProUniDeadline,
  ProUniDeadlineKind,
  ProUniDocKey,
  ProUniExtras,
  ProUniFacultyStat,
  ProUniHousingCase,
  ProUniMarketRoom,
  ProUniReadStat,
  ProUniSurvey,
  ProUniUrgentKind,
  UniAssociation,
  UniHousing,
  UniModeration,
  UniPublication,
  UniWelcomeStop,
} from "./university-types";
import { addDays, atLocal, localDate, pct } from "./format";
import { proCsvCell } from "./csv";

/** Umbral de privacidad: grupos más pequeños no se muestran. */
export const PRIVACY_MIN_GROUP = 10;

/* ------------------------------------------------------------------ */
/* Datos del motor                                                     */
/* ------------------------------------------------------------------ */

export const EMPTY_UNI_EXTRAS: ProUniExtras = {
  audiences: {
    campus: 0,
    first_year: 0,
    erasmus: 0,
    master: 0,
    residences: 0,
    welcome_absent: 0,
    faculties: {},
  },
  faculties: [],
  deadlines: [],
  credits: [],
  assocActivities: [],
  market: [],
  perks: [],
  passport: { goal: 5, completed: 0 },
  help: [],
  hoursPerEcts: 25,
  courseStart: "",
};

/** Lo que haya del motor, o listas vacías si el espacio aún no lo tiene. */
export function uniExtrasOf(data: Pick<ProData, "uniExtras">): ProUniExtras {
  return data.uniExtras ?? EMPTY_UNI_EXTRAS;
}

/** Aplica un cambio sobre `uniExtras` sin perder lo que no se toca. */
export function withUniExtras(data: ProData, fn: (extras: ProUniExtras) => ProUniExtras): ProData {
  return { ...data, uniExtras: fn(uniExtrasOf(data)) };
}

/** Mediana de una lista de números (0 si está vacía). */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/* ------------------------------------------------------------------ */
/* Públicos y alcance                                                  */
/* ------------------------------------------------------------------ */

export const AUDIENCE_LABEL: Record<ProUniAudience, string> = {
  campus: "Todo el campus",
  first_year: "Primer curso",
  faculties: "Facultades",
  erasmus: "Erasmus e internacionales",
  master: "Máster",
  residences: "Residencias y colegios mayores",
  welcome_absent: "Primero que no vino a la bienvenida",
};

export const AUDIENCE_ORDER: ProUniAudience[] = [
  "campus",
  "first_year",
  "faculties",
  "erasmus",
  "master",
  "residences",
  "welcome_absent",
];

/**
 * Parte del público que suele ver cada canal. Son las tasas medidas en las
 * publicaciones del campus; el alcance siempre se enseña como estimación.
 */
export const CHANNEL_VIEW_RATE: Record<ProUniPublication["channel"], number> = {
  aviso: 0.62,
  evento: 0.41,
  fomo: 0.35,
};

/** Públicos que se pueden acotar a unas facultades concretas. */
export const FACULTY_SCOPED: ProUniAudience[] = ["faculties", "first_year", "welcome_absent"];

type AudienceSource = Pick<ProUniExtras, "audiences" | "faculties">;

/** Primero de una facultad: activos en Franky y los que no fueron a la bienvenida. */
function firstYearOf(source: AudienceSource, faculty: string) {
  const f = source.faculties.find((x) => x.faculty === faculty);
  if (!f) return { active: 0, absent: 0 };
  return { active: f.active30, absent: Math.max(0, f.active30 - f.participated) };
}

/**
 * Cuántas personas forman un público (sin aplicar la tasa de lectura). Primer
 * curso y "no vino a la bienvenida" se pueden acotar a unas facultades.
 */
export function audiencePeople(
  source: AudienceSource,
  audience: ProUniAudience,
  faculties: string[] = [],
): number {
  const sizes: ProUniAudienceSizes = source.audiences;
  if (audience === "faculties") {
    return faculties.reduce((sum, f) => sum + (sizes.faculties[f] ?? 0), 0);
  }
  if ((audience === "first_year" || audience === "welcome_absent") && faculties.length) {
    const key = audience === "first_year" ? "active" : "absent";
    return faculties.reduce((sum, f) => sum + firstYearOf(source, f)[key], 0);
  }
  return sizes[audience];
}

export type ReachEstimate = {
  /** Estudiantes que forman el público. */
  people: number;
  /** Cuántos lo verán, redondeado a decenas. */
  reach: number;
  /** Público de menos de 10 personas: no se enseña ni se puede usar. */
  tooSmall: boolean;
};

export function estimateReach(
  source: AudienceSource,
  channel: ProUniPublication["channel"],
  audience: ProUniAudience,
  faculties: string[] = [],
): ReachEstimate {
  const people = audiencePeople(source, audience, faculties);
  const reach = Math.round((people * CHANNEL_VIEW_RATE[channel]) / 10) * 10;
  return { people, reach, tooSmall: people < PRIVACY_MIN_GROUP };
}

export function audienceText(audience: ProUniAudience, faculties: string[] = []): string {
  if (!faculties.length || !FACULTY_SCOPED.includes(audience)) return AUDIENCE_LABEL[audience];
  const list = faculties.join(", ");
  if (audience === "faculties") return list;
  return `${AUDIENCE_LABEL[audience]}, ${list}`;
}

/* ------------------------------------------------------------------ */
/* "Lo he leído"                                                       */
/* ------------------------------------------------------------------ */

export type ReadSummary = { audience: number; read: number; unread: number; pct: number };

export function readSummary(p: UniPublication): ReadSummary {
  const reads = p.reads ?? [];
  const audience = reads.reduce((a, r) => a + r.audience, 0);
  const read = reads.reduce((a, r) => a + Math.min(r.read, r.audience), 0);
  return { audience, read, unread: Math.max(0, audience - read), pct: pct(read, audience) };
}

/** Lectura por facultad, sin grupos de menos de 10 y de menos a más leída. */
export function readsByFaculty(p: UniPublication) {
  return (p.reads ?? [])
    .map((r) => ({ ...r, hidden: r.audience < PRIVACY_MIN_GROUP, pct: pct(r.read, r.audience) }))
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.pct - b.pct);
}

/**
 * Lectura vacía al publicar: una fila por facultad cuando el público se puede
 * repartir por facultades y una sola fila para los públicos transversales.
 */
export function initialReads(
  source: AudienceSource,
  audience: ProUniAudience,
  faculties: string[] = [],
): ProUniReadStat[] {
  const sizes = source.audiences;
  if (audience === "campus" || audience === "faculties") {
    const names = audience === "campus" ? Object.keys(sizes.faculties) : faculties;
    return names.map((faculty) => ({ faculty, audience: sizes.faculties[faculty] ?? 0, read: 0 }));
  }
  if ((audience === "first_year" || audience === "welcome_absent") && source.faculties.length) {
    const names = faculties.length ? faculties : source.faculties.map((f) => f.faculty);
    return names.map((faculty) => ({ faculty, audience: audiencePeople(source, audience, [faculty]), read: 0 }));
  }
  return [{ faculty: AUDIENCE_LABEL[audience], audience: sizes[audience], read: 0 }];
}

/** Recuerda el aviso solo a quien no lo ha leído. Devuelve la publicación nueva. */
export function remindUnread(p: UniPublication, now: Date): UniPublication {
  const { unread } = readSummary(p);
  if (!unread) return p;
  return { ...p, reminders: [...(p.reminders ?? []), { at: now.toISOString(), sentTo: unread }] };
}

/* ------------------------------------------------------------------ */
/* Avisos urgentes                                                     */
/* ------------------------------------------------------------------ */

export const URGENT_KIND_LABEL: Record<ProUniUrgentKind, string> = {
  closure: "Cierre del campus",
  suspension: "Suspensión de clases",
  weather: "Alerta meteorológica",
  other: "Otro aviso urgente",
};

export type UrgentDuration = "1h" | "3h" | "day";

export const URGENT_DURATION_LABEL: Record<UrgentDuration, string> = {
  "1h": "1 hora",
  "3h": "3 horas",
  day: "Hasta el final del día",
};

/** Hasta cuándo queda fijado arriba un aviso urgente publicado ahora. */
export function urgentUntil(duration: UrgentDuration, now: Date): string {
  if (duration === "1h") return new Date(now.getTime() + 60 * 60000).toISOString();
  if (duration === "3h") return new Date(now.getTime() + 3 * 60 * 60000).toISOString();
  return atLocal(localDate(now), 23 * 60 + 59);
}

export function isUrgentActive(p: UniPublication, now: Date): boolean {
  if (!p.urgent || p.urgent.endedAt || p.status !== "published") return false;
  return new Date(p.urgent.until).getTime() > now.getTime();
}

/** El aviso urgente vigente más reciente, si lo hay. */
export function activeUrgent(pubs: UniPublication[], now: Date): UniPublication | null {
  return (
    pubs
      .filter((p) => isUrgentActive(p, now))
      .sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
  );
}

export function endUrgent(p: UniPublication, now: Date): UniPublication {
  return p.urgent ? { ...p, urgent: { ...p.urgent, endedAt: now.toISOString() } } : p;
}

/* ------------------------------------------------------------------ */
/* Plantillas por momento del curso                                    */
/* ------------------------------------------------------------------ */

export type PublicationTemplate = {
  id: string;
  label: string;
  channel: ProUniPublication["channel"];
  audience: ProUniAudience;
  title: string;
  body: string;
  readReceipt?: boolean;
  urgent?: ProUniUrgentKind;
  help?: boolean;
  titleEn?: string;
  bodyEn?: string;
};

export const PUBLICATION_TEMPLATES: PublicationTemplate[] = [
  {
    id: "urgente",
    label: "Aviso urgente",
    channel: "aviso",
    audience: "campus",
    title: "Hoy se suspenden las clases presenciales",
    body: "Por [motivo], hoy no hay clases presenciales en el campus. Las bibliotecas y los servicios cierran a las [hora]. Te avisaremos aquí cuando todo vuelva a la normalidad.",
    readReceipt: true,
    urgent: "suspension",
    titleEn: "In-person classes are cancelled today",
    bodyEn: "Due to [reason], there are no in-person classes on campus today. Libraries and services close at [time]. We will let you know here when everything is back to normal.",
  },
  {
    id: "becas",
    label: "Plazo de becas",
    channel: "aviso",
    audience: "campus",
    title: "Becas: el plazo cierra el [fecha]",
    body: "Si todavía no la has pedido, estás a tiempo. Necesitas [documentos]. Si tienes dudas, pásate por el Servicio de Atención al Estudiante o escríbenos por aquí.",
    readReceipt: true,
  },
  {
    id: "matricula",
    label: "Matrícula",
    channel: "aviso",
    audience: "first_year",
    title: "Último día para modificar tu matrícula",
    body: "Hasta el [fecha] puedes cambiar asignaturas y grupos desde la sede electrónica. Después solo se podrá en casos justificados.",
    readReceipt: true,
  },
  {
    id: "examenes",
    label: "Exámenes",
    channel: "fomo",
    audience: "campus",
    title: "Bibliotecas abiertas más horas en exámenes",
    body: "Del [fecha] al [fecha], las bibliotecas abren de [hora] a [hora]. Consulta las plazas libres en las salas de estudio y date descansos: rinde más quien duerme.",
  },
  {
    id: "erasmus",
    label: "Erasmus",
    channel: "evento",
    audience: "erasmus",
    title: "Bienvenida para Erasmus e internacionales",
    body: "Te esperamos el [fecha] a las [hora] en [lugar]: trámites, alojamiento verificado y ESN para enseñarte la ciudad.",
    titleEn: "Welcome day for Erasmus and international students",
    bodyEn: "Join us on [date] at [time] in [place]: paperwork, verified housing and ESN to show you around the city.",
  },
  {
    id: "elecciones",
    label: "Elecciones",
    channel: "aviso",
    audience: "campus",
    title: "Elecciones a representantes de estudiantes",
    body: "El [fecha] eliges a quien te representa en tu facultad. Las candidaturas se presentan hasta el [fecha]. Votar lleva dos minutos.",
    readReceipt: true,
  },
  {
    id: "bienestar",
    label: "Semana de bienestar",
    channel: "fomo",
    audience: "campus",
    title: "Semana del bienestar: talleres y atención sin cita",
    body: "Del [fecha] al [fecha]: talleres de gestión del estrés, sueño y ansiedad ante los exámenes. Si necesitas hablar con alguien, pulsa \"Pedir ayuda\": está siempre en esta publicación.",
    help: true,
  },
];

export const DEADLINE_KIND_LABEL: Record<ProUniDeadlineKind, string> = {
  becas: "Becas",
  matricula: "Matrícula",
  examenes: "Exámenes",
  erasmus: "Erasmus",
  elecciones: "Elecciones",
  bienestar: "Bienestar",
  otro: "Otro",
};

/** La plantilla que corresponde a cada tipo de plazo. */
export function templateForDeadline(d: ProUniDeadline): PublicationTemplate {
  const byKind: Partial<Record<ProUniDeadlineKind, string>> = {
    becas: "becas",
    matricula: "matricula",
    examenes: "examenes",
    erasmus: "erasmus",
    elecciones: "elecciones",
    bienestar: "bienestar",
  };
  const base = PUBLICATION_TEMPLATES.find((t) => t.id === byKind[d.kind]);
  if (base) return { ...base, audience: d.audience, title: d.title };
  return {
    id: "otro",
    label: DEADLINE_KIND_LABEL.otro,
    channel: "aviso",
    audience: d.audience,
    title: d.title,
    body: "",
    readReceipt: true,
  };
}

/* ------------------------------------------------------------------ */
/* Comprobador de accesibilidad al publicar                            */
/* ------------------------------------------------------------------ */

function shouting(text: string): boolean {
  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  return letters.length >= 8 && letters === letters.toUpperCase();
}

/** Consejos para que el aviso se lea bien con lector de pantalla y en el móvil. */
export function accessibilityHints(title: string, body: string): string[] {
  const hints: string[] = [];
  if (shouting(title) || shouting(body)) {
    hints.push("Evita escribir en mayúsculas: se lee peor y los lectores de pantalla lo deletrean.");
  }
  if (title.trim().length > 90) hints.push("El título es largo: lo esencial en menos de 90 caracteres.");
  if (body.trim().length > 900) hints.push("El texto pasa de 900 caracteres: divide en dos avisos o enlaza el detalle.");
  if (/https?:\/\/\S+/.test(body)) hints.push("Explica adónde lleva el enlace en vez de pegar la dirección tal cual.");
  if (/!{2,}/.test(title + body)) hints.push("Con un signo de exclamación basta.");
  return hints;
}

/** Enlace para que delegados y asociaciones lo compartan por WhatsApp. */
export function whatsappShareUrl(p: Pick<UniPublication, "title" | "body">, slug: string): string {
  const text = [p.title, p.body, `https://franky.es/n/${slug}`].filter(Boolean).join("\n\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/* ------------------------------------------------------------------ */
/* Pasaporte de bienvenida                                             */
/* ------------------------------------------------------------------ */

/** Cada cuánto cambia el QR del proyector para que no se pueda compartir. */
export const QR_ROTATION_MS = 30_000;

function hash36(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 5).toUpperCase().padStart(5, "0");
}

/** Código del QR rotatorio para el instante dado y lo que le queda. */
export function rotatingCode(code: string, nowMs: number, periodMs = QR_ROTATION_MS) {
  const window = Math.floor(nowMs / periodMs);
  return {
    token: `${code}-${hash36(`${code}:${window}`)}`,
    window,
    msLeft: periodMs - (nowMs % periodMs),
  };
}

/** Enlace que abre Franky en la parada para hacer check-in. */
export function checkinUrl(slug: string, code: string, token?: string): string {
  const query = new URLSearchParams({ parada: code });
  if (token) query.set("t", token);
  return `https://franky.es/n/${slug}?${query.toString()}`;
}

export const DEFAULT_SURVEY: Pick<ProUniSurvey, "question" | "options"> = {
  question: "¿Qué te ha parecido?",
  options: ["Me ha servido mucho", "Está bien", "No me ha servido"],
};

export function newSurvey(): ProUniSurvey {
  return { ...DEFAULT_SURVEY, options: [...DEFAULT_SURVEY.options], answers: [0, 0, 0] };
}

/** Resultado agregado de la encuesta; con menos de 10 respuestas no se enseña. */
export function surveyResults(s: ProUniSurvey) {
  const total = s.answers.reduce((a, n) => a + n, 0);
  return {
    total,
    hidden: total < PRIVACY_MIN_GROUP,
    rows: s.options.map((label, i) => ({ label, count: s.answers[i], pct: pct(s.answers[i], total) })),
  };
}

export function stopsOf(data: Pick<ProData, "uniWelcome">): UniWelcomeStop[] {
  return data.uniWelcome as UniWelcomeStop[];
}

/* ------------------------------------------------------------------ */
/* Alojamiento                                                         */
/* ------------------------------------------------------------------ */

/**
 * El sello vale un curso: caduca el 31 de agosto. Si se concede a partir de
 * julio, ya cuenta para el curso que empieza y caduca el agosto siguiente.
 */
export function sealExpiryFor(verifiedAt: string): string {
  const day = localDate(verifiedAt);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return `${month >= 7 ? year + 1 : year}-08-31`;
}

export type SealState = "none" | "valid" | "renewal" | "expired";

/** Días antes de caducar en los que se pide la renovación (desde julio). */
export const SEAL_RENEWAL_DAYS = 62;

export function sealState(h: UniHousing, now: Date): SealState {
  if (h.status !== "verified" || !h.verifiedUntil) return h.status === "verified" ? "valid" : "none";
  const today = localDate(now);
  if (h.verifiedUntil < today) return "expired";
  if (addDays(today, SEAL_RENEWAL_DAYS) >= h.verifiedUntil) return "renewal";
  return "valid";
}

export type CaseState = "open" | "overdue" | "answered" | "resolved";

export function caseState(c: ProUniHousingCase, now: Date): CaseState {
  if (c.status === "resolved") return "resolved";
  if (c.status === "answered") return "answered";
  return new Date(c.dueAt).getTime() < now.getTime() ? "overdue" : "open";
}

/** Días naturales que le quedan al propietario (negativo si ya venció). */
export function caseDaysLeft(c: ProUniHousingCase, now: Date): number {
  const ms = new Date(c.dueAt).getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}

export function openCase(message: string, days: number, now: Date, id: string): ProUniHousingCase {
  return {
    id,
    openedAt: now.toISOString(),
    dueAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    message,
    status: "open",
  };
}

/** Lo que ha pasado antes con el mismo propietario, para revisar un piso nuevo. */
export function ownerHistory(all: UniHousing[], h: UniHousing) {
  const others = all.filter((x) => x.owner === h.owner && x.id !== h.id);
  return {
    others,
    verified: others.filter((x) => x.status === "verified").length,
    rejected: others.filter((x) => x.status === "rejected").length,
    complaints: others.reduce((a, x) => a + x.complaints, 0),
    cases: others.filter((x) => x.case).length,
  };
}

export type ZonePrice = {
  zone: string;
  count: number;
  medianCents: number;
  medianMinutes: number;
  hidden: boolean;
};

/** Precio mediano por zona de habitaciones verificadas; zonas con menos de 10 se ocultan. */
export function zoneObservatory(market: ProUniMarketRoom[], kind: ProUniMarketRoom["kind"] = "room"): ZonePrice[] {
  const byZone = new Map<string, ProUniMarketRoom[]>();
  for (const r of market) {
    if (r.kind !== kind) continue;
    byZone.set(r.zone, [...(byZone.get(r.zone) ?? []), r]);
  }
  return [...byZone.entries()]
    .map(([zone, rows]) => ({
      zone,
      count: rows.length,
      medianCents: median(rows.map((r) => r.priceCents)),
      medianMinutes: median(rows.map((r) => r.minutesToCampus)),
      hidden: rows.length < PRIVACY_MIN_GROUP,
    }))
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.medianMinutes - b.medianMinutes);
}

/* ------------------------------------------------------------------ */
/* Asociaciones: registro y créditos                                   */
/* ------------------------------------------------------------------ */

export const REQUIRED_DOCS: { key: ProUniDocKey; label: string }[] = [
  { key: "statutes", label: "Estatutos firmados" },
  { key: "founding", label: "Acta de constitución" },
  { key: "board", label: "Junta directiva con contacto" },
  { key: "members", label: "Lista de socios" },
  { key: "plan", label: "Plan de actividades del curso" },
];

/** Estado de cada documento. Una asociación registrada lo tiene todo entregado. */
export function docsOf(a: UniAssociation) {
  return REQUIRED_DOCS.map((d) => ({
    ...d,
    ok: a.registered ? true : (a.docs?.find((x) => x.key === d.key)?.ok ?? false),
  }));
}

export function missingDocs(a: UniAssociation) {
  return docsOf(a).filter((d) => !d.ok);
}

/** Asistencia mínima para certificar horas: la regla del servicio por defecto. */
export const CREDIT_MIN_ATTENDANCE = 80;

export function attendancePct(r: ProUniCreditRequest): number {
  return pct(r.attended, r.sessions);
}

export function creditEligible(r: ProUniCreditRequest): boolean {
  return attendancePct(r) >= CREDIT_MIN_ATTENDANCE;
}

/** Créditos ECTS equivalentes a unas horas, con dos decimales. */
export function ectsFor(hours: number, hoursPerEcts: number): number {
  if (hoursPerEcts <= 0) return 0;
  return Math.round((hours / hoursPerEcts) * 100) / 100;
}

export type CreditGroup = {
  key: string;
  associationId: string;
  association: string;
  activity: string;
  hours: number;
  requests: ProUniCreditRequest[];
  eligible: number;
};

/** Solicitudes pendientes agrupadas por asociación y actividad. */
export function pendingCreditGroups(credits: ProUniCreditRequest[], associations: UniAssociation[]): CreditGroup[] {
  const groups = new Map<string, CreditGroup>();
  for (const r of credits) {
    if (r.status !== "pending") continue;
    const key = `${r.associationId}:${r.activity}`;
    const group = groups.get(key) ?? {
      key,
      associationId: r.associationId,
      association: associations.find((a) => a.id === r.associationId)?.name ?? "Asociación",
      activity: r.activity,
      hours: r.hours,
      requests: [],
      eligible: 0,
    };
    group.requests.push(r);
    if (creditEligible(r)) group.eligible += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.requests.length - a.requests.length);
}

/**
 * Decide un lote de solicitudes y recalcula el contador de cada asociación
 * (`ectsRequests`), que es lo que leen Hoy y la app nativa.
 */
export function decideCredits(
  data: ProData,
  ids: string[],
  status: "validated" | "revision",
  now: Date,
): ProData {
  const chosen = new Set(ids);
  const next = withUniExtras(data, (x) => ({
    ...x,
    credits: x.credits.map((r) =>
      chosen.has(r.id) && r.status === "pending" ? { ...r, status, decidedAt: now.toISOString() } : r,
    ),
  }));
  const credits = uniExtrasOf(next).credits;
  return {
    ...next,
    uniAssociations: next.uniAssociations.map((a) => ({
      ...a,
      ectsRequests: credits.filter((r) => r.associationId === a.id && r.status === "pending").length,
    })),
  };
}

/** CSV para secretaría con las solicitudes validadas. */
export function creditsCsv(
  credits: ProUniCreditRequest[],
  associations: UniAssociation[],
  hoursPerEcts: number,
): string {
  const header = ["Estudiante", "Correo", "Facultad", "Asociación", "Actividad", "Horas", "Asistencia", "ECTS", "Validado el"];
  const rows = credits
    .filter((r) => r.status === "validated")
    .map((r) => [
      r.student,
      r.email,
      r.faculty,
      associations.find((a) => a.id === r.associationId)?.name ?? "",
      r.activity,
      String(r.hours),
      `${attendancePct(r)} %`,
      ectsFor(r.hours, hoursPerEcts).toLocaleString("es-ES"),
      r.decidedAt ? localDate(r.decidedAt) : "",
    ]);
  return [header, ...rows].map((row) => row.map(proCsvCell).join(";")).join("\n");
}

/* ------------------------------------------------------------------ */
/* Calendario de asociaciones: choques de espacio                      */
/* ------------------------------------------------------------------ */

function samePlace(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

/** Para cada actividad, las que coinciden con ella en el mismo espacio y hora. */
export function activityClashes(activities: ProUniAssocActivity[]): Map<string, string[]> {
  const clashes = new Map<string, string[]>();
  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      const a = activities[i];
      const b = activities[j];
      const overlap = a.start < b.end && b.start < a.end;
      if (!overlap || !samePlace(a.place, b.place)) continue;
      clashes.set(a.id, [...(clashes.get(a.id) ?? []), b.id]);
      clashes.set(b.id, [...(clashes.get(b.id) ?? []), a.id]);
    }
  }
  return clashes;
}

/* ------------------------------------------------------------------ */
/* Moderación: prioridad por daño y señales de fraude                  */
/* ------------------------------------------------------------------ */

/** Reglas en el cliente que marcan los timos de alquiler y de trabajo más comunes. */
export const FRAUD_RULES: { key: string; label: string; pattern: RegExp }[] = [
  { key: "cash", label: "Fianza o pago en efectivo", pattern: /(fianza|pago|pagar|adelanto)[^.]{0,40}efectivo|efectivo[^.]{0,40}(fianza|pago)/i },
  { key: "contract", label: "Sin contrato", pattern: /sin contrato|no hay contrato|sin papeles/i },
  { key: "id", label: "Pide el DNI", pattern: /(foto|copia|imagen)[^.]{0,20}(del )?(dni|pasaporte|nie)|\b(dni|nie)\b[^.]{0,20}(foto|por whatsapp)/i },
  { key: "prepay", label: "Pago por adelantado", pattern: /(por adelantado|antes de ver|sin ver el piso|reserva(r)? con (un )?bizum|bizum (para|de) reserva|western union)/i },
  { key: "whatsapp", label: "Saca la conversación a WhatsApp", pattern: /escrib\w* (por|al) whatsapp|solo por whatsapp/i },
];

export function fraudSignals(text: string): { key: string; label: string }[] {
  return FRAUD_RULES.filter((r) => r.pattern.test(text)).map(({ key, label }) => ({ key, label }));
}

const SEVERE = /fraude|estafa|acoso|suplantaci|amenaza|odio|sexual/i;

/** Cuánto daño puede hacer: lo grave y lo que tiene señales de fraude va arriba. */
export function harmScore(m: Pick<UniModeration, "reason" | "content" | "reports">): number {
  const severe = SEVERE.test(m.reason) ? 3 : 0;
  return severe + fraudSignals(m.content).length;
}

export function sortModerationQueue<T extends Pick<UniModeration, "reason" | "content" | "reports" | "at">>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => harmScore(b) - harmScore(a) || b.reports - a.reports || a.at.localeCompare(b.at),
  );
}

/** Mediana real de minutos desde el reporte hasta la decisión en los últimos días. */
export function medianResponseMinutes(items: UniModeration[], now: Date, days = 30): number | null {
  const since = now.getTime() - days * 86_400_000;
  const minutes = items
    .filter((m) => m.decidedAt && new Date(m.decidedAt).getTime() >= since)
    .map((m) => Math.max(0, Math.round((new Date(m.decidedAt as string).getTime() - new Date(m.at).getTime()) / 60000)));
  return minutes.length ? median(minutes) : null;
}

export type HistoryFilter = { reason?: string; from?: string; to?: string };

/** Historial de decisiones filtrado por motivo y fechas (YYYY-MM-DD, incluidas). */
export function filterHistory(items: UniModeration[], f: HistoryFilter): UniModeration[] {
  return items.filter((m) => {
    if (m.status === "pending") return false;
    const day = localDate(m.decidedAt ?? m.at);
    if (f.reason && m.reason !== f.reason) return false;
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return true;
  });
}

const DECISION_LABEL: Record<UniModeration["status"], string> = {
  pending: "Pendiente",
  hidden: "Ocultado",
  kept: "Se mantiene",
};

/** Registro de decisiones para la Comisión de Convivencia. */
export function moderationCsv(items: UniModeration[]): string {
  const header = ["Reportado el", "Dónde", "Motivo", "Reportes", "Contenido", "Decisión", "Decidido el", "Por", "Nota interna"];
  const rows = items.map((m) => [
    localDate(m.at),
    m.where ?? "",
    m.reason,
    String(m.reports),
    m.content,
    DECISION_LABEL[m.status],
    m.decidedAt ? localDate(m.decidedAt) : "",
    m.decidedBy ?? "",
    m.note ?? "",
  ]);
  return [header, ...rows].map((row) => row.map(proCsvCell).join(";")).join("\n");
}

/* ------------------------------------------------------------------ */
/* Calendario del curso                                                */
/* ------------------------------------------------------------------ */

export type CalendarEntryKind = "publication" | "stop" | "deadline" | "activity";

export type CalendarEntry = {
  id: string;
  kind: CalendarEntryKind;
  /** YYYY-MM-DD. */
  date: string;
  /** Instante, si tiene hora. */
  at?: string;
  title: string;
  detail: string;
};

export function calendarEntries(data: ProData): CalendarEntry[] {
  const x = uniExtrasOf(data);
  const pubs = (data.uniPublications as UniPublication[]).map<CalendarEntry>((p) => ({
    id: p.id,
    kind: "publication",
    date: localDate(p.at),
    at: p.at,
    title: p.title,
    detail: p.status === "published" ? "Publicada" : p.status === "scheduled" ? "Programada" : "Borrador",
  }));
  const stops = stopsOf(data).map<CalendarEntry>((s) => ({
    id: s.id,
    kind: "stop",
    date: localDate(s.date),
    at: s.date,
    title: s.title,
    detail: s.place,
  }));
  const deadlines = x.deadlines.map<CalendarEntry>((d) => ({
    id: d.id,
    kind: "deadline",
    date: d.date,
    title: d.title,
    detail: DEADLINE_KIND_LABEL[d.kind],
  }));
  const activities = x.assocActivities.map<CalendarEntry>((a) => ({
    id: a.id,
    kind: "activity",
    date: localDate(a.start),
    at: a.start,
    title: a.title,
    detail: a.place,
  }));
  return [...deadlines, ...pubs, ...stops, ...activities].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.at ?? "").localeCompare(b.at ?? ""),
  );
}

/** Semanas (de lunes a domingo) que pintan el mes "YYYY-MM". */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  let cursor = addDays(first, -offset);
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
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Plazos de hoy en adelante, del más cercano al más lejano. */
export function upcomingDeadlines(deadlines: ProUniDeadline[], now: Date, days = 120): ProUniDeadline[] {
  const today = localDate(now);
  const limit = addDays(today, days);
  return deadlines.filter((d) => d.date >= today && d.date <= limit).sort((a, b) => a.date.localeCompare(b.date));
}

/** La publicación ya preparada para un plazo, si existe. */
export function publicationForDeadline(pubs: UniPublication[], deadlineId: string): UniPublication | undefined {
  return pubs.find((p) => p.deadlineId === deadlineId);
}

/* ------------------------------------------------------------------ */
/* Integración de primero                                              */
/* ------------------------------------------------------------------ */

/** A partir de esta parte de primero sin actividad, la facultad se marca. */
export const FIRST_YEAR_ALERT_SHARE = 45;

export type FacultyAlert = ProUniFacultyStat & { inactive: number; inactivePct: number };

/** Facultades con demasiado primero sin ninguna actividad. Siempre agregado. */
export function firstYearAlerts(stats: ProUniFacultyStat[], threshold = FIRST_YEAR_ALERT_SHARE): FacultyAlert[] {
  return stats
    .filter((s) => s.firstYear >= PRIVACY_MIN_GROUP)
    .map((s) => {
      const inactive = Math.max(0, s.firstYear - s.participated);
      return { ...s, inactive, inactivePct: pct(inactive, s.firstYear) };
    })
    .filter((s) => s.inactivePct >= threshold)
    .sort((a, b) => b.inactivePct - a.inactivePct);
}

/** Fecha del corte de mitad de octubre del curso que empieza en `courseStart`. */
export function octoberCheckpoint(courseStart: string): string {
  return `${courseStart.slice(0, 4)}-10-15`;
}

/* ------------------------------------------------------------------ */
/* Informe de temporada                                                */
/* ------------------------------------------------------------------ */

export type ReportSection = { title: string; rows: [string, string][] };

export type SeasonReport = {
  title: string;
  space: string;
  from: string;
  to: string;
  sections: ReportSection[];
  faculties: {
    faculty: string;
    firstYear: number | null;
    participated: number | null;
    association: number | null;
    active30: number | null;
  }[];
};

const n = (v: number) => v.toLocaleString("es-ES");
const euros = (cents: number) => `${n(Math.round(cents / 100))} €`;

/** Informe del curso hasta hoy, listo para CSV e impresión. */
export function buildSeasonReport(data: ProData, now: Date): SeasonReport {
  const x = uniExtrasOf(data);
  const to = localDate(now);
  const from = x.courseStart || addDays(to, -90);
  const inRange = (iso: string) => {
    const day = localDate(iso);
    return day >= from && day <= to;
  };

  const pubs = (data.uniPublications as UniPublication[]).filter((p) => p.status === "published" && inRange(p.at));
  const reach = pubs.reduce((a, p) => a + p.reach, 0);
  const withReads = pubs.filter((p) => p.readReceipt && p.reads?.length);
  const reads = withReads.reduce(
    (acc, p) => {
      const s = readSummary(p);
      return { audience: acc.audience + s.audience, read: acc.read + s.read };
    },
    { audience: 0, read: 0 },
  );

  const stops = stopsOf(data).filter((s) => inRange(s.date));
  const checkins = stops.reduce((a, s) => a + s.checkins, 0);
  const firstYear = x.faculties.reduce((a, f) => a + f.firstYear, 0);
  const participated = x.faculties.reduce((a, f) => a + f.participated, 0);

  const housing = data.uniHousing as UniHousing[];
  const verified = housing.filter((h) => h.status === "verified");
  const rooms = x.market.filter((r) => r.kind === "room");

  const assocs = data.uniAssociations as UniAssociation[];
  const validated = x.credits.filter((r) => r.status === "validated");

  const moderation = data.uniModeration as UniModeration[];
  const decided = moderation.filter((m) => m.status !== "pending");
  const response = medianResponseMinutes(moderation, now, 3650);

  const sections: ReportSection[] = [
    {
      title: "Comunicación",
      rows: [
        ["Publicaciones oficiales", n(pubs.length)],
        ["Visualizaciones", n(reach)],
        ["Alcance medio por publicación", n(pubs.length ? Math.round(reach / pubs.length) : 0)],
        ["Avisos con confirmación de lectura", n(withReads.length)],
        ["Leídos sobre los que lo recibieron", reads.audience ? `${pct(reads.read, reads.audience)} %` : "Sin datos"],
      ],
    },
    {
      title: "Bienvenida",
      rows: [
        ["Paradas del pasaporte", n(stops.length)],
        ["Check-ins", n(checkins)],
        ["Primero que ha ido a alguna parada", firstYear ? `${pct(participated, firstYear)} %` : "Sin datos"],
        ["Pasaportes completos", n(x.passport.completed)],
      ],
    },
    {
      title: "Alojamiento",
      rows: [
        ["Pisos con sello", n(verified.length)],
        ["Rechazados", n(housing.filter((h) => h.status === "rejected").length)],
        ["Quejas de inquilinos", n(housing.reduce((a, h) => a + h.complaints, 0))],
        ["Casos resueltos", n(housing.filter((h) => h.case?.status === "resolved").length)],
        ["Precio mediano de habitación verificada", rooms.length >= PRIVACY_MIN_GROUP ? euros(median(rooms.map((r) => r.priceCents))) : "Sin datos"],
      ],
    },
    {
      title: "Asociaciones",
      rows: [
        ["Registradas", n(assocs.filter((a) => a.registered).length)],
        ["Socios", n(assocs.filter((a) => a.registered).reduce((a, s) => a + s.members, 0))],
        ["Solicitudes de créditos validadas", n(validated.length)],
        ["Horas certificadas", n(validated.reduce((a, r) => a + r.hours, 0))],
      ],
    },
    {
      title: "Convivencia",
      rows: [
        ["Reportes revisados", n(decided.length)],
        ["Contenidos ocultados", n(decided.filter((m) => m.status === "hidden").length)],
        ["Pendientes", n(moderation.length - decided.length)],
        ["Mediana de respuesta", response === null ? "Sin datos" : response < 60 ? `${response} min` : `${Math.round(response / 60)} h`],
      ],
    },
  ];

  const faculties = x.faculties.map((f) => {
    const hide = f.firstYear < PRIVACY_MIN_GROUP;
    return {
      faculty: f.faculty,
      firstYear: hide ? null : f.firstYear,
      participated: hide ? null : pct(f.participated, f.firstYear),
      association: hide ? null : pct(f.joinedAssociation, f.firstYear),
      active30: hide ? null : pct(f.active30, f.firstYear),
    };
  });

  return { title: "Informe de temporada", space: data.space.name, from, to, sections, faculties };
}

export function seasonReportCsv(r: SeasonReport): string {
  const rows: string[][] = [[r.title, `${r.from} a ${r.to}`], [r.space, ""], []];
  for (const s of r.sections) {
    rows.push([s.title, ""]);
    for (const [label, value] of s.rows) rows.push([label, value]);
    rows.push([]);
  }
  rows.push(["Primero por facultad", "Estudiantes", "Han ido a la bienvenida", "En una asociación", "Activos a 30 días"]);
  for (const f of r.faculties) {
    rows.push(
      f.firstYear === null
        ? [f.faculty, "Menos de 10, oculto", "", "", ""]
        : [f.faculty, n(f.firstYear), `${f.participated} %`, `${f.association} %`, `${f.active30} %`],
    );
  }
  return rows.map((row) => row.map(proCsvCell).join(";")).join("\n");
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/**
 * Documento imprimible del informe. Es una hoja aparte (no la app) para que
 * salga limpia en papel o al guardar como PDF desde el navegador.
 */
export function seasonReportHtml(r: SeasonReport): string {
  const e = escapeHtml;
  const sections = r.sections
    .map(
      (s) => `<section><h2>${e(s.title)}</h2><table>${s.rows
        .map(([label, value]) => `<tr><td>${e(label)}</td><td class="v">${e(value)}</td></tr>`)
        .join("")}</table></section>`,
    )
    .join("");
  const faculties = r.faculties
    .map((f) =>
      f.firstYear === null
        ? `<tr><td>${e(f.faculty)}</td><td colspan="4" class="m">Menos de 10 personas, oculto</td></tr>`
        : `<tr><td>${e(f.faculty)}</td><td class="v">${e(n(f.firstYear))}</td><td class="v">${f.participated} %</td><td class="v">${f.association} %</td><td class="v">${f.active30} %</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${e(r.title)}, ${e(r.space)}</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#121019;margin:40px;max-width:760px}
h1{font-size:26px;margin:0}p.sub{color:#5b5868;margin:4px 0 28px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:#5b5868;margin:26px 0 8px}
table{width:100%;border-collapse:collapse}td,th{padding:7px 0;border-bottom:1px solid #e7e5ee;text-align:left}
th{font-size:12px;color:#5b5868;font-weight:600}.v{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}.m{color:#5b5868;text-align:right}
footer{margin-top:32px;font-size:12px;color:#5b5868}
</style></head><body>
<h1>${e(r.title)}</h1><p class="sub">${e(r.space)} · del ${e(r.from)} al ${e(r.to)}</p>
${sections}
<section><h2>Primero por facultad</h2><table><tr><th>Facultad</th><th class="v">Estudiantes</th><th class="v">Bienvenida</th><th class="v">Asociación</th><th class="v">Activos 30 días</th></tr>${faculties}</table></section>
<footer>Cifras agregadas. Los grupos de menos de 10 personas no se muestran.</footer>
</body></html>`;
}
