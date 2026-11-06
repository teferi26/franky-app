export type CrushLiveGoal = "conocer" | "dejarse_llevar" | "relacion";
export type CrushLiveGender = "hombre" | "mujer" | "no_binario";
export type CrushLiveAction = "like" | "pass";
export const CRUSH_LIVE_STATE_REASONS = [
  "event_not_found",
  "not_official",
  "disabled",
  "event_closed",
  "not_participant",
  "student_verification_required",
  "age_required",
  "missing_gender",
  "profile_unavailable",
  "photo_required",
] as const;
export type CrushLiveStateReason =
  (typeof CRUSH_LIVE_STATE_REASONS)[number];
export type CrushLiveAnswerKey =
  | "social_energy"
  | "spontaneity"
  | "communication"
  | "affection"
  | "schedule";

export type CrushLiveAnswers = Record<CrushLiveAnswerKey, number>;

export interface CrushLiveEvent {
  id: string;
  title: string;
  image_url: string | null;
  start_date: string;
  end_date: string | null;
  status: string | null;
  enrolled?: boolean;
}

export interface CrushLiveProfile {
  active: boolean;
  goal: CrushLiveGoal | null;
  preferred_genders: CrushLiveGender[];
  age_min: number;
  age_max: number;
  answers: CrushLiveAnswers | null;
}

export interface CrushLiveState {
  event: CrushLiveEvent | null;
  available: boolean;
  reason: CrushLiveStateReason | null;
  participant: boolean;
  eligible: boolean;
  age: number | null;
  student_verified: boolean;
  profile: CrushLiveProfile | null;
}

export interface CrushLiveCandidate {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  photos: string[] | null;
  age: number | null;
  career: string | null;
  bio: string | null;
  interests: string[] | null;
  compatibility: number;
  compatibility_reasons: string[];
}

export interface CrushLiveMatch {
  id: string;
  user: Pick<
    CrushLiveCandidate,
    "id" | "full_name" | "avatar_url" | "photos" | "age" | "career"
  >;
  event: Pick<CrushLiveEvent, "id" | "title">;
  compatibility: number;
  compatibility_reasons: string[];
  matched_at: string;
  conversation_id: string | null;
}

export interface CrushLiveSwipeResult {
  match: boolean;
  match_id: string | null;
  conversation_id: string | null;
  compatibility: number | null;
  compatibility_reasons: string[];
}

export interface CrushLiveProfileDraft {
  goal: CrushLiveGoal | null;
  preferredGenders: CrushLiveGender[];
  ageMin: number;
  ageMax: number;
  answers: CrushLiveAnswers;
}

export const GOAL_OPTIONS: Array<{
  value: CrushLiveGoal;
  label: string;
  description: string;
}> = [
  {
    value: "conocer",
    label: "Conocer gente",
    description: "Charlar, bailar y ver qué surge.",
  },
  {
    value: "dejarse_llevar",
    label: "Dejarme llevar",
    description: "Sin etiquetas ni expectativas cerradas.",
  },
  {
    value: "relacion",
    label: "Algo serio",
    description: "Con intención de construir una relación.",
  },
];

export const GENDER_OPTIONS: Array<{
  value: CrushLiveGender;
  label: string;
}> = [
  { value: "mujer", label: "Mujeres" },
  { value: "hombre", label: "Hombres" },
  { value: "no_binario", label: "Personas no binarias" },
];

export const ANSWER_QUESTIONS: Array<{
  key: CrushLiveAnswerKey;
  question: string;
  low: string;
  high: string;
}> = [
  {
    key: "social_energy",
    question: "¿Cómo disfrutas más de un evento?",
    low: "Con poca gente",
    high: "Cuanta más, mejor",
  },
  {
    key: "spontaneity",
    question: "¿Cuánto te gusta improvisar?",
    low: "Plan cerrado",
    high: "Sobre la marcha",
  },
  {
    key: "communication",
    question: "¿Cómo sueles comunicarte?",
    low: "Voy poco a poco",
    high: "Directo y claro",
  },
  {
    key: "affection",
    question: "¿Cómo muestras que alguien te interesa?",
    low: "Con calma",
    high: "Muy expresivo",
  },
  {
    key: "schedule",
    question: "¿Cuál es más tu ritmo?",
    low: "De día",
    high: "Nocturno",
  },
];

export const EMPTY_ANSWERS: CrushLiveAnswers = {
  social_energy: 3,
  spontaneity: 3,
  communication: 3,
  affection: 3,
  schedule: 3,
};

