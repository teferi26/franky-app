// Se mantiene independiente del catálogo editorial para no cargarlo en Edge.
export const SECTOR_SITE_SLUGS = [
  "peluquerias", "estetica", "cafeterias", "bares", "restaurantes", "pubs",
  "discotecas", "gimnasios", "academias", "ocio", "padel", "coworking",
  "inmobiliarias", "propietarios", "comunidades", "universidades",
] as const;

export type SectorSiteSlug = (typeof SECTOR_SITE_SLUGS)[number];
export const FRANKY_ORIGIN = "https://franky.es";
export const SECTOR_SITE_HEADER = "x-franky-sector-site";

export function isSectorSiteSlug(value: string): value is SectorSiteSlug {
  return (SECTOR_SITE_SLUGS as readonly string[]).includes(value);
}

/** Solo Host, nunca X-Forwarded-Host ni sufijos que pueda inventar el visitante. */
export function getSectorSlugFromHost(host: string | null | undefined): SectorSiteSlug | null {
  if (!host) return null;
  const normalized = host.toLowerCase();
  const production = /^([a-z]+)\.franky\.es$/.exec(normalized);
  const local = /^([a-z]+)\.localhost(?::([0-9]{1,5}))?$/.exec(normalized);
  if (local?.[2] && (Number(local[2]) < 1 || Number(local[2]) > 65535)) return null;
  const slug = production?.[1] ?? local?.[1];
  return slug && isSectorSiteSlug(slug) ? slug : null;
}

export function isSectorSubdomainEnabled(slug: string): boolean {
  if (!isSectorSiteSlug(slug)) return false;
  return (process.env.FRANKY_SECTOR_SUBDOMAINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .includes(slug);
}

function sectorPath(slug: string): string {
  if (!isSectorSiteSlug(slug)) throw new Error("Sector de Franky desconocido");
  return `/sectores/${slug}`;
}

/** Activar cada dominio solo después de verificar DNS, TLS y redirecciones de Auth. */
export function sectorCanonicalUrl(slug: string): string {
  const path = sectorPath(slug);
  return isSectorSubdomainEnabled(slug)
    ? `https://${slug}.franky.es`
    : `${FRANKY_ORIGIN}${path}`;
}

export function sectorHref(slug: string): string {
  return isSectorSubdomainEnabled(slug) ? sectorCanonicalUrl(slug) : sectorPath(slug);
}

type DirectSectorSurface = { slug: SectorSiteSlug; access: boolean };

function directSectorSurface(pathname: string): DirectSectorSurface | null {
  const match = /^\/sectores\/([a-z]+)(\/acceder)?$/.exec(pathname);
  if (!match || !isSectorSiteSlug(match[1])) return null;
  return { slug: match[1], access: Boolean(match[2]) };
}

export function isSectorPublicPath(pathname: string): boolean {
  return pathname === "/sectores" || directSectorSurface(pathname) !== null;
}

export type SectorSurface = {
  hostSlug: SectorSiteSlug | null;
  surface: SectorSiteSlug | "index" | null;
  rewritePath: string | null;
  redirectUrl: string | null;
};

// Estas páginas pertenecen al catálogo estudiantil. Sus rutas privadas siguen
// pasando por el muro de autenticación, incluso desde un subdominio comercial.
function isPublicStudentPath(pathname: string): boolean {
  if (["/en", "/simulador", "/test-vocacional", "/nota-media", "/colaboradores"].includes(pathname)) {
    return true;
  }
  const catalogPrefixes = [
    "/universidades", "/carreras", "/becas", "/notas-corte", "/ocio",
    "/noticias", "/alojamiento", "/organizador",
  ];
  if (catalogPrefixes.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }
  if (pathname === "/fomo" || /^\/fomo\/[^/]+(?:\/opengraph-image)?$/.test(pathname)) return true;
  if (pathname === "/eventos") return true;
  return /^\/eventos\/[^/]+$/.test(pathname)
    && !["/eventos/crear", "/eventos/swipe"].includes(pathname);
}

/** Resuelve únicamente las páginas comerciales; no cambia permisos ni sesiones. */
export function resolveSectorSurface(pathname: string, host: string | null): SectorSurface {
  const hostSlug = getSectorSlugFromHost(host);
  const result: SectorSurface = { hostSlug, surface: null, rewritePath: null, redirectUrl: null };
  const direct = directSectorSurface(pathname);

  if (hostSlug) {
    if (pathname === "/" || pathname === "/acceder") {
      return {
        ...result,
        surface: hostSlug,
        rewritePath: `${sectorPath(hostSlug)}${pathname === "/acceder" ? "/acceder" : ""}`,
      };
    }
    if (direct) {
      const suffix = direct.access ? "/acceder" : "";
      return {
        ...result,
        redirectUrl: direct.slug === hostSlug ? suffix || "/" : `${sectorCanonicalUrl(direct.slug)}${suffix}`,
      };
    }
    if (pathname === "/sectores" || isPublicStudentPath(pathname)) {
      return { ...result, redirectUrl: `${FRANKY_ORIGIN}${pathname}` };
    }
    return result;
  }

  if (direct) {
    // No redirigir previews o localhost a producción cuando se pruebe el despliegue.
    const isMainHost = host === "franky.es" || host === "www.franky.es";
    return {
      ...result,
      surface: direct.slug,
      redirectUrl: isMainHost && isSectorSubdomainEnabled(direct.slug)
        ? `${sectorCanonicalUrl(direct.slug)}${direct.access ? "/acceder" : ""}`
        : null,
    };
  }
  return { ...result, surface: pathname === "/sectores" ? "index" : null };
}

/** Los metadatos nunca forman URLs a partir de un Host sin validar. */
export function sectorMetadataHost(host: string | null): {
  slug: SectorSiteSlug | null;
  origin: string;
  indexable: boolean;
} {
  const slug = getSectorSlugFromHost(host);
  const isMainHost = host === "franky.es" || host === "www.franky.es";
  return {
    slug,
    origin: slug ? `https://${slug}.franky.es` : FRANKY_ORIGIN,
    indexable: slug
      ? host?.toLowerCase() === `${slug}.franky.es` && isSectorSubdomainEnabled(slug)
      : isMainHost,
  };
}
