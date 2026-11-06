import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { Btn } from "@/components/ui";
import { F, S } from "@/theme";
import { customerWhatsApp } from "../../../../shared/pro/customer-contact";
import { canProCommand } from "../../../../shared/pro/remote-actions";
import { dayLabel, money, time } from "../../../../shared/pro/format";
import type { BookingStatus, ProPayment } from "../../../../shared/pro/types";
import { useNativePro } from "./ProProvider";
import { ProChoice, ProError, ProField, ProSheet } from "./ProUi";

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  requested: "Por confirmar",
  confirmed: "Confirmada",
  arrived: "Ha llegado",
  in_service: "En servicio",
  done: "Asistencia registrada",
  no_show: "No asistió",
  cancelled: "Cancelada",
};

export function BookingSheet({
  bookingId,
  close,
}: {
  bookingId: string;
  close(): void;
}) {
  const { snapshot, pending, error, now, can, update, refresh } =
    useNativePro();
  const [cancel, setCancel] = useState(false);
  const [payment, setPayment] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ProPayment["method"]>("card");
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const data = snapshot?.data;
  const booking = data?.bookings.find((item) => item.id === bookingId);
  if (!data || !booking)
    return (
      <ProSheet title="Cita" pending={pending} close={close}>
        <Text style={F.body}>
          Esta cita ya no está disponible. Vuelve a la agenda para comprobarla.
        </Text>
        <Btn label="Volver a la agenda" onPress={close} />
      </ProSheet>
    );
  const raw = snapshot?.bookings.find((item) => item.id === booking.id);
  const client = data.clients.find((item) => item.id === booking.clientId);
  const service = data.services.find((item) => item.id === booking.serviceId);
  const staff = data.staff.find((item) => item.id === booking.staffId);
  const active = !["done", "cancelled", "no_show"].includes(booking.status);
  const started = Date.parse(booking.start) <= now.getTime();
  const due =
    booking.paidCents === null
      ? null
      : Math.max(0, booking.priceCents - booking.paidCents);
  const allowed = (label: string) =>
    canProCommand(snapshot?.permissions ?? {}, label);
  const whatsapp = customerWhatsApp(
    client?.phone,
    `Hola ${booking.clientName.split(" ")[0]}, te escribimos de ${data.space.name} sobre tu cita del ${dayLabel(booking.start)} a las ${time(booking.start)}.`,
  );

  const status = async (next: BookingStatus) => {
    setNotice(null);
    const saved = await update(`booking.${next}`, (draft) => {
      const row = draft.bookings.find((item) => item.id === booking.id);
      if (row) row.status = next;
    });
    if (saved) {
      if (next === "cancelled" || next === "no_show") close();
      else setNotice(BOOKING_LABEL[next]);
    }
  };
  const savePayment = async () => {
    const value = amount.trim().replace(",", ".");
    const cents = Math.round(Number(value) * 100);
    if (
      !/^\d+(\.\d{1,2})?$/.test(value) ||
      !Number.isSafeInteger(cents) ||
      cents <= 0 ||
      due === null ||
      cents > due
    ) {
      setLocalError("Revisa el importe que has recibido.");
      return;
    }
    setLocalError(null);
    const saved = await update("booking.charge", (draft) => {
      draft.payments.push({
        id: randomUUID(),
        at: new Date().toISOString(),
        bookingId: booking.id,
        clientName: booking.clientName,
        staffId: booking.staffId,
        concept: service?.name ?? "Servicio",
        amountCents: cents,
        tipCents: 0,
        method,
      });
    });
    if (saved) {
      setPayment(false);
      setNotice("Cobro registrado");
    }
  };

  return (
    <ProSheet title="Detalle de la cita" pending={pending} close={close}>
      <View style={{ gap: S.sm }}>
        <Text style={F.label}>{BOOKING_LABEL[booking.status]}</Text>
        <Text style={F.h1}>{booking.clientName}</Text>
        <Text style={F.body}>
          {service?.name ??
            raw?.price_snapshot.service_name ??
            "Servicio reservado"}
        </Text>
        <Text style={F.small}>
          {dayLabel(booking.start)} · {time(booking.start)} a{" "}
          {time(booking.end)}
        </Text>
        {staff ? <Text style={F.small}>Con {staff.name}</Text> : null}
      </View>
      {booking.note ? (
        <View style={{ gap: S.sm }}>
          <Text style={F.h3}>Nota del equipo</Text>
          <Text style={F.body}>{booking.note}</Text>
        </View>
      ) : null}
      {booking.reschedule ? (
        <Text style={F.small}>
          Cambio propuesto al {dayLabel(booking.reschedule.start)} a las{" "}
          {time(booking.reschedule.start)}. Esperando respuesta del cliente.
        </Text>
      ) : null}
      {snapshot?.permissions["finance.read"] ? (
        <View style={{ gap: S.sm }}>
          <Text style={F.h3}>{money(booking.priceCents)}</Text>
          <Text style={F.small}>
            {due === null
              ? "Cobros pendientes de comprobar"
              : `${money(booking.paidCents!)} registrados · ${money(due)} pendientes`}
          </Text>
        </View>
      ) : null}
      {whatsapp ? (
        <Btn
          label="Abrir WhatsApp"
          variant="ghost"
          disabled={pending}
          onPress={() => {
            void Linking.openURL(whatsapp).catch(() =>
              setLocalError("No se ha podido abrir WhatsApp."),
            );
          }}
        />
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={F.body}>
          {notice}
        </Text>
      ) : null}
      <ProError
        message={localError ?? error}
        retry={error ? () => void refresh() : undefined}
      />
      {payment ? (
        <View style={{ gap: S.lg }}>
          <Text style={F.h2}>Cobro recibido fuera de Franky</Text>
          <ProField
            label="Importe recibido (€)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            editable={!pending}
            maxLength={10}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            {(
              [
                ["card", "Tarjeta"],
                ["cash", "Efectivo"],
                ["bizum", "Bizum"],
              ] as const
            ).map(([value, label]) => (
              <ProChoice
                key={value}
                label={label}
                selected={method === value}
                disabled={pending}
                onPress={() => setMethod(value)}
              />
            ))}
          </View>
          <Btn
            label="Registrar cobro"
            busy={pending}
            disabled={!can("booking.charge")}
            onPress={() => void savePayment()}
          />
          <Btn
            label="Volver al detalle"
            variant="ghost"
            disabled={pending}
            onPress={() => setPayment(false)}
          />
        </View>
      ) : cancel ? (
        <View style={{ gap: S.lg }}>
          <Text style={F.body}>¿Cancelar la cita de {booking.clientName}?</Text>
          <Btn
            label="Sí, cancelar cita"
            variant="danger"
            busy={pending}
            disabled={!can("booking.cancelled")}
            onPress={() => void status("cancelled")}
          />
          <Btn
            label="Mantener cita"
            variant="ghost"
            disabled={pending}
            onPress={() => setCancel(false)}
          />
        </View>
      ) : (
        <View style={{ gap: S.md }}>
          {booking.status === "requested" && allowed("booking.confirmed") ? (
            <Btn
              label="Confirmar cita"
              busy={pending}
              disabled={
                !can("booking.confirmed") ||
                Boolean(
                  raw && raw.deposit_cents > 0 && raw.deposit_status !== "paid",
                )
              }
              onPress={() => void status("confirmed")}
            />
          ) : null}
          {active &&
          booking.status !== "requested" &&
          started &&
          allowed("booking.done") ? (
            <Btn
              label="Registrar asistencia"
              busy={pending}
              disabled={!can("booking.done")}
              onPress={() => void status("done")}
            />
          ) : null}
          {active && started && allowed("booking.no_show") ? (
            <Btn
              label="No ha asistido"
              variant="ghost"
              busy={pending}
              disabled={!can("booking.no_show")}
              onPress={() => void status("no_show")}
            />
          ) : null}
          {due !== null &&
          due > 0 &&
          !["cancelled", "no_show"].includes(booking.status) &&
          allowed("booking.charge") ? (
            <Btn
              label="Registrar cobro externo"
              variant="ghost"
              disabled={!can("booking.charge")}
              onPress={() => {
                setAmount((due / 100).toFixed(2).replace(".", ","));
                setPayment(true);
              }}
            />
          ) : null}
          {active && allowed("booking.cancelled") ? (
            <Btn
              label="Cancelar cita"
              variant="ghost"
              disabled={!can("booking.cancelled")}
              onPress={() => setCancel(true)}
            />
          ) : null}
        </View>
      )}
    </ProSheet>
  );
}
