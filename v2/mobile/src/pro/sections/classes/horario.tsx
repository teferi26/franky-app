import React from "react";
import { ScrollView, Text, View } from "react-native";
import { BadgeCheck, CalendarX2, Plus, Users, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, F, FONT, R, S, SHADOW } from "@/theme";
import { MAX_FONT_SCALE } from "@/lib/a11y";
import type { ProClassSession } from "../../../../../shared/pro/types";
import { addDays, localDate, localMinutes, pct, time } from "../../../../../shared/pro/format";
import { FALLBACK_PER_PLAYER_CENTS, classCopy, freeSpots, isRoomMode, sessionState, sessionsOn, weekStart } from "../../../../../shared/pro/classes";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Empty, Kpi, KpiRow, Meter, PButton, PageHeader, Panel, Pill, PText, StepNav, TONE_HEX, tone as toneOf } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { NewSessionDrawer, SessionDrawer, capitalize, fillTone, type NewSessionPreset } from "./parts";
import { FilterChip } from "./ui";

/**
 * Horario semanal. En la web el escritorio pinta la semana en rejilla por
 * horas y el móvil un día cada vez; aquí se porta la vista de móvil: los días
 * de la semana en chips y la lista de sesiones del día elegido.
 */
export default function HorarioSection() {
  const { data, now, vertical, demo, can, pending, loadDate } = usePro();
  const copy = classCopy(vertical.id);
  const today = localDate(now);
  const [anchor, setAnchor] = React.useState(today);
  const [day, setDay] = React.useState(today);
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [open, setOpen] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewSessionPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const monday = weekStart(anchor);
  React.useEffect(() => {
    void loadDate(monday);
  }, [loadDate, monday]);
  const allDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const days = allDays.filter((d, i) => data.space.hours[i] || sessionsOn(data, d).length);
  const visible = (s: ProClassSession) => typeFilter === "all" || s.classTypeId === typeFilter;
  const week = data.sessions.filter((s) => {
    const d = localDate(s.start);
    return s.status !== "cancelled" && d >= monday && d < addDays(monday, 7) && visible(s);
  });
  const booked = week.reduce((a, s) => a + s.booked, 0);
  const capacity = week.reduce((a, s) => a + s.capacity, 0);
  const waiting = week.reduce((a, s) => a + s.waitlist, 0);
  const full = week.filter((s) => s.booked >= s.capacity).length;
  const title = navLabel(vertical.nav, copy);

  // La sesión que más sitio tiene de aquí en adelante: la que conviene ofrecer.
  const emptiest = week
    .filter((s) => sessionState(s, now) === "next" && freeSpots(s) >= 3)
    .sort((a, b) => b.capacity - b.booked - (a.capacity - a.booked) || a.start.localeCompare(b.start))[0];
  const emptiestType = emptiest ? data.classTypes.find((c) => c.id === emptiest.classTypeId) : undefined;

  const offerSession = (s: ProClassSession) => {
    const ct = data.classTypes.find((c) => c.id === s.classTypeId);
    // Una sala de escape se ofrece entera; un taller o una clase, por plazas.
    const room = isRoomMode(data, ct);
    setOffer({
      what: `${ct?.name ?? "Clase"} de las ${time(s.start)}`,
      date: localDate(s.start),
      from: localMinutes(s.start),
      to: localMinutes(s.end),
      priceCents: vertical.id === "academy" ? 1800 : room ? FALLBACK_PER_PLAYER_CENTS : 1200,
      slots: room ? 1 : freeSpots(s),
    });
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow={title}
        title={weekTitle(monday)}
        description={
          week.length
            ? `${week.length} ${copy.sessionMany}, ${pct(booked, capacity)} % de ocupación${full ? `, ${full} completas` : ""}${waiting ? ` y ${waiting} personas en lista de espera` : ""}.`
            : `Esta semana no hay ${copy.sessionMany}. Crea la primera y aparecerá en tu ficha de Franky.`
        }
        actions={
          <>
            {demo ? <PButton label={copy.newType} icon={Plus} variant="outline" onPress={() => setPreset({ date: day, createType: true })} /> : null}
            <PButton label={copy.newSession} icon={Plus} disabled={pending || !can("class.session.create")} onPress={() => setPreset({ date: day })} />
          </>
        }
      />

      <KpiRow>
        <Kpi icon={Users} label="Ocupación de la semana" value={`${pct(booked, capacity)} %`} hint={`${booked} de ${capacity} plazas`} />
        <Kpi label={`${capitalize(copy.sessionMany)} completas`} value={full} hint={full ? "con la lista de espera abierta" : "todas con sitio"} />
        <Kpi label="En lista de espera" value={waiting} hint={waiting ? "pendientes de una plaza" : "nadie esperando"} />
        <Kpi
          icon={Zap}
          label="Plazas libres por delante"
          value={week.filter((s) => sessionState(s, now) === "next").reduce((a, s) => a + freeSpots(s), 0)}
          hint={emptiest ? (demo ? "Ofrécelas a estudiantes" : "Plazas disponibles") : "Sin plazas libres"}
          emphasis={Boolean(emptiest)}
          onPress={demo && emptiest ? () => offerSession(emptiest) : undefined}
        />
      </KpiRow>

      <StepNav
        onPrev={() => {
          setAnchor(addDays(anchor, -7));
          setDay(addDays(monday, -7));
        }}
        onNext={() => {
          setAnchor(addDays(anchor, 7));
          setDay(addDays(monday, 7));
        }}
        onToday={() => {
          setAnchor(today);
          setDay(today);
        }}
        isToday={weekStart(today) === monday}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }} style={{ flexGrow: 0, marginBottom: S.md }}>
        <FilterChip active={typeFilter === "all"} onPress={() => setTypeFilter("all")} label="Todas" />
        {data.classTypes.map((c) => (
          <FilterChip key={c.id} active={typeFilter === c.id} onPress={() => setTypeFilter(c.id)} label={c.name} dot={TONE_HEX[c.tone]} />
        ))}
      </ScrollView>

      {week.length || days.length ? (
        <DayList
          days={days}
          day={days.includes(day) ? day : days[0]}
          setDay={setDay}
          visible={visible}
          onOpen={setOpen}
          onNew={(d) => setPreset({ date: d })}
        />
      ) : (
        <Panel>
          <Empty icon={CalendarX2} title="Semana cerrada" body="Cambia tu horario en Ajustes si abres de forma excepcional." />
        </Panel>
      )}

      {demo && emptiest && emptiestType ? (
        <View style={{ flexDirection: "row", gap: S.md, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, borderRadius: R.lg, padding: S.md, marginTop: S.lg }}>
          <Zap size={16} color={C.blue} strokeWidth={1.9} style={{ marginTop: 2 }} />
          <Text style={{ ...F.small, flex: 1, color: C.text }} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            <Text style={{ fontFamily: FONT.semibold }}>Llena lo que va flojo. </Text>
            {`${emptiestType.name} del ${new Date(emptiest.start).toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" })} a las ${time(emptiest.start)} tiene ${freeSpots(emptiest)} plazas libres. `}
            {vertical.id === "academy"
              ? `Franky se la enseña a los estudiantes de ${emptiestType.category} que tienen esa asignatura este cuatrimestre. `
              : vertical.id === "culture"
                ? "Franky la enseña a grupos de estudiantes que buscan plan esa tarde cerca de ti. "
                : "Los estudiantes con hueco entre clases a esa hora la ven en Franky sin que pagues comisión. "}
            <Text
              onPress={() => offerSession(emptiest)}
              accessibilityRole="link"
              style={{ fontFamily: FONT.semibold, color: C.blue }}
              suppressHighlighting
            >
              Ofrecer ahora
            </Text>
          </Text>
        </View>
      ) : null}

      <SessionDrawer sessionId={open} onClose={() => setOpen(null)} onOffer={demo ? setOffer : undefined} />
      <NewSessionDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </ProPage>
  );
}

