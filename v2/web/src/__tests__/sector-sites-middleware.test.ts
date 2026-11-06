// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const f = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  profile: vi.fn(),
  refreshCookies: false,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (cookies: { name: string; value: string }[]) => void };
  }) => {
    if (f.refreshCookies) options.cookies.setAll([{ name: "sb-test", value: "renewed" }]);
    return { auth: { getUser: f.getUser, getSession: f.getSession }, from: f.profile };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", "");
  f.refreshCookies = false;
  f.getUser.mockResolvedValue({ data: { user: null }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

function request(path: string, host = "peluquerias.franky.es", headers: Record<string, string> = {}) {
  return new NextRequest(`https://${host}${path}`, { headers: { host, ...headers } });
}

describe("Subdominios sin alterar la seguridad de Franky", () => {
  it.each(["/", "/acceder"])("la entrada %s es pública, conserva query y CSP", async (path) => {
    const response = await middleware(request(`${path}?utm_source=google&gclid=123`));
    const target = new URL(response.headers.get("x-middleware-rewrite")!);
    expect(target.pathname).toBe(`/sectores/peluquerias${path === "/acceder" ? path : ""}`);
    expect(target.search).toBe("?utm_source=google&gclid=123");
    expect(response.headers.get("x-middleware-request-x-franky-sector-site")).toBe("peluquerias");
    const nonce = response.headers.get("x-nonce");
    expect(nonce).toBeTruthy();
    expect(response.headers.get("content-security-policy")).toContain(`'nonce-${nonce}'`);
    expect(response.headers.get("content-security-policy")).toContain("'strict-dynamic'");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
  });

  it("la renovación de sesión conserva reescritura, cookies y cabeceras", async () => {
    f.refreshCookies = true;
    f.getUser.mockResolvedValue({ data: { user: { id: "business-user" } }, error: null });
    const response = await middleware(request("/?utm_campaign=salon"));
    expect(response.headers.get("x-middleware-rewrite")).toContain("/sectores/peluquerias?utm_campaign=salon");
    expect(response.cookies.get("sb-test")?.value).toBe("renewed");
    expect(response.headers.get("x-middleware-request-x-franky-sector-site")).toBe("peluquerias");
    expect(f.profile).not.toHaveBeenCalled();
  });

  it("un Host reenviado no activa el subdominio y se elimina una cabecera inventada", async () => {
    const response = await middleware(request("/", "franky.es", {
      "x-forwarded-host": "peluquerias.franky.es",
      "x-franky-sector-site": "peluquerias",
    }));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-franky-sector-site")).toBe("");
  });

  it("el catálogo de estudiantes redirige al host fijo conservando atribución", async () => {
    const response = await middleware(request("/ocio/123?utm_source=google&gclid=456"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://franky.es/ocio/123?utm_source=google&gclid=456");
    expect(f.getUser).not.toHaveBeenCalled();
  });

  it.each(["/pro/space-123?section=agenda", "/eventos/crear?source=pro", "/fomo/alicante/thread-123"])(
    "mantiene autenticación y destino completo en %s", async (path) => {
      const response = await middleware(request(path));
      expect(response.status).toBe(307);
      const target = new URL(response.headers.get("location")!);
      expect(target.host).toBe("peluquerias.franky.es");
      expect(target.pathname).toBe("/login");
      expect(target.searchParams.get("next")).toBe(path);
    },
  );

  it("las APIs privadas siguen devolviendo 401", async () => {
    expect((await middleware(request("/api/workspaces/private"))).status).toBe(401);
  });

  it.each(["/pro", "/pro/empezar", "/pro/demo-peluqueria", "/login", "/auth/callback?code=abc"])(
    "conserva %s dentro del mismo host", async (path) => {
      const response = await middleware(request(path));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    },
  );

  it("activa canonical por sector sin perder parámetros", async () => {
    vi.stubEnv("FRANKY_SECTOR_SUBDOMAINS", "peluquerias");
    const redirect = await middleware(request("/sectores/peluquerias?utm_source=ads", "franky.es"));
    expect(redirect.headers.get("location")).toBe("https://peluquerias.franky.es/?utm_source=ads");
    const landing = await middleware(request("/"));
    expect(landing.headers.get("x-robots-tag")).toBeNull();
    const access = await middleware(request("/acceder"));
    expect(access.headers.get("x-robots-tag")).toBe("noindex, follow");
  });

  it("no hace públicas las subrutas desconocidas de un sector", async () => {
    const response = await middleware(request("/sectores/peluquerias/admin", "franky.es"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?next=");
  });
});
