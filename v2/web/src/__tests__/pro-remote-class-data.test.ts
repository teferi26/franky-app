import { describe, expect, it } from "vitest";
import { loadProWorkspace } from "@/lib/pro/remote-data";
import {
  loadProResourceOperations,
  mapProClassData,
  mapProCourtData,
  parseProResourceOperations,
} from "@/lib/pro/remote-class-data";
import type {
  ProRemoteSnapshot,
  ProRpcClient,
} from "@/lib/pro/remote-contracts";
import sqlFixture from "./fixtures/pro-agenda-rpc.json";
import resourceSqlFixture from "./fixtures/pro-resource-rpc.json";

async function fixture(): Promise<ProRemoteSnapshot> {
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
  const snapshot = await loadProWorkspace(
    client,
    sqlFixture.space.organization.id,
    sqlFixture.range.from,
    sqlFixture.range.until,
  );
  const org = snapshot.data.space.id;
  snapshot.permissions = { "resource.read": true, "attendees.manage": true };
  snapshot.resources = [
    {
      id: "staff-1",
      organization_id: org,
      name: "Ana",
      kind: "staff",
      capacity: 1,
      active: true,
    },
    {
      id: "room-1",
      organization_id: org,
      name: "Aula 1",
      kind: "room",
      capacity: 12,
      active: true,
    },
    {
      id: "court-1",
      organization_id: org,
      name: "Pista 1",
      kind: "court",
      capacity: 4,
      active: true,
    },
    {
      id: "court-2",
      organization_id: org,
      name: "Pista 2",
      kind: "court",
      capacity: 4,
      active: true,
    },
    {
      id: "desk-1",
      organization_id: org,
      name: "Puestos",
      kind: "desk",
      capacity: 20,
      active: true,
    },
  ];
  const baseService = snapshot.services[0];
  snapshot.services = [
    {
      ...baseService,
      id: "class-1",
      name: "Pilates",
      mode: "session",
      duration_minutes: 50,
      category: "Movilidad",
      capacity: 12,
      required_resource_ids: ["room-1"],
      eligible_staff_ids: ["staff-1"],
    },
  ];
  snapshot.data.calendar = {
    ...snapshot.data.calendar!,
    sessions: [
      {
        id: "session-1",
        organization_id: org,
        service_id: "class-1",
        starts_at: "2026-09-24T08:00:00Z",
        ends_at: "2026-09-24T08:50:00Z",
        capacity: 12,
        resource_ids: ["room-1", "staff-1"],
        status: "open",
        series_id: "series-1",
        reserved_seats: 4,
        waitlisted_seats: 2,
      },
    ],
  };
  snapshot.bookings = [
    {
      ...snapshot.bookings[0],
      id: "attended",
      session_id: "session-1",
      status: "attended",
      party_size: 2,
    },
    {
      ...snapshot.bookings[0],
      id: "arrived",
      session_id: "session-1",
      status: "confirmed",
      party_size: 1,
    },
    {
      ...snapshot.bookings[0],
      id: "requested",
      session_id: "session-1",
      status: "requested",
      party_size: 1,
    },
    {
      ...snapshot.bookings[0],
      id: "waitlisted",
      session_id: "session-1",
      status: "waitlisted",
      party_size: 2,
    },
  ];
  const baseBooking = snapshot.data.bookings[0];
  snapshot.data.bookings = snapshot.bookings.map((booking) => ({
    ...baseBooking,
    id: booking.id,
    sessionId: booking.session_id ?? undefined,
    partySize: booking.party_size,
    paidCents: null,
    status:
      booking.status === "attended"
        ? "done"
        : booking.id === "arrived"
          ? "arrived"
          : "requested",
    waitlisted: booking.status === "waitlisted",
  }));
  snapshot.bundles = [
    {
      id: "bundle-1",
      organization_id: org,
      customer_id: "customer-1",
      service_id: "class-1",
      remaining: 0,
      granted: 10,
      label: "Bono 10",
    },
  ];
  return snapshot;
}

