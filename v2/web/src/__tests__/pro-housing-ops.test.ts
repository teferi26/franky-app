import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, localDate } from "@/lib/pro/format";
import type { ProData, ProLead, ProTenant } from "@/lib/pro/types";
import {
  businessDaysUntil,
  closeMoveOut,
  courseRange,
  depositCountdown,
  housingDeadlines,
  housingOpsOf,
  inboxBuckets,
  leadFit,
  markMonthPaid,
  monthKey,
  newMoveOut,
  occupancyGrid,
  ownerStatement,
  proposedRent,
  recordReply,
  rentLedger,
  replyTemplates,
  reserveWholeFlat,
  roomSegments,
  settlement,
  signGroup,
  splitBill,
  tomorrowVisits,
  whatsappHref,
} from "@/lib/pro/housing-ops";

/*
 * Lógica del motor de vivienda que usan inmobiliarias y propietarios: bandeja,
 * respuestas por WhatsApp, fianza, cobros, suministros, salida y grupos.
 * Fecha fija para que el calendario del curso no dependa del día en que se pasa.
 */
const now = new Date("2026-09-27T09:30:00Z");
const today = localDate(now);

function agency(): ProData {
  return buildDemo("agency", now);
}

function tenantWith(data: ProData, fn: (t: ProTenant) => boolean) {
  const t = data.tenants.find(fn);
  if (!t) throw new Error("La demo no tiene el inquilino que necesita el test");
  return t;
}

describe("fianza y días hábiles", () => {
  it("no cuenta fines de semana ni festivos nacionales", () => {
    // Del viernes 9 de octubre de 2026 al martes 13: el lunes 12 es fiesta nacional.
    expect(businessDaysUntil("2026-10-09", "2026-10-13")).toBe(1);
    expect(businessDaysUntil("2026-10-13", "2026-10-09")).toBe(-1);
  });

  it("avisa cuando quedan siete días o menos y cuando ya ha vencido", () => {
    const d = agency();
    const t = { ...d.tenants[0], deposit: { ...d.tenants[0].deposit, dueAt: addDays(today, 5) } };
    expect(depositCountdown(t, today)).toMatchObject({ urgent: true, overdue: false, days: 5 });
    const late = { ...t, deposit: { ...t.deposit, dueAt: addDays(today, -2) } };
    expect(depositCountdown(late, today).overdue).toBe(true);
  });
});

describe("bandeja de interesados", () => {
  it("separa quien encaja de quien no, con el motivo escrito", () => {
    const d = agency();
    const { fit, out } = inboxBuckets(d);
    expect(fit.length + out.length).toBe(d.leads.filter((l) => l.stage === "new" || l.stage === "contacted").length);
    for (const e of fit) expect(e.fit.reasons.length).toBeGreaterThan(0);
    for (const e of out) expect(e.fit.issues.length).toBeGreaterThan(0);
  });

  it("no ofrece nada a quien no llega al precio de ninguna habitación", () => {
    const d = agency();
    const poor: ProLead = { ...d.leads[0], id: "l-poor", budgetCents: 5000, roomieGroup: undefined, propertyId: undefined, roomId: undefined };
    const fit = leadFit({ ...d, leads: [...d.leads, poor] }, poor);
    expect(fit.fits).toBe(false);
    expect(fit.issues.join(" ")).toMatch(/más de su presupuesto|Ninguna habitación/);
  });
});

describe("respuestas por WhatsApp", () => {
  it("escribe el nombre del interesado y pasa de nuevo a contactado", () => {
    const d = agency();
    const lead = d.leads.find((l) => l.stage === "new")!;
    const templates = replyTemplates(d, lead, now, false);
    expect(templates.map((t) => t.id)).toEqual(["visit", "terms", "docs", "full"]);
    expect(templates[0].text).toContain(lead.name.split(" ")[0]);
    const docs = templates.find((t) => t.id === "docs")!;
    const next = recordReply(d, lead.id, docs, now.toISOString());
    const after = next.leads.find((l) => l.id === lead.id)!;
    expect(after.stage).toBe("contacted");
    expect(after.docs?.items.id?.status).toBe("requested");
  });

  it("pone el prefijo de España a un móvil de nueve cifras", () => {
    expect(whatsappHref("Hola", "611 450 732")).toBe("https://wa.me/34611450732?text=Hola");
  });
});

describe("visitas de mañana", () => {
  it("cuenta las que faltan por confirmar", () => {
    const d = agency();
    const t = tomorrowVisits(d, now);
    expect(t.unconfirmed.length).toBeLessThanOrEqual(t.list.length);
    expect(t.list.every((v) => localDate(v.start) === addDays(today, 1))).toBe(true);
  });
});

