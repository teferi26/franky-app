"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import { useAgendaSlots } from "@/lib/pro/use-agenda-slots";
import {
  atLocal,
  dayLabel,
  durationLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  time,
} from "@/lib/pro/format";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import type {
  BookingStatus,
  ProBooking,
  ProClient,
  ProPayment,
} from "@/lib/pro/types";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Detail,
  Drawer,
  FormField,
  Pill,
  inputClass,
  textareaClass,
} from "../../kit";
import type { NewCourtPreset } from "./parts";

function Hours({
  minutes,
  value,
  onChange,
  loading,
  error,
}: {
  minutes: number[];
  value: number | null;
  onChange: (value: number) => void;
  loading: boolean;
  error: string | null;
}) {
  if (loading || error || !minutes.length) {
    return (
      <p className="text-sm text-text-muted" role="status">
        {loading
          ? "Comprobando disponibilidad..."
          : (error ?? "No quedan huecos. Prueba otro día o servicio.")}
      </p>
    );
  }
  return (
    <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto pro-scroll">
      {minutes.map((minute) => (
        <button
          key={minute}
          type="button"
          aria-pressed={value === minute}
          onClick={() => onChange(minute)}
          className={cn(
            "h-10 min-w-16 rounded-xl border px-3 text-sm font-semibold tabular",
            value === minute
              ? "border-violet bg-violet-50 text-violet-deep"
              : "border-border",
          )}
        >
          {minutesToLabel(minute)}
        </button>
      ))}
    </div>
  );
}

export function RealNewCourtBookingDrawer({
  preset,
  onClose,
}: {
  preset: NewCourtPreset;
  onClose: () => void;
}) {
  const { data, now, pending, can, update, spaceId } = usePro();
  const toast = useToast();
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
  const services = (data.calendar?.services ?? []).filter(
    (row) => resource?.serviceIds?.includes(row.id) && row.active,
  );
  const service = services.find((row) => row.id === serviceId);
  const today = localDate(now);
  const slots = useAgendaSlots({
    date,
    serviceId: service?.id,
    resourceIds: resourceId ? [resourceId] : [],
    partySize: party,
    duration: service?.duration_minutes ?? 0,
    enabled: Boolean(preset),
    fromMinute: date === today ? localMinutes(now) : 0,
  });
  const selected =
    minute !== null && slots.minutes.includes(minute) ? minute : null;
  const total = service
    ? service.price_cents * (service.price_basis === "person" ? party : 1)
    : null;
  const suggestions =
    name.trim().length >= 2 && !clientId
      ? data.clients
          .filter((client) =>
            client.name.toLowerCase().includes(name.trim().toLowerCase()),
          )
          .slice(0, 5)
      : [];

  const save = async () => {
    if (
      !resource ||
      !service ||
      selected === null ||
      total === null ||
      !name.trim()
    )
      return;
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
    toast.success(
      "Reserva guardada",
      `${customer.name} · ${resource.name} · ${minutesToLabel(selected)}`,
    );
    onClose();
  };
  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(open) => !open && onClose()}
      title="Nueva reserva"
      description="Elige un servicio y una franja disponible."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            onClick={save}
            disabled={
              pending ||
              !can("court.create") ||
              selected === null ||
              !service ||
              !name.trim() ||
              party < 1 ||
              party > service.capacity
            }
          >
            Guardar reserva{total !== null ? ` · ${money(total)}` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Pista o espacio" htmlFor="real-court-resource">
          <select
            id="real-court-resource"
            value={resourceId}
            className={inputClass}
            onChange={(event) => {
              const next = data.resources.find(
                (row) => row.id === event.target.value,
              );
              setResourceId(next?.id ?? "");
              setServiceId(next?.serviceIds?.[0] ?? "");
              setMinute(null);
              setParty(1);
            }}
          >
            {data.resources.map((row) => (
              <option
                key={row.id}
                value={row.id}
                disabled={!row.serviceIds?.length}
              >
                {row.name}
                {!row.serviceIds?.length ? " (sin servicio)" : ""}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Servicio" htmlFor="real-court-service">
          <select
            id="real-court-service"
            value={serviceId}
            className={inputClass}
            onChange={(event) => {
              setServiceId(event.target.value);
              setMinute(null);
              setParty(1);
            }}
          >
            {!services.length ? (
              <option value="">Sin servicios disponibles</option>
            ) : null}
            {services.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {durationLabel(row.duration_minutes)} ·{" "}
                {money(row.price_cents)}
                {row.price_basis === "person" ? " por persona" : ""}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Día" htmlFor="real-court-date">
            <input
              id="real-court-date"
              type="date"
              min={today}
              value={date}
              className={inputClass}
              onChange={(event) => {
                setDate(event.target.value);
                setMinute(null);
              }}
            />
          </FormField>
          <FormField label="Personas" htmlFor="real-court-party">
            <input
              id="real-court-party"
              type="number"
              min={1}
              max={service?.capacity ?? 1}
              value={party}
              className={inputClass}
              onChange={(event) => {
                setParty(Number(event.target.value));
                setMinute(null);
              }}
            />
          </FormField>
        </div>
        {service ? (
          <FormField label="Hora de inicio">
            <Hours {...slots} value={selected} onChange={setMinute} />
          </FormField>
        ) : (
          <p className="text-sm text-text-muted">
            Vincula un servicio con duración y precio para reservar este
            espacio.{" "}
            <Link
              className="font-semibold text-violet"
              href={`/espacios/servicios?organization=${encodeURIComponent(spaceId)}`}
            >
              Gestionar servicios
            </Link>
          </p>
        )}
        <FormField label="Quién reserva" htmlFor="real-court-name">
          <input
            id="real-court-name"
            value={name}
            className={inputClass}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              setClientId(undefined);
            }}
          />
          {suggestions.length ? (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className="min-h-10 rounded-xl border border-border px-3 text-sm"
                  onClick={() => {
                    setClientId(client.id);
                    setName(client.name);
                    setPhone(client.phone ?? "");
                  }}
                >
                  {client.name}
                </button>
              ))}
            </div>
          ) : null}
        </FormField>
        {!clientId ? (
          <FormField label="Teléfono (opcional)" htmlFor="real-court-phone">
            <input
              id="real-court-phone"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={inputClass}
            />
          </FormField>
        ) : null}
        <FormField label="Origen">
          <ChoiceChips
            value={source}
            onChange={setSource}
            options={[
              { value: "phone", label: "Teléfono" },
              { value: "walkin", label: "Mostrador" },
            ]}
          />
        </FormField>
        <FormField label="Nota para el equipo" htmlFor="real-court-note">
          <textarea
            id="real-court-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={textareaClass}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

