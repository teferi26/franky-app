import React from "react";
import { Alert, Linking, Text, View } from "react-native";
import { AlertTriangle, CalendarCheck, Copy, Phone, Plus, Trash2 } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProStaff } from "../../../../../shared/pro/types";
import type { ProRotaShift } from "../../../../../shared/pro/tables-types";
import {
  coverageGaps,
  eventsOn,
  missingClockIns,
  mondayOf,
  plannedMinutes,
  rotaMessage,
  weekDates,
  workedMinutes,
} from "../../../../../shared/pro/tables-ops";
import { addDays, dayLabel, durationLabel, localDate, minutesToLabel, plural } from "../../../../../shared/pro/format";
import { VENUE_EVENT_KIND_LABEL } from "../../../../../shared/pro/tables-insights";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  ChoiceGrid,
  Field,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  LiveDot,
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Panel,
  Sheet,
  StepNav,
  Tip,
  TimeStepper,
  tone,
} from "../../kit";
import { OpsMissing, WhatsAppButton, useTablesOps } from "./ops";

/**
 * Cuadrante del equipo, versión nativa de web/.../tables/turnos.tsx. En el
 * móvil se ve día a día: cada persona con su turno pintado sobre las horas
 * de apertura, y la semana entera en horas previstas y fichadas.
 */

type Edit = { staffId: string; date: string; shift?: ProRotaShift } | null;

const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const NAME_W = 92;

