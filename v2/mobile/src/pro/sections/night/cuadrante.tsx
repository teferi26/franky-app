import React from "react";
import { Alert, Text, View } from "react-native";
import { AlertTriangle, Copy, MessageCircle, Plus, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProPlannedShift, ProRotaRole } from "../../../../../shared/pro/night-types";
import { addDays, atLocal, durationLabel, shortDay, time } from "../../../../../shared/pro/format";
import { nightOf } from "../../../../../shared/pro/night";
import {
  ROTA_ROLES,
  copyPreviousWeek,
  eventOfNight,
  nightForecast,
  nightTitle,
  openNightsOfWeek,
  rotaGaps,
  rotaMessage,
  rotaMinutesByStaff,
  rotaOf,
  shiftLabel,
  shiftMinutes,
  weekStartOf,
} from "../../../../../shared/pro/night-ops";
import { localId, usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import { ChoiceGrid, Empty, Field, ListRow, PAvatar, PButton, PText, PageHeader, Panel, Pill, Sheet, StepNav, Stepper, TONE_HEX, Tip, TimeStepper, tone } from "../../kit";
import { Note, openWhatsApp, useNightOps } from "./ops-ui";
import { LicensesPanel, TimesheetPanel } from "./timesheet";
import { nightsWithoutLicensedDoor } from "../../../../../shared/pro/night-staff";

/**
 * Turnos de las noches: versión nativa de web/.../night/cuadrante.tsx. En el
 * móvil la tabla semanal se vuelve una tarjeta por noche con sus turnos.
 */

type Editing = { night: string; staffId?: string; shift?: ProPlannedShift } | null;

export default function NightCuadrante() {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
  const go = useGoSection();
  const today = nightOf(now);
  const [weekStart, setWeekStart] = React.useState(() => weekStartOf(today));
  const [editing, setEditing] = React.useState<Editing>(null);

  const nights = openNightsOfWeek(data.space, weekStart);
  const staff = data.staff.filter((s) => s.role !== "rrpp");
  const shifts = ops.rota.filter((s) => nights.includes(s.night));
  const minutes = rotaMinutesByStaff(ops, nights);
  const totalMinutes = Object.values(minutes).reduce((a, b) => a + b, 0);
  const gaps = rotaGaps(ops, nights).filter((g) => g.night >= today);
  const unlicensed = nightsWithoutLicensedDoor(ops, nights).filter((n) => n >= today);
  const prevHas = ops.rota.some((s) => s.night >= addDays(weekStart, -7) && s.night < weekStart);
  const isThisWeek = weekStart === weekStartOf(today);

  const copyWeek = async () => {
    const ok = await setOps("rota.copy_week", (o) => ({ ...o, rota: copyPreviousWeek(o, weekStart, () => localId("rt")) }));
    if (ok) toast("Semana copiada", { kind: "success", body: "Los mismos turnos que la semana anterior. Cambia lo que haga falta." });
  };

  const gapText = gaps
    .slice(0, 2)
    .map((g) => `el ${nightTitle(g.night).split(" ")[0].toLowerCase()} falta ${g.missing.map((r) => ROTA_ROLES[r].label.toLowerCase()).join(" y ")}`)
    .join(" y ");

  return (
    <ProPage>
      <PageHeader
        eyebrow={`Semana del ${shortDay(atLocal(weekStart, 12 * 60))} al ${shortDay(atLocal(addDays(weekStart, 6), 12 * 60))}`}
        title="Turnos"
        description={
          shifts.length
            ? `${shifts.length} turnos y ${durationLabel(totalMinutes)} planificadas. ${gapText ? `Ojo: ${gapText}.` : "Todas las noches con barra y puerta."}`
            : "Planifica quién trabaja cada noche y en qué puesto. Lo mandas al grupo en un toque."
        }
        actions={
          <>
            <PButton label="Enviar al grupo" icon={MessageCircle} disabled={!shifts.length} onPress={() => openWhatsApp(rotaMessage(data.space, data.staff, ops, nights))} />
            <PButton label="Copiar la semana pasada" icon={Copy} variant="outline" disabled={!prevHas} onPress={() => void copyWeek()} />
          </>
        }
      >
        <StepNav
          label={isThisWeek ? "Esta semana" : weekStart > weekStartOf(today) ? "Próxima semana" : "Semana pasada"}
          onPrev={() => setWeekStart((w) => addDays(w, -7))}
          onNext={() => setWeekStart((w) => addDays(w, 7))}
          onToday={() => setWeekStart(weekStartOf(today))}
          isToday={isThisWeek}
        />
      </PageHeader>

      {gaps.length || unlicensed.length ? (
        <View style={{ flexDirection: "row", gap: S.sm, borderRadius: R.lg, borderWidth: 1, borderColor: `${C.warning}80`, backgroundColor: `${C.warning}1A`, padding: S.md, marginBottom: S.lg }}>
          <AlertTriangle size={16} color={C.warning} strokeWidth={1.9} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            {gaps.map((g) => (
              <PText key={g.night} v="small" color={C.text}>
                {`${nightTitle(g.night)}: sin ${g.missing.map((r) => ROTA_ROLES[r].label.toLowerCase()).join(" ni ")}.`}
              </PText>
            ))}
            {unlicensed.map((n) => (
              <PText key={`lic-${n}`} v="small" color={C.text}>
                {`${nightTitle(n)}: nadie habilitado como controlador en puerta.`}
              </PText>
            ))}
          </View>
        </View>
      ) : null}

      {!nights.length ? (
        <Panel>
          <Empty
            icon={Users}
            title="No abres ninguna noche esta semana"
            body="Pon tu horario en Ajustes y aquí aparecerán las noches de apertura para repartir los turnos."
            action={<PButton label="Poner horario" onPress={() => go("ajustes")} />}
          />
        </Panel>
      ) : !staff.length ? (
        <Panel>
          <Empty
            icon={Users}
            title="Invita primero a tu equipo"
            body="Cuando cada persona tenga su acceso, podrás darle turnos y los verá en su móvil."
            action={<PButton label="Ir a Equipo" onPress={() => go("equipo")} />}
          />
        </Panel>
      ) : (
        nights.map((night) => {
          const ev = eventOfNight(data, night);
          const list = rotaOf(ops, night);
          const gap = gaps.find((g) => g.night === night);
          return (
            <Panel
              key={night}
              title={nightTitle(night)}
              description={ev ? ev.name : "Noche de barra"}
              action={
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  {night === today ? <Pill label="Hoy" tone="violet" /> : null}
                  {gap ? <Pill label={`Falta ${gap.missing.map((r) => ROTA_ROLES[r].label.toLowerCase()).join(" y ")}`} tone="warning" /> : null}
                </View>
              }
              flush
            >
              {list.map((s) => {
                const person = data.staff.find((p) => p.id === s.staffId);
                const t = tone(ROTA_ROLES[s.role].tone);
                return (
                  <ListRow key={s.id} onPress={() => setEditing({ night, staffId: s.staffId, shift: s })} accessibilityLabel={`${person?.name ?? "Turno"}, ${ROTA_ROLES[s.role].label}, ${shiftLabel(s)}`}>
                    <PAvatar name={person?.name ?? "?"} toneKey={person?.tone} size={34} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <PText v="h3" numberOfLines={1}>{person?.name ?? "Sin asignar"}</PText>
                      <PText v="tiny">{`${shiftLabel(s)} · ${durationLabel(shiftMinutes(s))}`}</PText>
                    </View>
                    <View style={{ borderRadius: R.full, backgroundColor: t.soft, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.text }} maxFontSizeMultiplier={1.3}>
                        {ROTA_ROLES[s.role].label}
                      </Text>
                    </View>
                  </ListRow>
                );
              })}
              <Tap
                onPress={() => setEditing({ night })}
                accessibilityRole="button"
                accessibilityLabel={`Dar un turno el ${nightTitle(night)}`}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, minHeight: 48, margin: S.md, borderRadius: R.md, borderWidth: 1, borderStyle: "dashed", borderColor: C.border }}
              >
                <Plus size={16} color={C.muted} strokeWidth={1.9} />
                <PText v="small">Dar un turno</PText>
              </Tap>
            </Panel>
          );
        })
      )}

      {staff.length && nights.length ? (
        <Panel title="Horas de la semana" flush>
          {staff.map((p, i) => (
            <ListRow key={p.id} last={i === staff.length - 1}>
              <PAvatar name={p.name} toneKey={p.tone} size={30} />
              <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>{p.name}</PText>
              <PText v="small" color={C.text}>{minutes[p.id] ? durationLabel(minutes[p.id]) : "0 h"}</PText>
            </ListRow>
          ))}
        </Panel>
      ) : null}

      <TonightPanel />
      <BarRulePanel />
      <TimesheetPanel
        nights={nights}
        weekLabel={isThisWeek ? "Esta semana" : weekStart > weekStartOf(today) ? "Próxima semana" : "Esa semana"}
      />
      <LicensesPanel />

      <ShiftSheet editing={editing} onClose={() => setEditing(null)} />
    </ProPage>
  );
}

