import { buildDemo } from "@/lib/pro/demo";
import { isoAt } from "@/lib/pro/tables";
import type { ProData } from "@/lib/pro/types";

export const tableDate = "2026-09-24";
export const tableNow = new Date(isoAt(tableDate, 13 * 60 + 30));

export function realTableFixture(): ProData {
  const data = buildDemo("restaurant", tableNow);
  data.space.demo = false;
  data.space.id = "org-a";
  data.clients = [];
  data.bookings = [];
  data.tables = [
    {
      id: "table-a",
      name: "1",
      seats: 4,
      zone: "Sala",
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      shape: "square",
      active: true,
      exclusive: true,
      cleaningMinutes: 15,
    },
  ];
  data.services = [
    {
      id: "service-a",
      name: "Menú de mediodía",
      category: "Comida",
      durationMin: 90,
      priceCents: 2400,
      staffIds: [],
      online: true,
    },
  ];
  data.tableOperations = {
    canManage: true,
    canOperate: true,
    unmappedResourceIds: [],
    waitlist: [],
  };
  data.calendar = {
    range: { from: isoAt(tableDate, 0), until: isoAt("2026-10-01", 0) },
    availability: [
      {
        id: "open",
        organization_id: "org-a",
        resource_id: null,
        weekday: 4,
        start_minute: 8 * 60,
        end_minute: 23 * 60,
      },
    ],
    exceptions: [],
    sessions: [],
    bookings: [],
    services: [
      {
        id: "service-a",
        organization_id: "org-a",
        name: "Menú de mediodía",
        description: "",
        mode: "group",
        duration_minutes: 90,
        buffer_minutes: 5,
        price_cents: 2400,
        price_basis: "person",
        deposit_cents: 0,
        capacity: 4,
        required_resource_ids: [],
        staff_required: false,
        active: true,
        menu: "",
        version: 3,
      },
    ],
  };
  return data;
}

export function addTableBooking(data: ProData) {
  const booking = {
    id: "booking-a",
    kind: "table" as const,
    serviceId: "service-a",
    clientName: "Lucía",
    resourceId: "table-a",
    resourceIds: ["table-a"],
    start: isoAt(tableDate, 13 * 60),
    end: isoAt(tableDate, 14 * 60 + 30),
    partySize: 2,
    status: "confirmed" as const,
    priceCents: 4800,
    paidCents: null,
    source: "phone" as const,
  };
  data.bookings.push(booking);
  data.calendar!.bookings.push({
    id: booking.id,
    organization_id: "org-a",
    service_id: "service-a",
    session_id: null,
    customer_id: "customer-a",
    customer_user_id: null,
    starts_at: booking.start,
    ends_at: booking.end,
    blocked_until: isoAt(tableDate, 14 * 60 + 45),
    resource_ids: ["table-a"],
    party_size: 2,
    status: "confirmed",
    total_cents: 4800,
    deposit_cents: 0,
    deposit_status: "not_required",
    price_snapshot: {
      service_name: "Menú",
      menu: "",
      terms: "",
      version: 3,
      unit_cents: 2400,
      price_basis: "person",
    },
    created_at: booking.start,
    attended_at: null,
    bundle_id: null,
    card_quote_id: null,
  });
  return data.bookings[0];
}
