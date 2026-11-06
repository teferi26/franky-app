import React from "react";
import { Linking, Text, View } from "react-native";
import { AlertTriangle, ArrowRight, BadgeCheck, BellRing, Phone, Sparkles, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { Allergen, BookingStatus, ProBooking, ProClient, ProClientSource } from "../../../../../shared/pro/types";
import { addDays, dayLabel, localDate, localMinutes, minutesToLabel, money, plural, relative, time } from "../../../../../shared/pro/format";
import { frankyResults } from "../../../../../shared/pro/results";
import {
  ALLERGEN_BY_ID,
  CLEANING_MIN,
  TABLE_SOURCE,
  TURNS,
  currentTurn,
  freeTablesFor,
  fromFranky,
  hasAllergyNote,
  isWaitlist,
  isoAt,
  realTablesForService,
  stayMinutes,
  tableBookingsOn,
  tableName,
  tableServices,
  turnOf,
  turnSlots,
  type Turn,
} from "../../../../../shared/pro/tables";
import { localId, usePro } from "../../store";
import { useGoSection } from "../../shell";
import {
  ChoiceGrid,
  DarkBlock,
  DarkText,
  DayChips,
  Detail,
  Field,
  Input,
  PAvatar,
  PButton,
  PText,
  Panel,
  Pill,
  Segmented,
  Sheet,
  StatusPill,
  Stepper,
} from "../../kit";
import { PickButton, PickList, statusTone } from "./ui";
import { BookingExtras } from "./booking-extras";

/* ------------------------------------------------------------------ */
/* Piezas pequeñas                                                     */
/* ------------------------------------------------------------------ */

export const TABLE_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Por confirmar",
  confirmed: "Confirmada",
  arrived: "Sentada",
  in_service: "Sentada",
  done: "Se fue",
  no_show: "No vino",
  cancelled: "Cancelada",
};

export function TableStatus({ booking }: { booking: ProBooking }) {
  if (isWaitlist(booking)) return <Pill label="En espera" tone="warning" />;
  return <StatusPill status={booking.status} label={TABLE_STATUS_LABEL[booking.status]} />;
}

export function SourceTag({ source }: { source: ProClientSource }) {
  if (fromFranky(source)) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Sparkles size={11} color={C.blue} strokeWidth={1.9} />
        <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.blue }} maxFontSizeMultiplier={1.3}>
          {TABLE_SOURCE[source]}
        </Text>
      </View>
    );
  }
  return <PText v="tiny">{TABLE_SOURCE[source]}</PText>;
}

export function StudentMark({ university }: { university?: string }) {
  const short = university ? shortUni(university) : "Estudiante";
  return (
    <View
      accessible
      accessibilityLabel={university ? `Estudiante verificado, ${university}` : "Estudiante verificado"}
      style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
    >
      <BadgeCheck size={13} color={C.blue} strokeWidth={1.9} />
      <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.blueDeep }} maxFontSizeMultiplier={1.3}>
        {short}
      </Text>
    </View>
  );
}

export function shortUni(name: string): string {
  if (/Alicante/.test(name)) return "UA";
  if (/Miguel Hern/.test(name)) return "UMH";
  if (/CEU/.test(name)) return "CEU";
  return name;
}

