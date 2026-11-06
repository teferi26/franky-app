import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { loadProSlots } from "../../../shared/pro/slots";
import { publicProError } from "../../../shared/pro/remote-actions";
import { nativeLoader } from "./helpers/native-module";

function fixture() {
  const rpc = vi.fn();
  const context = {
    client: { rpc },
    date: "2099-09-24",
    snapshot: { data: { space: { id: "local-org" } } },
  };
  const load = nativeLoader({
    react: { ...React, default: React },
    "../../../../shared/pro/slots": { loadProSlots },
    "../../../../shared/pro/remote-actions": { publicProError },
    "./ProProvider": { useNativePro: () => context },
  });
  const { useProSlots } = load("../mobile/src/components/pro/useProSlots.ts");
  return { rpc, context, useProSlots };
}

describe("agenda nativa: recuperación de disponibilidad", () => {
  it("reintenta una consulta fallida sin cambiar de profesional ni servicio", async () => {
    const f = fixture();
    f.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Failed to fetch" },
      })
      .mockResolvedValueOnce({ data: ["2099-09-24T08:00:00Z"], error: null });
    const { result } = renderHook(() => f.useProSlots("service", "staff"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.slots).toEqual([]);
    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);
    await waitFor(() =>
      expect(result.current.slots).toEqual(["2099-09-24T08:00:00Z"]),
    );
    expect(result.current.error).toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(2);
    expect(f.rpc.mock.calls[0]).toEqual(f.rpc.mock.calls[1]);
  });

  it("retira huecos antiguos durante la recarga y descarta la respuesta anterior", async () => {
    const f = fixture();
    let finishOld!: (value: unknown) => void;
    let finishNew!: (value: unknown) => void;
    f.rpc
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishNew = resolve;
          }),
      );
    const { result, rerender } = renderHook(() =>
      f.useProSlots("service", "staff"),
    );
    f.context.snapshot = { data: { space: { id: "local-org" } } };
    rerender();
    expect(result.current.loading).toBe(true);
    await act(async () => {
      finishNew({ data: ["2099-09-24T09:00:00Z"], error: null });
    });
    await act(async () => {
      finishOld({ data: ["2099-09-24T08:00:00Z"], error: null });
    });
    expect(result.current.slots).toEqual(["2099-09-24T09:00:00Z"]);
    f.rpc.mockResolvedValueOnce({ data: [], error: null });
    f.context.snapshot = { data: { space: { id: "local-org" } } };
    rerender();
    expect(result.current.loading).toBe(true);
    expect(result.current.slots).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.slots).toEqual([]);
  });
});
