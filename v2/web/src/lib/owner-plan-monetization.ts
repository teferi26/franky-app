import { OWNER_PLAN } from "@/lib/pricing";

/**
 * Suma el Plan Inmobiliarias al resumen de monetización del panel admin.
 *
 * Por qué existe: la RPC admin_monetization_summary (migración 044) es
 * anterior al Plan Inmobiliarias (105) y solo cuenta `subscriptions` (planes
 * de estudiante) y `business_subscriptions` (fichas sueltas de 9,99 €). El
 * primer pago real de una inmobiliaria (80 €/mes, 20-ago-2026) cayó en
 * `owner_subscriptions`, la tabla que el panel no miraba: el cobro existía en
 * Stripe y en la base de datos, y el panel decía que no había nada.
 *
 * Se corrige aquí, en la capa de la API, y no en la RPC, para que el arreglo
 * llegue con un despliegue de código sin esperar a aplicar una migración.
 */

/** Lo mínimo que necesitamos de cada fila de owner_subscriptions. */
export interface OwnerSubRow {
  status: string | null;
  billing: string | null;
}

/** La parte del resumen de la RPC que este merge lee y reescribe. */
export interface MonetizationSummary {
  active_subscriptions: Record<string, number> & { total_paying: number };
  mrr_normalized: number;
  arr_estimate: number;
  avg_revenue_per_paying_user: number;
  /** En prueba gratuita: aún no pagan, se enseñan aparte y no van al MRR. */
  owner_plan_trialing?: number;
  [key: string]: unknown;
}

export function mergeOwnerPlanIntoMonetization<T extends MonetizationSummary>(
  summary: T,
  ownerSubs: OwnerSubRow[],
): T {
  const activas = ownerSubs.filter((s) => s.status === "active");
  const monthly = activas.filter((s) => s.billing !== "quarterly_intro").length;
  const quarterly = activas.length - monthly;
  const trialing = ownerSubs.filter((s) => s.status === "trialing").length;

  return mergeOwnerPlanCounts(summary, { monthly, quarterly, trialing });
}

/** Counts avoid the API's row limit when the owner plan exceeds 1,000 accounts. */
export function mergeOwnerPlanCounts<T extends MonetizationSummary>(
  summary: T,
  { monthly, quarterly, trialing }: { monthly: number; quarterly: number; trialing: number },
): T {

  // El trimestre de entrada cobra introQuarterTotal por 3 meses: su MRR es un
  // tercio de eso, no la cuota mensual normal.
  const mrrOwner = monthly * OWNER_PLAN.monthly + (quarterly * OWNER_PLAN.introQuarterTotal) / 3;

  const totalPaying = (summary.active_subscriptions.total_paying ?? 0) + monthly + quarterly;
  const mrr = Math.round((Number(summary.mrr_normalized ?? 0) + mrrOwner) * 100) / 100;

  return {
    ...summary,
    active_subscriptions: {
      ...summary.active_subscriptions,
      owner_plan_monthly: monthly,
      owner_plan_quarterly: quarterly,
      total_paying: totalPaying,
    },
    owner_plan_trialing: trialing,
    mrr_normalized: mrr,
    arr_estimate: Math.round(mrr * 12 * 100) / 100,
    avg_revenue_per_paying_user: totalPaying > 0 ? Math.round((mrr / totalPaying) * 100) / 100 : 0,
  };
}
