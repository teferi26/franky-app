import { PRO_VERTICALS } from "./verticals";
import type { ProVerticalId } from "./types";

/** Tarifa web de lanzamiento autorizada el 28 de septiembre de 2026. */
export function proWebPrice(sector: ProVerticalId) {
  const standard = PRO_VERTICALS[sector].price;
  if (sector !== "hairdresser") return { ...standard, offerLabel: null, taxIncluded: false };
  return {
    ...standard,
    taxIncluded: false,
    monthly: 10,
    annual: 100,
    offerLabel: "Primeras peluquerías",
  };
}
