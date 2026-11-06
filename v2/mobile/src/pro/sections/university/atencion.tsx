import React from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  Clock3,
  LifeBuoy,
  MapPin,
  MessageCircleQuestion,
  Pencil,
  Send,
  Trash2,
  UserX,
  Video,
  X,
} from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import { capitalize, dayLabel, localDate, localMinutes, minutesToLabel, relative, shortDay } from "../../../../../shared/pro/format";
import { uniExtrasOf } from "../../../../../shared/pro/university";
import { faqForTopic, faqsOf, sendFaqToAppointment } from "../../../../../shared/pro/university-faq";
import {
  APPOINTMENT_STATUS_LABEL,
  DESK_LABEL,
  DESK_ORDER,
  WEEKDAY_LABEL,
  bookAppointment,
  dayAgenda,
  daySummary,
  demandByDesk,
  helpCountLabel,
  helpSeries,
  helpTrend,
  noShowRate,
  officeOf,
  openDays,
  setAppointmentStatus,
  slotProblem,
  weekLoad,
  weekStart,
  withOffice,
  type OfficeCell,
} from "../../../../../shared/pro/university-office";
import type { ProUniAppointmentStatus, ProUniDesk, ProUniOfficeSlot } from "../../../../../shared/pro/university-types";
import { localId, usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import { Bars, ChoiceGrid, Detail, Empty, Field, Input, Kpi, KpiRow, ListRow, Meter, PButton, PText, PageHeader, Panel, Pill, Sheet, TimeStepper, Toggle } from "../../kit";
import { EmptyBox, facultyOptions, useUniAction } from "./ui";

const STATUS_TONE: Record<ProUniAppointmentStatus, "neutral" | "success" | "danger" | "info"> = {
  booked: "info",
  done: "success",
  no_show: "danger",
  cancelled: "neutral",
};

export default function UniversityAtencion() {
  const { data, now } = usePro();
  const office = officeOf(data);
  const today = localDate(now);
  const days = openDays(office, today, 10);
  const [day, setDay] = React.useState<string | null>(null);
  const selected = day && days.includes(day) ? day : days[0] ?? today;

  const [slotEditing, setSlotEditing] = React.useState<string | null>(null);
  const [booking, setBooking] = React.useState<OfficeCell | null>(null);
  const [openAppointment, setOpenAppointment] = React.useState<string | null>(null);

  const columns = dayAgenda(office, selected, now);
  const summary = daySummary(columns);
  const load = new Map([...new Set(days.map(weekStart))].flatMap((monday) => weekLoad(office, monday)).map((d) => [d.date, d]));
  const trend = helpTrend(office.helpWeeks, now);
  const isToday = selected === today;
  const dayName = isToday ? "Hoy" : capitalize(dayLabel(`${selected}T12:00:00Z`));

  const description = office.slots.length
    ? `${dayName}: ${summary.booked === 1 ? "1 cita pendiente" : `${summary.booked} citas pendientes`} y ${
        summary.free === 1 ? "1 hueco libre" : `${summary.free} huecos libres`
      }${summary.next ? `. La siguiente, a las ${minutesToLabel(summary.next.start)}` : ""}.`
    : "Publica tus franjas y los estudiantes piden hueco desde Franky, sin colas en el mostrador.";

  return (
    <ProPage>
      <PageHeader
        eyebrow="Atención al estudiante"
        title="Horas de atención"
        description={description}
        actions={<PButton label="Publicar franja" icon={CalendarPlus} onPress={() => setSlotEditing("new")} />}
      >
        {days.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }} style={{ flexGrow: 0 }}>
            {days.map((d) => {
              const active = d === selected;
              const info = load.get(d);
              return (
                <Tap
                  key={d}
                  onPress={() => setDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={dayLabel(`${d}T12:00:00Z`)}
                  style={{ minHeight: 48, minWidth: 84, paddingHorizontal: S.md, justifyContent: "center", borderRadius: R.md, borderWidth: 1, borderColor: active ? C.text : C.border, backgroundColor: active ? C.text : C.surface }}
                >
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: active ? C.bg : C.text }} maxFontSizeMultiplier={1.3}>
                    {d === today ? "Hoy" : capitalize(shortDay(`${d}T12:00:00Z`))}
                  </Text>
                  {info ? (
                    <Text style={{ fontSize: 11, color: active ? C.bg : C.muted, opacity: active ? 0.75 : 1 }} maxFontSizeMultiplier={1.3}>
                      {`${info.booked} de ${info.capacity}`}
                    </Text>
                  ) : null}
                </Tap>
              );
            })}
          </ScrollView>
        ) : null}
      </PageHeader>

      <KpiRow>
        <Kpi icon={CalendarClock} label={isToday ? "Citas hoy" : "Citas ese día"} value={summary.booked + summary.done + summary.noShow} hint={summary.done ? `${summary.done} ya atendidas` : "Sin atender aún"} emphasis={summary.booked > 0} />
        <Kpi icon={Clock3} label="Huecos libres" value={summary.free} hint={`De ${summary.capacity} del día`} />
        <Kpi icon={UserX} label="No vinieron" value={`${noShowRate(office.appointments, now)} %`} hint="Últimas cuatro semanas" />
        <Kpi icon={LifeBuoy} label="Pedir ayuda" value={office.helpWeeks.length ? helpCountLabel(trend.current) : "0"} hint="Pulsaciones esta semana" />
      </KpiRow>

      {!office.slots.length ? (
        <EmptyBox>
          <Empty
            icon={CalendarClock}
            title="Aún no has publicado horas de atención"
            body="Crea una franja por mesa (becas, matrícula, alojamiento o internacional). Los estudiantes piden hueco desde Franky y aquí ves la agenda de cada día."
            action={<PButton label="Publicar la primera franja" icon={CalendarPlus} onPress={() => setSlotEditing("new")} />}
          />
        </EmptyBox>
      ) : columns.length ? (
        columns.map(({ slot, cells }) => {
          const given = cells.filter((c) => c.appointment && c.appointment.status !== "cancelled").length;
          return (
            <Panel
              key={slot.id}
              title={DESK_LABEL[slot.desk]}
              description={`${minutesToLabel(slot.start)} a ${minutesToLabel(slot.end)} · ${slot.staff} · ${given} de ${cells.length} dados`}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: S.sm }}>
                {slot.online ? <Video size={12} color={C.muted} /> : <MapPin size={12} color={C.muted} />}
                <PText v="tiny" numberOfLines={1} style={{ flex: 1 }}>{slot.place}</PText>
              </View>
              <View style={{ gap: 6 }}>
                {cells.map((cell) => (
                  <CellRow key={cell.start} cell={cell} onBook={setBooking} onOpen={setOpenAppointment} />
                ))}
              </View>
            </Panel>
          );
        })
      ) : (
        <EmptyBox>
          <Empty icon={CalendarClock} title="Ese día no hay franjas" body="Elige otro día o publica una franja nueva." />
        </EmptyBox>
      )}

      <HelpPanel />
      <DemandPanel />
      <SlotsPanel onEdit={setSlotEditing} />

      <SlotSheet id={slotEditing} onClose={() => setSlotEditing(null)} />
      <BookSheet cell={booking} onClose={() => setBooking(null)} />
      <AppointmentSheet id={openAppointment} onClose={() => setOpenAppointment(null)} />
    </ProPage>
  );
}

