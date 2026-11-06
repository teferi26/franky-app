import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { addDays, weekdayIndex } from "@/lib/pro/format";
import { MARKETPLACE_TICKET_FEE, nightFranky } from "@/lib/pro/night";
import type { ProEvent } from "@/lib/pro/types";
import {
  EMPTY_NIGHT_OPS,
  applyRepeatWeekly,
  barCompareLabel,
  diffLabel,
  diffTone,
  isKaraokeNight,
  karaokeNext,
  karaokeQueue,
  nightCalendar,
  nightOpsOf,
  reviewAskMessage,
  reviewAskNight,
  reviewAskTargets,
  nightsReport,
  nightsReportMessage,
  nightsReportRows,
  repeatPreview,
} from "@/lib/pro/night-ops";

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const NOW = new Date("2026-09-24T09:30:00.000Z");

function ids() {
  let n = 0;
  return (prefix: string) => `${prefix}-${++n}`;
}

describe("Noche: repetir cada semana con sus reservados", () => {
  it("crea las noches, marca la serie y copia los reservados del evento libres", () => {
    const data = buildDemo("nightclub", NOW);
    const ev = data.events.find((e) => e.id === "ev-jueves") as ProEvent;
    const own = data.zones.filter((z) => z.eventId === ev.id);
    const result = applyRepeatWeekly(data, ev, 4, ids());

    expect(result.events).toHaveLength(4);
    expect(result.events.map((e) => weekdayIndex(e.date))).toEqual([3, 3, 3, 3]);
    expect(result.data.events).toHaveLength(data.events.length + 4);
    // El original entra en la serie para que las copias se reconozcan.
    const original = result.data.events.find((e) => e.id === ev.id) as ProEvent;
    expect(original.seriesId).toBe(ev.seriesId ?? ev.id);
    expect(result.events.every((e) => e.seriesId === original.seriesId)).toBe(true);

    const copies = result.data.zones.filter((z) => result.events.some((e) => e.id === z.eventId));
    expect(copies).toHaveLength(own.length * 4);
    expect(copies.every((z) => z.status === "free" && !z.bookedBy && !z.tab)).toBe(true);
    // Los datos de antes no se tocan.
    expect(data.events).toHaveLength(result.data.events.length - 4);
  });

  it("no duplica noches ya creadas y lo avisa en la vista previa", () => {
    const data = buildDemo("pub", NOW);
    const ev = data.events.find((e) => e.status !== "draft") as ProEvent;
    const once = applyRepeatWeekly(data, ev, 2, ids()).data;
    const preview = repeatPreview(once, ev, 3);
    expect(preview.map((p) => p.exists)).toEqual([true, true, false]);
    const again = applyRepeatWeekly(once, ev, 3, ids());
    expect(again.events).toHaveLength(1);
    expect(again.skipped).toHaveLength(2);
  });

  it("la vista previa lleva los festivos y vísperas de cada fecha", () => {
    const data = buildDemo("nightclub", NOW);
    const ev = { ...(data.events.find((e) => e.id === "ev-jueves") as ProEvent), date: "2026-10-01" };
    const preview = repeatPreview(data, ev, 2);
    // El jueves 8 de octubre es víspera del 9, Día de la Comunitat Valenciana.
    expect(preview[0].date).toBe("2026-10-08");
    expect(preview[0].notes).toEqual(["Víspera de festivo: Día de la Comunitat Valenciana"]);
    expect(preview[1].notes).toEqual([]);
  });
});

describe("Noche: calendario de la noche", () => {
  it("lista festivos, vísperas y noches señaladas con el evento que ya tengas", () => {
    const data = buildDemo("pub", NOW);
    const days = nightCalendar(data, NOW, 56);
    const dates = days.map((d) => d.date);
    expect(dates).toContain("2026-10-08");
    expect(dates).toContain("2026-10-12");
    expect(dates).toContain("2026-10-31");
    const halloween = days.find((d) => d.date === "2026-10-31");
    expect(halloween?.notes[0]).toBe("Halloween");
    // Todas las fechas están dentro del rango y en orden.
    expect([...dates].sort()).toEqual(dates);
    expect(dates.every((d) => d <= addDays("2026-09-24", 56))).toBe(true);
    const withEvent = { ...data, events: [...data.events, { ...data.events[0], id: "x", date: "2026-10-08", status: "on_sale" as const }] };
    expect(nightCalendar(withEvent, NOW).find((d) => d.date === "2026-10-08")?.event?.id).toBe("x");
  });
});

describe("Noche: informe del lunes", () => {
  it("resume las noches pasadas en CSV y en un mensaje sin guiones largos", () => {
    const data = buildDemo("nightclub", NOW);
    const report = nightsReport(data, NOW, 8);
    expect(report.length).toBeGreaterThan(0);
    const rows = nightsReportRows(report);
    expect(rows[0][0]).toBe("Noche");
    expect(rows).toHaveLength(report.length + 1);
    expect(rows[1]).toHaveLength(rows[0].length);
    // Importes con coma decimal para Excel en español.
    expect(rows[1][5]).toMatch(/^-?\d+,\d{2}$/);
    const text = nightsReportMessage(data.space, report);
    expect(text).toContain(data.space.name);
    expect(text).toContain("Total:");
    expect(text).not.toMatch(/[\u2013\u2014]/);
    expect(nightsReportMessage(data.space, [])).toContain("aún no hay noches");
  });
});

