import React from "react";
import * as jsx from "react/jsx-runtime";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as agenda from "../../../shared/pro/agenda";
import * as format from "../../../shared/pro/format";
import { buildDemo } from "@/lib/pro/demo";
import { nativeLoader } from "./helpers/native-module";

function fixture() {
  const date = "2026-09-24";
  const data = buildDemo("hairdresser", new Date(format.atLocal(date, 9 * 60)));
  const booking = data.bookings[0];
  booking.start = format.atLocal(format.addDays(date, -1), 23 * 60 + 30);
  booking.end = format.atLocal(date, 60);
  booking.clientName = "Cita nocturna";
  booking.status = "confirmed";
  booking.staffId = data.staff[0].id;
  booking.resourceIds = [data.staff[0].id];
  data.bookings = [booking];
  const context = {
    snapshot: { data },
    date,
    now: new Date(format.atLocal(date, 0)),
    can: vi.fn(() => true),
  };
  const View = ({ children }: any) => <div>{children}</div>;
  const Text = ({ children }: any) => <span>{children}</span>;
  const Tap = ({
    children,
    accessibilityLabel,
    disabled,
    onPress,
    style,
  }: any) => (
    <button
      aria-label={accessibilityLabel}
      disabled={disabled}
      onClick={onPress}
      data-top={style?.top}
      data-height={style?.height}
    >
      {children}
    </button>
  );
  const load = nativeLoader({
    react: { ...React, default: React },
    "react/jsx-runtime": jsx,
    "react-native": {
      View,
      Text,
      ScrollView: View,
      useWindowDimensions: () => ({ width: 390 }),
    },
    "lucide-react-native": { Plus: () => null },
    "@/components/ui": { Tap },
    "@/theme": { C: {}, F: {}, R: {}, S: { lg: 16 } },
    "../../../../shared/pro/agenda": agenda,
    "../../../../shared/pro/format": format,
    "./ProProvider": { useNativePro: () => context },
    "./BookingSheet": { BOOKING_LABEL: { confirmed: "Confirmada" } },
  });
  const { AgendaCalendar } = load(
    "../mobile/src/components/pro/AgendaCalendar.tsx",
  );
  const openBooking = vi.fn();
  const newBooking = vi.fn();
  return { data, context, AgendaCalendar, openBooking, newBooking };
}

describe("agenda nativa: calendario", () => {
  it("mantiene una cita que empezó ayer en el tramo visible de hoy, incluso con el día cerrado", () => {
    const f = fixture();
    f.data.space.hours = f.data.space.hours.map(() => null);
    render(
      <f.AgendaCalendar
        openBooking={f.openBooking}
        newBooking={f.newBooking}
      />,
    );
    const card = screen.getByRole("button", { name: /Cita nocturna/ });
    expect(card).toHaveAttribute("data-top", "0");
    expect(card).toHaveAttribute("data-height", "174");
    fireEvent.click(card);
    expect(f.openBooking).toHaveBeenCalledWith(f.data.bookings[0].id);
    expect(
      screen
        .getAllByRole("button", { name: /Nueva cita con/ })
        .every((slot) => slot.hasAttribute("disabled")),
    ).toBe(true);
  });

  it("bloquea todos los huecos mientras los permisos o una escritura no permiten crear", () => {
    const f = fixture();
    f.context.can.mockReturnValue(false);
    render(
      <f.AgendaCalendar
        openBooking={f.openBooking}
        newBooking={f.newBooking}
      />,
    );
    const slots = screen.getAllByRole("button", { name: /Nueva cita con/ });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) expect(slot).toBeDisabled();
    fireEvent.click(slots[0]);
    expect(f.newBooking).not.toHaveBeenCalled();
    expect(f.context.can).toHaveBeenCalledWith("booking.create");
  });
});
