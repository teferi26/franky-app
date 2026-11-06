"use client";

import type { ProVerticalId } from "@/lib/pro/types";

/** Una solicitud recibida es un contacto, nunca una venta o una suscripción. */
export function trackSectorLead(vertical: ProVerticalId): void {
  try {
    if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_GA_ID) return;
    const consent = JSON.parse(
      window.localStorage.getItem("franky_cookie_consent") ?? "{}",
    );
    if (consent.analytics !== true) return;
    const analyticsWindow = window as Window & {
      gtag?: (
        command: "event",
        name: "generate_lead",
        params: Record<string, string>,
      ) => void;
    };
    analyticsWindow.gtag?.("event", "generate_lead", {
      sector: vertical,
      method: "contact_form",
      source: "sector_site",
    });
  } catch {
    // La medición opcional no interrumpe el alta si el navegador la bloquea.
  }
}
