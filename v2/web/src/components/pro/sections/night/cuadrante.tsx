"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Copy, MessageCircle, Minus, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProPlannedShift, ProRotaRole } from "@/lib/pro/night-types";
import { addDays, atLocal, durationLabel, minutesToLabel, shortDay, time } from "@/lib/pro/format";
import { nightOf } from "@/lib/pro/night";
import {
  ROTA_ROLES,
  copyPreviousWeek,
  eventOfNight,
  nightForecast,
  openNightsOfWeek,
  rotaGaps,
  rotaMessage,
  rotaMinutesByStaff,
  rotaOf,
  shiftLabel,
  weekStartOf,
} from "@/lib/pro/night-ops";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, Empty, FormField, PageHeader, Panel, Pill, RowList, StepNav, Tip, inputClass } from "../../kit";
import { TONES } from "../../tones";
import { sectionHref } from "../../shell";
import { useNightOps, whatsAppShare } from "./ops-ui";
import { LicensesPanel, TimesheetPanel } from "./timesheet";
import { nightsWithoutLicensedDoor } from "@/lib/pro/night-staff";

type Editing = { staffId: string; night: string; shift?: ProPlannedShift } | null;

function dayTitle(night: string): string {
  const label = shortDay(atLocal(night, 12 * 60));
  return label[0].toUpperCase() + label.slice(1);
}

