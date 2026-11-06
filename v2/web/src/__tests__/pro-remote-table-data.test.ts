import { describe, expect, it, vi } from "vitest";
import { loadProWorkspace } from "@/lib/pro/remote-data";
import {
  loadProTableOperations,
  mapProTableData,
  parseProTableOperations,
} from "@/lib/pro/remote-table-data";
import type {
  ProRemoteTableOperations,
  ProRpcClient,
} from "@/lib/pro/remote-contracts";
import type { ProBooking, ProData } from "@/lib/pro/types";
import sqlFixture from "./fixtures/pro-agenda-rpc.json";
import tableSqlFixture from "./fixtures/pro-table-rpc.json";

const organizationId = sqlFixture.space.organization.id;
const range = {
  from: "2026-09-01T00:00:00.000Z",
  until: "2026-10-01T00:00:00.000Z",
};

function fixture(): ProRemoteTableOperations {
  return {
    tables: [
      {
        id: "table-1",
        resource_id: "table-1",
        organization_id: organizationId,
        name: "Terraza 1",
        capacity: 4,
        active: true,
        zone: "Terraza",
        x: 3,
        y: 2,
        w: 2,
        h: 2,
        shape: "round",
        exclusive: true,
        cleaning_minutes: 15,
        version: 3,
      },
    ],
    unmapped_resource_ids: ["legacy-table"],
    waitlist: [
      {
        id: "queue-1",
        organization_id: organizationId,
        customer_id: "client-1",
        customer_name: "Lucía",
        customer_contact: "lucia@example.test",
        service_id: "service-1",
        party_size: 3,
        requested_at: "2026-09-24T11:00:00.000Z",
        expires_at: "2026-09-24T23:00:00.000Z",
        status: "waiting",
        booking_id: null,
        service_version: 2,
        expected_total_cents: 7200,
        note: "Terraza",
      },
    ],
    booking_operations: [
      {
        booking_id: "booking-1",
        organization_id: organizationId,
        table_id: "table-1",
        seated_at: "2026-09-24T11:10:00.000Z",
        left_at: null,
        cleaned_at: null,
        cleaning_minutes: 15,
      },
    ],
    can_manage: true,
    can_operate: true,
  };
}

function booking(): ProBooking {
  return {
    id: "booking-1",
    kind: "court",
    clientId: "client-1",
    clientName: "Lucía",
    resourceId: "table-1",
    resourceIds: ["table-1"],
    serviceId: "service-1",
    start: "2026-09-24T11:00:00.000Z",
    end: "2026-09-24T12:30:00.000Z",
    partySize: 3,
    status: "confirmed",
    priceCents: 7200,
    paidCents: null,
    source: "unknown",
    note: "Reserva real",
  };
}

async function dataFixture(): Promise<ProData> {
  const responses: Record<string, unknown> = {
    pro_get_space: sqlFixture.space,
    professional_get_workspace: sqlFixture.workspace,
    pro_get_agenda_operations: sqlFixture.operations,
    professional_list_workspaces: sqlFixture.spaces,
    pro_list_shifts: sqlFixture.shifts,
  };
  const client: ProRpcClient = {
    rpc: async (name, args = {}) => ({
      data:
        name === "professional_list_records"
          ? {
              items:
                args.p_entity === "bookings"
                  ? sqlFixture.workspace.bookings
                  : sqlFixture.workspace.bundles,
              next_cursor: null,
            }
          : responses[name],
      error: null,
    }),
  };
  const result = await loadProWorkspace(
    client,
    organizationId,
    sqlFixture.range.from,
    sqlFixture.range.until,
  );
  return { ...result.data, bookings: [booking()] };
}

