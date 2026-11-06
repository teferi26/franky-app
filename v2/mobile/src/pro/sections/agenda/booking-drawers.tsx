import React from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { BadgeCheck, CalendarClock, MessageCircle, UserRound } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProBooking, ProClient, ProPayment } from "../../../../../shared/pro/types";
import { dayLabel, durationLabel, localDate, localMinutes, minutesToLabel, money, relative, time } from "../../../../../shared/pro/format";
import { isoFor, staffForService } from "../../../../../shared/pro/agenda";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import { localId, usePro } from "../../store";
import { sectionHref } from "../../shell";
import { ChoiceGrid, DayChips, Detail, Field, Input, PAvatar, PButton, PText, Pill, Sheet, StatusPill, Toggle, tone } from "../../kit";
import { useAgendaSlots } from "./use-agenda-slots";

const SOURCE_LABEL: Record<ProBooking["source"], string> = {
  franky: "Reserva en Franky",
  hueco: "Hueco relámpago",
  card: "Franky Card",
  instagram: "Instagram",
  phone: "Teléfono",
  walkin: "Sin cita",
  google: "Google",
  grupo: "Grupo",
  unknown: "Sin indicar",
};

export function sourceLabel(source: ProBooking["source"]) {
  return SOURCE_LABEL[source];
}

export function isFromFranky(source: ProBooking["source"]) {
  return source === "franky" || source === "hueco" || source === "card" || source === "grupo";
}

export function shortUni(name: string) {
  if (name.includes("Alicante")) return "UA";
  if (name.includes("Miguel Hernández")) return "UMH";
  if (name.includes("CEU")) return "CEU";
  return name;
}

const METHOD_LABEL: Record<ProPayment["method"], string> = { card: "tarjeta", cash: "efectivo", bizum: "Bizum" };

/* ------------------------------------------------------------------ */
/* Piezas compartidas de los formularios                                */
/* ------------------------------------------------------------------ */