describe("calendario del curso", () => {
  it("cada habitación cubre el curso entero sin huecos ni solapes", () => {
    const d = agency();
    const range = courseRange(2026);
    for (const row of occupancyGrid(d, 2026)) {
      expect(row.segments[0].from).toBe(range.from);
      expect(row.segments.at(-1)!.to).toBe(range.to);
      for (let i = 1; i < row.segments.length; i++) expect(row.segments[i].from).toBe(addDays(row.segments[i - 1].to, 1));
    }
  });

  it("julio y agosto de una habitación de verano salen como verano", () => {
    const d = agency();
    const property = d.properties[0];
    const room = { ...property.rooms[0], summer: true };
    const empty = { ...d, tenants: [], leads: [] };
    const segs = roomSegments(empty, property, room, courseRange(2026));
    expect(segs.map((s) => s.kind)).toEqual(["gap", "summer"]);
    expect(segs[1]).toMatchObject({ from: "2027-07-01", to: "2027-08-31" });
  });
});

describe("cobros mes a mes", () => {
  it("marcar cobrado el mes en curso actualiza también el estado del inquilino", () => {
    const d = agency();
    const t = tenantWith(d, (x) => x.rentStatus !== "paid" && x.contractStart.slice(0, 10) <= today && x.contractEnd.slice(0, 10) >= today);
    const month = monthKey(today);
    const paid = markMonthPaid(t, month, now);
    expect(paid.rentStatus).toBe("paid");
    expect(rentLedger(paid, now).find((m) => m.month === month)?.status).toBe("paid");
  });
});

describe("suministros", () => {
  it("el reparto suma exactamente la factura y respeta el tope", () => {
    const d = agency();
    for (const bill of housingOpsOf(d).utilities) {
      const shares = splitBill(d, bill);
      if (!shares.length) continue;
      const total = shares.reduce((a, s) => a + s.cents + s.overCapCents, 0);
      expect(total).toBe(bill.amountCents);
    }
  });
});

describe("salida y fianza", () => {
  it("descuenta los daños y nunca devuelve menos de cero", () => {
    const d = agency();
    const t = d.tenants[0];
    const mo = { ...newMoveOut(t), deductions: [{ id: "x", label: "Silla rota", amountCents: 4000 }] };
    expect(settlement(t, mo).returnCents).toBe(t.deposit.amountCents - 4000);
    const huge = { ...mo, deductions: [{ id: "y", label: "Todo", amountCents: t.deposit.amountCents * 3 }] };
    expect(settlement(t, huge).returnCents).toBe(0);
  });

  it("cerrar la salida devuelve la fianza y las llaves a la oficina", () => {
    const d = agency();
    const t = tenantWith(d, (x) => housingOpsOf(d).keys.some((k) => k.tenantId === x.id));
    const next = closeMoveOut(d, t.id, { ...newMoveOut(t), checks: { keys: true, photos: true, meters: true, room: true } }, now);
    expect(next.tenants.find((x) => x.id === t.id)?.deposit.status).toBe("returned");
    expect(housingOpsOf(next).keys.some((k) => k.tenantId === t.id)).toBe(false);
  });
});

describe("plazos y propietarios", () => {
  it("los plazos salen ordenados por fecha", () => {
    const list = housingDeadlines(agency(), now, 90);
    const dates = list.map((x) => x.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("la liquidación al propietario resta honorarios y gastos", () => {
    const d = agency();
    const owner = housingOpsOf(d).owners[0];
    const month = monthKey(addDays(`${monthKey(today)}-01`, -1));
    const s = ownerStatement(d, owner, month, now);
    expect(s.netCents).toBe(s.rentCents - s.feeCents - s.expensesCents);
    expect(s.feeCents).toBe(s.lines.reduce((a, l) => a + Math.round(l.rentCents * owner.feePct), 0));
  });

  it("la subida de renta se redondea a 5 euros", () => {
    expect(proposedRent(36000, 3)).toBe(37000);
    expect(proposedRent(36000, 0)).toBe(36000);
  });
});

describe("grupos de Roomie", () => {
  it("reservar el piso entero y firmar crea un inquilino por persona", () => {
    const d = agency();
    const property = d.properties.find((p) => p.rooms.length >= 3)!;
    const freeFlat = {
      ...d,
      tenants: d.tenants.filter((t) => t.propertyId !== property.id),
      properties: d.properties.map((p) =>
        p.id === property.id ? { ...p, rooms: p.rooms.map((r) => ({ ...r, status: "free" as const, tenantId: undefined, availableFrom: today })) } : p,
      ),
    };
    const lead: ProLead = {
      ...d.leads[0],
      id: "l-group",
      stage: "contacted",
      roomieGroup: { size: 3, compatibility: 88, names: ["Ana", "Berta", "Carla"] },
    };
    const start = addDays(today, 10);
    const reserved = reserveWholeFlat({ ...freeFlat, leads: [...freeFlat.leads, lead] }, lead.id, property.id, start, now.toISOString());
    expect(reserved.leads.find((l) => l.id === lead.id)?.stage).toBe("reserved");
    const signed = signGroup(reserved, lead.id, now);
    const tenants = signed.tenants.filter((t) => t.propertyId === property.id);
    expect(tenants).toHaveLength(3);
    expect(tenants.every((t) => t.deposit.status === "pending")).toBe(true);
  });
});
