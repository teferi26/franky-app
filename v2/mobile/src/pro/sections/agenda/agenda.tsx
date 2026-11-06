import React from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { BadgeCheck, CalendarX2, Check, Plus, Sparkles, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProBooking } from "../../../../../shared/pro/types";
import { addDays, capitalize, dayLabel, localDate, localMinutes, minutesToLabel, money, weekdayIndex } from "../../../../../shared/pro/format";
import { bookingDaySpan, bookingsOn, daySummary, freeGaps, hoursOn, openingIntervals, startTimes, type Gap } from "../../../../../shared/pro/agenda";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Chips, Empty, PAvatar, PButton, PText, PageHeader, Segmented, StepNav, TONE_HEX, tone } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { BookingDrawer, NewBookingDrawer, isFromFranky, type NewBookingPreset } from "./booking-drawers";

const SLOT = 15;
const ROW = 20; // píxeles por cuarto de hora: 80 px por hora
const HOURS_W = 48; // columna de horas, siempre a la vista
const COL_MIN = 150; // ancho mínimo de la columna de cada profesional

export default function AgendaSection() {
  const { data, now, loadDate, can, pending } = usePro();
  const today = localDate(now);
  const [date, setDate] = React.useState(today);
  const [view, setView] = React.useState<"day" | "week">("day");
  const [staffFilter, setStaffFilter] = React.useState<string>("all");
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewBookingPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  React.useEffect(() => {
    void loadDate(view === "week" ? weekStart(date) : date);
  }, [date, view, loadDate]);

  const nowMin = localMinutes(now);
  const summary = daySummary(data, date, date === today ? nowMin : 0);
  const gaps = date >= today ? freeGaps(data, date, date === today ? nowMin : 0, 30) : [];
  const bookable = data.staff.filter((s) => data.services.some((sv) => sv.staffIds.includes(s.id)));
  const staff = staffFilter === "all" ? bookable : bookable.filter((s) => s.id === staffFilter);
  const title = view === "day" ? dayLabel(`${date}T12:00:00Z`) : weekTitle(date);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Agenda"
        title={capitalize(title)}
        description={
          view === "day"
            ? `${summary.total} ${summary.total === 1 ? "cita" : "citas"} · ${gaps.length} ${gaps.length === 1 ? "hueco libre" : "huecos libres"}${can("finance.read") ? ` · ${money(summary.expectedCents, { round: true })} previstos` : ""}`
            : "Toca un día para verlo por profesional."
        }
        actions={
          <PButton
            label="Nueva cita"
            icon={Plus}
            disabled={pending || !can("booking.create")}
            onPress={() => setPreset({ date, staffId: staffFilter === "all" ? undefined : staffFilter })}
          />
        }
      >
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "day", label: "Día" },
            { value: "week", label: "Semana" },
          ]}
        />
      </PageHeader>

      <StepNav
        label={view === "day" && date === addDays(today, 1) ? "Mañana" : view === "day" && date === addDays(today, -1) ? "Ayer" : ""}
        onPrev={() => setDate(addDays(date, view === "day" ? -1 : -7))}
        onNext={() => setDate(addDays(date, view === "day" ? 1 : 7))}
        onToday={() => setDate(today)}
        isToday={date === today}
      />
      <Chips
        value={staffFilter}
        onChange={setStaffFilter}
        options={[{ value: "all", label: "Todos" }, ...bookable.map((s) => ({ value: s.id, label: s.name.split(" ")[0], dot: TONE_HEX[s.tone] }))]}
      />

      {view === "day" ? (
        <DayGrid
          date={date}
          staffIds={staff.map((s) => s.id)}
          gaps={gaps}
          onOpen={setOpenBooking}
          onNew={(staffId, minute) => setPreset({ date, staffId, minute })}
          onOffer={(g) => setOffer({ gap: g })}
        />
      ) : (
        <WeekGrid
          date={date}
          staffFilter={staffFilter}
          onOpen={setOpenBooking}
          onDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      )}

      <BookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <NewBookingDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Vista de día: una columna por profesional                           */
/* ------------------------------------------------------------------ */

