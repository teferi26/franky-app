import React from "react";
import { ScrollView, Text, View } from "react-native";
import { CalendarClock, CalendarPlus, Clock3, KeyRound, MapPin, MessageCircle, Settings2, Video } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProVisit } from "../../../../../shared/pro/types";
import { addDays, dayLabel, localDate, localMinutes, minutesToLabel, pct, time, weekdayIndex } from "../../../../../shared/pro/format";
import { VISIT_MINUTES, VISIT_STATUS, uniShort } from "../../../../../shared/pro/housing";
import { tomorrowVisits, visitConfirmText, whatsappHref } from "../../../../../shared/pro/housing-ops";
import { openExternal } from "./drawer-common";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Empty, Kpi, KpiRow, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, StepNav, Tip, TimeStepper, Toggle, TONE_HEX, tone } from "../../kit";
import { LeadDrawer, NewVisitDrawer, VisitDrawer } from "./drawers";
import { UniBadge } from "./shared";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Ancho de cada día en la vista de semana (se desplaza en horizontal). */
const DAY_COL = 118;

export default function HousingVisitas() {
  const { data, now } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [view, setView] = React.useState<"day" | "week">("day");
  const [date, setDate] = React.useState(today);
  const [open, setOpen] = React.useState<string | null>(null);
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editHours, setEditHours] = React.useState(false);

  const monday = addDays(date, -weekdayIndex(date));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const live = data.visits.filter((v) => v.status !== "cancelled");
  const onDay = (d: string) => live.filter((v) => localDate(v.start) === d).sort((a, b) => a.start.localeCompare(b.start));
  const todayList = onDay(today);
  const thisWeek = live.filter((v) => {
    const d = localDate(v.start);
    return d >= addDays(today, -weekdayIndex(today)) && d <= addDays(today, 6 - weekdayIndex(today));
  });
  const past = data.visits.filter((v) => v.status === "done" || v.status === "no_show");
  const showRate = pct(past.filter((v) => v.status === "done").length, past.length);
  const videoShare = pct(live.filter((v) => v.mode === "video").length, live.length);
  const openDays = data.space.hours.filter(Boolean).length;
  const weeklySlots = data.space.hours.reduce((a, h) => a + (h ? Math.floor((h.close - h.open) / VISIT_MINUTES) : 0), 0);
  const toDo = todayList.filter((v) => v.status === "scheduled").length;

  const dayVisits = onDay(date);
  const dayOpen = Boolean(data.space.hours[weekdayIndex(date)]);

  return (
    <>
      <ProPage>
        <PageHeader
          eyebrow="Visitas"
          title="Agenda de visitas"
          description={
            todayList.length
              ? `Hoy ${todayList.length === 1 ? "hay 1 visita" : `hay ${todayList.length} visitas`} (${todayList.filter((v) => v.mode === "video").length} por vídeo) y ${thisWeek.length} esta semana.`
              : `Hoy no hay visitas. Esta semana, ${thisWeek.length}.`
          }
          actions={
            <>
              <PButton label="Franjas" variant="outline" icon={Settings2} onPress={() => setEditHours(true)} accessibilityLabel="Editar franjas para visitas" />
              <PButton label="Nueva visita" icon={CalendarPlus} onPress={() => setCreating(true)} />
            </>
          }
        />

        <KpiRow>
          <Kpi icon={KeyRound} label="Hoy" value={todayList.length} hint={toDo ? `${toDo} por hacer` : "Todas hechas"} />
          <Kpi icon={CalendarClock} label="Esta semana" value={thisWeek.length} hint={`${weeklySlots} franjas abiertas`} />
          <Kpi icon={Clock3} label="Asistencia" value={`${showRate} %`} hint="de las visitas pasadas" />
          <Kpi icon={Video} label="Por vídeo" value={`${videoShare} %`} hint="Erasmus y quien aún no ha llegado" />
        </KpiRow>

        <TomorrowPanel onOpen={setOpen} />

        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "day", label: "Día" },
            { value: "week", label: "Semana" },
          ]}
        />
        <StepNav
          label={
            view === "day"
              ? dayLabel(`${date}T12:00:00Z`)
              : `Semana del ${new Date(`${monday}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" })}`
          }
          onPrev={() => setDate(addDays(date, view === "day" ? -1 : -7))}
          onNext={() => setDate(addDays(date, view === "day" ? 1 : 7))}
          onToday={() => setDate(today)}
          isToday={date === today}
        />

        {view === "day" ? (
          <Panel flush>
            {dayVisits.length ? (
              dayVisits.map((v, i) => {
                const showNow = date === today && localMinutes(v.start) > nowMin && (i === 0 || localMinutes(dayVisits[i - 1].start) <= nowMin);
                return (
                  <React.Fragment key={v.id}>
                    {showNow ? (
                      <View accessibilityLabel="Ahora" style={{ flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.lg, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 11, fontFamily: FONT.heading, letterSpacing: 0.8, textTransform: "uppercase", color: TONE_HEX.rose }} maxFontSizeMultiplier={1.2}>Ahora</Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: `${TONE_HEX.rose}99` }} />
                      </View>
                    ) : null}
                    <VisitRow visit={v} onOpen={() => setOpen(v.id)} last={i === dayVisits.length - 1} />
                  </React.Fragment>
                );
              })
            ) : (
              <Empty
                icon={CalendarClock}
                title={dayOpen ? "Sin visitas este día" : "Este día no enseñas pisos"}
                body={dayOpen ? "Propón visitas desde la ficha de cada interesado o crea una aquí." : "Abre franjas este día si quieres que los interesados puedan elegirlo."}
                action={<PButton label={dayOpen ? "Nueva visita" : "Editar franjas"} variant="outline" onPress={() => (dayOpen ? setCreating(true) : setEditHours(true))} />}
              />
            )}
          </Panel>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingBottom: 4 }} style={{ marginBottom: S.lg, marginHorizontal: -S.lg }}>
            <View style={{ width: S.lg - S.sm }} />
            {weekDays.map((d) => {
              const list = onDay(d);
              const closed = !data.space.hours[weekdayIndex(d)];
              const isToday = d === today;
              return (
                <View
                  key={d}
                  style={{
                    width: DAY_COL,
                    minHeight: 170,
                    borderRadius: R.lg,
                    borderWidth: 1,
                    borderColor: isToday ? `${C.blue}66` : C.border,
                    backgroundColor: closed ? C.input : isToday ? C.accentSoft : C.surface,
                    padding: S.sm,
                    gap: 4,
                  }}
                >
                  <Tap
                    onPress={() => {
                      setDate(d);
                      setView("day");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver el ${dayLabel(`${d}T12:00:00Z`)}`}
                    style={{ paddingHorizontal: 4, paddingVertical: 2, minHeight: 44, justifyContent: "center" }}
                  >
                    <PText v="label">{WEEKDAYS[weekdayIndex(d)].slice(0, 3)}</PText>
                    <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: isToday ? C.blue : C.text }} maxFontSizeMultiplier={1.2}>{Number(d.slice(8, 10))}</Text>
                  </Tap>
                  {list.map((v) => {
                    const lead = data.leads.find((l) => l.id === v.leadId);
                    const agent = data.staff.find((s) => s.id === v.agentId);
                    return (
                      <Tap
                        key={v.id}
                        onPress={() => setOpen(v.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Visita a las ${time(v.start)} con ${lead?.name ?? "interesado"}`}
                        style={{ minHeight: 44, borderRadius: R.sm, backgroundColor: tone(agent?.tone ?? "slate").block, paddingHorizontal: 8, paddingVertical: 6, opacity: v.status === "no_show" ? 0.6 : 1 }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.text, textDecorationLine: v.status === "no_show" ? "line-through" : "none" }} maxFontSizeMultiplier={1.2}>
                            {time(v.start)}
                          </Text>
                          {v.mode === "video" ? <Video size={12} color={C.text} /> : null}
                        </View>
                        <Text style={{ fontSize: 12, color: C.text, textDecorationLine: v.status === "no_show" ? "line-through" : "none" }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                          {lead?.name.split(" ")[0] ?? ""}
                        </Text>
                      </Tap>
                    );
                  })}
                  {closed ? <PText v="tiny" style={{ paddingHorizontal: 4 }}>Sin franjas</PText> : !list.length ? <PText v="tiny" style={{ paddingHorizontal: 4 }}>Libre</PText> : null}
                </View>
              );
            })}
            <View style={{ width: S.lg - S.sm }} />
          </ScrollView>
        )}

        <Panel
          title="Franjas para visitas"
          description={`${openDays} días a la semana, visitas de ${VISIT_MINUTES} minutos.`}
          action={<PButton small label="Editar" variant="ghost" onPress={() => setEditHours(true)} accessibilityLabel="Editar franjas para visitas" />}
          flush
        >
          {WEEKDAYS.map((w, i) => {
            const h = data.space.hours[i];
            return (
              <View key={w} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: 10, borderBottomWidth: i === 6 ? 0 : 1, borderBottomColor: C.borderLight }}>
                <PText v={i === weekdayIndex(today) ? "h3" : "body"}>{w}</PText>
                {h ? <PText v="small" color={C.text}>{`${minutesToLabel(h.open)} a ${minutesToLabel(h.close)}`}</PText> : <PText v="small">Sin visitas</PText>}
              </View>
            );
          })}
        </Panel>
        <Tip title="Visitas por vídeo">
          Los Erasmus de febrero y los admitidos de fuera no pueden venir en persona. Una videollamada de diez minutos enseñando cada habitación reserva tanto como una visita.
        </Tip>
        <Tip title="Menos plantones">
          Los interesados de Franky confirman la visita con su cuenta verificada y reciben un recordatorio. Si alguien no viene, márcalo: queda en su historial.
        </Tip>
      </ProPage>

      <VisitDrawer
        visitId={open}
        onClose={() => setOpen(null)}
        onOpenLead={(id) => {
          setOpen(null);
          setLeadId(id);
        }}
      />
      <LeadDrawer leadId={leadId} onClose={() => setLeadId(null)} />
      <NewVisitDrawer key={creating ? "open" : "closed"} open={creating} onClose={() => setCreating(false)} />
      <HoursDrawer key={editHours ? "h-open" : "h-closed"} open={editHours} onClose={() => setEditHours(false)} />
    </>
  );
}

