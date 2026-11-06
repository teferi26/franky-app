import { describe, expect, it } from "vitest";
import { SECTOR_SITES } from "@/lib/sector-sites/catalog";
import { SECTOR_SITE_SLUGS } from "@/lib/sector-sites/routing";
import { SECTOR_ICON_NAMES } from "@/lib/sector-sites/types";
import { VERTICAL_ORDER } from "@/lib/pro/verticals";

describe("el catálogo comercial y el producto comparten los mismos sectores", () => {
  it("cada subdominio tiene una página y cada sector del producto tiene acceso", () => {
    expect(SECTOR_SITES.map((site) => site.slug).sort()).toEqual(
      [...SECTOR_SITE_SLUGS].sort(),
    );
    expect(SECTOR_SITES.map((site) => site.vertical).sort()).toEqual(
      [...VERTICAL_ORDER].sort(),
    );
  });

  it("cada página tiene contenido y metadatos propios", () => {
    for (const field of [
      "title",
      "seoTitle",
      "seoDescription",
      "description",
    ] as const) {
      expect(new Set(SECTOR_SITES.map((site) => site[field])).size).toBe(
        SECTOR_SITES.length,
      );
    }
    expect(JSON.stringify(SECTOR_SITES)).not.toMatch(/[\u2013\u2014]/);
  });

  it("cada sector conserva lo esencial aunque no tenga contenido ampliado", () => {
    for (const site of SECTOR_SITES) {
      expect(site.benefits.length, site.slug).toBeGreaterThanOrEqual(3);
      expect(site.workflow.length, site.slug).toBeGreaterThanOrEqual(3);
      expect(site.faq.length, site.slug).toBeGreaterThanOrEqual(3);
      expect(
        new Set(site.faq.map((item) => item.question)).size,
        site.slug,
      ).toBe(site.faq.length);
    }
  });
});

describe("contenido ampliado de las webs de sector", () => {
  it("los módulos tienen anclas únicas, iconos conocidos y dónde se usan", () => {
    for (const site of SECTOR_SITES) {
      const modules = site.modules ?? [];
      expect(new Set(modules.map((module) => module.id)).size, site.slug).toBe(
        modules.length,
      );
      for (const module of modules) {
        expect(module.id, site.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(SECTOR_ICON_NAMES, `${site.slug}/${module.id}`).toContain(
          module.icon,
        );
        expect(
          module.where.length,
          `${site.slug}/${module.id}`,
        ).toBeGreaterThan(0);
        expect(
          module.capabilities.length,
          `${site.slug}/${module.id}`,
        ).toBeGreaterThanOrEqual(3);
        const titles = module.capabilities.map(
          (capability) => capability.title,
        );
        expect(new Set(titles).size, `${site.slug}/${module.id}`).toBe(
          titles.length,
        );
      }
    }
  });

  it("el día con Franky va en orden y con horas de 24 h", () => {
    for (const site of SECTOR_SITES) {
      const times = (site.dayWithFranky ?? []).map((moment) => moment.time);
      for (const time of times)
        expect(time, site.slug).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      expect(times, site.slug).toEqual([...times].sort());
    }
  });

  it("la tabla de ahorro solo suma rangos coherentes y explica la estimación", () => {
    for (const site of SECTOR_SITES) {
      if (!site.gains) continue;
      expect(site.gains.note.length, site.slug).toBeGreaterThan(0);
      for (const row of site.gains.rows) {
        if (!row.monthly) continue;
        expect(row.monthly.min, `${site.slug}/${row.category}`).toBeGreaterThan(
          0,
        );
        expect(
          row.monthly.max,
          `${site.slug}/${row.category}`,
        ).toBeGreaterThanOrEqual(row.monthly.min);
      }
    }
  });

  it("peluquerías es el sector de referencia y trae todas las secciones", () => {
    const site = SECTOR_SITES.find((item) => item.slug === "peluquerias");
    expect(site?.modules?.length).toBeGreaterThanOrEqual(8);
    expect(site?.dayWithFranky?.length).toBeGreaterThanOrEqual(5);
    expect(site?.gains?.rows.length).toBeGreaterThanOrEqual(4);
    expect(site?.studentSection?.points.length).toBeGreaterThanOrEqual(3);
    expect(site?.mobileApp?.actions.length).toBeGreaterThanOrEqual(5);
    expect(site?.faq.length).toBeGreaterThan(3);
    // Sin palabras que rompan la experiencia ni promesas de cifras sin medir.
    expect(JSON.stringify(site)).not.toMatch(
      /\b(demo|simulad[oa]|ficticio)\b/i,
    );
  });
});
