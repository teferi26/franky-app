import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealProProvider } from "@/lib/pro/store-real";
import { usePro } from "@/lib/pro/store";
import { buildDemo } from "@/lib/pro/demo";
import { localDate } from "@/lib/pro/format";
import type { ProRemoteSnapshot } from "@/lib/pro/remote-contracts";

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;
const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-a" } as { id: string } | null, loading: false },
  load: vi.fn<(...args: unknown[]) => Promise<ProRemoteSnapshot>>(),
  rpc: vi.fn<(name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: null }>>(),
  callbacks: new Set<AuthCallback>(),
}));

vi.mock("@/components/SessionProvider", () => ({ useSession: () => mocks.session }));
vi.mock("@/lib/pro/remote-data", () => ({ loadProWorkspace: mocks.load }));
vi.mock("@/lib/supabase-client", () => ({
  createClient: () => ({
    rpc: mocks.rpc,
    auth: {
      onAuthStateChange: (callback: AuthCallback) => {
        mocks.callbacks.add(callback);
        return { data: { subscription: { unsubscribe: () => mocks.callbacks.delete(callback) } } };
      },
    },
  }),
}));

function snapshot(name = "Negocio A"): ProRemoteSnapshot {
  const data = buildDemo("hairdresser", new Date("2026-09-24T09:30:00Z"));
  data.space = { ...data.space, id: "space-a", name, demo: false };
  data.services = [{ ...data.services[0], name: "Servicio original", studentPriceCents: undefined }];
  return {
    data,
    permissions: { "resource.read": true, "content.manage": true, "finance.read": true, "finance.manage": true },
    spaces: [{ id: "space-a", name }],
    complete: true,
    range: { from: "2000-01-01T00:00:00.000Z", until: "2100-01-01T00:00:00.000Z" },
    availability: [], exceptions: [], resources: [], services: [], bookings: [], customers: [], bundles: [], shifts: [],
    incompleteReasons: [],
    settings: {
      organization_id: "space-a", category: "hairdresser", timezone: "Europe/Madrid", enabled: true,
      public_booking: true, require_approval: false, booking_horizon_days: 90, cancellation_hours: 24,
      terms: "", staff_limit: 3, resource_limit: 20, service_limit: 50, sales_enabled: false, demo: false,
    },
  };
}

function Probe() {
  const store = usePro();
  const [result, setResult] = useState("");
  return (
    <>
      <p>{store.data.space.name}</p>
      <p>{store.data.services[0].name}</p>
      <output aria-label="Resultado">{result}</output>
      <output aria-label="Pendiente">{String(store.pending)}</output>
      <output aria-label="Error">{store.error}</output>
      <output aria-label="Permisos">{`${store.canView("agenda")}:${store.canView("caja")}:${store.canView("ajustes")}`}</output>
      <button onClick={async () => setResult(String(await store.update("service.update", (data) => ({
        ...data,
        services: data.services.map((service) => ({ ...service, name: "Servicio guardado" })),
      }))))}>Guardar</button>
      <button onClick={store.refresh}>Actualizar</button>
      <button onClick={() => store.loadDate("2030-01-01")}>Ir a otra fecha</button>
      <button onClick={() => store.loadDate(localDate(new Date()))}>Volver a hoy</button>
    </>
  );
}

