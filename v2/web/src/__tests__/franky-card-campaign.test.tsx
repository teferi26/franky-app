import { describe, it, expect } from "vitest";
import { campaignFormData } from "@/components/card/card-campaign";
import { cardCampaignConditions } from "../../../shared/franky-card";
const form = (values: Record<string, string | string[] | undefined>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values))
    if (v !== undefined)
      for (const value of Array.isArray(v) ? v : [v]) f.append(k, value);
  return f;
};
describe("campaign terms accepted by the merchant", () => {
  it("never submits campaign restrictions for the continuous base advantage", () => {
    expect(
      campaignFormData(form({ kind: "base", budget: "10", scheduled: "on" })),
    ).toEqual({});
  });
  it("uses exact cents, selected weekdays and midnight at the end of the local day", () => {
    expect(
      campaignFormData(
        form({
          kind: "campaign",
          budget: "10,25",
          max_redemptions: "20",
          max_per_user: "2",
          scheduled: "on",
          campaign_days: ["5", "6"],
          window_start: "22:00",
          window_end: "00:00",
        }),
      ),
    ).toEqual({
      budget_cents: 1025,
      max_redemptions: 20,
      max_per_user: 2,
      validity_windows: [
        { weekday: 5, start_minute: 1320, end_minute: 1440 },
        { weekday: 6, start_minute: 1320, end_minute: 1440 },
      ],
    });
  });
  it.each([
    { scheduled: "on", window_start: "10:00", window_end: "12:00" },
    {
      scheduled: "on",
      campaign_days: "2",
      window_start: "12:00",
      window_end: "12:00",
    },
    { budget: "0" },
    { budget: "10.001" },
    { max_per_user: "1.1" },
    { max_redemptions: "-1" },
  ])("rejects ambiguous or invalid restriction %j", (values) => {
    expect(() =>
      campaignFormData(form({ kind: "campaign", ...values })),
    ).toThrow("card_invalid_input");
  });
  it("makes recurring overnight schedules and exhausted-budget conditions visible before consent", () => {
    const conditions = cardCampaignConditions({
      kind: "campaign",
      max_redemptions: 10,
      max_per_user: 2,
      budget_cents: 1000,
      validity_windows: [{ weekday: 6, start_minute: 1320, end_minute: 120 }],
      timezone: "Atlantic/Canary",
    });
    expect(conditions).toContain("Hasta agotar el presupuesto de la campaña");
    expect(conditions).toContain(
      "Sáb 22:00–02:00 del día siguiente (Atlantic/Canary)",
    );
  });
});