function VisitRow({ visit, onOpen, last }: { visit: ProVisit; onOpen: () => void; last?: boolean }) {
  const { data } = usePro();
  const lead = data.leads.find((l) => l.id === visit.leadId);
  const property = data.properties.find((p) => p.id === visit.propertyId);
  const agent = data.staff.find((s) => s.id === visit.agentId);
  const done = visit.status !== "scheduled";
  const detail = `${property?.title ?? ""}${
    lead
      ? ` · ${uniShort(lead.university)}, entrada ${new Date(`${lead.moveIn.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" })}`
      : ""
  }${agent && data.staff.length > 1 ? ` · ${agent.name.split(" ")[0]}` : ""}`;
  return (
    <Tap
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Visita a las ${time(visit.start)} con ${lead?.name ?? "interesado"}, ${VISIT_STATUS[visit.status].label.toLowerCase()}`}
      style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, minHeight: 60, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.borderLight }}
    >
      <View style={{ width: 48 }}>
        <Text style={{ fontFamily: FONT.heading, fontSize: 15.5, color: done ? C.muted : C.text }} maxFontSizeMultiplier={1.2}>{time(visit.start)}</Text>
        <PText v="tiny">{`${VISIT_MINUTES} min`}</PText>
      </View>
      <View style={{ width: 4, height: 40, borderRadius: 2, backgroundColor: tone(agent?.tone ?? "slate").bar }} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.sm, rowGap: 2 }}>
          <Text
            style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.text, flexShrink: 1, textDecorationLine: visit.status === "no_show" ? "line-through" : "none" }}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {lead?.name ?? "Interesado"}
          </Text>
          {lead ? <UniBadge university={lead.university} verified={lead.verified} /> : null}
          {lead?.roomieGroup ? <Pill tone="violet" label={`Grupo de ${lead.roomieGroup.size}`} /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {visit.mode === "video" ? <Video size={12} color={C.muted} /> : <MapPin size={12} color={C.muted} />}
          <PText v="tiny" numberOfLines={1} style={{ flex: 1 }}>{detail}</PText>
        </View>
      </View>
      <Pill tone={VISIT_STATUS[visit.status].tone} label={VISIT_STATUS[visit.status].label} />
    </Tap>
  );
}

