"use client";

import { useEffect } from "react";
import { captureFromUrlIfFirstTouch } from "@/lib/attribution";

// Captura UTMs + referrer del primer aterrizaje y los guarda en localStorage.
// First-touch: si ya hay attribution vigente (30 días), no se sobrescribe.
export default function AttributionTracker() {
  useEffect(() => {
    captureFromUrlIfFirstTouch();
    const url = new URL(window.location.href);
    const legacy = url.searchParams.get('ref');
    // Legacy personal invitations used a UUID. Marketing QR campaign names keep
    // their previous attribution behavior and never become remunerated referrals.
    if (legacy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(legacy)) {
      window.location.replace(`/r/${encodeURIComponent(legacy)}`);
    }
  }, []);
  return null;
}
