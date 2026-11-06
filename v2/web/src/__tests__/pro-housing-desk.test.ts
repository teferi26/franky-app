import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, localDate, localMinutes } from "@/lib/pro/format";
import type { ProData, ProProperty, ProTenant } from "@/lib/pro/types";
import { visitSlots } from "@/lib/pro/housing";
import { waitlist } from "@/lib/pro/housing-plan";
import { contractHtml } from "@/lib/pro/housing-docs";
import { depositSurcharge, propertyPublicUrl } from "@/lib/pro/housing-tools";
import {
  bookPublicVisit,
  joinPublicWaitlist,
  otherListings,
  publicListing,
  publicVisitDays,
} from "@/lib/pro/housing-public";
import {
  INCIDENT_PHOTO_LIMIT,
  addIncidentPhotos,
  docsRequestText,
  guessTrade,
  hasStoredDocs,
  markDocsRequested,
  purgeTenantDocs,
  markReminded,
  missingDocs,
  providersByTrade,
  remindedToday,
  removeIncidentPhoto,
  rentReminderQueue,
  roomsVsWhole,
  roomsVsWholeText,
  suggestedProvider,
  temporalityProof,
  tenantContractInput,
} from "@/lib/pro/housing-desk";

/*
 * Ola de vivienda: ficha pública con visitas que se reservan solas, papeles
 * que se piden por WhatsApp, prueba de la temporada, recordatorios de renta,
 * técnicos por oficio, fotos de incidencias, recargo de la fianza y la
 * comparación de habitaciones con piso entero. Fecha fija: domingo.
 */
const now = new Date("2026-09-27T09:30:00Z");
const today = localDate(now);

function landlord(): ProData {
  return buildDemo("landlord", now);
}

function agency(): ProData {
  return buildDemo("agency", now);
}

const ids = (n: number) => ({ lead: `l-test-${n}`, visit: `v-test-${n}`, inbox: `in-test-${n}` });

