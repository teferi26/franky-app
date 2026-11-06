"use client";

import * as React from "react";
import { BadgeCheck, Download, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { durationLabel, time } from "@/lib/pro/format";
import { nightTitle } from "@/lib/pro/night-ops";
import {
  SHIFT_CHECK_LABEL,
  doorLicenseOf,
  doorStaff,
  setDoorLicense,
  timesheetRows,
  timesheetSummary,
  timesheetVsRota,
  type ShiftCheckStatus,
} from "@/lib/pro/night-staff";
import { Avatar, Empty, Panel, Pill, RowList, inputClass } from "../../kit";
import { downloadCsv, useNightOps } from "./ops-ui";

const STATUS_TONE: Record<ShiftCheckStatus, "success" | "warning" | "danger" | "info"> = {
  ok: "success",
  late: "warning",
  open: "warning",
  missing: "danger",
  unplanned: "info",
};

/**
 * Fichado frente al cuadrante de la semana que se está viendo: primero lo que
 * no cuadra. Cada fichaje cuenta en la noche en la que empezó.
 */
export function TimesheetPanel({ nights, weekLabel }: { nights: string[]; weekLabel: string }) {
  const { data, now } = usePro();
  const toast = useToast();
  const [all, setAll] = React.useState(false);
  const checks = timesheetVsRota(data, nights, now);
  const sum = timesheetSummary(checks);
  const issues = checks.filter((c) => c.status !== "ok");
  const shown = all ? checks : issues;

  const exportCsv = () => {
    const rows = timesheetRows(data, nights, now);
    if (rows.length <= 1) {
      toast.info("Aún no hay fichajes esta semana", "Cuando alguien fiche, saldrá en el registro.");
      return;
    }
    downloadCsv(`registro-jornada-${data.space.slug}-${nights[0]}.csv`, rows);
  };

  const parts = [
    sum.late ? `${sum.late} ${sum.late === 1 ? "llegada tarde" : "llegadas tarde"}` : null,
    sum.missing ? `${sum.missing} sin fichar` : null,
    sum.unplanned ? `${sum.unplanned} sin turno` : null,
    sum.open ? `${sum.open} sin salida` : null,
  ].filter(Boolean);

  return (
    <Panel
      title="Fichado frente al cuadrante"
      description={
        checks.length
          ? `${weekLabel}: ${durationLabel(sum.workedMinutes)} fichadas de ${durationLabel(sum.plannedMinutes)} planificadas. ${parts.length ? `${parts.join(", ")}.` : "Todo cuadra."}`
          : "Cuando pasen las noches de esta semana, verás aquí cada fichaje junto a su turno."
      }
      action={
        <Button variant="ghost" size="sm" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Registro por noche
        </Button>
      }
      flush
    >
      {shown.length ? (
        <RowList>
          {shown.map((c) => {
            const person = data.staff.find((s) => s.id === c.staffId);
            const first = c.shifts[0];
            const last = c.shifts[c.shifts.length - 1];
            const detail =
              c.status === "missing"
                ? `Tenía turno de ${durationLabel(c.plannedMinutes)} y no fichó`
                : c.status === "unplanned"
                  ? `Fichó ${first ? time(first.inAt) : ""}${last?.outAt ? ` a ${time(last.outAt)}` : ""} sin turno en el cuadrante`
                  : c.status === "open"
                    ? `Entró a las ${first ? time(first.inAt) : ""} y no fichó la salida`
                    : `${first ? time(first.inAt) : ""}${last?.outAt ? ` a ${time(last.outAt)}` : ""}, ${durationLabel(c.workedMinutes)} de ${durationLabel(c.plannedMinutes)}${c.status === "late" ? `, ${c.lateMinutes} min tarde` : ""}`;
            return (
              <div key={`${c.night}-${c.staffId}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={person?.name ?? "?"} size="sm" tone={person?.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {person?.name.split(" ")[0] ?? "Alguien"} · {nightTitle(c.night)}
                  </span>
                  <span className="block truncate text-xs text-text-muted">{detail}</span>
                </span>
                <Pill tone={STATUS_TONE[c.status]}>{SHIFT_CHECK_LABEL[c.status]}</Pill>
              </div>
            );
          })}
        </RowList>
      ) : checks.length ? (
        <Empty icon={BadgeCheck} title="Todo cuadra" body="Cada persona fichó a su hora en las noches de esta semana." className="py-8" />
      ) : null}
      {checks.length > issues.length && issues.length ? (
        <div className="border-t border-border-light px-4 py-2.5 sm:px-5">
          <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? "Ver solo lo que no cuadra" : `Ver también los ${checks.length - issues.length} que cuadran`}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

/**
 * Controladores de acceso: el número de habilitación de cada portero y si el
 * local lo necesita en puerta cada noche.
 */
export function LicensesPanel() {
  const { data } = usePro();
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const people = doorStaff(data.staff, ops);
  const required = Boolean(ops.settings.licenseRequired);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const save = async (staffId: string) => {
    const value = drafts[staffId] ?? "";
    if (!(await setOps("door.license", (o) => setDoorLicense(o, staffId, value)))) return;
    const name = data.staff.find((s) => s.id === staffId)?.name.split(" ")[0] ?? "";
    toast.success(value.trim() ? `Habilitación de ${name} guardada` : `${name} sin habilitación`);
    setDrafts((d) => {
      const next = { ...d };
      delete next[staffId];
      return next;
    });
  };

  return (
    <Panel title="Controladores de acceso" description="El número de habilitación de quien hace la puerta.">
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>
          <span className="font-semibold">Mi local necesita un controlador habilitado</span>
          <span className="block text-xs text-text-muted">Te avisamos de las noches sin ninguno en puerta.</span>
        </span>
        <Switch
          checked={required}
          aria-label="Mi local necesita un controlador habilitado"
          onCheckedChange={(v) => void setOps("door.license_required", (o) => ({ ...o, settings: { ...o.settings, licenseRequired: v } }))}
        />
      </label>
      {people.length ? (
        <ul className="mt-4 flex flex-col gap-3">
          {people.map((s) => {
            const saved = doorLicenseOf(ops, s.id);
            const value = drafts[s.id] ?? saved ?? "";
            const dirty = drafts[s.id] !== undefined && drafts[s.id].trim() !== (saved ?? "");
            return (
              <li key={s.id} className="flex items-center gap-3">
                <Avatar name={s.name} size="sm" tone={s.tone} />
                <span className="w-20 shrink-0 truncate text-sm font-semibold">{s.name.split(" ")[0]}</span>
                <input
                  aria-label={`Número de habilitación de ${s.name}`}
                  value={value}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                  placeholder="Sin habilitación"
                  className={inputClass}
                />
                {dirty ? (
                  <Button variant="outline" size="sm" onClick={() => void save(s.id)}>
                    Guardar
                  </Button>
                ) : saved ? (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.9} aria-label="Habilitado" />
                ) : (
                  <ShieldAlert className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} aria-label="Sin habilitación" />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-muted">Da un turno de puerta a alguien y aparecerá aquí.</p>
      )}
    </Panel>
  );
}