/** Quién tiene turno esta noche y si ya ha fichado. */
function TonightPanel() {
  const { data, now } = usePro();
  const { ops } = useNightOps();
  const go = useGoSection();
  const shifts = rotaOf(ops, nightOf(now));
  return (
    <Panel
      title="Esta noche"
      description={shifts.length ? "Turnos de hoy y quién ha fichado ya." : "Hoy no hay turnos planificados."}
      action={<PButton label="Fichajes" variant="ghost" small onPress={() => go("equipo")} />}
      flush
    >
      {shifts.length ? (
        shifts.map((s, i) => {
          const person = data.staff.find((p) => p.id === s.staffId);
          return (
            <ListRow key={s.id} last={i === shifts.length - 1}>
              <PAvatar name={person?.name ?? "?"} toneKey={person?.tone} size={34} />
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{person?.name ?? "Sin asignar"}</PText>
                <PText v="tiny">{`${ROTA_ROLES[s.role].label} · ${shiftLabel(s)}`}</PText>
              </View>
              {person?.clockedInAt ? <Pill label={`Fichó ${time(person.clockedInAt)}`} tone="success" /> : <Pill label="Sin fichar" />}
            </ListRow>
          );
        })
      ) : (
        <Empty icon={Users} title="Nadie con turno hoy" body="Si abres esta noche, da los turnos en las tarjetas de arriba." />
      )}
    </Panel>
  );
}

