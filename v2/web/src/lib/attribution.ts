// First-touch attribution para tráfico de redes sociales.
// Captura UTMs + referrer al primer aterrizaje y los persiste en localStorage.
// Cuando el usuario hace signup, se inyectan en auth metadata (email) o en
// una cookie efímera (OAuth) que lee el callback del servidor.

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  signup_referrer?: string;
  signup_landing_path?: string;
};

const STORAGE_KEY = "franky_attribution";
const COOKIE_NAME = "franky_attribution";
// Cookie que deja middleware.ts al entrar por un link corto de embajador
// (/tafa, /pau, /new): la atribución viaja aquí en vez de en utm_* de la URL.
const LANDING_COOKIE = "franky_landing_utm";
const STORAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const COOKIE_TTL_S = 60 * 60; // 1 hora — suficiente para round-trip OAuth

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

type StoredAttribution = { capturedAt: number; data: Attribution };

const isBrowser = () => typeof window !== "undefined";

function readStored(): StoredAttribution | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed?.capturedAt || Date.now() - parsed.capturedAt > STORAGE_TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(data: Attribution) {
  if (!isBrowser()) return;
  try {
    const payload: StoredAttribution = { capturedAt: Date.now(), data };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage puede fallar en modo incógnito estricto; ignoramos.
  }
}

// Indica si una attribution tiene alguna señal de campaña (utm_* o ref->qr).
function hasCampaignSignal(data: Attribution): boolean {
  return UTM_PARAMS.some((key) => Boolean(data[key]));
}

// Lee la cookie de link corto de embajador que dejó el middleware.
function readLandingCookie(): Attribution | null {
  if (!isBrowser()) return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LANDING_COOKIE}=([^;]+)`)
  );
  if (!match) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as Record<string, string>;
    const out: Attribution = {};
    for (const key of UTM_PARAMS) {
      if (parsed[key]) out[key] = String(parsed[key]).slice(0, 200);
    }
    if (parsed.signup_landing_path) {
      out.signup_landing_path = String(parsed.signup_landing_path).slice(0, 500);
    }
    return hasCampaignSignal(out) ? out : null;
  } catch {
    return null;
  }
}

function clearLandingCookie() {
  if (!isBrowser()) return;
  document.cookie = `${LANDING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

// First-touch: si ya hay attribution guardada (y vigente) con señal de campaña,
// no la sobrescribe. Pero si la guardada solo tiene referrer (sin ningún utm) y
// esta visita trae utm_*/ref explícitos, deja que la campaña gane: un usuario que
// aterrizó antes en /login y vuelve por un QR no debe perder la atribución.
// Captura desde la URL actual + document.referrer (si es de fuera del dominio).
export function captureFromUrlIfFirstTouch() {
  if (!isBrowser()) return;

  const url = new URL(window.location.href);
  const data: Attribution = {};

  for (const key of UTM_PARAMS) {
    const value = url.searchParams.get(key);
    if (value) data[key] = value.slice(0, 200);
  }

  // Carteles QR: ?ref=<campaña>. Si no llegó utm_source, marcamos la fuente
  // como "qr" y guardamos el ref como campaña.
  const ref = url.searchParams.get("ref");
  if (ref && !data.utm_source) {
    data.utm_source = "qr";
    data.utm_campaign = ref.slice(0, 200);
  }

  // Links cortos de embajador (/tafa, /pau, /new): la atribución llega en la
  // cookie del middleware, no en la URL. Solo cuenta si la URL no trae una
  // campaña propia (la URL siempre manda). Se consume una única vez.
  if (!hasCampaignSignal(data)) {
    const fromCookie = readLandingCookie();
    if (fromCookie) {
      Object.assign(data, fromCookie);
      clearLandingCookie();
    }
  }

  const stored = readStored();
  if (stored) {
    // Solo se permite sobrescribir si lo guardado no tiene campaña y esta
    // visita sí: en cualquier otro caso, el first-touch existente manda.
    if (hasCampaignSignal(stored.data) || !hasCampaignSignal(data)) return;
  }

  const referrer = document.referrer;
  if (referrer) {
    try {
      const refUrl = new URL(referrer);
      if (refUrl.host !== window.location.host) {
        data.signup_referrer = referrer.slice(0, 500);
      }
    } catch {
      // referrer no parseable; ignoramos
    }
  }

  // Si no hay ni un UTM ni referrer externo, no creamos attribution vacía.
  if (Object.keys(data).length === 0) return;

  // La cookie del link corto ya trae el landing real (/tafa, /pau, /new);
  // si no, se usa la URL actual.
  if (!data.signup_landing_path) {
    data.signup_landing_path = (url.pathname + url.search).slice(0, 500);
  }
  writeStored(data);
}

function getStoredAttribution(): Attribution | null {
  return readStored()?.data ?? null;
}

// Para `supabase.auth.signUp({ options: { data } })`.
// Devuelve solo strings no vacías (Supabase guarda esto en raw_user_meta_data).
export function attributionAsAuthMetadata(): Record<string, string> {
  const data = getStoredAttribution();
  if (!data) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v) out[k] = v;
  }
  return out;
}

// Reinyecta los UTMs del first-touch en una URL. Se usa al saltar del webview
// de una app (Instagram/TikTok) al navegador real: el navegador NO comparte
// localStorage con el webview, así que sin arrastrar los UTMs en la URL el
// lead llegaría al navegador sin atribución (adiós al conteo del embajador).
export function appendAttributionToUrl(url: string): string {
  const data = getStoredAttribution();
  if (!data) return url;
  try {
    const u = new URL(url, isBrowser() ? window.location.href : undefined);
    if (u.searchParams.get("utm_source")) return url; // la URL ya trae campaña
    let added = false;
    for (const key of UTM_PARAMS) {
      const value = data[key];
      if (value) {
        u.searchParams.set(key, value);
        added = true;
      }
    }
    return added ? u.toString() : url;
  } catch {
    return url;
  }
}

// Para el flujo OAuth: escribimos la attribution en una cookie corta
// que el callback server pueda leer tras la redirección del proveedor.
export function writeAttributionCookie() {
  if (!isBrowser()) return;
  const data = getStoredAttribution();
  if (!data) return;
  try {
    const encoded = encodeURIComponent(JSON.stringify(data));
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAME}=${encoded}; Path=/; Max-Age=${COOKIE_TTL_S}; SameSite=Lax${secure}`;
  } catch {
    // ignoramos errores de cookie
  }
}