export function profileToDraft(
  profile: CrushLiveProfile | null
): CrushLiveProfileDraft {
  return {
    goal: profile?.goal ?? null,
    preferredGenders: profile?.preferred_genders ?? [],
    ageMin: profile?.age_min ?? 18,
    ageMax: profile?.age_max ?? 35,
    answers: profile?.answers ?? { ...EMPTY_ANSWERS },
  };
}

export function validateProfileDraft(
  draft: CrushLiveProfileDraft,
  consented: boolean
): string | null {
  if (!draft.goal) return "Elige qué buscas en este evento.";
  if (draft.preferredGenders.length === 0) {
    return "Elige a quién te gustaría conocer.";
  }
  if (
    !Number.isInteger(draft.ageMin) ||
    !Number.isInteger(draft.ageMax) ||
    draft.ageMin < 18 ||
    draft.ageMax > 99 ||
    draft.ageMin > draft.ageMax
  ) {
    return "Revisa el rango de edad: debe estar entre 18 y 99 años.";
  }
  if (
    ANSWER_QUESTIONS.some(
      ({ key }) =>
        !Number.isInteger(draft.answers[key]) ||
        draft.answers[key] < 1 ||
        draft.answers[key] > 5
    )
  ) {
    return "Responde las cinco preguntas de afinidad.";
  }
  if (!consented) {
    return "Confirma que quieres aparecer en Crush Live para este evento.";
  }
  return null;
}

export interface StatePresentation {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function statePresentation(
  reason: CrushLiveStateReason | null,
  eventId: string | null
): StatePresentation {
  switch (reason) {
    case "not_participant":
      return {
        title: "Solo para asistentes",
        description:
          "Apúntate o consigue tu entrada para entrar en el Live de este evento.",
        ctaLabel: "Ver evento",
        ctaHref: eventId ? `/eventos/${eventId}` : "/eventos",
      };
    case "student_verification_required":
      return {
        title: "Verifica que eres estudiante",
        description:
          "Crush Live es un espacio entre estudiantes verificados de Franky.",
        ctaLabel: "Verificar mi correo",
        ctaHref: "/perfil/verificar-estudiante",
      };
    case "age_required":
      return {
        title: "Crush Live es solo para mayores de 18",
        description:
          "La edad se calcula con la fecha de nacimiento de tu perfil.",
        ctaLabel: "Revisar mi perfil",
        ctaHref: "/perfil",
      };
    case "missing_gender":
      return {
        title: "Completa cómo apareces",
        description:
          "Necesitamos este dato para respetar las preferencias de todas las personas.",
        ctaLabel: "Completar mi perfil",
        ctaHref: "/perfil",
      };
    case "photo_required":
      return {
        title: "Añade una foto para entrar",
        description:
          "En Live todas las personas se muestran con una foto real de su perfil.",
        ctaLabel: "Añadir foto",
        ctaHref: "/perfil",
      };
    case "profile_unavailable":
      return {
        title: "No puedes usar Live ahora",
        description:
          "Tu perfil no está disponible. Revisa tu cuenta o contacta con soporte si crees que es un error.",
        ctaLabel: "Ir a mi perfil",
        ctaHref: "/perfil",
      };
    case "event_closed":
      return {
        title: "Este Live ha terminado",
        description: "Tus matches siguen guardados en el historial.",
      };
    case "not_official":
    case "disabled":
      return {
        title: "Live no está disponible en este evento",
        description:
          "Crush Live solo se activa en eventos oficiales seleccionados por Franky.",
        ctaLabel: "Ver eventos",
        ctaHref: "/eventos",
      };
    case "event_not_found":
      return {
        title: "No encontramos este evento",
        description: "Puede que el enlace haya caducado o que el evento ya no exista.",
        ctaLabel: "Ver eventos",
        ctaHref: "/eventos",
      };
    default:
      return {
        title: "Crush Live no está disponible",
        description: "Prueba con otro evento oficial de Franky.",
        ctaLabel: "Ver eventos",
        ctaHref: "/eventos",
      };
  }
}

export function candidatePhotos(candidate: CrushLiveCandidate): string[] {
  const photos = (candidate.photos ?? []).filter(Boolean);
  if (photos.length > 0) return photos;
  return candidate.avatar_url ? [candidate.avatar_url] : [];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * El eventId llega por la URL y cualquiera puede escribir lo que quiera.
 * Postgres rechaza un UUID mal formado con un error de sintaxis que no es
 * un token de negocio: lo tratamos como "evento no encontrado" antes de
 * llamar, en vez de enseñar un "reintentar" que nunca va a funcionar.
 */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Familias de error que devuelve crush_live_swipe. Cada una implica una
 * reacción distinta en la interfaz, por eso se clasifican aquí (testeable)
 * y no con cadenas sueltas dentro del componente.
 *
 * - stale: la clave es anterior a una nueva alta; hay que soltarla y recargar.
 * - conflict: la clave se reutilizó con otros datos; soltarla y reintentar.
 * - target_gone: la persona ya no es candidata (o ya se decidió); retirar
 *   solo esa tarjeta y no consumir la siguiente.
 * - access_changed: el evento cerró, dejó de participar, etc.; recomprobar.
 * - rate_limited: esperar; la clave sigue siendo válida.
 * - auth: la sesión caducó.
 * - network: la petición no llegó; la tarjeta vuelve a su sitio.
 * - unknown: cualquier otra cosa; misma reacción que network.
 */
export type SwipeErrorKind =
  | "stale"
  | "conflict"
  | "target_gone"
  | "access_changed"
  | "rate_limited"
  | "auth"
  | "network"
  | "unknown";

export function classifySwipeError(message: string | undefined): SwipeErrorKind {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("idempotency_stale")) return "stale";
  if (normalized.includes("idempotency_conflict")) return "conflict";
  if (
    normalized.includes("target_not_available") ||
    normalized.includes("swipe_already_decided") ||
    normalized.includes("invalid_target")
  ) {
    return "target_gone";
  }
  if (
    normalized.includes("event_not_found") ||
    normalized.includes("event_closed") ||
    normalized.includes("crush_live_unavailable") ||
    normalized.includes("not_participant") ||
    normalized.includes("profile_not_eligible") ||
    normalized.includes("crush_live_opt_in_required")
  ) {
    return "access_changed";
  }
  if (normalized.includes("rate_limit_exceeded")) return "rate_limited";
  if (normalized.includes("auth_required") || normalized.includes("jwt")) {
    return "auth";
  }
  if (isNetworkError(normalized)) return "network";
  return "unknown";
}

function isNetworkError(normalized: string): boolean {
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed") ||
    normalized.includes("load failed") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch failed")
  );
}

