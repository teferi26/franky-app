import React from "react";
import { Alert, Text, View } from "react-native";
import { Check, Music2, Plus, Trash2, Trophy, Tv, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProVenueEvent, ProVenueEventBooking } from "../../../../../shared/pro/tables-types";
import { eventStats, upcomingEvents } from "../../../../../shared/pro/tables-ops";
import { VENUE_EVENT_KIND_LABEL, eventInviteMessage } from "../../../../../shared/pro/tables-insights";
import { atLocal, capitalize, dayLabel, localDate, localMinutes, money, plural, time } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  ChoiceGrid,
  DayChips,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  Meter,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  Sheet,
  Stepper,
  Tip,
  TimeStepper,
  Toggle,
} from "../../kit";
import { MoneyField, OpsMissing, WhatsAppButton, eurosText, parseEuros, useTablesOps } from "./ops";
import { Card } from "./ui";

/**
 * Partidos, noches especiales y previas de fiestas universitarias, versión
 * nativa de web/.../tables/partidos.tsx: aforo, menú, consumo mínimo y
 * señales, y el texto listo para mandar al grupo de clase o a la asociación.
 */

const KIND_ICON = { partido: Trophy, evento: Users, previa: Music2 } as const;

export default function TablesPartidos() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  if (!ops) {
    return (
      <ProPage>
        <PageHeader eyebrow="Partidos y eventos" title="Partidos y eventos" />
        <OpsMissing icon={Tv} title="Sin partidos ni eventos" />
      </ProPage>
    );
  }
  const list = upcomingEvents(ops, now);
  const stats = list.map((e) => ({ event: e, s: eventStats(e) }));
  const people = stats.reduce((a, x) => a + x.s.people, 0);
  const pendingDeposits = stats.reduce((a, x) => a + x.s.depositsPending, 0);
  const next = list[0];

  return (
    <ProPage>
      <PageHeader
        eyebrow="Partidos y eventos"
        title="Que la pantalla grande se pague sola"
        description={
          next
            ? `Próximo: ${next.title}, ${localDate(next.start) === localDate(now) ? "hoy" : dayLabel(next.start)} a las ${time(next.start)}. ${plural(eventStats(next).people, "persona reservada", "personas reservadas")} de ${next.capacity}.`
            : "Crea cada partido, previa o noche especial con su aforo, su menú y su consumo mínimo. Los estudiantes reservan desde tu ficha."
        }
        actions={<PButton label="Nuevo" icon={Plus} onPress={() => setCreating(true)} />}
      />

      <KpiRow>
        <Kpi icon={Tv} label="Próximos" value={list.length} hint={`${list.filter((e) => e.published).length} publicados en Franky`} />
        <Kpi icon={Users} label="Personas reservadas" value={people} emphasis={people > 0} />
        <Kpi label="Señales pendientes" value={pendingDeposits} hint={pendingDeposits ? "pídelas por WhatsApp" : "todas cobradas"} />
        <Kpi
          label="Consumo mínimo"
          value={money(stats.reduce((a, x) => a + x.s.minimumCents, 0), { round: true })}
          hint="comprometido en las reservas"
        />
      </KpiRow>

      {list.length ? (
        stats.map(({ event, s }) => {
          const Icon = KIND_ICON[event.kind];
          return (
            <Tap key={event.id} onPress={() => setOpen(event.id)} accessibilityRole="button" accessibilityLabel={`Abrir ${event.title}`}>
              <Card style={{ gap: S.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                    <Icon size={14} color={C.muted} strokeWidth={1.9} />
                    <PText v="tiny" numberOfLines={1} style={{ fontFamily: FONT.semibold, flexShrink: 1 }}>
                      {`${VENUE_EVENT_KIND_LABEL[event.kind]}, ${capitalize(dayLabel(event.start))}, ${time(event.start)}`}
                    </PText>
                  </View>
                  {event.published ? <Pill tone="success" label="En Franky" /> : <Pill label="Borrador" />}
                </View>
                <PText v="h2">{event.title}</PText>
                {event.kind === "previa" && event.party ? <PText v="small">{`Antes de ${event.party}`}</PText> : null}
                {event.menu ? <PText v="body" color={C.muted}>{event.menu}</PText> : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <PText v="h3">{`${s.people} de ${event.capacity}`}</PText>
                  <PText v="tiny">{s.free ? `${s.free} libres` : "Completo"}</PText>
                </View>
                <Meter value={s.people} max={event.capacity} tone={s.free <= 5 ? "warning" : "violet"} />
                <PText v="tiny">
                  {`${event.minimumSpendCents ? `Consumo mínimo ${money(event.minimumSpendCents)} por persona` : "Sin consumo mínimo"}${s.depositsPending ? `, ${plural(s.depositsPending, "señal pendiente", "señales pendientes")}` : ""}`}
                </PText>
              </Card>
            </Tap>
          );
        })
      ) : (
        <Panel>
          <Empty
            icon={Tv}
            title="Ningún partido a la vista"
            body="Champions entre semana, derbis, la previa de una fiesta universitaria o una noche de trivia: cada evento con su aforo y su menú llena el bar en días flojos."
            action={<PButton label="Crear el primero" icon={Plus} onPress={() => setCreating(true)} />}
          />
        </Panel>
      )}

      <Tip title="Consumo mínimo sin discusiones">
        Si lo pones al crear el evento, cada estudiante lo ve antes de reservar. A los grupos grandes, pídeles una señal por Bizum y márcala aquí cuando llegue.
      </Tip>

      <EventSheet id={open} onClose={() => setOpen(null)} />
      <NewEventSheet open={creating} onClose={() => setCreating(false)} />
    </ProPage>
  );
}

function EventSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = usePro();
  const { ops, save } = useTablesOps();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [people, setPeople] = React.useState(4);
  const [deposit, setDeposit] = React.useState("");
  const event = ops?.events.find((e) => e.id === id) ?? null;
  React.useEffect(() => {
    setName("");
    setPhone("");
    setPeople(4);
    setDeposit("");
  }, [id]);
  if (!event || !ops) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const s = eventStats(event);
  const link = `https://franky.es/n/${data.space.slug}`;

  const patch = (label: string, fn: (e: ProVenueEvent) => ProVenueEvent) =>
    save(label, (o) => ({ ...o, events: o.events.map((e) => (e.id === event.id ? fn(e) : e)) }));
  const patchBooking = (bookingId: string, fn: (b: ProVenueEventBooking) => ProVenueEventBooking) =>
    patch("event.booking", (e) => ({ ...e, bookings: e.bookings.map((b) => (b.id === bookingId ? fn(b) : b)) }));

  const add = async () => {
    const booking: ProVenueEventBooking = {
      id: localId("eb"),
      name: name.trim(),
      phone: phone.trim() || undefined,
      people,
      depositCents: parseEuros(deposit) ?? 0,
      depositPaid: false,
    };
    if (!(await patch("event.book", (e) => ({ ...e, bookings: [...e.bookings, booking] })))) return;
    toast("Reserva apuntada", { kind: "success", body: `${booking.name}, ${plural(people, "persona", "personas")}.` });
    setName("");
    setPhone("");
    setDeposit("");
  };

  const remove = () =>
    Alert.alert("¿Borrar este evento?", "Se pierden sus reservas apuntadas.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          if (await save("event.remove", (o) => ({ ...o, events: o.events.filter((e) => e.id !== event.id) }))) onClose();
        },
      },
    ]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={event.title}
      description={`${capitalize(dayLabel(event.start))}, de ${time(event.start)} a ${time(event.end)}`}
      footer={
        <>
          <PButton label="Borrar" icon={Trash2} variant="ghost" onPress={remove} />
          <PButton
            label={event.published ? "Retirar de Franky" : "Publicar en Franky"}
            variant={event.published ? "outline" : "dark"}
            onPress={async () => {
              if (await patch("event.publish", (e) => ({ ...e, published: !e.published })))
                toast(event.published ? "Retirado de Franky" : "Publicado en Franky", {
                  kind: "success",
                  body: event.published ? undefined : "Lo verán los estudiantes cerca de ti en tu ficha.",
                });
            }}
          />
        </>
      }
    >
      <View style={{ flexDirection: "row", gap: S.sm }}>
        <Stat label="Reservadas" value={`${s.people}/${event.capacity}`} />
        <Stat label="Señales" value={money(s.depositsPaidCents, { round: true })} />
        <Stat label="Han llegado" value={String(s.arrived)} />
      </View>

      <WhatsAppButton
        share
        full
        small={false}
        label={event.kind === "previa" ? "Mandar la previa al grupo" : "Mandar al grupo"}
        message={eventInviteMessage(event, data.space.name, link)}
      />

      <Field label="Reservas">
        {event.bookings.length ? (
          <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border }}>
            {event.bookings.map((b, i) => (
              <View key={b.id} style={{ padding: S.md, gap: S.sm, borderTopWidth: i ? 1 : 0, borderTopColor: C.borderLight }}>
                <View>
                  <PText v="h3" numberOfLines={1}>
                    {b.name}
                  </PText>
                  <PText v="tiny">
                    {`${plural(b.people, "persona", "personas")}${b.depositCents ? `, señal ${money(b.depositCents)} ${b.depositPaid ? "pagada" : "pendiente"}` : ""}`}
                  </PText>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                  {b.depositCents && !b.depositPaid ? (
                    <>
                      <WhatsAppButton
                        phone={b.phone}
                        label="Pedir señal"
                        message={`Hola ${b.name.split(" ")[0]}, para guardaros la mesa en ${data.space.name} para ${event.title.toLowerCase()} necesitamos una señal de ${money(b.depositCents)} por Bizum. ¡Gracias!`}
                      />
                      <PButton label="Cobrada" variant="outline" small onPress={() => void patchBooking(b.id, (x) => ({ ...x, depositPaid: true }))} />
                    </>
                  ) : null}
                  <PButton
                    label="Llegó"
                    icon={b.arrived ? Check : undefined}
                    variant={b.arrived ? "secondary" : "ghost"}
                    small
                    onPress={() => void patchBooking(b.id, (x) => ({ ...x, arrived: !x.arrived }))}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <PText v="small">Todavía nadie. Las reservas desde Franky entran aquí.</PText>
        )}
      </Field>

      <Card style={{ gap: S.sm, marginBottom: 0 }}>
        <PText v="h3">Apuntar una reserva</PText>
        <Input label="Nombre o grupo" value={name} onChangeText={setName} placeholder="Nombre o grupo" />
        <Input label="WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="WhatsApp" />
        <Field label="Personas">
          <Stepper label="Personas" value={people} onChange={setPeople} min={1} max={event.capacity} />
        </Field>
        <MoneyField label="Señal" value={deposit} onChange={setDeposit} />
        {people > s.free ? <PText v="small" color={C.errorText}>{`Solo quedan ${s.free} sitios.`}</PText> : null}
        <PButton label="Apuntar" full disabled={name.trim().length < 2 || people > s.free} onPress={() => void add()} />
      </Card>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, borderRadius: R.md, backgroundColor: C.input, padding: S.md, alignItems: "center", gap: 2 }}>
      <PText v="tiny">{label}</PText>
      <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.2}>
        {value}
      </Text>
    </View>
  );
}

function NewEventSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { now } = usePro();
  const { save } = useTablesOps();
  const today = localDate(now);
  const [kind, setKind] = React.useState<ProVenueEvent["kind"]>("partido");
  const [title, setTitle] = React.useState("");
  const [party, setParty] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [from, setFrom] = React.useState(21 * 60);
  const [to, setTo] = React.useState(23 * 60);
  const [capacity, setCapacity] = React.useState(50);
  const [minimum, setMinimum] = React.useState("10,00");
  const [menu, setMenu] = React.useState("");
  const [publish, setPublish] = React.useState(true);
  React.useEffect(() => {
    if (!open) return;
    setKind("partido");
    setTitle("");
    setParty("");
    setDate(today);
    setFrom(Math.max(21 * 60, Math.ceil(localMinutes(now) / 30) * 30) % 1440);
    setTo(23 * 60);
    setCapacity(50);
    setMinimum(eurosText(1000));
    setMenu("");
    setPublish(true);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const end = to <= from ? to + 1440 : to;
  const valid = title.trim().length >= 3 && (kind !== "previa" || party.trim().length >= 3);

  const submit = async () => {
    const event: ProVenueEvent = {
      id: localId("ev"),
      kind,
      party: kind === "previa" ? party.trim() : undefined,
      title: title.trim(),
      start: atLocal(date, from),
      end: atLocal(date, end),
      capacity,
      minimumSpendCents: parseEuros(minimum) ?? 0,
      menu: menu.trim() || undefined,
      published: publish,
      bookings: [],
    };
    if (!(await save("event.create", (o) => ({ ...o, events: [...o.events, event] })))) return;
    toast(publish ? "Evento publicado" : "Evento guardado", { kind: "success", body: event.title });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo partido o evento"
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={publish ? "Publicar" : "Guardar"} disabled={!valid} onPress={() => void submit()} />
        </>
      }
    >
      <ChoiceGrid
        value={kind}
        onChange={setKind}
        options={[
          { value: "partido", label: "Partido" },
          { value: "previa", label: "Previa de fiesta" },
          { value: "evento", label: "Otro evento" },
        ]}
      />
      {kind === "previa" ? (
        <Field label="Fiesta" hint="La fiesta universitaria a la que se va después.">
          <Input label="Fiesta" value={party} onChangeText={setParty} placeholder="Fiesta de Bienvenida de Teleco" />
        </Field>
      ) : null}
      <Field label={kind === "previa" ? "Qué ofreces" : "Título"}>
        <Input
          label="Título"
          value={title}
          onChangeText={setTitle}
          placeholder={kind === "partido" ? "Champions: semifinal" : kind === "previa" ? "Previa en la terraza" : "Noche de trivia"}
        />
      </Field>
      <Field label="Día">
        <DayChips value={date} onChange={setDate} today={today} days={21} />
      </Field>
      <Field label="Empieza">
        <TimeStepper label="Hora de inicio" value={from} onChange={setFrom} />
      </Field>
      <Field label="Acaba">
        <TimeStepper label="Hora de fin" value={to} onChange={setTo} />
      </Field>
      <Field label="Aforo">
        <Stepper label="Aforo" value={capacity} onChange={setCapacity} min={1} step={5} />
      </Field>
      <MoneyField label="Consumo mínimo por persona" value={minimum} onChange={setMinimum} />
      <Field label="Menú o promoción" hint="Lo ven los estudiantes antes de reservar.">
        <Input label="Menú o promoción" value={menu} onChangeText={setMenu} placeholder="Cubo de cinco tercios y ración: 15 €" />
      </Field>
      <Toggle label="Publicarlo en mi ficha de Franky" value={publish} onChange={setPublish} />
    </Sheet>
  );
}
