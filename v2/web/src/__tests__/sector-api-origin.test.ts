// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cardOriginAllowed } from "@/lib/franky-card-api";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ createRequestSupabase: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));

const SECTOR = "https://peluquerias.franky.es";

function request({
  url = `${SECTOR}/api/card/validate`,
  host = "peluquerias.franky.es",
  origin = SECTOR,
  site = "same-origin",
  forwardedHost,
}: {
  url?: string;
  host?: string | null;
  origin?: string | null;
  site?: string | null;
  forwardedHost?: string;
} = {}) {
  const headers = new Headers();
  if (host !== null) headers.set("host", host);
  if (origin !== null) headers.set("origin", origin);
  if (site !== null) headers.set("sec-fetch-site", site);
  if (forwardedHost) headers.set("x-forwarded-host", forwardedHost);
  return new NextRequest(url, { method: "POST", headers });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", "peluquerias,bares");
});

afterEach(() => vi.unstubAllEnvs());

describe("Origen de las operaciones privadas en los sectores", () => {
  it("acepta el dominio activo cuando Origin, URL y Host coinciden", () => {
    expect(cardOriginAllowed(request())).toBe(true);
    expect(cardOriginAllowed(request({ site: "same-site" }))).toBe(true);
    expect(cardOriginAllowed(request({ forwardedHost: "evil.invalid" }))).toBe(
      true,
    );
  });

  it("rechaza sectores desactivados aunque el dominio y la URL coincidan", () => {
    vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", "bares");
    expect(cardOriginAllowed(request())).toBe(false);
    vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", "");
    expect(cardOriginAllowed(request())).toBe(false);
  });

  it.each([
    { origin: "https://bares.franky.es" },
    { host: "bares.franky.es" },
    { url: "https://bares.franky.es/api/card/validate" },
    { url: "https://franky.es/api/card/validate" },
    { url: "https://evil.invalid/api/card/validate" },
    { host: "evil.invalid", forwardedHost: "peluquerias.franky.es" },
    { host: null, forwardedHost: "peluquerias.franky.es" },
    { origin: "https://peluquerias.franky.es.evil.invalid" },
    { origin: "null" },
    { origin: `${SECTOR}/` },
    { origin: "http://peluquerias.franky.es" },
    { host: "peluquerias.franky.es:443" },
    {
      host: "peluquerias.localhost:3000",
      url: "http://peluquerias.localhost:3000/api/card/validate",
      origin: "http://peluquerias.localhost:3000",
    },
    {
      host: "inventado.franky.es",
      url: "https://inventado.franky.es/api/card/validate",
      origin: "https://inventado.franky.es",
    },
    { site: "cross-site" },
  ])("rechaza un origen, Host o URL discordante: %j", (input) => {
    expect(cardOriginAllowed(request(input))).toBe(false);
  });

  it("mantiene los orígenes principales y bloquea su uso cross-site", () => {
    for (const origin of ["https://franky.es", "https://www.franky.es"]) {
      expect(
        cardOriginAllowed(
          request({
            url: `${origin}/api/card/validate`,
            origin,
            host: new URL(origin).host,
          }),
        ),
      ).toBe(true);
      expect(cardOriginAllowed(request({ origin, site: "cross-site" }))).toBe(
        false,
      );
    }
  });

  it.each([
    ["https://franky.es", "peluquerias"],
    ["https://www.franky.es", "peluquerias"],
    ["https://franky.es", ""],
    ["https://www.franky.es", ""],
  ])(
    "rechaza el origen principal %s sobre el Host sectorial con activación %s",
    (origin, enabled) => {
      vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", enabled);
      expect(cardOriginAllowed(request({ origin, site: "same-site" }))).toBe(
        false,
      );
      expect(
        cardOriginAllowed(
          request({
            origin,
            url: `${origin}/api/card/validate`,
            site: "same-site",
          }),
        ),
      ).toBe(false);
    },
  );

  it("mantiene clientes nativos sin Origin, excepto las peticiones cross-site", () => {
    expect(cardOriginAllowed(request({ origin: null, site: null }))).toBe(true);
    expect(
      cardOriginAllowed(request({ origin: null, site: "cross-site" })),
    ).toBe(false);
  });

  it("mantiene localhost solo en desarrollo", () => {
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      const input = {
        origin,
        host: new URL(origin).host,
        url: `${origin}/api/card/validate`,
      };
      expect(cardOriginAllowed(request(input))).toBe(false);
      vi.stubEnv("NODE_ENV", "development");
      expect(cardOriginAllowed(request(input))).toBe(true);
      vi.stubEnv("NODE_ENV", "production");
    }
  });
});
