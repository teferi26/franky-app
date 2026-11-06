import React from "react";
import * as jsx from "react/jsx-runtime";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as actions from "../../../shared/pro/remote-actions";
import * as format from "../../../shared/pro/format";
import * as verticals from "../../../shared/pro/verticals";
import { buildDemo } from "@/lib/pro/demo";
import { nativeLoader } from "./helpers/native-module";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function fixture() {
  let owner = { userId: "owner-a", generation: 1 };
  let org = "org-a";
  let controller = new AbortController();
  let state: any;
  let currentSnapshot: any;
  const data = buildDemo("hairdresser", new Date());
  data.space.id = org;
  data.space.demo = false;
  const snapshot = () => ({
    data: JSON.parse(JSON.stringify(data)),
    settings: { timezone: "Europe/Madrid" },
    permissions: {
      "resource.read": true,
      "content.manage": true,
      "finance.read": true,
      "finance.manage": true,
    },
    complete: true,
    range: {
      from: format.atLocal(format.addDays(format.localDate(new Date()), -1), 0),
      until: format.atLocal(format.addDays(format.localDate(new Date()), 2), 0),
    },
  });
  currentSnapshot = snapshot();
  const rpc = vi.fn(
    async (_name: string, _args: Record<string, any>): Promise<any> => ({
      data: {},
      error: null,
    }),
  );
  const read = vi.fn(
    async (
      _client: any,
      id: string,
      from: string,
      until: string,
    ): Promise<any> => ({
      ...JSON.parse(JSON.stringify(currentSnapshot)),
      data: {
        ...JSON.parse(JSON.stringify(currentSnapshot.data)),
        space: { ...currentSnapshot.data.space, id },
      },
      range: { from, until },
    }),
  );
  const refreshWorkspace = vi.fn(async () => {});
  const isCurrent = vi.fn(
    (id: string) => id === org && !controller.signal.aborted,
  );
  const createClient = vi.fn((_input: any) => ({ rpc }));
  const generate = vi.fn(() => "b2895b72-66c0-4b42-a589-22fcc4182878");
  const load = nativeLoader(
    {
      react: { ...React, default: React },
      "react/jsx-runtime": jsx,
      "react-native": {
        AppState: {
          currentState: "active",
          addEventListener: () => ({ remove() {} }),
        },
      },
      "expo-crypto": { randomUUID: generate },
      "@/components/WorkspaceProvider": {
        useWorkspace: () => ({
          signal: controller.signal,
          isCurrent,
          refresh: refreshWorkspace,
        }),
      },
      "@/lib/pro-client": { createNativeProClient: createClient },
      "@/lib/session": {
        isCurrentSessionIdentity: (candidate: any) =>
          candidate.userId === owner.userId &&
          candidate.generation === owner.generation,
      },
      "../../../../shared/pro/format": format,
      "../../../../shared/pro/remote-data": { loadProWorkspace: read },
      "../../../../shared/pro/remote-actions": actions,
      "../../../../shared/pro/verticals": verticals,
    },
    { setInterval, clearInterval },
  );
  const { ProProvider, useNativePro } = load(
    "../mobile/src/components/pro/ProProvider.tsx",
  );
  function Probe() {
    state = useNativePro();
    return <span>{state.snapshot?.data.space.id ?? "loading"}</span>;
  }
  function Page() {
    return (
      <ProProvider
        key={`${owner.userId}:${owner.generation}:${org}`}
        owner={owner}
        organizationId={org}
      >
        <Probe />
      </ProProvider>
    );
  }
  return {
    Page,
    read,
    rpc,
    createClient,
    refreshWorkspace,
    generate,
    snapshot,
    get state() {
      return state;
    },
    get current() {
      return currentSnapshot;
    },
    set current(value: any) {
      currentSnapshot = value;
    },
    switch() {
      controller.abort();
      controller = new AbortController();
      owner = { userId: "owner-b", generation: 2 };
      org = "org-b";
    },
  };
}

