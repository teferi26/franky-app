import type Stripe from "stripe";
import { PRICING } from "@/lib/pricing";

export type BusinessInterval = "month" | "year";

export function businessPriceCents(type: "leisure" | "housing", interval: BusinessInterval): number {
  if (interval === "year") {
    if (type !== "leisure") throw new Error("Annual billing is only available for leisure listings");
    return Math.round(PRICING.business_leisure.yearly * 100);
  }
  return Math.round(PRICING[type === "leisure" ? "business_leisure" : "business_housing"].monthly * 100);
}

/** Billing data comes from Stripe's actual recurring item, never client metadata. */
export function businessSubscriptionFields(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const price = item?.price;
  const interval = price?.recurring?.interval;
  if (!item || !price || subscription.items.data.length !== 1 || (item.quantity ?? 1) !== 1 ||
      price.currency !== "eur" || price.unit_amount === null ||
      !Number.isSafeInteger(price.unit_amount) || price.unit_amount < 0 ||
      price.recurring?.interval_count !== 1 || (interval !== "month" && interval !== "year")) {
    throw new Error("Unexpected business subscription price");
  }
  if (interval === "year" && subscription.metadata.business_type !== "leisure") {
    throw new Error("Annual billing is only available for leisure listings");
  }
  const periodEnd = item.current_period_end ?? (subscription as unknown as { current_period_end?: number }).current_period_end;
  return {
    billing_interval: interval,
    amount_cents: price.unit_amount,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    status: subscription.status === "incomplete_expired" ? "canceled"
      : subscription.status === "paused" ? "unpaid" : subscription.status,
  };
}

export function businessBillingLabel(sub: { type: "leisure" | "housing"; billing_interval?: string | null; amount_cents?: number | null }) {
  const yearly = sub.billing_interval === "year";
  const cents = sub.amount_cents ?? businessPriceCents(sub.type, yearly ? "year" : "month");
  const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
  return `${euros}/${yearly ? "año" : "mes"}`;
}
