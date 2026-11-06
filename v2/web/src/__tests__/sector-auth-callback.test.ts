// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabase: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
    },
    rpc: mock.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: mock.profile,
      };
      return query;
    },
  }),
}));

import { GET } from "@/app/auth/callback/route";

describe("regreso al sector después del acceso con OAuth", () => {
  beforeEach(() => {
    mock.profile.mockResolvedValue({
      data: { onboarding_completed: true, role: "propietario" },
      error: null,
    });
  });

  it("el propietario vuelve al acceso de su sector en el mismo host", async () => {
    const response = await GET(
      new Request(
        "https://inmobiliarias.franky.es/auth/callback?code=test&next=%2Facceder",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://inmobiliarias.franky.es/acceder",
    );
  });

  it("conserva el destino de la página de sector en el dominio principal", async () => {
    const response = await GET(
      new Request(
        "https://franky.es/auth/callback?code=test&next=%2Fsectores%2Finmobiliarias%2Facceder",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://franky.es/sectores/inmobiliarias/acceder",
    );
  });

  it("el destino exterior inválido mantiene el panel habitual del propietario", async () => {
    const response = await GET(
      new Request(
        "https://franky.es/auth/callback?code=test&next=https%3A%2F%2Fevil.example",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://franky.es/propietario/dashboard",
    );
  });

  it("el alta profesional nueva vuelve directamente a sus datos de negocio", async () => {
    mock.profile.mockResolvedValue({
      data: { onboarding_completed: false, role: "user" },
      error: null,
    });
    const response = await GET(
      new Request(
        "https://franky.es/auth/callback?code=test&next=%2Fpro%2Fempezar%3Fsector%3Dhairdresser",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://franky.es/pro/empezar?sector=hairdresser",
    );
  });
  it("un usuario nuevo completa el onboarding antes de volver al sector", async () => {
    mock.profile.mockResolvedValue({
      data: { onboarding_completed: false, role: "propietario" },
      error: null,
    });
    const response = await GET(
      new Request(
        "https://inmobiliarias.franky.es/auth/callback?code=test&next=%2Facceder",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://inmobiliarias.franky.es/onboarding?next=%2Facceder",
    );
  });
});
