import { proWebPrice } from "./web-pricing";
import type { ProVerticalId } from "./types";

export const PRO_TRIAL_DAYS = 7;
export type ProBillingInterval = "month" | "year";

/** El anual del catálogo es el importe de todo el año. */
export function proPlanAmount(sector: ProVerticalId, interval: ProBillingInterval) {
  const price = proWebPrice(sector);
  return Math.round((interval === "year" ? price.annual : price.monthly) * 100);
}

export function proStripeLookupKey(sector: ProVerticalId, interval: ProBillingInterval) {
  return `franky_pro_${sector}_${interval}_v1`;
}

export function proPlanKey(sector: ProVerticalId) {
  return `pro_${sector}`;
}

export type ProOnboardingReply = {
  status: "checkout" | "pending" | "active" | "cancelled" | "failed";
  workspaceId: string;
  slug: string;
  orderId: string;
  href: string;
  url?: string;
};