/** La regla de la previsión: una persona en barra por cada N clientes. */
function BarRulePanel() {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
  const rule = ops.settings.peoplePerBartender;
  const nextEvent = data.events
    .filter((e) => e.status !== "draft" && e.date >= nightOf(now))
    .sort((a, b) => a.doorsOpen.localeCompare(b.doorsOpen))[0];
  const forecast = nextEvent ? nightForecast(data, nextEvent, now) : null;
  const setRule = (value: number) => void setOps("night.settings", (o) => ({ ...o, settings: { ...o.settings, peoplePerBartender: Math.max(10, value) } }));
  return (
    <Panel title="Cuánta gente en barra" description="Tu regla para la previsión de cada noche.">
      <View style={{ gap: S.sm }}>
        <PText v="small">Una persona en barra por cada</PText>
        <Stepper value={rule} onChange={setRule} min={10} max={300} step={5} format={(v) => `${v} clientes`} label="clientes por persona en barra" />
        {forecast && nextEvent ? (
          <Note>
            {`${nextEvent.name}, ${nightTitle(nextEvent.date).toLowerCase()}: unas ${forecast.expected} personas, así que ${forecast.bartenders} en barra. Tienes ${forecast.plannedBar} ${
              forecast.plannedBar === 1 ? "turno" : "turnos"
            } de barra.`}
          </Note>
        ) : (
          <PText v="tiny">Con tu primera noche cerrada, Franky te dirá cuántas personas poner en barra.</PText>
        )}
      </View>
    </Panel>
  );
}

const ROLE_ORDER: ProRotaRole[] = ["barra", "puerta", "encargado", "taquilla", "guardarropa", "cabina", "karaoke"];

