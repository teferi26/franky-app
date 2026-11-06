import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { canProCommand, planProCommand } from "@/lib/pro/remote-actions";

function base() {
  const data = buildDemo("restaurant", new Date("2026-09-24T10:00:00Z"));
  data.tableOperations = {
    canManage: true,
    canOperate: true,
    unmappedResourceIds: [],
    waitlist: [
      {
        id: "queue-1",
        customerId: "customer",
        customerName: "Ana",
        serviceId: "service",
        partySize: 2,
        requestedAt: "2026-09-24T10:00:00Z",
        expiresAt: "2026-09-24T12:00:00Z",
        status: "waiting",
        bookingId: null,
        serviceVersion: 3,
        expectedTotalCents: null,
      },
    ],
  };
  return data;
}

describe("operaciones de sala persistidas", () => {
  it("coloca una mesa existente sin duplicarla ni cambiar capacidad o uso compartido", () => {
    const data = base();
    data.tableOperations!.unmappedResourceIds = ["legacy"];
    data.tableOperations!.unmappedResources = [
      {
        id: "legacy",
        organization_id: data.space.id,
        kind: "table",
        name: "Mesa anterior",
        capacity: 6,
        active: true,
      },
    ];
    const intent = {
      type: "table.adopt" as const,
      resourceId: "legacy",
      zone: "Terraza",
      x: 0,
      y: 2,
      w: 3,
      h: 2,
      shape: "round" as const,
    };
    const command = planProCommand("table.adopt", data, data, intent);
    expect(command).toEqual({
      rpc: "pro_save_table",
      idempotent: true,
      args: {
        p_organization_id: data.space.id,
        p_table_id: "legacy",
        p_data: {
          expected_version: null,
          zone: "Terraza",
          x: 0,
          y: 2,
          w: 3,
          h: 2,
          shape: "round",
        },
      },
    });
    expect(canProCommand({ "content.manage": true }, "table.adopt")).toBe(true);
    expect(canProCommand({ "attendees.manage": true }, "table.adopt")).toBe(
      false,
    );
    expect(() => planProCommand("table.adopt", data, data)).toThrow(
      "Selecciona",
    );
    expect(() =>
      planProCommand("table.adopt", data, data, {
        ...intent,
        resourceId: "other",
      }),
    ).toThrow("Actualiza");
    data.tableOperations!.unmappedResources[0].active = false;
    expect(() => planProCommand("table.adopt", data, data, intent)).toThrow(
      "Actualiza",
    );
  });
  it("concede operación de sala sin conceder edición del plano ni reasignación inexistente", () => {
    expect(canProCommand({ "attendees.manage": true }, "table.seat")).toBe(
      true,
    );
    expect(canProCommand({ "attendees.manage": true }, "table.add")).toBe(
      false,
    );
    expect(canProCommand({ "content.manage": true }, "table.assign")).toBe(
      false,
    );
  });

  it("usa una intención explícita para sentar la espera sin inventar una reserva ni un precio", () => {
    const data = base();
    const table = data.tables.find((row) => row.seats >= 2)!;
    const command = planProCommand("table.waitlist.seat", data, data, {
      type: "table.waitlist.seat",
      waitlistId: "queue-1",
      tableId: table.id,
    });
    expect(command.args).toEqual({
      p_organization_id: data.space.id,
      p_action: "seat",
      p_record_id: "queue-1",
      p_data: { table_id: table.id, expected_service_version: 3 },
    });
    expect(command.idempotent).toBe(true);
    expect(() => planProCommand("table.waitlist.seat", data, data)).toThrow(
      "lista de espera",
    );
  });

  it("no envía la hora del dispositivo ni saldos al sentar a quien llega sin reserva", () => {
    const before = base();
    const after = structuredClone(before);
    after.bookings.push({
      id: "local",
      kind: "table",
      clientName: "Sin reserva",
      serviceId: "service",
      resourceId: before.tables[0].id,
      partySize: 2,
      start: "1999-01-01T00:00:00Z",
      end: "1999-01-01T01:00:00Z",
      priceCents: 1200,
      paidCents: 9999,
      status: "arrived",
      source: "walkin",
    });
    const command = planProCommand("table.walkin", before, after);
    expect(command.args.p_data).toMatchObject({
      table_id: before.tables[0].id,
      expected_total_cents: 1200,
    });
    expect(JSON.stringify(command.args)).not.toContain("1999");
    expect(JSON.stringify(command.args)).not.toContain("9999");
  });

  it("la salida no puede convertir el importe previsto en cobrado", () => {
    const before = base();
    const booking = before.bookings.find((row) => row.kind === "table")!;
    const after = structuredClone(before);
    after.bookings = after.bookings.map((row) =>
      row.id === booking.id
        ? { ...row, status: "done", paidCents: 99999 }
        : row,
    );
    expect(planProCommand("table.leave", before, after).args).toEqual({
      p_organization_id: before.space.id,
      p_action: "leave",
      p_record_id: booking.id,
      p_data: {},
    });
  });

  it("archiva la mesa con control de versión y conserva su historial", () => {
    const before = base();
    before.tables[0].version = 4;
    const after = { ...before, tables: before.tables.slice(1) };
    expect(planProCommand("table.remove", before, after).args).toEqual({
      p_organization_id: before.space.id,
      p_table_id: before.tables[0].id,
      p_data: { active: false, expected_version: 4 },
    });
  });
});
