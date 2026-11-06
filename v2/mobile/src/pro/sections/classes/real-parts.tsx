import React from "react";
import { Alert, View } from "react-native";
import { Check, UserPlus, X } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { ProBooking } from "../../../../../shared/pro/types";
import { atLocal, dayLabel, localDate, money, time } from "../../../../../shared/pro/format";
import { classCopy, freeSpots, sessionRoster } from "../../../../../shared/pro/classes";
import { localId, usePro } from "../../store";
import {
  ChoiceGrid,
  DayChips,
  Empty,
  Field,
  Input,
  PAvatar,
  PButton,
  Pill,
  PText,
  SearchInput,
  Sheet,
  Stepper,
  TimeStepper,
  Toggle,
} from "../../kit";
import type { NewSessionPreset } from "./parts";
import { CheckRow } from "./ui";

/** A partir de cuántas personas el selector de cliente muestra buscador. */
const PICKER_SEARCH_FROM = 8;
const PICKER_LIMIT = 20;

export function RealSessionDrawer({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { data, now, vertical, update, pending, can } = usePro();
  const [customerId, setCustomerId] = React.useState("");
  const [name, setName] = React.useState("");
  const [partySize, setPartySize] = React.useState(1);
  const [trial, setTrial] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [personQuery, setPersonQuery] = React.useState("");
  React.useEffect(() => {
    setCustomerId("");
    setName("");
    setPartySize(1);
    setTrial(false);
    setAdding(false);
    setPersonQuery("");
  }, [sessionId]);
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session) return null;
  const copy = classCopy(vertical.id);
  const service = data.calendar?.services.find((item) => item.id === session.classTypeId);
  const { booked, waitlist } = sessionRoster(data, session, now);
  const started = new Date(session.start).getTime() <= now.getTime();
  const closed = session.status === "cancelled";
  const customer = data.clients.find((item) => item.id === customerId);
  const canCancel = can("class.cancel") && !pending && !closed && session.booked === 0 && session.waitlist === 0;
  const rosterVisible = data.classOperations?.rosterVisible === true;
  const full = freeSpots(session) < partySize;
  const total = service ? service.price_cents * (service.price_basis === "person" ? partySize : 1) : null;

  const changeBooking = async (booking: ProBooking, label: string, status: ProBooking["status"], message: string) => {
    if (pending || !can(label)) return;
    if (
      await update(label, (draft) => ({
        ...draft,
        bookings: draft.bookings.map((row) => (row.id === booking.id ? { ...row, status } : row)),
      }))
    ) {
      toast(message, { kind: "success" });
    }
  };
  const add = async () => {
    if (pending || !can("class.add") || !service || total === null || started || closed || !(customer?.name ?? name.trim())) return;
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
    if (await update("class.add", (draft) => ({ ...draft, bookings: [...draft.bookings, booking] }))) {
      toast("Reserva registrada", { kind: "success", body: "La lista refleja el estado confirmado por el espacio." });
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
        sessions: draft.sessions.map((row) => (row.id === session.id ? { ...row, status: "cancelled" } : row)),
      }))
    ) {
      toast("Sesión cancelada", { kind: "success" });
      onClose();
    }
  };
  const confirmCancel = () =>
    Alert.alert("Cancelar esta sesión vacía", "Dejará de admitir reservas.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cancelar sesión", style: "destructive", onPress: () => void cancelSession() },
    ]);

  // El <select> de la web: "Persona nueva" y la lista de clientes, con buscador si es larga.
  const pq = personQuery.trim().toLocaleLowerCase("es");
  const people = data.clients.filter((client) => !pq || client.name.toLocaleLowerCase("es").includes(pq));
  const shownPeople = people.slice(0, PICKER_LIMIT);
  if (customer && !shownPeople.some((client) => client.id === customer.id)) shownPeople.unshift(customer);

  return (
    <Sheet
      open
      onClose={onClose}
      title={service?.name ?? "Sesión"}
      description={`${dayLabel(session.start)} · ${time(session.start)} a ${time(session.end)}${session.room ? ` · ${session.room}` : ""}`}
      footer={
        <>
          {can("class.cancel") ? <PButton label="Cancelar sesión" variant="ghost" disabled={!canCancel} onPress={confirmCancel} /> : null}
          <PButton
            label="Apuntar"
            icon={UserPlus}
            disabled={pending || !can("class.add") || started || closed || !service}
            onPress={() => setAdding(!adding)}
          />
        </>
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        <Pill label={`${session.booked}/${session.capacity} plazas`} />
        {session.waitlist ? <Pill label={`${session.waitlist} en espera`} tone="warning" /> : null}
        {closed ? <Pill label="Cancelada" /> : null}
      </View>
      {can("class.cancel") && (session.booked > 0 || session.waitlist > 0) ? (
        <PText v="small">Para cancelar la sesión, resuelve primero sus reservas y su lista de espera.</PText>
      ) : null}
      {!rosterVisible ? (
        <PText v="small">Tu acceso permite consultar las plazas. El listado de personas requiere acceso de gestión.</PText>
      ) : (
        <>
          <View style={{ gap: S.sm }}>
            <PText v="h3">Inscritos</PText>
            {booked.length ? (
              <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
                {booked.map((booking, i) => {
                  const attended = ["done", "arrived", "in_service"].includes(booking.status);
                  return (
                    <View
                      key={booking.id}
                      style={{ padding: S.md, gap: S.sm, borderBottomWidth: i === booked.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                        <PAvatar name={booking.clientName} size={32} />
                        <View style={{ flex: 1 }}>
                          <PText v="h3" numberOfLines={1}>{booking.clientName}</PText>
                          <PText v="tiny">
                            {`${booking.partySize} ${booking.partySize === 1 ? "plaza" : "plazas"}${booking.trial ? " · Prueba" : ""}`}
                          </PText>
                        </View>
                        {attended ? (
                          <Pill label="Asistencia registrada" tone="success" />
                        ) : booking.status === "no_show" ? (
                          <Pill label="No vino" />
                        ) : (
                          <Tap
                            disabled={pending || !can("class.remove") || closed}
                            onPress={() => void changeBooking(booking, "class.remove", "cancelled", "Reserva cancelada")}
                            accessibilityRole="button"
                            accessibilityLabel={`Cancelar reserva de ${booking.clientName}`}
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: R.md,
                              alignItems: "center",
                              justifyContent: "center",
                              opacity: pending || !can("class.remove") || closed ? 0.4 : 1,
                            }}
                          >
                            <X size={17} color={C.muted} />
                          </Tap>
                        )}
                      </View>
                      {!attended && booking.status !== "no_show" && (booking.status === "requested" || (started && booking.status === "confirmed")) ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                          {booking.status === "requested" ? (
                            <PButton
                              label="Confirmar"
                              small
                              variant="secondary"
                              disabled={pending || !can("class.confirm") || closed}
                              onPress={() => void changeBooking(booking, "class.confirm", "confirmed", "Reserva confirmada")}
                            />
                          ) : null}
                          {started && booking.status === "confirmed" ? (
                            <>
                              <PButton
                                label="Asistió"
                                icon={Check}
                                small
                                variant="secondary"
                                disabled={pending || !can("class.checkin") || closed}
                                onPress={() => void changeBooking(booking, "class.checkin", "done", "Asistencia registrada")}
                              />
                              <PButton
                                label="No vino"
                                small
                                variant="ghost"
                                disabled={pending || !can("class.no_show") || closed}
                                onPress={() => void changeBooking(booking, "class.no_show", "no_show", "Ausencia registrada")}
                              />
                            </>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Empty icon={UserPlus} title="Sin personas inscritas" body="Las reservas confirmadas aparecerán aquí." />
            )}
          </View>
          {waitlist.length ? (
            <View style={{ gap: S.sm }}>
              <PText v="h3">En espera</PText>
              <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
                {waitlist.map((booking, i) => (
                  <View
                    key={booking.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: S.md, padding: S.md, borderBottomWidth: i === waitlist.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
                  >
                    <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>{booking.clientName}</PText>
                    <Pill label={`${booking.partySize} plazas`} tone="warning" />
                    <PButton
                      label="Quitar"
                      small
                      variant="ghost"
                      disabled={pending || !can("class.remove")}
                      onPress={() => void changeBooking(booking, "class.remove", "cancelled", "Salida de la lista de espera registrada")}
                    />
                  </View>
                ))}
              </View>
              <PText v="tiny">Una plaza ofrecida requiere la aceptación de su titular.</PText>
            </View>
          ) : null}
        </>
      )}
      {adding ? (
        <View style={{ gap: S.md, borderRadius: R.lg, backgroundColor: C.input, padding: S.md }}>
          <PText v="h3">{`Apuntar a esta ${copy.sessionOne}`}</PText>
          <Field label="Persona">
            {data.clients.length > PICKER_SEARCH_FROM ? <SearchInput value={personQuery} onChange={setPersonQuery} placeholder="Buscar persona" /> : null}
            <ChoiceGrid
              value={customerId}
              onChange={setCustomerId}
              options={[{ value: "", label: "Persona nueva" }, ...shownPeople.map((client) => ({ value: client.id, label: client.name }))]}
            />
          </Field>
          {!customerId ? (
            <Field label="Nombre">
              <Input value={name} onChangeText={setName} label="Nombre" autoCapitalize="words" />
            </Field>
          ) : null}
          <Field label="Plazas">
            <Stepper value={partySize} onChange={setPartySize} min={1} max={Math.max(1, session.capacity)} label="plazas" />
          </Field>
          <Toggle label="Clase de prueba" value={trial} onChange={setTrial} />
          <PText v="small" color={C.text}>
            {`${total === null ? "Servicio no disponible" : `Precio del servicio: ${money(total)}`}${full ? ". Sin plazas suficientes: quedará en espera." : ""}`}
          </PText>
          <PButton
            label="Guardar reserva"
            full
            disabled={pending || !can("class.add") || total === null || !(customer?.name ?? name.trim())}
            onPress={() => void add()}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

export function RealNewSessionDrawer({ preset, onClose }: { preset: NewSessionPreset; onClose: () => void }) {
  const { data, update, pending, can, now } = usePro();
  const today = localDate(now);
  const [serviceId, setServiceId] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [minute, setMinute] = React.useState(18 * 60);
  const [capacity, setCapacity] = React.useState(1);
  const [extraResources, setExtraResources] = React.useState<string[]>([]);
  const [repeatWeeks, setRepeatWeeks] = React.useState<1 | 4 | 8>(1);
  const services = data.calendar?.services.filter((service) => service.active && service.mode === "session") ?? [];
  const resources = data.classOperations?.resources.filter((resource) => resource.active) ?? [];
  React.useEffect(() => {
    if (!preset) return;
    const service =
      data.calendar?.services.find((row) => row.id === preset.typeId && row.active && row.mode === "session") ??
      data.calendar?.services.find((row) => row.active && row.mode === "session");
    setServiceId(service?.id ?? "");
    setCapacity(service?.capacity ?? 1);
    setDate(preset.date);
    setMinute(preset.minute ?? 18 * 60);
    setExtraResources([]);
    setRepeatWeeks(1);
  }, [preset, data.calendar?.services]);
  const service = services.find((row) => row.id === serviceId);
  const resourceIds = [...new Set([...(service?.required_resource_ids ?? []), ...extraResources])];
  const hasStaff = resources.some((resource) => resource.kind === "staff" && resourceIds.includes(resource.id));
  const valid = Boolean(
    service && capacity > 0 && (!service.staff_required || hasStaff) && new Date(atLocal(date, minute)).getTime() > now.getTime(),
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
      toast(repeatWeeks === 1 ? "Sesión creada" : `${repeatWeeks} sesiones creadas`, { kind: "success" });
      onClose();
    }
  };
  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title="Nueva sesión"
      description="Elige un servicio y los recursos que se ocuparán."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar sesión" disabled={pending || !valid || !can("class.session.create")} onPress={() => void save()} />
        </>
      }
    >
      {!services.length ? (
        <Empty title="Añade primero un servicio de clases" body="Las sesiones necesitan un servicio con duración, plazas y precio guardados." />
      ) : (
        <>
          <Field label="Servicio">
            <ChoiceGrid
              value={serviceId}
              onChange={(id) => {
                setServiceId(id);
                setCapacity(services.find((row) => row.id === id)?.capacity ?? 1);
                setExtraResources([]);
              }}
              options={services.map((row) => ({ value: row.id, label: row.name }))}
            />
          </Field>
          <Field label="Día">
            {/* Como el min de la web: los chips empiezan hoy y no ofrecen días pasados. */}
            <DayChips value={date} onChange={setDate} today={today} />
          </Field>
          <Field label="Hora">
            <TimeStepper value={minute} onChange={setMinute} label="hora de inicio" />
          </Field>
          <Field label="Plazas">
            <Stepper value={capacity} onChange={setCapacity} min={1} max={500} label="plazas" />
          </Field>
          <Field label="Repetir">
            <ChoiceGrid
              value={String(repeatWeeks) as "1" | "4" | "8"}
              onChange={(v) => setRepeatWeeks(v === "8" ? 8 : v === "4" ? 4 : 1)}
              options={[
                { value: "1", label: "Sólo esta sesión" },
                { value: "4", label: "Cada semana durante 4 semanas" },
                { value: "8", label: "Cada semana durante 8 semanas" },
              ]}
            />
          </Field>
          <Field label="Profesionales y espacios">
            <View>
              {resources.map((resource) => (
                <CheckRow
                  key={resource.id}
                  label={resource.name}
                  checked={resourceIds.includes(resource.id)}
                  disabled={service?.required_resource_ids.includes(resource.id)}
                  onChange={(checked) =>
                    setExtraResources((current) => (checked ? [...current, resource.id] : current.filter((id) => id !== resource.id)))
                  }
                />
              ))}
            </View>
          </Field>
          {service ? (
            <PText v="small">
              {`Duración: ${service.duration_minutes} min · ${money(service.price_cents)}${service.price_basis === "person" ? " por persona" : " por reserva"}`}
            </PText>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
