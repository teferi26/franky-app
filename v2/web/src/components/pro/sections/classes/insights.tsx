"use client";

import * as React from "react";
import { Download, Flame, Repeat2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { addDays, localDate, minutesToLabel, weekdayIndex } from "@/lib/pro/format";
import { classCopy } from "@/lib/pro/classes";
import { shiftMonth, trialConversion } from "@/lib/pro/classes-care";
import { coachHours, coachHoursCsv, occupancyGrid, type HeatCell } from "@/lib/pro/classes-ops";
import { proCsvCell } from "@/lib/pro/csv";
import { cn } from "@/lib/utils";
import { Avatar, Empty, Panel, Segmented } from "../../kit";
import { downloadCsv } from "./ui";

/**
 * Datos para decidir: ocupación por día y hora (dónde sobran plazas y dónde
 * falta sitio) y horas de cada persona del equipo con sus sustituciones, lista
 * para la nómina o la gestoría.
 */

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function heatClass(pct: number) {
  // Cinco escalones de violeta sobre neutro: se lee sin leyenda.
  if (pct >= 90) return "bg-violet text-white";
  if (pct >= 70) return "bg-violet/70 text-white";
  if (pct >= 50) return "bg-violet/40 text-text-primary";
  if (pct >= 30) return "bg-violet/20 text-text-primary";
  return "bg-bg-tertiary text-text-secondary";
}

export function OccupancyHeatmap({ onFill }: { onFill?: (cell: HeatCell) => void }) {
  const { data, now, vertical, demo } = usePro();
  const copy = classCopy(vertical.id);
  const today = localDate(now);
  const { cells, hours, worst } = occupancyGrid(data, addDays(today, -28), addDays(today, 13));
  const days = [...new Set(cells.map((c) => c.day))].sort((a, b) => a - b);
  const cellAt = (day: number, hour: number) => cells.find((c) => c.day === day && c.hour === hour);

  if (!cells.length) {
    return (
      <Panel>
        <Empty icon={Flame} title="Aún no hay datos de ocupación" body={`Cuando tengas ${copy.sessionMany} en el horario verás aquí qué franjas se llenan y cuáles no.`} />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Ocupación por día y hora"
        description={copy.groups ? "Partidas reservadas frente a posibles, de las últimas semanas y las próximas." : "Plazas reservadas frente a aforo, de las últimas semanas y las próximas."}
        flush
      >
        <div className="overflow-x-auto p-4 pro-scroll sm:p-5">
          <table className="w-full min-w-[420px] border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr>
                <th className="w-12" />
                {days.map((d) => (
                  <th key={d} scope="col" className="pb-1 font-semibold text-text-muted">
                    {DAY_LABELS[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h}>
                  <th scope="row" className="pr-1 text-right font-medium text-text-muted tabular">
                    {minutesToLabel(h * 60)}
                  </th>
                  {days.map((d) => {
                    const c = cellAt(d, h);
                    return (
                      <td key={d} className="p-0">
                        {c ? (
                          <span
                            title={`${DAY_LABELS[d]} ${minutesToLabel(h * 60)}: ${c.pct} %`}
                            className={cn("flex h-9 items-center justify-center rounded-lg font-semibold tabular", heatClass(c.pct))}
                          >
                            {c.pct}
                          </span>
                        ) : (
                          <span className="block h-9 rounded-lg border border-dashed border-border-light" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Las tres franjas más flojas" description="Donde más te cuesta llenar. Un precio de estudiante solo ahí no rebaja el resto de la semana." flush>
        <ul className="divide-y divide-border-light">
          {worst.map((c) => (
            <li key={`${c.day}-${c.hour}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="w-24 shrink-0 font-semibold">
                {DAY_LABELS[c.day]} {minutesToLabel(c.hour * 60)}
              </span>
              <span className="min-w-0 flex-1 text-sm text-text-muted">
                {c.pct} % de ocupación en {c.sessions} {c.sessions === 1 ? copy.sessionOne : copy.sessionMany}
              </span>
              {demo && onFill ? (
                <Button size="sm" variant="secondary" onClick={() => onFill(c)}>
                  <Zap className="h-3.5 w-3.5" /> Llenar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export function TeamHours() {
  const { data, now, vertical } = usePro();
  const toast = useToast();
  const copy = classCopy(vertical.id);
  const today = localDate(now);
  const [range, setRange] = React.useState<"week" | "month">("month");
  const monday = addDays(today, -weekdayIndex(today));
  const from = range === "month" ? `${today.slice(0, 7)}-01` : monday;
  // Último día del mes: el día 1 del mes siguiente menos uno.
  const until = range === "month" ? addDays(`${shiftMonth(today.slice(0, 7), 1)}-01`, -1) : addDays(monday, 6);
  const rows = coachHours(data, from, until);
  const conv = trialConversion(data);

  const exportCsv = () => {
    downloadCsv(`horas-${data.space.slug}-${from}.csv`, coachHoursCsv(rows, from, until, proCsvCell));
    toast.success("Horas exportadas", "Por persona, con sustituciones. Listo para la nómina.");
  };

  return (
    <Panel
      title={vertical.id === "academy" ? "Horas impartidas por profesor" : `Horas de cada ${copy.coach}`}
      description="Incluye lo programado hasta el final del periodo. Las sustituciones cuentan para quien da la clase."
      action={
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
      }
      flush
    >
      <div className="px-4 pt-3 sm:px-5">
        <Segmented
          label="Periodo"
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: "week", label: "Esta semana" },
            { value: "month", label: "Este mes" },
          ]}
        />
      </div>
      {rows.length ? (
        <ul className="mt-2 divide-y divide-border-light">
          {rows.map((r) => {
            const staff = data.staff.find((s) => s.id === r.staffId);
            const trials = conv.byCoach.find((c) => c.coachId === r.staffId);
            return (
              <li key={r.staffId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={r.name} tone={staff?.tone ?? "slate"} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {r.sessions} {r.sessions === 1 ? copy.sessionOne : copy.sessionMany}
                    {r.covered ? ` · sustituyó ${r.covered}` : ""}
                    {r.coveredByOthers ? ` · le sustituyeron ${r.coveredByOthers}` : ""}
                    {trials?.total ? ` · pruebas: ${trials.joined} de ${trials.total} se quedaron` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-heading text-lg font-extrabold tabular">
                  {(r.minutes / 60).toFixed(1).replace(".", ",")} h
                  {r.covered ? <Repeat2 className="h-3.5 w-3.5 text-violet" aria-label="Con sustituciones" /> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={Repeat2} title="Sin horas en este periodo" body={`Cuando asignes ${copy.sessionMany} a tu equipo, aquí verás las horas de cada uno.`} />
      )}
    </Panel>
  );
}