/** Tramos del día en los que el profesional no trabaja (se sombrean). */
function closedSegments(open: { open: number; close: number }[], start: number, end: number) {
  const out: { from: number; to: number }[] = [];
  let cursor = start;
  for (const shift of [...open].sort((a, b) => a.open - b.open)) {
    if (shift.open > cursor) out.push({ from: cursor, to: Math.min(shift.open, end) });
    cursor = Math.max(cursor, shift.close);
  }
  if (cursor < end) out.push({ from: cursor, to: end });
  return out.filter((s) => s.to > s.from);
}

function DayGrid({
  date,
  staffIds,
  gaps,
  onOpen,
  onNew,
  onOffer,
}: {
  date: string;
  staffIds: string[];
  gaps: Gap[];
  onOpen: (id: string) => void;
  onNew: (staffId: string, minute?: number) => void;
  onOffer: (gap: Gap) => void;
}) {
  const { data, now, can, pending } = usePro();
  const { width, height } = useWindowDimensions();
  const hours = hoursOn(data, date);
  const visible = bookingsOn(data, date).filter((booking) => staffIds.some((id) => booking.staffId === id || booking.resourceIds?.includes(id)));
  const spans = visible.map((booking) => bookingDaySpan(booking, date)!);
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const bodyRef = React.useRef<ScrollView>(null);
  const headerRef = React.useRef<ScrollView>(null);
  const [touch, setTouch] = React.useState<{ staffId: string; minute: number } | null>(null);

  const start = Math.floor(Math.min(hours?.open ?? 540, ...spans.map((span) => span.from)) / 60) * 60;
  const end = Math.ceil(Math.max(hours?.close ?? 1200, ...spans.map((span) => span.to)) / 60) * 60;
  const rows = (end - start) / SLOT;
  const gridH = rows * ROW;
  const col = Math.max(COL_MIN, Math.floor((width - 2 * S.lg - 2 - HOURS_W) / Math.max(1, staffIds.length)));
  const contentW = col * staffIds.length;
  const viewportH = Math.max(420, height - 300);
  const canCreate = !pending && can("booking.create");

  // Al abrir hoy, colocamos la línea de "ahora" a la vista.
  React.useEffect(() => {
    const y = date === today ? ((nowMin - start) / SLOT) * ROW - 120 : 0;
    const id = requestAnimationFrame(() => bodyRef.current?.scrollTo({ y: Math.max(0, y), animated: false }));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  if (!hours && !visible.length) {
    return (
      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}>
        <Empty icon={CalendarX2} title="Cerrado este día" body="Cambia tu horario en Ajustes si abres de forma excepcional." />
      </View>
    );
  }

  const hourMarks = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  const showNow = date === today && nowMin >= start && nowMin <= end;
  const nowY = ((nowMin - start) / SLOT) * ROW;

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: "hidden", marginBottom: S.lg, ...SHADOW.card }}>
      {/* Cabecera fija con cada profesional; se desplaza en horizontal con la rejilla. */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ width: HOURS_W }} />
        <ScrollView ref={headerRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", width: contentW }}>
            {staffIds.map((id) => {
              const s = data.staff.find((x) => x.id === id)!;
              const count = bookingsOn(data, date, id).filter((b) => b.status !== "no_show").length;
              return (
                <View key={id} style={{ width: col, flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md, paddingVertical: 10, borderLeftWidth: 1, borderLeftColor: C.borderLight }}>
                  <PAvatar name={s.name} toneKey={s.tone} size={30} />
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>{s.name.split(" ")[0]}</PText>
                    <PText v="tiny" numberOfLines={1}>{`${count} ${count === 1 ? "cita" : "citas"}${s.clockedInAt && date === today ? " · fichado" : ""}`}</PText>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <ScrollView ref={bodyRef} style={{ maxHeight: viewportH }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", height: gridH }}>
          {/* Columna de horas */}
          <View style={{ width: HOURS_W, height: gridH }}>
            {hourMarks.map((m) =>
              m < end ? (
                <Text
                  key={m}
                  style={{ position: "absolute", right: 8, top: Math.max(0, ((m - start) / SLOT) * ROW - 7), fontSize: 11, lineHeight: 14, fontFamily: FONT.medium, color: C.muted, fontVariant: ["tabular-nums"] }}
                  maxFontSizeMultiplier={1.2}
                >
                  {minutesToLabel(m)}
                </Text>
              ) : null,
            )}
            {showNow ? (
              <View pointerEvents="none" style={{ position: "absolute", right: 0, top: nowY - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: TONE_HEX.rose }} />
            ) : null}
          </View>

          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => headerRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false })}
          >
            <View style={{ width: contentW, height: gridH }}>
              {/* Rejilla de fondo: una línea por hora */}
              {hourMarks.map((m) => (
                <View key={m} pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: ((m - start) / SLOT) * ROW, height: 1, backgroundColor: C.borderLight }} />
              ))}

              {staffIds.map((id, index) => {
                const s = data.staff.find((x) => x.id === id)!;
                const first = s.name.split(" ")[0];
                const list = bookingsOn(data, date, id);
                const staffGaps = gaps.filter((g) => g.staffId === id);
                const shifts = openingIntervals(data, date, id);
                const available = new Set(startTimes(data, date, id, SLOT, date < today ? 1440 : date === today ? nowMin + 1 : 0));
                const minuteAt = (e: GestureResponderEvent) => start + Math.floor(e.nativeEvent.locationY / ROW) * SLOT;
                const firstFree = [...available].sort((a, b) => a - b)[0];
                return (
                  <View key={id} style={{ position: "absolute", top: 0, bottom: 0, left: index * col, width: col, borderLeftWidth: 1, borderLeftColor: C.borderLight }}>
                    {/* Horas en que no trabaja */}
                    {closedSegments(shifts, start, end).map((seg) => (
                      <View
                        key={seg.from}
                        pointerEvents="none"
                        style={{ position: "absolute", left: 0, right: 0, top: ((seg.from - start) / SLOT) * ROW, height: ((seg.to - seg.from) / SLOT) * ROW, backgroundColor: C.input, opacity: 0.7 }}
                      />
                    ))}

                    {/* Toque en un hueco: nueva cita a esa hora */}
                    <Pressable
                      disabled={!canCreate}
                      onPressIn={(e) => {
                        const minute = minuteAt(e);
                        setTouch(available.has(minute) ? { staffId: id, minute } : null);
                      }}
                      onPressOut={() => setTouch(null)}
                      onPress={(e) => {
                        const minute = minuteAt(e);
                        if (available.has(minute)) onNew(id, minute);
                      }}
                      onAccessibilityTap={() => onNew(id, firstFree)}
                      accessibilityRole="button"
                      accessibilityLabel={`Nueva cita con ${first}`}
                      accessibilityHint="Toca a la altura de la hora que quieras"
                      style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
                    />
                    {touch && touch.staffId === id ? (
                      <View
                        pointerEvents="none"
                        style={{ position: "absolute", left: 4, right: 4, top: ((touch.minute - start) / SLOT) * ROW, height: ROW, borderRadius: 6, backgroundColor: C.accentSoft, flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 6 }}
                      >
                        <Plus size={11} color={C.blue} />
                        <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: C.blue }} maxFontSizeMultiplier={1.1}>{minutesToLabel(touch.minute)}</Text>
                      </View>
                    ) : null}

                    {/* Huecos libres que se pueden ofrecer a estudiantes */}
                    {staffGaps.map((g) => {
                      const top = ((g.from - start) / SLOT) * ROW;
                      const h = ((g.to - g.from) / SLOT) * ROW;
                      if (h < ROW * 2) return null;
                      return (
                        <View
                          key={`${g.staffId}-${g.from}`}
                          pointerEvents="box-none"
                          style={{ position: "absolute", left: 6, right: 6, top: top + 2, height: h - 4, borderRadius: R.sm, borderWidth: 1, borderStyle: "dashed", borderColor: `${C.blue}59` }}
                        >
                          <Tap
                            onPress={() => onOffer(g)}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={`Ofrecer a estudiantes el hueco de ${minutesToLabel(g.from)} a ${minutesToLabel(g.to)} con ${first}`}
                            style={{ position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 3, borderRadius: R.full, backgroundColor: C.blue, paddingHorizontal: 8, paddingVertical: 3, ...SHADOW.card }}
                          >
                            <Zap size={11} color={C.onAccent} />
                            <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: C.onAccent }} maxFontSizeMultiplier={1.1} numberOfLines={1}>
                              Ofrecer a estudiantes
                            </Text>
                          </Tap>
                        </View>
                      );
                    })}

                    {list.map((b) => (
                      <BookingBlock key={b.id} booking={b} date={date} start={start} onOpen={onOpen} />
                    ))}
                  </View>
                );
              })}

              {/* Línea de ahora */}
              {showNow ? <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: nowY, height: 1.5, backgroundColor: TONE_HEX.rose }} /> : null}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function BookingBlock({ booking: b, date, start, onOpen }: { booking: ProBooking; date: string; start: number; onOpen: (id: string) => void }) {
  const { data } = usePro();
  const s = data.staff.find((x) => x.id === b.staffId);
  const service = data.services.find((x) => x.id === b.serviceId);
  const { from, to } = bookingDaySpan(b, date)!;
  const top = ((from - start) / SLOT) * ROW;
  const height = Math.max(ROW * 1.5, ((to - from) / SLOT) * ROW);
  const t = tone(s?.tone);
  const short = height < ROW * 2.6;
  const requested = b.status === "requested";
  const amber = TONE_HEX.amber;

  return (
    <Pressable
      onPress={() => onOpen(b.id)}
      accessibilityRole="button"
      accessibilityLabel={`${b.clientName}, ${service?.name ?? "cita"} a las ${minutesToLabel(from)}`}
      style={({ pressed }) => ({
        position: "absolute",
        left: 4,
        right: 4,
        top: top + 1,
        height: height - 2,
        borderRadius: R.sm,
        overflow: "hidden",
        backgroundColor: requested ? `${amber}1F` : t.block,
        borderWidth: requested ? 1 : b.status === "in_service" ? 2 : 0,
        borderStyle: requested ? "dashed" : "solid",
        borderColor: requested ? amber : t.strong,
        opacity: b.status === "done" || b.status === "no_show" ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 3, backgroundColor: requested ? amber : t.bar }} />
      <View style={{ flex: 1, paddingLeft: 9, paddingRight: 6, paddingVertical: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Text
            style={{ flexShrink: 1, fontFamily: FONT.semibold, fontSize: 12.5, lineHeight: 15, color: C.text, textDecorationLine: b.status === "no_show" ? "line-through" : "none" }}
            numberOfLines={1}
            maxFontSizeMultiplier={1.15}
          >
            {b.clientName}
          </Text>
          {b.student ? <BadgeCheck size={13} color={C.muted} accessibilityLabel="Estudiante verificado" /> : null}
          {isFromFranky(b.source) ? <Sparkles size={12} color={C.blue} accessibilityLabel="Vino por Franky" /> : null}
          {b.status === "done" ? (
            <View style={{ marginLeft: "auto" }}>
              <Check size={13} color={C.text} accessibilityLabel="Atendida" />
            </View>
          ) : null}
        </View>
        {!short ? (
          <Text style={{ fontSize: 11.5, lineHeight: 14, color: C.muted }} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {`${minutesToLabel(from)} · ${service?.name ?? ""}`}
          </Text>
        ) : null}
        {!short && requested ? (
          <Text style={{ marginTop: "auto", fontSize: 11, fontFamily: FONT.semibold, color: C.warning }} maxFontSizeMultiplier={1.15}>
            Por confirmar
          </Text>
        ) : null}
        {!short && b.status === "arrived" ? (
          <Text style={{ marginTop: "auto", fontSize: 11, fontFamily: FONT.semibold, color: C.text }} maxFontSizeMultiplier={1.15}>
            Ha llegado
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Vista de semana                                                     */
/* ------------------------------------------------------------------ */

function weekStart(date: string) {
  return addDays(date, -weekdayIndex(date));
}

function weekTitle(date: string) {
  const from = weekStart(date);
  const to = addDays(from, 6);
  const f = new Date(`${from}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const t = new Date(`${to}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `Semana del ${f} al ${t}`;
}

const WEEK_HOURS_W = 40;
const DAY_W = 104;
const WEEK_ROW = 14; // píxeles por cuarto de hora en la semana
const WEEK_HEAD = 68;

function WeekGrid({ date, staffFilter, onOpen, onDay }: { date: string; staffFilter: string; onOpen: (id: string) => void; onDay: (date: string) => void }) {
  const { data, now } = usePro();
  const today = localDate(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));
  const hours = days.map((day) => hoursOn(data, day)).filter((value) => value !== null);
  const spans = days.flatMap((day) => bookingsOn(data, day).map((booking) => bookingDaySpan(booking, day)!));
  const open = Math.min(...(hours.length ? hours.map((h) => h.open) : [540]), ...spans.map((span) => span.from));
  const close = Math.max(...(hours.length ? hours.map((h) => h.close) : [1200]), ...spans.map((span) => span.to));
  const start = Math.floor(open / 60) * 60;
  const end = Math.ceil(close / 60) * 60;
  const bodyH = ((end - start) / SLOT) * WEEK_ROW;
  const lanes = data.staff.filter((s) => (staffFilter === "all" || s.id === staffFilter) && data.services.some((sv) => sv.staffIds.includes(s.id)));
  const hourMarks = Array.from({ length: (end - start) / 60 }, (_, i) => start + i * 60);

  return (
    <View style={{ flexDirection: "row", borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: "hidden", marginBottom: S.lg, ...SHADOW.card }}>
      {/* Columna de horas fija */}
      <View style={{ width: WEEK_HOURS_W }}>
        <View style={{ height: WEEK_HEAD, borderBottomWidth: 1, borderBottomColor: C.border }} />
        <View style={{ height: bodyH }}>
          {hourMarks.map((m) => (
            <Text
              key={m}
              style={{ position: "absolute", right: 6, top: Math.max(0, ((m - start) / SLOT) * WEEK_ROW - 6), fontSize: 10.5, lineHeight: 12, color: C.muted, fontVariant: ["tabular-nums"] }}
              maxFontSizeMultiplier={1.1}
            >
              {minutesToLabel(m)}
            </Text>
          ))}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: "row", height: WEEK_HEAD, borderBottomWidth: 1, borderBottomColor: C.border }}>
            {days.map((d) => {
              const count = bookingsOn(data, d).filter((b) => staffFilter === "all" || b.staffId === staffFilter).length;
              const closed = !hoursOn(data, d);
              const weekday = new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short" }).replace(/\./g, "");
              return (
                <Tap
                  key={d}
                  onPress={() => onDay(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`${capitalize(dayLabel(`${d}T12:00:00Z`))}, ${closed && !count ? "cerrado" : `${count} citas`}`}
                  style={{ width: DAY_W, height: WEEK_HEAD, justifyContent: "center", paddingHorizontal: S.md, borderLeftWidth: 1, borderLeftColor: C.borderLight }}
                >
                  <PText v="label">{weekday}</PText>
                  <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: d === today ? C.blue : C.text }} maxFontSizeMultiplier={1.2}>
                    {Number(d.slice(8))}
                  </Text>
                  <PText v="tiny">{closed && !count ? "Cerrado" : `${count} citas`}</PText>
                </Tap>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", height: bodyH }}>
            {days.map((d) => {
              const list = bookingsOn(data, d).filter((b) => lanes.some((l) => l.id === b.staffId));
              const closed = !hoursOn(data, d);
              const laneW = (DAY_W - 1) / Math.max(1, lanes.length);
              return (
                <View key={d} style={{ width: DAY_W, height: bodyH, borderLeftWidth: 1, borderLeftColor: C.borderLight, backgroundColor: closed ? C.input : undefined }}>
                  {hourMarks.map((m) => (
                    <View key={m} pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: ((m - start) / SLOT) * WEEK_ROW, height: 1, backgroundColor: C.borderLight }} />
                  ))}
                  {list.map((b) => {
                    const lane = lanes.findIndex((l) => l.id === b.staffId);
                    const s = lanes[lane];
                    const t = tone(s.tone);
                    const { from, to } = bookingDaySpan(b, d)!;
                    return (
                      <Pressable
                        key={b.id}
                        onPress={() => onOpen(b.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${minutesToLabel(from)} ${b.clientName}`}
                        style={({ pressed }) => ({
                          position: "absolute",
                          top: ((from - start) / SLOT) * WEEK_ROW + 1,
                          height: Math.max(WEEK_ROW, ((to - from) / SLOT) * WEEK_ROW - 2),
                          left: lane * laneW + 2,
                          width: laneW - 4,
                          borderRadius: 5,
                          overflow: "hidden",
                          backgroundColor: t.block,
                          borderWidth: b.status === "requested" ? 1 : 0,
                          borderStyle: "dashed",
                          borderColor: TONE_HEX.amber,
                          opacity: b.status === "done" || b.status === "no_show" ? 0.55 : pressed ? 0.8 : 1,
                        })}
                      >
                        <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 2, backgroundColor: t.bar }} />
                        <Text style={{ paddingLeft: 4, fontSize: 10, lineHeight: 12, fontFamily: FONT.semibold, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1}>
                          {b.clientName.split(" ")[0]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
