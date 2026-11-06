import { afterEach, describe, expect, it, vi } from "vitest";
import { trackSectorLead } from "@/lib/sector-conversion";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function browser(consent: string | null, installed = true) {
  const gtag = vi.fn();
  vi.stubEnv("NEXT_PUBLIC_GA_ID", "G-TEST");
  vi.stubGlobal("window", {
    localStorage: { getItem: () => consent },
    ...(installed ? { gtag } : {}),
  });
  return gtag;
}

describe("Conversión de contacto sectorial", () => {
  it("no mide antes del consentimiento ni después de retirarlo", () => {
    for (const consent of [null, "{}", '{"analytics":false}', "invalid"]) {
      const gtag = browser(consent);
      trackSectorLead("bar");
      expect(gtag).not.toHaveBeenCalled();
    }
  });

  it("mide contactos anónimos con consentimiento sin datos personales", () => {
    const gtag = browser('{"analytics":true}');
    trackSectorLead("hairdresser");
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "generate_lead", {
      sector: "hairdresser",
      method: "contact_form",
      source: "sector_site",
    });
  });

  it("tolera un bloqueador o una configuración de Analytics ausente", () => {
    browser('{"analytics":true}', false);
    expect(() => trackSectorLead("community")).not.toThrow();
    const gtag = browser('{"analytics":true}');
    vi.stubEnv("NEXT_PUBLIC_GA_ID", "");
    trackSectorLead("community");
    expect(gtag).not.toHaveBeenCalled();
  });
});
