import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Los dos archivos que hacen que un enlace de franky.es abra la app instalada.
 * Estaban en public/ con marcadores SIN rellenar ("TEAMID.es.franky.app" y
 * "REEMPLAZAR_CON_SHA256_DE_LA_FIRMA"), así que ni iOS ni Android abrían nunca
 * la app: los enlaces caían siempre en el navegador. Ahora se generan con datos
 * del entorno, y estos tests fijan las dos cosas que importan: que con la
 * variable puesta el archivo es válido, y que sin ella NO se inventa un id.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function cargarAasa() {
  vi.resetModules();
  return import("@/app/api/well-known/apple-app-site-association/route");
}

async function cargarAssetlinks() {
  vi.resetModules();
  return import("@/app/api/well-known/assetlinks/route");
}

describe("apple-app-site-association", () => {
  it("con APPLE_TEAM_ID declara el appID completo", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "A1B2C3D4E5");
    const { GET } = await cargarAasa();
    const body = await (await GET()).json();
    expect(body.applinks.details).toHaveLength(1);
    expect(body.applinks.details[0].appID).toBe("A1B2C3D4E5.es.franky.app");
    // Las exclusiones van primero: iOS aplica la primera regla que casa, así que
    // /auth/* o /restablecer tienen que salir ANTES de /perfil/*.
    expect(body.applinks.details[0].paths[0]).toMatch(/^NOT /);
  });

  it("sin variable de entorno usa el Team ID real de la cuenta, no un marcador", async () => {
    // El marcador "TEAMID.es.franky.app" que había en el archivo estático hacía
    // que iOS descartara el archivo entero. El valor por defecto tiene que ser
    // el Team ID de verdad (X5D8A42K4R), que además no es ningún secreto: este
    // archivo lo publica en abierto.
    vi.stubEnv("APPLE_TEAM_ID", "");
    const { GET } = await cargarAasa();
    const body = await (await GET()).json();
    expect(body.applinks.details).toHaveLength(1);
    expect(body.applinks.details[0].appID).toBe("X5D8A42K4R.es.franky.app");
    expect(JSON.stringify(body)).not.toContain("TEAMID");
  });

  it("no deja abrir en la app la verificación de email ni el reset de contraseña", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "A1B2C3D4E5");
    const { GET } = await cargarAasa();
    const body = await (await GET()).json();
    const paths: string[] = body.applinks.details[0].paths;
    expect(paths).toContain("NOT /restablecer");
    expect(paths).toContain("NOT /email-verificado");
    expect(paths).toContain("NOT /auth/*");
    expect(paths).toContain("NOT /api/*");
  });
});

describe("assetlinks.json", () => {
  it("uses the verified EAS certificate when no override is configured", async () => {
    vi.stubEnv("ANDROID_CERT_SHA256", undefined);
    const { GET } = await cargarAssetlinks();
    const body = await (await GET()).json();
    expect(body[0].target.sha256_cert_fingerprints).toEqual(["94:7C:14:52:84:FE:E3:CC:A8:7F:31:A1:B6:57:CC:86:38:6D:61:2F:5D:49:A0:D1:6F:8D:58:54:94:7E:E7:AE"]);
  });
  it("acepta una huella SHA-256 con el formato correcto", async () => {
    const huella = Array(32).fill("AB").join(":");
    vi.stubEnv("ANDROID_CERT_SHA256", huella);
    const { GET } = await cargarAssetlinks();
    const body = await (await GET()).json();
    expect(body).toHaveLength(1);
    expect(body[0].target.package_name).toBe("es.franky.app");
    expect(body[0].target.sha256_cert_fingerprints).toEqual([huella]);
  });

  it("admite varias huellas (Play App Signing + upload)", async () => {
    const a = Array(32).fill("AB").join(":");
    const b = Array(32).fill("CD").join(":");
    vi.stubEnv("ANDROID_CERT_SHA256", `${a}, ${b}`);
    const { GET } = await cargarAssetlinks();
    const body = await (await GET()).json();
    expect(body[0].target.sha256_cert_fingerprints).toEqual([a, b]);
  });

  it("descarta basura en vez de servir un archivo inválido", async () => {
    vi.stubEnv("ANDROID_CERT_SHA256", "REEMPLAZAR_CON_SHA256_DE_LA_FIRMA");
    const { GET } = await cargarAssetlinks();
    const body = await (await GET()).json();
    expect(body).toEqual([]);
  });
});