export function RealCourtBookingDrawer({
  bookingId,
  onClose,
}: {
  bookingId: string | null;
  onClose: () => void;
}) {
  const { data, pending, can, update, now } = usePro();
  const toast = useToast();
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
  const service = data.calendar?.services.find(
    (row) => row.id === booking?.serviceId,
  );
  const slots = useAgendaSlots({
    date,
    serviceId: booking?.serviceId,
    resourceIds:
      booking?.resourceIds ?? (booking?.resourceId ? [booking.resourceId] : []),
    partySize: booking?.partySize,
    duration: service?.duration_minutes ?? 0,
    enabled: Boolean(booking && mode === "move"),
  });
  if (!booking)
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );
  const resource = data.resources.find((row) => row.id === booking.resourceId);
  const customer = data.clients.find((row) => row.id === booking.clientId);
  const whatsapp = customerWhatsApp(
    customer?.phone,
    `Hola ${booking.clientName}, te escribimos de ${data.space.name} sobre tu reserva.`,
  );
  const due =
    booking.paidCents === null
      ? null
      : Math.max(0, booking.priceCents - booking.paidCents);
  const active = !["cancelled", "no_show", "done"].includes(booking.status);
  const canArriveNow = Date.parse(booking.start) <= now.getTime() + 2 * 3600000;
  const canAttendNow = Date.parse(booking.start) <= now.getTime() + 15 * 60000;
  const setStatus = async (status: BookingStatus) => {
    if (
      !(await update(`court.${status}`, (draft) => ({
        ...draft,
        bookings: draft.bookings.map((row) =>
          row.id === booking.id ? { ...row, status } : row,
        ),
      })))
    )
      return;
    toast.success("Reserva actualizada");
    if (!active || ["cancelled", "no_show", "done"].includes(status)) onClose();
  };
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
    if (
      !(await update("court.charge", (draft) => ({
        ...draft,
        payments: [...draft.payments, payment],
      })))
    )
      return;
    toast.success("Cobro registrado", `${money(due)} ya cobrados en el local.`);
    setMode("view");
  };
  const move = async () => {
    if (minute === null || !slots.minutes.includes(minute) || !service) return;
    if (
      !(await update("court.move", (draft) => ({
        ...draft,
        bookings: draft.bookings.map((row) =>
          row.id === booking.id
            ? {
                ...row,
                start: atLocal(date, minute),
                end: atLocal(date, minute + service.duration_minutes),
              }
            : row,
        ),
      })))
    )
      return;
    toast.success(
      booking.customerAccount ? "Cambio propuesto" : "Reserva movida",
    );
    setMode("view");
  };
  return (
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={resource?.name ?? "Reserva"}
      description={`${dayLabel(booking.start)} · ${time(booking.start)} a ${time(booking.end)}`}
      footer={
        mode === "payment" ? (
          <>
            <Button variant="ghost" onClick={() => setMode("view")}>
              Volver
            </Button>
            <Button
              variant="dark"
              disabled={
                pending || !can("court.charge") || due === null || due <= 0
              }
              onClick={charge}
            >
              Registrar cobro
            </Button>
          </>
        ) : mode === "move" ? (
          <>
            <Button variant="ghost" onClick={() => setMode("view")}>
              Volver
            </Button>
            <Button
              variant="dark"
              disabled={
                pending ||
                !can("court.move") ||
                minute === null ||
                !slots.minutes.includes(minute)
              }
              onClick={move}
            >
              {booking.customerAccount ? "Proponer cambio" : "Mover reserva"}
            </Button>
          </>
        ) : active ? (
          <>
            {booking.status === "requested" ? (
              <Button
                variant="dark"
                disabled={pending || !can("court.confirmed")}
                onClick={() => setStatus("confirmed")}
              >
                Confirmar
              </Button>
            ) : (
              <Button
                variant="dark"
                disabled={
                  pending ||
                  (booking.status === "confirmed"
                    ? !canArriveNow
                    : !canAttendNow) ||
                  !can(
                    booking.status === "confirmed"
                      ? "court.arrived"
                      : "court.done",
                  )
                }
                onClick={() =>
                  setStatus(booking.status === "confirmed" ? "arrived" : "done")
                }
              >
                {booking.status === "confirmed"
                  ? "Ha llegado"
                  : "Finalizar reserva"}
              </Button>
            )}
            {due !== null && due > 0 && can("court.charge") ? (
              <Button variant="outline" onClick={() => setMode("payment")}>
                Registrar cobro
              </Button>
            ) : null}
          </>
        ) : booking.status === "done" &&
          due !== null &&
          due > 0 &&
          can("court.charge") ? (
          <Button
            variant="dark"
            disabled={pending}
            onClick={() => setMode("payment")}
          >
            Registrar cobro
          </Button>
        ) : null
      }
    >
      {mode === "move" ? (
        <div className="flex flex-col gap-5">
          <FormField label="Día" htmlFor="court-move-date">
            <input
              id="court-move-date"
              type="date"
              value={date}
              min={localDate(now)}
              className={inputClass}
              onChange={(event) => {
                setDate(event.target.value);
                setMinute(null);
              }}
            />
          </FormField>
          <FormField label="Hora">
            <Hours {...slots} value={minute} onChange={setMinute} />
          </FormField>
          <p className="text-sm text-text-muted">
            La reserva mantiene su pista o espacio actual.
          </p>
        </div>
      ) : mode === "payment" ? (
        <div className="flex flex-col gap-5">
          <p className="font-heading text-3xl font-bold">
            {due !== null ? money(due) : "Sin importe disponible"}
          </p>
          <FormField label="Ya cobrado con">
            <ChoiceChips
              value={method}
              onChange={setMethod}
              options={[
                { value: "card", label: "Tarjeta" },
                { value: "cash", label: "Efectivo" },
                { value: "bizum", label: "Bizum" },
              ]}
            />
          </FormField>
          <p className="text-sm text-text-muted">
            Registra el importe que ya has cobrado en tu local.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="font-heading text-xl font-bold">{booking.clientName}</p>
          {booking.reschedule ? (
            <p
              role="status"
              className="rounded-xl border border-border p-3 text-sm"
            >
              Cambio propuesto al {dayLabel(booking.reschedule.start)} a las{" "}
              {time(booking.reschedule.start)}. La hora actual se conserva hasta
              que el cliente acepte.
            </p>
          ) : null}
          <div className="divide-y divide-border rounded-xl border border-border px-4">
            <Detail label="Servicio">{service?.name ?? "Reserva"}</Detail>
            <Detail label="Personas">{booking.partySize}</Detail>
            <Detail label="Precio">{money(booking.priceCents)}</Detail>
            {due !== null ? (
              <Detail label="Pendiente de registrar">{money(due)}</Detail>
            ) : null}
          </div>
          {booking.note ? (
            <section>
              <p className="eyebrow">Nota del equipo</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{booking.note}</p>
            </section>
          ) : null}
          {whatsapp ? (
            <a
              href={whatsapp}
              className="min-h-10 py-2 text-sm font-semibold text-violet"
            >
              Preparar WhatsApp
            </a>
          ) : null}
          {active ? (
            <div className="flex flex-wrap gap-2">
              {booking.status === "confirmed" ? (
                <Button
                  variant="outline"
                  disabled={pending || !can("court.move")}
                  onClick={() => setMode("move")}
                >
                  Mover reserva
                </Button>
              ) : null}
              <Button
                variant="ghost"
                disabled={pending || !can("court.cancelled")}
                onClick={() => setStatus("cancelled")}
              >
                Cancelar reserva
              </Button>
              {booking.status === "confirmed" ? (
                <Button
                  variant="ghost"
                  disabled={
                    pending ||
                    !can("court.no_show") ||
                    Date.parse(booking.start) > now.getTime()
                  }
                  onClick={() => setStatus("no_show")}
                >
                  No se presentó
                </Button>
              ) : null}
            </div>
          ) : (
            <Pill>
              {booking.status === "done"
                ? "Finalizada"
                : booking.status === "cancelled"
                  ? "Cancelada"
                  : "No se presentó"}
            </Pill>
          )}
        </div>
      )}
    </Drawer>
  );
}