/** Siglas de alérgenos: pequeñas, legibles y con su nombre para el lector. */
export function AllergenCodes({ list }: { list: Allergen[] }) {
  if (!list.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
      {list.map((a) => (
        <View
          key={a}
          accessible
          accessibilityLabel={ALLERGEN_BY_ID[a].label}
          style={{ minWidth: 26, height: 20, paddingHorizontal: 4, borderRadius: 6, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontFamily: FONT.heading, fontSize: 10, letterSpacing: 0.4, color: C.muted }} maxFontSizeMultiplier={1.2}>
            {ALLERGEN_BY_ID[a].code}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function NoteLine({ note }: { note?: string }) {
  if (!note) return null;
  const allergy = hasAllergyNote(note);
  const amber = statusTone("amber");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 }}>
      {allergy ? <AlertTriangle size={12} color={amber.fg} strokeWidth={2} /> : null}
      <Text
        style={{ flexShrink: 1, fontSize: 12, fontFamily: allergy ? FONT.semibold : undefined, color: allergy ? amber.fg : C.muted }}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {note}
      </Text>
    </View>
  );
}

export function StampDots({ value, max }: { value: number; max: number }) {
  return (
    <View accessible accessibilityLabel={`${value} de ${max} sellos`} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      {Array.from({ length: max }, (_, i) => (
        <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i < value ? C.blue : C.input }} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Acciones sobre reservas y mesas                                     */
/* ------------------------------------------------------------------ */

export function useTableActions() {
  const { data, update, now, vertical, demo, pending, can } = usePro();

  const patch = (id: string, fn: (b: ProBooking) => ProBooking, label: string) =>
    pending || !can(label)
      ? Promise.resolve(false)
      : update(label, (d) => ({ ...d, bookings: d.bookings.map((b) => (b.id === id ? fn(b) : b)) }));

  return {
    async confirm(b: ProBooking) {
      if (!(await patch(b.id, (x) => ({ ...x, status: "confirmed" }), "table.confirm"))) return false;
      toast("Reserva confirmada", { kind: "success" });
      return true;
    },
    async decline(b: ProBooking) {
      if (!(await patch(b.id, (x) => ({ ...x, status: "cancelled" }), "table.decline"))) return false;
      toast(isWaitlist(b) ? "Quitado de la lista de espera" : "Solicitud rechazada", { kind: "success" });
      return true;
    },
    async seat(b: ProBooking, tableId?: string) {
      const target = tableId ?? b.resourceId;
      if (!demo && (!target || target !== b.resourceId)) return false;
      const stay = stayMinutes(vertical.id, turnOf(localMinutes(now)));
      if (
        !(await patch(
          b.id,
          (x) =>
            isWaitlist(x)
              ? { ...x, status: "arrived", resourceId: target, start: now.toISOString(), end: new Date(now.getTime() + stay * 60000).toISOString() }
              : { ...x, status: "arrived", resourceId: target },
          "table.seat",
        ))
      )
        return false;
      toast("Mesa sentada", { kind: "success", body: `${b.clientName.split(" ")[0]} en ${tableName(data, target) ?? "sala"}.` });
      return true;
    },
    async leave(b: ProBooking) {
      if (
        !(await patch(
          b.id,
          (x) => (demo ? { ...x, status: "done", end: now.toISOString(), paidCents: x.priceCents } : { ...x, status: "done" }),
          "table.leave",
        ))
      )
        return false;
      toast("Salida registrada", { kind: "success", body: "Comprueba la mesa antes de marcarla lista." });
      return true;
    },
    async noShow(b: ProBooking) {
      if (pending || !can("table.no_show")) return false;
      if (
        !(await update("table.no_show", (d) => ({
          ...d,
          bookings: d.bookings.map((x) => (x.id === b.id ? { ...x, status: "no_show" } : x)),
          clients: demo && b.clientId ? d.clients.map((c) => (c.id === b.clientId ? { ...c, noShows: c.noShows + 1 } : c)) : d.clients,
        })))
      )
        return false;
      toast("Marcada como no presentada", { kind: "success", body: "Queda anotado en su ficha y la mesa se libera." });
      return true;
    },
    async clean(b: ProBooking) {
      if (
        !(await patch(
          b.id,
          (x) =>
            demo
              ? { ...x, end: new Date(now.getTime() - (CLEANING_MIN + 1) * 60000).toISOString() }
              : { ...x, tableOperation: x.tableOperation ? { ...x.tableOperation, cleanedAt: now.toISOString() } : undefined },
          "table.clean",
        ))
      )
        return false;
      toast("Mesa lista", { kind: "success", body: `Limpieza confirmada en ${tableName(data, b.resourceId) ?? "la mesa"}.` });
      return true;
    },
    async assign(b: ProBooking, tableId: string) {
      if (!demo || !(await patch(b.id, (x) => ({ ...x, resourceId: tableId }), "table.assign"))) return false;
      toast("Mesa cambiada", { kind: "success", body: `${b.clientName.split(" ")[0]} pasa a ${tableName(data, tableId)}.` });
      return true;
    },
    notify(b: ProBooking) {
      toast("Contacta con el cliente", { kind: "info", body: `Llama a ${b.clientName.split(" ")[0]} cuando su mesa esté lista.` });
    },
    async walkIn(tableId: string, party: number) {
      if (!demo || pending || !can("table.walkin")) return false;
      const stay = stayMinutes(vertical.id, turnOf(localMinutes(now)));
      const booking: ProBooking = {
        id: localId("rb"),
        kind: "table",
        clientName: "Sin reserva",
        resourceId: tableId,
        start: now.toISOString(),
        end: new Date(now.getTime() + stay * 60000).toISOString(),
        partySize: party,
        status: "arrived",
        priceCents: 0,
        paidCents: 0,
        source: "walkin",
      };
      if (!(await update("table.walkin", (d) => ({ ...d, bookings: [...d.bookings, booking] })))) return false;
      toast("Mesa sentada sin reserva", { kind: "success", body: `${plural(party, "persona", "personas")} en ${tableName(data, tableId)}.` });
      return true;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Detalle de una reserva                                              */
/* ------------------------------------------------------------------ */

export function ReservationDrawer({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const { data, now, vertical, demo, pending, can } = usePro();
  const actions = useTableActions();
  const booking = data.bookings.find((b) => b.id === bookingId) ?? null;
  const [pick, setPick] = React.useState<string | null>(null);

  React.useEffect(() => setPick(null), [bookingId]);

  if (!booking) return null;

  const waiting = isWaitlist(booking);
  const client: ProClient | undefined = data.clients.find((c) => c.id === booking.clientId);
  const date = localDate(booking.start);
  const start = waiting ? localMinutes(now) : localMinutes(booking.start);
  const duration = Math.round((new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60000);
  const options = freeTablesFor(data, waiting ? localDate(now) : date, start, duration, booking.partySize, booking.id).slice(0, 8);
  const chosen = pick ?? (waiting ? options[0]?.id : booking.resourceId) ?? null;
  const done = (fn: () => Promise<boolean | null>) => async () => {
    if (!(await fn())) return;
    onClose();
  };

  const footer = (() => {
    if (waiting)
      return (
        <>
          <PButton label="Quitar" variant="ghost" disabled={pending || !can("table.decline")} onPress={done(() => actions.decline(booking))} />
          <PButton label="Avisar" icon={BellRing} variant="outline" onPress={() => actions.notify(booking)} />
          <PButton
            label={`Sentar${chosen ? ` en ${tableName(data, chosen)}` : ""}`}
            disabled={pending || !can("table.seat") || !chosen}
            onPress={done(async () => (chosen ? actions.seat(booking, chosen) : false))}
          />
        </>
      );
    switch (booking.status) {
      case "requested":
        return (
          <>
            <PButton label="Rechazar" variant="ghost" disabled={pending || !can("table.decline")} onPress={done(() => actions.decline(booking))} />
            <PButton label="Confirmar reserva" disabled={pending || !can("table.confirm")} onPress={done(() => actions.confirm(booking))} />
          </>
        );
      case "confirmed":
        return (
          <>
            <PButton label="No vino" variant="ghost" disabled={pending || !can("table.no_show")} onPress={done(() => actions.noShow(booking))} />
            {demo && pick && pick !== booking.resourceId ? <PButton label="Cambiar mesa" variant="outline" onPress={() => void actions.assign(booking, pick)} /> : null}
            <PButton label="Sentar" disabled={pending || !can("table.seat")} onPress={done(() => actions.seat(booking, chosen ?? undefined))} />
          </>
        );
      case "arrived":
        return (
          <>
            {demo && pick && pick !== booking.resourceId ? <PButton label="Cambiar mesa" variant="outline" onPress={() => void actions.assign(booking, pick)} /> : null}
            <PButton label="Se fue" disabled={pending || !can("table.leave")} onPress={done(() => actions.leave(booking))} />
          </>
        );
      default:
        return undefined;
    }
  })();

  const turn = turnOf(localMinutes(booking.start));
  const canMove = waiting || booking.status === "confirmed" || booking.status === "arrived" || booking.status === "requested";
  const allergy = hasAllergyNote(booking.note);
  const amber = statusTone("amber");

  return (
    <Sheet
      open
      onClose={onClose}
      title={booking.clientName}
      description={
        waiting
          ? `En espera desde hace ${Math.max(1, Math.round((now.getTime() - new Date(booking.start).getTime()) / 60000))} min · ${plural(booking.partySize, "persona", "personas")}`
          : `${dayLabel(booking.start)} · ${TURNS[turn].label} a las ${time(booking.start)}`
      }
      footer={footer}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
        <PAvatar name={booking.clientName} size={48} toneKey={booking.student ? "violet" : "slate"} />
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.md, rowGap: 4 }}>
            <TableStatus booking={booking} />
            {booking.student || client?.student?.verified ? <StudentMark university={client?.student?.university} /> : null}
            <SourceTag source={booking.source} />
          </View>
          {client ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
              <PText v="small">
                {`${client.visits > 1 ? `${client.visits}.ª visita` : "Primera visita"}${client.noShows ? ` · no vino ${plural(client.noShows, "vez", "veces")}` : ""}`}
              </PText>
              {client.phone ? (
                <Tap
                  onPress={() => void Linking.openURL(`tel:${client.phone!.replace(/\s/g, "")}`)}
                  accessibilityRole="link"
                  accessibilityLabel={`Llamar a ${client.phone}`}
                  style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Phone size={14} color={C.text} strokeWidth={1.9} />
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: C.text }} maxFontSizeMultiplier={1.3}>
                    {client.phone}
                  </Text>
                </Tap>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {booking.note ? (
        <View style={{ borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: allergy ? amber.bg : C.input, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {allergy ? <AlertTriangle size={15} color={amber.fg} strokeWidth={1.9} /> : null}
            <PText v="h3" color={allergy ? amber.fg : C.text}>{allergy ? "Alergia o dieta avisada" : "Nota"}</PText>
          </View>
          <PText v="small" color={allergy ? amber.fg : C.text}>{booking.note}</PText>
        </View>
      ) : null}

      {demo && !waiting ? <BookingExtras booking={booking} /> : null}

      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg }}>
        <Detail label="Personas" value={booking.partySize} />
        <Detail label="Mesa" value={tableName(data, booking.resourceId) ?? "Sin asignar"} />
        {!waiting ? <Detail label="Hora" value={`${time(booking.start)} a ${time(booking.end)}`} /> : null}
        <Detail
          label="Origen"
          value={TABLE_SOURCE[booking.source]}
          last={!((demo || can("finance.read")) && booking.priceCents)}
        />
        {(demo || can("finance.read")) && booking.priceCents ? (
          <Detail
            label={booking.source === "grupo" ? "Presupuesto" : "Gasto previsto"}
            last
            value={
              <View style={{ alignItems: "flex-end" }}>
                <PText v="h3">{money(booking.priceCents, { round: true })}</PText>
                {booking.paidCents && booking.status !== "done" ? (
                  <PText v="tiny">{`Señal pagada: ${money(booking.paidCents, { round: true })}`}</PText>
                ) : null}
              </View>
            }
          />
        ) : null}
      </View>

      {demo && canMove && vertical.id !== "cafe" ? (
        <Field
          label={waiting ? "Mesa libre ahora" : "Cambiar de mesa"}
          hint={options.length ? "Ordenadas de la más ajustada a la más grande." : "No queda ninguna mesa libre de ese tamaño a esa hora."}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            {options.map((t) => (
              <PickButton
                key={t.id}
                title={tableName(data, t.id) ?? t.name}
                detail={`${t.seats} pax · ${t.zone}`}
                selected={chosen === t.id}
                onPress={() => setPick(t.id)}
              />
            ))}
          </View>
        </Field>
      ) : null}

      {client ? (
        <PText v="tiny">
          {`Cliente desde ${relative(client.createdAt, now.getTime())}${
            (demo || can("finance.read")) && client.spentCents !== null ? ` · ${money(client.spentCents, { round: true })} gastados en total` : ""
          }`}
        </PText>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Nueva reserva y lista de espera                                     */
/* ------------------------------------------------------------------ */

export type NewReservationPreset = {
  date: string;
  turn?: Turn;
  minute?: number;
  tableId?: string;
  waitlist?: boolean;
  walkIn?: boolean;
} | null;

const QUICK_NOTES = ["Sin gluten", "Frutos secos", "Lactosa", "Marisco", "Vegano", "Trona", "Cumpleaños", "Terraza"];

export function NewReservationDrawer({ preset, onClose }: { preset: NewReservationPreset; onClose: () => void }) {
  const { demo } = usePro();
  if (!demo) return <RealReservationDrawer preset={preset} onClose={onClose} />;
  return <DemoReservationDrawer preset={preset} onClose={onClose} />;
}

/** Botones de personas (1 a 10 y "10+"), como en la web. */
function PartyPicker({ party, big, onPick, onBig }: { party: number; big: boolean; onPick: (n: number) => void; onBig: () => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <PickButton
          key={n}
          title={String(n)}
          accessibilityLabel={plural(n, "persona", "personas")}
          selected={!big && party === n}
          onPress={() => onPick(n)}
          style={{ width: 46, paddingHorizontal: 0, alignItems: "center" }}
        />
      ))}
      <PickButton title="10+" accessibilityLabel="Más de 10 personas" selected={big} onPress={onBig} style={{ width: 58, paddingHorizontal: 0, alignItems: "center" }} />
    </View>
  );
}

function DemoReservationDrawer({ preset, onClose }: { preset: NewReservationPreset; onClose: () => void }) {
  const { data, update, now, vertical, pending } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const waitlist = Boolean(preset?.waitlist);

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [party, setParty] = React.useState(2);
  const [bigParty, setBigParty] = React.useState(false);
  const [date, setDate] = React.useState(today);
  const [turn, setTurn] = React.useState<Turn>(currentTurn(nowMin));
  const [minute, setMinute] = React.useState<number | null>(null);
  const [tableId, setTableId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [source, setSource] = React.useState<"phone" | "instagram" | "walkin" | "google">("phone");

  React.useEffect(() => {
    if (!preset) return;
    setName("");
    setPhone("");
    setParty(2);
    setBigParty(false);
    setDate(preset.date);
    setTurn(preset.turn ?? currentTurn(nowMin));
    setMinute(preset.minute ?? null);
    setTableId(preset.tableId ?? null);
    setNote("");
    setSource(preset.waitlist ? "walkin" : "phone");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const stay = stayMinutes(vertical.id, turn);
  const slots = turnSlots(turn);
  const past = (m: number) => date < today || (date === today && m < nowMin - 15);
  const freeAt = (m: number) => freeTablesFor(data, date, m, stay, party);
  const tables = minute !== null ? freeAt(minute) : [];
  const chosenTable = tableId && tables.some((t) => t.id === tableId) ? tableId : (tables[0]?.id ?? null);
  const valid = name.trim().length > 1 && party > 0 && (waitlist || minute !== null);

  const save = async () => {
    if (pending) return;
    const existing = data.clients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    const clientSource: ProClientSource = source;
    const client: ProClient | null = existing
      ? null
      : {
          id: localId("c"),
          name: name.trim(),
          phone: phone.trim() || undefined,
          tags: [],
          visits: 0,
          spentCents: 0,
          noShows: 0,
          source: clientSource,
          marketingConsent: false,
          cardMember: false,
          createdAt: new Date().toISOString(),
        };
    const clientId = existing?.id ?? client?.id;
    const cover = vertical.id === "restaurant" ? 3200 : 1400;
    const booking: ProBooking = waitlist
      ? {
          id: localId("rw"),
          kind: "table",
          clientId,
          clientName: name.trim(),
          start: now.toISOString(),
          end: new Date(now.getTime() + stay * 60000).toISOString(),
          partySize: party,
          status: "requested",
          priceCents: party * cover,
          paidCents: 0,
          source: "walkin",
          note: [note.trim(), phone.trim() ? `Tel. ${phone.trim()}` : ""].filter(Boolean).join(". ") || undefined,
          student: Boolean(existing?.student?.verified),
        }
      : {
          id: localId("rb"),
          kind: "table",
          clientId,
          clientName: name.trim(),
          resourceId: chosenTable ?? undefined,
          start: isoAt(date, minute ?? TURNS[turn].from),
          end: isoAt(date, (minute ?? TURNS[turn].from) + stay),
          partySize: party,
          status: "confirmed",
          priceCents: party * cover,
          paidCents: 0,
          source,
          note: note.trim() || undefined,
          student: Boolean(existing?.student?.verified),
        };
    if (
      !(await update(waitlist ? "table.waitlist" : "table.reserve", (d) => ({
        ...d,
        bookings: [...d.bookings, booking],
        clients: client ? [client, ...d.clients] : d.clients,
      })))
    )
      return;
    if (waitlist) toast("Apuntado en la lista de espera", { kind: "success" });
    else
      toast("Reserva guardada", {
        kind: "success",
        body: `${name.trim().split(" ")[0]}, ${plural(party, "persona", "personas")}, ${date === today ? "hoy" : dayLabel(isoAt(date, 720))} a las ${minutesToLabel(minute ?? 0)}${chosenTable ? ` en ${tableName(data, chosenTable)}` : ""}.`,
      });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title={waitlist ? "Apuntar en lista de espera" : "Nueva reserva"}
      description={waitlist ? "Para quien llega sin reservar y la sala está llena." : "Por teléfono, Instagram o en la puerta. Las de Franky entran solas."}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={waitlist ? "Apuntar" : "Guardar reserva"} onPress={() => void save()} disabled={pending || !valid} />
        </>
      }
    >
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} placeholder="Nombre y apellido" label="Nombre" autoComplete="off" autoCapitalize="words" />
      </Field>
      <Field label="Teléfono">
        <Input value={phone} onChangeText={setPhone} placeholder="600 000 000" label="Teléfono" keyboardType="phone-pad" textContentType="telephoneNumber" />
      </Field>

      <Field label="Personas" hint={bigParty ? "Para más de 12, mejor como grupo con menú cerrado y señal." : undefined}>
        <PartyPicker
          party={party}
          big={bigParty}
          onPick={(n) => {
            setBigParty(false);
            setParty(n);
          }}
          onBig={() => {
            setBigParty(true);
            setParty((p) => Math.max(p, 11));
          }}
        />
        {bigParty ? (
          <View style={{ marginTop: S.sm }}>
            <Stepper value={party} onChange={setParty} min={11} max={80} label="Número de personas" />
          </View>
        ) : null}
      </Field>

      {!waitlist ? (
        <>
          <Field label="Día">
            <DayChips value={date} onChange={setDate} today={today} days={91} />
          </Field>
          <Field label="Turno">
            <Segmented
              value={turn}
              onChange={(v) => {
                setTurn(v);
                setMinute(null);
              }}
              options={[
                { value: "comida", label: "Comida" },
                { value: "cena", label: "Cena" },
              ]}
            />
          </Field>

          <Field label="Hora" hint={`Cada mesa se guarda ${stay} minutos.`}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {slots.map((m) => {
                const disabled = past(m);
                const free = disabled ? 0 : freeAt(m).length;
                const full = !disabled && free === 0;
                return (
                  <PickButton
                    key={m}
                    title={minutesToLabel(m)}
                    detail={full ? "Lleno" : disabled ? " " : `${free} mesas`}
                    disabled={disabled || full}
                    selected={minute === m}
                    onPress={() => setMinute(m)}
                    style={{ width: "23.5%", paddingHorizontal: 0, alignItems: "center" }}
                  />
                );
              })}
            </View>
          </Field>

          {minute !== null ? (
            <Field
              label="Mesa sugerida"
              hint={
                tables.length
                  ? "La más ajustada al grupo va primero. Puedes cambiarla."
                  : "No hay mesa libre para ese grupo a esa hora. Prueba otra hora o apúntalo en espera."
              }
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                {tables.slice(0, 8).map((t, i) => (
                  <PickButton
                    key={t.id}
                    title={tableName(data, t.id) ?? t.name}
                    badge={i === 0 ? "Sugerida" : undefined}
                    detail={`${t.seats} pax · ${t.zone}`}
                    selected={chosenTable === t.id}
                    onPress={() => setTableId(t.id)}
                  />
                ))}
              </View>
            </Field>
          ) : null}
        </>
      ) : null}

      <Field label="Alergias y notas" hint="Lo que escribas aquí lo ve la sala al sentarles y cocina en la comanda.">
        <Input value={note} onChangeText={setNote} placeholder="Celíaca, cumpleaños, trona..." label="Alergias y notas" multiline />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {QUICK_NOTES.map((q) => (
            <Tap
              key={q}
              onPress={() => setNote((prev) => (prev.includes(q) ? prev : prev ? `${prev}, ${q.toLowerCase()}` : q))}
              accessibilityRole="button"
              accessibilityLabel={`Añadir ${q}`}
              style={{ minHeight: 36, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.border, justifyContent: "center" }}
            >
              <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.text }} maxFontSizeMultiplier={1.3}>{`+ ${q}`}</Text>
            </Tap>
          ))}
        </View>
      </Field>

      {!waitlist ? (
        <Field label="Cómo ha reservado">
          <ChoiceGrid
            value={source}
            onChange={setSource}
            options={[
              { value: "phone", label: "Teléfono" },
              { value: "instagram", label: "Instagram" },
              { value: "google", label: "Google" },
              { value: "walkin", label: "En persona" },
            ]}
          />
        </Field>
      ) : null}
    </Sheet>
  );
}

function RealReservationDrawer({ preset, onClose }: { preset: NewReservationPreset; onClose: () => void }) {
  const { data, now, pending, can, update, loadDate } = usePro();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [date, setDate] = React.useState(localDate(now));
  const [minute, setMinute] = React.useState("");
  const [party, setParty] = React.useState(2);
  const [tableId, setTableId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [failure, setFailure] = React.useState(false);
  const waitlist = Boolean(preset?.waitlist);
  const walkIn = Boolean(preset?.walkIn);
  const label = waitlist ? "table.waitlist" : walkIn ? "table.walkin" : "table.reserve";
  const services = tableServices(data);
  const service = services.find((item) => item.id === serviceId);
  const customer = data.clients.find((item) => item.id === customerId);
  const customerName = customer?.name ?? name.trim();
  const actualMinute = walkIn || waitlist ? localMinutes(now) + now.getUTCSeconds() / 60 + now.getUTCMilliseconds() / 60_000 : Number(minute);
  const tables = service ? realTablesForService(data, service.id, date, actualMinute, party, now) : [];
  const chosen = tables.find((table) => table.id === tableId) ?? tables[0];
  const total = service ? service.price_cents * (service.price_basis === "person" ? party : 1) : null;
  const slots =
    service && !walkIn && !waitlist
      ? Array.from({ length: 96 }, (_, index) => index * 15).filter(
          (value) => (date > localDate(now) || value >= localMinutes(now)) && realTablesForService(data, service.id, date, value, party, now).length > 0,
        )
      : [];
  const valid =
    service &&
    customerName.length >= 2 &&
    Number.isInteger(party) &&
    party > 0 &&
    party <= service.capacity &&
    (waitlist || (chosen && (walkIn || (minute !== "" && slots.includes(Number(minute))))));

  React.useEffect(() => {
    if (!preset) return;
    setName("");
    setPhone("");
    setCustomerId("");
    setServiceId("");
    setParty(2);
    setDate(preset.date);
    setMinute(preset.minute === undefined ? "" : String(preset.minute));
    setTableId(preset.tableId ?? "");
    setNote("");
    setFailure(false);
  }, [preset]);
  React.useEffect(() => {
    if (preset) void loadDate(date);
  }, [date, loadDate, preset]);

  const save = async () => {
    if (pending || !can(label) || !valid || !service || total === null) return;
    setFailure(false);
    const client: ProClient | null = customer
      ? null
      : {
          id: localId("customer"),
          name: customerName,
          phone: phone.trim() || undefined,
          tags: [],
          visits: 0,
          spentCents: null,
          noShows: 0,
          source: walkIn || waitlist ? "walkin" : "phone",
          marketingConsent: false,
          cardMember: false,
          createdAt: now.toISOString(),
        };
    const clientId = customer?.id ?? client!.id;
    const saved = await update(label, (before) => {
      const clients = client ? [...before.clients, client] : before.clients;
      if (waitlist && before.tableOperations)
        return {
          ...before,
          clients,
          tableOperations: {
            ...before.tableOperations,
            waitlist: [
              ...before.tableOperations.waitlist,
              {
                id: localId("waitlist"),
                customerId: clientId,
                customerName,
                customerContact: customer?.phone ?? customer?.email ?? phone.trim(),
                serviceId: service.id,
                partySize: party,
                requestedAt: now.toISOString(),
                expiresAt: now.toISOString(),
                status: "waiting",
                bookingId: null,
                serviceVersion: service.version,
                expectedTotalCents: can("finance.read") ? total : null,
                note: note.trim(),
              },
            ],
          },
        };
      if (waitlist || !chosen) return before;
      return {
        ...before,
        clients,
        bookings: [
          ...before.bookings,
          {
            id: localId("reservation"),
            kind: "table",
            clientId,
            clientName: customerName,
            serviceId: service.id,
            resourceId: chosen.id,
            start: isoAt(date, actualMinute),
            end: isoAt(date, actualMinute + service.duration_minutes),
            partySize: party,
            status: walkIn ? "arrived" : "confirmed",
            priceCents: total,
            paidCents: null,
            source: walkIn ? "walkin" : "phone",
            note: note.trim() || undefined,
          },
        ],
      };
    });
    if (!saved) {
      setFailure(true);
      return;
    }
    toast(waitlist ? "Apuntado en la lista de espera" : walkIn ? "Mesa sentada" : "Reserva guardada", { kind: "success" });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title={waitlist ? "Apuntar en lista de espera" : walkIn ? "Sentar sin reserva" : "Nueva reserva"}
      description="Elige el servicio del catálogo y revisa la disponibilidad de la mesa."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton
            label={waitlist ? "Apuntar" : walkIn ? "Sentar" : "Guardar reserva"}
            disabled={pending || !can(label) || !valid}
            onPress={() => void save()}
          />
        </>
      }
    >
      <View pointerEvents={pending ? "none" : "auto"} style={{ gap: S.md, opacity: pending ? 0.6 : 1 }}>
        {!services.length ? <PText v="small">Añade un servicio de reserva de mesa sin señal en el panel de tu negocio para empezar.</PText> : null}
        {failure ? (
          <View accessibilityRole="alert">
            <PText v="small" color={C.errorText}>No se ha guardado. Revisa la disponibilidad y vuelve a intentarlo.</PText>
          </View>
        ) : null}
        <Field label="Servicio">
          <PickList
            value={serviceId}
            onChange={(v) => {
              setServiceId(v);
              setMinute("");
            }}
            options={services.map((item) => ({ value: item.id, label: item.name }))}
          />
        </Field>
        <Field label="Cliente">
          <PickList
            value={customerId}
            onChange={setCustomerId}
            searchPlaceholder="Buscar cliente"
            options={[{ value: "", label: "Cliente nuevo" }, ...data.clients.map((item) => ({ value: item.id, label: item.name }))]}
          />
        </Field>
        {!customer ? (
          <>
            <Field label="Nombre">
              <Input value={name} onChangeText={setName} label="Nombre" autoComplete="off" autoCapitalize="words" />
            </Field>
            <Field label="Teléfono">
              <Input value={phone} onChangeText={setPhone} label="Teléfono" keyboardType="phone-pad" textContentType="telephoneNumber" />
            </Field>
          </>
        ) : null}
        <Field label="Personas">
          <Stepper value={party} onChange={setParty} min={1} max={service?.capacity ?? 500} label="personas" />
        </Field>
        {!waitlist && !walkIn ? (
          <>
            <Field label="Día">
              <DayChips value={date} onChange={setDate} today={localDate(now)} days={91} />
            </Field>
            <Field label="Hora" hint={service && !slots.length ? "No hay horas libres ese día con estas condiciones." : undefined}>
              {service ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {slots.map((value) => (
                    <PickButton
                      key={value}
                      title={minutesToLabel(value)}
                      selected={minute === String(value)}
                      onPress={() => setMinute(String(value))}
                      style={{ width: "23.5%", paddingHorizontal: 0, alignItems: "center" }}
                    />
                  ))}
                </View>
              ) : (
                <PText v="small">Elige un servicio para ver las horas.</PText>
              )}
            </Field>
          </>
        ) : null}
        {!waitlist ? (
          <Field
            label="Mesa"
            hint={service && !tables.length ? "No hay una mesa disponible con estas condiciones." : "La disponibilidad se vuelve a comprobar al guardar."}
          >
            <PickList
              value={chosen?.id ?? ""}
              onChange={setTableId}
              options={tables.map((table) => ({ value: table.id, label: `${tableName(data, table.id)} · ${table.seats} personas` }))}
            />
          </Field>
        ) : null}
        <Field label="Alergias y notas">
          <Input value={note} onChangeText={setNote} label="Alergias y notas" multiline />
        </Field>
        {service && total !== null ? (
          <PText v="small">
            {`${service.duration_minutes} minutos · ${money(total)}${service.price_basis === "person" ? ` para ${party} personas` : " por reserva"}`}
          </PText>
        ) : null}
      </View>
    </Sheet>
  );
}

export function RealWaitlistPanel({ onAdd }: { onAdd: () => void }) {
  const { data, now, pending, can, update } = usePro();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [tableId, setTableId] = React.useState("");
  const [failure, setFailure] = React.useState(false);
  const waiting = data.tableOperations?.waitlist.filter((entry) => entry.status === "waiting" && Date.parse(entry.expiresAt) > now.getTime()) ?? [];
  const selected = waiting.find((entry) => entry.id === selectedId);
  const tables = selected
    ? realTablesForService(
        data,
        selected.serviceId,
        localDate(now),
        localMinutes(now) + now.getUTCSeconds() / 60 + now.getUTCMilliseconds() / 60_000,
        selected.partySize,
        now,
      )
    : [];
  const chosen = tables.find((table) => table.id === tableId) ?? tables[0];
  const submit = async (action: "seat" | "cancel") => {
    if (!selected || pending || !can(`table.waitlist.${action}`) || (action === "seat" && !chosen)) return;
    const saved = await update(
      `table.waitlist.${action}`,
      (before) => before,
      action === "seat"
        ? { type: "table.waitlist.seat", waitlistId: selected.id, tableId: chosen!.id }
        : { type: "table.waitlist.cancel", waitlistId: selected.id },
    );
    if (!saved) {
      setFailure(true);
      return;
    }
    toast(action === "seat" ? "Mesa sentada" : "Quitado de la lista de espera", { kind: "success" });
    setSelectedId(null);
  };
  return (
    <>
      <Panel title="Lista de espera" action={<PButton label="Apuntar" small variant="outline" disabled={pending || !can("table.waitlist")} onPress={onAdd} />} flush>
        {waiting.length ? (
          waiting.map((entry, i) => (
            <Tap
              key={entry.id}
              onPress={() => {
                setSelectedId(entry.id);
                setTableId("");
                setFailure(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${entry.customerName}, ${entry.partySize} personas`}
              style={{ paddingHorizontal: S.lg, paddingVertical: S.md, minHeight: 56, borderTopWidth: i ? 1 : 0, borderTopColor: C.borderLight }}
            >
              <PText v="h3" numberOfLines={1}>{`${entry.customerName} · ${entry.partySize} personas`}</PText>
              <PText v="tiny">{`Desde las ${time(entry.requestedAt)}`}</PText>
            </Tap>
          ))
        ) : (
          <View style={{ paddingHorizontal: S.lg, paddingVertical: S.lg }}>
            <PText v="small">Nadie esperando ahora.</PText>
          </View>
        )}
      </Panel>
      <Sheet
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.customerName ?? "Lista de espera"}
        footer={
          <>
            <PButton label="Quitar de la espera" variant="ghost" disabled={pending || !can("table.waitlist.cancel")} onPress={() => void submit("cancel")} />
            <PButton label="Sentar" disabled={pending || !can("table.waitlist.seat") || !chosen} onPress={() => void submit("seat")} />
          </>
        }
      >
        {selected ? (
          <>
            <PText v="body">
              {`${selected.partySize} personas · ${data.services.find((service) => service.id === selected.serviceId)?.name ?? "Servicio reservado"}`}
            </PText>
            {selected.customerContact ? <PText v="body">{`Contacto: ${selected.customerContact}`}</PText> : null}
            {selected.note ? <NoteLine note={selected.note} /> : null}
            <Field label="Mesa libre">
              <View pointerEvents={pending ? "none" : "auto"}>
                <PickList
                  value={chosen?.id ?? ""}
                  onChange={setTableId}
                  empty="Sin mesa disponible"
                  options={tables.map((table) => ({ value: table.id, label: `${tableName(data, table.id)} · ${table.seats} personas` }))}
                />
              </View>
            </Field>
            {failure ? (
              <View accessibilityRole="alert">
                <PText v="small" color={C.errorText}>La espera no ha cambiado. Actualiza la sala y revisa las condiciones.</PText>
              </View>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lo que trae Franky                                                  */
/* ------------------------------------------------------------------ */

function DarkLink({ onPress }: { onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel="Ver resultados" style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: S.xs }}>
      <DarkText v="small" style={{ fontFamily: FONT.semibold }}>Ver resultados</DarkText>
      <ArrowRight size={14} color="#FFFFFF" />
    </Tap>
  );
}

/** Dos cifras en columnas dentro del bloque oscuro. */
function DarkPair({ items }: { items: { value: string; label: string }[] }) {
  return (
    <View style={{ flexDirection: "row", gap: S.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: S.md, marginTop: S.sm }}>
      {items.map((it) => (
        <View key={it.label} style={{ flex: 1, gap: 2 }}>
          <DarkText v="h2">{it.value}</DarkText>
          <DarkText v="small" dim>{it.label}</DarkText>
        </View>
      ))}
    </View>
  );
}

export function FrankyBlock() {
  const { data, now, vertical, demo } = usePro();
  const go = useGoSection();
  if (!demo) return null;
  const results = frankyResults(data, now, 30);
  const today = localDate(now);
  const from = addDays(today, -29);

  if (vertical.id === "cafe") {
    const last30 = data.validations.filter((v) => localDate(v.at) >= from);
    const students = new Set(last30.map((v) => v.clientName)).size;
    const revenue = last30.reduce((a, v) => a + v.amountCents - v.discountCents, 0);
    const byClient = new Map<string, number>();
    last30.forEach((v) => byClient.set(v.clientName, (byClient.get(v.clientName) ?? 0) + 1));
    const repeat = [...byClient.values()].filter((n) => n >= 3).length;
    return (
      <DarkBlock>
        <DarkText v="label" dim>Franky, últimos 30 días</DarkText>
        <DarkText v="display">{String(students)}</DarkText>
        <DarkText v="small" dim>estudiantes han pagado con su Franky Card</DarkText>
        <DarkPair
          items={[
            { value: money(revenue, { round: true }), label: "facturado con ellos" },
            { value: String(repeat), label: "vuelven 3 veces o más" },
          ]}
        />
        <DarkText v="small" dim>{`${last30.length} visitas validadas. Sin comisión por ninguna.`}</DarkText>
        <DarkLink onPress={() => go("estudiantes")} />
      </DarkBlock>
    );
  }

  const todays = tableBookingsOn(data, today);
  const franky = todays.filter((b) => fromFranky(b.source));
  const frankyCovers = franky.reduce((a, b) => a + b.partySize, 0);
  // Los marketplaces de reservas cobran unos 2 € por comensal que llega por ellos.
  const covers30 = data.bookings
    .filter(
      (b) =>
        b.kind === "table" &&
        fromFranky(b.source) &&
        b.status !== "cancelled" &&
        b.status !== "no_show" &&
        localDate(b.start) >= from &&
        localDate(b.start) <= today,
    )
    .reduce((a, b) => a + b.partySize, 0);
  return (
    <DarkBlock>
      <DarkText v="label" dim>Franky, últimos 30 días</DarkText>
      <DarkText v="display">{String(results.people)}</DarkText>
      <DarkText v="small" dim>clientes han llegado por Franky</DarkText>
      <DarkPair
        items={[
          { value: money(results.revenueCents, { round: true }), label: "facturado con ellos" },
          { value: money(covers30 * 200, { round: true }), label: "que no pagas en comisión por comensal" },
        ]}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Users size={13} color="rgba(255,255,255,0.65)" strokeWidth={1.9} />
        <DarkText v="small" dim style={{ flex: 1 }}>{`Hoy: ${franky.length} reservas y ${frankyCovers} cubiertos vienen de Franky.`}</DarkText>
      </View>
      <DarkLink onPress={() => go("estudiantes")} />
    </DarkBlock>
  );
}
