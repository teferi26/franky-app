import { describe, expect, it, vi } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { canProCommand, planProCommand, ProCommandRunner } from "@/lib/pro/remote-actions";
import { freeGaps, openingIntervals, startTimes } from "@/lib/pro/agenda";

const now = new Date("2026-09-24T08:00:00Z");

describe("comandos confirmados de la agenda", () => {
  it("no concede una escritura desconocida ni finanzas a un editor", () => {
    expect(canProCommand({ "content.manage": true }, "booking.charge")).toBe(false);
    expect(canProCommand({ "content.manage": true }, "staff.invite")).toBe(false);
    expect(canProCommand({ "finance.read": true }, "booking.create")).toBe(false);
    expect(canProCommand({ "content.manage": true }, "booking.create")).toBe(true);
  });

  it("traduce el alta a una transacción y omite insignias y contadores del formulario", () => {
    const before = buildDemo("hairdresser", now);
    const after = structuredClone(before);
    after.clients.push({ ...before.clients[0], id: "local-client", visits: 999, cardMember: true, name: "Ana" });
    after.bookings.push({ ...before.bookings[0], id: "local-booking", clientId: "local-client", clientName: "Ana", note: "Preferencias", source: "phone" });
    const command = planProCommand("booking.create", before, after);
    expect(command.rpc).toBe("pro_create_agenda_booking");
    expect(command.args.p_data).toMatchObject({ customer_id: null, customer_name: "Ana", note: "Preferencias", source: "phone" });
    expect(JSON.stringify(command.args)).not.toContain("cardMember");
    expect(JSON.stringify(command.args)).not.toContain("visits");
    expect(JSON.stringify(command.args)).not.toContain("local-client");
  });

  it("archiva servicios y no borra su historial", () => {
    const before = buildDemo("hairdresser", now);
    const after = { ...before, services: before.services.slice(1) };
    expect(planProCommand("service.delete", before, after).args).toMatchObject({
      p_entity: "service", p_record_id: before.services[0].id, p_data: { active: false },
    });
  });

  it("rechaza descuentos sin regla y mutaciones a otro negocio", () => {
    const before = buildDemo("hairdresser", now);
    const after = structuredClone(before);
    after.services[0].studentPriceCents = 1;
    expect(() => planProCommand("service.update", before, after)).toThrow("tarifa aprobada");
    after.space.id = "otro-negocio";
    expect(() => planProCommand("service.update", before, after)).toThrow("negocio ha cambiado");
  });

  it("mantiene la clave del intento perdido aunque se regenere el id local del formulario", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: { message: "network" }, data: null })
      .mockResolvedValueOnce({ error: null, data: { id: "persisted" } });
    const runner = new ProCommandRunner({ rpc });
    const before = buildDemo("hairdresser", now);
    const next = () => ({ ...before, clients: [...before.clients, { ...before.clients[0], id: crypto.randomUUID(), name: "Nueva" }] });
    await expect(runner.run(planProCommand("client.create", before, next()))).rejects.toThrow();
    await runner.run(planProCommand("client.create", before, next()));
    expect(rpc.mock.calls[0][1].p_data.client_request_id).toBe(rpc.mock.calls[1][1].p_data.client_request_id);
    runner.clear();
    rpc.mockResolvedValue({ data: {}, error: null });
    await runner.run(planProCommand("client.create", before, next()));
    expect(rpc.mock.calls[2][1].p_data.client_request_id).not.toBe(rpc.mock.calls[1][1].p_data.client_request_id);
  });
});

describe("huecos en horarios reales", () => {
  function calendar() {
    const data = buildDemo("hairdresser", now);
    data.bookings = [];
    const staff = data.staff[0].id;
    data.staff = [data.staff[0]];
    data.services = [{ ...data.services[0], staffIds: [staff] }];
    data.calendar = {
      range: { from: "2026-09-01T00:00:00Z", until: "2026-10-01T00:00:00Z" },
      availability: [
        { id: "am", organization_id: data.space.id, resource_id: null, weekday: 4, start_minute: 540, end_minute: 780 },
        { id: "pm", organization_id: data.space.id, resource_id: null, weekday: 4, start_minute: 960, end_minute: 1200 },
        { id: "staff", organization_id: data.space.id, resource_id: staff, weekday: 4, start_minute: 600, end_minute: 1080 },
      ], exceptions: [], services: [], bookings: [], sessions: [],
    };
    return data;
  }

  it("no convierte una jornada partida en disponibilidad durante la comida", () => {
    const data = calendar();
    expect(openingIntervals(data, "2026-09-24", data.staff[0].id)).toEqual([{ open: 600, close: 780 }, { open: 960, close: 1080 }]);
    const starts = startTimes(data, "2026-09-24", data.staff[0].id, 30);
    expect(starts).toContain(750);
    expect(starts).not.toContain(780);
    expect(starts).not.toContain(900);
    expect(starts).not.toContain(1065);
  });

  it("respeta una ausencia personal sin cerrar los otros profesionales", () => {
    const data = calendar();
    data.calendar!.exceptions.push({ id: "off", organization_id: data.space.id, resource_id: data.staff[0].id, local_date: "2026-09-24", reason: "Ausencia" });
    expect(freeGaps(data, "2026-09-24", 0)).toEqual([]);
    expect(openingIntervals(data, "2026-09-24")).toHaveLength(2);
  });

  it("no inventa huecos fuera del periodo descargado", () => {
    const data = calendar();
    expect(startTimes(data, "2026-10-08", data.staff[0].id, 30)).toEqual([]);
  });
});
