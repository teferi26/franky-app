import { OWNER_PLAN, PRICING, formatEur } from "./pricing";

export const HOUSING_OFFER_VERSION = "first-interest-v1";
export type HousingBilling = "listing" | "monthly" | "quarterly";

export function housingOfferTerms(billing: HousingBilling): string {
  const price = billing === "listing" ? `${formatEur(PRICING.business_housing.monthly)}/mes por anuncio`
    : billing === "monthly" ? `${formatEur(OWNER_PLAN.monthly)}/mes por hasta ${OWNER_PLAN.maxListings} pisos`
    : `${formatEur(OWNER_PLAN.introQuarterTotal)} por los primeros 3 meses y después ${formatEur(OWNER_PLAN.monthly)}/mes por hasta ${OWNER_PLAN.maxListings} pisos`;
  return `Hoy pagas 0 €. Guardamos tu tarjeta. Autorizas el inicio automático de la suscripción (${price}, impuestos incluidos) cuando recibas el primer mensaje de un interesado en Franky o una solicitud de visita a ${billing === "listing" ? "este anuncio" : "cualquiera de los pisos cubiertos por el plan"}. Las visualizaciones, favoritos y abrir un chat no cuentan. Hasta entonces puedes publicar gratis, sin límite de tiempo. Puedes cancelar antes de la activación sin cargos; al cancelar se retiran los anuncios cubiertos. Tras activarse, la cuota se renueva aunque no lleguen más contactos, hasta que canceles.`;
}