describe("ficha pública del piso", () => {
  it("enseña las habitaciones libres o que se liberan, por fecha, y oculta los pisos sin publicar", () => {
    const d = agency();
    const hidden = d.properties.find((p) => !p.published);
    expect(hidden).toBeDefined();
    expect(publicListing(d, hidden!.id)).toBeNull();
    expect(publicListing(d, "no-existe")).toBeNull();

    const withFree = d.properties.find((p) => p.published && p.rooms.some((r) => r.status === "free"))!;
    const listing = publicListing(d, withFree.id)!;
    expect(listing.full).toBe(false);
    expect(listing.rooms.every((r) => r.status === "free" || r.status === "leaving")).toBe(true);
    const dates = listing.rooms.map((r) => r.availableFrom);
    expect([...dates].sort()).toEqual(dates);
    expect(listing.fromPriceCents).toBe(Math.min(...listing.rooms.map((r) => r.priceCents)));
    expect(otherListings(d, withFree.id).every((o) => o.property.id !== withFree.id && !o.full)).toBe(true);
  });

  it("reserva una visita confirmada que entra en Visitas y pasa al interesado a fase Visita", () => {
    const d = landlord();
    const property = d.properties.find((p) => publicListing(d, p.id) && !publicListing(d, p.id)!.full)!;
    const days = publicVisitDays(d, property.id, now);
    expect(days.length).toBeGreaterThan(0);
    const { date, slots } = days[0];

    const res = bookPublicVisit(
      d,
      property.id,
      { name: "  Nerea   Climent ", university: "Universidad de Alicante", moveIn: addDays(today, 10), months: 10, budgetCents: 34000, date, minute: slots[0], mode: "video", bookedBy: "parent" },
      now,
      ids(1),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lead).toMatchObject({ name: "Nerea Climent", stage: "visit", propertyId: property.id, verified: true, guarantor: true });
    expect(res.lead.roomId).toBeDefined();
    expect(res.visit).toMatchObject({ source: "public", status: "scheduled", mode: "video", leadId: res.lead.id });
    expect(res.visit.confirmedAt).toBeDefined();
    expect(localMinutes(res.visit.start)).toBe(slots[0]);
    expect(res.data.inbox[0]).toMatchObject({ kind: "booking", href: "visitas" });
    expect(res.data.leads.length).toBe(d.leads.length + 1);

    // La franja deja de estar libre y no se puede reservar dos veces.
    expect(visitSlots(res.data, date, now, property.agentId)).not.toContain(slots[0]);
    const again = bookPublicVisit(
      res.data,
      property.id,
      { name: "Otra Persona", university: "Universidad de Alicante", moveIn: today, months: 5, budgetCents: 30000, date, minute: slots[0], mode: "in_person" },
      now,
      ids(2),
    );
    expect(again).toEqual({ ok: false, reason: "slot_taken" });
  });

  it("reutiliza la ficha de quien ya era interesado en ese piso", () => {
    const d = landlord();
    const lead = d.leads.find((l) => l.propertyId && (l.stage === "new" || l.stage === "contacted") && publicListing(d, l.propertyId))!;
    expect(lead).toBeDefined();
    const [day] = publicVisitDays(d, lead.propertyId!, now);
    const res = bookPublicVisit(
      d,
      lead.propertyId!,
      { name: lead.name.toUpperCase(), university: lead.university, moveIn: lead.moveIn, months: lead.months, budgetCents: lead.budgetCents, date: day.date, minute: day.slots[0], mode: "in_person" },
      now,
      ids(3),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.leads.length).toBe(d.leads.length);
    expect(res.data.leads.find((l) => l.id === lead.id)?.stage).toBe("visit");
    expect(res.visit.leadId).toBe(lead.id);
  });

  it("rechaza nombres vacíos y pisos ocultos", () => {
    const d = agency();
    const hidden = d.properties.find((p) => !p.published)!;
    const visible = d.properties.find((p) => p.published)!;
    const base = { university: "Universidad de Alicante", moveIn: today, months: 10, budgetCents: 30000, date: addDays(today, 1), minute: 18 * 60, mode: "in_person" as const };
    expect(bookPublicVisit(d, hidden.id, { ...base, name: "Ana Pérez" }, now, ids(4))).toEqual({ ok: false, reason: "missing" });
    expect(bookPublicVisit(d, visible.id, { ...base, name: " " }, now, ids(5))).toEqual({ ok: false, reason: "invalid" });
  });

  it("con el piso lleno, apuntarse deja a la persona en la lista de espera", () => {
    const d = landlord();
    const property = d.properties.find((p) => p.published)!;
    const res = joinPublicWaitlist(d, property.id, { name: "Hugo Sempere", university: "Universidad Miguel Hernández", moveIn: addDays(today, 90), months: 5, budgetCents: 40000 }, now, ids(6));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(waitlist(res.data).map((l) => l.id)).toContain("l-test-6");
    expect(res.data.inbox[0]).toMatchObject({ kind: "lead", href: "curso" });
  });

  it("el enlace del cartel apunta a franky.es y en la web al sitio en el que se está", () => {
    expect(propertyPublicUrl("pisos-de-carmen", "p1")).toBe("https://franky.es/n/pisos-de-carmen?piso=p1");
    expect(propertyPublicUrl("pisos-de-carmen", "p1", "http://localhost:3000/")).toBe("http://localhost:3000/n/pisos-de-carmen?piso=p1");
  });
});

