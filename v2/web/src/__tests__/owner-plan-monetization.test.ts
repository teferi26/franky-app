import { describe, expect, it } from "vitest";
import {
  mergeOwnerPlanIntoMonetization,
  type MonetizationSummary,
} from "@/lib/owner-plan-monetization";

/**
 * El primer pago real del Plan Inmobiliarias (80 €, 20-ago-2026) no aparecía
 * en el panel de monetización: la RPC (044) es anterior al plan (105) y no
 * mira owner_subscriptions. Estos tests fijan el merge que lo corrige, con el
 * escenario exacto de producción aquel día.
 */

const resumenRPC = (): MonetizationSummary => ({
  active_subscriptions: {
    pro_monthly: 0,
    pro_yearly: 0,
    premium_monthly: 0,
    premium_yearly: 0,
    business_leisure: 0,
    business_housing: 0,
    total_paying: 0,
  },
  mrr_normalized: 0,
  arr_estimate: 0,
  churn_30d: 0,
  new_subscriptions_30d: 0,
  avg_revenue_per_paying_user: 0,
});

describe("mergeOwnerPlanIntoMonetization", () => {
  it("refleja el escenario real: 1 inmobiliaria pagando 80 €/mes", () => {
    const out = mergeOwnerPlanIntoMonetization(resumenRPC(), [
      { status: "active", billing: "monthly" },
    ]);
    expect(out.active_subscriptions.owner_plan_monthly).toBe(1);
    expect(out.active_subscriptions.total_paying).toBe(1);
    expect(out.mrr_normalized).toBe(80);
    expect(out.arr_estimate).toBe(960);
    expect(out.avg_revenue_per_paying_user).toBe(80);
    expect(out.owner_plan_trialing).toBe(0);
  });

  it("la prueba gratis se enseña aparte y no infla el MRR", () => {
    const out = mergeOwnerPlanIntoMonetization(resumenRPC(), [
      { status: "trialing", billing: "monthly" },
    ]);
    expect(out.active_subscriptions.owner_plan_monthly).toBe(0);
    expect(out.owner_plan_trialing).toBe(1);
    expect(out.mrr_normalized).toBe(0);
    expect(out.active_subscriptions.total_paying).toBe(0);
  });

  it("el trimestre de entrada cuenta como un tercio de 192 €", () => {
    const out = mergeOwnerPlanIntoMonetization(resumenRPC(), [
      { status: "active", billing: "quarterly_intro" },
    ]);
    expect(out.active_subscriptions.owner_plan_quarterly).toBe(1);
    expect(out.mrr_normalized).toBe(64);
  });

  it("suma sobre lo que ya hubiera y recalcula el ARPU", () => {
    const base = resumenRPC();
    base.active_subscriptions.business_housing = 2;
    base.active_subscriptions.total_paying = 2;
    base.mrr_normalized = 19.98;
    const out = mergeOwnerPlanIntoMonetization(base, [
      { status: "active", billing: "monthly" },
      { status: "trialing", billing: "monthly" },
    ]);
    expect(out.active_subscriptions.total_paying).toBe(3);
    expect(out.mrr_normalized).toBe(99.98);
    expect(out.avg_revenue_per_paying_user).toBe(33.33);
    // Lo que la RPC ya traía no se pierde.
    expect(out.active_subscriptions.business_housing).toBe(2);
    expect(out.churn_30d).toBe(0);
  });

  it("sin plan de inmobiliarias, el resumen queda como estaba", () => {
    const out = mergeOwnerPlanIntoMonetization(resumenRPC(), []);
    expect(out.mrr_normalized).toBe(0);
    expect(out.active_subscriptions.total_paying).toBe(0);
    expect(out.active_subscriptions.owner_plan_monthly).toBe(0);
  });
});
