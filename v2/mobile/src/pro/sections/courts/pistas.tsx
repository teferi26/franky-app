import React from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BadgeCheck, CalendarX2, Check, CloudRain, Lock, Plus, Send, Sparkles, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import type { ProBooking, ProResource } from "../../../../../shared/pro/types";
import { addDays, capitalize, dayLabel, localDate, localMinutes, minutesToLabel, money, plural, time } from "../../../../../shared/pro/format";
import {
  MATCH_MINUTES,
  SLOT_MINUTES,
  VALLEY_FROM,
  VALLEY_TO,
  dayOccupancy,
  hoursFor,
  isBusy,
  isShared,
  isValley,
  matchesOn,
  occupancyAt,
  perPlayer,
  priceFor,
  resourceBookings,
  resourceOpenings,
  valleyGaps,
  type OpenMatchX,
} from "../../../../../shared/pro/courts";
import { shortUni } from "../../../../../shared/pro/classes";
import { Empty, ListRow, LiveDot, Meter, PButton, PageHeader, Panel, PText, Pill, Segmented, StepNav, TONE_HEX, Tip, tone } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { ResourceDrawer } from "./resource-drawer";
import {
  CourtBookingDrawer,
  MatchDrawer,
  NewCourtBookingDrawer,
  NewMatchDrawer,
  courtsCopy,
  fromFranky,
  matchReach,
  type NewCourtPreset,
  type NewMatchPreset,
} from "./parts";
import { AvatarStack, MoreButton, useMore } from "./ui";
import { BLOCK_REASON_LABEL, blocksOn, clockLabel, courtsOps } from "../../../../../shared/pro/courts-base";
import { BLOCK_TONE, BlockDrawer, type BlockTarget } from "./block-drawer";
import { RainDrawer } from "./rain-drawer";
import { NewSeriesDrawer, SeriesView, type SeriesPreset } from "./turnos";

const ROW = 42; // Mantiene un objetivo táctil cómodo por media hora.
const HOUR_W = 48; // Columna de horas, fija a la izquierda.
const MIN_COL_W = 128; // Ancho mínimo de cada pista.

