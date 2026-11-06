import { describe, expect, it, vi } from "vitest";
import {
  loadSectorWorkspaces,
  parseSectorWorkspaces,
  sectorWorkspaceHref,
  selectAuthorizedWorkspace,
  validOrganizationId,
} from "@/lib/sector-workspace-access";
import { sectorOnboardingContext } from "@/lib/sector-onboarding";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const membership = (id = A, extra: Record<string, unknown> = {}) => ({
  id,
  name: "Mi negocio",
  kind: "leisure",
  subtype: "owner",
  city: "Alicante",
  status: "active",
  permissions: ["resource.read"],
  ...extra,
});

describe("Acceso sectorial con membresías reales", () => {
  it("selecciona la organización solicitada solo si pertenece a la lista autorizada", () => {
    const list = [{ id: A }, { id: B }];
    expect(selectAuthorizedWorkspace(list, B, A)).toBe(B);
    expect(selectAuthorizedWorkspace(list, C, A)).toBe(A);
    expect(selectAuthorizedWorkspace(list, [B], A)).toBe(A);
    expect(selectAuthorizedWorkspace([], B, A)).toBeNull();
    expect(validOrganizationId("//otra-web.es")).toBeNull();
  });

  it("descarta organizaciones sin permiso, suspendidas, duplicadas o sin UUID", () => {
    expect(
      parseSectorWorkspaces([
        membership(),
        membership(),
        membership(B, { status: "suspended" }),
        membership(C, { permissions: [] }),
        membership("no-es-un-uuid"),
      ]),
    ).toEqual([expect.objectContaining({ id: A, vertical: null })]);
  });

  it("consulta solo ocio y resuelve el sector con la ficha o ajustes protegidos", async () => {
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "list_my_workspaces")
        return {
          data: [
            membership(),
            membership(B),
            membership(C, { kind: "housing" }),
          ],
          error: null,
        };
      if (name === "pro_get_space")
        return {
          data: {
            organization: { id: args?.p_organization_id },
            profile:
              args?.p_organization_id === A
                ? { organization_id: A, vertical: "hairdresser" }
                : null,
          },
          error: null,
        };
      return {
        data: { settings: { organization_id: B, category: "bar" } },
        error: null,
      };
    });
    const result = await loadSectorWorkspaces({ rpc }, "hairdresser");
    expect(result.map((space) => space.id)).toEqual([A]);
    expect(rpc).toHaveBeenCalledTimes(4);
    expect(rpc).toHaveBeenCalledWith(
      "professional_get_workspace",
      expect.objectContaining({ p_organization_id: B }),
    );
    expect(
      rpc.mock.calls.some(([, args]) => args?.p_organization_id === C),
    ).toBe(false);
  });

  it("no convierte un fallo de permisos o datos en una lista vacía", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "list_my_workspaces"
        ? { data: [membership()], error: null }
        : { data: null, error: { message: "forbidden" } },
    );
    await expect(loadSectorWorkspaces({ rpc }, "bar")).rejects.toThrow(
      "workspace_sector_unavailable",
    );
  });

  it("rechaza una ficha que no corresponde a la organización consultada", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "list_my_workspaces"
        ? { data: [membership()], error: null }
        : {
            data: {
              organization: { id: B },
              profile: { organization_id: B, vertical: "bar" },
            },
            error: null,
          },
    );
    await expect(loadSectorWorkspaces({ rpc }, "bar")).rejects.toThrow(
      "workspace_identity_mismatch",
    );
  });

  it("distingue propietario e inmobiliaria y conserva su panel real", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        membership(A, { kind: "housing", subtype: "agency" }),
        membership(B, { kind: "housing", subtype: "owner" }),
      ],
      error: null,
    }));
    const result = await loadSectorWorkspaces({ rpc }, "agency");
    expect(result.map((space) => space.id)).toEqual([A]);
    expect(sectorWorkspaceHref(result[0])).toBe(
      `/espacios?panel=1&organization=${A}`,
    );
    expect(
      sectorWorkspaceHref({
        ...result[0],
        kind: "leisure",
        vertical: "hairdresser",
      }),
    ).toBe(`/pro/${A}`);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("Alta procedente de un sector", () => {
  it("acepta un sector conocido y solo identificadores de campaña acotados", () => {
    expect(
      sectorOnboardingContext({
        sector: "hairdresser",
        origen: "peluquerias",
        utm_source: "google",
        utm_campaign: "peluquerias_2026",
        utm_content: "a".repeat(81),
        utm_term: "persona@example.com",
        token: "private",
        email: "persona@example.com",
      }),
    ).toEqual({
      initialVertical: "hairdresser",
      attribution: [
        "Página de origen: peluquerias",
        "utm_source: google",
        "utm_campaign: peluquerias_2026",
      ],
    });
  });

  it("ignora sectores desconocidos, parámetros duplicados y URLs libres", () => {
    expect(
      sectorOnboardingContext({
        sector: ["bar", "university"],
        origin: "https://evil.test",
        utm_source: ["a", "b"],
      }),
    ).toEqual({ initialVertical: null, attribution: [] });
    expect(
      sectorOnboardingContext({
        sector: "constructor",
        utm_campaign: "x\nsecret",
      }),
    ).toEqual({ initialVertical: null, attribution: [] });
  });
});
