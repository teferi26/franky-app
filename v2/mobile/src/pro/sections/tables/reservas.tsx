import React from "react";
import { Share, Text, View } from "react-native";
import { BellRing, CalendarPlus, CalendarX2, Link2, UserPlus } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProBooking } from "../../../../../shared/pro/types";
import { addDays, dayLabel, localDate, localMinutes, minutesToLabel, plural, relative, time, weekdayIndex } from "../../../../../shared/pro/format";
import { TURNS, TURN_ORDER, capacity, covers, currentTurn, fromFranky, hasAllergyNote, tableName, turnBookings, waitlistOn, type Turn } from "../../../../../shared/pro/tables";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Empty, Meter, PAvatar, PButton, PText, PageHeader, Panel, Segmented, StepNav, Tip } from "../../kit";
import {
  NewReservationDrawer,
  NoteLine,
  RealWaitlistPanel,
  ReservationDrawer,
  SourceTag,
  StudentMark,
  TableStatus,
  useTableActions,
  type NewReservationPreset,
} from "./table-kit";
import { Card, statusTone } from "./ui";
import { noShowHistory } from "../../../../../shared/pro/tables-ops";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { ConfirmPanel, DroppedPanel } from "./today-panels";

type Filter = "all" | "pending" | "allergy" | "franky" | "risky";

