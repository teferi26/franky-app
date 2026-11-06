// Utilidades de la capa "Universidad colaboradora" (SCU Fase 1).

export type PartnerTier = "fundadora" | "colaboradora";

export const PARTNER_TIER_LABEL: Record<PartnerTier, string> = {
  fundadora: "Universidad fundadora",
  colaboradora: "Universidad colaboradora",
};

/** Orden de prioridad para listar colaboradoras: fundadoras primero. */
export const PARTNER_TIER_RANK: Record<string, number> = {
  fundadora: 0,
  colaboradora: 1,
};

/** Solo aceptamos http(s) en hrefs de la ficha (evita javascript:/data:). */
export function isHttpUrl(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

/** Iniciales (máx. 2) para el fallback cuando una universidad no tiene logo. */
export function universityInitials(name: string): string {
  const stop = new Set([
    "de", "del", "la", "las", "los", "y", "e", "i", "en", "el",
    "universidad", "universitat", "universidade",
  ]);
  const words = name
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w.toLowerCase()));
  const pick = words.length ? words : name.split(/\s+/).filter(Boolean);
  return pick
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