function view() {
  return <RealProProvider spaceId="space-a" fallback={<p>Cargando</p>}><Probe /></RealProProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.callbacks.clear();
  mocks.session = { user: { id: "user-a" }, loading: false };
  mocks.load.mockResolvedValue(snapshot());
  mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Franky Pro: datos reales y sesión", () => {
  it("ofrece reintento cuando la agenda está pendiente de activación", async () => {
    mocks.load.mockRejectedValueOnce(Object.assign(new Error("schema cache"), { code: "PGRST202" }));
    render(view());
    expect(await screen.findByRole("heading", { name: "Tu agenda está pendiente de activación" })).toBeInTheDocument();
    expect(screen.queryByText("Negocio A")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a intentar" }));
    expect(await screen.findByText("Negocio A")).toBeInTheDocument();
  });

  it("descarta una lectura tardía de la cuenta anterior", async () => {
    let finish!: (value: ProRemoteSnapshot) => void;
    mocks.load.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const page = render(view());
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    mocks.session.user = { id: "user-b" };
    mocks.load.mockResolvedValue(snapshot("Negocio B"));
    page.rerender(view());
    expect(await screen.findByText("Negocio B")).toBeInTheDocument();

    await act(async () => { finish(snapshot("Datos privados A")); });
    expect(screen.queryByText("Datos privados A")).not.toBeInTheDocument();
    expect(screen.getByText("Negocio B")).toBeInTheDocument();
  });

  it("retira los datos inmediatamente al recibir un cierre de sesión durante un guardado", async () => {
    let finish!: (value: { data: unknown; error: null }) => void;
    mocks.rpc.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(view());
    await screen.findByText("Negocio A");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      for (const callback of mocks.callbacks) callback("SIGNED_OUT", null);
    });
    expect(screen.queryByText("Negocio A")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "La sesión ha cambiado" })).toBeInTheDocument();
    await act(async () => { finish({ data: { ok: true }, error: null }); });
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Servicio guardado")).not.toBeInTheDocument();
  });

  it("no confirma cambios sin releerlos y conserva la clave del reintento", async () => {
    const confirmed = snapshot();
    confirmed.data.services[0].name = "Servicio guardado";
    mocks.load.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(confirmed);
    render(view());
    await screen.findByText("Negocio A");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByLabelText("Resultado")).toHaveTextContent("false"));
    expect(screen.getByText("Servicio original")).toBeInTheDocument();
    expect(screen.queryByText("Servicio guardado")).not.toBeInTheDocument();
    const firstData = mocks.rpc.mock.calls[0][1]?.p_data as Record<string, unknown>;
    expect(firstData.client_request_id).toEqual(expect.any(String));

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByLabelText("Resultado")).toHaveTextContent("true"));
    const retriedData = mocks.rpc.mock.calls[1][1]?.p_data as Record<string, unknown>;
    expect(retriedData.client_request_id).toBe(firstData.client_request_id);
    expect(screen.getByText("Servicio guardado")).toBeInTheDocument();
  });

  it("bloquea dos guardados simultáneos antes del siguiente render", async () => {
    let finish!: (value: { data: unknown; error: null }) => void;
    mocks.rpc.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(view());
    await screen.findByText("Negocio A");
    const save = screen.getByRole("button", { name: "Guardar" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Servicio original")).toBeInTheDocument();
    await act(async () => { finish({ data: { ok: true }, error: null }); });
  });

  it("conserva el intento incierto aunque se actualice la agenda al recuperar el foco", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    mocks.rpc.mockRejectedValueOnce(new Error("network_lost"));
    render(view());
    await screen.findByText("Negocio A");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByLabelText("Resultado")).toHaveTextContent("false"));
    const firstData = mocks.rpc.mock.calls[0][1]?.p_data as Record<string, unknown>;

    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(mocks.load).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByLabelText("Resultado")).toHaveTextContent("true"));

    const retriedData = mocks.rpc.mock.calls[1][1]?.p_data as Record<string, unknown>;
    expect(retriedData.client_request_id).toBe(firstData.client_request_id);
  });

  it("borra los datos si una actualización confirma que se revocó el acceso", async () => {
    mocks.load.mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(Object.assign(new Error("forbidden"), { code: "42501" }));
    render(view());
    await screen.findByText("Negocio A");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await screen.findByText(/Tu acceso ha cambiado/);
    expect(screen.queryByText("Negocio A")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("permite consultar una lectura incompleta pero impide escribir", async () => {
    mocks.load.mockResolvedValue({ ...snapshot(), complete: false, incompleteReasons: ["bookings"] });
    render(view());
    await screen.findByText("Negocio A");
    expect(screen.getByLabelText("Error")).toHaveTextContent("No se ha podido cargar toda la agenda");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByLabelText("Resultado")).toHaveTextContent("false"));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("aplica permisos de lectura también a las rutas directas", async () => {
    const limited = snapshot();
    limited.permissions = { "resource.read": true, "attendees.manage": true };
    mocks.load.mockResolvedValue(limited);
    render(view());
    await screen.findByText("Negocio A");
    expect(screen.getByLabelText("Permisos")).toHaveTextContent("true:false:false");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByLabelText("Resultado")).toHaveTextContent("false"));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("recupera el último día elegido aunque se vuelva atrás durante una lectura", async () => {
    mocks.load.mockImplementation(async (_client, _space, from, until) => ({
      ...snapshot(), range: { from: String(from), until: String(until) },
    }));
    render(view());
    await screen.findByText("Negocio A");
    const initialFrom = mocks.load.mock.calls[0][2];
    let finish!: () => void;
    mocks.load.mockImplementationOnce((_client, _space, from, until) => new Promise((resolve) => {
      finish = () => resolve({ ...snapshot(), range: { from: String(from), until: String(until) } });
    }));

    fireEvent.click(screen.getByRole("button", { name: "Ir a otra fecha" }));
    expect(mocks.load).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Volver a hoy" }));
    await act(async () => { finish(); });

    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
    expect(mocks.load.mock.calls[2][2]).toBe(initialFrom);
    expect(screen.getByLabelText("Pendiente")).toHaveTextContent("false");
  });
});
