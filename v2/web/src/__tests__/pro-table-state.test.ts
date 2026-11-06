import { describe, expect, it } from "vitest";
import {
  isWaitlist,
  isoAt,
  realTablesForService,
  tableFree,
  tableLive,
  tableServices,
  waitlistOn,
} from "@/lib/pro/tables";
import {
  addTableBooking,
  realTableFixture,
  tableDate,
  tableNow,
} from "./fixtures/pro-tables";

describe("Sala real: ocupación y disponibilidad", () => {
  it("cuenta desde la llegada real sin cambiar el horario original", () => {
    const data = realTableFixture();
    const booking = addTableBooking(data);
    booking.status = "arrived";
    booking.tableOperation = {
      tableId: "table-a",
      seatedAt: isoAt(tableDate, 13 * 60 + 20),
      leftAt: null,
      cleanedAt: null,
      cleaningMinutes: 15,
    };
    expect(tableLive(data, data.tables[0], tableNow)).toMatchObject({
      state: "seated",
      minutes: 10,
      occupiedPeople: 2,
    });
    expect(booking.start).toBe(isoAt(tableDate, 13 * 60));
  });

  it("mantiene una mesa sentada al pasar medianoche", () => {
    const data = realTableFixture();
    const booking = addTableBooking(data);
    booking.status = "arrived";
    booking.tableOperation = {
      tableId: "table-a",
      seatedAt: isoAt(tableDate, 23 * 60 + 50),
      leftAt: null,
      cleanedAt: null,
      cleaningMinutes: 15,
    };
    expect(
      tableLive(data, data.tables[0], new Date(isoAt("2026-09-25", 10))),
    ).toMatchObject({ state: "seated", minutes: 20 });
  });

  it("usa la salida y la limpieza confirmadas, sin convertir salida en cobro", () => {
    const data = realTableFixture();
    const booking = addTableBooking(data);
    booking.status = "done";
    booking.tableOperation = {
      tableId: "table-a",
      seatedAt: booking.start,
      leftAt: isoAt(tableDate, 13 * 60 + 25),
      cleanedAt: null,
      cleaningMinutes: 15,
    };
    expect(tableLive(data, data.tables[0], tableNow)).toMatchObject({
      state: "dirty",
      minutes: 10,
    });
    booking.tableOperation.cleanedAt = tableNow.toISOString();
    expect(tableLive(data, data.tables[0], tableNow).state).toBe("free");
    expect(booking.end).toBe(isoAt(tableDate, 14 * 60 + 30));
    expect(booking.paidCents).toBeNull();
  });

  it("respeta el bloqueo del servidor después de la hora de fin", () => {
    const data = realTableFixture();
    addTableBooking(data);
    expect(tableFree(data, "table-a", tableDate, 14 * 60 + 30, 15 * 60)).toBe(
      false,
    );
    expect(tableFree(data, "table-a", tableDate, 14 * 60 + 45, 15 * 60)).toBe(
      true,
    );
  });

  it("bloquea una llegada anticipada hasta registrar salida y limpieza", () => {
    const data = realTableFixture();
    const booking = addTableBooking(data);
    booking.status = "arrived";
    booking.tableOperation = {
      tableId: "table-a",
      seatedAt: isoAt(tableDate, 12 * 60 + 50),
      leftAt: null,
      cleanedAt: null,
      cleaningMinutes: 15,
    };
    expect(
      tableFree(data, "table-a", tableDate, 12 * 60 + 51, 12 * 60 + 55),
    ).toBe(false);
    booking.status = "done";
    data.calendar!.bookings[0].status = "attended";
    booking.tableOperation.leftAt = isoAt(tableDate, 12 * 60 + 55);
    expect(tableFree(data, "table-a", tableDate, 13 * 60, 13 * 60 + 5)).toBe(
      false,
    );
    expect(
      tableFree(data, "table-a", tableDate, 13 * 60 + 10, 13 * 60 + 30),
    ).toBe(true);
    expect(booking.end).toBe(isoAt(tableDate, 14 * 60 + 30));
    expect(booking.paidCents).toBeNull();
  });

  it("una sobremesa sigue ocupada después del fin previsto y necesita margen para limpieza", () => {
    const data = realTableFixture();
    const booking = addTableBooking(data);
    booking.status = "arrived";
    booking.tableOperation = {
      tableId: "table-a",
      seatedAt: booking.start,
      leftAt: null,
      cleanedAt: null,
      cleaningMinutes: 15,
    };
    const now = new Date(isoAt(tableDate, 15 * 60));
    expect(tableLive(data, data.tables[0], now).state).toBe("seated");
    expect(
      tableFree(
        data,
        "table-a",
        tableDate,
        15 * 60,
        15 * 60 + 10,
        undefined,
        1,
        now,
      ),
    ).toBe(false);
    expect(
      tableFree(
        data,
        "table-a",
        tableDate,
        15 * 60 + 15,
        15 * 60 + 30,
        undefined,
        1,
        now,
      ),
    ).toBe(true);
    expect(booking.end).toBe(isoAt(tableDate, 14 * 60 + 30));
  });

  it("una limpieza confirmada tarde no vuelve a bloquear minutos ya libres", () => {
    const data = realTableFixture();
    const booking = addTableBooking(data);
    booking.status = "done";
    data.calendar!.bookings[0].status = "attended";
    booking.tableOperation = {
      tableId: "table-a",
      seatedAt: booking.start,
      leftAt: isoAt(tableDate, 13 * 60 + 25),
      cleanedAt: isoAt(tableDate, 13 * 60 + 50),
      cleaningMinutes: 15,
    };
    expect(tableLive(data, data.tables[0], tableNow)).toMatchObject({
      state: "dirty",
      minutes: 10,
    });
    expect(
      tableFree(data, "table-a", tableDate, 13 * 60 + 40, 13 * 60 + 45),
    ).toBe(true);
    expect(
      tableLive(data, data.tables[0], new Date(isoAt(tableDate, 13 * 60 + 41)))
        .state,
    ).toBe("free");
  });

  it("limpiar antes del plazo libera la mesa sin cambiar el horario", () => {
    const data = realTableFixture();
    const booking = addTableBooking(data);
    booking.status = "done";
    data.calendar!.bookings[0].status = "attended";
    booking.tableOperation = {
      tableId: "table-a",
      seatedAt: booking.start,
      leftAt: isoAt(tableDate, 13 * 60 + 25),
      cleanedAt: isoAt(tableDate, 13 * 60 + 28),
      cleaningMinutes: 15,
    };
    expect(tableLive(data, data.tables[0], tableNow).state).toBe("free");
    expect(tableFree(data, "table-a", tableDate, 13 * 60 + 28, 14 * 60)).toBe(
      true,
    );
    expect(booking.start).toBe(isoAt(tableDate, 13 * 60));
    expect(booking.end).toBe(isoAt(tableDate, 14 * 60 + 30));
  });

  it("suma solo las personas que coinciden en una mesa compartida", () => {
    const data = realTableFixture();
    addTableBooking(data);
    data.tables[0].exclusive = false;
    const first = data.calendar!.bookings[0];
    first.ends_at = isoAt(tableDate, 13 * 60 + 30);
    first.blocked_until = first.ends_at;
    data.calendar!.bookings.push({
      ...first,
      id: "booking-b",
      starts_at: first.ends_at,
      ends_at: isoAt(tableDate, 14 * 60),
      blocked_until: isoAt(tableDate, 14 * 60),
    });
    expect(
      tableFree(data, "table-a", tableDate, 13 * 60, 14 * 60, undefined, 2),
    ).toBe(true);
    expect(
      tableFree(data, "table-a", tableDate, 13 * 60, 14 * 60, undefined, 3),
    ).toBe(false);
  });

  it("la mesa exclusiva tampoco ofrece una reserva que supera su aforo", () => {
    const data = realTableFixture();
    expect(
      tableFree(data, "table-a", tableDate, 16 * 60, 17 * 60, undefined, 5),
    ).toBe(false);
  });

  it("conserva capacidad compartida y excluye mesas inactivas", () => {
    const data = realTableFixture();
    addTableBooking(data);
    data.tables[0].exclusive = false;
    expect(
      tableFree(
        data,
        "table-a",
        tableDate,
        13 * 60 + 30,
        14 * 60,
        undefined,
        2,
      ),
    ).toBe(true);
    expect(
      tableFree(
        data,
        "table-a",
        tableDate,
        13 * 60 + 30,
        14 * 60,
        undefined,
        3,
      ),
    ).toBe(false);
    data.tables[0].active = false;
    expect(tableFree(data, "table-a", tableDate, 16 * 60, 17 * 60)).toBe(false);
  });

  it("no ofrece pausas ni servicios con señal, personal o demasiadas personas", () => {
    const data = realTableFixture();
    data.calendar!.availability[0].end_minute = 14 * 60;
    expect(
      realTablesForService(data, "service-a", tableDate, 13 * 60, 2),
    ).toHaveLength(0);
    expect(
      realTablesForService(data, "service-a", tableDate, 10 * 60, 5),
    ).toHaveLength(0);
    data.calendar!.services[0].deposit_cents = 100;
    expect(tableServices(data)).toHaveLength(0);
    data.calendar!.services[0].deposit_cents = 0;
    data.calendar!.services[0].staff_required = true;
    expect(tableServices(data)).toHaveLength(0);
  });

  it("no transforma una reserva presencial real en entrada de espera", () => {
    const data = realTableFixture();
    const booking = addTableBooking(data);
    booking.source = "walkin";
    booking.status = "requested";
    expect(isWaitlist(booking)).toBe(false);
    expect(waitlistOn(data, tableDate)).toEqual([]);
  });
});
