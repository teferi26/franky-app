import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgendaSlots } from "@/lib/pro/use-agenda-slots";
import { customerWhatsApp } from "@/lib/pro/customer-contact";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), usePro: vi.fn() }));
vi.mock("@/lib/supabase-client", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/pro/store", () => ({ usePro: mocks.usePro }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.usePro.mockReturnValue({ demo: false, data: { space: { id: "local-space" } } });
});
afterEach(cleanup);

describe("huecos confirmados por el servidor", () => {
  const input = { date: "2026-09-25", serviceId: "service", staffId: "staff", duration: 30 };

  it("consulta los recursos elegidos y traduce a la hora del negocio", async () => {
    mocks.rpc.mockResolvedValue({ data: ["2026-09-25T08:30:00Z", "2026-09-25T08:00:00Z", "2026-09-25T08:00:00Z"], error: null });
    const { result } = renderHook(() => useAgendaSlots(input));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.minutes).toEqual([600, 630]);
    expect(mocks.rpc).toHaveBeenCalledWith("professional_get_slots", {
      p_organization_id: "local-space", p_service_id: "service", p_date: "2026-09-25", p_resource_ids: ["staff"], p_party_size: 1,
    });
  });

  it("descarta la respuesta antigua al cambiar de fecha", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ data: ["2026-09-26T09:00:00Z"], error: null });
    const { result, rerender } = renderHook(({ date }) => useAgendaSlots({ ...input, date }), { initialProps: { date: input.date } });
    rerender({ date: "2026-09-26" });
    await waitFor(() => expect(result.current.minutes).toEqual([660]));
    await act(async () => { resolveOld({ data: ["2026-09-25T08:00:00Z"], error: null }); });
    expect(result.current.minutes).toEqual([660]);
  });

  it.each([
    { data: null, error: { code: "42501", message: "private permission detail" } },
    { data: ["not-a-date"], error: null },
  ])("no inventa disponibilidad ni expone detalles cuando falla la lectura", async response => {
    mocks.rpc.mockResolvedValue(response);
    const { result } = renderHook(() => useAgendaSlots(input));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.minutes).toEqual([]);
    expect(result.current.error).toBeTruthy();
    expect(result.current.error).not.toContain("private");
  });
});

describe("enlaces de contacto", () => {
  it("preserva prefijos internacionales y no duplica el de España", () => {
    for (const phone of ["600 123 456", "+34 600 123 456", "0034 600 123 456"]) {
      expect(customerWhatsApp(phone, "Hola Ana")).toBe("https://wa.me/34600123456?text=Hola%20Ana");
    }
    expect(customerWhatsApp("+33 6 12 34 56 78", "Hola")).toBe("https://wa.me/33612345678?text=Hola");
    expect(customerWhatsApp("persona@example.test", "Hola")).toBeUndefined();
    expect(customerWhatsApp("112", "Hola")).toBeUndefined();
  });
});