type DayDraft = { on: boolean; open: number; close: number };

function HoursDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, pending } = usePro();
  const [days, setDays] = React.useState<DayDraft[]>(() =>
    WEEKDAYS.map((_, i) => {
      const h = data.space.hours[i];
      return { on: Boolean(h), open: h?.open ?? 17 * 60, close: h?.close ?? 20 * 60 };
    }),
  );
  const valid = days.every((d) => !d.on || d.close - d.open >= VISIT_MINUTES);
  const save = async () => {
    const hours = days.map((d) => (d.on ? { open: d.open, close: d.close } : null));
    if (!(await update("space.visitHours", (d) => ({ ...d, space: { ...d.space, hours } })))) return;
    const slots = hours.reduce((a, h) => a + (h ? Math.floor((h.close - h.open) / VISIT_MINUTES) : 0), 0);
    toast("Franjas guardadas", { kind: "success", body: `${slots} huecos de visita a la semana. Los interesados eligen hora dentro de ellas.` });
    onClose();
  };
  const set = (i: number, fields: Partial<DayDraft>) => setDays((prev) => prev.map((d, j) => (j === i ? { ...d, ...fields } : d)));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Franjas para visitas"
      description="Cuándo puedes enseñar los pisos. Los interesados solo pueden pedir visita dentro de estas horas."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar franjas" onPress={() => void save()} disabled={pending || !valid} />
        </>
      }
    >
      {WEEKDAYS.map((w, i) => (
        <View key={w} style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: 4, gap: 4 }}>
          <Toggle label={w} detail={days[i].on ? undefined : "Sin visitas"} value={days[i].on} onChange={(v) => set(i, { on: v })} />
          {days[i].on ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.md, paddingBottom: S.sm }}>
              <View style={{ gap: 4 }}>
                <PText v="tiny">Desde</PText>
                <TimeStepper value={days[i].open} onChange={(m) => set(i, { open: m })} label={`${w}, desde`} />
              </View>
              <View style={{ gap: 4 }}>
                <PText v="tiny">Hasta</PText>
                <TimeStepper value={days[i].close} onChange={(m) => set(i, { close: m })} label={`${w}, hasta`} />
              </View>
            </View>
          ) : null}
        </View>
      ))}
      <PText v="tiny">Consejo: una franja de tarde entre semana y el sábado por la mañana cubre a casi todos los estudiantes.</PText>
    </Sheet>
  );
}