describe("agenda nativa: operaciones y sesión", () => {
  it("espera a recargar antes de mostrar el cambio y bloquea el doble toque", async () => {
    const f = fixture();
    render(<f.Page />);
    await waitFor(() => expect(f.state.can("client.technical")).toBe(true));
    const response = deferred<any>();
    const reload = deferred<any>();
    f.rpc.mockImplementationOnce(() => response.promise);
    f.read.mockImplementationOnce(() => reload.promise);
    const previous = f.state.snapshot.data.clients[0].technical;
    let result!: Promise<boolean>;
    await act(async () => {
      result = f.state.update("client.technical", (draft: any) => {
        draft.clients[0].technical = "Color nuevo";
      });
      expect(
        await f.state.update("client.technical", (draft: any) => {
          draft.clients[0].technical = "Otra nota";
        }),
      ).toBe(false);
    });
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.state.snapshot.data.clients[0].technical).toBe(previous);
    await act(async () => response.resolve({ data: {}, error: null }));
    expect(f.state.pending).toBe(true);
    const confirmed = f.snapshot();
    confirmed.data.clients[0].technical = "Color nuevo";
    await act(async () => reload.resolve(confirmed));
    expect(await result).toBe(true);
    expect(f.state.snapshot.data.clients[0].technical).toBe("Color nuevo");
  });

  it("ignora una lectura anterior al cambiar de cuenta y aborta su cliente", async () => {
    const f = fixture();
    const old = deferred<any>();
    f.read.mockImplementationOnce(() => old.promise);
    const page = render(<f.Page />);
    const captured = f.createClient.mock.calls[0][0] as any;
    f.switch();
    page.rerender(<f.Page />);
    await waitFor(() => expect(f.state.snapshot?.data.space.id).toBe("org-b"));
    expect(captured.signal.aborted).toBe(true);
    await act(async () => old.resolve(f.snapshot()));
    expect(f.state.snapshot.data.space.id).toBe("org-b");
  });

  it("descarta permisos y datos cuando el servidor revoca el acceso", async () => {
    const f = fixture();
    render(<f.Page />);
    await waitFor(() => expect(f.state.can("client.technical")).toBe(true));
    f.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "workspace_forbidden", code: "42501" },
    });
    await act(async () => {
      expect(
        await f.state.update("client.technical", (draft: any) => {
          draft.clients[0].technical = "Cambio";
        }),
      ).toBe(false);
    });
    expect(f.state.snapshot).toBeNull();
    expect(f.state.can("client.technical")).toBe(false);
    expect(f.refreshWorkspace).toHaveBeenCalled();
  });

  it("conserva la clave tras respuesta incierta y exige comprobar antes de otra escritura", async () => {
    const f = fixture();
    render(<f.Page />);
    await waitFor(() => expect(f.state.can("client.technical")).toBe(true));
    f.read.mockRejectedValueOnce(new Error("network"));
    const edit = (draft: any) => {
      draft.clients[0].technical = "Reintento";
    };
    await act(async () => {
      expect(await f.state.update("client.technical", edit)).toBe(false);
    });
    expect(f.state.can("client.technical")).toBe(false);
    await act(async () => f.state.refresh());
    await act(async () => {
      expect(await f.state.update("client.technical", edit)).toBe(true);
    });
    expect(f.rpc.mock.calls[0][1].p_data.client_request_id).toBe(
      f.rpc.mock.calls[1][1].p_data.client_request_id,
    );
    expect(f.generate).toHaveBeenCalledTimes(1);
  });

  it("resiste navegación rápida de fechas y una respuesta tardía del día anterior", async () => {
    const f = fixture();
    render(<f.Page />);
    await waitFor(() => expect(f.state.snapshot).not.toBeNull());
    const previous = deferred<any>();
    f.read.mockImplementationOnce(() => previous.promise);
    const today = f.state.date;
    await act(async () => {
      f.state.changeDate(format.addDays(today, 1));
      f.state.changeDate(today);
    });
    await waitFor(() => expect(f.state.can("client.technical")).toBe(true));
    const late = f.snapshot();
    late.data.space.name = "Respuesta vieja";
    await act(async () => previous.resolve(late));
    expect(f.state.date).toBe(today);
    expect(f.state.snapshot.data.space.name).not.toBe("Respuesta vieja");
  });

  it("no confirma una escritura si la recarga está incompleta y mantiene su clave", async () => {
    const f = fixture();
    render(<f.Page />);
    await waitFor(() => expect(f.state.can("client.technical")).toBe(true));
    f.read.mockResolvedValueOnce({ ...f.snapshot(), complete: false });
    const edit = (draft: any) => {
      draft.clients[0].technical = "Recarga incompleta";
    };
    await act(async () => {
      expect(await f.state.update("client.technical", edit)).toBe(false);
    });
    expect(f.state.error).toMatch(/Faltan citas/);
    expect(f.state.can("client.technical")).toBe(false);
    await act(async () => f.state.refresh());
    await act(async () => {
      expect(await f.state.update("client.technical", edit)).toBe(true);
    });
    expect(f.rpc.mock.calls[0][1].p_data.client_request_id).toBe(
      f.rpc.mock.calls[1][1].p_data.client_request_id,
    );
    expect(f.generate).toHaveBeenCalledTimes(1);
  });

  it("no muestra una recarga que pertenece a otro negocio", async () => {
    const f = fixture();
    render(<f.Page />);
    await waitFor(() => expect(f.state.snapshot).not.toBeNull());
    const invalid = f.snapshot();
    invalid.data.space.id = "other-org";
    f.read.mockResolvedValueOnce(invalid);
    await act(async () => f.state.refresh());
    expect(f.state.snapshot.data.space.id).toBe("org-a");
    expect(f.state.can("client.technical")).toBe(false);
  });

  it("carga también con el montaje doble de React y no conserva callbacks al salir", async () => {
    const f = fixture();
    const page = render(
      <React.StrictMode>
        <f.Page />
      </React.StrictMode>,
    );
    await waitFor(() => expect(f.state.can("client.technical")).toBe(true));
    const oldUpdate = f.state.update;
    page.unmount();
    expect(await oldUpdate("client.technical", () => {})).toBe(false);
  });
});

