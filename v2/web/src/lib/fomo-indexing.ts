/**
 * Cuándo merece la pena que Google indexe la landing FOMO de una universidad.
 *
 * Hay ~96 universidades y la mayoría de muros están vacíos: anunciar 96
 * landings sin hilos es contenido fino en masa (Google lo trata como soft-404 y
 * rebaja el dominio). Solo se indexan y se meten en el sitemap los muros con
 * actividad real reciente; el resto sigue accesible pero con noindex.
 */
export const FOMO_INDEX_MIN_THREADS_30D = 3;

export type FomoStats = { threads_30d?: number | null; replies_30d?: number | null } | null | undefined;

export function fomoIsIndexable(stats: FomoStats): boolean {
  return (stats?.threads_30d ?? 0) >= FOMO_INDEX_MIN_THREADS_30D;
}