function navLabel(nav: { id: string; label?: string }[], copy: ReturnType<typeof classCopy>) {
  return nav.find((n) => n.id === "horario")?.label ?? (copy.typeOne === "clase" ? "Horario" : capitalize(copy.sessionMany));
}

function weekTitle(monday: string) {
  const to = addDays(monday, 6);
  const f = new Date(`${monday}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const t = new Date(`${to}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `Semana del ${f} al ${t}`;
}

/* ------------------------------------------------------------------ */
/* Un día cada vez                                                     */
/* ------------------------------------------------------------------ */

function DayList({
  days,
  day,
  setDay,
  visible,
  onOpen,
  onNew,
}: {
  days: string[];
  day: string;
  setDay: (d: string) => void;
  visible: (s: ProClassSession) => boolean;
  onOpen: (id: string) => void;
  onNew: (date: string) => void;
}) {
  const { data, now, vertical, pending, can } = usePro();
  const copy = classCopy(vertical.id);
  const today = localDate(now);
  const list = day ? sessionsOn(data, day).filter(visible) : [];

  return (
    <View style={{ gap: S.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flexGrow: 0 }}>
        {days.map((d) => {
          const count = sessionsOn(data, d).filter(visible).length;
          const active = d === day;
          const weekday = new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "short" }).replace(/\./g, "");
          return (
            <Tap
              key={d}
              onPress={() => setDay(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${weekday} ${Number(d.slice(8))}, ${count} ${count === 1 ? copy.sessionOne : copy.sessionMany}`}
              style={{
                width: 56,
                height: 66,
                borderRadius: R.lg,
                borderWidth: 1,
                borderColor: active ? C.text : C.border,
                backgroundColor: active ? C.text : C.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: FONT.semibold, fontSize: 11, textTransform: "uppercase", color: active ? C.bg : C.muted }} maxFontSizeMultiplier={1.2}>
                {weekday}
              </Text>
              <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: active ? C.bg : d === today ? C.blue : C.text }} maxFontSizeMultiplier={1.2}>
                {Number(d.slice(8))}
              </Text>
              <Text style={{ fontSize: 10.5, color: active ? C.bg : C.muted, opacity: active ? 0.7 : 1 }} maxFontSizeMultiplier={1.2}>
                {count}
              </Text>
            </Tap>
          );
        })}
      </ScrollView>

      {list.length ? (
        <View style={{ gap: S.sm }}>
          {list.map((s) => {
            const ct = data.classTypes.find((c) => c.id === s.classTypeId);
            const coach = data.staff.find((x) => x.id === s.coachId);
            const state = sessionState(s, now);
            const t = toneOf(ct?.tone);
            const perGroup = isRoomMode(data, ct);
            const fill = fillTone(s);
            return (
              <Tap
                key={s.id}
                onPress={() => onOpen(s.id)}
                accessibilityRole="button"
                accessibilityLabel={`${ct?.name ?? ""}, ${time(s.start)}, ${s.booked} de ${s.capacity} plazas`}
                style={{
                  flexDirection: "row",
                  alignItems: "stretch",
                  gap: S.md,
                  padding: S.md,
                  borderRadius: R.lg,
                  borderWidth: 1,
                  borderColor: state === "live" ? `${C.blue}66` : C.border,
                  backgroundColor: C.surface,
                  opacity: state === "past" ? 0.6 : 1,
                  ...SHADOW.card,
                }}
              >
                <View style={{ width: 48 }}>
                  <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.2}>{time(s.start)}</Text>
                  <Text style={{ fontSize: 12, color: C.muted }} maxFontSizeMultiplier={1.2}>{time(s.end)}</Text>
                </View>
                <View style={{ width: 4, borderRadius: 2, backgroundColor: t.bar }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{ct?.name}</PText>
                    {state === "live" ? <Pill label="Ahora" tone="success" /> : null}
                  </View>
                  <PText v="tiny" numberOfLines={1}>
                    {`${vertical.id === "academy" ? `${ct?.category} · ` : ""}${coach?.name.split(" ")[0] ?? ""} · ${s.room}`}
                  </PText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: 4 }}>
                    <View style={{ flex: 1 }}>
                      <Meter value={s.booked} max={s.capacity} tone={fill === "danger" ? "danger" : fill === "warning" ? "warning" : "violet"} />
                    </View>
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.text }} maxFontSizeMultiplier={1.2}>
                      {perGroup ? (s.booked ? `Grupo de ${s.booked}` : "Libre") : `${s.booked}/${s.capacity}`}
                    </Text>
                    {s.waitlist ? <Pill label={`+${s.waitlist}`} tone="danger" /> : null}
                  </View>
                </View>
              </Tap>
            );
          })}
        </View>
      ) : (
        <Panel>
          <Empty
            icon={CalendarX2}
            title={`Sin ${copy.sessionMany} este día`}
            body={`Crea una ${copy.sessionOne} y tus ${copy.members} la podrán reservar en Franky.`}
            action={
              day && day >= today ? (
                <PButton label={copy.newSession} icon={Plus} variant="outline" disabled={pending || !can("class.session.create")} onPress={() => onNew(day)} />
              ) : undefined
            }
          />
        </Panel>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 }}>
        <BadgeCheck size={14} color={C.blue} />
        <PText v="tiny" style={{ flex: 1 }}>{`Toca una ${copy.sessionOne} para pasar lista o gestionar la espera.`}</PText>
      </View>
    </View>
  );
}