export default function TablesTurnos() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const today = localDate(now);
  const [monday, setMonday] = React.useState(mondayOf(today));
  const [day, setDay] = React.useState(today);
  const [edit, setEdit] = React.useState<Edit>(null);
  if (!ops) {
    return (
      <ProPage>
        <PageHeader eyebrow="Turnos" title="Cuadrante del equipo" />
        <OpsMissing icon={CalendarCheck} title="Sin cuadrante todavía" />
      </ProPage>
    );
  }

  const days = weekDates(monday);
  const selected = days.includes(day) ? day : days[0];
  const missing = missingClockIns(ops, data.staff, data.shifts, now);
  const gaps = coverageGaps(ops, monday, data.space.hours);
  const planned = data.staff.reduce((a, s) => a + plannedMinutes(ops, s.id, monday), 0);
  const worked = data.staff.reduce((a, s) => a + workedMinutes(data.shifts, s.id, days, now), 0);
  const isThisWeek = monday === mondayOf(today);

  const showWeek = (next: string) => {
    setMonday(next);
    setDay(next === mondayOf(today) ? today : next);
  };

  const copyPrevious = async () => {
    const prev = weekDates(addDays(monday, -7));
    const source = ops.rota.filter((s) => prev.includes(s.date));
    if (!source.length) {
      toast("La semana anterior está vacía", { kind: "info" });
      return;
    }
    const copies = source.map((s) => ({ ...s, id: localId("rt"), date: addDays(s.date, 7) }));
    const ok = await save("rota.copy", (o) => ({
      ...o,
      rota: [...o.rota.filter((s) => !days.includes(s.date)), ...copies],
    }));
    if (ok) toast("Semana copiada", { kind: "success", body: plural(copies.length, "turno", "turnos") });
  };

  const weekLabel = `Del ${Number(monday.slice(8))} al ${dayLabel(`${addDays(monday, 6)}T12:00:00Z`, { weekday: false })}`;

  return (
    <ProPage>
      <PageHeader
        eyebrow="Turnos"
        title="Cuadrante del equipo"
        description={
          missing.length
            ? `${missing.map((m) => m.staff.name.split(" ")[0]).join(" y ")} ${missing.length === 1 ? "tenía" : "tenían"} turno y no ${missing.length === 1 ? "ha" : "han"} fichado.`
            : `${durationLabel(planned)} en el cuadrante esta semana${gaps.length ? `, ${plural(gaps.length, "día con horas sin cubrir", "días con horas sin cubrir")}` : ", todo cubierto"}.`
        }
        actions={
          <>
            <WhatsAppButton
              share
              variant="dark"
              small={false}
              label="Enviar al equipo"
              message={rotaMessage(ops, data.staff, monday, data.space.name)}
            />
            <PButton label="Copiar la anterior" icon={Copy} variant="outline" onPress={() => void copyPrevious()} />
          </>
        }
      />

      {missing.length ? (
        <Panel title="No han fichado" flush style={{ borderColor: `${C.warning}88` }}>
          {missing.map((m, i) => (
            <View
              key={m.staff.id}
              style={{
                paddingHorizontal: S.lg,
                paddingVertical: S.md,
                gap: S.sm,
                borderBottomWidth: i === missing.length - 1 ? 0 : 1,
                borderBottomColor: C.borderLight,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <AlertTriangle size={16} color={C.warning} strokeWidth={1.9} />
                <PText v="body" style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT.semibold }}>{m.staff.name}</Text>
                  {` entraba a las ${minutesToLabel(m.from)}, hace ${durationLabel(m.late)}`}
                </PText>
              </View>
              <View style={{ flexDirection: "row", gap: S.sm, paddingLeft: 24 }}>
                {m.staff.phone ? (
                  <PButton
                    label="Llamar"
                    icon={Phone}
                    variant="outline"
                    small
                    onPress={() => void Linking.openURL(`tel:${m.staff.phone!.replace(/\s/g, "")}`)}
                  />
                ) : null}
                <WhatsAppButton
                  phone={m.staff.phone}
                  share={!m.staff.phone}
                  message={`Hola ${m.staff.name.split(" ")[0]}, hoy entrabas a las ${minutesToLabel(m.from)}. ¿Va todo bien? Acuérdate de fichar al llegar.`}
                />
              </View>
            </View>
          ))}
        </Panel>
      ) : null}

      <KpiRow>
        <Kpi label="Horas en el cuadrante" value={durationLabel(planned)} hint="esta semana" />
        <Kpi label="Horas fichadas" value={durationLabel(worked)} hint={isThisWeek ? "hasta ahora" : "esa semana"} />
        <Kpi label="Fichados ahora" value={data.staff.filter((s) => s.clockedInAt).length} hint={`de ${data.staff.length} personas`} />
        <Kpi label="Sin cubrir" value={gaps.length} hint={gaps.length ? "días con huecos" : "todo cubierto"} emphasis={gaps.length > 0} />
      </KpiRow>

      <Panel title={weekLabel}>
        <StepNav
          onPrev={() => showWeek(addDays(monday, -7))}
          onNext={() => showWeek(addDays(monday, 7))}
          onToday={() => showWeek(mondayOf(today))}
          isToday={isThisWeek}
        />
        <View style={{ flexDirection: "row", gap: 4, marginBottom: S.lg }}>
          {days.map((date, i) => {
            const active = date === selected;
            const count = new Set(ops.rota.filter((s) => s.date === date).map((s) => s.staffId)).size;
            const closed = !data.space.hours[i];
            return (
              <Tap
                key={date}
                onPress={() => setDay(date)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${dayLabel(`${date}T12:00:00Z`)}, ${closed ? "cerrado" : plural(count, "persona", "personas")}`}
                style={{
                  flex: 1,
                  minHeight: 58,
                  borderRadius: R.md,
                  borderWidth: 1,
                  borderColor: active ? C.text : date === today ? C.blue : C.border,
                  backgroundColor: active ? C.text : C.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                }}
              >
                <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: active ? C.bg : C.muted }} maxFontSizeMultiplier={1.2}>
                  {DAY_SHORT[i]}
                </Text>
                <Text style={{ fontSize: 15, fontFamily: FONT.heading, color: active ? C.bg : C.text }} maxFontSizeMultiplier={1.2}>
                  {Number(date.slice(8))}
                </Text>
                <Text style={{ fontSize: 10, color: active ? C.bg : C.muted }} maxFontSizeMultiplier={1.2}>
                  {closed ? "cerr." : count}
                </Text>
              </Tap>
            );
          })}
        </View>
        <DayTimeline date={selected} onEdit={setEdit} />
      </Panel>

      <Panel title="Horas de la semana" flush>
        {data.staff.map((person, i) => (
          <ListRow key={person.id} last={i === data.staff.length - 1}>
            <PAvatar name={person.name} toneKey={person.tone} size={32} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <PText v="h3" numberOfLines={1}>
                  {person.name.split(" ")[0]}
                </PText>
                {person.clockedInAt && isThisWeek ? <LiveDot /> : null}
              </View>
              <PText v="tiny" numberOfLines={1}>
                {person.title}
              </PText>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <PText v="h3">{durationLabel(plannedMinutes(ops, person.id, monday))}</PText>
              <PText v="tiny">{`${durationLabel(workedMinutes(data.shifts, person.id, days, now))} fichadas`}</PText>
            </View>
          </ListRow>
        ))}
      </Panel>

      <Panel title="Horas sin cubrir" flush>
        {gaps.length ? (
          gaps.map((g, i) => (
            <ListRow key={g.date} last={i === gaps.length - 1}>
              <PText v="h3" style={{ flex: 1 }}>
                {dayLabel(`${g.date}T12:00:00Z`)}
              </PText>
              <PText v="body" color={C.warning}>{`${durationLabel(g.uncovered)} sin nadie`}</PText>
            </ListRow>
          ))
        ) : (
          <View style={{ padding: S.lg }}>
            <PText v="small">Todo el horario de apertura tiene a alguien.</PText>
          </View>
        )}
      </Panel>

      <Tip title="Cuadrante y fichaje juntos">
        Lo que planificas aquí se compara con lo que fichan de verdad en Equipo. Si alguien no ficha a su hora, lo verás en Hoy y aquí arriba.
      </Tip>

      <ShiftSheet edit={edit} onClose={() => setEdit(null)} staff={data.staff} />
    </ProPage>
  );
}

/**
 * Un día del cuadrante: cada persona en una fila con su turno pintado sobre
 * las horas del local. Tocar un turno lo edita; tocar la fila vacía añade uno.
 */
function DayTimeline({ date, onEdit }: { date: string; onEdit: (e: Edit) => void }) {
  const { data } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const weekday = weekDates(mondayOf(date)).indexOf(date);
  const hours = data.space.hours[weekday];
  const shifts = ops.rota.filter((s) => s.date === date);
  const events = eventsOn(ops, date);
  // El eje va de la primera a la última hora con local abierto o con turnos.
  const from = Math.floor(Math.min(hours?.open ?? 9 * 60, ...shifts.map((s) => s.from)) / 60) * 60;
  const to = Math.ceil(Math.max(hours?.close ?? 18 * 60, ...shifts.map((s) => s.to)) / 60) * 60;
  const span = Math.max(60, to - from);
  const pct = (m: number) => `${((m - from) / span) * 100}%` as const;
  const ticks: number[] = [];
  for (let m = from; m <= to; m += span > 12 * 60 ? 240 : 120) ticks.push(m);

  return (
    <View style={{ gap: S.sm }}>
      <PText v="small">
        {hours ? `Abierto de ${minutesToLabel(hours.open)} a ${minutesToLabel(hours.close % 1440)}` : "Cerrado ese día"}
        {events.length ? `, ${VENUE_EVENT_KIND_LABEL[events[0].kind].toLowerCase()}: ${events[0].title}` : ""}
      </PText>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: NAME_W }} />
        <View style={{ flex: 1, height: 16 }}>
          {ticks.map((m) => (
            <Text
              key={m}
              style={{ position: "absolute", left: pct(m), fontSize: 10, color: C.muted, transform: [{ translateX: -12 }] }}
              maxFontSizeMultiplier={1.1}
            >
              {minutesToLabel(m % 1440)}
            </Text>
          ))}
        </View>
      </View>
      {data.staff.map((person) => {
        const mine = shifts.filter((s) => s.staffId === person.id).sort((a, b) => a.from - b.from);
        const t = tone(person.tone);
        return (
          <View key={person.id} style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: NAME_W, flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 6 }}>
              <PAvatar name={person.name} toneKey={person.tone} size={26} />
              <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>
                {person.name.split(" ")[0]}
              </PText>
            </View>
            <Tap
              onPress={() => onEdit({ staffId: person.id, date })}
              accessibilityRole="button"
              accessibilityLabel={`Añadir turno a ${person.name.split(" ")[0]}`}
              style={{ flex: 1, height: 44, borderRadius: R.sm, backgroundColor: C.input, justifyContent: "center" }}
            >
              {hours ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: pct(hours.open),
                    width: `${((Math.min(hours.close, to) - hours.open) / span) * 100}%`,
                    top: 0,
                    bottom: 0,
                    borderRadius: R.sm,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: C.border,
                  }}
                />
              ) : null}
              {mine.length ? null : (
                <View pointerEvents="none" style={{ alignItems: "center" }}>
                  <Plus size={14} color={C.muted} />
                </View>
              )}
              {mine.map((s) => (
                <Tap
                  key={s.id}
                  onPress={() => onEdit({ staffId: person.id, date, shift: s })}
                  accessibilityRole="button"
                  accessibilityLabel={`Turno de ${person.name.split(" ")[0]} de ${minutesToLabel(s.from)} a ${minutesToLabel(s.to % 1440)}`}
                  style={{
                    position: "absolute",
                    left: pct(s.from),
                    width: `${((s.to - s.from) / span) * 100}%`,
                    top: 4,
                    bottom: 4,
                    borderRadius: 8,
                    backgroundColor: t.soft,
                    borderLeftWidth: 3,
                    borderLeftColor: t.bar,
                    justifyContent: "center",
                    paddingHorizontal: 4,
                    overflow: "hidden",
                  }}
                >
                  <Text style={{ fontSize: 10.5, fontFamily: FONT.semibold, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                    {`${minutesToLabel(s.from)} a ${minutesToLabel(s.to % 1440)}`}
                  </Text>
                </Tap>
              ))}
            </Tap>
          </View>
        );
      })}
    </View>
  );
}

const PRESETS: { value: string; label: string; from: number; to: number }[] = [
  { value: "manana", label: "Mañana", from: 7 * 60 + 30, to: 15 * 60 + 30 },
  { value: "comida", label: "Comida", from: 12 * 60 + 30, to: 16 * 60 + 30 },
  { value: "tarde", label: "Tarde", from: 15 * 60, to: 21 * 60 },
  { value: "cena", label: "Cena", from: 20 * 60, to: 24 * 60 },
];

function ShiftSheet({ edit, onClose, staff }: { edit: Edit; onClose: () => void; staff: ProStaff[] }) {
  const { save } = useTablesOps();
  const [from, setFrom] = React.useState(9 * 60);
  const [to, setTo] = React.useState(17 * 60);
  const [label, setLabel] = React.useState("");
  React.useEffect(() => {
    if (!edit) return;
    setFrom(edit.shift?.from ?? 9 * 60);
    setTo((edit.shift?.to ?? 17 * 60) % 1440);
    setLabel(edit.shift?.label ?? "");
  }, [edit]);
  if (!edit) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const person = staff.find((s) => s.id === edit.staffId);
  // Si acaba antes de empezar, termina de madrugada del día siguiente.
  const end = to <= from ? to + 1440 : to;

  const submit = async () => {
    const shift: ProRotaShift = {
      id: edit.shift?.id ?? localId("rt"),
      staffId: edit.staffId,
      date: edit.date,
      from,
      to: end,
      label: label.trim() || undefined,
    };
    const ok = await save("rota.save", (o) => ({
      ...o,
      rota: edit.shift ? o.rota.map((s) => (s.id === shift.id ? shift : s)) : [...o.rota, shift],
    }));
    if (!ok) return;
    toast("Turno guardado", {
      kind: "success",
      body: `${person?.name.split(" ")[0] ?? ""}: ${minutesToLabel(from)} a ${minutesToLabel(to)}.`,
    });
    onClose();
  };

  const remove = () => {
    if (!edit.shift) return;
    const id = edit.shift.id;
    Alert.alert("¿Quitar este turno?", undefined, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar",
        style: "destructive",
        onPress: async () => {
          if (!(await save("rota.remove", (o) => ({ ...o, rota: o.rota.filter((s) => s.id !== id) })))) return;
          toast("Turno quitado", { kind: "info" });
          onClose();
        },
      },
    ]);
  };

  const preset = PRESETS.find((p) => p.from === from && p.to % 1440 === to)?.value ?? "";

  return (
    <Sheet
      open
      onClose={onClose}
      title={edit.shift ? "Editar turno" : "Nuevo turno"}
      description={`${person?.name ?? ""}, ${dayLabel(`${edit.date}T12:00:00Z`)}`}
      footer={
        <>
          {edit.shift ? <PButton label="Quitar" icon={Trash2} variant="ghost" onPress={remove} /> : null}
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" disabled={end - from < 30} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Turno rápido">
        <ChoiceGrid
          value={preset}
          onChange={(v) => {
            const p = PRESETS.find((x) => x.value === v);
            if (!p) return;
            setFrom(p.from);
            setTo(p.to % 1440);
          }}
          options={PRESETS.map((p) => ({ value: p.value, label: p.label, hint: `${minutesToLabel(p.from)} a ${minutesToLabel(p.to % 1440)}` }))}
        />
      </Field>
      <Field label="Entra">
        <TimeStepper label="Hora de entrada" value={from} onChange={setFrom} />
      </Field>
      <Field label="Sale">
        <TimeStepper label="Hora de salida" value={to} onChange={setTo} />
      </Field>
      <PText v="small">{`${durationLabel(end - from)} de turno${end > 1440 ? ", acaba de madrugada" : ""}`}</PText>
      <Field label="Nota" hint="Por ejemplo: partido, barra, cocina.">
        <Input label="Nota" value={label} onChangeText={setLabel} />
      </Field>
    </Sheet>
  );
}
