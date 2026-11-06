"use client";

import * as React from "react";
import { Check, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProBooking } from "@/lib/pro/types";
import {
  atLocal,
  dayLabel,
  localDate,
  minutesToLabel,
  money,
  time,
} from "@/lib/pro/format";
import { classCopy, freeSpots, sessionRoster } from "@/lib/pro/classes";
import { Avatar, Drawer, Empty, FormField, Pill, inputClass } from "../../kit";
import type { NewSessionPreset } from "./parts";

export function RealSessionDrawer({
  sessionId,
  onClose,
}: {
  sessionId: string | null;
  onClose: () => void;
}) {
  const { data, now, vertical, update, pending, can } = usePro();
  const toast = useToast();
  const [customerId, setCustomerId] = React.useState("");
  const [name, setName] = React.useState("");
  const [partySize, setPartySize] = React.useState(1);
  const [trial, setTrial] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  React.useEffect(() => {
    setCustomerId("");
    setName("");
    setPartySize(1);
    setTrial(false);
    setAdding(false);
    setConfirmCancel(false);
  }, [sessionId]);
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session)
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );
  const copy = classCopy(vertical.id);
  const service = data.calendar?.services.find(
    (item) => item.id === session.classTypeId,
  );
  const { booked, waitlist } = sessionRoster(data, session, now);
  const started = new Date(session.start).getTime() <= now.getTime();
  const closed = session.status === "cancelled";
  const customer = data.clients.find((item) => item.id === customerId);
  const canCancel =
    can("class.cancel") &&
    !pending &&
    !closed &&
    session.booked === 0 &&
    session.waitlist === 0;
  const rosterVisible = data.classOperations?.rosterVisible === true;
  const full = freeSpots(session) < partySize;
  const total = service
    ? service.price_cents * (service.price_basis === "person" ? partySize : 1)
    : null;

  const changeBooking = async (
    booking: ProBooking,
    label: string,
    status: ProBooking["status"],
    message: string,
  ) => {
    if (pending || !can(label)) return;
    if (
      await update(label, (draft) => ({
        ...draft,
        bookings: draft.bookings.map((row) =>
          row.id === booking.id ? { ...row, status } : row,
        ),
      }))
    ) {
      toast.success(message);
    }
  };
  const add = async () => {
    if (
      pending ||
      !can("class.add") ||
      !service ||
      total === null ||
      started ||
      closed ||
      !(customer?.name ?? name.trim())
    )
      return;
    const booking: ProBooking = {
      id: localId("class-booking"),
      kind: "class",
      clientId: customer?.id,
      clientName: customer?.name ?? name.trim(),
      serviceId: service.id,
      sessionId: session.id,
      staffId: session.coachId || undefined,
      resourceIds: session.resourceIds,
      start: session.start,
      end: session.end,
      partySize,
      status: full ? "requested" : "confirmed",
      priceCents: total,
      paidCents: null,
      source: "walkin",
      waitlisted: full,
      trial,
    };
    if (
      await update("class.add", (draft) => ({
        ...draft,
        bookings: [...draft.bookings, booking],
      }))
    ) {
      toast.success(
        "Reserva registrada",
        "La lista refleja el estado confirmado por el espacio.",
      );
      setAdding(false);
      setName("");
      setCustomerId("");
    }
  };
  const cancelSession = async () => {
    if (!canCancel) return;
    if (
      await update("class.cancel", (draft) => ({
        ...draft,
        sessions: draft.sessions.map((row) =>
          row.id === session.id ? { ...row, status: "cancelled" } : row,
        ),
      }))
    ) {
      toast.success("Sesión cancelada");
      onClose();
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={service?.name ?? "Sesión"}
      description={`${dayLabel(session.start)} · ${time(session.start)} a ${time(session.end)}${session.room ? ` · ${session.room}` : ""}`}
      wide
      footer={
        <>
          {can("class.cancel") ? (
            <Button
              variant="ghost"
              disabled={!canCancel}
              onClick={() => setConfirmCancel(true)}
            >
              Cancelar sesión
            </Button>
          ) : null}
          <Button
            variant="dark"
            disabled={
              pending || !can("class.add") || started || closed || !service
            }
            onClick={() => setAdding(!adding)}
          >
            <UserPlus className="h-4 w-4" /> Apuntar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          <Pill>
            {session.booked}/{session.capacity} plazas
          </Pill>
          {session.waitlist ? (
            <Pill tone="warning">{session.waitlist} en espera</Pill>
          ) : null}
          {closed ? <Pill>Cancelada</Pill> : null}
        </div>
        {confirmCancel ? (
          <div className="rounded-2xl border border-border p-4">
            <p className="font-semibold">Cancelar esta sesión vacía</p>
            <p className="mt-1 text-sm text-text-muted">
              Dejará de admitir reservas.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                Volver
              </Button>
              <Button
                variant="destructive"
                disabled={!canCancel}
                onClick={cancelSession}
              >
                Cancelar sesión
              </Button>
            </div>
          </div>
        ) : null}
        {can("class.cancel") && (session.booked > 0 || session.waitlist > 0) ? (
          <p className="text-sm text-text-muted">
            Para cancelar la sesión, resuelve primero sus reservas y su lista de
            espera.
          </p>
        ) : null}
        {!rosterVisible ? (
          <p className="text-sm text-text-muted">
            Tu acceso permite consultar las plazas. El listado de personas
            requiere acceso de gestión.
          </p>
        ) : (
          <>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Inscritos</h3>
              {booked.length ? (
                <ul className="divide-y divide-border-light rounded-2xl border border-border">
                  {booked.map((booking) => {
                    const attended = ["done", "arrived", "in_service"].includes(
                      booking.status,
                    );
                    return (
                      <li
                        key={booking.id}
                        className="flex flex-wrap items-center gap-2 p-3"
                      >
                        <Avatar name={booking.clientName} size="sm" />
                        <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
                          <p className="truncate text-sm font-semibold">
                            {booking.clientName}
                          </p>
                          <p className="text-xs text-text-muted">
                            {booking.partySize}{" "}
                            {booking.partySize === 1 ? "plaza" : "plazas"}
                            {booking.trial ? " · Prueba" : ""}
                          </p>
                        </div>
                        {attended ? (
                          <Pill tone="success">Asistencia registrada</Pill>
                        ) : booking.status === "no_show" ? (
                          <Pill>No vino</Pill>
                        ) : (
                          <>
                            {booking.status === "requested" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={
                                  pending || !can("class.confirm") || closed
                                }
                                onClick={() =>
                                  changeBooking(
                                    booking,
                                    "class.confirm",
                                    "confirmed",
                                    "Reserva confirmada",
                                  )
                                }
                              >
                                Confirmar
                              </Button>
                            ) : null}
                            {started && booking.status === "confirmed" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={
                                    pending || !can("class.checkin") || closed
                                  }
                                  onClick={() =>
                                    changeBooking(
                                      booking,
                                      "class.checkin",
                                      "done",
                                      "Asistencia registrada",
                                    )
                                  }
                                >
                                  <Check className="h-4 w-4" /> Asistió
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={
                                    pending || !can("class.no_show") || closed
                                  }
                                  onClick={() =>
                                    changeBooking(
                                      booking,
                                      "class.no_show",
                                      "no_show",
                                      "Ausencia registrada",
                                    )
                                  }
                                >
                                  No vino
                                </Button>
                              </>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={
                                pending || !can("class.remove") || closed
                              }
                              aria-label={`Cancelar reserva de ${booking.clientName}`}
                              onClick={() =>
                                changeBooking(
                                  booking,
                                  "class.remove",
                                  "cancelled",
                                  "Reserva cancelada",
                                )
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty
                  icon={UserPlus}
                  title="Sin personas inscritas"
                  body="Las reservas confirmadas aparecerán aquí."
                />
              )}
            </section>
            {waitlist.length ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">En espera</h3>
                <ul className="divide-y divide-border-light rounded-2xl border border-border">
                  {waitlist.map((booking) => (
                    <li
                      key={booking.id}
                      className="flex items-center gap-3 p-3"
                    >
                      <span className="min-w-0 flex-1 text-sm font-semibold">
                        {booking.clientName}
                      </span>
                      <Pill tone="warning">{booking.partySize} plazas</Pill>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending || !can("class.remove")}
                        onClick={() =>
                          changeBooking(
                            booking,
                            "class.remove",
                            "cancelled",
                            "Salida de la lista de espera registrada",
                          )
                        }
                      >
                        Quitar
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-text-muted">
                  Una plaza ofrecida requiere la aceptación de su titular.
                </p>
              </section>
            ) : null}
          </>
        )}
        {adding ? (
          <section className="flex flex-col gap-3 rounded-2xl bg-bg-secondary p-4">
            <h3 className="font-semibold">Apuntar a esta {copy.sessionOne}</h3>
            <FormField label="Persona" htmlFor="class-person">
              <select
                id="class-person"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                className={inputClass}
              >
                <option value="">Persona nueva</option>
                {data.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </FormField>
            {!customerId ? (
              <FormField label="Nombre" htmlFor="class-person-name">
                <input
                  id="class-person-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={inputClass}
                />
              </FormField>
            ) : null}
            <FormField label="Plazas" htmlFor="class-booking-size">
              <input
                id="class-booking-size"
                type="number"
                min={1}
                max={session.capacity}
                value={partySize}
                onChange={(event) =>
                  setPartySize(
                    Math.min(
                      session.capacity,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  )
                }
                className={inputClass}
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={trial}
                onChange={(event) => setTrial(event.target.checked)}
              />
              Clase de prueba
            </label>
            <p className="text-sm">
              {total === null
                ? "Servicio no disponible"
                : `Precio del servicio: ${money(total)}`}
              {full ? ". Sin plazas suficientes: quedará en espera." : ""}
            </p>
            <Button
              variant="dark"
              disabled={
                pending ||
                !can("class.add") ||
                total === null ||
                !(customer?.name ?? name.trim())
              }
              onClick={add}
            >
              Guardar reserva
            </Button>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

export function RealNewSessionDrawer({
  preset,
  onClose,
}: {
  preset: NewSessionPreset;
  onClose: () => void;
}) {
  const { data, update, pending, can, now } = usePro();
  const toast = useToast();
  const [serviceId, setServiceId] = React.useState("");
  const [date, setDate] = React.useState(localDate(now));
  const [minute, setMinute] = React.useState(18 * 60);
  const [capacity, setCapacity] = React.useState(1);
  const [extraResources, setExtraResources] = React.useState<string[]>([]);
  const [repeatWeeks, setRepeatWeeks] = React.useState<1 | 4 | 8>(1);
  const services =
    data.calendar?.services.filter(
      (service) => service.active && service.mode === "session",
    ) ?? [];
  const resources =
    data.classOperations?.resources.filter((resource) => resource.active) ?? [];
  React.useEffect(() => {
    if (!preset) return;
    const service =
      data.calendar?.services.find(
        (row) =>
          row.id === preset.typeId && row.active && row.mode === "session",
      ) ??
      data.calendar?.services.find(
        (row) => row.active && row.mode === "session",
      );
    setServiceId(service?.id ?? "");
    setCapacity(service?.capacity ?? 1);
    setDate(preset.date);
    setMinute(preset.minute ?? 18 * 60);
    setExtraResources([]);
    setRepeatWeeks(1);
  }, [preset, data.calendar?.services]);
  const service = services.find((row) => row.id === serviceId);
  const resourceIds = [
    ...new Set([...(service?.required_resource_ids ?? []), ...extraResources]),
  ];
  const hasStaff = resources.some(
    (resource) =>
      resource.kind === "staff" && resourceIds.includes(resource.id),
  );
  const valid = Boolean(
    service &&
    capacity > 0 &&
    (!service.staff_required || hasStaff) &&
    new Date(atLocal(date, minute)).getTime() > now.getTime(),
  );
  const save = async () => {
    if (!valid || !service || pending || !can("class.session.create")) return;
    const startsAt = atLocal(date, minute);
    if (
      await update("class.session.create", (draft) => draft, {
        type: "class.session.create",
        classTypeId: service.id,
        startsAt,
        resourceIds,
        capacity,
        repeatWeeks,
      })
    ) {
      toast.success(
        repeatWeeks === 1 ? "Sesión creada" : `${repeatWeeks} sesiones creadas`,
      );
      onClose();
    }
  };
  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(open) => !open && onClose()}
      title="Nueva sesión"
      description="Elige un servicio y los recursos que se ocuparán."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            disabled={pending || !valid || !can("class.session.create")}
            onClick={save}
          >
            Guardar sesión
          </Button>
        </>
      }
    >
      {!services.length ? (
        <Empty
          title="Añade primero un servicio de clases"
          body="Las sesiones necesitan un servicio con duración, plazas y precio guardados."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <FormField label="Servicio" htmlFor="class-service">
            <select
              id="class-service"
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setCapacity(
                  services.find((row) => row.id === event.target.value)
                    ?.capacity ?? 1,
                );
                setExtraResources([]);
              }}
              className={inputClass}
            >
              {services.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Día" htmlFor="class-date">
              <input
                id="class-date"
                type="date"
                value={date}
                min={localDate(now)}
                onChange={(event) => setDate(event.target.value)}
                className={inputClass}
              />
            </FormField>
            <FormField label="Hora" htmlFor="class-time">
              <input
                id="class-time"
                type="time"
                value={minutesToLabel(minute)}
                step={900}
                onChange={(event) => {
                  const [hour, minutes] = event.target.value
                    .split(":")
                    .map(Number);
                  if (Number.isFinite(hour + minutes))
                    setMinute(hour * 60 + minutes);
                }}
                className={inputClass}
              />
            </FormField>
          </div>
          <FormField label="Plazas" htmlFor="class-session-capacity">
            <input
              id="class-session-capacity"
              type="number"
              min={1}
              max={500}
              value={capacity}
              onChange={(event) =>
                setCapacity(
                  Math.max(1, Math.min(500, Number(event.target.value) || 1)),
                )
              }
              className={inputClass}
            />
          </FormField>
          <FormField label="Repetir" htmlFor="class-repeat">
            <select
              id="class-repeat"
              value={repeatWeeks}
              onChange={(event) =>
                setRepeatWeeks(
                  event.target.value === "8"
                    ? 8
                    : event.target.value === "4"
                      ? 4
                      : 1,
                )
              }
              className={inputClass}
            >
              <option value={1}>Sólo esta sesión</option>
              <option value={4}>Cada semana durante 4 semanas</option>
              <option value={8}>Cada semana durante 8 semanas</option>
            </select>
          </FormField>
          <FormField label="Profesionales y espacios">
            <div className="flex flex-col gap-2">
              {resources.map((resource) => (
                <label
                  key={resource.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={resourceIds.includes(resource.id)}
                    disabled={service?.required_resource_ids.includes(
                      resource.id,
                    )}
                    onChange={(event) =>
                      setExtraResources((current) =>
                        event.target.checked
                          ? [...current, resource.id]
                          : current.filter((id) => id !== resource.id),
                      )
                    }
                  />
                  {resource.name}
                </label>
              ))}
            </div>
          </FormField>
          {service ? (
            <p className="text-sm text-text-muted">
              Duración: {service.duration_minutes} min ·{" "}
              {money(service.price_cents)}
              {service.price_basis === "person"
                ? " por persona"
                : " por reserva"}
            </p>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