/**
 * Traduce el token que lanza el backend a una frase en castellano. Nunca
 * enseñamos el mensaje crudo de Postgres: no ayuda y filtra nombres internos.
 * `fallback` se usa cuando el error no es ninguno de los conocidos; si además
 * huele a red, se añade la pista de la conexión.
 */
export function rpcErrorCopy(
  message: string | undefined,
  fallback: string
): string {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("auth_required") || normalized.includes("jwt")) {
    return "Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.";
  }
  if (normalized.includes("rate_limit_exceeded")) {
    return "Has hecho muchas acciones seguidas. Espera un momento y vuelve a intentarlo.";
  }
  if (
    normalized.includes("event_closed") ||
    normalized.includes("crush_live_unavailable")
  ) {
    return "Este Live ya no está disponible. Tus matches siguen guardados.";
  }
  if (normalized.includes("event_not_found")) {
    return "No encontramos este evento. Puede que el enlace haya caducado.";
  }
  if (normalized.includes("not_participant")) {
    return "Tu inscripción o entrada ya no da acceso a este Live.";
  }
  if (
    normalized.includes("profile_not_eligible") ||
    normalized.includes("crush_live_opt_in_required")
  ) {
    return "Tu perfil Live ha cambiado. Revísalo antes de continuar.";
  }
  if (normalized.includes("invalid_age_range")) {
    return "Revisa el rango de edad: debe estar entre 18 y 99 años.";
  }
  if (normalized.includes("invalid_preferred_genders")) {
    return "Elige a quién te gustaría conocer.";
  }
  if (normalized.includes("invalid_goal")) {
    return "Elige qué buscas en este evento.";
  }
  if (normalized.includes("invalid_answers")) {
    return "Responde las cinco preguntas de afinidad.";
  }
  if (
    normalized.includes("target_not_available") ||
    normalized.includes("swipe_already_decided")
  ) {
    return "Esta persona ya no está disponible. Puedes continuar con el siguiente perfil.";
  }
  if (isNetworkError(normalized)) {
    return `${fallback} Revisa también tu conexión.`;
  }
  return fallback;
}

/** Nombre corto de la acción, para mensajes del tipo "Repite Me gusta". */
export function actionLabel(action: CrushLiveAction): string {
  return action === "like" ? "Me gusta" : "Paso";
}
