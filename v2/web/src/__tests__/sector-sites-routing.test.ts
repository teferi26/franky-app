// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSectorSlugFromHost,
  isSectorPublicPath,
  resolveSectorSurface,
  sectorCanonicalUrl,
  sectorHref,
  sectorMetadataHost,
  SECTOR_SITE_SLUGS,
} from "@/lib/sector-sites/routing";

afterEach(() => vi.unstubAllEnvs());

describe("Lista cerrada de subdominios de sector", () => {
  it.each(SECTOR_SITE_SLUGS)("reconoce %s en producción y en local", (slug) => {
    expect(getSectorSlugFromHost(`${slug}.franky.es`)).toBe(slug);
    expect(getSectorSlugFromHost(`${slug}.localhost:3100`)).toBe(slug);
  });

  it.each([
    "franky.es", "peluquerias.franky.es.evil.test", "evil.peluquerias.franky.es",
    "peluquerias.franky.es:443", "peluquerias.franky.es.", "peluquerias.franky.es@evil.test",
    "peluquerias.franky.es, evil.test", "https://peluquerias.franky.es",
    "peluquerias.localhost:65536", "peluquerias.localhost:0", "peluquerias.localhost:abc",
    "inventado.franky.es", "", null,
  ])("rechaza un Host que no pertenece a la lista: %s", (host) => {
    expect(getSectorSlugFromHost(host)).toBeNull();
  });

  it("trata los nombres DNS sin distinguir mayúsculas", () => {
    expect(getSectorSlugFromHost("PELUQUERIAS.FRANKY.ES")).toBe("peluquerias");
  });
});

describe("Superficies y canonical durante el despliegue", () => {
  it("mantiene la URL indexable actual hasta activar DNS", () => {
    vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", "");
    expect(sectorHref("peluquerias")).toBe("/sectores/peluquerias");
    expect(sectorCanonicalUrl("peluquerias")).toBe("https://franky.es/sectores/peluquerias");
    expect(resolveSectorSurface("/sectores/peluquerias", "franky.es").redirectUrl).toBeNull();
  });

  it("activa únicamente los nombres explícitos", () => {
    vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", "peluquerias, bares,*.franky.es,evil.test");
    expect(sectorHref("peluquerias")).toBe("https://peluquerias.franky.es");
    expect(sectorHref("bares")).toBe("https://bares.franky.es");
    expect(sectorHref("academias")).toBe("/sectores/academias");
    expect(() => sectorHref("evil.test")).toThrow();
    expect(resolveSectorSurface("/sectores/peluquerias/acceder", "franky.es").redirectUrl)
      .toBe("https://peluquerias.franky.es/acceder");
    expect(resolveSectorSurface("/sectores/peluquerias", "localhost:3000").redirectUrl).toBeNull();
  });

  it("reescribe las dos entradas del subdominio sin abrir prefijos", () => {
    expect(resolveSectorSurface("/", "peluquerias.franky.es"))
      .toMatchObject({ surface: "peluquerias", rewritePath: "/sectores/peluquerias" });
    expect(resolveSectorSurface("/acceder", "peluquerias.localhost:3000"))
      .toMatchObject({ surface: "peluquerias", rewritePath: "/sectores/peluquerias/acceder" });
    expect(resolveSectorSurface("/acceder/privado", "peluquerias.franky.es").surface).toBeNull();
    expect(isSectorPublicPath("/sectores/peluquerias/admin")).toBe(false);
    expect(isSectorPublicPath("/sectores/inventado")).toBe(false);
    expect(isSectorPublicPath("/sectores")).toBe(true);
  });

  it.each(["/universidades", "/ocio/123", "/fomo/alicante", "/eventos/concierto", "/sectores"])(
    "sirve %s desde el dominio estudiantil", (path) => {
      expect(resolveSectorSurface(path, "bares.franky.es").redirectUrl).toBe(`https://franky.es${path}`);
    },
  );

  it.each([
    "/pro/real-space", "/api/workspaces", "/auth/callback", "/login", "/app",
    "/eventos/crear", "/eventos/concierto/entradas", "/fomo/alicante/private-thread",
  ])("conserva el host y los permisos de %s", (path) => {
    expect(resolveSectorSurface(path, "bares.franky.es"))
      .toMatchObject({ redirectUrl: null, rewritePath: null, surface: null });
  });

  it("evita otra copia de la misma landing dentro del subdominio", () => {
    expect(resolveSectorSurface("/sectores/bares", "bares.franky.es").redirectUrl).toBe("/");
    expect(resolveSectorSurface("/sectores/bares/acceder", "bares.franky.es").redirectUrl).toBe("/acceder");
  });

  it("no publica metadatos de hosts desconocidos ni previews", () => {
    vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", "bares");
    expect(sectorMetadataHost("bares.franky.es")).toMatchObject({ indexable: true, origin: "https://bares.franky.es" });
    expect(sectorMetadataHost("bares.localhost:3000").indexable).toBe(false);
    expect(sectorMetadataHost("peluquerias.franky.es").indexable).toBe(false);
    expect(sectorMetadataHost("evil.test")).toMatchObject({ indexable: false, origin: "https://franky.es" });
  });
});