/** Rejilla de horas en cuatro columnas. */
function TimeGrid({ options, value, onChange, max }: { options: number[]; value: number | null; onChange: (m: number) => void; max?: number }) {
  const grid = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
      {options.map((m) => {
        const on = value === m;
        return (
          <Tap
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`A las ${minutesToLabel(m)}`}
            style={{ width: "22.5%", minHeight: 44, borderRadius: R.md, borderWidth: 1, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.accentSoft : C.surface, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: on ? C.blueDeep : C.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.3}>
              {minutesToLabel(m)}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
  if (!max) return grid;
  return (
    <ScrollView style={{ maxHeight: max }} nestedScrollEnabled showsVerticalScrollIndicator>
      {grid}
    </ScrollView>
  );
}

function SoftBox({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[{ borderRadius: R.lg, backgroundColor: C.input, padding: S.lg, gap: 4 }, style]}>{children}</View>;
}

function LinkButton({ label, icon: Icon, onPress, danger, disabled }: { label: string; icon?: typeof UserRound; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const color = danger ? C.errorText : C.blue;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start", opacity: disabled ? 0.45 : 1 }}
    >
      {Icon ? <Icon size={16} color={color} strokeWidth={2} /> : null}
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color }} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Tap>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de una cita                                                 */
/* ------------------------------------------------------------------ */

export function BookingDrawer({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { data, update, spaceId, pending, can, demo, now } = usePro();
  const router = useRouter();
  const booking = data.bookings.find((b) => b.id === bookingId) ?? null;
  const [mode, setMode] = React.useState<"view" | "charge" | "move">("view");
  const [method, setMethod] = React.useState<ProPayment["method"]>("card");
  const [tip, setTip] = React.useState("0");
  const [moveDate, setMoveDate] = React.useState("");
  const [moveStaff, setMoveStaff] = React.useState("");
  const [moveMinute, setMoveMinute] = React.useState<number | null>(null);

  React.useEffect(() => {
    setMode("view");
    setTip("0");
    setMethod("card");
    if (booking) {
      setMoveDate(localDate(booking.start));
      setMoveStaff(booking.staffId ?? "");
      setMoveMinute(localMinutes(booking.start));
    }
    // Solo al cambiar de cita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (!booking) return null;

  const service = data.services.find((s) => s.id === booking.serviceId);
  const staff = data.staff.find((s) => s.id === booking.staffId);
  const client = data.clients.find((c) => c.id === booking.clientId);
  const whatsapp = customerWhatsApp(client?.phone, `Hola ${client?.name.split(" ")[0] ?? ""}, te escribimos de ${data.space.name}.`);
  const duration = (new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60000;
  const showFinance = demo || can("finance.read");
  const remainingCents = booking.paidCents === null ? null : Math.max(0, booking.priceCents - booking.paidCents);
  const tipCents = Math.round(Number(tip.replace(",", ".")) * 100) || 0;

  const setStatus = async (status: ProBooking["status"], message: string) => {
    if (
      !(await update(`booking.${status}`, (d) => ({
        ...d,
        bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, status } : b)),
        clients:
          status === "no_show" && booking.clientId
            ? d.clients.map((c) => (c.id === booking.clientId ? { ...c, noShows: c.noShows + 1 } : c))
            : d.clients,
      })))
    )
      return;
    toast(message, { kind: "success" });
    if (status === "cancelled" || status === "no_show") onClose();
  };

  const confirmCancel = () =>
    Alert.alert("Cancelar cita", `${booking.clientName}, ${dayLabel(booking.start)} a las ${time(booking.start)}.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Cancelar cita", style: "destructive", onPress: () => void setStatus("cancelled", "Cita cancelada") },
    ]);

  const charge = async () => {
    if (remainingCents === null || remainingCents <= 0) return;
    const at = new Date().toISOString();
    if (
      !(await update("booking.charge", (d) => ({
        ...d,
        bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, status: "done", paidCents: b.priceCents } : b)),
        payments: [
          ...d.payments,
          {
            id: localId("p"),
            at,
            bookingId: booking.id,
            clientName: booking.clientName,
            staffId: booking.staffId,
            concept: service?.name ?? "Servicio",
            amountCents: remainingCents,
            tipCents,
            method,
          },
        ],
        clients: booking.clientId
          ? d.clients.map((c) =>
              c.id === booking.clientId
                ? { ...c, visits: c.visits + 1, spentCents: c.spentCents === null ? null : c.spentCents + remainingCents, lastVisit: at }
                : c,
            )
          : d.clients,
      })))
    )
      return;
    toast("Cobro registrado", { kind: "success", body: `${money(remainingCents + tipCents)} ya cobrados con ${METHOD_LABEL[method]}` });
    onClose();
  };

  const move = async () => {
    if (moveMinute === null) return;
    if (
      !(await update("booking.move", (d) => ({
        ...d,
        bookings: d.bookings.map((b) =>
          b.id === booking.id
            ? { ...b, staffId: moveStaff || b.staffId, start: isoFor(moveDate, moveMinute), end: isoFor(moveDate, moveMinute + duration) }
            : b,
        ),
      })))
    )
      return;
    toast("Cambio de cita guardado", { kind: "success" });
    setMode("view");
  };

  const openClient = (id: string) => {
    onClose();
    router.replace(`${sectionHref(spaceId, "clientes")}?c=${id}` as never);
  };

  const footer = (() => {
    if (mode === "charge")
      return (
        <>
          <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
          <PButton
            label={`Registrar cobro${remainingCents !== null ? ` ${money(remainingCents + tipCents)}` : ""}`}
            onPress={() => void charge()}
            disabled={pending || !can("booking.charge") || remainingCents === null || remainingCents <= 0}
          />
        </>
      );
    if (mode === "move")
      return (
        <>
          <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
          <PButton
            label={booking.customerAccount ? "Proponer cambio" : "Mover cita"}
            onPress={() => void move()}
            disabled={pending || !can("booking.move") || moveMinute === null}
          />
        </>
      );
    switch (booking.status) {
      case "requested":
        return (
          <>
            <PButton label="Rechazar" variant="ghost" disabled={pending || !can("booking.cancelled")} onPress={() => void setStatus("cancelled", "Solicitud rechazada")} />
            <PButton label="Aceptar cita" disabled={pending || !can("booking.confirmed")} onPress={() => void setStatus("confirmed", "Cita confirmada")} />
          </>
        );
      case "confirmed":
        return (
          <>
            <PButton label="No vino" variant="ghost" disabled={pending || !can("booking.no_show")} onPress={() => void setStatus("no_show", "Marcada como no presentada")} />
            <PButton label="Mover" variant="outline" disabled={pending || !can("booking.move")} onPress={() => setMode("move")} />
            <PButton label="Ha llegado" disabled={pending || !can("booking.arrived")} onPress={() => void setStatus("arrived", "Ha llegado")} />
          </>
        );
      case "arrived":
        return (
          <>
            <PButton label="Empezar" variant="outline" disabled={pending || !can("booking.in_service")} onPress={() => void setStatus("in_service", "Atendiendo")} />
            <PButton label="Registrar cobro" disabled={pending || !can("booking.charge")} onPress={() => setMode("charge")} />
          </>
        );
      case "in_service":
        return <PButton label="Registrar cobro" disabled={pending || !can("booking.charge")} onPress={() => setMode("charge")} />;
      default:
        return undefined;
    }
  })();

  const t = tone(staff?.tone);

  return (
    <Sheet
      open={Boolean(booking)}
      onClose={onClose}
      title={service?.name ?? "Cita"}
      description={`${dayLabel(booking.start)} · ${time(booking.start)} a ${time(booking.end)}`}
      footer={footer}
    >
      {booking.reschedule ? (
        <View accessibilityRole="text" style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, paddingHorizontal: S.md, paddingVertical: S.sm }}>
          <PText v="small" color={C.text}>
            {`Cambio propuesto al ${dayLabel(booking.reschedule.start)} a las ${time(booking.reschedule.start)}. La cita mantiene su hora actual hasta que el cliente lo acepte.`}
          </PText>
        </View>
      ) : null}

      {mode === "charge" ? (
        <View style={{ gap: S.lg }}>
          <SoftBox>
            <PText v="small">{booking.clientName}</PText>
            <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.8, color: C.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.2}>
              {remainingCents !== null ? money(remainingCents) : "Sin importe disponible"}
            </Text>
            {booking.student && service?.studentPriceCents === booking.priceCents ? <PText v="tiny">Precio estudiante aplicado</PText> : null}
          </SoftBox>
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
          <Field label="Propina">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, alignItems: "center" }}>
              {["0", "1", "2", "5"].map((v) => {
                const on = tip === v;
                return (
                  <Tap
                    key={v}
                    onPress={() => setTip(v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{ minHeight: 44, minWidth: 56, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 1, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.accentSoft : C.surface, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: on ? C.blueDeep : C.text }} maxFontSizeMultiplier={1.3}>
                      {v === "0" ? "Sin propina" : `${v} €`}
                    </Text>
                  </Tap>
                );
              })}
              <Input value={tip} onChangeText={setTip} keyboardType="decimal-pad" label="Otra propina" style={{ width: 90 }} />
            </View>
          </Field>
          <PText v="tiny">Registra aquí el importe que ya has cobrado en tu local.</PText>
        </View>
      ) : mode === "move" ? (
        <MoveForm
          booking={booking}
          duration={duration}
          today={localDate(now)}
          date={moveDate}
          setDate={setMoveDate}
          staffId={moveStaff}
          setStaffId={setMoveStaff}
          minute={moveMinute}
          setMinute={setMoveMinute}
        />
      ) : (
        <View style={{ gap: S.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
            <PAvatar name={booking.clientName} toneKey={staff?.tone ?? "slate"} size={52} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontFamily: FONT.heading, fontSize: 19, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {booking.clientName}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                <StatusPill status={booking.status} />
                {client?.student ? (
                  <Pill tone={client.student.verified ? "violet" : "neutral"} icon={client.student.verified ? BadgeCheck : undefined} label={shortUni(client.student.university)} />
                ) : null}
                {isFromFranky(booking.source) ? <Pill tone="success" label="Vino por Franky" /> : null}
              </View>
            </View>
          </View>

          <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg }}>
            <Detail
              label="Profesional"
              value={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.bar }} />
                  <PText v="h3" numberOfLines={1}>{staff?.name ?? "Sin asignar"}</PText>
                </View>
              }
            />
            <Detail label="Duración" value={durationLabel(duration)} />
            <Detail label="Precio" value={money(booking.priceCents)} />
            <Detail label="Origen" value={SOURCE_LABEL[booking.source]} last />
          </View>

          {booking.note ? (
            <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, gap: S.sm }}>
              <PText v="label">Nota de la cita</PText>
              <PText v="small" color={C.text}>{booking.note}</PText>
            </View>
          ) : null}

          {client ? (
            <SoftBox>
              <PText v="label">Ficha</PText>
              <PText v="body" style={{ marginTop: 2 }}>
                {`${client.visits} visitas${showFinance && client.spentCents !== null ? ` · ${money(client.spentCents, { round: true })} en total` : ""}${client.lastVisit ? ` · última ${relative(client.lastVisit, now.getTime())}` : ""}`}
              </PText>
              {client.noShows ? (
                <PText v="small" color={C.errorText}>{`No se presentó ${client.noShows} ${client.noShows === 1 ? "vez" : "veces"}`}</PText>
              ) : null}
              <PText v="small" style={{ marginTop: 4 }}>{client.technical ?? "Sin notas técnicas todavía."}</PText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: S.lg }}>
                <LinkButton label="Abrir ficha" icon={UserRound} onPress={() => openClient(client.id)} />
                {whatsapp ? <LinkButton label="WhatsApp" icon={MessageCircle} onPress={() => void Linking.openURL(whatsapp)} /> : null}
              </View>
            </SoftBox>
          ) : null}

          {booking.status !== "cancelled" && booking.status !== "done" && booking.status !== "no_show" ? (
            <LinkButton label="Cancelar cita" danger disabled={pending || !can("booking.cancelled")} onPress={confirmCancel} />
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

function MoveForm({
  booking,
  duration,
  today,
  date,
  setDate,
  staffId,
  setStaffId,
  minute,
  setMinute,
}: {
  booking: ProBooking;
  duration: number;
  today: string;
  date: string;
  setDate: (v: string) => void;
  staffId: string;
  setStaffId: (v: string) => void;
  minute: number | null;
  setMinute: (v: number | null) => void;
}) {
  const { data, demo } = usePro();
  const service = data.services.find((s) => s.id === booking.serviceId);
  const slots = useAgendaSlots({ date, serviceId: service?.id, staffId, duration, ignoreBookingId: booking.id });
  const options = slots.minutes;
  return (
    <View style={{ gap: S.lg }}>
      <Field label="Día">
        <DayChips
          value={date}
          today={today}
          onChange={(v) => {
            setDate(v);
            setMinute(null);
          }}
        />
      </Field>
      <Field label="Profesional">
        <ChoiceGrid
          value={staffId}
          onChange={(v) => {
            setStaffId(v);
            setMinute(null);
          }}
          options={staffForService(data, service)
            .filter((s) => demo || s.id === booking.staffId)
            .map((s) => ({ value: s.id, label: s.name.split(" ")[0] }))}
        />
      </Field>
      <Field label="Hora">
        {options.length ? (
          <TimeGrid options={options} value={minute} onChange={setMinute} />
        ) : (
          <PText v="small" style={{ paddingVertical: S.sm }}>
            {slots.loading ? "Comprobando huecos..." : slots.error ?? "No hay huecos ese día para esta persona."}
          </PText>
        )}
      </Field>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Nueva cita                                                          */
/* ------------------------------------------------------------------ */

export type NewBookingPreset = { date: string; staffId?: string; minute?: number } | null;

export function NewBookingDrawer({ preset, onClose }: { preset: NewBookingPreset; onClose: () => void }) {
  const { data, update, now, pending, can } = usePro();
  const today = localDate(now);
  const [query, setQuery] = React.useState("");
  const [clientId, setClientId] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState("");
  const [serviceId, setServiceId] = React.useState<string>("");
  const [staffId, setStaffId] = React.useState<string>("");
  const [date, setDate] = React.useState(today);
  const [minute, setMinute] = React.useState<number | null>(null);
  const [student, setStudent] = React.useState(false);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!preset) return;
    setQuery("");
    setClientId(null);
    setPhone("");
    setNote("");
    setDate(preset.date);
    const firstService = data.services.find((s) => !preset.staffId || s.staffIds.includes(preset.staffId));
    setServiceId(firstService?.id ?? "");
    setStaffId(preset.staffId ?? firstService?.staffIds[0] ?? "");
    setMinute(preset.minute ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const service = data.services.find((s) => s.id === serviceId);
  const client = data.clients.find((c) => c.id === clientId) ?? null;
  const matches: ProClient[] =
    query.trim().length >= 2 && !client
      ? data.clients.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
      : [];
  const slots = useAgendaSlots({
    date,
    serviceId: service?.id,
    staffId,
    duration: service?.durationMin ?? 0,
    fromMinute: date === today ? localMinutes(now) : 0,
    enabled: Boolean(preset),
  });
  const times = slots.minutes;
  const minuteValid = minute !== null && times.includes(minute);
  const canStudent = Boolean(client?.student?.verified && service?.studentPriceCents);
  const price = service ? (student && canStudent ? service.studentPriceCents! : service.priceCents) : 0;
  const name = client?.name ?? query.trim();

  React.useEffect(() => {
    setStudent(Boolean(client?.student?.verified));
  }, [client]);

  const save = async () => {
    if (!service || !staffId || minute === null || !name) return;
    let newClientId = client?.id;
    if (
      !(await update("booking.create", (d) => {
        let clients = d.clients;
        if (!newClientId) {
          newClientId = localId("c");
          clients = [
            {
              id: newClientId,
              name,
              phone: phone || undefined,
              tags: [],
              visits: 0,
              spentCents: 0,
              noShows: 0,
              source: "phone",
              marketingConsent: false,
              cardMember: false,
              createdAt: new Date().toISOString(),
            },
            ...clients,
          ];
        }
        return {
          ...d,
          clients,
          bookings: [
            ...d.bookings,
            {
              id: localId("b"),
              kind: "appointment",
              clientId: newClientId,
              clientName: name,
              staffId,
              serviceId: service.id,
              start: isoFor(date, minute),
              end: isoFor(date, minute + service.durationMin),
              partySize: 1,
              status: "confirmed",
              priceCents: price,
              paidCents: 0,
              source: "phone",
              note: note || undefined,
              student: Boolean(client?.student?.verified),
            },
          ],
        };
      }))
    )
      return;
    toast("Cita guardada", { kind: "success", body: `${name} · ${service.name} · ${minutesToLabel(minute)}` });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title="Nueva cita"
      description="El cliente no necesita tener Franky."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar cita" onPress={() => void save()} disabled={pending || !can("booking.create") || !service || !staffId || !minuteValid || !name} />
        </>
      }
    >
      <Field label="Cliente">
        {client ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: S.sm }}>
            <PAvatar name={client.name} size={32} />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>{client.name}</PText>
              <PText v="tiny" numberOfLines={1}>{`${client.visits} visitas${client.student ? ` · ${shortUni(client.student.university)}` : ""}`}</PText>
            </View>
            <Tap
              onPress={() => {
                setClientId(null);
                setQuery("");
              }}
              accessibilityRole="button"
              accessibilityLabel="Cambiar cliente"
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: S.sm }}
            >
              <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: C.blue }} maxFontSizeMultiplier={1.3}>Cambiar</Text>
            </Tap>
          </View>
        ) : (
          <View style={{ gap: S.sm }}>
            <Input value={query} onChangeText={setQuery} placeholder="Nombre del cliente" autoComplete="off" autoCorrect={false} label="Nombre del cliente" />
            {matches.length ? (
              <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: "hidden" }}>
                {matches.map((c, i) => (
                  <Tap
                    key={c.id}
                    onPress={() => setClientId(c.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.name}, ${c.visits} visitas`}
                    style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 48, paddingHorizontal: S.md, borderTopWidth: i ? 1 : 0, borderTopColor: C.borderLight }}
                  >
                    <PAvatar name={c.name} size={26} />
                    <PText v="body" numberOfLines={1} style={{ flex: 1 }}>{c.name}</PText>
                    <PText v="tiny">{`${c.visits} visitas`}</PText>
                  </Tap>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </Field>
      {!client && query.trim().length >= 2 ? (
        <Field label="Teléfono" hint="Para recordarle la cita. Opcional.">
          <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="600 000 000" label="Teléfono" />
        </Field>
      ) : null}

      <Field label="Servicio">
        <View style={{ gap: S.sm }}>
          {data.services.map((s) => {
            const on = serviceId === s.id;
            return (
              <Tap
                key={s.id}
                onPress={() => {
                  setServiceId(s.id);
                  if (!s.staffIds.includes(staffId)) setStaffId(s.staffIds[0] ?? "");
                  setMinute(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${s.name}, ${durationLabel(s.durationMin)}, ${money(s.priceCents)}`}
                style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 52, paddingHorizontal: S.md, paddingVertical: S.sm, borderRadius: R.md, borderWidth: 1, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.accentSoft : C.surface }}
              >
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1} color={on ? C.blueDeep : C.text}>{s.name}</PText>
                  <PText v="tiny">{durationLabel(s.durationMin)}</PText>
                </View>
                <PText v="h3" style={{ fontVariant: ["tabular-nums"] }}>{money(s.priceCents)}</PText>
              </Tap>
            );
          })}
        </View>
      </Field>

      <Field label="Profesional">
        <ChoiceGrid
          value={staffId}
          onChange={(v) => {
            setStaffId(v);
            setMinute(null);
          }}
          options={staffForService(data, service).map((s) => ({ value: s.id, label: s.name.split(" ")[0] }))}
        />
      </Field>

      <Field label="Día">
        <DayChips
          value={date}
          today={today}
          onChange={(v) => {
            setDate(v);
            setMinute(null);
          }}
        />
      </Field>

      <Field label="Hora" hint={service ? `Huecos libres de ${durationLabel(service.durationMin)}` : undefined}>
        {times.length ? (
          <TimeGrid options={times} value={minute} onChange={setMinute} max={204} />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.md, paddingVertical: S.md }}>
            <CalendarClock size={16} color={C.muted} />
            <PText v="small" style={{ flex: 1 }}>
              {slots.loading ? "Comprobando huecos..." : slots.error ?? "No quedan huecos ese día. Prueba otro día o profesional."}
            </PText>
          </View>
        )}
      </Field>

      {service ? (
        <SoftBox style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md }}>
          <View style={{ flex: 1 }}>
            <PText v="h3">{money(price)}</PText>
            {canStudent ? (
              <Toggle label={`Precio estudiante (${money(service.studentPriceCents!)})`} value={student} onChange={setStudent} />
            ) : null}
          </View>
          {minute !== null ? (
            <PText v="small" style={{ textAlign: "right" }}>{`${minutesToLabel(minute)} a ${minutesToLabel(minute + service.durationMin)}`}</PText>
          ) : null}
        </SoftBox>
      ) : null}

      <Field label="Nota">
        <Input value={note} onChangeText={setNote} multiline placeholder="Por ejemplo: quiere probar un degradado bajo" label="Nota" />
      </Field>
    </Sheet>
  );
}