export default function TablesReservas() {
  const { data, now, demo, pending, can, loadDate } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [date, setDate] = React.useState(today);
  const [turn, setTurn] = React.useState<Turn>(currentTurn(nowMin));
  const [filter, setFilter] = React.useState<Filter>("all");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewReservationPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  React.useEffect(() => {
    void loadDate(date);
  }, [date, loadDate]);

  const hours = data.space.hours[weekdayIndex(date)];
  const turnOpen = (t: Turn) => !demo || Boolean(hours && TURNS[t].from >= hours.open && TURNS[t].lastSeat < hours.close);
  const cap = capacity(data);
  const all = turnBookings(data, date, turn);
  const active = all.filter((b) => b.status !== "no_show");
  const c = covers(all);
  const seated = all.filter((b) => b.status === "arrived");
  const toCome = all.filter((b) => b.status === "confirmed" || b.status === "requested");
  const noShows = all.filter((b) => b.status === "no_show");
  const franky = active.filter((b) => fromFranky(b.source));

  // Reservas por llegar de quien ya dejó alguna mesa vacía: conviene
  // pedirles confirmación o señal antes del servicio.
  const risky = (b: ProBooking) =>
    (b.status === "requested" || b.status === "confirmed") &&
    noShowHistory(data, { clientId: b.clientId, name: b.clientName, phone: data.clients.find((c) => c.id === b.clientId)?.phone }) > 0;
  const filtered = all.filter((b) => {
    if (filter === "risky") return risky(b);
    if (filter === "pending") return b.status === "requested";
    if (filter === "allergy") return hasAllergyNote(b.note);
    if (filter === "franky") return fromFranky(b.source);
    return true;
  });
  const groups = groupByTime(filtered);
  const waitlist = date === today ? waitlistOn(data, today) : [];

  // Sin portapapeles en la app: se comparte el enlace con la hoja del sistema.
  const shareLink = async () => {
    const url = `https://franky.es/n/${data.space.slug}`;
    try {
      const result = await Share.share({ message: url });
      if (result.action === Share.sharedAction)
        toast("Enlace compartido", { kind: "success", body: `${url.replace("https://", "")}: ponlo en tu bio de Instagram y en Google.` });
    } catch {
      toast("Enlace de tu negocio", { kind: "info", body: url });
    }
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow="Reservas"
        title="Libro de reservas"
        description={
          turnOpen(turn)
            ? `${TURNS[turn].label} ${date === today ? "de hoy" : `del ${dayLabel(`${date}T12:00:00Z`, { weekday: true })}`}: ${plural(active.length, "reserva", "reservas")} y ${c} cubiertos de ${cap}. ${franky.length} vienen de Franky.`
            : `Ese ${TURNS[turn].label.toLowerCase()} no abres.`
        }
        actions={
          <>
            <PButton label="Tu enlace" icon={Link2} variant="outline" onPress={() => void shareLink()} />
            <PButton label="Nueva reserva" icon={CalendarPlus} disabled={pending || !can("table.reserve")} onPress={() => setPreset({ date, turn })} />
          </>
        }
      />

      <StepNav
        label={date === today ? `Hoy, ${dayLabel(`${date}T12:00:00Z`, { weekday: false })}` : dayLabel(`${date}T12:00:00Z`)}
        onPrev={() => setDate((d) => addDays(d, -1))}
        onNext={() => setDate((d) => addDays(d, 1))}
        onToday={() => setDate(today)}
        isToday={date === today}
      />
      <Segmented
        value={turn}
        onChange={setTurn}
        options={TURN_ORDER.map((t) => ({ value: t, label: TURNS[t].label, count: covers(turnBookings(data, date, t)) }))}
      />

      <Card>
        <PText v="small">Cubiertos del turno</PText>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.8, color: C.text }} maxFontSizeMultiplier={1.2}>{c}</Text>
          <PText v="small">{`/ ${cap}`}</PText>
        </View>
        <View style={{ flexDirection: "row", gap: S.md, marginTop: S.md }}>
          <Stat label="Sentadas" value={seated.length} />
          <Stat label="Por llegar" value={toCome.length} />
          <Stat label="No vinieron" value={noShows.length} tone={noShows.length ? "danger" : undefined} />
          <Stat label="Franky" value={franky.length} tone="violet" />
        </View>
        <View style={{ marginTop: S.md }}>
          <Meter value={c} max={cap} tone={c / Math.max(1, cap) > 0.9 ? "warning" : "violet"} />
        </View>
      </Card>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todas", count: all.length },
          { value: "pending", label: "Por confirmar", count: all.filter((b) => b.status === "requested").length },
          { value: "allergy", label: "Alergias", count: all.filter((b) => hasAllergyNote(b.note)).length },
          { value: "franky", label: "De Franky", count: all.filter((b) => fromFranky(b.source)).length },
          { value: "risky", label: "Han fallado antes", count: all.filter(risky).length },
        ]}
      />
      <Panel flush>
        {!turnOpen(turn) ? (
          <Empty icon={CalendarX2} title={`Este ${TURNS[turn].label.toLowerCase()} está cerrado`} body="Cambia tus turnos en Ajustes si quieres abrirlo." />
        ) : groups.length ? (
          groups.map(([minute, list]) => (
            <View key={minute}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, paddingHorizontal: S.lg, paddingVertical: 6, backgroundColor: C.input, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
                <Text style={{ fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.3}>{minutesToLabel(minute)}</Text>
                <PText v="tiny">{`${plural(list.length, "reserva", "reservas")} · ${covers(list)} pax`}</PText>
              </View>
              {list.map((b) => (
                <BookRow key={b.id} booking={b} editable={date === today} confirmable={date >= today} onOpen={() => setOpenId(b.id)} />
              ))}
            </View>
          ))
        ) : (
          <Empty
            icon={CalendarPlus}
            title={filter === "all" ? "Sin reservas en este turno" : "Nada con este filtro"}
            body={filter === "all" ? "Apunta las que te lleguen por teléfono. Las de Franky entran solas en este libro." : "Prueba con Todas para ver el turno completo."}
            action={filter === "all" ? <PButton label="Nueva reserva" disabled={pending || !can("table.reserve")} onPress={() => setPreset({ date, turn })} /> : undefined}
          />
        )}
      </Panel>

      {demo ? <DroppedPanel onOffer={setOffer} /> : null}
      {demo ? <ConfirmPanel /> : null}

      {!demo ? (
        <RealWaitlistPanel onAdd={() => setPreset({ date: today, waitlist: true })} />
      ) : date === today ? (
        <Panel
          title="Lista de espera"
          description={waitlist.length ? `${plural(waitlist.length, "grupo esperando", "grupos esperando")}.` : "Nadie esperando ahora."}
          action={<PButton label="Apuntar" icon={UserPlus} small variant="outline" onPress={() => setPreset({ date: today, waitlist: true })} />}
          flush
        >
          {waitlist.length ? (
            waitlist.map((w, i) => <WaitRow key={w.id} booking={w} last={i === waitlist.length - 1} onOpen={() => setOpenId(w.id)} />)
          ) : (
            <View style={{ padding: S.lg }}>
              <PText v="small">Cuando la sala esté llena, apunta aquí a quien llegue y contacta con él cuando quede una mesa.</PText>
            </View>
          )}
        </Panel>
      ) : null}

      <Tip title="Tu libro, sin comisión">
        Las reservas que hacen los estudiantes en Franky entran aquí confirmadas y con sus alergias. No pagas nada por comensal: la cuota es fija y el cliente es tuyo.
      </Tip>
      <Tip title="Menos mesas vacías">
        Marca No vino cuando alguien no se presenta. Revisa las mesas que se liberan para sentar a las personas que están esperando.
      </Tip>

      {openId ? <ReservationDrawer bookingId={openId} onClose={() => setOpenId(null)} /> : null}
      <NewReservationDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </ProPage>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "violet" }) {
  return (
    <View style={{ flex: 1 }}>
      <PText v="tiny" numberOfLines={1}>{label}</PText>
      <Text
        style={{ fontFamily: FONT.heading, fontSize: 18, color: tone === "danger" ? C.errorText : tone === "violet" ? C.blue : C.text }}
        maxFontSizeMultiplier={1.3}
      >
        {value}
      </Text>
    </View>
  );
}

