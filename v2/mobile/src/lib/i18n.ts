// ─── i18n: ESPAÑOL por defecto, inglés como segundo idioma ────────────────
// Mismo patrón de suscripción que theme-switch.ts (léelo ahí, es idéntico):
// la PREFERENCIA ('auto'|'es'|'en') persiste en AsyncStorage; en 'auto' se
// resuelve con el idioma del dispositivo (expo-localization) y Franky es una
// app española, así que CUALQUIER idioma del móvil que no sea inglés cae a
// español (no solo variantes de 'es'). Un cambio en caliente notifica a los
// listeners para que el root layout pueda remontar el árbol (key), igual que
// hace con el tema.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';
import es from '@/locales/es';
import en from '@/locales/en';

export type LocalePref = 'auto' | 'es' | 'en';
export type Locale = 'es' | 'en';

const KEY = 'franky_locale';

// enableFallback + defaultLocale 'es': una clave que falte en inglés cae al
// español en vez de enseñar la clave cruda (p. ej. "perfil.title").
const i18n = new I18n({ es, en });
i18n.defaultLocale = 'es';
i18n.enableFallback = true;

let pref: LocalePref = 'auto';
let resolved: Locale = 'es';
const listeners = new Set<(locale: Locale) => void>();

// Idioma del sistema resuelto a los dos que soporta Franky: inglés si el
// dispositivo está en inglés, español para CUALQUIER OTRO idioma.
function systemLocale(): Locale {
  const code = Localization.getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'es';
}

function apply(p: LocalePref) {
  resolved = p === 'auto' ? systemLocale() : p;
  i18n.locale = resolved;
}

// Resolvemos ya al cargar el módulo (síncrono, expo-localization no es
// async) para que el primer render tenga algo razonable antes incluso de que
// loadStoredLocale() termine de leer AsyncStorage.
apply(pref);

/** Idioma YA resuelto ('es'|'en') que debe pintarse. */
export function getLocale(): Locale {
  return resolved;
}

/** Preferencia elegida por el usuario ('auto'|'es'|'en'). */
export function getLocalePref(): LocalePref {
  return pref;
}

/** Carga la preferencia guardada y la aplica ANTES del primer render. */
export async function loadStoredLocale(): Promise<Locale> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored === 'es' || stored === 'en' || stored === 'auto') pref = stored;
  } catch { /* sin storage: español por defecto */ }
  apply(pref);
  return resolved;
}

export function setLocalePref(p: LocalePref) {
  pref = p;
  apply(p);
  AsyncStorage.setItem(KEY, p).catch(() => {});
  for (const l of listeners) l(resolved);
}

export function onLocaleChange(listener: (locale: Locale) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Traduce con interpolación (%{parametro}) y, para plurales, pásale
// { count } y usa en el diccionario la forma { one: '...', other: '...' }
// (mismas claves para español e inglés: la regla one/other de i18n-js
// también encaja con el plural del español, así que no hace falta registrar
// un pluralizador propio).
export function t(key: string, params?: Record<string, string | number>): string {
  return i18n.t(key, params);
}

// ─── Qué queda por hacer en la siguiente pasada ───────────────────────────
// Esta ronda solo traduce: app/welcome.tsx, app/(tabs)/feed.tsx,
// app/(tabs)/chats.tsx, app/(tabs)/perfil.tsx y la pantalla nueva
// app/ajustes-idioma.tsx. TODO EL RESTO de app/**/*.tsx sigue en español
// literal (becas.tsx, pisos.tsx, eventos.tsx, crear-evento.tsx, chat/[id].tsx,
// notificaciones.tsx, comunidades.tsx, mercado.tsx, apuntes.tsx, ajustes-*,
// onboarding-*, y toda app/(tabs)/crush.tsx, explorar.tsx, eventos.tsx...).
// Además, app/_layout.tsx y app/(tabs)/_layout.tsx (root layout y tab bar)
// NO se han tocado: todavía no hay un `key` de remount por idioma como el que
// ya existe para el tema (ver theme-switch.ts + app/_layout.tsx), así que
// onLocaleChange() está listo pero nadie lo consume aún. La siguiente pasada
// debería: 1) suscribir el root layout a onLocaleChange con loadStoredLocale()
// igual que hace con loadStoredTheme(), remontando el árbol con una key que
// combine tema+idioma; 2) traducir el resto de pantallas reutilizando estas
// mismas claves de "common" cuando encajen; 3) dar rótulo real a "tabs" en
// app/(tabs)/_layout.tsx.
