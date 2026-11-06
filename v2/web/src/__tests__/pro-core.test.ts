import { describe, expect, it } from "vitest";
import { addDays, atLocal, capitalize, localDate, localMinutes, minutesToLabel, weekdayIndex } from "@/lib/pro/format";
import { PRO_VERTICALS, VERTICAL_ORDER, DEMO_PUBLIC_SLUGS, DEMO_SLUGS, demoSpaceId, verticalFromDemoSlug, verticalFromPublicSlug } from "@/lib/pro/verticals";
import { buildDemo } from "@/lib/pro/demo";
import { freeGaps, startTimes, bookingsOn, poseWindow } from "@/lib/pro/agenda";
import { checklistState } from "@/lib/pro/checklist";
import { SECTION_META } from "@/components/pro/sections";

describe("Franky Pro: fechas en hora de Madrid", () => {
  it("atLocal respeta el horario de verano y de invierno", () => {
    // 29 de marzo de 2026: cambio a horario de verano en España.
    expect(atLocal("2026-03-28", 10 * 60)).toBe("2026-03-28T09:00:00.000Z");
    expect(atLocal("2026-03-30", 10 * 60)).toBe("2026-03-30T08:00:00.000Z");
    expect(atLocal("2026-11-02", 10 * 60)).toBe("2026-11-02T09:00:00.000Z");
  });

  it("localDate y localMinutes deshacen atLocal", () => {
    for (const date of ["2026-01-15", "2026-07-01", "2026-10-25", "2026-12-31"]) {
      for (const m of [0, 9 * 60 + 30, 23 * 60 + 45]) {
        const iso = atLocal(date, m);
        expect(localDate(iso)).toBe(date);
        expect(localMinutes(iso)).toBe(m);
      }
    }
  });

  it("utilidades de días y etiquetas", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(weekdayIndex("2026-09-21")).toBe(0); // lunes
    expect(weekdayIndex("2026-09-27")).toBe(6); // domingo
    expect(minutesToLabel(545)).toBe("09:05");
    expect(capitalize("jueves, 24 de septiembre")).toBe("Jueves, 24 de septiembre");
  });
});

describe("Franky Pro: catálogo de sectores", () => {
  it("hay 16 sectores y cada uno tiene demo propia con slug único", () => {
    expect(VERTICAL_ORDER).toHaveLength(16);
    const demoSlugs = new Set(Object.values(DEMO_SLUGS));
    const publicSlugs = new Set(Object.values(DEMO_PUBLIC_SLUGS));
    expect(demoSlugs.size).toBe(16);
    expect(publicSlugs.size).toBe(16);
    for (const id of VERTICAL_ORDER) {
      expect(verticalFromDemoSlug(DEMO_SLUGS[id])).toBe(id);
      expect(verticalFromPublicSlug(DEMO_PUBLIC_SLUGS[id])).toBe(id);
      expect(demoSpaceId(id)).toMatch(/^demo-[a-z-]+$/);
    }
  });

  it("la navegación de cada sector usa secciones conocidas y el móvil es un subconjunto", () => {
    for (const id of VERTICAL_ORDER) {
      const v = PRO_VERTICALS[id];
      expect(v.nav[0].id).toBe("hoy");
      for (const item of v.nav) expect(SECTION_META[item.id]).toBeDefined();
      expect(v.mobileNav.length).toBeLessThanOrEqual(4);
      for (const s of v.mobileNav) expect(v.nav.some((n) => n.id === s)).toBe(true);
      expect(v.nav.some((n) => n.id === v.primary.section)).toBe(true);
      for (const step of v.checklist) expect(v.nav.some((n) => n.id === step.section)).toBe(true);
      expect(v.guide.length).toBeGreaterThan(0);
    }
  });

  it("ningún texto de sector usa guiones largos", () => {
    const text = JSON.stringify(PRO_VERTICALS);
    expect(text).not.toMatch(/[–—]/);
  });
});

describe("Franky Pro: demos", () => {
  const now = new Date("2026-09-24T09:30:00.000Z"); // jueves 11:30 en Madrid

  it.each(VERTICAL_ORDER)("la demo de %s se genera, es estable y enlaza con su ficha pública", (id) => {
    const a = buildDemo(id, now);
    const b = buildDemo(id, now);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.space.vertical).toBe(id);
    expect(a.space.slug).toBe(DEMO_PUBLIC_SLUGS[id]);
    expect(a.space.name.length).toBeGreaterThan(2);
    expect(JSON.stringify(a)).not.toMatch(/[–—]/);
    const state = checklistState(PRO_VERTICALS[id], a);
    expect(state.total).toBe(PRO_VERTICALS[id].checklist.length);
  });

  it("en la agenda de la peluquería nadie tiene las manos ocupadas en dos citas a la vez", () => {
    const data = buildDemo("hairdresser", now);
    // Durante la pose de un color el profesional puede atender otra cita
    // corta: solo cuentan los tramos con las manos ocupadas.
    for (let d = -3; d <= 6; d++) {
      const date = addDays(localDate(now), d);
      for (const s of data.staff) {
        const spans = bookingsOn(data, date, s.id)
          .filter((x) => x.status !== "no_show")
          .flatMap((b) => {
            const pose = poseWindow(data, b);
            if (!pose) return [{ start: b.start, end: b.end }];
            return [
              { start: b.start, end: pose.start },
              { start: pose.end, end: b.end },
            ];
          })
          .filter((span) => span.end > span.start)
          .sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 1; i < spans.length; i++) expect(spans[i].start >= spans[i - 1].end).toBe(true);
      }
    }
  });

  it("los huecos libres y las horas de inicio no pisan citas existentes", () => {
    const data = buildDemo("hairdresser", now);
    const date = addDays(localDate(now), 1);
    // Durante la pose de un color el profesional tiene las manos libres: ese
    // tramo de la cita sí se puede ofrecer.
    const busySpans = (staffId: string) =>
      bookingsOn(data, date, staffId)
        .filter((b) => b.status !== "no_show")
        .flatMap((b) => {
          const from = localMinutes(b.start);
          const to = localMinutes(b.end);
          const pose = poseWindow(data, b);
          if (!pose) return [{ from, to }];
          return [
            { from, to: localMinutes(pose.start) },
            { from: localMinutes(pose.end), to },
          ];
        });
    const gaps = freeGaps(data, date, 0, 30);
    for (const g of gaps) {
      expect(g.to - g.from).toBeGreaterThanOrEqual(30);
      for (const b of busySpans(g.staffId)) {
        expect(g.to <= b.from || g.from >= b.to).toBe(true);
      }
    }
    const staff = data.staff[0];
    for (const m of startTimes(data, date, staff.id, 45)) {
      for (const b of busySpans(staff.id)) expect(m + 45 <= b.from || m >= b.to).toBe(true);
    }
  });
});
