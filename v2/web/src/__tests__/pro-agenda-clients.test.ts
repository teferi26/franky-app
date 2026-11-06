import { describe, expect, it } from "vitest";
import {
  addFormula,
  atRisk,
  birthdaysSoon,
  cadenceOf,
  canPromote,
  comebackMessage,
  dueThisWeek,
  healthAlerts,
  lastFormula,
  needsPatchTest,
  pendingSignature,
  recordPatchTest,
  saveHealth,
  setConsent,
  signConsent,
  suggestSlot,
} from "@/lib/pro/agenda-clients";
import { saveConsentTemplate } from "@/lib/pro/agenda-ops";
import { atLocal } from "@/lib/pro/format";
import type { ProData } from "@/lib/pro/types";
import { NOW, TODAY, agendaFixture, booking, client } from "./pro-agenda-fixture";

const LONG_DASH = /[–—]/;

/** Visitas cada 21 días de degradado con Dani, la última hace `lastAgo` días. */
function withVisits(data: ProData, clientId: string, count: number, lastAgo: number) {
  const visits = Array.from({ length: count }, (_, i) => ({
    at: new Date(NOW.getTime() - (lastAgo + (count - 1 - i) * 21) * 86400000).toISOString(),
    serviceId: "sv2",
    staffId: "s1",
  }));
  data.clients = data.clients.map((c) =>
    c.id === clientId ? { ...c, agenda: { ...c.agenda, visits } } : c,
  );
  return data;
}

describe("fichas: ritmo de vuelta", () => {
  it("usa su propio ritmo con tres visitas y el del servicio si no", () => {
    let data = withVisits(agendaFixture(), "c1", 4, 10);
    expect(cadenceOf(data, "c1")).toEqual({ days: 21, source: "client" });
    data = withVisits(data, "c2", 1, 10);
    // Degradado: vuelve cada 3 semanas.
    expect(cadenceOf(data, "c2")).toEqual({ days: 21, source: "service" });
  });

  it("le toca volver esta semana y deja de salir si ya tiene cita", () => {
    const data = withVisits(agendaFixture(), "c1", 4, 22);
    const due = dueThisWeek(data, NOW);
    expect(due.map((r) => r.client.id)).toEqual(["c1"]);
    expect(due[0].lateDays).toBe(1);
    const slot = suggestSlot(data, due[0], NOW);
    expect(slot?.staffId).toBe("s1");
    const text = comebackMessage(data, due[0], slot);
    expect(text).toContain("Pablo");
    expect(text).not.toMatch(LONG_DASH);
    data.bookings = [booking("next", "2026-09-26", 10 * 60)];
    expect(dueThisWeek(data, NOW)).toEqual([]);
  });

  it("detecta al fiel que ha roto su costumbre", () => {
    const data = withVisits(agendaFixture(), "c1", 5, 45);
    const risk = atRisk(data, NOW);
    expect(risk.map((r) => r.client.id)).toEqual(["c1"]);
    expect(risk[0].yearlyCents).toBeGreaterThan(0);
  });
});

describe("fichas: cumpleaños y permisos", () => {
  it("encuentra los cumpleaños de la semana", () => {
    const data = agendaFixture();
    data.clients.push(client("c3", "Irene Soler", { birthday: "2001-09-26" }));
    data.clients.push(client("c4", "Nerea Vidal", { birthday: "10-20" }));
    const rows = birthdaysSoon(data, NOW, 7);
    expect(rows.map((r) => [r.client.id, r.date, r.today])).toEqual([["c3", "2026-09-26", false]]);
  });

  it("los permisos se guardan con fecha y mandan sobre el antiguo", () => {
    let data = agendaFixture();
    expect(canPromote(data.clients[0])).toBe(true);
    data = setConsent(data, "c1", "marketing", false, NOW.toISOString(), "Dani");
    expect(canPromote(data.clients[0])).toBe(false);
    expect(data.clients[0].marketingConsent).toBe(false);
    expect(data.clients[0].agenda?.consents?.marketing).toEqual({ granted: false, at: NOW.toISOString(), by: "Dani" });
  });
});

describe("fichas: color, prueba, salud y firma", () => {
  it("la última fórmula es la más reciente", () => {
    let data = agendaFixture();
    const base = { brand: "Majirel", oxidant: "20 vol", processMin: 35, zone: "Raíz" };
    data = addFormula(data, "c2", { id: "f1", at: "2026-07-01T10:00:00.000Z", mix: "6.0", ...base });
    data = addFormula(data, "c2", { id: "f2", at: "2026-08-20T10:00:00.000Z", mix: "7.1 + 8.1 (1:1)", ...base });
    expect(lastFormula(data.clients[1])?.id).toBe("f2");
  });

  it("pide prueba de sensibilidad si no hay una vigente para el color", () => {
    let data = agendaFixture();
    const color = data.services.find((s) => s.id === "sv6");
    const cut = data.services.find((s) => s.id === "sv2");
    expect(needsPatchTest(data, data.clients[1], color, TODAY)).toBe(true);
    expect(needsPatchTest(data, data.clients[1], cut, TODAY)).toBe(false);
    data = recordPatchTest(data, "c2", atLocal("2026-09-20", 10 * 60));
    expect(needsPatchTest(data, data.clients[1], color, TODAY)).toBe(false);
    // Vale 180 días: en abril ya no.
    expect(needsPatchTest(data, data.clients[1], color, "2027-04-01")).toBe(true);
  });

  it("enseña las alergias antes de empezar", () => {
    const data = saveHealth(agendaFixture(), "c2", {
      allergies: ["ppd", "latex"],
      pregnancy: true,
      updatedAt: NOW.toISOString(),
    });
    expect(healthAlerts(data.clients[1])).toEqual(["Alergia: Tintes (PPD)", "Alergia: Látex", "Embarazo"]);
  });

  it("el consentimiento queda pendiente hasta que se firma", () => {
    let data = saveConsentTemplate(agendaFixture(), { id: "cs", title: "Láser", body: "Texto del consentimiento de láser." });
    data.services = data.services.map((s) => (s.id === "sv5" ? { ...s, agenda: { consentId: "cs" } } : s));
    const service = data.services.find((s) => s.id === "sv5");
    expect(pendingSignature(data, data.clients[0], service)?.id).toBe("cs");
    data = signConsent(data, "c1", { id: "sg", consentId: "cs", at: NOW.toISOString(), signature: "data:image/png;base64,AAA" });
    expect(pendingSignature(data, data.clients[0], service)).toBeNull();
  });
});