function groupByTime(list: ProBooking[]): [number, ProBooking[]][] {
  const map = new Map<number, ProBooking[]>();
  for (const b of list) {
    const m = localMinutes(b.start);
    map.set(m, [...(map.get(m) ?? []), b]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function BookRow({ booking: b, editable, confirmable, onOpen }: { booking: ProBooking; editable: boolean; confirmable: boolean; onOpen: () => void }) {
  const { data, pending, can } = usePro();
  const actions = useTableActions();
  const client = data.clients.find((c) => c.id === b.clientId);
  const muted = b.status === "done" || b.status === "no_show";
  return (
    <View style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: 1, borderBottomColor: C.borderLight, opacity: muted ? 0.6 : 1 }}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${b.clientName}, ${plural(b.partySize, "persona", "personas")}`} style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
        <PAvatar name={b.clientName} size={34} toneKey={b.student ? "violet" : "slate"} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{b.clientName}</PText>
            {b.student ? <StudentMark university={client?.student?.university} /> : null}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6 }}>
            <PText v="tiny">{plural(b.partySize, "persona", "personas")}</PText>
            <PText v="tiny">·</PText>
            <PText v="tiny">{tableName(data, b.resourceId) ?? "Sin mesa"}</PText>
            <PText v="tiny">·</PText>
            <SourceTag source={b.source} />
          </View>
          <NoteLine note={b.note} />
        </View>
      </Tap>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: S.sm }}>
        <TableStatus booking={b} />
        {confirmable && b.status === "requested" ? (
          <PButton label="Confirmar" small disabled={pending || !can("table.confirm")} onPress={() => void actions.confirm(b)} style={{ minHeight: 44 }} />
        ) : null}
        {editable && b.status === "confirmed" ? (
          <>
            <PButton label="No vino" small variant="ghost" disabled={pending || !can("table.no_show")} onPress={() => void actions.noShow(b)} style={{ minHeight: 44 }} />
            <PButton label="Sentar" small variant="outline" disabled={pending || !can("table.seat")} onPress={() => void actions.seat(b)} style={{ minHeight: 44 }} />
          </>
        ) : null}
        {editable && b.status === "arrived" ? (
          <PButton label="Se fue" small variant="outline" disabled={pending || !can("table.leave")} onPress={() => void actions.leave(b)} style={{ minHeight: 44 }} />
        ) : null}
      </View>
    </View>
  );
}

function WaitRow({ booking: w, last, onOpen }: { booking: ProBooking; last: boolean; onOpen: () => void }) {
  const { now } = usePro();
  const actions = useTableActions();
  const waited = Math.max(1, Math.round((now.getTime() - new Date(w.start).getTime()) / 60000));
  const amber = statusTone("amber");
  const long = waited >= 20;
  return (
    <View style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.borderLight }}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${w.clientName}, esperando ${waited} minutos`} style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
        <View style={{ width: 48, alignItems: "center", borderRadius: R.md, paddingVertical: 4, backgroundColor: long ? amber.bg : C.input }}>
          <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: long ? amber.fg : C.text }} maxFontSizeMultiplier={1.3}>{waited}</Text>
          <Text style={{ fontSize: 10, color: long ? amber.fg : C.muted }} maxFontSizeMultiplier={1.3}>min</Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14.5, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {w.clientName}
            <Text style={{ fontFamily: FONT.medium, color: C.muted }}>{` · ${w.partySize}p`}</Text>
          </Text>
          <PText v="tiny">{`Desde las ${time(w.start)} (${relative(w.start, now.getTime())})`}</PText>
          <NoteLine note={w.note} />
        </View>
      </Tap>
      <View style={{ flexDirection: "row", gap: S.sm }}>
        <PButton label="Avisar" icon={BellRing} small variant="secondary" onPress={() => actions.notify(w)} style={{ flex: 1, minHeight: 44 }} />
        <PButton label="Sentar" small variant="outline" onPress={onOpen} style={{ flex: 1, minHeight: 44 }} />
      </View>
    </View>
  );
}