describe("papeles y prueba de la temporada", () => {
  it("pide por WhatsApp solo lo que falta y no toca lo recibido", () => {
    const d = landlord();
    const docs = { items: { id: { status: "received" as const, at: today }, enrolment: { status: "requested" as const, at: today } } };
    expect(missingDocs(docs).map((k) => k.id)).toEqual(["enrolment", "guarantor", "insurance"]);
    const text = docsRequestText(d, "Lucía Pastor", docs);
    expect(text).toContain("Hola Lucía");
    expect(text).toContain("la matrícula");
    expect(text).not.toContain("DNI o NIE");

    const all = { items: { id: { status: "received" as const }, enrolment: { status: "received" as const }, guarantor: { status: "received" as const }, insurance: { status: "received" as const } } };
    expect(docsRequestText(d, "Lucía Pastor", all)).toBe("");

    const next = markDocsRequested(docs, "2026-09-27T10:00:00.000Z");
    expect(next.items.id).toEqual({ status: "received", at: today });
    expect(next.items.guarantor?.status).toBe("requested");
  });

  it("un contrato de temporada necesita la matrícula; uno de habitación no", () => {
    expect(temporalityProof("habitacion", undefined)).toEqual({ needed: false, ok: true });
    expect(temporalityProof("temporada", undefined)).toMatchObject({ needed: true, ok: false });
    expect(temporalityProof("temporada", { items: { enrolment: { status: "requested", at: "2026-09-20" } } })).toMatchObject({ ok: false, requestedAt: "2026-09-20" });
    expect(temporalityProof("temporada", { items: { enrolment: { status: "received", at: "2026-09-01" } } })).toMatchObject({ ok: true, receivedAt: "2026-09-01" });
  });

  it("el contrato del inquilino se reimprime con sus meses y cita la matrícula guardada", () => {
    const d = landlord();
    const t: ProTenant = {
      ...d.tenants[0],
      contractKind: "temporada",
      contractStart: "2026-09-01",
      contractEnd: "2027-06-30",
      docs: { items: { enrolment: { status: "received", at: "2026-08-20" } } },
    };
    const input = tenantContractInput(d, t)!;
    expect(input.contract.months).toBe(10);
    expect(input.contract.kind).toBe("temporada");
    expect(contractHtml(d, input)).toContain("acredita este motivo con su matrícula");
    expect(contractHtml(d, { ...input, docs: undefined })).not.toContain("acredita este motivo");
  });
});

describe("borrar papeles al acabar", () => {
  it("solo vacía los papeles cuando la salida está cerrada", () => {
    const d = landlord();
    const base = { ...d.tenants[0], docs: { items: { id: { status: "received" as const } }, guarantor: { name: "Antonio" } } };
    const living = { ...d, tenants: [base, ...d.tenants.slice(1)] };
    expect(purgeTenantDocs(living, base.id).tenants[0].docs).toBeDefined();
    const gone = { ...base, moveOut: { date: today, closedAt: now.toISOString(), checks: {}, deductions: [] } } as unknown as ProTenant;
    expect(hasStoredDocs(gone)).toBe(true);
    const next = purgeTenantDocs({ ...d, tenants: [gone, ...d.tenants.slice(1)] }, gone.id);
    expect(next.tenants[0].docs).toBeUndefined();
    expect(hasStoredDocs(next.tenants[0])).toBe(false);
  });
});

describe("recordar la renta", () => {
  it("pone primero a quien va con retraso, con el mensaje escrito, y apunta el recordatorio", () => {
    const d = agency();
    const queue = rentReminderQueue(d, now);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((r) => r.tenant.rentStatus !== "paid")).toBe(true);
    const firstOnTime = queue.findIndex((r) => !r.late);
    if (firstOnTime >= 0) expect(queue.slice(firstOnTime).every((r) => !r.late)).toBe(true);
    expect(queue[0].text).toContain(queue[0].tenant.name.split(" ")[0]);

    const id = queue[0].tenant.id;
    const next = markReminded(d, [id], now.toISOString());
    const tenant = next.tenants.find((t) => t.id === id)!;
    expect(remindedToday(tenant, now)).toBe(true);
    expect(remindedToday(tenant, new Date("2026-09-29T09:00:00Z"))).toBe(false);
  });
});

