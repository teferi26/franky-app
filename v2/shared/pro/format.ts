/** Formatos de Franky Pro. Todo en es-ES y hora de Europe/Madrid. */

const TZ = "Europe/Madrid";

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});
const eurRound = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function money(cents: number, opts: { round?: boolean } = {}): string {
  const value = cents / 100;
  if (opts.round || Number.isInteger(value)) return eurRound.format(value);
  return eur.format(value);
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function dayLabel(
  iso: string,
  opts: { weekday?: boolean } = { weekday: true },
): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    weekday: opts.weekday ? "long" : undefined,
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });
}

export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
}

/** "hace 5 min", "hace 3 h", "ayer", "12 sept". */
export function relative(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return future ? `en ${min} min` : `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return future ? `en ${h} h` : `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return future ? "mañana" : "ayer";
  if (d < 7) return future ? `en ${d} días` : `hace ${d} días`;
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
}

// Crear un Intl.DateTimeFormat es caro (decenas de microsegundos) y las
// agendas llaman a estas funciones cientos de miles de veces por pintado. Se
// crean una vez y los resultados de cada instante se recuerdan.
const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const MINUTE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateCache = new Map<string, string>();
const minuteCache = new Map<string, number>();
const CACHE_LIMIT = 20000;

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, value);
  return value;
}

/** Fecha local YYYY-MM-DD de un instante. */
export function localDate(iso: string | Date): string {
  if (typeof iso === "string") {
    const hit = dateCache.get(iso);
    if (hit !== undefined) return hit;
    return remember(dateCache, iso, DATE_FMT.format(new Date(iso)));
  }
  return DATE_FMT.format(iso);
}

/** Minutos desde la medianoche local de un instante. */
export function localMinutes(iso: string | Date): number {
  if (typeof iso === "string") {
    const hit = minuteCache.get(iso);
    if (hit !== undefined) return hit;
  }
  const [h, m] = MINUTE_FMT.format(
    typeof iso === "string" ? new Date(iso) : iso,
  )
    .split(":")
    .map(Number);
  const value = h * 60 + m;
  return typeof iso === "string" ? remember(minuteCache, iso, value) : value;
}

/** Instante ISO para una fecha local (YYYY-MM-DD) y unos minutos desde medianoche. */
export function atLocal(date: string, minutes: number): string {
  // La hora local tratada como si fuera UTC; después se resta el desfase de
  // Madrid EN ESE INSTANTE. Se comprueba dos veces porque los días de cambio
  // de hora (marzo y octubre) el desfase de la medianoche no es el de la tarde.
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d) + minutes * 60000;
  let instant = wall - madridOffsetMinutes(wall) * 60000;
  const second = madridOffsetMinutes(instant);
  instant = wall - second * 60000;
  return new Date(instant).toISOString();
}

const offsetCache = new Map<number, number>();

/** Minutos que Madrid va por delante de UTC en un instante (60 en invierno, 120 en verano). */
function madridOffsetMinutes(ms: number): number {
  // Los cambios de hora ocurren en horas en punto: basta con cachear por hora.
  const key = Math.floor(ms / 3600000);
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;
  const at = new Date(key * 3600000);
  const [yy, mm, dd] = DATE_FMT.format(at).split("-").map(Number);
  const [hh, mi] = MINUTE_FMT.format(at).split(":").map(Number);
  const value = Math.round(
    (Date.UTC(yy, mm - 1, dd, hh, mi) - at.getTime()) / 60000,
  );
  if (offsetCache.size > 5000) offsetCache.clear();
  offsetCache.set(key, value);
  return value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = lunes ... 6 = domingo, para una fecha local. */
export function weekdayIndex(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

export function todayLocal(): string {
  return localDate(new Date());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function greeting(now = new Date()): string {
  const m = localMinutes(now);
  if (m < 13 * 60 + 30) return "Buenos días";
  if (m < 20 * 60 + 30) return "Buenas tardes";
  return "Buenas noches";
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;
}

/** Primera letra en mayúscula ("jueves, 24 de septiembre" → "Jueves, 24 de septiembre"). */
export function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
