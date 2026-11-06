// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";

const f = vi.hoisted(() => ({ host: "franky.es", database: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: f.host }) }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase-server", () => ({ createPublicSupabase: f.database }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", "peluquerias,bares");
  f.host = "franky.es";
  f.database.mockImplementation(() => { throw new Error("No database needed in this metadata test"); });
});
afterEach(() => vi.unstubAllEnvs());

describe("SEO aislado por dominio", () => {
  it("cada subdominio publica solo su homepage canónica, sin consultar catálogos", async () => {
    for (const slug of ["peluquerias", "bares"]) {
      f.host = `${slug}.franky.es`;
      expect(await sitemap()).toEqual([{ url: `https://${f.host}`, changeFrequency: "monthly", priority: 1 }]);
      expect(await robots()).toMatchObject({ host: `https://${f.host}`, sitemap: `https://${f.host}/sitemap.xml` });
    }
    expect(f.database).not.toHaveBeenCalled();
  });

  it.each(["academias.franky.es", "peluquerias.localhost:3000", "evil.test"])(
    "%s no se anuncia como una web de producción", async (host) => {
      f.host = host;
      expect(await sitemap()).toEqual([]);
      expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    },
  );

  it("el sitemap principal anuncia solo sectores aún alojados en el principal", async () => {
    const entries = await sitemap();
    expect(entries.some((entry) => entry.url === "https://franky.es/sectores")).toBe(true);
    expect(entries.some((entry) => entry.url === "https://franky.es/sectores/academias")).toBe(true);
    expect(entries.some((entry) => entry.url.includes("peluquerias"))).toBe(false);
    expect(entries.every((entry) => new URL(entry.url).host === "franky.es")).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith("/acceder"))).toBe(false);
  });
});
