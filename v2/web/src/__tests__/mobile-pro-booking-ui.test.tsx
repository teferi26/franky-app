import React from "react";
import * as jsx from "react/jsx-runtime";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as format from "../../../shared/pro/format";
import * as contact from "../../../shared/pro/customer-contact";
import { canProCommand } from "../../../shared/pro/remote-actions";
import { buildDemo } from "@/lib/pro/demo";
import { nativeLoader } from "./helpers/native-module";

const View = ({ children }: any) => <div>{children}</div>;
const Text = ({ children }: any) => <span>{children}</span>;
const Button = ({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  busy,
  children,
}: any) => (
  <button
    aria-label={accessibilityLabel}
    disabled={disabled || busy}
    onClick={onPress}
  >
    {label ?? children}
  </button>
);
const Field = ({ label, value, onChangeText, editable }: any) => (
  <label>
    {label}
    <input
      aria-label={label}
      value={value}
      onChange={(event) => onChangeText(event.target.value)}
      disabled={editable === false}
    />
  </label>
);

function fixture() {
  const now = new Date();
  const date = format.addDays(format.localDate(now), 1);
  const start = format.atLocal(date, 10 * 60);
  const data = buildDemo("hairdresser", now);
  data.space.demo = false;
  const service = data.services.find((item) =>
    item.staffIds.includes(data.staff[0].id),
  )!;
  const booking = data.bookings[0];
  booking.id = "booking-1";
  booking.status = "confirmed";
  booking.priceCents = 2400;
  booking.paidCents = 400;
  const permissions: Record<string, boolean> = {
    "content.manage": true,
    "attendees.manage": true,
    "finance.read": true,
    "finance.manage": true,
  };
  const update = vi.fn(
    async (_label: string, _edit: (draft: any) => void) => false,
  );
  const close = vi.fn();
  const openURL = vi.fn(async () => {});
  const context = {
    snapshot: {
      data,
      permissions,
      services: [{ id: service.id, mode: "appointment", active: true }],
      bookings: [],
    },
    date,
    now,
    pending: false,
    error: null,
    can: (label: string) => canProCommand(permissions, label),
    update,
    refresh: vi.fn(),
  };
  const load = nativeLoader({
    react: { ...React, default: React },
    "react/jsx-runtime": jsx,
    "react-native": { View, Text, ScrollView: View, Linking: { openURL } },
    "expo-crypto": { randomUUID: () => "b2895b72-66c0-4b42-a589-22fcc4182878" },
    "@/components/ui": {
      Btn: Button,
      Skeleton: () => <span>Loading</span>,
      Tap: Button,
    },
    "@/theme": { C: {}, F: {}, S: {} },
    "../../../../shared/pro/format": format,
    "../../../../shared/pro/customer-contact": contact,
    "../../../../shared/pro/remote-actions": { canProCommand },
    "./ProProvider": { useNativePro: () => context },
    "./ProUi": {
      ProChoice: Button,
      ProField: Field,
      ProError: ({ message }: any) =>
        message ? <span role="alert">{message}</span> : null,
      ProSheet: ({ title, children }: any) => (
        <section aria-label={title}>{children}</section>
      ),
    },
    "./useProSlots": {
      useProSlots: () => ({ slots: [start], loading: false, error: null }),
    },
  });
  const { NewBookingSheet } = load(
    "../mobile/src/components/pro/NewBookingSheet.tsx",
  );
  const { BookingSheet } = load(
    "../mobile/src/components/pro/BookingSheet.tsx",
  );
  return {
    data,
    service,
    start,
    context,
    permissions,
    update,
    close,
    openURL,
    NewBookingSheet,
    BookingSheet,
  };
}

describe("agenda nativa: formularios", () => {
  it("construye la cita con el catálogo real y conserva el formulario si falla el guardado", async () => {
    const f = fixture();
    render(<f.NewBookingSheet close={f.close} />);
    fireEvent.click(screen.getByRole("button", { name: "10:00" }));
    fireEvent.change(screen.getByLabelText("Nombre del cliente"), {
      target: { value: "Alejandra Pruebas" },
    });
    fireEvent.change(screen.getByLabelText("Teléfono (opcional)"), {
      target: { value: "+34611123456" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Guardar cita/ }));
    });
    expect(f.update).toHaveBeenCalledTimes(1);
    const [label, edit] = f.update.mock.calls[0];
    const after = structuredClone(f.data);
    edit(after);
    const added = after.bookings.at(-1)!;
    expect(label).toBe("booking.create");
    expect(added).toMatchObject({
      serviceId: f.service.id,
      staffId: f.data.staff[0].id,
      priceCents: f.service.priceCents,
      start: f.start,
      source: "phone",
    });
    expect(after.clients.at(-1)).toMatchObject({
      name: "Alejandra Pruebas",
      phone: "+34611123456",
      marketingConsent: false,
    });
    expect(f.close).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombre del cliente")).toHaveValue(
      "Alejandra Pruebas",
    );
  });

  it("registra dinero recibido sin inventar asistencia ni saldo confirmado", async () => {
    const f = fixture();
    render(<f.BookingSheet bookingId="booking-1" close={f.close} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar cobro externo" }),
    );
    expect(screen.getByLabelText("Importe recibido (€)")).toHaveValue("20,00");
    fireEvent.change(screen.getByLabelText("Importe recibido (€)"), {
      target: { value: "10,50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Efectivo" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    });
    const [label, edit] = f.update.mock.calls[0];
    const after = structuredClone(f.data);
    edit(after);
    expect(label).toBe("booking.charge");
    expect(after.payments.at(-1)).toMatchObject({
      amountCents: 1050,
      method: "cash",
      tipCents: 0,
      bookingId: "booking-1",
    });
    expect(after.bookings[0]).toEqual(f.data.bookings[0]);
    expect(screen.queryByText("Cobro registrado")).toBeNull();
  });

  it("no expone importes ni acciones de cobro al personal sin permiso financiero", () => {
    const f = fixture();
    f.permissions["finance.read"] = false;
    f.permissions["finance.manage"] = false;
    render(<f.BookingSheet bookingId="booking-1" close={f.close} />);
    expect(
      screen.queryByRole("button", { name: "Registrar cobro externo" }),
    ).toBeNull();
    expect(screen.queryByText(/registrados.*pendientes/)).toBeNull();
  });

  it("pide una confirmación dentro del detalle antes de cancelar", async () => {
    const f = fixture();
    render(<f.BookingSheet bookingId="booking-1" close={f.close} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar cita" }));
    expect(f.update).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Sí, cancelar cita" }),
      );
    });
    expect(f.update.mock.calls[0][0]).toBe("booking.cancelled");
    expect(f.close).not.toHaveBeenCalled();
  });
});
