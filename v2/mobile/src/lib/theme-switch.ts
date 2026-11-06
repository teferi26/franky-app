// ─── Interruptor de tema: claro / oscuro / automático ────────────────────
// applyTheme() muta la paleta compartida (src/theme.ts); el root layout se
// suscribe aquí y fuerza un remount del árbol para repintar. La PREFERENCIA
// ('light'|'dark'|'auto') persiste en AsyncStorage; en 'auto' se resuelve con
// el esquema del sistema (Appearance) y se sigue en vivo.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { applyTheme, type ThemeMode } from '@/theme';

export type ThemePref = 'light' | 'dark' | 'franky' | 'auto';

const KEY = 'franky_theme';
// El tema FRANKY (violeta de marca) es el predeterminado: quien no haya
// elegido nada ve la app con la identidad de la marca. Claro/oscuro/auto
// siguen disponibles en el selector del perfil.
let pref: ThemePref = 'franky';
let resolved: ThemeMode = 'franky';
const listeners = new Set<(mode: ThemeMode) => void>();
let appearanceSub: { remove: () => void } | null = null;

function systemMode(): ThemeMode {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function apply(p: ThemePref) {
  resolved = p === 'auto' ? systemMode() : p;
  applyTheme(resolved);
  // Solo escuchamos al sistema mientras estamos en 'auto'.
  if (p === 'auto' && !appearanceSub) {
    appearanceSub = Appearance.addChangeListener(() => {
      if (pref !== 'auto') return;
      resolved = systemMode();
      applyTheme(resolved);
      for (const l of listeners) l(resolved);
    });
  } else if (p !== 'auto' && appearanceSub) {
    appearanceSub.remove();
    appearanceSub = null;
  }
}

/** Modo YA resuelto ('light'|'dark') que debe pintarse. */
export function getThemeMode(): ThemeMode {
  return resolved;
}

/** Preferencia elegida por el usuario ('light'|'dark'|'auto'). */
export function getThemePref(): ThemePref {
  return pref;
}

/** Carga la preferencia guardada y la aplica ANTES del primer render. */
export async function loadStoredTheme(): Promise<ThemeMode> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'franky' || stored === 'auto') pref = stored;
  } catch { /* sin storage: tema franky por defecto */ }
  apply(pref);
  return resolved;
}

export function setThemePref(p: ThemePref) {
  pref = p;
  apply(p);
  AsyncStorage.setItem(KEY, p).catch(() => {});
  for (const l of listeners) l(resolved);
}

// Compat: setThemeMode(light|dark) sigue funcionando (equivale a fijar la
// preferencia explícita). Lo usaba el interruptor anterior del perfil.
export function setThemeMode(mode: ThemeMode) {
  setThemePref(mode);
}

export function onThemeChange(listener: (mode: ThemeMode) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