describe("Franky Pro: adaptador de sala real", () => {
  it("adapta la respuesta SQL auténtica sin perder identificadores ni estados", async () => {
    const operations = parseProTableOperations(
      tableSqlFixture.tableOperations,
      tableSqlFixture.organizationId,
    );
    const data = await dataFixture();
    data.space = { ...data.space, id: tableSqlFixture.organizationId };
    data.bookings = [];
    const result = mapProTableData(data, operations);
    expect(result.tables.map((table) => table.id)).toEqual(
      tableSqlFixture.tableOperations.tables
        .filter((table) => table.active)
        .map((table) => table.id),
    );
    expect(result.tableOperations?.waitlist).toHaveLength(
      tableSqlFixture.tableOperations.waitlist.length,
    );
    expect(result.tableOperations?.unmappedResourceIds).toEqual(
      tableSqlFixture.tableOperations.unmapped_resource_ids,
    );
    expect(result.tableOperations?.canManage).toBe(true);
  });

  it("conserva el plano y las horas reales sin inventar mesas legacy ni cobros", async () => {
    const data = await dataFixture();
    const operations = fixture();
    operations.tables.push({
      ...operations.tables[0],
      id: "archived",
      resource_id: "archived",
      active: false,
    });
    const result = mapProTableData(data, operations);

    expect(result.tables).toEqual([
      {
        id: "table-1",
        name: "Terraza 1",
        seats: 4,
        zone: "Terraza",
        x: 3,
        y: 2,
        w: 2,
        h: 2,
        shape: "round",
        active: true,
        exclusive: true,
        cleaningMinutes: 15,
        version: 3,
      },
    ]);
    expect(result.tableOperations?.unmappedResourceIds).toEqual([
      "legacy-table",
    ]);
    expect(result.bookings[0]).toMatchObject({
      kind: "table",
      status: "arrived",
      start: booking().start,
      end: booking().end,
      priceCents: 7200,
      paidCents: null,
      tableOperation: {
        tableId: "table-1",
        seatedAt: operations.booking_operations[0].seated_at,
        leftAt: null,
        cleanedAt: null,
        cleaningMinutes: 15,
      },
    });
    expect(result.payments).toBe(data.payments);
    expect(result.history).toBe(data.history);
    expect(result.clients).toBe(data.clients);
    expect(data.bookings[0].tableOperation).toBeUndefined();
  });

  it("mantiene la espera separada sin fabricar importes para asistentes sin finanzas", async () => {
    const operations = fixture();
    operations.can_manage = false;
    operations.waitlist[0].expected_total_cents = null;
    delete operations.waitlist[0].customer_contact;
    delete operations.waitlist[0].note;
    const parsed = parseProTableOperations(operations, organizationId);
    const result = mapProTableData(await dataFixture(), parsed);

    expect(result.bookings).toHaveLength(1);
    expect(result.tableOperations).toMatchObject({
      canManage: false,
      canOperate: true,
    });
    expect(result.tableOperations?.waitlist[0]).toMatchObject({
      id: "queue-1",
      status: "waiting",
      expectedTotalCents: null,
      serviceVersion: 2,
      bookingId: null,
    });
    expect(result.tableOperations?.waitlist[0].customerContact).toBeUndefined();
    expect(result.tableOperations?.waitlist[0].note).toBeUndefined();
  });

  it("registra salida y limpieza sin reescribir la hora ni el dinero de la reserva", async () => {
    const operations = fixture();
    operations.booking_operations[0].left_at = "2026-09-24T12:00:00.000Z";
    operations.booking_operations[0].cleaned_at = "2026-09-24T12:04:00.000Z";
    const data = await dataFixture();
    data.bookings[0].end = operations.booking_operations[0].left_at;
    const result = mapProTableData(data, operations);
    expect(result.bookings[0]).toMatchObject({
      status: "done",
      end: operations.booking_operations[0].left_at,
      paidCents: null,
      tableOperation: {
        cleanedAt: operations.booking_operations[0].cleaned_at,
      },
    });
    data.bookings[0].status = "cancelled";
    expect(mapProTableData(data, operations).bookings[0].status).toBe(
      "cancelled",
    );
  });

  it("identifica recursos de mesa antiguos sin asignarles coordenadas ficticias", async () => {
    const data = await dataFixture();
    data.bookings[0] = {
      ...booking(),
      id: "legacy-booking",
      resourceId: "legacy-table",
      resourceIds: ["legacy-table"],
    };
    const resource = {
      id: "legacy-table",
      organization_id: organizationId,
      kind: "table" as const,
      name: "Mesa de siempre",
      capacity: 6,
      active: true,
    };
    const result = mapProTableData(data, fixture(), [
      resource,
      { ...resource, id: "unlisted" },
      { ...resource, organization_id: "other" },
    ]);
    expect(result.bookings[0]).toMatchObject({
      kind: "table",
      resourceId: "legacy-table",
      status: "confirmed",
    });
    expect(result.bookings[0].tableOperation).toBeUndefined();
    expect(result.tables.some((table) => table.id === "legacy-table")).toBe(
      false,
    );
    expect(result.tableOperations?.unmappedResources).toEqual([resource]);
  });

  it("lee periodos largos completos en tramos y conserva todos los estados de espera", async () => {
    const page1 = fixture();
    const page2 = fixture();
    page2.waitlist = [
      { ...page2.waitlist[0], id: "queue-2", status: "expired" },
    ];
    page2.booking_operations = [
      { ...page2.booking_operations[0], booking_id: "booking-2" },
    ];
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });
    const result = await loadProTableOperations(
      { rpc },
      organizationId,
      "2026-06-01T00:00:00Z",
      "2026-10-01T00:00:00Z",
    );

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.waitlist.map((entry) => entry.status)).toEqual([
      "waiting",
      "expired",
    ]);
    expect(result.booking_operations.map((entry) => entry.booking_id)).toEqual([
      "booking-1",
      "booking-2",
    ]);
    expect(rpc.mock.calls[0][1].p_until).toBe(rpc.mock.calls[1][1].p_from);
    expect(rpc.mock.calls[1][1].p_until).toBe("2026-10-01T00:00:00.000Z");
  });

  it.each(["PGRST202", "42501"])(
    "propaga %s sin recurrir a mesas demo",
    async (code) => {
      const client: ProRpcClient = {
        rpc: async () => ({
          data: null,
          error: { message: "No disponible", code },
        }),
      };
      await expect(
        loadProTableOperations(client, organizationId, range.from, range.until),
      ).rejects.toMatchObject({ code });
    },
  );

  it("rechaza respuestas parciales, planos inválidos y datos de otro espacio", () => {
    expect(() => parseProTableOperations({}, organizationId)).toThrow();
    const invalidLayout = fixture();
    invalidLayout.tables[0].x = 11;
    expect(() =>
      parseProTableOperations(invalidLayout, organizationId),
    ).toThrow();
    const wrongOrganization = fixture();
    wrongOrganization.waitlist[0].organization_id = "another-space";
    expect(() =>
      parseProTableOperations(wrongOrganization, organizationId),
    ).toThrow();
  });
});