describe("cliente nativo Pro", () => {
  function clientFixture() {
    const owner = { userId: "a", generation: 1 };
    let current = true;
    const controller = new AbortController();
    const rpc = vi.fn(async (): Promise<any> => ({ private: "data" }));
    const load = nativeLoader({
      "./session": { isCurrentSessionIdentity: () => current },
      "./workspaces": { workspaceRpc: rpc },
    });
    const { createNativeProClient } = load("../mobile/src/lib/pro-client.ts");
    return {
      rpc,
      owner,
      controller,
      client: createNativeProClient({
        owner,
        organizationId: "org",
        signal: controller.signal,
        isCurrent: () => current,
      }),
      revoke() {
        current = false;
      },
    };
  }
  it("fija organización, sesión y señal, y separa el listado personal", async () => {
    const f = clientFixture();
    await f.client.rpc("pro_get_space");
    expect(f.rpc).toHaveBeenCalledWith(
      "pro_get_space",
      { p_organization_id: "org" },
      f.owner,
      f.controller.signal,
    );
    await f.client.rpc("professional_list_workspaces");
    expect(f.rpc).toHaveBeenLastCalledWith(
      "professional_list_workspaces",
      {},
      f.owner,
      f.controller.signal,
    );
    await expect(
      f.client.rpc("pro_get_space", { p_organization_id: "other" }),
    ).rejects.toThrow("workspace_changed");
    await expect(f.client.rpc("unrelated_rpc")).rejects.toThrow(
      "pro_operation_unavailable",
    );
  });
  it("rechaza una respuesta que llega después de revocar el acceso", async () => {
    const f = clientFixture();
    const response = deferred<any>();
    f.rpc.mockImplementationOnce(() => response.promise);
    const result = f.client.rpc("pro_get_space");
    f.revoke();
    response.resolve({ private: "stale" });
    await expect(result).rejects.toThrow("workspace_changed");
  });
});