/** Mañana: quién viene y quién no ha confirmado todavía, con WhatsApp en un toque. */
function TomorrowPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, now, update, pending } = usePro();
  const { list, unconfirmed } = tomorrowVisits(data, now);
  if (!list.length) return null;
  const confirm = async (id: string) => {
    const ok = await update("visit.confirm", (d) => ({ ...d, visits: d.visits.map((v) => (v.id === id ? { ...v, confirmedAt: new Date().toISOString() } : v)) }));
    if (ok) toast("Visita confirmada", { kind: "success" });
  };
  return (
    <Panel
      title={`Mañana: ${list.length === 1 ? "1 visita" : `${list.length} visitas`}`}
      description={unconfirmed.length ? `${unconfirmed.length} sin confirmar. Escríbeles hoy.` : "Todas confirmadas."}
      flush
    >
      {list.map((v, i) => {
        const lead = data.leads.find((l) => l.id === v.leadId);
        return (
          <View
            key={v.id}
            style={{
              paddingHorizontal: S.lg,
              paddingVertical: S.md,
              gap: S.sm,
              backgroundColor: v.confirmedAt ? undefined : `${C.warning}10`,
              borderBottomWidth: i === list.length - 1 ? 0 : 1,
              borderBottomColor: C.borderLight,
            }}
          >
            <Tap onPress={() => onOpen(v.id)} accessibilityRole="button" accessibilityLabel={`Visita a las ${time(v.start)} con ${lead?.name ?? "el interesado"}`} style={{ gap: 2 }}>
              <PText v="h3" numberOfLines={1}>{`${time(v.start)} · ${lead?.name ?? "Interesado"}`}</PText>
              <PText v="tiny" numberOfLines={1}>{data.properties.find((p) => p.id === v.propertyId)?.title ?? ""}</PText>
            </Tap>
            {v.confirmedAt ? (
              <Pill tone="success" label="Confirmada" />
            ) : (
              <View style={{ flexDirection: "row", gap: S.sm }}>
                <PButton
                  small
                  variant="outline"
                  icon={MessageCircle}
                  label="Pedir"
                  accessibilityLabel={`Pedir confirmación a ${lead?.name ?? "el interesado"}`}
                  onPress={() => openExternal(whatsappHref(visitConfirmText(data, v)))}
                />
                <PButton small variant="secondary" label="Confirmada" onPress={() => void confirm(v.id)} disabled={pending} />
              </View>
            )}
          </View>
        );
      })}
    </Panel>
  );
}