export default function PistasSection() {
  const { data, now, vertical, update, demo, can, pending, loadDate } = usePro();
  const params = useLocalSearchParams<{ vista?: string }>();
  const copy = courtsCopy(vertical.id);
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [view, setView] = React.useState<"calendar" | "matches" | "fixed">("calendar");
  const [block, setBlock] = React.useState<BlockTarget>(null);
  const [rain, setRain] = React.useState(false);
  const [series, setSeries] = React.useState<SeriesPreset>(null);
  const [date, setDate] = React.useState(today);
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [openMatch, setOpenMatch] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewCourtPreset>(null);
  const [newMatch, setNewMatch] = React.useState<NewMatchPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const [resourcesOpen, setResourcesOpen] = React.useState(false);
  React.useEffect(() => {
    if (!demo) void loadDate(date);
  }, [date, demo, loadDate]);

  // Desde Hoy se puede llegar directo a la pestaña de partidos abiertos.
  React.useEffect(() => {
    if (demo && !coworking && params.vista === "partidos") setView("matches");
    if (demo && !coworking && params.vista === "fijos") setView("fixed");
  }, [coworking, demo, params.vista]);

  const label = vertical.nav.find((n) => n.id === "pistas")?.label ?? copy.section;
  const list = resourceBookings(data, date).filter((b) => b.status !== "no_show");
  const dayList = useMore(list);
  const occ = dayOccupancy(data, date);
  const expected = list.reduce((a, b) => a + b.priceCents, 0);
  const people = data.resources.filter(isShared).reduce((a, r) => a + occupancyAt(data, r, today, nowMin), 0);
  const seats = data.resources.filter(isShared).reduce((a, r) => a + r.capacity, 0);
  const matches = (data.openMatches as OpenMatchX[])
    .filter((m) => new Date(m.start).getTime() + MATCH_MINUTES * 60000 > now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));
  const gaps = date >= today ? valleyGaps(data, date, date === today ? nowMin : 0) : [];

  const dayName = date === today ? "Hoy" : date === addDays(today, 1) ? "Mañana" : "";

  const publishAll = () => {
    const unpublished = matches.filter((m) => !m.publishedAt);
    void update("match.publish.all", (d) => ({
      ...d,
      openMatches: d.openMatches.map((m) =>
        unpublished.some((p) => p.id === m.id) ? ({ ...m, publishedAt: now.toISOString(), reach: matchReach(m.level) } as OpenMatchX) : m,
      ),
    }));
  };

  const offerFirstGap = () => {
    const g = gaps[0];
    const r = data.resources.find((x) => x.id === g.resourceId)!;
    const price =
      r.kind === "court"
        ? priceFor({ ...r, valleyPricePerHourCents: undefined }, g.date, g.from, MATCH_MINUTES)
        : r.pricePerHourCents === null
          ? null
          : r.pricePerHourCents * (isShared(r) ? 4 : 2);
    if (price === null) return;
    setOffer({
      what: copy.what(r),
      date: g.date,
      from: g.from,
      to: g.to,
      priceCents: price,
      slots: isShared(r) ? g.free : Math.max(1, Math.floor((g.to - g.from) / MATCH_MINUTES)),
    });
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow={label}
        title={view === "calendar" ? capitalize(dayLabel(`${date}T12:00:00Z`)) : view === "fixed" ? "Turnos fijos" : "Partidos abiertos"}
        description={
          view === "calendar"
            ? coworking
              ? `${date === today ? `Ahora ${people} de ${seats} puestos ocupados. ` : ""}${plural(list.length, "reserva", "reservas")}, ${occ} % de ocupación del día.`
              : `${plural(list.length, "reserva", "reservas")}, pistas al ${occ} %${demo || can("finance.read") ? ` y ${money(expected, { round: true })} previstos` : ""}${demo && gaps.length ? `. ${plural(gaps.length, "franja valle libre", "franjas valle libres")}.` : "."}`
            : view === "fixed"
              ? "El mismo grupo, la misma pista y la misma hora cada semana hasta fin de curso."
              : matches.length
                ? `${plural(matches.length, "partido espera", "partidos esperan")} jugadores. Franky los enseña a estudiantes de nivel parecido y de su universidad.`
                : "Para quien quiere jugar y no tiene con quién. Se completan con estudiantes de nivel parecido."
        }
        actions={
          view === "calendar" ? (
            <>
              <PButton label={copy.newBooking} icon={Plus} disabled={pending || !can("court.create")} onPress={() => setPreset({ date: date < today ? today : date })} />
              {demo ? <PButton label="Bloquear" icon={Lock} variant="outline" onPress={() => setBlock({ mode: "new", date: date < today ? today : date })} /> : null}
              {demo && !coworking && courtsOps(data).coveredIds.length ? (
                <PButton label="Llueve" icon={CloudRain} variant="outline" onPress={() => setRain(true)} />
              ) : null}
            </>
          ) : view === "fixed" ? (
            <PButton label="Nuevo turno fijo" icon={Plus} onPress={() => setSeries({})} />
          ) : (
            <PButton label="Nuevo partido abierto" icon={Plus} onPress={() => setNewMatch({ date: today })} />
          )
        }
      >
        {demo && !coworking ? (
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "calendar", label: "Calendario" },
              { value: "matches", label: "Partidos abiertos", count: matches.length },
              { value: "fixed", label: "Turnos fijos", count: courtsOps(data).series.filter((x) => x.active).length },
            ]}
          />
        ) : null}
      </PageHeader>

      {view === "calendar" ? (
        <>
          {!demo && can("resource.save") ? (
            <PButton label="Gestionar espacios" variant="outline" small onPress={() => setResourcesOpen(true)} style={{ marginBottom: S.md }} />
          ) : null}
          <StepNav
            label={date === today ? "" : dayName}
            onPrev={() => setDate(addDays(date, -1))}
            onNext={() => setDate(addDays(date, 1))}
            onToday={() => setDate(today)}
            isToday={date === today}
          />
          {demo && gaps.length ? (
            <PButton
              label="Ofrecer la franja valle a estudiantes"
              icon={Send}
              variant="secondary"
              small
              disabled={data.resources.find((resource) => resource.id === gaps[0].resourceId)?.pricePerHourCents === null}
              onPress={offerFirstGap}
              style={{ marginBottom: S.md }}
            />
          ) : null}

          {coworking && date === today ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginBottom: S.lg }}>
              {data.resources.map((r) => {
                const o = occupancyAt(data, r, today, nowMin);
                const cap = isShared(r) ? r.capacity : 1;
                return (
                  <View key={r.id} style={{ width: "48.5%", borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: S.md, paddingVertical: S.md, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <LiveDot />
                      <PText v="small" numberOfLines={1} style={{ flexShrink: 1 }}>{r.name}</PText>
                    </View>
                    <Text style={{ fontFamily: FONT.display, fontSize: 20, color: C.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.2}>
                      {isShared(r) ? (
                        <>
                          {o}
                          <Text style={{ fontSize: 14, color: C.muted }}>{`/${r.capacity}`}</Text>
                        </>
                      ) : o ? (
                        "Ocupada"
                      ) : (
                        "Libre"
                      )}
                    </Text>
                    <Meter value={Math.min(cap, o)} max={cap} tone={o >= cap ? "danger" : o / cap > 0.75 ? "warning" : "success"} />
                  </View>
                );
              })}
            </View>
          ) : null}

          <CourtCalendar
            date={date}
            onOpen={setOpenBooking}
            onOpenMatch={setOpenMatch}
            onOpenBlock={(blockId) => setBlock({ mode: "view", date, blockId })}
            onNew={(resourceId, minute) => setPreset({ date, resourceId, minute })}
          />

          {!demo && list.length > 0 ? (
            <Panel title="Reservas del día" flush>
              {dayList.visible.map((booking, index) => (
                <ListRow
                  key={booking.id}
                  onPress={() => setOpenBooking(booking.id)}
                  accessibilityLabel={`${booking.clientName}, ${time(booking.start)} a ${time(booking.end)}`}
                  last={index === dayList.visible.length - 1 && !dayList.more}
                >
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>{booking.clientName}</PText>
                    <PText v="tiny" numberOfLines={1}>
                      {`${data.resources.find((resource) => resource.id === booking.resourceId)?.name ?? ""} · ${booking.partySize} ${booking.partySize === 1 ? "persona" : "personas"}`}
                    </PText>
                  </View>
                  <PText v="small" color={C.text} style={{ fontVariant: ["tabular-nums"] }}>{`${time(booking.start)} a ${time(booking.end)}`}</PText>
                </ListRow>
              ))}
              <MoreButton onPress={dayList.more} />
            </Panel>
          ) : null}

          {demo ? (
            <Tip title={coworking ? "Mapa de estudio" : "Precio valle"}>
              {coworking
                ? "Los estudiantes ven en Franky cuántos puestos te quedan libres en cada zona, en directo. Si ven sitio, vienen andando desde el campus."
                : `La banda verde es la franja valle (de ${minutesToLabel(VALLEY_FROM)} a ${minutesToLabel(VALLEY_TO)} entre semana). Al reservar en ella el precio baja solo y se enseña a estudiantes, no al resto.`}
            </Tip>
          ) : null}
        </>
      ) : view === "fixed" ? (
        <SeriesView onNew={() => setSeries({})} />
      ) : (
        <MatchesList matches={matches} onOpen={setOpenMatch} onPublishAll={publishAll} onNew={() => setNewMatch({ date: today })} />
      )}

      <CourtBookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      {!demo ? <ResourceDrawer open={resourcesOpen} onClose={() => setResourcesOpen(false)} /> : null}
      <MatchDrawer matchId={openMatch} onClose={() => setOpenMatch(null)} />
      <NewCourtBookingDrawer preset={preset} onClose={() => setPreset(null)} />
      <NewMatchDrawer preset={newMatch} onClose={() => setNewMatch(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
      {demo ? <BlockDrawer target={block} onClose={() => setBlock(null)} /> : null}
      {demo ? <RainDrawer date={date < today ? today : date} open={rain} onClose={() => setRain(false)} /> : null}
      {demo ? <NewSeriesDrawer preset={series} onClose={() => setSeries(null)} /> : null}
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Calendario por pista o espacio                                      */
/* ------------------------------------------------------------------ */

/**
 * Una columna por pista dentro de un desplazamiento horizontal; la columna de
 * horas queda fija a la izquierda y la fila de nombres se mueve a la vez que
 * las pistas. En vertical se desplaza dentro de su propia caja para poder
 * abrir el día a la hora actual.
 */
function CourtCalendar({ date, onOpen, onOpenMatch, onOpenBlock, onNew }: {
  date: string;
  onOpen: (id: string) => void;
  onOpenMatch: (id: string) => void;
  onOpenBlock: (blockId: string) => void;
  onNew: (resourceId: string, minute: number) => void;
}) {
  const { data, now, demo, pending, can } = usePro();
  const { width, height } = useWindowDimensions();
  const windows = data.resources.flatMap((resource) => resourceOpenings(data, date, resource.id));
  const hours = demo
    ? hoursFor(data, date)
    : windows.length
      ? { open: Math.min(...windows.map((window) => window.open)), close: Math.max(...windows.map((window) => window.close)) }
      : null;
  const verticalRef = React.useRef<ScrollView>(null);
  const headerRef = React.useRef<ScrollView>(null);
  const today = localDate(now);
  const nowMin = localMinutes(now);

  const start = hours ? Math.floor(hours.open / 60) * 60 : 8 * 60;
  const end = hours ? Math.ceil(hours.close / 60) * 60 : 22 * 60;

  React.useEffect(() => {
    const id = setTimeout(() => {
      const el = verticalRef.current;
      if (!el) return;
      if (date !== today) {
        el.scrollTo({ y: 0, animated: false });
        return;
      }
      el.scrollTo({ y: Math.max(0, ((nowMin - start) / SLOT_MINUTES) * ROW - 90), animated: false });
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  if (!data.resources.length) {
    return (
      <Empty icon={CalendarX2} title="Añade tu primera pista o espacio" body="Configura los espacios que se pueden reservar para empezar a organizar tu calendario." />
    );
  }
  if (!hours) {
    return (
      <Panel>
        <Empty icon={CalendarX2} title="Cerrado este día" body="Elige otro día o revisa los horarios del espacio." />
      </Panel>
    );
  }

  const slots = Array.from({ length: (hours.close - hours.open) / SLOT_MINUTES }, (_, i) => hours.open + i * SLOT_MINUTES);
  const marks = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  const y = (m: number) => ((m - start) / SLOT_MINUTES) * ROW;
  const valleyToday = demo && isValley(date, VALLEY_FROM);
  const green = TONE_HEX.emerald;
  const rose = TONE_HEX.rose;
  const available = width - S.lg * 2 - 2 - HOUR_W;
  const colW = Math.max(MIN_COL_W, Math.floor(available / data.resources.length));
  const gridW = colW * data.resources.length;
  const bodyH = y(end);
  const showNow = date === today && nowMin >= start && nowMin <= end;
  const opensAt = (r: ProResource, minute: number) => resourceOpenings(data, date, r.id).some((window) => window.open <= minute && window.close > minute);

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: "hidden", marginBottom: S.lg, ...SHADOW.card }}>
      {/* Nombres de las pistas: siguen al desplazamiento horizontal */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ width: HOUR_W }} />
        <ScrollView ref={headerRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", width: gridW }}>
            {data.resources.map((r) => {
              const count = resourceBookings(data, date, r.id).filter((b) => b.status !== "no_show").length;
              const openSlots = slots.filter((minute) => opensAt(r, minute));
              const busySlots = openSlots.filter((m) => occupancyAt(data, r, date, m) > 0).length;
              return (
                <View key={r.id} style={{ width: colW, borderLeftWidth: 1, borderLeftColor: C.borderLight, paddingHorizontal: S.md, paddingVertical: 10, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone(r.tone).bar }} />
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{r.name}</PText>
                  </View>
                  <PText v="tiny" numberOfLines={1}>
                    {isShared(r)
                      ? `${r.capacity} puestos · ${count} reservas`
                      : `${count} ${count === 1 ? "reserva" : "reservas"} · ${Math.round((busySlots / Math.max(1, openSlots.length)) * 100)} %`}
                  </PText>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <ScrollView ref={verticalRef} nestedScrollEnabled style={{ maxHeight: Math.max(420, height * 0.62) }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", height: bodyH }}>
          {/* Horas, fijas a la izquierda */}
          <View style={{ width: HOUR_W, height: bodyH }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {marks.map((m) =>
              m < end && m > start ? (
                <Text
                  key={m}
                  style={{ position: "absolute", right: 8, top: y(m) - 7, fontSize: 11, fontFamily: FONT.medium, color: C.muted, fontVariant: ["tabular-nums"] }}
                  maxFontSizeMultiplier={1.2}
                >
                  {minutesToLabel(m)}
                </Text>
              ) : null,
            )}
            {valleyToday ? (
              <Text style={{ position: "absolute", left: 4, top: y(VALLEY_FROM) + 4, fontSize: 9.5, fontFamily: FONT.heading, letterSpacing: 0.6, color: green }} maxFontSizeMultiplier={1.2}>
                VALLE
              </Text>
            ) : null}
            {showNow ? <View style={{ position: "absolute", right: -5, top: y(nowMin) - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: rose, zIndex: 10 }} /> : null}
          </View>

          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => headerRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false })}
          >
            <View style={{ width: gridW, height: bodyH }}>
              {/* Rejilla, franja valle y horas cerradas */}
              <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}>
                {valleyToday ? (
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: y(Math.max(VALLEY_FROM, hours.open)),
                      height: y(Math.min(VALLEY_TO, hours.close)) - y(Math.max(VALLEY_FROM, hours.open)),
                      backgroundColor: `${green}14`,
                    }}
                  />
                ) : null}
                {marks.slice(0, -1).map((m) => (
                  <View key={m} style={{ position: "absolute", left: 0, right: 0, top: y(m), borderTopWidth: 1, borderTopColor: C.borderLight }} />
                ))}
                <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: y(hours.open), backgroundColor: C.input, opacity: 0.7 }} />
                <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: y(end) - y(hours.close), backgroundColor: C.input, opacity: 0.7 }} />
              </View>

              <View style={{ flexDirection: "row", height: bodyH }}>
                {data.resources.map((r) => (
                  <View key={r.id} style={{ width: colW, height: bodyH, borderLeftWidth: 1, borderLeftColor: C.borderLight }}>
                    {slots
                      .filter((minute) => !opensAt(r, minute))
                      .map((minute) => (
                        <View
                          key={`closed-${minute}`}
                          pointerEvents="none"
                          style={{ position: "absolute", left: 0, right: 0, top: y(minute), height: ROW, backgroundColor: C.input, paddingHorizontal: S.sm, paddingTop: S.sm }}
                        >
                          {minute % 60 === 0 ? <PText v="tiny">Cerrado</PText> : null}
                        </View>
                      ))}
                    {demo
                      ? blocksOn(data, date, r.id).map((bk) => {
                          const tint = TONE_HEX[BLOCK_TONE[bk.reason]];
                          return (
                            <Tap
                              key={bk.id}
                              onPress={() => onOpenBlock(bk.id)}
                              accessibilityRole="button"
                              accessibilityLabel={`${BLOCK_REASON_LABEL[bk.reason]} de ${clockLabel(bk.from)} a ${clockLabel(bk.to)}`}
                              style={{
                                position: "absolute",
                                left: 4,
                                right: 4,
                                zIndex: 6,
                                top: y(Math.max(start, bk.from)) + 1,
                                height: Math.max(ROW - 2, y(Math.min(end, bk.to)) - y(Math.max(start, bk.from)) - 2),
                                borderRadius: R.sm,
                                borderLeftWidth: 3,
                                borderLeftColor: tint,
                                backgroundColor: `${tint}24`,
                                paddingHorizontal: S.sm,
                                paddingVertical: 4,
                                overflow: "hidden",
                              }}
                            >
                              <Text style={{ fontSize: 12.5, fontFamily: FONT.heading, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                                {bk.note ?? BLOCK_REASON_LABEL[bk.reason]}
                              </Text>
                              <Text style={{ fontSize: 11, color: C.muted, fontVariant: ["tabular-nums"] }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                                {`${clockLabel(bk.from)} a ${clockLabel(bk.to)}`}
                              </Text>
                            </Tap>
                          );
                        })
                      : null}
                    {isShared(r) ? (
                      slots.map((m) => {
                        if (!opensAt(r, m)) return null;
                        const o = occupancyAt(data, r, date, m);
                        const ratio = o / r.capacity;
                        const past = date < today || (date === today && m + SLOT_MINUTES <= nowMin);
                        const full = isBusy(data, r, date, m);
                        const bg = ratio === 0 ? "transparent" : ratio < 0.5 ? `${C.blue}26` : ratio < 0.85 ? `${C.blue}59` : C.blue;
                        const fg = ratio >= 0.85 ? C.onAccent : ratio === 0 ? C.muted : C.blueDeep;
                        return (
                          <Tap
                            key={m}
                            disabled={past || full || pending || !can("court.create")}
                            onPress={() => onNew(r.id, m)}
                            accessibilityRole="button"
                            accessibilityLabel={`${r.name} a las ${minutesToLabel(m)}: ${o} de ${r.capacity} puestos`}
                            style={{
                              position: "absolute",
                              left: 4,
                              right: 4,
                              top: y(m) + 1,
                              height: ROW - 2,
                              borderRadius: 6,
                              paddingHorizontal: S.sm,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              backgroundColor: bg,
                              opacity: past ? 0.5 : 1,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: fg, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.2}>
                              {m % 60 === 0 ? minutesToLabel(m) : ""}
                            </Text>
                            <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: fg, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.2}>
                              {`${o}/${r.capacity}`}
                            </Text>
                          </Tap>
                        );
                      })
                    ) : (
                      <>
                        {slots.map((m) => {
                          const past = date < today || (date === today && m + SLOT_MINUTES <= nowMin);
                          if (past || isBusy(data, r, date, m)) return null;
                          return (
                            <Tap
                              key={m}
                              disabled={pending || !can("court.create")}
                              onPress={() => onNew(r.id, m)}
                              accessibilityRole="button"
                              accessibilityLabel={`Reservar ${r.name} a las ${minutesToLabel(m)}`}
                              style={{ position: "absolute", left: 4, right: 4, top: y(m), height: ROW, borderRadius: 6, justifyContent: "center", paddingLeft: 6 }}
                            >
                              <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: C.blue, opacity: 0.45, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.2}>
                                {`+ ${minutesToLabel(m)}`}
                              </Text>
                            </Tap>
                          );
                        })}
                        {resourceBookings(data, date, r.id).map((b) => {
                          const top = y(localDate(b.start) < date ? start : Math.max(start, localMinutes(b.start)));
                          const bottom = y(localDate(b.end) > date ? end : Math.min(end, localMinutes(b.end)));
                          return <BookingBlock key={b.id} booking={b} resource={r} top={top} height={bottom - top} onOpen={onOpen} />;
                        })}
                        {matchesOn(data, date, r.id).map((m) => {
                          const from = localMinutes(m.start);
                          return (
                            <Tap
                              key={m.id}
                              onPress={() => onOpenMatch(m.id)}
                              accessibilityRole="button"
                              accessibilityLabel={`Partido abierto, nivel ${m.level}, faltan ${m.needed}`}
                              style={{
                                position: "absolute",
                                left: 4,
                                right: 4,
                                zIndex: 5,
                                top: y(from) + 1,
                                height: y(from + MATCH_MINUTES) - y(from) - 2,
                                overflow: "hidden",
                                borderRadius: R.sm,
                                borderWidth: 1,
                                borderStyle: "dashed",
                                borderColor: C.blue,
                                backgroundColor: C.accentSoft,
                                paddingHorizontal: S.sm,
                                paddingVertical: 4,
                                gap: 2,
                              }}
                            >
                              <Text style={{ fontSize: 13, fontFamily: FONT.heading, color: C.blueDeep }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                                Partido abierto
                              </Text>
                              <Text style={{ fontSize: 11.5, color: C.blueDeep }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                                {`Nivel ${m.level} · faltan ${m.needed}`}
                              </Text>
                              <View style={{ marginTop: 2 }}>
                                <AvatarStack names={m.players} size={22} ring={C.accentSoft} />
                              </View>
                            </Tap>
                          );
                        })}
                      </>
                    )}
                  </View>
                ))}
              </View>

              {showNow ? <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: y(nowMin), height: 1.5, backgroundColor: rose, zIndex: 10 }} /> : null}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function BookingBlock({ booking: b, resource: r, top, height, onOpen }: {
  booking: ProBooking;
  resource: ProResource;
  top: number;
  height: number;
  onOpen: (id: string) => void;
}) {
  const { demo } = usePro();
  const t = tone(r.tone);
  const amber = TONE_HEX.amber;
  const paid = b.priceCents > 0 && b.paidCents !== null && b.paidCents >= b.priceCents;
  const short = height < ROW * 2.2;
  const requested = b.status === "requested";
  return (
    <Tap
      onPress={() => onOpen(b.id)}
      accessibilityRole="button"
      accessibilityLabel={`${b.clientName}, ${r.name} de ${time(b.start)} a ${time(b.end)}`}
      style={{
        position: "absolute",
        left: 4,
        right: 4,
        zIndex: 5,
        top: top + 1,
        height: height - 2,
        overflow: "hidden",
        borderRadius: R.sm,
        backgroundColor: requested ? `${amber}1F` : t.block,
        borderWidth: requested ? 1 : b.status === "in_service" ? 2 : 0,
        borderStyle: requested ? "dashed" : "solid",
        borderColor: requested ? amber : t.bar,
        opacity: b.status === "done" || b.status === "no_show" ? 0.6 : 1,
      }}
    >
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 3, backgroundColor: requested ? amber : t.bar }} />
      <View style={{ flex: 1, paddingLeft: 10, paddingRight: 6, paddingVertical: 4, gap: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ flexShrink: 1, fontSize: 13, fontFamily: FONT.semibold, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {b.clientName}
          </Text>
          {b.student ? <BadgeCheck size={13} color={C.text} style={{ opacity: 0.7 }} accessibilityLabel="Estudiante verificado" /> : null}
          {fromFranky(b.source) ? <Sparkles size={12} color={C.blue} accessibilityLabel="Vino por Franky" /> : null}
          {paid ? (
            <View style={{ marginLeft: "auto" }}>
              <Check size={13} color={C.text} accessibilityLabel="Pagada" />
            </View>
          ) : null}
        </View>
        {!short ? (
          <Text style={{ fontSize: 11.5, color: C.text, opacity: 0.75, fontVariant: ["tabular-nums"] }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {`${time(b.start)} a ${time(b.end)}${demo && r.kind === "court" && b.priceCents ? ` · 4 × ${money(perPlayer(b.priceCents))}` : b.partySize > 1 ? ` · ${b.partySize} personas` : ""}`}
          </Text>
        ) : null}
        {!short && requested ? (
          <Text style={{ marginTop: "auto", fontSize: 11, fontFamily: FONT.semibold, color: amber }} maxFontSizeMultiplier={1.2}>
            Por confirmar
          </Text>
        ) : null}
        {!short && b.note && !requested && r.kind !== "court" ? (
          <Text style={{ marginTop: "auto", fontSize: 11, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {b.note}
          </Text>
        ) : null}
      </View>
    </Tap>
  );
}

/* ------------------------------------------------------------------ */
/* Partidos abiertos                                                   */
/* ------------------------------------------------------------------ */

function MatchesList({ matches, onOpen, onPublishAll, onNew }: {
  matches: OpenMatchX[];
  onOpen: (id: string) => void;
  onPublishAll: () => void;
  onNew: () => void;
}) {
  const { data, now } = usePro();
  const today = localDate(now);
  const unpublished = matches.filter((m) => !m.publishedAt).length;
  const days = [...new Set(matches.map((m) => localDate(m.start)))];
  const green = TONE_HEX.emerald;

  if (!matches.length) {
    return (
      <Panel>
        <Empty
          icon={Users}
          title="Ningún partido abierto"
          body="Cuando un jugador quiera partido y le falte gente, créalo aquí. Franky lo completa con estudiantes de su nivel."
          action={<PButton label="Nuevo partido abierto" icon={Plus} onPress={onNew} />}
        />
      </Panel>
    );
  }

  return (
    <View>
      {unpublished ? (
        <View style={{ gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: `${C.blue}40`, backgroundColor: C.accentSoft, padding: S.md, marginBottom: S.lg }}>
          <Text style={{ fontSize: 14, color: C.blueDeep }} maxFontSizeMultiplier={1.4}>
            <Text style={{ fontFamily: FONT.semibold }}>{`${plural(unpublished, "partido sin publicar", "partidos sin publicar")}.`}</Text>
            {" Publícalos y los verán estudiantes de nivel parecido que suelen jugar a esa hora."}
          </Text>
          <PButton label="Publicar a estudiantes de nivel parecido" icon={Send} small onPress={onPublishAll} />
        </View>
      ) : null}

      {days.map((d) => (
        <View key={d} style={{ marginBottom: S.lg, gap: S.sm }}>
          <PText v="label">{d === today ? "Hoy" : d === addDays(today, 1) ? "Mañana" : dayLabel(`${d}T12:00:00Z`)}</PText>
          {matches
            .filter((m) => localDate(m.start) === d)
            .map((m) => {
              const r = data.resources.find((x) => x.id === m.resourceId);
              const price = r ? priceFor(r, d, localMinutes(m.start), MATCH_MINUTES) : 0;
              return (
                <Tap
                  key={m.id}
                  onPress={() => onOpen(m.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Partido nivel ${m.level}, ${time(m.start)}, ${r?.name ?? ""}, faltan ${m.needed}`}
                  style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, gap: S.md, ...SHADOW.card }}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.3}>{time(m.start)}</Text>
                      <PText v="tiny" numberOfLines={1}>{`${r?.name ?? ""} · ${price === null ? "Precio según servicio" : `${money(perPlayer(price))} por jugador`}`}</PText>
                    </View>
                    <Pill tone="violet" label={`Nivel ${m.level}`} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                    <View style={{ flexDirection: "row" }}>
                      <AvatarStack names={m.players} size={32} />
                      {Array.from({ length: m.needed }, (_, i) => (
                        <View
                          key={i}
                          style={{ marginLeft: -10, width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: C.surface, alignItems: "center", justifyContent: "center" }}
                        >
                          <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 12, color: C.muted }} maxFontSizeMultiplier={1.2}>+</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    <PText v="h3">{`Faltan ${m.needed}`}</PText>
                  </View>
                  <Meter value={m.players.length} max={4} tone={m.needed === 1 ? "warning" : "violet"} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
                    <PText v="tiny">{m.university ? shortUni(m.university) : "Abierto"}</PText>
                    {m.publishedAt ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Check size={13} color={green} />
                        <Text style={{ fontSize: 12, fontFamily: FONT.semibold, color: green }} maxFontSizeMultiplier={1.3}>
                          {`Visto por ${m.reach ?? matchReach(m.level)} estudiantes`}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, fontFamily: FONT.semibold, color: C.blue }} maxFontSizeMultiplier={1.3}>Sin publicar</Text>
                    )}
                  </View>
                </Tap>
              );
            })}
        </View>
      ))}

      <Tip title="Por qué funciona">
        Un jugador que se queda sin pareja se va a otro club. Con el partido abierto la pista se reserva igual, Franky busca a los que faltan entre estudiantes de nivel parecido y cada uno paga su parte. Tú no pagas nada por jugador.
      </Tip>
    </View>
  );
}
