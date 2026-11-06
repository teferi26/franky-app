import { describe, expect, it, vi } from "vitest";
import { loadProWorkspace, mapProWorkspace } from "@/lib/pro/remote-data";
import type { ProRemoteInput, ProRpcClient } from "@/lib/pro/remote-contracts";
import sqlFixture from "./fixtures/pro-agenda-rpc.json";

const organizationId = "space-1";
const range = {
  from: "2026-09-01T00:00:00.000Z",
  until: "2026-10-01T00:00:00.000Z",
};

function fixture(): ProRemoteInput {
  const service = {
    id: "service-1",
    organization_id: organizationId,
    name: "Corte",
    description: "Corte a tijera",
    mode: "appointment" as const,
    duration_minutes: 30,
    buffer_minutes: 10,
    price_cents: 2000,
    price_basis: "booking" as const,
    deposit_cents: 0,
    capacity: 1,
    required_resource_ids: [],
    staff_required: true,
    active: true,
    menu: "",
    version: 1,
    category: "Cabello",
    online: true,
    eligible_staff_ids: ["staff-2"],
  };
  const customer = {
    id: "client-1",
    organization_id: organizationId,
    user_id: null,
    display_name: "Lucía",
    contact: "600123456",
    created_at: "2026-01-01T00:00:00.000Z",
    notes: "Prefiere las mañanas",
    technical: "Fórmula guardada",
    tags: ["Habitual"],
    marketing_consent: false,
    consent_recorded_at: null,
    visits: 12,
    no_shows: 2,
    last_visit: "2026-08-20T09:00:00.000Z",
    spent_cents: 24500,
  };
  const booking = {
    id: "booking-1",
    organization_id: organizationId,
    service_id: service.id,
    session_id: null,
    customer_id: customer.id,
    customer_user_id: null,
    customer_name: customer.display_name,
    starts_at: "2026-09-24T09:00:00.000Z",
    ends_at: "2026-09-24T09:30:00.000Z",
    resource_ids: ["staff-2", "room-1"],
    party_size: 1,
    status: "confirmed" as const,
    total_cents: 2000,
    deposit_cents: 500,
    deposit_status: "paid" as const,
    price_snapshot: {
      service_name: "Corte",
      menu: "",
      terms: "Condiciones",
      version: 1,
      unit_cents: 2000,
      price_basis: "booking",
    },
    created_at: "2026-09-20T10:00:00.000Z",
    attended_at: null,
    bundle_id: null,
    card_quote_id: null,
    blocked_until: "2026-09-24T09:40:00.000Z",
  };
  return {
    space: {
      organization: {
        id: organizationId,
        name: "Peluquería Campus",
        city: "Alicante",
        kind: "leisure",
        demo: false,
      },
      profile: {
        organization_id: organizationId,
        vertical: "hairdresser",
        public_slug: "peluqueria-campus",
        description: "Cortes y color",
        address: "Calle Mayor",
        hours: [],
        booking_enabled: true,
        card_enabled: false,
        card_discount_pct: 5,
        walk_minutes_to_campus: null,
        campus_university_id: null,
        published: true,
      },
      offers: [],
      menu: [],
      daily_menu: null,
      group_requests: [],
      reviews: [],
      promoters: [],
    },
    workspace: {
      settings: {
        organization_id: organizationId,
        category: "hairdresser",
        timezone: "Europe/Madrid",
        enabled: true,
        public_booking: true,
        require_approval: true,
        booking_horizon_days: 90,
        cancellation_hours: 24,
        terms: "Condiciones",
        staff_limit: 10,
        resource_limit: 20,
        service_limit: 50,
        sales_enabled: false,
        demo: false,
      },
      services: [service],
      resources: [
        {
          id: "staff-1",
          organization_id: organizationId,
          name: "Marta",
          kind: "staff",
          capacity: 1,
          active: true,
        },
        {
          id: "staff-2",
          organization_id: organizationId,
          name: "Sergio",
          kind: "staff",
          capacity: 1,
          active: true,
        },
        {
          id: "room-1",
          organization_id: organizationId,
          name: "Cabina",
          kind: "room",
          capacity: 1,
          active: true,
        },
      ],
      availability: [
        {
          id: "morning",
          organization_id: organizationId,
          resource_id: null,
          weekday: 1,
          start_minute: 540,
          end_minute: 780,
        },
        {
          id: "afternoon",
          organization_id: organizationId,
          resource_id: null,
          weekday: 1,
          start_minute: 960,
          end_minute: 1200,
        },
      ],
      exceptions: [
        {
          id: "holiday",
          organization_id: organizationId,
          resource_id: "staff-2",
          local_date: "2026-09-25",
          reason: "Vacaciones",
        },
      ],
      sessions: [],
      bookings: [booking],
      customers: [customer],
      bundles: [],
      permissions: [
        "resource.read",
        "content.manage",
        "finance.read",
        "finance.manage",
      ],
      pricing: null,
      has_more: false,
      demo: false,
    },
    operations: {
      customers: [customer],
      next_customer_cursor: null,
      services: [service],
      sessions: [],
      bookings: [
        {
          id: booking.id,
          phase: "in_service",
          note: "Color habitual",
          source: null,
          trial: false,
          paid_cents: 500,
        },
      ],
      payments: [],
      can_record_payment: true,
      review_stats: { rating: null, count: 0 },
      limits: {
        offers_truncated: false,
        reviews_truncated: false,
        group_requests_truncated: false,
      },
    },
    spaces: [{ id: organizationId, name: "Peluquería Campus" }],
    shifts: [
      {
        id: "shift",
        organization_id: organizationId,
        user_id: "user-1",
        in_at: range.from,
        out_at: null,
        break_minutes: 0,
      },
    ],
    range,
  };
}

