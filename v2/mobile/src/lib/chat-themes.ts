// ─── Temas del chat (paridad con web/src/app/chats/client.tsx) ───────────
// Mismos 5 temas que la web (franky/medianoche/ocaso/menta/clasico) adaptados
// a estilos de React Native: el wallpaper CSS `linear-gradient(...)` se
// convierte en un array de colores para expo-linear-gradient, y las burbujas
// llevan colores planos + degradado para la burbuja propia. El tema es una
// elección PERSONAL por conversación (AsyncStorage), con un valor global como
// fallback: así el último tema elegido se hereda en chats nuevos, igual que
// hace la web con localStorage.
//
// Los iconos de cada tema (para la hoja de selección) viven en la pantalla
// del chat: aquí solo hay datos, sin dependencias de UI.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ChatThemeId = 'franky' | 'medianoche' | 'ocaso' | 'menta' | 'clasico';

export type ChatTheme = {
  id: ChatThemeId;
  label: string;
  /** Una línea que explica el tema en la hoja de selección. */
  hint: string;
  /** Colores del fondo del área de mensajes (2-3 paradas del degradado web). */
  wallpaper: [string, string, ...string[]];
  /** Degradado de la burbuja propia (violeta Franky en el tema por defecto). */
  bubbleMine: [string, string, ...string[]];
  bubbleMineText: string;
  /** Burbuja ajena: clara sobre wallpapers claros, oscura en medianoche. */
  bubbleOther: string;
  bubbleOtherText: string;
  /** Texto secundario legible SOBRE el wallpaper (separadores, sistema). */
  mutedOnWallpaper: string;
  /** true si el wallpaper es oscuro (para spinners/placeholder de imagen). */
  dark: boolean;
};

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: 'franky', label: 'Franky', hint: 'El violeta de la marca',
    wallpaper: ['#faf7ff', '#f1eaff', '#ede4ff'],
    bubbleMine: ['#8b5cf6', '#a855f7', '#c026d3'],
    bubbleMineText: '#ffffff',
    bubbleOther: '#ffffff',
    bubbleOtherText: '#231a33',
    mutedOnWallpaper: '#75688f',
    dark: false,
  },
  {
    id: 'medianoche', label: 'Medianoche', hint: 'Oscuro, para la noche',
    wallpaper: ['#0d0817', '#171028', '#1d1233'],
    bubbleMine: ['#7c3aed', '#9333ea'],
    bubbleMineText: '#ffffff',
    bubbleOther: '#251c3d',
    bubbleOtherText: '#f2eefc',
    mutedOnWallpaper: '#9d92b8',
    dark: true,
  },
  {
    id: 'ocaso', label: 'Ocaso', hint: 'Cálido, coral y naranja',
    wallpaper: ['#fff7f2', '#ffe9e2', '#fde0ec'],
    bubbleMine: ['#fb7185', '#f97316'],
    bubbleMineText: '#ffffff',
    bubbleOther: '#ffffff',
    bubbleOtherText: '#33202a',
    mutedOnWallpaper: '#a07a86',
    dark: false,
  },
  {
    id: 'menta', label: 'Menta', hint: 'Fresco, verde y turquesa',
    wallpaper: ['#f2fbf7', '#e3f6ec', '#dcf2ea'],
    bubbleMine: ['#10b981', '#0ea5a5'],
    bubbleMineText: '#ffffff',
    bubbleOther: '#ffffff',
    bubbleOtherText: '#1c2e26',
    mutedOnWallpaper: '#6b8a7b',
    dark: false,
  },
  {
    id: 'clasico', label: 'Clásico', hint: 'Neutro, grises cálidos',
    // Variante neutra PROPIA: antes copiaba los colores de WhatsApp (beige
    // #efeae2 y verde #d9fdd3), que hacían que el chat pareciera otra app.
    // Ahora son los grises cálidos del tema Franky (mismo tinte que C.text y
    // C.input del modo claro): la burbuja propia va en gris-violeta oscuro con
    // texto blanco y la ajena en blanco, sin ningún color de otra marca.
    wallpaper: ['#f7f5f3', '#efece8'],
    bubbleMine: ['#4a4160', '#3a3350'],
    bubbleMineText: '#ffffff',
    bubbleOther: '#ffffff',
    bubbleOtherText: '#241b33',
    mutedOnWallpaper: '#7b7389',
    dark: false,
  },
];

const DEFAULT_ID: ChatThemeId = 'franky';
const keyFor = (chatId: string) => `franky_chat_theme_${chatId}`;
const GLOBAL_KEY = 'franky_chat_theme_global';

export function themeById(id: string | null | undefined): ChatTheme {
  return CHAT_THEMES.find((t) => t.id === id) ?? CHAT_THEMES[0];
}

/** Tema de una conversación: clave por chat → global → 'franky'. */
export async function getChatTheme(chatId: string): Promise<ChatTheme> {
  try {
    const [own, global] = await Promise.all([
      AsyncStorage.getItem(keyFor(chatId)),
      AsyncStorage.getItem(GLOBAL_KEY),
    ]);
    return themeById(own ?? global ?? DEFAULT_ID);
  } catch {
    return themeById(DEFAULT_ID);
  }
}

/**
 * Guarda el tema del chat. También actualiza el global: el último tema
 * elegido pasa a ser el predeterminado de las conversaciones sin tema propio.
 */
export function setChatTheme(chatId: string, id: ChatThemeId): void {
  AsyncStorage.setItem(keyFor(chatId), id).catch(() => {});
  AsyncStorage.setItem(GLOBAL_KEY, id).catch(() => {});
}
