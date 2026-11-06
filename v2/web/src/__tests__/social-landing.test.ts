import { describe, expect, it } from "vitest";
import { isSocialCampaignVisit } from "@/lib/social-landing";

describe("isSocialCampaignVisit", () => {
  it("detecta Instagram y TikTok por utm_source", () => {
    expect(isSocialCampaignVisit({ utm_source: "instagram" })).toBe(true);
    expect(isSocialCampaignVisit({ utm_source: "TikTok" })).toBe(true);
    expect(isSocialCampaignVisit({ utm_source: "ig" })).toBe(true);
  });

  it("detecta medio social o cualquier campaña", () => {
    expect(isSocialCampaignVisit({ utm_medium: "social" })).toBe(true);
    expect(isSocialCampaignVisit({ utm_campaign: "bienvenida-ua" })).toBe(true);
    expect(isSocialCampaignVisit({ ref: "qr" })).toBe(true);
  });

  it("el tráfico orgánico o directo mantiene el hero de catálogo", () => {
    expect(isSocialCampaignVisit({})).toBe(false);
    expect(isSocialCampaignVisit(undefined)).toBe(false);
    expect(isSocialCampaignVisit({ utm_source: "google" })).toBe(false);
    expect(isSocialCampaignVisit({ buscar: "medicina" })).toBe(false);
  });
});