function CellRow({ cell, onBook, onOpen }: { cell: OfficeCell; onBook: (c: OfficeCell) => void; onOpen: (id: string) => void }) {
  const a = cell.appointment;
  const hour = (
    <Text style={{ width: 46, fontFamily: FONT.semibold, fontSize: 12.5, color: C.muted }} maxFontSizeMultiplier={1.3}>
      {minutesToLabel(cell.start)}
    </Text>
  );
  const row = { minHeight: 48, flexDirection: "row" as const, alignItems: "center" as const, gap: S.sm, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: S.sm };

  if (a) {
    return (
      <Tap
        onPress={() => onOpen(a.id)}
        accessibilityRole="button"
        accessibilityLabel={`${minutesToLabel(cell.start)}, ${a.student}`}
        style={{ ...row, borderWidth: 1, borderColor: a.status === "booked" ? `${C.blue}40` : C.border, backgroundColor: a.status === "booked" ? C.accentSoft : C.surface }}
      >
        {hour}
        <View style={{ flex: 1 }}>
          <PText v="h3" numberOfLines={1} color={a.status === "no_show" ? C.muted : undefined}>{a.student}</PText>
          <PText v="tiny" numberOfLines={1}>{a.topic}</PText>
        </View>
        {a.status !== "booked" ? <Pill tone={STATUS_TONE[a.status]} label={APPOINTMENT_STATUS_LABEL[a.status]} /> : null}
      </Tap>
    );
  }
  if (cell.past) {
    return (
      <View style={row}>
        {hour}
        <PText v="small">Sin cita</PText>
      </View>
    );
  }
  return (
    <Tap
      onPress={() => onBook(cell)}
      accessibilityRole="button"
      accessibilityLabel={`Apuntar una cita a las ${minutesToLabel(cell.start)}`}
      style={{ ...row, borderWidth: 1, borderStyle: "dashed", borderColor: C.border }}
    >
      {hour}
      <PText v="small">Libre</PText>
    </Tap>
  );
}

