import { describe, expect, it, vi } from "vitest";
import {
  ProCommandRunner,
  planProCommand,
  type ProCommand,
} from "../../../shared/pro/remote-actions";
import {
  ProCommandRunner as WebRunner,
  planProCommand as webPlan,
} from "@/lib/pro/remote-actions";
import { loadProWorkspace } from "../../../shared/pro/remote-data";
import { loadProWorkspace as webLoad } from "@/lib/pro/remote-data";

describe("Franky Pro: núcleo compartido", () => {
  it("web utiliza la misma implementación de lectura y escritura que Expo", () => {
    expect(WebRunner).toBe(ProCommandRunner);
    expect(webPlan).toBe(planProCommand);
    expect(webLoad).toBe(loadProWorkspace);
  });

  it("usa el generador nativo una sola vez al reintentar una respuesta perdida", async () => {
    const requestId = "b2895b72-66c0-4b42-a589-22fcc4182878";
    const generate = vi.fn(() => requestId);
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "network" } })
      .mockResolvedValue({ data: { id: "booking" }, error: null });
    const runner = new ProCommandRunner({ rpc }, generate);
    const command: ProCommand = {
      rpc: "pro_create_agenda_booking",
      args: { p_organization_id: "organization", p_data: { note: "Visita" } },
      idempotent: true,
    };

    await expect(runner.run(command)).rejects.toThrow();
    await expect(runner.run(command)).resolves.toEqual({ id: "booking" });
    expect(generate).toHaveBeenCalledTimes(1);
    for (const [, args] of rpc.mock.calls) {
      expect(args.p_data.client_request_id).toBe(requestId);
    }

    runner.clear(command);
    await runner.run(command);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
