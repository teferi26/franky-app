// ─── A/B testing (experimentos) ──────────────────────────────────────────
// Mejora 91 del ciclo 2: onboarding_v2 y lupa_ranking. Backend en la
// migración v2/supabase/migrations/139_experiments_and_calls.sql (tabla
// `experiments`: key, enabled, variants JSONB con pesos, p. ej.
// {"control": 50, "variante": 50}). El usuario aplicará esa migración más
// tarde, así que este módulo es FAIL-SOFT de arriba a abajo: si la tabla no
// existe todavía, o la consulta falla por lo que sea, todo cae en 'control'
// sin romper nada.
//
// Cómo funciona la asignación (determinista, sin guardar nada en servidor):
// - getVariant('onboarding_v2') calcula un hash estable de "uid:key" y lo
//   reparte según los pesos del experimento (igual que una ruleta: cada
//   variante ocupa el tramo proporcional a su peso).
// - La MISMA persona con el MISMO uid cae SIEMPRE en la MISMA variante para
//   ese experimento, sin cachear la asignación en ningún sitio: se puede
//   recalcular en cualquier pantalla y da lo mismo.
// - Sin sesión (uid desconocido), sin catálogo, con el experimento apagado o
//   sin encontrarlo: siempre 'control'.
//
// Catálogo en memoria: se pide una sola vez por sesión (una consulta a
// `experiments`) y se reutiliza desde ahí. Al cambiar de sesión (login,
// logout, cambio de cuenta) se invalida y se vuelve a pedir en el siguiente
// getVariant().
//
// Exposición: trackExposure('onboarding_v2') registra un evento
// 'experiment_exposure' con { key, variant } vía src/lib/analytics.ts
// (track, solo lectura desde aquí). Se llama como mucho una vez por
// experimento y por sesión de la app (en memoria, no persiste entre
// reinicios), para no inflar la tabla de analytics_events con exposiciones
// repetidas de la misma pantalla.
//
// ESTE FICHERO NO SE ENGANCHA A NINGUNA PANTALLA (lo hacen otros agentes).
// Uso previsto cuando se integre:
//
//   // Onboarding, al montar la pantalla:
//   const variant = await getVariant('onboarding_v2');
//   await trackExposure('onboarding_v2');
//   if (variant === 'variante') { /* orden/copy alternativo */ }
//
//   // Lupa, al construir el ranking "Para ti":
//   const variant = await getVariant('lupa_ranking');
//   await trackExposure('lupa_ranking');
//   const pesoAfinidad = variant === 'variante' ? 0.7 : 0.5;

import { supabase } from './supabase';
import { getCachedUser } from './session';
import { track } from './analytics';

type ExperimentRow = {
  key: string;
  enabled: boolean;
  variants: Record<string, number>;
};

// Catálogo cacheado en memoria: una consulta por sesión.
let catalogCache: Map<string, ExperimentRow> | null = null;
let catalogInflight: Promise<Map<string, ExperimentRow>> | null = null;

// Exposiciones ya registradas en esta sesión de la app (no persiste entre
// reinicios, es justo lo que pide la mejora: "no inflar la tabla").
const exposedKeys = new Set<string>();

/** Invalida catálogo y exposiciones registradas: se llama al cambiar de
 * sesión para no arrastrar datos de una cuenta a otra. */
function resetCache(): void {
  catalogCache = null;
  catalogInflight = null;
  exposedKeys.clear();
}

// Nos suscribimos una sola vez (efecto de módulo) a los cambios de sesión
// para refrescar el catálogo. Fail-soft: si supabase.auth no está listo por
// lo que sea, simplemente no invalidamos nunca (peor caso: catálogo algo
// obsoleto, nunca un crash).
try {
  supabase.auth.onAuthStateChange(() => {
    resetCache();
  });
} catch {
  /* fail-soft */
}

/** Pide el catálogo de experimentos a Supabase, cacheado en memoria y
 * deduplicando peticiones concurrentes. Fail-soft: ante cualquier error
 * (tabla inexistente, red caída) devuelve un catálogo vacío, no lanza. */
async function loadCatalog(): Promise<Map<string, ExperimentRow>> {
  if (catalogCache) return catalogCache;
  if (catalogInflight) return catalogInflight;

  catalogInflight = (async () => {
    const map = new Map<string, ExperimentRow>();
    try {
      const { data, error } = await supabase
        .from('experiments')
        .select('key, enabled, variants');
      if (!error && Array.isArray(data)) {
        for (const row of data as Array<{ key: string; enabled: boolean; variants: unknown }>) {
          if (!row?.key) continue;
          const variants = (row.variants && typeof row.variants === 'object')
            ? (row.variants as Record<string, number>)
            : {};
          map.set(row.key, { key: row.key, enabled: Boolean(row.enabled), variants });
        }
      }
    } catch {
      /* fail-soft: la migración 139 puede no estar aplicada todavía */
    }
    catalogCache = map;
    catalogInflight = null;
    return map;
  })();

  return catalogInflight;
}

/** Hash estable (djb2) de una cadena a un entero de 32 bits sin signo. No
 * depende de Math.random ni de nada por plataforma: mismo input, mismo
 * output, siempre. */
function hashStable(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Reparte el hash de "uid:key" entre las variantes según su peso, como una
 * ruleta: cada variante ocupa el tramo proporcional a su peso dentro del
 * total. Determinista: mismo uid + mismo key -> siempre la misma variante. */
function pickVariant(uid: string, key: string, variants: Record<string, number>): string {
  const entries = Object.entries(variants).filter(
    ([, weight]) => typeof weight === 'number' && Number.isFinite(weight) && weight > 0,
  );
  if (entries.length === 0) return 'control';

  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return 'control';

  const bucket = hashStable(`${uid}:${key}`) % 10000;
  const point = (bucket / 10000) * total;

  let acumulado = 0;
  for (const [nombre, peso] of entries) {
    acumulado += peso;
    if (point < acumulado) return nombre;
  }
  return entries[entries.length - 1][0]; // por redondeo, cae en la última
}

/**
 * Devuelve la variante determinista del experimento `key` para el usuario
 * actual. 'control' si: no hay sesión, el experimento no existe, está
 * desactivado, o cualquier error a lo largo del camino (fail-soft).
 */
export async function getVariant(key: string): Promise<string> {
  try {
    const user = await getCachedUser();
    if (!user) return 'control';

    const catalog = await loadCatalog();
    const experiment = catalog.get(key);
    if (!experiment || !experiment.enabled) return 'control';

    return pickVariant(user.id, key, experiment.variants);
  } catch {
    return 'control';
  }
}

/**
 * Registra la exposición al experimento `key` (evento 'experiment_exposure'
 * con { key, variant }), solo la primera vez por experimento y por sesión de
 * la app. Fail-soft y no bloqueante: pensada para llamarse sin await desde
 * la pantalla si no se quiere esperar a la respuesta.
 */
export async function trackExposure(key: string): Promise<void> {
  try {
    if (exposedKeys.has(key)) return;
    exposedKeys.add(key); // se marca antes de esperar: no reintentamos aunque falle el track

    const variant = await getVariant(key);
    await track('experiment_exposure', { key, variant });
  } catch {
    /* fail-soft: la exposición nunca debe romper la pantalla que la llama */
  }
}
