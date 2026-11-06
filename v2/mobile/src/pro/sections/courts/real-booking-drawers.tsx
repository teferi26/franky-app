import React from "react";
import { Alert, Linking, Text, View } from "react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import { localId, usePro } from "../../store";
import { atLocal, dayLabel, durationLabel, localDate, localMinutes, minutesToLabel, money, time } from "../../../../../shared/pro/format";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import type { BookingStatus, ProBooking, ProClient, ProPayment } from "../../../../../shared/pro/types";
import { ChoiceGrid, DayChips, Detail, Field, Input, PButton, PText, Pill, Sheet, Stepper } from "../../kit";
import type { NewCourtPreset } from "./parts";
import { HourGrid, ResourcePicker, TextLink } from "./ui";
import { useCourtSlots } from "./use-court-slots";

function Hours({ minutes, value, onChange, loading, error }: {
  minutes: number[];
  value: number | null;
  onChange: (value: number) => void;
  loading: boolean;
  error: string | null;
}) {
  if (loading || error || !minutes.length) {
    return (
      <View accessibilityRole="text" accessibilityLiveRegion="polite">
        <PText v="small">{loading ? "Comprobando disponibilidad..." : (error ?? "No quedan huecos. Prueba otro día o servicio.")}</PText>
      </View>
    );
  }
  return <HourGrid minutes={minutes} value={value} onChange={onChange} variant="soft" />;
}

function openServices(spaceId: string) {
  void Linking.openURL(`https://franky.es/espacios/servicios?organization=${encodeURIComponent(spaceId)}&panel=1`);
}

