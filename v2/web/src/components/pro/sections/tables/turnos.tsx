"use client";

import * as React from "react";
import { AlertTriangle, CalendarCheck, Copy, Phone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProStaff } from "@/lib/pro/types";
import type { ProRotaShift } from "@/lib/pro/tables-types";
import {
  coverageGaps,
  eventsOn,
  missingClockIns,
  mondayOf,
  plannedMinutes,
  rotaMessage,
  weekDates,
  workedMinutes,
} from "@/lib/pro/tables-ops";
import {
  addDays,
  dayLabel,
  durationLabel,
  localDate,
  minutesToLabel,
  plural,
} from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  FormField,
  IconButton,
  KpiRow,
  Kpi,
  LiveDot,
  PageHeader,
  Panel,
  RowList,
  StepNav,
  Tip,
  inputClass,
} from "../../kit";
import { TONES } from "../../tones";
import { VENUE_EVENT_KIND_LABEL } from "@/lib/pro/tables-insights";
import { OpsMissing, WhatsAppButton, useTablesOps } from "./ops-kit";

type Edit = { staffId: string; date: string; shift?: ProRotaShift } | null;

const DAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function TablesTurnos() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const today = localDate(now);
  const [monday, setMonday] = React.useState(mondayOf(today));
  const [edit, setEdit] = React.useState<Edit>(null);
  if (!ops) return <OpsMissing icon={CalendarCheck} title="Sin cuadrante todavía" />;

  const days = weekDates(monday);
  const missing = missingClockIns(ops, data.staff, data.shifts, now);
  const gaps = coverageGaps(ops, monday, data.space.hours);
  const planned = data.staff.reduce((a, s) => a + plannedMinutes(ops, s.id, monday), 0);
  const worked = data.staff.reduce((a, s) => a + workedMinutes(data.shifts, s.id, days, now), 0);
  const isThisWeek = monday === mondayOf(today);

  const copyPrevious = async () => {
    const prev = weekDates(addDays(monday, -7));
    const source = ops.rota.filter((s) => prev.includes(s.date));
    if (!source.length) {
      toast.info("La semana anterior está vacía");
      return;
    }
    const copies = source.map((s) => ({ ...s, id: localId("rt"), date: addDays(s.date, 7) }));
    await save("rota.copy", (o) => ({
      ...o,
      rota: [...o.rota.filter((s) => !days.includes(s.date)), ...copies],
    }));
    toast.success("Semana copiada", plural(copies.length, "turno", "turnos"));
  };

  const weekLabel = `Semana del ${Number(monday.slice(8))} al ${dayLabel(`${addDays(monday, 6)}T12:00:00Z`, { weekday: false })}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Turnos"
        title="Cuadrante del equipo"
        description={
          missing.length
            ? `${missing.map((m) => m.staff.name.split(" ")[0]).join(" y ")} ${missing.length === 1 ? "tenía" : "tenían"} turno y no ${missing.length === 1 ? "ha" : "han"} fichado.`
            : `${durationLabel(planned)} en el cuadrante esta semana${gaps.length ? `, ${plural(gaps.length, "día con horas sin cubrir", "días con horas sin cubrir")}` : ", todo cubierto"}.`
        }
        actions={
          <WhatsAppButton
            share
            variant="dark"
            size="default"
            label="Enviar al equipo"
            message={rotaMessage(ops, data.staff, monday, data.space.name)}
          />
        }
      />

      {missing.length ? (
        <Panel title="No han fichado" className="border-amber-300/70" flush>
          <RowList>
            {missing.map((m) => (
              <div key={m.staff.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.9} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{m.staff.name}</span>
                  <span className="text-text-muted"> entraba a las {minutesToLabel(m.from)}, hace {durationLabel(m.late)}</span>
                </span>
                {m.staff.phone ? (
                  <Button size="sm" variant="outline" className="h-10" asChild>
                    <a href={`tel:${m.staff.phone.replace(/\s/g, "")}`}>
                      <Phone className="h-4 w-4" strokeWidth={1.9} /> Llamar
                    </a>
                  </Button>
                ) : null}
                <WhatsAppButton
                  phone={m.staff.phone}
                  share={!m.staff.phone}
                  message={`Hola ${m.staff.name.split(" ")[0]}, hoy entrabas a las ${minutesToLabel(m.from)}. ¿Va todo bien? Acuérdate de fichar al llegar.`}
                />
              </div>
            ))}
          </RowList>
        </Panel>
      ) : null}

      <KpiRow>
        <Kpi label="Horas en el cuadrante" value={durationLabel(planned)} hint="esta semana" />
        <Kpi label="Horas fichadas" value={durationLabel(worked)} hint={isThisWeek ? "hasta ahora" : "esa semana"} />
        <Kpi label="Fichados ahora" value={data.staff.filter((s) => s.clockedInAt).length} hint={`de ${data.staff.length} personas`} />
        <Kpi label="Sin cubrir" value={gaps.length} hint={gaps.length ? "días con huecos" : "todo cubierto"} emphasis={gaps.length > 0} />
      </KpiRow>

      <Panel
        title={weekLabel}
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="hidden h-9 sm:inline-flex" onClick={copyPrevious}>
              <Copy className="h-3.5 w-3.5" strokeWidth={1.9} /> Copiar la anterior
            </Button>
            <StepNav
              label=""
              onPrev={() => setMonday(addDays(monday, -7))}
              onNext={() => setMonday(addDays(monday, 7))}
              onToday={() => setMonday(mondayOf(today))}
              isToday={isThisWeek}
            />
          </div>
        }
        flush
      >
        <div className="overflow-x-auto pro-scroll">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-40 bg-bg-primary px-4 py-2 text-left text-xs font-semibold text-text-muted sm:px-5">Persona</th>
                {days.map((date, i) => {
                  const closed = !data.space.hours[i];
                  const events = eventsOn(ops, date);
                  return (
                    <th key={date} className={cn("px-1.5 py-2 text-left text-xs font-semibold", date === today ? "text-violet" : "text-text-muted")}>
                      {DAY_SHORT[i]} {Number(date.slice(8))}
                      {closed ? <span className="block font-normal">Cerrado</span> : null}
                      {events.length ? <span className="block truncate font-normal text-violet-deep">{VENUE_EVENT_KIND_LABEL[events[0].kind]}</span> : null}
                    </th>
                  );
                })}
                <th className="px-4 py-2 text-right text-xs font-semibold text-text-muted sm:px-5">Horas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {data.staff.map((person) => (
                <tr key={person.id}>
                  <td className="sticky left-0 z-10 bg-bg-primary px-4 py-2 sm:px-5">
                    <span className="flex items-center gap-2">
                      <Avatar name={person.name} tone={person.tone} size="sm" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate font-semibold">
                          {person.name.split(" ")[0]}
                          {person.clockedInAt && isThisWeek ? <LiveDot /> : null}
                        </span>
                        <span className="block truncate text-xs text-text-muted">{person.title}</span>
                      </span>
                    </span>
                  </td>
                  {days.map((date) => {
                    const shifts = ops.rota.filter((s) => s.staffId === person.id && s.date === date).sort((a, b) => a.from - b.from);
                    return (
                      <td key={date} className="px-1 py-1.5 align-top">
                        <div className="flex flex-col gap-1">
                          {shifts.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setEdit({ staffId: person.id, date, shift: s })}
                              className={cn("rounded-lg px-1.5 py-1 text-left text-[0.72rem] font-semibold leading-tight tabular", TONES[person.tone].soft)}
                            >
                              {minutesToLabel(s.from)}
                              <span className="block">{minutesToLabel(s.to % 1440)}</span>
                              {s.label ? <span className="block font-normal opacity-80">{s.label}</span> : null}
                            </button>
                          ))}
                          <button
                            type="button"
                            aria-label={`Añadir turno a ${person.name.split(" ")[0]} el ${DAY_SHORT[weekDates(monday).indexOf(date)]}`}
                            onClick={() => setEdit({ staffId: person.id, date })}
                            className="h-8 rounded-lg border border-dashed border-border text-xs text-text-muted transition-colors hover:border-text-primary/30 hover:text-text-primary"
                          >
                            +
                          </button>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right align-top text-xs sm:px-5">
                    <span className="block font-semibold tabular">{durationLabel(plannedMinutes(ops, person.id, monday))}</span>
                    <span className="block text-text-muted tabular">{durationLabel(workedMinutes(data.shifts, person.id, days, now))} fichadas</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Horas sin cubrir" flush>
          {gaps.length ? (
            <RowList>
              {gaps.map((g) => (
                <div key={g.date} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <span className="font-semibold">{dayLabel(`${g.date}T12:00:00Z`)}</span>
                  <span className="text-amber-700 tabular dark:text-amber-300">{durationLabel(g.uncovered)} sin nadie</span>
                </div>
              ))}
            </RowList>
          ) : (
            <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Todo el horario de apertura tiene a alguien.</p>
          )}
        </Panel>
        <Tip title="Cuadrante y fichaje juntos">
          Lo que planificas aquí se compara con lo que fichan de verdad en Equipo. Si alguien no ficha a su hora, lo verás en Hoy y aquí arriba.
        </Tip>
      </div>

      <ShiftDrawer edit={edit} onClose={() => setEdit(null)} staff={data.staff} />
    </div>
  );
}

const PRESETS: { value: string; label: string; from: number; to: number }[] = [
  { value: "manana", label: "Mañana", from: 7 * 60 + 30, to: 15 * 60 + 30 },
  { value: "comida", label: "Comida", from: 12 * 60 + 30, to: 16 * 60 + 30 },
  { value: "tarde", label: "Tarde", from: 15 * 60, to: 21 * 60 },
  { value: "cena", label: "Cena", from: 20 * 60, to: 24 * 60 },
];

function ShiftDrawer({ edit, onClose, staff }: { edit: Edit; onClose: () => void; staff: ProStaff[] }) {
  const { save } = useTablesOps();
  const toast = useToast();
  const [from, setFrom] = React.useState("09:00");
  const [to, setTo] = React.useState("17:00");
  const [label, setLabel] = React.useState("");
  React.useEffect(() => {
    if (!edit) return;
    setFrom(minutesToLabel(edit.shift?.from ?? 9 * 60));
    setTo(minutesToLabel((edit.shift?.to ?? 17 * 60) % 1440));
    setLabel(edit.shift?.label ?? "");
  }, [edit]);
  if (!edit) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const person = staff.find((s) => s.id === edit.staffId);
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const start = toMin(from);
  // Si acaba antes de empezar, termina de madrugada del día siguiente.
  const end = toMin(to) <= start ? toMin(to) + 1440 : toMin(to);

  const submit = async () => {
    const shift: ProRotaShift = {
      id: edit.shift?.id ?? localId("rt"),
      staffId: edit.staffId,
      date: edit.date,
      from: start,
      to: end,
      label: label.trim() || undefined,
    };
    if (!(await save("rota.save", (o) => ({
      ...o,
      rota: edit.shift ? o.rota.map((s) => (s.id === shift.id ? shift : s)) : [...o.rota, shift],
    })))) return;
    toast.success("Turno guardado", `${person?.name.split(" ")[0]}: ${from} a ${to}.`);
    onClose();
  };

  const remove = async () => {
    if (!edit.shift) return;
    const id = edit.shift.id;
    if (!(await save("rota.remove", (o) => ({ ...o, rota: o.rota.filter((s) => s.id !== id) })))) return;
    toast.info("Turno quitado");
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={edit.shift ? "Editar turno" : "Nuevo turno"}
      description={`${person?.name ?? ""} · ${dayLabel(`${edit.date}T12:00:00Z`)}`}
      footer={
        <>
          {edit.shift ? <IconButton label="Quitar turno" icon={Trash2} onClick={remove} className="mr-auto h-10 w-10" /> : null}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={end - start < 30} onClick={submit}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Turno rápido">
          <ChoiceChips
            value={PRESETS.find((p) => minutesToLabel(p.from) === from && minutesToLabel(p.to % 1440) === to)?.value ?? ""}
            onChange={(v) => {
              const p = PRESETS.find((x) => x.value === v);
              if (!p) return;
              setFrom(minutesToLabel(p.from));
              setTo(minutesToLabel(p.to % 1440));
            }}
            options={PRESETS.map((p) => ({ value: p.value, label: p.label, hint: `${minutesToLabel(p.from)} a ${minutesToLabel(p.to % 1440)}` }))}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Entra" htmlFor="sh-from">
            <input id="sh-from" type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Sale" htmlFor="sh-to">
            <input id="sh-to" type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <p className="text-sm text-text-muted">{durationLabel(end - start)} de turno</p>
        <FormField label="Nota" htmlFor="sh-label" hint="Por ejemplo: partido, barra, cocina.">
          <input id="sh-label" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
        </FormField>
      </div>
    </Drawer>
  );
}
