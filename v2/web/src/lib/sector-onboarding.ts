import { validProVertical } from "./sector-workspace-access";

export type SectorSearchParams = Record<string, string | string[] | undefined>;

const CAMPAIGN_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export function sectorOnboardingContext(params: SectorSearchParams) {
  const initialVertical = validProVertical(params.sector);
  const attribution: string[] = [];
  // Solo identificadores de campaña, nunca la URL, referrer o parámetros libres.
  for (const key of CAMPAIGN_KEYS) {
    const value = params[key];
    if (
      typeof value === "string" &&
      /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)
    ) {
      attribution.push(`${key}: ${value}`);
    }
  }
  const origin = params.origen ?? params.origin;
  if (typeof origin === "string" && /^[a-z][a-z0-9-]{1,39}$/.test(origin)) {
    attribution.unshift(`Página de origen: ${origin}`);
  }
  return { initialVertical, attribution };
}
