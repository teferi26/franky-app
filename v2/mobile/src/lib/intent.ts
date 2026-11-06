// ─── Intención de uso: qué prioriza cada persona en la navegación ───────────
// Mismo patrón de suscripción que src/lib/theme-switch.ts (léelo si tocas
// esto): un valor en memoria + un Set de listeners que se notifican al
// cambiar. El motivo es el mismo: el layout raíz remonta el árbol con una
// `key` al cambiar de tema o de idioma (ver app/_layout.tsx), y si algún día
// la barra de pestañas quiere reordenarse en caliente al cambiar la
// intención, puede suscribirse aquí con onIntentChange() exactamente igual
// que ya hace con onThemeChange().
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Para qué va a usar la persona la app. Se elige en el onboarding
 *  (app/onboarding-intencion.tsx) y se puede cambiar luego desde
 *  app/ajustes-uso.tsx. */
export type UserIntent = 'piso' | 'gente' | 'planes' | 'todo';

const KEY = 'franky_intent';

// Marca de "este dispositivo ya vio la guía de uso (app/guia.tsx)". La guía y
// la pregunta de intención SOLO deben verse en registros nuevos:
//  1) Barrera principal: welcome.tsx solo navega a /onboarding-intro tras un
//     ALTA nueva (nunca tras un login), y onboarding-intro -> onboarding-perfil
//     -> onboarding-intencion -> guia es la única cadena que llega a estas
//     pantallas. Un usuario que ya tenía cuenta jamás entra por ahí.
//  2) Barrera de seguridad (esta marca): por si en el futuro alguna pantalla
//     nueva vuelve a enrutar a onboarding-intencion o a guia para alguien que
//     YA pasó por el onboarding (p. ej. un deep link viejo), ambas pantallas
//     comprueban esta marca al montarse y se saltan solas hacia el feed si ya
//     está puesta (ver el guard al principio de cada componente).
const GUIDE_SEEN_KEY = 'franky_guide_seen';

let intent: UserIntent = 'todo';
const listeners = new Set<(i: UserIntent) => void>();

/** Intención YA resuelta en memoria ('todo' hasta que loadStoredIntent cargue el storage). */
export function getIntent(): UserIntent {
  return intent;
}

/** Carga la intención guardada. Llamar una vez al arrancar, como loadStoredTheme(). */
export async function loadStoredIntent(): Promise<UserIntent> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored === 'piso' || stored === 'gente' || stored === 'planes' || stored === 'todo') {
      intent = stored;
    }
  } catch { /* sin storage: 'todo' por defecto */ }
  return intent;
}

/** Guarda la intención (local, y en el perfil si algún día hay dónde). */
export function setIntent(i: UserIntent) {
  intent = i;
  AsyncStorage.setItem(KEY, i).catch(() => {});
  for (const l of listeners) l(intent);

  // Guardado en el perfil de Supabase: DESACTIVADO a propósito. Se comprobó el
  // esquema (supabase/migrations) y la tabla profiles NO tiene ninguna columna
  // para esto (no existe profiles.usage_intent ni equivalente; lo más cercano,
  // "housing intent" en la migración 040, es un concepto distinto del Roomie,
  // no la intención general de uso de la app). Crear esa columna es una
  // migración y no es tarea de este módulo, así que por ahora solo se guarda
  // en local. Si en el futuro se añade una columna (p. ej. `usage_intent
  // text` en profiles), descomentar esto y ajustar el nombre real:
  //
  //   supabase.auth.getUser().then(({ data }) => {
  //     const user = data.user;
  //     if (!user) return;
  //     supabase.from('profiles').update({ usage_intent: i }).eq('id', user.id);
  //   });
}

