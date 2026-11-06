// ─── Preferencias de notificaciones (profiles.push_prefs, migración 125) ─
// MISMA estructura de datos que la app móvil (mobile/app/ajustes-notificaciones.tsx)
// y que lee /api/internal/notify-push antes de mandar cada push:
//   {}                      = todo activo
//   { all: false }          = silenciarlo todo
//   { messages: false, … }  = una categoría a false la silencia
//   { dnd: true, dnd_from: "23:00", dnd_to: "08:00" } = franja "No molestar"
//     (hora de Madrid; puede cruzar la medianoche)
// Web y móvil escriben en el mismo JSONB, así que un cambio en uno se ve en
// el otro. Aquí no se inventa ninguna clave nueva a propósito.

export const PUSH_CATEGORIES = [
  { key: "messages", label: "Mensajes", note: "Chats nuevos y respuestas" },
  { key: "crush", label: "Crush y likes", note: "Matches, crushes y me gusta" },
  { key: "comments", label: "Comentarios", note: "Respuestas a tus publicaciones" },
  { key: "follows", label: "Publicaciones de seguidos", note: "Cuando alguien a quien sigues publica" },
  { key: "news", label: "Novedades", note: "Nuevas publicaciones de Franky" },
  { key: "housing", label: "Pisos en tu zona", note: "Nuevos alojamientos de la provincia que buscas" },
  { key: "events", label: "Eventos y planes", note: "Actividades que te pueden interesar" },
] as const;

export type PushCategoryKey = (typeof PUSH_CATEGORIES)[number]["key"];

/** push_prefs mezcla booleanos (categorías, all, dnd) y strings (franja "HH:MM"). */
export type PushPrefs = Record<string, boolean | string>;

export const DND_DEFAULT_FROM = "23:00";
export const DND_DEFAULT_TO = "08:00";

const HHMM = /^\d{1,2}:\d{2}$/;

/** Normaliza lo que venga de la BD a un objeto plano; cualquier cosa rara = {}. */
export function parsePushPrefs(raw: unknown): PushPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PushPrefs = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean" || typeof v === "string") out[k] = v;
  }
  return out;
}

export function isAllOn(prefs: PushPrefs): boolean {
  return prefs.all !== false;
}

export function isCategoryOn(prefs: PushPrefs, key: PushCategoryKey): boolean {
  return isAllOn(prefs) && prefs[key] !== false;
}

export function isDndOn(prefs: PushPrefs): boolean {
  return prefs.dnd === true;
}

export function dndFrom(prefs: PushPrefs): string {
  const v = prefs.dnd_from;
  return typeof v === "string" && isValidHHMM(v) ? v.padStart(5, "0") : DND_DEFAULT_FROM;
}

export function dndTo(prefs: PushPrefs): string {
  const v = prefs.dnd_to;
  return typeof v === "string" && isValidHHMM(v) ? v.padStart(5, "0") : DND_DEFAULT_TO;
}

/** Acepta solo "HH:MM" válido (lo que da un <input type="time">). */
export function isValidHHMM(v: string): boolean {
  if (!HHMM.test(v)) return false;
  const [h, m] = v.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}