export function RealNewCourtBookingDrawer({ preset, onClose }: { preset: NewCourtPreset; onClose: () => void }) {
  const { data, now, pending, can, update, spaceId } = usePro();
  const [resourceId, setResourceId] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [date, setDate] = React.useState(localDate(now));
  const [minute, setMinute] = React.useState<number | null>(null);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [clientId, setClientId] = React.useState<string | undefined>();
  const [party, setParty] = React.useState(1);
  const [note, setNote] = React.useState("");
  const [source, setSource] = React.useState<"phone" | "walkin">("phone");
  React.useEffect(() => {
    if (!preset) return;
    const resource =
      data.resources.find((row) => row.id === preset.resourceId) ??
      data.resources.find((row) => row.serviceIds?.length) ??
      data.resources[0];
    setResourceId(resource?.id ?? "");
    setServiceId(resource?.serviceIds?.[0] ?? "");
    setDate(preset.date);
    setMinute(preset.minute ?? null);
    setName("");
    setPhone("");
    setClientId(undefined);
    setParty(1);
    setNote("");
    setSource("phone");
    // El borrador se conserva mientras llega una actualización del calendario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);
  const resource = data.resources.find((row) => row.id === resourceId);
  const services = (data.calendar?.services ?? []).filter((row) => resource?.serviceIds?.includes(row.id) && row.active);
  const service = services.find((row) => row.id === serviceId);
  const today = localDate(now);
  const slots = useCourtSlots({
    date,
    serviceId: service?.id,
    resourceIds: resourceId ? [resourceId] : [],
    partySize: party,
    enabled: Boolean(preset),
    fromMinute: date === today ? localMinutes(now) : 0,
  });
  const selected = minute !== null && slots.minutes.includes(minute) ? minute : null;
  const total = service ? service.price_cents * (service.price_basis === "person" ? party : 1) : null;
  const suggestions =
    name.trim().length >= 2 && !clientId
      ? data.clients.filter((client) => client.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 5)
      : [];

  const save = async () => {
    if (!resource || !service || selected === null || total === null || !name.trim()) return;
    const existing = data.clients.find((client) => client.id === clientId);
    const customerId = existing?.id ?? localId("client");
    const customer: ProClient = existing ?? {
      id: customerId,
      name: name.trim(),
      phone: phone.trim() || undefined,
      tags: [],
      visits: 0,
      spentCents: 0,
      noShows: 0,
      source,
      marketingConsent: false,
      cardMember: false,
      createdAt: now.toISOString(),
    };
    const booking: ProBooking = {
      id: localId("booking"),
      kind: "court",
      clientId: customerId,
      clientName: customer.name,
      serviceId: service.id,
      resourceId: resource.id,
      resourceIds: [resource.id],
      start: atLocal(date, selected),
      end: atLocal(date, selected + service.duration_minutes),
      partySize: party,
      status: "confirmed",
      priceCents: total,
      paidCents: 0,
      source,
      note: note.trim() || undefined,
    };
    if (
      !(await update("court.create", (draft) => ({
        ...draft,
        clients: existing ? draft.clients : [...draft.clients, customer],
        bookings: [...draft.bookings, booking],
      })))
    )
      return;
    toast("Reserva guardada", { kind: "success", body: `${customer.name} · ${resource.name} · ${minutesToLabel(selected)}` });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title="Nueva reserva"
      description="Elige un servicio y una franja disponible."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton
            label={`Guardar reserva${total !== null ? ` · ${money(total)}` : ""}`}
            onPress={() => void save()}
            disabled={pending || !can("court.create") || selected === null || !service || !name.trim() || party < 1 || party > service.capacity}
          />
        </>
      }
    >
      <Field label="Pista o espacio">
        <ResourcePicker
          resources={data.resources}
          value={resourceId}
          disabled={(row) => !row.serviceIds?.length}
          suffix={(row) => (!row.serviceIds?.length ? " (sin servicio)" : undefined)}
          onChange={(id) => {
            const next = data.resources.find((row) => row.id === id);
            setResourceId(next?.id ?? "");
            setServiceId(next?.serviceIds?.[0] ?? "");
            setMinute(null);
            setParty(1);
          }}
        />
      </Field>
      <Field label="Servicio">
        {services.length ? (
          <ChoiceGrid
            value={serviceId}
            onChange={(value) => {
              setServiceId(value);
              setMinute(null);
              setParty(1);
            }}
            options={services.map((row) => ({
              value: row.id,
              label: row.name,
              hint: `${durationLabel(row.duration_minutes)} · ${money(row.price_cents)}${row.price_basis === "person" ? " por persona" : ""}`,
            }))}
          />
        ) : (
          <PText v="small">Sin servicios disponibles</PText>
        )}
      </Field>
      <Field label="Día">
        <DayChips
          value={date}
          today={today}
          onChange={(value) => {
            setDate(value);
            setMinute(null);
          }}
        />
      </Field>
      <Field label="Personas">
        <Stepper
          value={party}
          min={1}
          max={service?.capacity ?? 1}
          label="personas"
          onChange={(value) => {
            setParty(value);
            setMinute(null);
          }}
        />
      </Field>
      {service ? (
        <Field label="Hora de inicio">
          <Hours {...slots} value={selected} onChange={setMinute} />
        </Field>
      ) : (
        <View style={{ gap: 2 }}>
          <PText v="small">Vincula un servicio con duración y precio para reservar este espacio.</PText>
          <TextLink label="Gestionar servicios" onPress={() => openServices(spaceId)} />
        </View>
      )}
      <Field label="Quién reserva">
        <Input
          value={name}
          label="Quién reserva"
          autoComplete="off"
          onChangeText={(value) => {
            setName(value);
            setClientId(undefined);
          }}
        />
        {suggestions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            {suggestions.map((client) => (
              <PButton
                key={client.id}
                label={client.name}
                variant="outline"
                small
                onPress={() => {
                  setClientId(client.id);
                  setName(client.name);
                  setPhone(client.phone ?? "");
                }}
              />
            ))}
          </View>
        ) : null}
      </Field>
      {!clientId ? (
        <Field label="Teléfono (opcional)">
          <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" label="Teléfono (opcional)" />
        </Field>
      ) : null}
      <Field label="Origen">
        <ChoiceGrid
          value={source}
          onChange={setSource}
          options={[
            { value: "phone", label: "Teléfono" },
            { value: "walkin", label: "Mostrador" },
          ]}
        />
      </Field>
      <Field label="Nota para el equipo">
        <Input value={note} onChangeText={setNote} multiline label="Nota para el equipo" />
      </Field>
    </Sheet>
  );
}