describe("fianza fuera de plazo", () => {
  it("cuenta los días de retraso y enseña la horquilla del 5 al 20 %", () => {
    const d = landlord();
    const t: ProTenant = { ...d.tenants[0], deposit: { amountCents: 70000, status: "pending", dueAt: addDays(today, -6) } };
    expect(depositSurcharge(t, today)).toEqual({ lateDays: 6, minCents: 3500, maxCents: 14000 });
    expect(depositSurcharge({ ...t, deposit: { ...t.deposit, dueAt: addDays(today, 3) } }, today)).toBeNull();
    expect(depositSurcharge({ ...t, deposit: { ...t.deposit, status: "lodged" } }, today)).toBeNull();
  });
});

describe("técnicos e incidencias", () => {
  it("agrupa los técnicos por oficio y adivina el oficio por el título", () => {
    const d = agency();
    const groups = providersByTrade(d, now);
    expect(groups.map((g) => g.trade)).toContain("fontaneria");
    expect(groups.every((g) => g.rows.every((r) => r.provider.trade === g.trade))).toBe(true);
    expect(guessTrade("No hay agua caliente")).toBe("calderas");
    expect(guessTrade("Gotea el grifo de la cocina")).toBe("fontaneria");
    expect(guessTrade("Se ha roto la cerradura")).toBe("cerrajeria");
    expect(guessTrade("Quiero cambiar de habitación")).toBeNull();
    expect(suggestedProvider(d, { title: "La caldera no enciende" }, now)?.provider.trade).toBe("calderas");
  });

  it("guarda como mucho cuatro fotos por incidencia y deja quitarlas", () => {
    const d = landlord();
    const inc = d.incidents[0];
    const photos = Array.from({ length: 6 }, (_, i) => `data:image/jpeg;base64,${i}`);
    const withPhotos = addIncidentPhotos(d, inc.id, photos);
    const saved = withPhotos.incidents.find((i) => i.id === inc.id)!;
    expect(saved.photoUrls).toHaveLength(INCIDENT_PHOTO_LIMIT);
    const after = removeIncidentPhoto(withPhotos, inc.id, 0).incidents.find((i) => i.id === inc.id)!;
    expect(after.photoUrls).toHaveLength(INCIDENT_PHOTO_LIMIT - 1);
    expect(after.photoUrls?.[0]).toBe(photos[1]);
    expect(after.photos).toBe(INCIDENT_PHOTO_LIMIT - 1);
  });
});

describe("habitaciones frente a piso entero", () => {
  const property = (rents: number[], whole?: number): ProProperty => ({
    id: "px",
    title: "Piso de prueba",
    address: "Calle Mayor 1",
    zone: "San Vicente centro",
    minutesToCampus: 8,
    photos: 0,
    views30: 0,
    published: true,
    wholeFlatReferenceCents: whole,
    rooms: rents.map((priceCents, i) => ({ id: `r${i}`, name: `Habitación ${i + 1}`, sizeM2: 11, priceCents, status: "free", availableFrom: today, exterior: true, privateBath: false })),
  });

  it("suma las habitaciones y dice cuántos meses vacíos aguanta", () => {
    const c = roomsVsWhole(property([30000, 30000, 30000, 30000], 100000))!;
    expect(c).toEqual({ roomsCents: 120000, wholeCents: 100000, diffCents: 20000, diffPct: 20, emptyRoomMonths: 8 });
    expect(roomsVsWholeText(c)).toContain("8 meses");
    expect(roomsVsWhole(property([30000]))).toBeNull();
    const worse = roomsVsWhole(property([20000, 20000], 50000))!;
    expect(worse.diffCents).toBe(-10000);
    expect(worse.emptyRoomMonths).toBe(0);
    expect(roomsVsWholeText(worse)).toContain("menos que el piso entero");
  });

  it("la demo de propietaria trae la renta de referencia de cada piso", () => {
    const d = landlord();
    expect(d.properties.every((p) => roomsVsWhole(p) !== null)).toBe(true);
  });
});
