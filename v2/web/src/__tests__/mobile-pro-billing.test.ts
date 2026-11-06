import { describe, expect, it } from "vitest";
import {
  FREE_SHOWCASE,
  coversVertical,
  isSectionLocked,
  parseProAccess,
  planStrip,
  planStripText,
  productForVertical,
  proGains,
  purchaseErrorKind,
  renewalNotice,
  trialDaysLeft,
  type ProAccess,
} from "../../../mobile/src/pro/billing/logic";
import { PRO_ENGINE_GAINS } from "../../../shared/pro/iap";

const NOW = Date.parse("2026-09-25T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function access(over: Partial<ProAccess> = {}): ProAccess {
  return { pro: false, status: null, tier: null, productId: null, expiresAt: null, isTrial: false, trialEligible: true, ...over };
}

describe("Franky Pro de pago en la app", () => {
  it("lee el jsonb de get_my_pro_access y la respuesta envuelta del servidor", () => {
    const raw = {
      pro: true,
      status: "trialing",
      tier: "m29",
      product_id: "es.franky.app.pro.m29",
      expires_at: "2026-10-01T10:00:00Z",
      is_trial: true,
      trial_eligible: false,
    };
    expect(parseProAccess(raw)).toEqual({
      pro: true,
      status: "trialing",
      tier: "m29",
      productId: "es.franky.app.pro.m29",
      expiresAt: "2026-10-01T10:00:00Z",
      isTrial: true,
      trialEligible: false,
    });
    expect(parseProAccess({ access: raw })?.tier).toBe("m29");
    // Sin forma conocida: desconocido, nunca "sin Pro".
    expect(parseProAccess(null)).toBeNull();
    expect(parseProAccess({ error: "boom" })).toBeNull();
    expect(parseProAccess({ pro: false, status: "raro" })?.status).toBeNull();
  });

  it("cuenta los días de prueba hacia arriba y solo en prueba vigente", () => {
    const trial = (ms: number) => access({ pro: true, isTrial: true, expiresAt: new Date(NOW + ms).toISOString() });
    expect(trialDaysLeft(trial(7 * DAY), NOW)).toBe(7);
    expect(trialDaysLeft(trial(2 * DAY + 60_000), NOW)).toBe(3);
    expect(trialDaysLeft(trial(60_000), NOW)).toBe(1);
    expect(trialDaysLeft(trial(-60_000), NOW)).toBeNull();
    expect(trialDaysLeft(access({ pro: true, expiresAt: new Date(NOW + DAY).toISOString() }), NOW)).toBeNull();
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });

  it("solo cierra secciones de pago en negocios reales con acceso conocido y sin Pro", () => {
    const free = access();
    expect(isSectionLocked({ demo: false, access: free, section: "agenda", vertical: "hairdresser" })).toBe(true);
    for (const section of ["hoy", "ajustes", "guia", "validar"] as const) {
      expect(isSectionLocked({ demo: false, access: free, section, vertical: "hairdresser" })).toBe(false);
    }
    expect(isSectionLocked({ demo: true, access: free, section: "agenda", vertical: "hairdresser" })).toBe(false);
    expect(isSectionLocked({ demo: false, access: null, section: "agenda", vertical: "hairdresser" })).toBe(false);
    expect(isSectionLocked({ demo: false, access: access({ pro: true }), section: "agenda", vertical: "hairdresser" })).toBe(false);
    // La universidad va por contrato, sin App Store: nunca candado.
    expect(isSectionLocked({ demo: false, access: free, section: "publicaciones", vertical: "university" })).toBe(false);
  });

  it("pinta la franja de Hoy según el plan", () => {
    const base = { demo: false, vertical: "restaurant" as const, now: NOW };
    const free = planStrip({ ...base, access: access() });
    expect(free).toEqual({ kind: "free", trialEligible: true });
    expect(planStripText(free!)).toBe("Plan gratis · Prueba Pro 7 días gratis");
    expect(planStripText({ kind: "free", trialEligible: false })).toBe("Plan gratis · Pásate a Pro");
    const trial = planStrip({ ...base, access: access({ pro: true, isTrial: true, expiresAt: new Date(NOW + 3 * DAY).toISOString() }) });
    expect(planStripText(trial!)).toBe("Prueba Pro: te quedan 3 días");
    expect(planStripText({ kind: "trial", days: 1 })).toBe("Prueba Pro: te queda 1 día");
    expect(planStrip({ ...base, access: access({ pro: true, expiresAt: new Date(NOW + 20 * DAY).toISOString() }) })).toBeNull();
    expect(planStrip({ ...base, demo: true, access: access() })).toBeNull();
    expect(planStrip({ ...base, access: null })).toBeNull();
  });

  it("enseña lo que gana cada sector y el texto de renovación de Apple", () => {
    expect(FREE_SHOWCASE).toHaveLength(4);
    const gains = proGains("hairdresser");
    expect(gains.slice(0, PRO_ENGINE_GAINS.agenda.length)).toEqual(PRO_ENGINE_GAINS.agenda);
    expect(new Set(gains).size).toBe(gains.length);
    expect(productForVertical("nightclub")).toBe("es.franky.app.pro.m49");
    expect(productForVertical("university")).toBeNull();
    expect(renewalNotice("34,99 €", true)).toBe(
      "7 días gratis, después 34,99 € al mes. La suscripción se renueva automáticamente cada mes hasta que la canceles en Ajustes > tu nombre > Suscripciones, al menos 24 horas antes de que acabe el periodo. Si cancelas durante la prueba no se te cobra.",
    );
    expect(renewalNotice("34,99 €", false)).not.toContain("prueba");
    for (const text of [...gains, ...FREE_SHOWCASE, renewalNotice("1 €", true)]) expect(text).not.toMatch(/[—–]/);
  });

  it("no trata la cancelación como un fallo", () => {
    expect(purchaseErrorKind({ code: "user-cancelled" })).toBe("cancelled");
    expect(purchaseErrorKind({ code: "E_USER_CANCELLED" })).toBe("cancelled");
    expect(purchaseErrorKind({ code: "deferred-payment" })).toBe("pending");
    expect(purchaseErrorKind({ code: "network-error" })).toBe("failed");
    expect(purchaseErrorKind(new Error("x"))).toBe("failed");
  });

  it("el plan tiene que llegar al nivel del sector", () => {
    const cheap = access({ pro: true, status: "active", tier: "m19" });
    expect(coversVertical(cheap, "cafe")).toBe(true);
    expect(coversVertical(cheap, "nightclub")).toBe(false);
    expect(isSectionLocked({ demo: false, access: cheap, section: "eventos", vertical: "nightclub" })).toBe(true);
    expect(isSectionLocked({ demo: false, access: cheap, section: "hoy", vertical: "nightclub" })).toBe(false);
    expect(coversVertical(access({ pro: true, status: "active", tier: "m80" }), "hairdresser")).toBe(true);
    expect(coversVertical(access({ pro: true, status: "active", viaTeam: true }), "nightclub")).toBe(true);
    expect(coversVertical(access({ pro: false, tier: "m80" }), "cafe")).toBe(false);
  });
});
