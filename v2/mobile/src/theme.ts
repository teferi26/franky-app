// ─── Tema Franky ───────────────────────────────────────────────────────────
// Sistema de diseño propio de la app: paleta de marca (violeta → magenta con
// un toque naranja), tipografía Outfit para todo lo que "habla" (títulos,
// botones, cifras) y la del sistema para el cuerpo, radios generosos y
// sombras suaves. Los tokens son los mismos que usa la web (globals.css), así
// que la app y la web se sienten el mismo producto.
//
// Modo oscuro: C y F son objetos MUTABLES compartidos por toda la app (los
// estilos son inline y se evalúan en cada render). applyTheme() sobrescribe
// sus valores in situ y el root layout fuerza un remount para repintar todo.
// El interruptor vive en el menú del perfil (src/lib/theme-switch.ts).

type Palette = {
  /** Fondo de pantalla. */
  bg: string;
  /** Superficie elevada (tarjetas, hojas). En claro es blanco puro. */
  surface: string;
  /** Superficie sutil (inputs, chips inactivos, bloques secundarios). */
  input: string;
  text: string;
  black: string;
  muted: string;
  border: string;
  borderLight: string;
  /** Color de acción principal. Se llama `blue` por herencia: hoy es el
   *  violeta Franky y TODO el kit lo usa como "acento". */
  blue: string;
  /** Texto e iconos sobre los fondos sólidos C.blue y C.accent2. */
  onAccent: string;
  /** Texto e iconos sobre fondos sólidos de estado. */
  onSuccess: string;
  onError: string;
  onWarm: string;
  /** Texto de error sobre superficies normales o tintadas. */
  errorText: string;
  /** Acento profundo para enlaces y textos sobre fondos claros. */
  blueDeep: string;
  /** Tinte muy suave del acento (fondos de píldoras, iconos en círculo). */
  accentSoft: string;
  /** Segundo color de marca (magenta), para degradados y detalles. */
  accent2: string;
  /** Tercer color de marca (naranja cálido), para avisos y rachas. */
  accent3: string;
  red: string;
  green: string;
  white: string;
  overlay: string;
  violetDeep: string;
  success: string;
  warning: string;
  error: string;
};

// Claro: blanco limpio con el violeta de marca como acción.
const LIGHT: Palette = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  input: '#F4F3F8',
  text: '#121019',
  black: '#000000',
  muted: '#6E6A7C',
  border: '#E6E4EC',
  borderLight: '#F0EEF4',
  blue: '#6D3DF0',
  onAccent: '#FFFFFF',
  onSuccess: '#241B33',
  onError: '#FFFFFF',
  onWarm: '#241B33',
  errorText: '#BE123C',
  blueDeep: '#4A24B3',
  accentSoft: '#F0ECFF',
  accent2: '#C026D3',
  accent3: '#DE8927',
  red: '#F43F5E',
  green: '#16A34A',
  white: '#FFFFFF',
  overlay: 'rgba(18,16,25,0.5)',
  violetDeep: '#6D3DF0',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#E11D48',
};

// Oscuro: azul-noche con velo violeta (igual que la web en oscuro), no el
// negro plano de las redes sociales.
const DARK: Palette = {
  bg: '#0F0E16',
  surface: '#16151F',
  input: '#1E1C29',
  text: '#F1EFF7',
  black: '#000000',
  muted: '#9490A6',
  border: '#27242F',
  borderLight: '#1F1D27',
  blue: '#9D7DFF',
  onAccent: '#241B33',
  onSuccess: '#241B33',
  onError: '#241B33',
  onWarm: '#241B33',
  errorText: '#FB7185',
  blueDeep: '#C4B5FD',
  accentSoft: '#221C3D',
  accent2: '#E879F9',
  accent3: '#F5B76A',
  red: '#FB7185',
  green: '#4ADE80',
  white: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.62)',
  violetDeep: '#9D7DFF',
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#FB7185',
};

// Franky (predeterminado): blanco con un velo violeta, contrastes AA
// comprobados. Es la identidad de la marca en pantalla.
const FRANKY: Palette = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  input: '#F5F4F9',
  text: '#121019',
  black: '#000000',
  muted: '#6E6A7C',
  border: '#E6E4EC',
  borderLight: '#F0EEF4',
  blue: '#6D3DF0',
  onAccent: '#FFFFFF',
  onSuccess: '#121019',
  onError: '#FFFFFF',
  onWarm: '#121019',
  errorText: '#BE123C',
  blueDeep: '#4A24B3',
  accentSoft: '#F0ECFF',
  accent2: '#C026D3',
  accent3: '#DE8927',
  red: '#F43F5E',
  green: '#12A150',
  white: '#FFFFFF',
  overlay: 'rgba(18,16,25,0.5)',
  violetDeep: '#6D3DF0',
  success: '#12A150',
  warning: '#DE8927',
  error: '#E11D48',
};

export type ThemeMode = 'light' | 'dark' | 'franky';

const PALETTES: Record<ThemeMode, Palette> = { light: LIGHT, dark: DARK, franky: FRANKY };