function ShiftSheet({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { data } = usePro();
  const { setOps } = useNightOps();
  const staff = data.staff.filter((s) => s.role !== "rrpp");
  const [staffId, setStaffId] = React.useState("");
  const [role, setRole] = React.useState<ProRotaRole>("barra");
  const [from, setFrom] = React.useState(20 * 60);
  const [to, setTo] = React.useState(3 * 60);

  React.useEffect(() => {
    if (!editing) return;
    const hours = data.space.hours[(new Date(`${editing.night}T12:00:00Z`).getUTCDay() + 6) % 7];
    const s = editing.shift;
    const id = editing.staffId ?? staff[0]?.id ?? "";
    const person = data.staff.find((p) => p.id === id);
    const guess: ProRotaRole = person?.role === "reception" ? "puerta" : person?.role === "manager" || person?.role === "owner" ? "encargado" : "barra";
    setStaffId(id);
    setRole(s?.role ?? guess);
    // Por defecto, media hora antes de abrir hasta un cuarto de hora después de cerrar.
    setFrom(s?.fromMinute ?? (hours ? (hours.open - 30 + 1440) % 1440 : 20 * 60));
    setTo((s?.toMinute ?? (hours ? (hours.close + 15) % 1440 : 3 * 60)) % 1440);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) return null;
  const person = data.staff.find((p) => p.id === staffId);
  const minutes = (to <= from ? to + 1440 : to) - from;

  const save = async () => {
    const shift: ProPlannedShift = { id: editing.shift?.id ?? localId("rt"), staffId, night: editing.night, role, fromMinute: from, toMinute: to };
    const ok = await setOps(editing.shift ? "rota.update" : "rota.create", (o) => ({
      ...o,
      rota: editing.shift ? o.rota.map((s) => (s.id === shift.id ? shift : s)) : [...o.rota, shift],
    }));
    if (!ok) return;
    toast(`${person?.name.split(" ")[0] ?? "Turno"}: ${ROTA_ROLES[role].label.toLowerCase()}`, { kind: "success", body: `${nightTitle(editing.night)}, ${shiftLabel(shift)}.` });
    onClose();
  };

  const remove = () => {
    const id = editing.shift?.id;
    if (!id) return;
    Alert.alert("¿Quitar este turno?", undefined, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar turno",
        style: "destructive",
        onPress: async () => {
          const ok = await setOps("rota.delete", (o) => ({ ...o, rota: o.rota.filter((s) => s.id !== id) }));
          if (!ok) return;
          toast("Turno quitado", { kind: "success" });
          onClose();
        },
      },
    ]);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing.shift ? `${person?.name ?? "Turno"}, ${nightTitle(editing.night).toLowerCase()}` : `Turno del ${nightTitle(editing.night).toLowerCase()}`}
      description="Puesto y horario. Si acaba después de medianoche, se cuenta en esta noche."
      footer={
        <>
          {editing.shift ? <PButton label="Quitar turno" variant="ghost" onPress={remove} /> : null}
          <PButton label="Guardar" onPress={() => void save()} disabled={!staffId} />
        </>
      }
    >
      {!editing.shift ? (
        <Field label="Quién">
          <ChoiceGrid value={staffId} onChange={setStaffId} options={staff.map((p) => ({ value: p.id, label: p.name.split(" ")[0], hint: p.title }))} />
        </Field>
      ) : null}
      <Field label="Puesto">
        <ChoiceGrid value={role} onChange={setRole} options={ROLE_ORDER.map((r) => ({ value: r, label: ROTA_ROLES[r].label }))} />
      </Field>
      <Field label="Entra">
        <TimeStepper value={from} onChange={setFrom} label="hora de entrada" />
      </Field>
      <Field label="Sale">
        <TimeStepper value={to} onChange={setTo} label="hora de salida" />
      </Field>
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TONE_HEX[ROTA_ROLES[role].tone] }} />
        <PText v="small">{`${durationLabel(minutes)} de turno.`}</PText>
      </View>
      <Tip title="El fichaje va aparte">
        Esto es lo planificado. La hora real de entrada y salida la ficha cada persona desde su móvil en Equipo, aunque acabe a las cuatro.
      </Tip>
    </Sheet>
  );
}