export default function NightCuadrante() {
  const { data, now, spaceId } = usePro();
  const { ops, setOps } = useNightOps();
  const toast = useToast();
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
  const message = rotaMessage(data.space, data.staff, ops, nights);
  const isThisWeek = weekStart === weekStartOf(today);

  const copyWeek = () => {
    void setOps("rota.copy_week", (o) => ({ ...o, rota: copyPreviousWeek(o, weekStart, () => localId("rt")) }));
    toast.success("Semana copiada", "Los mismos turnos que la semana anterior. Cambia lo que haga falta.");
  };

  const gapText = gaps.length
    ? gaps
        .slice(0, 2)
        .map((g) => `el ${dayTitle(g.night).split(",")[0].toLowerCase()} falta ${g.missing.map((r) => ROTA_ROLES[r].label.toLowerCase()).join(" y ")}`)
        .join(" y ")
    : "";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={`Semana del ${shortDay(atLocal(weekStart, 12 * 60))} al ${shortDay(atLocal(addDays(weekStart, 6), 12 * 60))}`}
        title="Turnos"
        description={
          shifts.length
            ? `${shifts.length} turnos y ${durationLabel(totalMinutes)} planificadas. ${gapText ? `Ojo: ${gapText}.` : "Todas las noches con barra y puerta."}`
            : "Planifica quién trabaja cada noche y en qué puesto. Cada persona lo ve en su móvil y lo mandas al grupo en un toque."
        }
        actions={
          <>
            <Button variant="outline" onClick={copyWeek} disabled={!prevHas}>
              <Copy className="h-4 w-4" /> Copiar la semana pasada
            </Button>
            <Button asChild variant="dark">
              <a href={whatsAppShare(message)} target="_blank" rel="noopener noreferrer" aria-disabled={!shifts.length}>
                <MessageCircle className="h-4 w-4" /> Enviar al grupo
              </a>
            </Button>
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
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
          <p>
            {gaps.map((g) => (
              <span key={g.night} className="block">
                {dayTitle(g.night)}: sin {g.missing.map((r) => ROTA_ROLES[r].label.toLowerCase()).join(" ni ")}.
              </span>
            ))}
            {unlicensed.map((n) => (
              <span key={`lic-${n}`} className="block">
                {dayTitle(n)}: nadie habilitado como controlador en puerta.
              </span>
            ))}
          </p>
        </div>
      ) : null}

      {!nights.length ? (
        <Panel>
          <Empty
            icon={Users}
            title="No abres ninguna noche esta semana"
            body="Pon tu horario en Ajustes y aquí aparecerán las noches de apertura para repartir los turnos."
            action={
              <Button asChild variant="dark">
                <Link href={sectionHref(spaceId, "ajustes")}>Poner horario</Link>
              </Button>
            }
          />
        </Panel>
      ) : !staff.length ? (
        <Panel>
          <Empty
            icon={Users}
            title="Invita primero a tu equipo"
            body="Cuando cada persona tenga su acceso, podrás darle turnos y los verá en su móvil."
            action={
              <Button asChild variant="dark">
                <Link href={sectionHref(spaceId, "equipo")}>Ir a Equipo</Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <Panel flush title="Cuadrante" description="Toca un hueco para dar un turno o un turno para cambiarlo.">
          <div className="overflow-x-auto pro-scroll">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-light text-left text-xs text-text-muted">
                  <th className="sticky left-0 z-10 bg-bg-primary px-4 py-2.5 font-medium sm:px-5">Persona</th>
                  {nights.map((n) => {
                    const ev = eventOfNight(data, n);
                    return (
                      <th key={n} className={cn("px-2 py-2.5 font-medium", n === today && "text-violet-deep")}>
                        <span className="block text-text-primary">{dayTitle(n).split(",")[0]}</span>
                        <span className="block truncate font-normal">{ev ? ev.name : dayTitle(n).split(",").slice(1).join(",")}</span>
                      </th>
                    );
                  })}
                  <th className="px-4 py-2.5 text-right font-medium">Horas</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr key={person.id} className="border-b border-border-light last:border-0">
                    <td className="sticky left-0 z-10 bg-bg-primary px-4 py-2 sm:px-5">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={person.name} size="sm" tone={person.tone} />
                        <span className="min-w-0">
                          <span className="block max-w-[120px] truncate font-semibold">{person.name.split(" ")[0]}</span>
                          <span className="block max-w-[120px] truncate text-xs text-text-muted">{person.title}</span>
                        </span>
                      </span>
                    </td>
                    {nights.map((n) => {
                      const own = rotaOf(ops, n, person.id);
                      return (
                        <td key={n} className="px-1.5 py-2 align-top">
                          <div className="flex flex-col gap-1">
                            {own.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => setEditing({ staffId: person.id, night: n, shift: s })}
                                className={cn(
                                  "min-h-10 rounded-xl px-2 py-1.5 text-left text-xs transition-shadow hover:shadow-card",
                                  TONES[ROTA_ROLES[s.role].tone].soft,
                                )}
                              >
                                <span className="block font-semibold">{ROTA_ROLES[s.role].label}</span>
                                <span className="block tabular opacity-80">{shiftLabel(s)}</span>
                              </button>
                            ))}
                            {!own.length ? (
                              <button
                                type="button"
                                aria-label={`Dar turno a ${person.name} el ${dayTitle(n)}`}
                                onClick={() => setEditing({ staffId: person.id, night: n })}
                                className="flex h-10 items-center justify-center rounded-xl border border-dashed border-border text-text-muted transition-colors hover:border-text-primary/30 hover:text-text-primary"
                              >
                                <Plus className="h-4 w-4" strokeWidth={1.9} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-semibold tabular">{minutes[person.id] ? durationLabel(minutes[person.id]) : "0 h"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <TonightPanel />
        <BarRulePanel />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <TimesheetPanel
          nights={nights}
          weekLabel={isThisWeek ? "Esta semana" : weekStart > weekStartOf(today) ? "Próxima semana" : "Esa semana"}
        />
        <LicensesPanel />
      </div>

      <ShiftDrawer editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Quién tiene turno esta noche y si ya ha fichado. */
function TonightPanel() {
  const { data, now, spaceId } = usePro();
  const { ops } = useNightOps();
  const night = nightOf(now);
  const shifts = rotaOf(ops, night);
  return (
    <Panel
      title="Esta noche"
      description={shifts.length ? "Turnos de hoy y quién ha fichado ya." : "Hoy no hay turnos planificados."}
      action={
        <Link href={sectionHref(spaceId, "equipo")} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet">
          Fichajes <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
      flush
    >
      {shifts.length ? (
        <RowList>
          {shifts.map((s) => {
            const person = data.staff.find((p) => p.id === s.staffId);
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={person?.name ?? "?"} size="sm" tone={person?.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{person?.name ?? "Sin asignar"}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {ROTA_ROLES[s.role].label} · {shiftLabel(s)}
                  </span>
                </span>
                {person?.clockedInAt ? (
                  <Pill tone="success">Fichó {time(person.clockedInAt)}</Pill>
                ) : (
                  <Pill>Sin fichar</Pill>
                )}
              </div>
            );
          })}
        </RowList>
      ) : (
        <Empty icon={Users} title="Nadie con turno hoy" body="Si abres esta noche, da los turnos en el cuadrante de arriba." className="py-8" />
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
  const setRule = (value: number) =>
    void setOps("night.settings", (o) => ({ ...o, settings: { ...o.settings, peoplePerBartender: Math.max(10, value) } }));
  return (
    <Panel title="Cuánta gente en barra" description="Tu regla para la previsión de cada noche.">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Menos clientes por persona"
          onClick={() => setRule(rule - 5)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text-secondary hover:text-text-primary"
        >
          <Minus className="h-4 w-4" strokeWidth={1.9} />
        </button>
        <p className="min-w-0 flex-1 text-center text-sm">
          Una persona en barra por cada <span className="font-heading text-2xl font-extrabold tabular">{rule}</span> clientes
        </p>
        <button
          type="button"
          aria-label="Más clientes por persona"
          onClick={() => setRule(rule + 5)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text-secondary hover:text-text-primary"
        >
          <Plus className="h-4 w-4" strokeWidth={1.9} />
        </button>
      </div>
      {forecast && nextEvent ? (
        <p className="mt-3 rounded-xl bg-bg-secondary px-3 py-2.5 text-sm">
          {nextEvent.name}, {dayTitle(nextEvent.date).toLowerCase()}: unas {forecast.expected} personas, así que{" "}
          <span className="font-semibold">
            {forecast.bartenders} en barra
          </span>
          . Tienes {forecast.plannedBar} {forecast.plannedBar === 1 ? "turno" : "turnos"} de barra.
        </p>
      ) : (
        <p className="mt-3 text-xs text-text-muted">Con tu primera noche cerrada, Franky te dirá cuántas personas poner en barra.</p>
      )}
    </Panel>
  );
}

const ROLE_ORDER: ProRotaRole[] = ["barra", "puerta", "encargado", "taquilla", "guardarropa", "cabina", "karaoke"];

function ShiftDrawer({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { data } = usePro();
  const { setOps } = useNightOps();
  const toast = useToast();
  const [role, setRole] = React.useState<ProRotaRole>("barra");
  const [from, setFrom] = React.useState("20:00");
  const [to, setTo] = React.useState("03:00");

  React.useEffect(() => {
    if (!editing) return;
    const hours = data.space.hours[(new Date(`${editing.night}T12:00:00Z`).getUTCDay() + 6) % 7];
    const s = editing.shift;
    const person = data.staff.find((p) => p.id === editing.staffId);
    const guess: ProRotaRole = person?.role === "reception" ? "puerta" : person?.role === "manager" || person?.role === "owner" ? "encargado" : "barra";
    setRole(s?.role ?? guess);
    // Por defecto, media hora antes de abrir hasta un cuarto de hora después de cerrar.
    setFrom(minutesToLabel(s?.fromMinute ?? (hours ? (hours.open - 30 + 1440) % 1440 : 20 * 60)));
    setTo(minutesToLabel(s?.toMinute ?? (hours ? (hours.close + 15) % 1440 : 3 * 60)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) return <Drawer open={false} onOpenChange={() => onClose()} title="Turno">{null}</Drawer>;
  const person = data.staff.find((p) => p.id === editing.staffId);
  const toMin = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const save = () => {
    const shift: ProPlannedShift = {
      id: editing.shift?.id ?? localId("rt"),
      staffId: editing.staffId,
      night: editing.night,
      role,
      fromMinute: toMin(from),
      toMinute: toMin(to),
    };
    void setOps(editing.shift ? "rota.update" : "rota.create", (o) => ({
      ...o,
      rota: editing.shift ? o.rota.map((s) => (s.id === shift.id ? shift : s)) : [...o.rota, shift],
    }));
    toast.success(`${person?.name.split(" ")[0] ?? "Turno"}: ${ROTA_ROLES[role].label.toLowerCase()}`, `${dayTitle(editing.night)}, ${shiftLabel(shift)}.`);
    onClose();
  };

  const remove = () => {
    if (!editing.shift) return;
    const id = editing.shift.id;
    void setOps("rota.delete", (o) => ({ ...o, rota: o.rota.filter((s) => s.id !== id) }));
    toast.success("Turno quitado");
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`${person?.name ?? "Turno"}, ${dayTitle(editing.night).toLowerCase()}`}
      description="Puesto y horario. Si acaba después de medianoche, se cuenta en esta noche."
      footer={
        <>
          {editing.shift ? (
            <Button variant="ghost" onClick={remove}>
              Quitar turno
            </Button>
          ) : null}
          <Button variant="dark" onClick={save}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Puesto">
          <ChoiceChips value={role} onChange={setRole} options={ROLE_ORDER.map((r) => ({ value: r, label: ROTA_ROLES[r].label }))} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Entra" htmlFor="sh-from">
            <input id="sh-from" type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Sale" htmlFor="sh-to">
            <input id="sh-to" type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <p className="text-sm text-text-muted">
          {durationLabel(((toMin(to) <= toMin(from) ? toMin(to) + 1440 : toMin(to)) - toMin(from)))} de turno.
        </p>
        <Tip title="El fichaje va aparte">
          Esto es lo planificado. La hora real de entrada y salida la ficha cada persona desde su móvil en Equipo, aunque acabe a las cuatro.
        </Tip>
      </div>
    </Drawer>
  );
}
