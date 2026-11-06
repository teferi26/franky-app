import type { Metadata } from "next";

/**
 * Metadatos SEO para las paginas de listado con filtros y paginacion.
 *
 * Problema que resuelve: /carreras tiene 6 filtros y 88 paginas. Cada
 * combinacion generaba una URL distinta con EL MISMO title y description y sin
 * canonical, asi que Google veia miles de casi-duplicados de la misma pagina.
 * Eso diluye la autoridad de la version buena y llena Search Console de
 * "Duplicada, Google eligio una pagina canonica distinta".
 *
 * Criterio aplicado:
 *   * Sin parametros → indexable, canonical a si misma.
 *   * Solo `pagina` → indexable (las paginas 2..N son contenido real y
 *     distinto), con su propia canonical y title numerado.
 *   * Con cualquier filtro → `noindex, follow`. Se sigue rastreando para
 *     descubrir fichas, pero no se indexa la combinacion.
 */
export function listingMetadata(opts: {
  path: string;
  title: string;
  description: string;
  params: Record<string, string | undefined>;
  /** Parametros que NO cuentan como filtro (por defecto, solo la paginacion). */
  paginationKeys?: string[];
}): Metadata {
  const paginationKeys = opts.paginationKeys ?? ["pagina", "page"];
  const active = Object.entries(opts.params).filter(
    ([, v]) => typeof v === "string" && v.trim() !== ""
  );
  const filters = active.filter(([k]) => !paginationKeys.includes(k));
  const pageParam = active.find(([k]) => paginationKeys.includes(k));
  const pageNum = pageParam ? Math.max(1, parseInt(pageParam[1] as string, 10) || 1) : 1;

  const hasFilters = filters.length > 0;
  const canonical =
    hasFilters || pageNum === 1
      ? opts.path
      : `${opts.path}?${pageParam?.[0]}=${pageNum}`;

  return {
    title: pageNum > 1 ? `${opts.title} · Página ${pageNum}` : opts.title,
    description: opts.description,
    alternates: { canonical },
    ...(hasFilters
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}