/* ------------------------------------------------------------------ */
/* Franja                                                              */
/* ------------------------------------------------------------------ */

type SlotForm = Omit<ProUniOfficeSlot, "id">;

function SlotSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const office = officeOf(data);
  const existing = id && id !== "new" ? office.slots.find((s) => s.id === id) ?? null : null;
  const [form, setForm] = React.useState<SlotForm>({ weekday: 1, start: 600, end: 780, minutes: 20, desk: "general", staff: "", place: "", online: false });

  React.useEffect(() => {
    if (!id) return;
    if (existing) setForm({ ...existing });
    else {
      const last = office.slots.at(-1);
      setForm({ weekday: 1, start: 600, end: 780, minutes: 20, desk: "general", staff: data.space.owner.name, place: last?.place ?? data.space.address, online: false });
    }
    // Solo al abrir: mientras se edita no se pisa lo que escribe la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const today = localDate(now);
  const pendingCount = existing ? office.appointments.filter((a) => a.slotId === existing.id && a.status === "booked" && a.date >= today).length : 0;
  const locked = pendingCount > 0;
  const problem = slotProblem(office.slots, { ...form, id: existing?.id });
  const set = <K extends keyof SlotForm>(key: K, value: SlotForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (problem) return;
    const slot: ProUniOfficeSlot = { ...form, id: existing?.id ?? localId("o"), staff: form.staff.trim(), place: form.place.trim() };
    const ok = await run(
      existing ? "office.slot.update" : "office.slot.create",
      (d) => withOffice(d, (o) => ({ slots: existing ? o.slots.map((s) => (s.id === slot.id ? slot : s)) : [...o.slots, slot] })),
      existing ? "Franja actualizada" : "Franja publicada",
      existing ? undefined : `Los estudiantes ya pueden pedir hueco los ${WEEKDAY_LABEL[slot.weekday].toLowerCase()} de ${minutesToLabel(slot.start)} a ${minutesToLabel(slot.end)}.`,
    );
    if (ok) onClose();
  };

  const remove = async () => {
    if (!existing || locked) return;
    const ok = await run(
      "office.slot.remove",
      (d) => withOffice(d, (o) => ({ slots: o.slots.filter((s) => s.id !== existing.id) })),
      "Franja retirada",
      "Ya no se puede pedir cita en ella. Las citas pasadas siguen en el historial.",
    );
    if (ok) onClose();
  };

  return (
    <Sheet
      open={Boolean(id)}
      onClose={onClose}
      title={existing ? "Editar franja" : "Publicar franja"}
      description="Se repite cada semana el mismo día."
      footer={
        <>
          {existing ? <PButton label="Retirar" icon={Trash2} variant="ghost" disabled={locked} onPress={() => void remove()} /> : null}
          <PButton label={existing ? "Guardar cambios" : "Publicar franja"} disabled={Boolean(problem)} onPress={() => void save()} />
        </>
      }
    >
      <Field label="Mesa">
        <ChoiceGrid<ProUniDesk> value={form.desk} onChange={(v) => set("desk", v)} options={DESK_ORDER.map((d) => ({ value: d, label: DESK_LABEL[d] }))} />
      </Field>
      <Field label="Día" hint={locked ? `Tiene ${pendingCount} citas pendientes: el día y la hora no se pueden cambiar.` : undefined}>
        <ChoiceGrid<string>
          value={String(form.weekday)}
          onChange={(v) => !locked && set("weekday", Number(v))}
          options={WEEKDAY_LABEL.slice(0, 5).map((label, i) => ({ value: String(i), label }))}
        />
      </Field>
      <Field label="Desde">
        <TimeStepper label="Hora de inicio" value={form.start} onChange={(v) => !locked && set("start", v)} />
      </Field>
      <Field label="Hasta">
        <TimeStepper label="Hora de fin" value={form.end} onChange={(v) => !locked && set("end", v)} />
      </Field>
      <Field label="Cada cita dura">
        <ChoiceGrid<string>
          value={String(form.minutes)}
          onChange={(v) => !locked && set("minutes", Number(v))}
          options={[10, 15, 20, 30].map((m) => ({ value: String(m), label: `${m} min` }))}
        />
      </Field>
      <Field label="Quién atiende">
        <Input value={form.staff} onChangeText={(v) => set("staff", v)} placeholder="Nombre y apellido" label="Quién atiende" />
      </Field>
      <Toggle label="Por videollamada" detail="El estudiante entra desde Franky a su hora." value={form.online} onChange={(v) => set("online", v)} />
      <Field label={form.online ? "Enlace o sala" : "Lugar"}>
        <Input value={form.place} onChangeText={(v) => set("place", v)} placeholder={form.online ? "Videollamada desde Franky" : "Mostrador del SAE, Rectorado"} label="Lugar" />
      </Field>
      {problem ? <PText v="small" color={C.warning}>{problem}</PText> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Apuntar una cita                                                    */
/* ------------------------------------------------------------------ */

function BookSheet({ cell, onClose }: { cell: OfficeCell | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const faculties = facultyOptions(data);
  const slot = cell ? officeOf(data).slots.find((s) => s.id === cell.slotId) : undefined;
  const [student, setStudent] = React.useState("");
  const [faculty, setFaculty] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [taken, setTaken] = React.useState(false);

  React.useEffect(() => {
    setStudent("");
    setFaculty("");
    setTopic("");
    setTaken(false);
  }, [cell]);

  const valid = student.trim().length > 2 && topic.trim().length > 2;

  const save = async () => {
    if (!cell || !slot || !valid) return;
    let clash = false;
    const ok = await run(
      "office.appointment.create",
      (d) =>
        withOffice(d, (o) => {
          const next = bookAppointment(
            o.appointments,
            { id: localId("ap"), slotId: slot.id, date: cell.date, start: cell.start, desk: slot.desk, student: student.trim(), faculty: faculty || "Sin indicar", topic: topic.trim(), via: "desk" },
            now,
          );
          // Otra persona del equipo lo ha dado a la vez: no se pisa.
          if (!next) clash = true;
          return { appointments: next ?? o.appointments };
        }),
      "Cita apuntada",
      `${student.trim()}, ${dayLabel(`${cell.date}T12:00:00Z`)} a las ${minutesToLabel(cell.start)}.`,
    );
    if (clash) setTaken(true);
    else if (ok) onClose();
  };

  return (
    <Sheet
      open={Boolean(cell)}
      onClose={onClose}
      title="Apuntar una cita"
      description={cell && slot ? `${DESK_LABEL[slot.desk]}, ${dayLabel(`${cell.date}T12:00:00Z`)} a las ${minutesToLabel(cell.start)}` : undefined}
      footer={<PButton label="Apuntar cita" disabled={!valid} onPress={() => void save()} />}
    >
      <PText v="small">Para quien llama o pasa por el mostrador. Los demás la piden desde Franky.</PText>
      <Field label="Estudiante">
        <Input value={student} onChangeText={setStudent} placeholder="Nombre y apellido" label="Estudiante" />
      </Field>
      <Field label="Facultad">
        {faculties.length ? (
          <ChoiceGrid<string> value={faculty} onChange={setFaculty} options={[{ value: "", label: "Sin indicar" }, ...faculties.map((f) => ({ value: f, label: f }))]} />
        ) : (
          <Input value={faculty} onChangeText={setFaculty} placeholder="Derecho" label="Facultad" />
        )}
      </Field>
      <Field label="Qué necesita">
        <Input value={topic} onChangeText={setTopic} multiline placeholder="Dudas con la beca del Ministerio" label="Qué necesita" />
      </Field>
      {taken ? <PText v="small" color={C.errorText}>Ese hueco se acaba de dar. Elige otro en la agenda.</PText> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de una cita                                                 */
/* ------------------------------------------------------------------ */

function AppointmentSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const office = officeOf(data);
  const a = id ? office.appointments.find((x) => x.id === id) : undefined;
  const slot = a ? office.slots.find((s) => s.id === a.slotId) : undefined;
  if (!a) return null;

  const mark = async (status: ProUniAppointmentStatus, title: string, detail?: string) => {
    const ok = await run("office.appointment.status", (d) => withOffice(d, (o) => ({ appointments: setAppointmentStatus(o.appointments, a.id, status) })), title, detail);
    if (ok) onClose();
  };
  const today = localDate(now);
  const started = a.date < today || (a.date === today && a.start <= localMinutes(now));

  return (
    <Sheet
      open={Boolean(id)}
      onClose={onClose}
      title={a.student}
      description={`${dayLabel(`${a.date}T12:00:00Z`)} a las ${minutesToLabel(a.start)}`}
      footer={
        a.status === "booked" ? (
          <>
            <PButton label="Cancelar" icon={X} variant="ghost" onPress={() => void mark("cancelled", "Cita cancelada", "El hueco vuelve a estar libre.")} />
            {started ? <PButton label="No vino" icon={UserX} variant="outline" onPress={() => void mark("no_show", "Apuntado que no vino")} /> : null}
            <PButton label="Atendida" icon={Check} onPress={() => void mark("done", "Cita atendida")} />
          </>
        ) : a.status !== "cancelled" ? (
          <PButton label="Deshacer" variant="outline" onPress={() => void mark("booked", "Cita pendiente otra vez")} />
        ) : null
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pill tone={STATUS_TONE[a.status]} label={APPOINTMENT_STATUS_LABEL[a.status]} />
        <Pill label={a.via === "franky" ? "Pedida desde Franky" : "Apuntada por el equipo"} />
      </View>
      <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md, gap: 2 }}>
        <PText v="tiny">Qué necesita</PText>
        <PText v="body">{a.topic}</PText>
      </View>
      <FaqSuggestion appointmentId={a.id} onSent={onClose} />
      <View>
        <Detail label="Mesa" value={DESK_LABEL[a.desk]} />
        {slot ? <Detail label="Atiende" value={slot.staff} /> : null}
        {slot ? <Detail label={slot.online ? "Videollamada" : "Lugar"} value={slot.place} /> : null}
        <Detail label="Facultad" value={a.faculty} />
        {a.createdAt ? <Detail label="Pedida" value={relative(a.createdAt, now.getTime())} last /> : null}
      </View>
    </Sheet>
  );
}

/**
 * "Esto ya está en las preguntas": si la duda de la cita ya tiene respuesta,
 * se le envía con un toque. La cita no se cancela: decide el estudiante.
 */
function FaqSuggestion({ appointmentId, onSent }: { appointmentId: string; onSent: () => void }) {
  const { data, now, pending } = usePro();
  const run = useUniAction();
  const go = useGoSection();
  const faqs = faqsOf(data);
  const a = officeOf(data).appointments.find((x) => x.id === appointmentId);
  if (!a || !faqs.length) return null;

  const sentFaq = a.faqId ? faqs.find((f) => f.id === a.faqId) : undefined;
  if (sentFaq) {
    return (
      <View style={{ flexDirection: "row", gap: S.sm, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md }}>
        <MessageCircleQuestion size={16} color={C.blue} strokeWidth={1.9} style={{ marginTop: 2 }} />
        <PText v="small" style={{ flex: 1 }}>
          {`Le enviaste la respuesta${a.faqSentAt ? ` ${relative(a.faqSentAt, now.getTime())}` : ""}: ${sentFaq.question}`}
        </PText>
      </View>
    );
  }

  const match = a.status === "booked" ? faqForTopic(faqs, a.topic, a.desk) : null;
  if (!match) return null;

  const send = async () => {
    const ok = await run(
      "office.appointment.faq",
      (d) => withOffice(d, (o) => ({ appointments: sendFaqToAppointment(o.appointments, a.id, match.id, now) })),
      "Respuesta enviada",
      "Le llega en Franky. Si con eso le basta, puede anular la cita y el hueco queda libre.",
    );
    if (ok) onSent();
  };

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: `${C.blue}40`, backgroundColor: C.accentSoft, padding: S.md, gap: S.sm }}>
      <PText v="label" color={C.blueDeep}>Esto ya está en las preguntas</PText>
      <PText v="h3">{match.question}</PText>
      <PText v="small" numberOfLines={3}>{match.answer}</PText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        <PButton label="Enviarle la respuesta" icon={Send} small onPress={() => void send()} disabled={pending} />
        <PButton label="Ver preguntas" variant="ghost" small onPress={() => go("preguntas")} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Paneles                                                             */
/* ------------------------------------------------------------------ */

function HelpPanel() {
  const { data, now } = usePro();
  const extras = uniExtrasOf(data);
  const office = officeOf(data);
  const series = helpSeries(office.helpWeeks, now, 8);
  const trend = helpTrend(office.helpWeeks, now);

  return (
    <Panel title="Pedir ayuda" description="Veces que se pulsó el botón fijo de las publicaciones de bienestar. Solo el total, nunca quién.">
      {office.helpWeeks.length ? (
        <View style={{ gap: S.md }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: S.md }}>
            <View>
              <Text style={{ fontFamily: FONT.display, fontSize: 30, color: C.text }} maxFontSizeMultiplier={1.2}>{helpCountLabel(trend.current)}</Text>
              <PText v="tiny">esta semana</PText>
            </View>
            {trend.deltaPct !== null && !trend.hidden ? (
              <Pill tone={trend.deltaPct >= 25 ? "warning" : "neutral"} label={`${trend.deltaPct >= 0 ? "+" : ""}${trend.deltaPct} % sobre la media`} />
            ) : null}
          </View>
          <Bars
            height={100}
            values={series.map((w) => w.presses)}
            labels={series.map((w) => `${Number(w.week.slice(8, 10))}/${Number(w.week.slice(5, 7))}`)}
            format={(v) => (v < 10 ? "" : String(v))}
          />
          {trend.deltaPct !== null && trend.deltaPct >= 25 ? (
            <PText v="small">Más que de costumbre. Si el servicio psicológico va justo, publica sus horas sin cita en una publicación con el botón de ayuda.</PText>
          ) : null}
        </View>
      ) : (
        <PText v="small">Cuando una publicación lleve el botón “Pedir ayuda”, aquí verás cuántas veces se pulsa cada semana.</PText>
      )}
      {extras.help.length ? (
        <View style={{ marginTop: S.md, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: S.sm }}>
          {extras.help.map((h) => (
            <Tap
              key={h.label}
              onPress={() => void Linking.openURL(h.href.startsWith("/") ? `https://franky.es${h.href}` : h.href)}
              accessibilityRole="link"
              accessibilityLabel={h.label}
              style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 6 }}
            >
              <LifeBuoy size={16} color={C.muted} strokeWidth={1.9} />
              <View style={{ flex: 1 }}>
                <PText v="h3">{h.label}</PText>
                <PText v="tiny">{h.detail}</PText>
              </View>
            </Tap>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}

function DemandPanel() {
  const { data, now } = usePro();
  const demand = demandByDesk(officeOf(data).appointments, now);
  if (!demand.length) return null;
  const max = demand[0].count;
  return (
    <Panel title="Qué os piden" description="Citas por mesa en las últimas cuatro semanas.">
      <View style={{ gap: S.md }}>
        {demand.map((d) => (
          <View key={d.desk} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
              <PText v="small" color={C.text}>{DESK_LABEL[d.desk]}</PText>
              <PText v="h3">{String(d.count)}</PText>
            </View>
            <Meter value={d.count} max={max} />
          </View>
        ))}
      </View>
    </Panel>
  );
}

function SlotsPanel({ onEdit }: { onEdit: (id: string) => void }) {
  const { data } = usePro();
  const office = officeOf(data);
  if (!office.slots.length) return null;
  const sorted = [...office.slots].sort((a, b) => a.weekday - b.weekday || a.start - b.start);
  return (
    <Panel title="Franjas publicadas" description={`${office.slots.length} a la semana. Toca una para cambiarla.`} flush>
      {sorted.map((s, i) => (
        <ListRow key={s.id} onPress={() => onEdit(s.id)} accessibilityLabel={`${WEEKDAY_LABEL[s.weekday]}, ${DESK_LABEL[s.desk]}`} last={i === sorted.length - 1}>
          <PText v="label" style={{ width: 36 }}>{WEEKDAY_LABEL[s.weekday].slice(0, 3)}</PText>
          <View style={{ flex: 1 }}>
            <PText v="h3" numberOfLines={1}>{DESK_LABEL[s.desk]}</PText>
            <PText v="tiny" numberOfLines={1}>{`${minutesToLabel(s.start)} a ${minutesToLabel(s.end)} · ${s.staff}`}</PText>
          </View>
          <Pencil size={14} color={C.muted} strokeWidth={1.9} />
        </ListRow>
      ))}
    </Panel>
  );
}