function clientFor(
  input: ProRemoteInput,
  override?: (name: string, args: Record<string, unknown>) => unknown,
): ProRpcClient {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
      const replaced = override?.(name, args);
      if (replaced !== undefined) return { data: replaced, error: null };
      switch (name) {
        case "pro_get_space":
          return { data: input.space, error: null };
        case "professional_get_workspace":
          return { data: input.workspace, error: null };
        case "professional_list_workspaces":
          return { data: input.spaces, error: null };
        case "pro_get_agenda_operations":
          return { data: input.operations, error: null };
        case "pro_list_shifts":
          return { data: input.shifts, error: null };
        case "professional_list_records":
          return {
            data: {
              items:
                args.p_entity === "bookings"
                  ? input.workspace.bookings
                  : input.workspace.bundles,
              next_cursor: null,
            },
            error: null,
          };
        default:
          throw new Error(`RPC inesperada: ${name}`);
      }
    }),
  };
}

describe("Franky Pro: datos reales de agenda", () => {
  it("adapta respuestas auténticas de las RPC ejecutadas en PostgreSQL desechable", async () => {
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
      sqlFixture.space.organization.id,
      sqlFixture.range.from,
      sqlFixture.range.until,
    );
    expect(result.complete).toBe(true);
    expect(result.data.space.name).toBe(sqlFixture.space.organization.name);
    expect(result.data.clients).toHaveLength(
      sqlFixture.operations.customers.length,
    );
    expect(result.data.bookings).toHaveLength(
      sqlFixture.workspace.bookings.length,
    );
    expect(result.data.services[0].staffIds).toEqual(
      sqlFixture.operations.services[0].eligible_staff_ids,
    );
    for (const booking of result.data.bookings) {
      const metadata = sqlFixture.operations.bookings.find(
        (row) => row.id === booking.id,
      );
      expect(booking.note).toBe(metadata?.note || undefined);
      expect(booking.paidCents).toBe(metadata?.paid_cents ?? null);
    }
  });

  it("conserva totales históricos, elegibilidad, horario partido y fechas de bloqueo", () => {
    const input = fixture();
    const result = mapProWorkspace(input);

    expect(result.data.clients[0]).toMatchObject({
      visits: 12,
      noShows: 2,
      spentCents: 24500,
      source: "unknown",
    });
    expect(result.data.services[0].staffIds).toEqual(["staff-2"]);
    expect(result.data.bookings[0]).toMatchObject({
      status: "in_service",
      paidCents: 500,
      source: "unknown",
      resourceIds: ["staff-2", "room-1"],
      blockedUntil: "2026-09-24T09:40:00.000Z",
    });
    expect(result.data.space).toMatchObject({
      plan: "unknown",
      rating: null,
      walkMinutesToCampus: null,
      timezone: "Europe/Madrid",
    });
    expect(result.data.space.hours[0]).toEqual({ open: 540, close: 1200 });
    expect(result.data.calendar?.availability).toEqual(
      input.workspace.availability,
    );
    expect(result.data.calendar?.exceptions).toEqual(
      input.workspace.exceptions,
    );
    expect(result.data.calendar?.bookings[0]).toMatchObject({
      blocked_until: "2026-09-24T09:40:00.000Z",
    });
    expect(result.shifts).toEqual(input.shifts);
    expect(result.data.shifts).toEqual([]);
    expect(result.data.history).toEqual([]);
  });

  it.each([
    ["requested", "requested", false],
    ["waitlisted", "requested", true],
    ["attended", "done", false],
    ["cancelled", "cancelled", false],
    ["no_show", "no_show", false],
  ] as const)(
    "respeta el estado %s aunque quede una fase anterior",
    (status, expected, waitlisted) => {
      const input = fixture();
      input.workspace.bookings[0].status = status;
      expect(mapProWorkspace(input).data.bookings[0]).toMatchObject({
        status: expected,
        waitlisted,
      });
    },
  );

  it("mantiene la agenda completa con 500 reseñas y utiliza su agregado exacto", () => {
    const input = fixture();
    input.operations.review_stats = { rating: 4.7, count: 500 };
    input.operations.limits.reviews_truncated = true;
    const result = mapProWorkspace(input);
    expect(result.data.space).toMatchObject({ rating: 4.7, reviewsCount: 500 });
    expect(result.complete).toBe(true);
    expect(result.incompleteReasons).toContain("reviews");
  });

  it("separa correos y teléfonos y descarta contactos que no pueden enlazarse", () => {
    const input = fixture();
    const customer = input.operations.customers[0];
    input.operations.customers = [
      { ...customer, contact: " lucia@example.test " },
      { ...customer, id: "phone", contact: "+34 (600) 123-456" },
      { ...customer, id: "invalid", contact: "Llamar por la mañana" },
      { ...customer, id: "short", contact: "12345" },
    ];
    const clients = mapProWorkspace(input).data.clients;
    expect(clients[0].email).toBe("lucia@example.test");
    expect(clients[0].phone).toBeUndefined();
    expect(clients[1].phone).toBe("+34 (600) 123-456");
    expect(clients[1].email).toBeUndefined();
    expect(clients[2].phone).toBeUndefined();
    expect(clients[3].phone).toBeUndefined();
  });

  it("conserva la propuesta de cambio sin alterar la cita confirmada", () => {
    const input = fixture();
    const booking = input.workspace.bookings[0];
    booking.customer_user_id = "student-1";
    booking.reschedule = {
      starts_at: "2026-09-25T10:00:00.000Z",
      expires_at: "2026-09-24T18:00:00.000Z",
    };
    const result = mapProWorkspace(input).data.bookings[0];
    expect(result).toMatchObject({
      start: booking.starts_at,
      end: booking.ends_at,
      customerAccount: true,
      reschedule: {
        start: booking.reschedule.starts_at,
        expiresAt: booking.reschedule.expires_at,
      },
    });
    const manualBooking = mapProWorkspace(fixture()).data.bookings[0];
    expect(manualBooking.customerAccount).toBe(false);
    expect(manualBooking.reschedule).toBeUndefined();
  });

  it("no deduce cobros de citas atendidas ni muestra importes sin permiso", () => {
    const input = fixture();
    input.workspace.permissions = ["resource.read", "attendees.manage"];
    input.workspace.bookings[0].status = "attended";
    input.operations.payments = [
      {
        id: "payment",
        organization_id: organizationId,
        booking_id: "booking-1",
        amount_cents: 2000,
        tip_cents: 200,
        method: "cash",
        recorded_at: range.from,
      },
    ];
    const result = mapProWorkspace(input);
    expect(result.data.bookings[0].paidCents).toBeNull();
    expect(result.data.clients[0].spentCents).toBeNull();
    expect(result.data.payments).toEqual([]);
    expect(result.permissions["finance.manage"]).toBe(false);
  });

  it("conserva la configuración online del servicio cuando la reserva pública está cerrada", () => {
    const input = fixture();
    input.workspace.settings!.public_booking = false;
    const result = mapProWorkspace(input);
    expect(result.data.space.publicProfile.bookingEnabled).toBe(false);
    expect(result.data.services[0].online).toBe(true);
  });

  it("pagina clientes y reservas y usa todas las sesiones de la RPC nueva", async () => {
    const input = fixture();
    input.workspace.has_more = true;
    const second = {
      ...input.operations.customers[0],
      id: "client-2",
      display_name: "Mario",
      visits: 37,
    };
    const secondBooking = {
      ...input.workspace.bookings[0],
      id: "booking-2",
      customer_id: second.id,
      customer_name: second.display_name,
    };
    input.operations.bookings.push({
      ...input.operations.bookings[0],
      id: secondBooking.id,
    });
    input.operations.sessions = Array.from({ length: 350 }, (_, index) => ({
      id: `session-${index}`,
      organization_id: organizationId,
      service_id: "service-1",
      starts_at: range.from,
      ends_at: "2026-09-01T01:00:00.000Z",
      capacity: 1,
      resource_ids: [],
      status: "open",
      series_id: null,
    }));
    const client = clientFor(input, (name, args) => {
      if (name === "pro_get_agenda_operations")
        return args.p_customer_cursor
          ? {
              ...input.operations,
              customers: [second],
              next_customer_cursor: null,
            }
          : { ...input.operations, next_customer_cursor: "client-1" };
      if (name === "professional_list_records" && args.p_entity === "bookings")
        return args.p_cursor
          ? { items: [secondBooking], next_cursor: null }
          : { items: input.workspace.bookings, next_cursor: "booking-1" };
      return undefined;
    });

    const result = await loadProWorkspace(
      client,
      organizationId,
      range.from,
      range.until,
    );
    expect(result.complete).toBe(true);
    expect(result.data.clients).toHaveLength(2);
    expect(result.data.clients[1].visits).toBe(37);
    expect(result.data.bookings).toHaveLength(2);
    expect(result.data.calendar?.sessions).toHaveLength(350);
    expect(result.data.calendar?.bookings[0]).toMatchObject({
      blocked_until: "2026-09-24T09:40:00.000Z",
    });
  });

  it("rechaza cursores repetidos en lugar de presentar una lectura parcial", async () => {
    const input = fixture();
    const client = clientFor(input, (name) =>
      name === "pro_get_agenda_operations"
        ? { ...input.operations, next_customer_cursor: "repeated" }
        : undefined,
    );
    await expect(
      loadProWorkspace(client, organizationId, range.from, range.until),
    ).rejects.toMatchObject({ code: "pro_invalid_cursor" });
  });

  it.each(["PGRST202", "42501"])(
    "propaga el error %s sin recurrir a una demo",
    async (code) => {
      const client: ProRpcClient = {
        rpc: vi.fn(async () => ({
          data: null,
          error: { message: "No disponible", code },
        })),
      };
      await expect(
        loadProWorkspace(client, organizationId, range.from, range.until),
      ).rejects.toMatchObject({ code });
    },
  );

  it("abre reservas anteriores sin crear ni publicar una ficha Pro", async () => {
    const input = fixture();
    input.space.profile = null;
    const client = clientFor(input);
    const result = await loadProWorkspace(
      client,
      organizationId,
      range.from,
      range.until,
    );
    expect(result.complete).toBe(true);
    expect(result.data.space).toMatchObject({
      vertical: "hairdresser",
      slug: "",
      publicProfile: {
        published: false,
        bookingEnabled: false,
        cardEnabled: false,
      },
    });
    expect(result.data.bookings[0].id).toBe(input.workspace.bookings[0].id);
    expect(input.space.profile).toBeNull();
    expect(result.permissions).toMatchObject({ "content.manage": true });
  });

  it("no crea una identidad universitaria ni abre un negocio desactivado con el adaptador", () => {
    const input = fixture();
    input.space.profile = null;
    input.space.organization.kind = "university";
    expect(() => mapProWorkspace(input)).toThrow(
      "no tiene una agenda configurada",
    );
    input.space.organization.kind = "leisure";
    input.workspace.settings!.enabled = false;
    expect(() => mapProWorkspace(input)).toThrow(
      "no tiene una agenda configurada",
    );
  });

  it("rechaza respuestas parciales aunque las RPC no devuelvan error", async () => {
    const client = clientFor(fixture(), (name) =>
      name === "pro_get_agenda_operations" ? {} : undefined,
    );
    await expect(
      loadProWorkspace(client, organizationId, range.from, range.until),
    ).rejects.toMatchObject({ code: "pro_invalid_response" });
  });
});