export function RealCourtBookingDrawer({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { data, pending, can, update, now } = usePro();
  const booking = data.bookings.find((row) => row.id === bookingId);
  const [mode, setMode] = React.useState<"view" | "move" | "payment">("view");
  const [method, setMethod] = React.useState<ProPayment["method"]>("card");
  const [date, setDate] = React.useState("");
  const [minute, setMinute] = React.useState<number | null>(null);
  React.useEffect(() => {
    setMode("view");
    setMethod("card");
    setDate(booking ? localDate(booking.start) : "");
    setMinute(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);
  const service = data.calendar?.services.find((row) => row.id === booking?.serviceId);
  const slots = useCourtSlots({
    date,
    serviceId: booking?.serviceId,
    resourceIds: booking?.resourceIds ?? (booking?.resourceId ? [booking.resourceId] : []),
    partySize: booking?.partySize,
    enabled: Boolean(booking && mode === "move"),
  });
  if (!booking) return null;
  const resource = data.resources.find((row) => row.id === booking.resourceId);
  const customer = data.clients.find((row) => row.id === booking.clientId);
  const whatsapp = customerWhatsApp(customer?.phone, `Hola ${booking.clientName}, te escribimos de ${data.space.name} sobre tu reserva.`);
  const due = booking.paidCents === null ? null : Math.max(0, booking.priceCents - booking.paidCents);
  const active = !["cancelled", "no_show", "done"].includes(booking.status);
  const canArriveNow = Date.parse(booking.start) <= now.getTime() + 2 * 3600000;
  const canAttendNow = Date.parse(booking.start) <= now.getTime() + 15 * 60000;

  const setStatus = async (status: BookingStatus) => {
    if (!(await update(`court.${status}`, (draft) => ({ ...draft, bookings: draft.bookings.map((row) => (row.id === booking.id ? { ...row, status } : row)) }))))
      return;
    toast("Reserva actualizada", { kind: "success" });
    if (!active || ["cancelled", "no_show", "done"].includes(status)) onClose();
  };
  const confirmCancel = () =>
    Alert.alert("Cancelar reserva", `${booking.clientName} · ${time(booking.start)}`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Cancelar reserva", style: "destructive", onPress: () => void setStatus("cancelled") },
    ]);
  const charge = async () => {
    if (due === null || due <= 0) return;
    const payment: ProPayment = {
      id: localId("payment"),
      at: now.toISOString(),
      bookingId: booking.id,
      clientName: booking.clientName,
      concept: service?.name ?? "Reserva",
      amountCents: due,
      tipCents: 0,
      method,
    };
    if (!(await update("court.charge", (draft) => ({ ...draft, payments: [...draft.payments, payment] })))) return;
    toast("Cobro registrado", { kind: "success", body: `${money(due)} ya cobrados en el local.` });
    setMode("view");
  };
  const move = async () => {
    if (minute === null || !slots.minutes.includes(minute) || !service) return;
    if (
      !(await update("court.move", (draft) => ({
        ...draft,
        bookings: draft.bookings.map((row) =>
          row.id === booking.id ? { ...row, start: atLocal(date, minute), end: atLocal(date, minute + service.duration_minutes) } : row,
        ),
      })))
    )
      return;
    toast(booking.customerAccount ? "Cambio propuesto" : "Reserva movida", { kind: "success" });
    setMode("view");
  };

  const footer =
    mode === "payment" ? (
      <>
        <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
        <PButton label="Registrar cobro" disabled={pending || !can("court.charge") || due === null || due <= 0} onPress={() => void charge()} />
      </>
    ) : mode === "move" ? (
      <>
        <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
        <PButton
          label={booking.customerAccount ? "Proponer cambio" : "Mover reserva"}
          disabled={pending || !can("court.move") || minute === null || !slots.minutes.includes(minute)}
          onPress={() => void move()}
        />
      </>
    ) : active ? (
      <>
        {due !== null && due > 0 && can("court.charge") ? <PButton label="Registrar cobro" variant="outline" onPress={() => setMode("payment")} /> : null}
        {booking.status === "requested" ? (
          <PButton label="Confirmar" disabled={pending || !can("court.confirmed")} onPress={() => void setStatus("confirmed")} />
        ) : (
          <PButton
            label={booking.status === "confirmed" ? "Ha llegado" : "Finalizar reserva"}
            disabled={
              pending ||
              (booking.status === "confirmed" ? !canArriveNow : !canAttendNow) ||
              !can(booking.status === "confirmed" ? "court.arrived" : "court.done")
            }
            onPress={() => void setStatus(booking.status === "confirmed" ? "arrived" : "done")}
          />
        )}
      </>
    ) : booking.status === "done" && due !== null && due > 0 && can("court.charge") ? (
      <PButton label="Registrar cobro" disabled={pending} onPress={() => setMode("payment")} />
    ) : undefined;

  return (
    <Sheet
      open
      onClose={onClose}
      title={resource?.name ?? "Reserva"}
      description={`${dayLabel(booking.start)} · ${time(booking.start)} a ${time(booking.end)}`}
      footer={footer}
    >
      {mode === "move" ? (
        <>
          <Field label="Día">
            <DayChips
              value={date}
              today={localDate(now)}
              onChange={(value) => {
                setDate(value);
                setMinute(null);
              }}
            />
          </Field>
          <Field label="Hora">
            <Hours {...slots} value={minute} onChange={setMinute} />
          </Field>
          <PText v="small">La reserva mantiene su pista o espacio actual.</PText>
        </>
      ) : mode === "payment" ? (
        <>
          <Text style={{ fontFamily: FONT.display, fontSize: 30, color: C.text }} maxFontSizeMultiplier={1.2}>
            {due !== null ? money(due) : "Sin importe disponible"}
          </Text>
          <Field label="Ya cobrado con">
            <ChoiceGrid
              value={method}
              onChange={setMethod}
              options={[
                { value: "card", label: "Tarjeta" },
                { value: "cash", label: "Efectivo" },
                { value: "bizum", label: "Bizum" },
              ]}
            />
          </Field>
          <PText v="small">Registra el importe que ya has cobrado en tu local.</PText>
        </>
      ) : (
        <>
          <PText v="h2">{booking.clientName}</PText>
          {booking.reschedule ? (
            <View accessibilityRole="text" accessibilityLiveRegion="polite" style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md }}>
              <PText v="small" color={C.text}>
                {`Cambio propuesto al ${dayLabel(booking.reschedule.start)} a las ${time(booking.reschedule.start)}. La hora actual se conserva hasta que el cliente acepte.`}
              </PText>
            </View>
          ) : null}
          <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}>
            <Detail label="Servicio" value={service?.name ?? "Reserva"} />
            <Detail label="Personas" value={booking.partySize} />
            <Detail label="Precio" value={money(booking.priceCents)} last={due === null} />
            {due !== null ? <Detail label="Pendiente de registrar" value={money(due)} last /> : null}
          </View>
          {booking.note ? (
            <View style={{ gap: S.xs }}>
              <PText v="label">Nota del equipo</PText>
              <PText v="small" color={C.text}>{booking.note}</PText>
            </View>
          ) : null}
          {whatsapp ? <TextLink label="Preparar WhatsApp" onPress={() => void Linking.openURL(whatsapp)} /> : null}
          {active ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {booking.status === "confirmed" ? (
                <PButton label="Mover reserva" variant="outline" disabled={pending || !can("court.move")} onPress={() => setMode("move")} />
              ) : null}
              <PButton label="Cancelar reserva" variant="ghost" disabled={pending || !can("court.cancelled")} onPress={confirmCancel} />
              {booking.status === "confirmed" ? (
                <PButton
                  label="No se presentó"
                  variant="ghost"
                  disabled={pending || !can("court.no_show") || Date.parse(booking.start) > now.getTime()}
                  onPress={() => void setStatus("no_show")}
                />
              ) : null}
            </View>
          ) : (
            <Pill label={booking.status === "done" ? "Finalizada" : booking.status === "cancelled" ? "Cancelada" : "No se presentó"} />
          )}
        </>
      )}
    </Sheet>
  );
}
