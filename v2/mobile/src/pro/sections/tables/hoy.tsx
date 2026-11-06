import React from "react";
import { Text, View } from "react-native";
import {
  AlertTriangle,
  BellRing,
  CalendarCheck2,
  Coffee,
  ScanLine,
  Sparkles,
  Stamp,
  UserRoundCheck,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProBooking } from "../../../../../shared/pro/types";
import { dayLabel, greeting, localDate, localMinutes, minutesToLabel, money, plural, relative, time, weekdayIndex } from "../../../../../shared/pro/format";
import { frankyResults } from "../../../../../shared/pro/results";
import {
  TURNS,
  TURN_ORDER,
  capacity,
  covers,
  currentTurn,
  fromFranky,
  hasAllergyNote,
  isWaitlist,
  nearbyReach,
  stampsFor,
  tableBookingsOn,
  tableLive,
  tableName,
  turnOf,
  waitlistOn,
  type Turn,
} from "../../../../../shared/pro/tables";
import { usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import { Empty, Kpi, KpiRow, ListRow, LiveDot, Meter, PAvatar, PButton, PText, PageHeader, Panel, Pill, Tip } from "../../kit";
import { SetupChecklist } from "../common/checklist";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import {
  FrankyBlock,
  NewReservationDrawer,
  NoteLine,
  RealWaitlistPanel,
  ReservationDrawer,
  SourceTag,
  StampDots,
  StudentMark,
  useTableActions,
  type NewReservationPreset,
} from "./table-kit";
import { BigFigure, Card, Fab, TextLink, statusTone, useFabPadding } from "./ui";
import {
  BonosHint,
  ClosingNoteBanner,
  ConfirmPanel,
  DroppedPanel,
  EventTodayPanel,
  GroupsTodayPanel,
  MarginAlertsCard,
  NoShowLine,
  RegularsCard,
  SeasonCard,
  SeptemberRadarCard,
  SoldOutPanel,
  TeamTodayPanel,
  ValleyCard,
} from "./today-panels";
import { OrdersMini, ShowcasePanel, StudyPanel } from "./cafe-panels";

export default function TablesHoy() {
  const { vertical, demo } = usePro();
  if (!demo) return <RealTablesHoy />;
  return vertical.id === "cafe" ? <CafeHoy /> : <ServiceHoy />;
}

/** Hora de la fila, en una columna fija a la izquierda. */
function TimeCell({ iso, late }: { iso: string; late?: boolean }) {
  return (
    <View style={{ width: 48 }}>
      <Text style={{ fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.3}>
        {time(iso)}
      </Text>
      {late ? (
        <Text style={{ fontFamily: FONT.semibold, fontSize: 11, color: C.errorText }} maxFontSizeMultiplier={1.3}>
          Tarde
        </Text>
      ) : null}
    </View>
  );
}

function RealTablesHoy() {
  const { data, now, pending, can, canView } = usePro();
  const go = useGoSection();
  const [preset, setPreset] = React.useState<NewReservationPreset>(null);
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const today = localDate(now);
  const bookings = tableBookingsOn(data, today);
  const live = data.tables.map((table) => ({ table, status: tableLive(data, table, now) }));
  const occupied = live.filter((item) => item.status.state === "seated");
  const people = occupied.reduce((sum, item) => sum + (item.status.occupiedPeople ?? item.status.current?.partySize ?? 0), 0);
  const waiting = data.tableOperations?.waitlist.filter((entry) => entry.status === "waiting" && Date.parse(entry.expiresAt) > now.getTime()) ?? [];
  return (
    <ProPage>
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description="Las reservas, llegadas y salidas registradas de hoy."
        actions={<PButton label="Nueva reserva" icon={CalendarCheck2} disabled={pending || !can("table.reserve")} onPress={() => setPreset({ date: today })} />}
      />
      <KpiRow>
        <Kpi icon={UtensilsCrossed} label="Cubiertos reservados" value={covers(bookings)} hint="Reservas de hoy" />
        <Kpi icon={Users} label="En sala ahora" value={people} hint={plural(occupied.length, "mesa sentada", "mesas sentadas")} />
        <Kpi icon={BellRing} label="Por confirmar" value={bookings.filter((booking) => booking.status === "requested").length} />
        <Kpi icon={UserRoundCheck} label="En espera" value={waiting.length} hint="Grupos en la lista de espera" />
      </KpiRow>
      <Panel title="Reservas de hoy" flush>
        {bookings.length ? (
          bookings.map((booking, i) => (
            <ListRow
              key={booking.id}
              last={i === bookings.length - 1}
              onPress={() => setBookingId(booking.id)}
              accessibilityLabel={`${time(booking.start)}, ${booking.clientName}, ${booking.partySize} personas`}
            >
              <TimeCell iso={booking.start} />
              <View style={{ flex: 1, gap: 1 }}>
                <PText v="h3" numberOfLines={1}>{booking.clientName}</PText>
                <PText v="tiny">{`${booking.partySize} personas · ${tableName(data, booking.resourceId) ?? "Sin mesa en el plano"}`}</PText>
                <NoteLine note={booking.note} />
              </View>
            </ListRow>
          ))
        ) : (
          <Empty icon={CalendarCheck2} title="Sin reservas hoy" body="Las reservas confirmadas aparecerán aquí." />
        )}
      </Panel>
      <RealWaitlistPanel onAdd={() => setPreset({ date: today, waitlist: true })} />
      <Panel title="Tu sala">
        <PText v="small">Consulta las mesas ocupadas y las que necesitan limpieza.</PText>
        <PButton label="Abrir sala" variant="outline" onPress={() => go("sala")} style={{ marginTop: S.md }} />
      </Panel>
      {canView("validar") ? (
        <Panel title="Franky Card">
          <PText v="small">Revisa la tarjeta del estudiante y registra su operación cuando haya confirmado.</PText>
          <PButton label="Validar tarjeta" onPress={() => go("validar")} style={{ marginTop: S.md }} />
        </Panel>
      ) : null}
      <NewReservationDrawer preset={preset} onClose={() => setPreset(null)} />
      <ReservationDrawer bookingId={bookingId} onClose={() => setBookingId(null)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Restaurante y bar                                                   */
/* ------------------------------------------------------------------ */

function ServiceHoy() {
  const { data, now, vertical } = usePro();
  const actions = useTableActions();
  const go = useGoSection();
  const fabPadding = useFabPadding();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewReservationPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const hours = data.space.hours[weekdayIndex(today)];
  const turns = TURN_ORDER.filter((t) => hours && TURNS[t].from >= hours.open && TURNS[t].lastSeat < hours.close);
  const cap = capacity(data);
  const list = tableBookingsOn(data, today);
  const coversToday = covers(list);
  const possible = cap * Math.max(1, turns.length);
  const requested = data.bookings
    .filter((b) => b.kind === "table" && b.status === "requested" && !isWaitlist(b) && localDate(b.start) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const pendingToday = list.filter((b) => b.status === "confirmed" || b.status === "requested" || b.status === "arrived");
  const allergies = pendingToday.filter((b) => hasAllergyNote(b.note));
  const groups = pendingToday.filter((b) => b.source === "grupo" || b.partySize >= 8);
  const live = data.tables.map((t) => ({ table: t, live: tableLive(data, t, now) }));
  const seated = live.filter((x) => x.live.state === "seated");
  const seatedCovers = seated.reduce((a, x) => a + (x.live.current?.partySize ?? 0), 0);
  const freeNow = live.filter((x) => x.live.state === "free" || (x.live.state === "soon" && x.live.minutes >= 45));
  const waitlist = waitlistOn(data, today);
  const upcoming = list.filter((b) => (b.status === "confirmed" || b.status === "requested") && localMinutes(b.start) >= nowMin - 20).slice(0, 7);
  const results = frankyResults(data, now, 30);
  const newGroups = data.groupRequests.filter((g) => g.status === "new");
  const hasSala = vertical.nav.some((n) => n.id === "sala");
  const kitchen = [...groups, ...allergies.filter((a) => !groups.includes(a))];
  const amber = statusTone("amber");

  const summary = !turns.length
    ? "Hoy no abres. Mañana tienes las reservas en el libro."
    : `Hoy tienes ${plural(coversToday, "cubierto reservado", "cubiertos reservados")} de ${possible} posibles${groups.length ? `, ${plural(groups.length, "grupo", "grupos")}` : ""}${allergies.length ? ` y ${plural(allergies.length, "alergia avisada", "alergias avisadas")}` : ""}.`;
  const newReservation = () => setPreset({ date: today, turn: currentTurn(nowMin) });

  return (
    <View style={{ flex: 1 }}>
      <ProPage contentStyle={fabPadding}>
        <PageHeader
          eyebrow={dayLabel(now.toISOString())}
          title={`${greeting(now)}, ${data.space.owner.firstName}`}
          description={summary}
          actions={<PButton label="Nueva reserva" icon={CalendarCheck2} onPress={newReservation} />}
        />

        <SetupChecklist />
        <ClosingNoteBanner />

        <KpiRow>
          <Kpi icon={UtensilsCrossed} label="Cubiertos hoy" value={coversToday} hint={`de ${possible} posibles`} />
          <Kpi icon={Users} label="En sala ahora" value={seatedCovers} hint={plural(seated.length, "mesa sentada", "mesas sentadas")} />
          <Kpi
            icon={BellRing}
            label="Por confirmar"
            value={requested.length}
            hint={requested.length ? "Reservas de Franky" : "Todo respondido"}
            emphasis={requested.length > 0}
          />
          <Kpi icon={Sparkles} label="Por Franky, 30 días" value={results.people} hint={`${money(results.revenueCents, { round: true })} sin comisión`} />
        </KpiRow>

        {requested.length ? (
          <Panel title="Esperan tu respuesta" description="Reservas pedidas en Franky. Si respondes rápido, vuelven." flush>
            {requested.slice(0, 4).map((b, i, shown) => (
              <View key={b.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === shown.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
                <Tap
                  onPress={() => setOpenId(b.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.clientName}, ${plural(b.partySize, "persona", "personas")}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: S.md }}
                >
                  <PAvatar name={b.clientName} size={34} toneKey={b.student ? "violet" : "slate"} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{b.clientName}</PText>
                      {b.student ? <StudentMark university={data.clients.find((c) => c.id === b.clientId)?.student?.university} /> : null}
                    </View>
                    <PText v="tiny" numberOfLines={1}>
                      {`${plural(b.partySize, "persona", "personas")} · ${localDate(b.start) === today ? "hoy" : dayLabel(b.start)} a las ${time(b.start)}`}
                    </PText>
                    <NoShowLine booking={b} />
                    <NoteLine note={b.note} />
                  </View>
                </Tap>
                <View style={{ flexDirection: "row", gap: S.sm }}>
                  <PButton label="Rechazar" small variant="ghost" onPress={() => void actions.decline(b)} style={{ flex: 1, minHeight: 44 }} />
                  <PButton label="Confirmar" small onPress={() => void actions.confirm(b)} style={{ flex: 1, minHeight: 44 }} />
                </View>
              </View>
            ))}
          </Panel>
        ) : null}

        <DroppedPanel onOffer={setOffer} />

        {turns.length ? (
          turns.map((t) => (
            <TurnCard key={t} turn={t} bookings={list.filter((b) => turnOf(localMinutes(b.start)) === t)} capacity={cap} nowMin={nowMin} />
          ))
        ) : (
          <Panel>
            <Empty icon={CalendarCheck2} title="Hoy no abres" body="Las reservas de mañana ya están en el libro. Revisa si hay alguna por confirmar." />
          </Panel>
        )}

        <GroupsTodayPanel />

        <Panel title="Próximas llegadas" description="Toca Sentar cuando entren por la puerta." action={<TextLink label="Libro" onPress={() => go("reservas")} />} flush>
          {upcoming.length ? (
            upcoming.map((b, i) => (
              <ArrivalRow key={b.id} booking={b} nowMin={nowMin} last={i === upcoming.length - 1} onOpen={() => setOpenId(b.id)} onSeat={() => void actions.seat(b)} />
            ))
          ) : (
            <Empty icon={UserRoundCheck} title="No queda nadie por llegar hoy" body="Las mesas que se sienten sin reserva las ves en la sala." />
          )}
        </Panel>

        {groups.length || allergies.length ? (
          <Panel title="Avisa a cocina" description="Grupos y alergias de las reservas que quedan hoy." flush>
            {kitchen.map((b, i) => (
              <ListRow
                key={b.id}
                last={i === kitchen.length - 1}
                onPress={() => setOpenId(b.id)}
                accessibilityLabel={`${time(b.start)}, ${b.clientName}, ${plural(b.partySize, "persona", "personas")}`}
              >
                <TimeCell iso={b.start} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 14.5, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {b.clientName}
                    <Text style={{ fontFamily: FONT.medium, color: C.muted }}>{` · ${plural(b.partySize, "persona", "personas")}`}</Text>
                  </Text>
                  {b.note ? <NoteLine note={b.note} /> : null}
                </View>
                {b.source === "grupo" || b.partySize >= 8 ? (
                  <Pill label="Grupo" tone="violet" />
                ) : (
                  <View accessible accessibilityLabel="Alergia">
                    <AlertTriangle size={16} color={amber.fg} strokeWidth={1.9} />
                  </View>
                )}
              </ListRow>
            ))}
          </Panel>
        ) : null}

        <ConfirmPanel />

        <Panel title="Mesas libres ahora" action={hasSala ? <TextLink label="Sala" onPress={() => go("sala")} /> : undefined}>
          <BigFigure value={freeNow.length} suffix={`de ${data.tables.length} mesas`} />
          <View style={{ marginTop: S.md }}>
            <Meter value={data.tables.length - freeNow.length} max={data.tables.length} tone={freeNow.length <= 2 ? "warning" : "violet"} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: S.md }}>
            {freeNow.slice(0, 12).map(({ table }) => (
              <View key={table.id} style={{ height: 32, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, borderRadius: R.sm, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.text }} maxFontSizeMultiplier={1.3}>{tableName(data, table.id)}</Text>
                <Text style={{ fontSize: 12, color: C.muted }} maxFontSizeMultiplier={1.3}>{`${table.seats}p`}</Text>
              </View>
            ))}
          </View>
        </Panel>

        <EventTodayPanel />

        <Panel
          title="Lista de espera"
          description={waitlist.length ? "Avisa por SMS cuando su mesa esté lista." : undefined}
          action={<PButton label="Apuntar" small variant="outline" onPress={() => setPreset({ date: today, waitlist: true })} />}
          flush
        >
          {waitlist.length ? (
            waitlist.map((w, i) => (
              <ListRow key={w.id} last={i === waitlist.length - 1}>
                <Tap onPress={() => setOpenId(w.id)} accessibilityRole="button" accessibilityLabel={`${w.clientName}, ${w.partySize} personas`} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 14.5, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {w.clientName}
                    <Text style={{ fontFamily: FONT.medium, color: C.muted }}>{` · ${w.partySize}p`}</Text>
                  </Text>
                  <PText v="tiny">{`Esperando ${relative(w.start, now.getTime()).replace("hace ", "")}`}</PText>
                </Tap>
                <PButton label="Avisar" icon={BellRing} small variant="secondary" onPress={() => actions.notify(w)} style={{ minHeight: 44 }} />
              </ListRow>
            ))
          ) : (
            <View style={{ padding: S.lg }}>
              <PText v="small">Nadie esperando. Si llega gente sin reservar con la sala llena, apúntala aquí.</PText>
            </View>
          )}
        </Panel>

        <TeamTodayPanel />
        <SoldOutPanel />

        <FrankyBlock />

        <DailyMenuMini />

        {newGroups.length ? (
          <Panel title="Grupos que quieren venir" flush>
            {newGroups.map((g, i) => (
              <ListRow key={g.id} last={i === newGroups.length - 1} onPress={() => go("grupos")} accessibilityLabel={`${g.kind}, ${g.organization}`}>
                <View style={{ flex: 1, gap: 1 }}>
                  <PText v="h3" numberOfLines={1}>{g.kind}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${g.organization} · ${g.people} personas · ${dayLabel(g.date, { weekday: false })}`}</PText>
                </View>
                <Pill label="Nueva" tone="violet" />
              </ListRow>
            ))}
          </Panel>
        ) : null}

        <SeasonCard onOffer={setOffer} />
        <ValleyCard onOffer={setOffer} />
        <SeptemberRadarCard onOffer={setOffer} />
        <RegularsCard />
        <MarginAlertsCard />

        <Tip title="Antes de abrir">
          Repasa alergias y grupos, y deja libre la mesa más grande hasta que llegue el grupo. Las reservas que no se presentan quedan en la ficha del cliente.
        </Tip>

        {openId ? <ReservationDrawer bookingId={openId} onClose={() => setOpenId(null)} /> : null}
        <NewReservationDrawer preset={preset} onClose={() => setPreset(null)} />
        <OfferComposer preset={offer} onClose={() => setOffer(null)} />
      </ProPage>
    </View>
  );
}

function TurnCard({ turn, bookings, capacity: cap, nowMin }: { turn: Turn; bookings: ProBooking[]; capacity: number; nowMin: number }) {
  const T = TURNS[turn];
  const c = covers(bookings);
  const live = nowMin >= T.from - 15 && nowMin < T.to;
  const over = nowMin >= T.to;
  const franky = bookings.filter((b) => fromFranky(b.source)).length;
  const allergies = bookings.filter((b) => hasAllergyNote(b.note) && b.status !== "done" && b.status !== "no_show").length;
  const seatedNow = bookings.filter((b) => b.status === "arrived").reduce((a, b) => a + b.partySize, 0);
  const amber = statusTone("amber");
  const emerald = statusTone("emerald");
  const stats = [
    { label: "Reservas", value: bookings.filter((b) => b.status !== "no_show").length, warn: false },
    { label: live ? "En sala" : "Por Franky", value: live ? seatedNow : franky, warn: false },
    { label: "Alergias", value: allergies, warn: allergies > 0 },
  ];
  return (
    <Card highlight={live ? `${C.blue}4D` : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
        <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text, flexShrink: 1 }} maxFontSizeMultiplier={1.3}>
          {`${T.label} `}
          <Text style={{ fontFamily: FONT.medium, fontSize: 13.5, color: C.muted }}>{`${minutesToLabel(T.from)} a ${minutesToLabel(T.to)}`}</Text>
        </Text>
        {live ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <LiveDot />
            <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: emerald.fg }} maxFontSizeMultiplier={1.3}>En curso</Text>
          </View>
        ) : over ? (
          <Pill label="Terminado" />
        ) : (
          <Pill label={`A las ${minutesToLabel(T.from)}`} tone="info" />
        )}
      </View>
      <View style={{ marginTop: S.md }}>
        <BigFigure value={c} suffix={`/ ${cap} cubiertos`} size={30} />
      </View>
      <View style={{ marginTop: S.sm }}>
        <Meter value={c} max={cap} tone={c / Math.max(1, cap) > 0.9 ? "warning" : "violet"} />
      </View>
      <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
        {stats.map((s) => (
          <View key={s.label} style={{ flex: 1, alignItems: "center", borderRadius: R.md, paddingVertical: S.sm, backgroundColor: s.warn ? amber.bg : C.input }}>
            <Text style={{ fontSize: 11, color: s.warn ? amber.fg : C.muted }} maxFontSizeMultiplier={1.3}>{s.label}</Text>
            <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3}>{s.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function ArrivalRow({ booking: b, nowMin, last, onOpen, onSeat }: { booking: ProBooking; nowMin: number; last: boolean; onOpen: () => void; onSeat: () => void }) {
  const { data } = usePro();
  const late = localMinutes(b.start) < nowMin;
  const client = data.clients.find((c) => c.id === b.clientId);
  return (
    <ListRow last={last}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${time(b.start)}, ${b.clientName}`} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: S.md }}>
        <TimeCell iso={b.start} late={late} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{b.clientName}</PText>
            {b.student ? <StudentMark university={client?.student?.university} /> : null}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.sm }}>
            <PText v="tiny">{`${b.partySize}p`}</PText>
            <PText v="tiny">{tableName(data, b.resourceId) ?? "Sin mesa"}</PText>
            <SourceTag source={b.source} />
          </View>
          <NoteLine note={b.note} />
        </View>
      </Tap>
      {b.status === "requested" ? <Pill label="Por confirmar" tone="warning" /> : <PButton label="Sentar" small variant="outline" onPress={onSeat} style={{ minHeight: 44 }} />}
    </ListRow>
  );
}

function usePublishDaily() {
  const { data, update } = usePro();
  const reach = data.space.demo && data.space.walkMinutesToCampus !== null ? nearbyReach(data.space.walkMinutesToCampus) : null;
  const publish = async () => {
    if (!(await update("daily.publish", (d) => (d.dailyMenu ? { ...d, dailyMenu: { ...d.dailyMenu, published: true } } : d)))) return;
    toast("Menú publicado", {
      kind: "success",
      body: reach === null ? undefined : `Lo verán unos ${reach.toLocaleString("es-ES")} estudiantes cerca de ti antes de comer.`,
    });
  };
  return { reach, publish };
}

function DailyMenuMini() {
  const { data, pending, can } = usePro();
  const go = useGoSection();
  const { reach, publish } = usePublishDaily();
  const menu = data.dailyMenu;
  if (!menu) return null;
  return (
    <Panel title="Menú del día" action={<TextLink label="Editar" onPress={() => go("carta")} />}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md }}>
        <Text style={{ flexShrink: 1, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.3}>
          <Text style={{ fontFamily: FONT.display, fontSize: 20, color: C.text }}>{money(menu.priceCents)}</Text>
          {menu.studentPriceCents ? `  estudiantes ${money(menu.studentPriceCents)}` : ""}
        </Text>
        {menu.published ? <Pill label="Publicado" tone="success" /> : <Pill label="Sin publicar" tone="warning" />}
      </View>
      <PText v="small" color={C.text} numberOfLines={2} style={{ marginTop: S.sm }}>
        {[...menu.starters, ...menu.mains].join(", ")}
      </PText>
      {!menu.published ? (
        <PButton label="Publicar para estudiantes" full disabled={pending || !can("daily.publish")} onPress={() => void publish()} style={{ marginTop: S.md }} />
      ) : reach !== null ? (
        <PText v="tiny" style={{ marginTop: S.sm }}>{`Lo están viendo unos ${reach.toLocaleString("es-ES")} estudiantes a menos de 2 km.`}</PText>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Cafetería                                                           */
/* ------------------------------------------------------------------ */

function CafeHoy() {
  const { data, now } = usePro();
  const go = useGoSection();
  const fabPadding = useFabPadding();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const todays = data.validations.filter((v) => localDate(v.at) === today).sort((a, b) => b.at.localeCompare(a.at));
  const discounts = todays.reduce((a, v) => a + v.discountCents, 0);
  const sales = todays.reduce((a, v) => a + v.amountCents - v.discountCents, 0);
  const rewards = todays.filter((v) => v.kind === "reward").length;
  const stampsToday = data.loyalty?.stampsToday ?? todays.filter((v) => v.kind !== "reward").length;
  const results = frankyResults(data, now, 30);

  const regularNames = [...new Set(todays.map((v) => v.clientName))]
    .map((name) => ({
      name,
      client: data.clients.find((c) => c.name === name),
      last: todays.find((v) => v.clientName === name)!,
    }))
    .filter((x) => (x.client?.visits ?? 0) >= 15);

  const hours = data.space.hours[weekdayIndex(today)];
  const open = Boolean(hours && nowMin >= hours.open && nowMin < hours.close);
  const regulars = regularNames.slice(0, 6);
  const latest = todays.slice(0, 6);

  return (
    <View style={{ flex: 1 }}>
      <ProPage contentStyle={fabPadding}>
        <PageHeader
          eyebrow={dayLabel(now.toISOString())}
          title={`${greeting(now)}, ${data.space.owner.firstName}`}
          description={
            todays.length
              ? `Llevas ${plural(todays.length, "validación", "validaciones")} y ${plural(stampsToday, "sello", "sellos")} hoy. ${plural(regularNames.length, "cliente habitual ya ha pasado", "clientes habituales ya han pasado")}.`
              : open
                ? "Todavía no has validado ninguna tarjeta hoy. La primera suele llegar con el café de antes de clase."
                : "Hoy aún no has abierto. Tus números de ayer están en Resultados."
          }
          actions={<PButton label="Validar tarjeta" icon={ScanLine} onPress={() => go("validar")} />}
        />

        <SetupChecklist />
        <ClosingNoteBanner />

        <KpiRow>
          <Kpi icon={ScanLine} label="Validaciones hoy" value={todays.length} hint={`${money(discounts)} en descuentos`} />
          <Kpi icon={Stamp} label="Sellos hoy" value={stampsToday} hint={rewards ? plural(rewards, "premio canjeado", "premios canjeados") : "Ningún premio todavía"} />
          <Kpi icon={Wallet} label="Ventas con Card" value={money(sales, { round: true })} hint="Hoy, ya con descuento" />
          <Kpi icon={Sparkles} label="Por Franky, 30 días" value={results.people} hint={`${money(results.revenueCents, { round: true })} sin comisión`} emphasis />
        </KpiRow>

        <ShowcasePanel onOffer={setOffer} />

        <OrdersMini />

        <CafeMenuPanel />

        <BonosHint />

        <Panel title="Habituales de hoy" description="Estudiantes que vienen casi a diario. Salúdales por su nombre." flush>
          {regulars.length ? (
            regulars.map(({ name, client, last }, i) => {
              const stamps = data.loyalty ? stampsFor(data.validations, name, data.loyalty.stampsNeeded) : 0;
              return (
                <ListRow key={name} last={i === regulars.length - 1}>
                  <PAvatar name={name} size={34} toneKey="violet" />
                  <View style={{ flex: 1, gap: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</PText>
                      <StudentMark university={client?.student?.university} />
                    </View>
                    <PText v="tiny">{`${client?.visits ?? 0} visitas · hoy a las ${time(last.at)}`}</PText>
                  </View>
                  {data.loyalty ? <StampDots value={stamps} max={data.loyalty.stampsNeeded} /> : null}
                </ListRow>
              );
            })
          ) : (
            <Empty icon={Coffee} title="Aún no ha venido ningún habitual" body="Cuando un cliente fijo valide su tarjeta, aparecerá aquí con sus sellos." />
          )}
        </Panel>

        <Panel title="Últimas validaciones" action={<TextLink label="Historial" onPress={() => go("validar")} />} flush>
          {latest.length ? (
            latest.map((v, i) => (
              <ListRow key={v.id} last={i === latest.length - 1}>
                <Text style={{ width: 46, fontFamily: FONT.semibold, fontSize: 13.5, color: C.muted }} maxFontSizeMultiplier={1.3}>{time(v.at)}</Text>
                <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>{v.clientName}</PText>
                <Pill
                  label={v.kind === "reward" ? "Premio" : v.kind === "stamp" ? "Sello" : `-${money(v.discountCents)}`}
                  tone={v.kind === "reward" ? "success" : v.kind === "stamp" ? "neutral" : "violet"}
                />
                <Text style={{ width: 64, textAlign: "right", fontFamily: FONT.semibold, fontSize: 13.5, color: C.text }} maxFontSizeMultiplier={1.3}>
                  {money(v.amountCents - v.discountCents)}
                </Text>
              </ListRow>
            ))
          ) : (
            <Empty icon={ScanLine} title="Sin validaciones hoy" body="Cuando un estudiante te enseñe su Franky Card, valida en tres toques." />
          )}
        </Panel>

        <StudyPanel onOffer={setOffer} />

        <SeasonCard onOffer={setOffer} />
        <ValleyCard onOffer={setOffer} />
        <SeptemberRadarCard onOffer={setOffer} />
        <RegularsCard />
        <MarginAlertsCard />

        <FrankyBlock />

        <Tip title="Temporada de exámenes">
          En enero y junio los estudiantes buscan dónde estudiar. Con el sitio activado apareces en su mapa; un café rellenable a mitad de precio llena las tardes flojas.
        </Tip>

        <OfferComposer preset={offer} onClose={() => setOffer(null)} />
      </ProPage>
      <Fab label="Validar" icon={ScanLine} onPress={() => go("validar")} />
    </View>
  );
}

function CafeMenuPanel() {
  const { data, pending, can } = usePro();
  const go = useGoSection();
  const { reach, publish } = usePublishDaily();
  const menu = data.dailyMenu;
  const breakfast = data.offers.find((o) => o.kind === "valley" && o.status === "live");
  if (!menu)
    return (
      <Panel>
        <Empty
          icon={UtensilsCrossed}
          title="Sin menú del día"
          body="Un menú a mediodía con precio de estudiante es lo que más visitas trae entre semana."
          action={<PButton label="Crear menú del día" onPress={() => go("carta")} />}
        />
      </Panel>
    );
  return (
    <Card highlight={menu.published ? undefined : statusTone("amber").border}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.md }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <PText v="label">Menú del día</PText>
          <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.3}>
            {money(menu.priceCents)}
            {menu.studentPriceCents ? (
              <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: C.blue }}>{`  ${money(menu.studentPriceCents)} con carnet`}</Text>
            ) : null}
          </Text>
        </View>
        {menu.published ? <Pill label="Publicado" tone="success" /> : <Pill label="Sin publicar" tone="warning" />}
      </View>
      <View style={{ gap: S.md, marginTop: S.md }}>
        {[
          { label: "Primeros", items: menu.starters },
          { label: "Segundos", items: menu.mains },
          { label: "Postres", items: menu.desserts },
        ].map((g) => (
          <View key={g.label} style={{ gap: 2 }}>
            <PText v="tiny" style={{ fontFamily: FONT.semibold }}>{g.label}</PText>
            {g.items.map((item) => (
              <PText key={item} v="small" color={C.text} numberOfLines={1}>{item}</PText>
            ))}
          </View>
        ))}
      </View>
      {breakfast ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: S.md, paddingTop: S.md, borderTopWidth: 1, borderTopColor: C.borderLight }}>
          <LiveDot />
          <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{breakfast.detail}</PText>
          <PText v="tiny">{`${breakfast.claimed} hoy`}</PText>
        </View>
      ) : null}
      <View style={{ gap: S.sm, marginTop: S.lg }}>
        {!menu.published ? (
          <PButton label="Publicar para estudiantes" full disabled={pending || !can("daily.publish")} onPress={() => void publish()} />
        ) : reach !== null ? (
          <PText v="tiny">{`Lo están viendo unos ${reach.toLocaleString("es-ES")} estudiantes a menos de 2 km.`}</PText>
        ) : null}
        <PButton label="Editar menú" variant="outline" full onPress={() => go("carta")} />
      </View>
    </Card>
  );
}
