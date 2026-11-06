"use client";

import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCookieSettings } from "@/components/CookieConsent";

/** Reabre el panel de cookies para cambiar o retirar el consentimiento. */
export default function ManageCookiesButton() {
  return (
    <Button type="button" variant="dark" onClick={openCookieSettings} className="mt-5">
      <Settings2 className="h-4 w-4" aria-hidden="true" />
      Gestionar cookies
    </Button>
  );
}
