// ─── Atajos a los catálogos: UNA sola lista para toda la app ───────────────
// La Lupa (app/(tabs)/explorar.tsx) y el carrusel de "espacios" del feed
// (app/(tabs)/feed.tsx) pintaban dos listas distintas con las mismas entradas.
// Añadir una categoría obligaba a tocar dos ficheros y ya se habían
// desincronizado: Roomies solo existía en La Lupa, así que nadie descubría la
// pantalla de compañeros de piso desde el feed. Ahora la lista vive aquí y
// cada pantalla decide QUÉ subconjunto pinta y EN QUÉ orden.
//
// La clave de cada entrada es la misma que usa src/lib/intent.ts
// (ExplorarCategoryKey), para poder reordenar La Lupa según la intención de
// uso sin traducir claves de un sitio a otro.
import {
  CalendarDays, Home as HomeIcon, GraduationCap, Coins, MapPin, FileText,
  Building2, Users, Bookmark,
} from 'lucide-react-native';
import { t } from '@/lib/i18n';
import type { ExplorarCategoryKey } from '@/lib/intent';

export interface CatalogShortcut {
  key: ExplorarCategoryKey;
  icon: typeof CalendarDays;
  /** Ruta tipada de expo-router. Se declara como unión de literales para que
   *  router.push(cat.href) siga estando comprobado por el compilador. */
  href:
    | '/eventos' | '/pisos' | '/roomie' | '/becas' | '/universidades'
    | '/notas-corte' | '/ocio' | '/apuntes' | '/favoritos';
  /** Rótulo corto: círculos del feed, donde solo caben ~10 caracteres. */
  label: () => string;
  /** Rótulo largo para las píldoras de La Lupa (por defecto, el corto). */
  wideLabel?: () => string;
}

// Orden por defecto (intención 'todo'). getTabPriority() puede reordenarlo.
export const CATS: readonly CatalogShortcut[] = [
  { key: 'eventos', icon: CalendarDays, href: '/eventos', label: () => t('feed.spaceEvents') },
  { key: 'pisos', icon: HomeIcon, href: '/pisos', label: () => t('feed.spacePisos') },
  { key: 'roomies', icon: Users, href: '/roomie', label: () => t('feed.spaceRoomies') },
  { key: 'becas', icon: Coins, href: '/becas', label: () => t('feed.spaceBecas') },
  { key: 'unis', icon: Building2, href: '/universidades', label: () => t('feed.spaceUnis') },
  // Carreras y notas de corte son la MISMA pantalla desde la fusión de
  // app/carreras.tsx en app/notas-corte.tsx.
  {
    key: 'carreras', icon: GraduationCap, href: '/notas-corte',
    label: () => t('feed.spaceCarreras'), wideLabel: () => t('feed.spaceCarrerasWide'),
  },
  { key: 'ocio', icon: MapPin, href: '/ocio', label: () => t('feed.spaceOcio') },
  { key: 'apuntes', icon: FileText, href: '/apuntes', label: () => t('feed.spaceApuntes') },
  { key: 'favoritos', icon: Bookmark, href: '/favoritos', label: () => t('feed.spaceSaved') },
];

// Qué atajos salen en el carrusel del feed: los de descubrimiento. Fuera van
// "Unis" (se llega mejor desde el buscador) y "Guardado" (es personal y vive
// en el menú del perfil).
const FEED_KEYS: readonly ExplorarCategoryKey[] = [
  'eventos', 'pisos', 'roomies', 'becas', 'carreras', 'ocio', 'apuntes',
];

export const SPACES: readonly CatalogShortcut[] = CATS.filter((c) => FEED_KEYS.includes(c.key));

/** Copia de CATS ordenada según la intención de uso (ver getTabPriority).
 *  Las categorías que no estén en `order` se quedan detrás, sin perderse. */
export function sortCats(order: readonly ExplorarCategoryKey[]): CatalogShortcut[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  return [...CATS].sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99));
}
