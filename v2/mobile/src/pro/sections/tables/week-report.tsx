import React from "react";
import { View } from "react-native";
import { S } from "@/theme";
import { mondayOf } from "../../../../../shared/pro/tables-ops";
import { weekReport } from "../../../../../shared/pro/tables-day";
import { coversByHour, weekLabor, weekReportMessage } from "../../../../../shared/pro/tables-insights";
import { addDays, localDate, money, plural } from "../../../../../shared/pro/format";
import { usePro } from "../../store";
import { Bars, PText, Panel, StepNav } from "../../kit";
import { Figure, WhatsAppButton, useTablesOps } from "./ops";

const DAY = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * La semana del local de un vistazo, igual que `week-report.tsx` de la web:
 * caja de los cierres, cubiertos, plantones, lo que trajo Franky, la Card y
 * las horas del equipo. Se manda por WhatsApp al socio o al dueño.
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
  const values = DAY.map((_, i) => week.days.find((d) => d.date === addDays(monday, i))?.totalCents ?? 0);
  const fmt = (d: string, month: boolean) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", {
      day: "numeric",
      ...(month ? { month: "short" as const } : null),
      timeZone: "Europe/Madrid",
    });
  const hours = (m: number) => `${(Math.round(m / 6) / 10).toLocaleString("es-ES")} h`;

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
        label={`Del ${fmt(monday, false)} al ${fmt(addDays(monday, 6), true)}`}
        onPrev={() => setMonday((m) => addDays(m, -7))}
        onNext={() => setMonday((m) => addDays(m, 7))}
        onToday={() => setMonday(thisMonday)}
        isToday={monday === thisMonday}
      />
      <Bars values={values} labels={DAY} height={100} format={(v) => (v ? money(v, { round: true }) : "")} />
      <View style={{ gap: S.md, marginTop: S.lg }}>
        {tables ? (
          <>
            <View style={{ flexDirection: "row", gap: S.md }}>
              <Figure label="Cubiertos" value={week.covers} />
              <Figure label="Ticket por cubierto" value={week.perCoverCents === null ? "Sin datos" : money(week.perCoverCents)} />
            </View>
            <View style={{ flexDirection: "row", gap: S.md }}>
              <Figure label="No vinieron" value={week.noShows} hint={`de ${week.bookings} (${week.noShowPct.toLocaleString("es-ES")} %)`} />
              <Figure label="Reservas por Franky" value={week.franky} hint={week.groups ? plural(week.groups, "grupo", "grupos") : undefined} />
            </View>
          </>
        ) : null}
        <View style={{ flexDirection: "row", gap: S.md }}>
          <Figure label="Franky Card" value={week.card} />
          <Figure
            label="Horas fichadas"
            value={labor.workedMinutes ? hours(labor.workedMinutes) : "Sin fichajes"}
            hint={labor.plannedMinutes ? `de ${hours(labor.plannedMinutes)} en el cuadrante` : undefined}
          />
        </View>
      </View>
      {byHour.some((h) => h.covers > 0) ? (
        <View style={{ marginTop: S.lg, gap: S.sm }}>
          <PText v="tiny">Cubiertos por hora de llegada</PText>
          <Bars values={byHour.map((h) => h.covers)} labels={byHour.map((h) => (h.hour % 2 ? "" : String(h.hour)))} height={80} format={(v) => (v ? String(v) : "")} />
        </View>
      ) : null}
      <View style={{ marginTop: S.lg }}>
        <WhatsAppButton
          full
          small={false}
          phone={ops.ownerPhone}
          share={!ops.ownerPhone}
          label="Mandar la semana"
          message={weekReportMessage({ data, ops, monday, now })}
        />
      </View>
    </Panel>
  );
}
