/**
 * Preferencia de tema, compartida por TODOS los selectores de la página.
 *
 * En la web hay tres sitios donde se puede cambiar el tema (la barra superior,
 * el menú de móvil y el pie), y cada uno montaba su propio `useState`. Al
 * cambiarlo en uno, el tema sí se aplicaba, pero los otros seguían marcando la
 * opción antigua: dos controles del mismo ajuste enseñando cosas distintas.
 *
 * Aquí la preferencia vive en el módulo, no en el componente: quien la cambia
 * avisa a todos los suscritos y todos se repintan a la vez. Espeja lo que ya
 * hacía la app móvil (mobile/src/lib/theme-switch.ts).
 *
 * Qué NO hace este módulo: resolver "automático". De eso se encarga el
 * `@media (prefers-color-scheme: dark)` de globals.css, sin JavaScript y sin
 * fogonazo al cargar. Aquí solo se escribe `data-theme` en <html> cuando la
 * persona elige claro u oscuro EN CONTRA de lo que dice su sistema.
 */
export const THEME_KEY = "franky_theme";

export type ThemePref = "light" | "dark" | "auto";

function isPref(value: unknown): value is ThemePref {
  return value === "light" || value === "dark" || value === "auto";
}

/** null = todavía no se ha leído (render del servidor y primera hidratación). */
let current: ThemePref | null = null;
const listeners = new Set<() => void>();

function readStored(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return isPref(raw) ? raw : "auto";
  } catch {
    // Incógnito estricto o almacenamiento bloqueado: se asume automático.
    return "auto";
  }
}

/** Escribe (o quita) `data-theme` en <html>. */
export function applyTheme(pref: ThemePref) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "auto") {
    // Se QUITA el atributo: así vuelve a mandar el media query del CSS, que es
    // quien resuelve "automático" de verdad y en vivo.
    root.removeAttribute("data-theme");
    root.style.colorScheme = "light dark";
    return;
  }
  root.setAttribute("data-theme", pref);
  root.style.colorScheme = pref;
}

/** Preferencia actual. La primera llamada en cliente la lee de localStorage. */
export function getTheme(): ThemePref | null {
  if (typeof window === "undefined") return null;
  if (current === null) current = readStored();
  return current;
}

/** Lo que ve el servidor: nunca conoce la preferencia del visitante. */
export function getServerTheme(): ThemePref | null {
  return null;
}

/** Cambia la preferencia, la guarda y avisa a todos los selectores. */
export function setTheme(pref: ThemePref) {
  current = pref;
  applyTheme(pref);
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Sin persistencia, pero el cambio de esta sesión sí se aplica.
  }
  for (const listener of listeners) listener();
}

/** Se suscribe a los cambios. Devuelve la función para darse de baja. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Vuelve a leer lo guardado y notifica si ha cambiado. Lo usa el arranque del
 * selector (por si `theme-boot` y la hidratación dejaron algo distinto) y el
 * evento `storage`, que es como llega un cambio hecho en OTRA pestaña.
 */
export function syncThemeFromStorage() {
  if (typeof window === "undefined") return;
  const stored = readStored();
  if (stored === current) {
    applyTheme(stored);
    return;
  }
  current = stored;
  applyTheme(stored);
  for (const listener of listeners) listener();
}
