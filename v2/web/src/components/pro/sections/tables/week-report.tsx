"use client";

import * as React from "react";
import { usePro } from "@/lib/pro/store";
import { mondayOf } from "@/lib/pro/tables-ops";
import { weekReport } from "@/lib/pro/tables-day";
import {
  coversByHour,
  weekLabor,
  weekReportMessage,
} from "@/lib/pro/tables-insights";
import { addDays, localDate, money, plural } from "@/lib/pro/format";
import { Bars, Panel, StepNav } from "../../kit";
import { WhatsAppButton, useTablesOps } from "./ops-kit";

const DAY = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * La semana del local de un vistazo: caja de los cierres, cubiertos,
 * plantones, lo que trajo Franky, la Card, las horas del equipo y a qué hora
 * llega la gente. Solo cifras apuntadas. Se manda por WhatsApp al socio o al
 * dueño que no estaba.
 */
export function WeekReportPanel() {
  const { data, now, vertical } = usePro();
  const { ops } = useTablesOps();
  const thisMonday = mondayOf(localDate(now));
  const [monday, setMonday] = React.useState(thisMonday);
  if (!ops) return null;
  const week = weekReport(data, ops, monday, now);
  const labor = weekLabor(data, ops, monday, now);
  const tables = vertical.id !== "cafe";
  const byHour = tables ? coversByHour(data, monday, now) : [];
  const hours = (m: number) => `${(Math.round(m / 6) / 10).toLocaleString("es-ES")} h`;
  const values = DAY.map((_, i) => {
    const day = week.days.find((d) => d.date === addDays(monday, i));
    return day?.totalCents ?? 0;
  });
  const endLabel = new Date(`${addDays(monday, 6)}T12:00:00Z`).toLocaleDateString(
    "es-ES",
    { day: "numeric", month: "short", timeZone: "Europe/Madrid" },
  );
  const startLabel = new Date(`${monday}T12:00:00Z`).toLocaleDateString("es-ES", {
    day: "numeric",
    timeZone: "Europe/Madrid",
  });

  return (
    <Panel
      title="Tu semana"
      description={
        week.closedDays
          ? `${money(week.totalCents, { round: true })} en ${plural(week.closedDays, "día cerrado", "días cerrados")}.`
          : "Todavía no hay cierres esta semana."
      }
    >
      <StepNav
        label={`Del ${startLabel} al ${endLabel}`}
        onPrev={() => setMonday((m) => addDays(m, -7))}
        onNext={() => setMonday((m) => addDays(m, 7))}
        onToday={() => setMonday(thisMonday)}
        isToday={monday === thisMonday}
      />
      <Bars
        values={values}
        labels={DAY}
        highlightLast={false}
        className="mt-4 h-24"
        format={(v) => money(v, { round: true })}
      />
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {tables ? (
          <>
            <div>
              <dt className="text-xs text-text-muted">Cubiertos</dt>
              <dd className="font-heading text-lg font-bold tabular">{week.covers}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Ticket por cubierto</dt>
              <dd className="font-heading text-lg font-bold tabular">
                {week.perCoverCents === null ? "Sin datos" : money(week.perCoverCents)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">No vinieron</dt>
              <dd className="font-heading text-lg font-bold tabular">
                {week.noShows}
                <span className="ml-1 text-xs font-medium text-text-muted">
                  de {week.bookings} ({week.noShowPct.toLocaleString("es-ES")} %)
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Reservas por Franky</dt>
              <dd className="font-heading text-lg font-bold tabular">{week.franky}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Grupos</dt>
              <dd className="font-heading text-lg font-bold tabular">{week.groups}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt className="text-xs text-text-muted">Franky Card</dt>
          <dd className="font-heading text-lg font-bold tabular">{week.card}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Horas fichadas</dt>
          <dd className="font-heading text-lg font-bold tabular">
            {labor.workedMinutes ? hours(labor.workedMinutes) : "Sin fichajes"}
            {labor.plannedMinutes ? (
              <span className="ml-1 text-xs font-medium text-text-muted">
                de {hours(labor.plannedMinutes)}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
      {byHour.some((h) => h.covers > 0) ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-text-muted">
            Cubiertos por hora de llegada
          </p>
          <Bars
            values={byHour.map((h) => h.covers)}
            labels={byHour.map((h) => (h.hour % 2 ? "" : String(h.hour)))}
            highlightLast={false}
            className="mt-2 h-20"
            format={(v) => `${v} cubiertos`}
          />
        </div>
      ) : null}
      <WhatsAppButton
        className="mt-4 w-full"
        size="default"
        phone={ops.ownerPhone}
        share={!ops.ownerPhone}
        label="Mandar la semana"
        message={weekReportMessage({ data, ops, monday, now })}
      />
    </Panel>
  );
}