describe("Noche: comparación con marketplaces", () => {
  it("usa la comisión publicada del 15 % y no una cifra inventada", () => {
    expect(MARKETPLACE_TICKET_FEE).toBe(0.15);
    const data = buildDemo("nightclub", NOW);
    const f = nightFranky(data, NOW, 30);
    expect(f.savedCents).toBeGreaterThanOrEqual(0);
  });
});

describe("Noche: opiniones al día siguiente", () => {
  it("propone a quien vino anoche, con teléfono y permiso, y no repite", () => {
    const data = buildDemo("pub", NOW);
    // Jueves por la mañana: se pide opinión de la noche del miércoles, que el pub abrió.
    const target = reviewAskNight(data, NOW);
    expect(target?.night).toBe("2026-09-23");
    const first = reviewAskTargets(data, NOW);
    expect(first.clients.length).toBeGreaterThan(0);
    expect(first.clients.every((c) => c.phone && c.marketingConsent)).toBe(true);
    const asked = first.clients[0];
    const ops = nightOpsOf(data);
    const after = {
      ...data,
      nightOps: { ...ops, reviewAsks: [{ id: "ra1", clientId: asked.id, night: "2026-09-23", at: NOW.toISOString() }] },
    };
    const second = reviewAskTargets(after, NOW);
    expect(second.clients.map((c) => c.id)).not.toContain(asked.id);
    expect(second.asked).toBe(1);
    const text = reviewAskMessage(asked, data.space, first.event);
    expect(text).toContain(`franky.es/n/${data.space.slug}`);
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  it("no pide nada si no abriste ni anoche ni anteayer", () => {
    const data = buildDemo("pub", NOW);
    const closed = { ...data, space: { ...data.space, hours: data.space.hours.map(() => null) }, events: [] };
    expect(reviewAskTargets(closed, NOW).night).toBeNull();
  });
});

describe("Noche: cola del karaoke", () => {
  it("la demo del pub trae cola para su noche de karaoke", () => {
    const data = buildDemo("pub", NOW);
    const ev = data.events.find((e) => /karaoke/i.test(e.name) && e.date >= "2026-09-24") as ProEvent;
    expect(isKaraokeNight(data, ev)).toBe(true);
    expect(karaokeQueue(nightOpsOf(data), ev.id).waiting.length).toBeGreaterThan(2);
  });

  it("pasa a la siguiente por orden de llegada y da por cantada la anterior", () => {
    const ops = {
      ...EMPTY_NIGHT_OPS,
      karaoke: [
        { id: "b", eventId: "e1", singer: "Bea", song: "Resistiré", at: "2026-09-24T21:10:00.000Z", status: "waiting" as const },
        { id: "a", eventId: "e1", singer: "Ana", song: "La flaca", at: "2026-09-24T21:00:00.000Z", status: "waiting" as const },
        { id: "x", eventId: "e2", singer: "Otro", song: "Otra", at: "2026-09-24T20:00:00.000Z", status: "waiting" as const },
      ],
    };
    const one = karaokeNext(ops, "e1");
    expect(karaokeQueue(one, "e1").singing?.id).toBe("a");
    const two = karaokeNext(one, "e1");
    const q = karaokeQueue(two, "e1");
    expect(q.singing?.id).toBe("b");
    expect(q.done).toBe(1);
    // La otra noche no se toca.
    expect(karaokeQueue(two, "e2").waiting).toHaveLength(1);
    const end = karaokeNext(two, "e1");
    expect(karaokeQueue(end, "e1").singing).toBeNull();
    expect(karaokeQueue(end, "e1").done).toBe(2);
  });
});

describe("Noche: descuadres y comparación de barra", () => {
  it("etiqueta y tono del descuadre", () => {
    expect(diffLabel(0)).toBe("Cuadra");
    expect(diffLabel(-1850)).toMatch(/^-18,50/);
    expect(diffLabel(200)).toMatch(/^\+2/);
    expect(diffTone(50)).toBe("success");
    expect(diffTone(-900)).toBe("warning");
    expect(diffTone(2500)).toBe("danger");
  });

  it("compara la barra con la media de las mismas noches", () => {
    const close = (cents: number) => ({
      id: "c",
      night: "2026-09-17",
      closedBy: "Marta",
      closedAt: "2026-09-18T01:30:00.000Z",
      floatCents: 15000,
      tpvCashCents: cents / 2,
      tpvCardCents: cents / 2,
      cashCountedCents: 0,
      cardCountedCents: 0,
      invitations: 0,
      invitationsCents: 0,
    });
    expect(barCompareLabel(110000, [close(100000)])).toContain("10 % más");
    expect(barCompareLabel(90000, [close(100000)])).toContain("10 % menos");
    expect(barCompareLabel(101000, [close(100000)])).toContain("lo mismo");
    expect(barCompareLabel(100000, [])).toContain("no tiene");
  });
});
