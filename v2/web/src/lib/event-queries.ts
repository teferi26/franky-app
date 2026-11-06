/**
 * Selects compartidos de la tabla `events`.
 *
 * Incidente sep-2026: la ficha /eventos/[id] respondía "Este evento ya no está"
 * a TODO el mundo (anónimos, Googlebot y usuarios con sesión). La migración de
 * espacios 2.4.0 añadió `events.audience_university_id` con FK a
 * `universities`, así que `events` pasó a tener DOS relaciones con esa tabla
 * (`university_id` y `audience_university_id`). Un embed sin nombre,
 * `universities(name)`, es ambiguo y PostgREST lo rechaza con PGRST201; el
 * `.single()` devolvía `data: null` y la página llamaba a notFound().
 *
 * Regla: cualquier embed de `universities` desde `events` tiene que nombrar la
 * FK. Los tests de `event-queries.test.ts` lo vigilan.
 */

/** Relación "universidad del evento" (no la de audiencia restringida). */
export const EVENT_UNIVERSITY_EMBED = "universities!events_university_id_fkey(name)";

/**
 * Select de la ficha pública del evento. `*` es seguro aquí: las columnas de
 * `events` son legibles por `anon` (lo comprueba la RLS, no el select) y la
 * ficha necesita casi todas (precios de camiseta, modo de cobro, Crush Live...).
 */
export const EVENT_DETAIL_SELECT = `*, ${EVENT_UNIVERSITY_EMBED}`;

/** Embeds de `universities` sin FK explícita dentro de un select. */
export function ambiguousUniversityEmbeds(select: string): string[] {
  return select.match(/\buniversities\s*\(/g) ?? [];
}