/** true si el modo pinta sobre fondo oscuro (para barras, iconos y overlays). */
export function isDarkMode(mode: ThemeMode): boolean {
  return mode === 'dark';
}

export const C: Palette = { ...FRANKY };

// ─── Marca ─────────────────────────────────────────────────────────────────
/** Degradado principal de la marca (botones, botón central, cabeceras). */
export const BRAND_GRADIENT = ['#6D3DF0', '#5B2FD8'] as const;
/** Pares de color para iniciales: conservan contraste incluso en avatares pequeños. */
export const AVATAR_COLORS = [
  { background: '#7C3AED', foreground: '#FFFFFF' },
  { background: '#C026D3', foreground: '#FFFFFF' },
  { background: '#DE8927', foreground: '#241B33' },
  { background: '#2563EB', foreground: '#FFFFFF' },
  { background: '#0F766E', foreground: '#FFFFFF' },
  { background: '#DB2777', foreground: '#FFFFFF' },
] as const;
/** Degradado cálido (rachas, logros, avisos positivos). */
export const WARM_GRADIENT = ['#F0A44E', '#E11D48'] as const;
/** Anillo de historias y avatares destacados: violeta → magenta → naranja. */
export const BRAND_RING = ['#8B5CF6', '#C026D3', '#F0A44E'] as const;
/** Alias histórico: algunas pantallas lo importaban con este nombre. */
export const IG_RING = BRAND_RING;

// ─── Tipografía ────────────────────────────────────────────────────────────
// Outfit (la del logotipo y los titulares de la web) para todo lo que tiene
// voz: títulos, botones, cifras, rótulos. El cuerpo va con la fuente del
// sistema (SF Pro / Roboto), que es la que mejor se lee en párrafos largos y
// la que esperan los usuarios de cada plataforma. Las fuentes se cargan en
// app/_layout.tsx (useFonts) y estos nombres son los que registra expo-font.
export const FONT = {
  display: 'Outfit_800ExtraBold',
  heading: 'Outfit_700Bold',
  semibold: 'Outfit_600SemiBold',
  medium: 'Outfit_500Medium',
} as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
// Radios generosos (los de la web): 8 / 12 / 16 / 24.
export const R = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

export const F = {
  /** Titular de pantalla o de sección grande. */
  h1: { fontSize: 26, fontFamily: FONT.heading, color: C.text, letterSpacing: -0.4 },
  /** Título de bloque. */
  h2: { fontSize: 17, fontFamily: FONT.heading, color: C.text, letterSpacing: -0.2 },
  /** Título de tarjeta o de fila. */
  h3: { fontSize: 15, fontFamily: FONT.semibold, color: C.text },
  /** Cifra grande (contadores, racha, nota media). */
  display: { fontSize: 34, fontFamily: FONT.display, color: C.text, letterSpacing: -1 },
  body: { fontSize: 15, color: C.text, lineHeight: 21 },
  small: { fontSize: 13, color: C.muted, lineHeight: 18 },
  tiny: { fontSize: 11.5, color: C.muted },
  /** Rótulo en mayúsculas pequeñas (encabezados de sección secundarios). */
  label: { fontSize: 11.5, fontFamily: FONT.semibold, color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  username: { fontSize: 14, fontFamily: FONT.semibold, color: C.text },
};

// ─── Sombras ───────────────────────────────────────────────────────────────
// Suaves y con el tinte de la marca (la web usa las mismas). En Android se
// traducen a `elevation`.
export const SHADOW = {
  card: {
    shadowColor: '#121019', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  float: {
    shadowColor: '#121019', shadowOpacity: 0.14, shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 }, elevation: 8,
  },
  glow: {
    shadowColor: '#6D3DF0', shadowOpacity: 0.32, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
} as const;

// eslint-disable-next-line prefer-const -- applyTheme lo reasigna (ver arriba)
export let hairline: { borderBottomWidth: number; borderBottomColor: string } = {
  borderBottomWidth: 0.5, borderBottomColor: C.border,
};

/** Sobrescribe C, F y hairline in situ con la paleta del modo elegido. */
export function applyTheme(mode: ThemeMode) {
  Object.assign(C, PALETTES[mode] ?? FRANKY);
  // React Native CONGELA los objetos de estilo que se pasan a un componente en
  // modo dev (Object.freeze) para detectar mutaciones. Por eso NO podemos hacer
  // F.h1.color = ... (petaría "attempted to set ... on a frozen object").
  // Reemplazamos cada sub-objeto por uno nuevo: el árbol se remonta al cambiar
  // de tema (key en _layout), así que los estilos se recalculan con estos.
  F.h1 = { ...F.h1, color: C.text };
  F.h2 = { ...F.h2, color: C.text };
  F.h3 = { ...F.h3, color: C.text };
  F.display = { ...F.display, color: C.text };
  F.body = { ...F.body, color: C.text };
  F.small = { ...F.small, color: C.muted };
  F.tiny = { ...F.tiny, color: C.muted };
  F.label = { ...F.label, color: C.muted };
  F.username = { ...F.username, color: C.text };
  hairline = { ...hairline, borderBottomColor: C.border };
}
