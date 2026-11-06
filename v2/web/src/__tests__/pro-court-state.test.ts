import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { atLocal } from "@/lib/pro/format";
import {
  dayOccupancy,
  freeStarts,
  isBusy,
  isFree,
  occupancyAt,
} from "@/lib/pro/courts";
import { canProCommand, planProCommand } from "@/lib/pro/remote-actions";

const date = "2026-09-24";
function fixture() {
  const data = buildDemo("sports_facility", new Date(`${date}T08:00:00Z`));
  data.resources = [
    {
      ...data.resources[0],
      capacity: 1,
      allocationMode: "exclusive",
      capacityUnit: "concurrent_bookings",
      version: 3,
    },
  ];
  data.bookings = [];
  data.openMatches = [];
  data.calendar = {
    range: { from: atLocal(date, 0), until: atLocal("2026-09-26", 0) },
    availability: [
      {
        id: "am",
        organization_id: data.space.id,
        resource_id: null,
        weekday: 4,
        start_minute: 540,
        end_minute: 780,
      },
      {
        id: "pm",
        organization_id: data.space.id,
        resource_id: null,
        weekday: 4,
        start_minute: 960,
        end_minute: 1200,
      },
    ],
    exceptions: [],
    services: [],
    bookings: [],
    sessions: [],
  };
  return data;
}
function book(
  data: ReturnType<typeof fixture>,
  from: number,
  to: number,
  people = 4,
) {
  data.bookings.push({
    id: `booking-${data.bookings.length}`,
    kind: "court",
    clientName: "Cliente",
    resourceId: data.resources[0].id,
    resourceIds: [data.resources[0].id],
    start: atLocal(date, from),
    end: atLocal(date, to),
    partySize: people,
    status: "confirmed",
    source: "phone",
    priceCents: 2400,
    paidCents: null,
  });
}

describe("disponibilidad de pistas y puestos reales", () => {
  it("cuenta reservas de pista, no convierte a cuatro jugadores en cuatro pistas", () => {
    const data = fixture();
    book(data, 600, 690);
    expect(occupancyAt(data, data.resources[0], date, 615)).toBe(1);
    expect(isBusy(data, data.resources[0], date, 615)).toBe(true);
    expect(dayOccupancy(data, date)).toBe(19);
  });
  it("respeta jornada partida, ausencias y el margen de preparación", () => {
    const data = fixture();
    book(data, 600, 660);
    data.bookings[0].blockedUntil = atLocal(date, 670);
    expect(isFree(data, data.resources[0], date, 660, 30)).toBe(false);
    expect(isFree(data, data.resources[0], date, 750, 60)).toBe(false);
    expect(freeStarts(data, data.resources[0], date, 60)).not.toContain(780);
    expect(isBusy(data, data.resources[0], date, 800)).toBe(true);
    data.calendar!.exceptions.push({
      id: "off",
      organization_id: data.space.id,
      resource_id: data.resources[0].id,
      local_date: date,
      reason: "Mantenimiento",
    });
    expect(freeStarts(data, data.resources[0], date, 30)).toEqual([]);
  });
  it("revisa inicios intermedios, no solo intervalos de media hora", () => {
    const data = fixture();
    book(data, 611, 626);
    expect(isFree(data, data.resources[0], date, 600, 30)).toBe(false);
  });
  it("conserva bloqueo de una reserva que empezó la noche anterior", () => {
    const data = fixture();
    book(data, 540, 570);
    data.bookings[0].start = atLocal("2026-09-23", 1380);
    expect(isBusy(data, data.resources[0], date, 550)).toBe(true);
  });
  it("los puestos suman personas y una sesión no duplica a sus inscritos", () => {
    const data = fixture();
    data.resources[0] = {
      ...data.resources[0],
      kind: "desk",
      capacity: 8,
      capacityUnit: "people",
      allocationMode: "shared",
    };
    book(data, 600, 660, 3);
    book(data, 600, 660, 4);
    expect(occupancyAt(data, data.resources[0], date, 615)).toBe(7);
    book(data, 600, 660, 1);
    data.bookings[2].sessionId = "session";
    expect(occupancyAt(data, data.resources[0], date, 615)).toBe(7);
    data.calendar!.sessions.push({
      id: "session",
      organization_id: data.space.id,
      service_id: "activity",
      starts_at: atLocal(date, 600),
      ends_at: atLocal(date, 660),
      capacity: 8,
      resource_ids: [data.resources[0].id],
      status: "open",
      series_id: null,
    });
    expect(isBusy(data, data.resources[0], date, 615)).toBe(true);
  });
});

describe("configuración de recursos", () => {
  it("conserva versión, omite tarifas derivadas y no borra al archivar", () => {
    const before = fixture();
    const after = structuredClone(before);
    after.resources[0].name = "Pista norte";
    after.resources[0].pricePerHourCents = 1;
    expect(planProCommand("resource.save", before, after).args).toMatchObject({
      p_resource_id: before.resources[0].id,
      p_data: { name: "Pista norte", expected_version: 3, active: true },
    });
    expect(
      JSON.stringify(planProCommand("resource.save", before, after)),
    ).not.toContain("pricePerHour");
    expect(
      planProCommand("resource.archive", before, { ...before, resources: [] })
        .args.p_data,
    ).toMatchObject({ active: false });
    expect(canProCommand({ "attendees.manage": true }, "resource.save")).toBe(
      false,
    );
  });
});
