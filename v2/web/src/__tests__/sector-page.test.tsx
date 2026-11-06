import { proWebPrice } from "../../../shared/pro/web-pricing";
// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SectorPage from "../app/sectores/[sector]/page";
import { SECTOR_SITES } from "@/lib/sector-sites/catalog";
import { PRO_VERTICALS } from "@/lib/pro/verticals";

const f = vi.hoisted(() => ({ host: "franky.es" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: f.host }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

async function render(sector: string) {
  const page = await SectorPage({ params: Promise.resolve({ sector }) });
  return renderToStaticMarkup(page);
}

beforeEach(() => {
  f.host = "franky.es";
});

describe("web de sector", () => {
  it.each(SECTOR_SITES.map((site) => site.slug))(
    "%s se pinta completa con lo que tenga rellenado",
    async (slug) => {
      const site = SECTOR_SITES.find((item) => item.slug === slug)!;
      const html = await render(slug);
      expect(html).toContain('id="herramientas"');
      expect(html).toContain('id="movil"');
      expect(html).toContain('id="planes"');
      expect(html).toContain('id="estudiantes"');
      expect(html).toContain(
        `/pro/empezar?sector=${site.vertical}&amp;origen=${slug}`,
      );
      expect(html.includes('id="modulos"')).toBe(Boolean(site.modules?.length));
      expect(html.includes('id="un-dia"')).toBe(
        Boolean(site.dayWithFranky?.length),
      );
      expect(html.includes('id="lo-que-ganas"')).toBe(
        Boolean(site.gains?.rows.length),
      );
      // Una sola sección oscura por página.
      expect(html.match(/bg-bg-dark/g)?.length).toBe(1);
      expect(html).not.toMatch(/[\u2013\u2014]/);
    },
  );

  it("peluquerías enseña el índice de módulos con anclas, la tabla y el precio del plan", async () => {
    const site = SECTOR_SITES.find((item) => item.slug === "peluquerias")!;
    const html = await render("peluquerias");
    for (const module of site.modules!) {
      expect(html).toContain(`href="#modulo-${module.id}"`);
      expect(html).toContain(`id="modulo-${module.id}"`);
    }
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain(`${proWebPrice("hairdresser").monthly} €`);
    expect(html).toContain("Por separado");
    for (const question of site.faq) {
      expect(html).toContain(question.question.replace(/"/g, "&quot;"));
    }
  });

  it("en su subdominio enlaza al acceso relativo", async () => {
    f.host = "peluquerias.franky.es";
    const html = await render("peluquerias");
    expect(html).toContain('href="/acceder"');
  });

  it("un sector desconocido devuelve 404", async () => {
    await expect(render("no-existe")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