/** Se llama al cambiar la intención (elegida en onboarding o en ajustes-uso). */
export function onIntentChange(listener: (i: UserIntent) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** true si este dispositivo ya vio la guía de uso alguna vez (ver GUIDE_SEEN_KEY). */
export async function hasSeenGuide(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GUIDE_SEEN_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Marca la guía como vista. La llama guia.tsx al terminar los pasos o al omitir. */
export function markGuideSeen() {
  AsyncStorage.setItem(GUIDE_SEEN_KEY, '1').catch(() => {});
}

// ─── Prioridad de navegación según la intención ─────────────────────────────
// Lo consume la barra de pestañas (app/(tabs)/_layout.tsx: orden de las
// ranuras y destino del botón central destacado) y la tira de categorías de
// La Lupa (app/(tabs)/explorar.tsx, que ordena CATS con sortCats). Esta
// función NO reordena nada por sí sola: solo devuelve el orden recomendado
// para que ese otro código lo aplique.

/** Nombre de ruta de cada pestaña de la barra inferior (ver app/(tabs)/_layout.tsx). */
export type TabKey = 'feed' | 'crush' | 'estudio' | 'explorar' | 'eventos' | 'chats' | 'perfil';

/** Clave de cada categoría de la rejilla de La Lupa (ver CATS en explorar.tsx). */
export type ExplorarCategoryKey =
  | 'eventos' | 'pisos' | 'roomies' | 'becas' | 'unis' | 'carreras' | 'ocio' | 'apuntes' | 'favoritos';

export interface TabPriority {
  /** Orden de las pestañas de la barra inferior, de más a menos prioritaria
   *  para esta intención. Incluye las 7 rutas reales (feed y crush comparten
   *  hueco visual; La Lupa se abre desde el buscador de la cabecera), no solo
   *  las 5 que se pintan. Estudio va siempre entre las tres primeras: es la
   *  razón de abrir la app cada día. */
  tabOrder: TabKey[];
  /** Qué pestaña merece el hueco más destacado (el botón central grande de la
   *  barra). Si se define featuredHref, este valor solo sirve para saber qué
   *  pestaña NO hace falta repetir en las ranuras laterales. */
  featuredTab: TabKey;
  /** Destino real del botón central cuando lo mejor para esa intención NO es
   *  una pestaña. Hoy solo pasa con 'piso': la vivienda no tiene pestaña
   *  propia y mandar el botón grande a La Lupa sería un rodeo. Al usarlo, la
   *  barra pinta 4 pestañas laterales + este botón (ver el comentario de las
   *  ranuras en app/(tabs)/_layout.tsx). */
  featuredHref?: '/pisos';
  /** Orden sugerido para CATS en explorar.tsx: las categorías más relevantes
   *  para esta intención primero, el resto detrás sin quitar ninguna. */
  exploreCategoryOrder: ExplorarCategoryKey[];
}

export function getTabPriority(i: UserIntent): TabPriority {
  switch (i) {
    // Busca piso o compañero de piso: Pisos y Roomies (dentro de La Lupa) son
    // lo primero que necesita ver; Fomo y Chats siguen siendo útiles pero en
    // segundo plano.
    case 'piso':
      return {
        tabOrder: ['explorar', 'feed', 'estudio', 'chats', 'eventos', 'crush', 'perfil'],
        featuredTab: 'explorar',
        featuredHref: '/pisos',
        exploreCategoryOrder: ['pisos', 'roomies', 'unis', 'becas', 'carreras', 'eventos', 'ocio', 'apuntes', 'favoritos'],
      };
    // Conocer gente de su universidad: Fomo (feed) y Crush primero, Chats
    // cerca por ser donde continúa esa conexión.
    case 'gente':
      return {
        tabOrder: ['feed', 'crush', 'chats', 'estudio', 'eventos', 'explorar', 'perfil'],
        featuredTab: 'feed',
        exploreCategoryOrder: ['unis', 'roomies', 'eventos', 'ocio', 'becas', 'carreras', 'pisos', 'apuntes', 'favoritos'],
      };
    // Hacer planes con gente de gustos similares: Eventos y Ocio (La Lupa)
    // delante.
    case 'planes':
      return {
        tabOrder: ['eventos', 'feed', 'estudio', 'chats', 'explorar', 'crush', 'perfil'],
        featuredTab: 'eventos',
        exploreCategoryOrder: ['ocio', 'eventos', 'unis', 'roomies', 'becas', 'carreras', 'pisos', 'apuntes', 'favoritos'],
      };
    // 'todo' (o cualquier valor no reconocido): el orden actual de la app,
    // sin sesgar nada.
    case 'todo':
    default:
      return {
        tabOrder: ['feed', 'estudio', 'eventos', 'chats', 'explorar', 'crush', 'perfil'],
        featuredTab: 'eventos',
        exploreCategoryOrder: ['eventos', 'pisos', 'roomies', 'becas', 'unis', 'carreras', 'ocio', 'apuntes', 'favoritos'],
      };
  }
}