describe("Franky Pro: lectura real de clases y pistas", () => {
  it("conserva unidad y política reales de capacidad desde PostgreSQL", async () => {
    const snapshot = await fixture();
    snapshot.data.space.id = resourceSqlFixture.organizationId;
    snapshot.services = [];
    const operations = await loadProResourceOperations(
      {
        rpc: async () => ({
          data: resourceSqlFixture.resourceOperations,
          error: null,
        }),
      },
      resourceSqlFixture.organizationId,
    );
    const data = mapProCourtData(snapshot, operations);
    expect(data.resources.length).toBe(
      operations.resources.filter((resource) => resource.active).length,
    );
    for (const resource of data.resources) {
      const raw = operations.resources.find((row) => row.id === resource.id)!;
      expect(resource).toMatchObject({
        capacity: raw.capacity,
        capacityUnit: raw.capacity_unit,
        allocationMode: raw.allocation_mode,
        configured: raw.configured,
        version: raw.version,
      });
      expect(resource.pricePerHourCents).toBeNull();
    }
    const court = data.resources.find((resource) => resource.kind === "court")!;
    expect(court).toMatchObject({
      capacity: 1,
      capacityUnit: "concurrent_bookings",
    });
  });

  it("rechaza una unidad incompatible o recursos de otro espacio", () => {
    const value = structuredClone(resourceSqlFixture.resourceOperations);
    const court = value.resources.find(
      (resource) => resource.kind === "court",
    )!;
    court.capacity_unit = "people";
    expect(() =>
      parseProResourceOperations(value, resourceSqlFixture.organizationId),
    ).toThrow();
    expect(() =>
      parseProResourceOperations(
        resourceSqlFixture.resourceOperations,
        "another-space",
      ),
    ).toThrow();
  });

  it("mapea sesiones, asistencia y bonos personales sin convertirlos en cuotas ni cobros", async () => {
    const snapshot = await fixture();
    const data = mapProClassData(snapshot);
    expect(data.classTypes[0]).toMatchObject({
      name: "Pilates",
      durationMin: 50,
      coachId: "",
      resourceIds: ["room-1"],
    });
    expect(data.sessions[0]).toMatchObject({
      id: "session-1",
      booked: 4,
      waitlist: 2,
      checkedIn: 3,
      room: "Aula 1",
      coachId: "staff-1",
      resourceIds: ["room-1", "staff-1"],
      status: "open",
      seriesId: "series-1",
    });
    expect(data.classOperations?.bundles).toEqual([
      {
        id: "bundle-1",
        customerId: "customer-1",
        serviceId: "class-1",
        label: "Bono 10",
        remaining: 0,
        granted: 10,
      },
    ]);
    expect(data.bookings.every((booking) => booking.paidCents === null)).toBe(
      true,
    );
    expect(data.members).toEqual([]);
    expect(data.plans).toEqual([]);
    expect(data.history).toBe(snapshot.data.history);
  });

  it("mantiene los cupos exactos y asistencia desconocida cuando no se puede leer el listado", async () => {
    const snapshot = await fixture();
    snapshot.permissions = { "resource.read": true };
    snapshot.bookings = [];
    snapshot.data.bookings = [];
    snapshot.bundles = [];
    const data = mapProClassData(snapshot);
    expect(data.sessions[0]).toMatchObject({
      booked: 4,
      waitlist: 2,
      checkedIn: null,
    });
    expect(data.classOperations).toMatchObject({
      rosterVisible: false,
      bundles: [],
    });
    expect(data.bookings).toEqual([]);
  });

  it("no inventa cero plazas ni cero esperas si faltan agregados y permiso de lectura", async () => {
    const snapshot = await fixture();
    snapshot.permissions = { "resource.read": true };
    delete snapshot.data.calendar!.sessions[0].reserved_seats;
    expect(() => mapProClassData(snapshot)).toThrow("Faltan los recuentos");
  });

  it("conserva cancelaciones y múltiples profesionales sin asignar uno arbitrariamente", async () => {
    const snapshot = await fixture();
    snapshot.resources.push({
      ...snapshot.resources[0],
      id: "staff-2",
      name: "Sergio",
    });
    snapshot.data.calendar!.sessions[0].resource_ids.push("staff-2");
    snapshot.data.calendar!.sessions[0].status = "cancelled";
    snapshot.services[0].active = false;
    const data = mapProClassData(snapshot);
    expect(data.sessions[0]).toMatchObject({
      coachId: "",
      status: "cancelled",
    });
    expect(data.classTypes[0]).toMatchObject({
      name: "Pilates",
      active: false,
    });
  });

  it("asocia tarifas a servicios reales y deja desconocidas las tarifas por persona o duración distinta", async () => {
    const snapshot = await fixture();
    const base = snapshot.services[0];
    snapshot.services = [
      {
        ...base,
        id: "hour",
        mode: "resource",
        duration_minutes: 60,
        price_basis: "booking",
        price_cents: 2000,
        required_resource_ids: ["court-1"],
      },
      {
        ...base,
        id: "match",
        mode: "resource",
        duration_minutes: 90,
        price_basis: "booking",
        price_cents: 3000,
        required_resource_ids: ["court-2"],
      },
      {
        ...base,
        id: "desk",
        mode: "resource",
        duration_minutes: 60,
        price_basis: "person",
        price_cents: 500,
        required_resource_ids: ["desk-1"],
      },
    ];
    snapshot.data.bookings = [
      {
        ...snapshot.data.bookings[0],
        sessionId: undefined,
        resourceId: "court-2",
        resourceIds: ["court-2"],
        kind: "appointment",
        blockedUntil: "2026-09-24T10:00:00Z",
      },
    ];
    const data = mapProCourtData(snapshot);
    expect(
      data.resources.find((resource) => resource.id === "court-1"),
    ).toMatchObject({ pricePerHourCents: 2000, serviceIds: ["hour"] });
    expect(
      data.resources.find((resource) => resource.id === "court-2"),
    ).toMatchObject({ pricePerHourCents: null, serviceIds: ["match"] });
    expect(
      data.resources.find((resource) => resource.id === "desk-1"),
    ).toMatchObject({ pricePerHourCents: null, serviceIds: ["desk"] });
    expect(data.bookings[0]).toMatchObject({
      kind: "court",
      paidCents: null,
      blockedUntil: "2026-09-24T10:00:00Z",
    });
    expect(data.openMatches).toEqual([]);
    expect(data.plans).toEqual([]);
  });
});
