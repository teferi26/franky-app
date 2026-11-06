"use client";

import * as React from "react";
import { Clock3, Copy, Download, Gift, Star, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cabinStats,
  chairStats,
  emptyHours,
  gestoriaText,
  monthCsv,
  monthSummary,
} from "@/lib/pro/agenda-money";
import { reviewStats } from "@/lib/pro/agenda-ops";
import { freeGaps } from "@/lib/pro/agenda";
import {
  addDays,
  localDate,
  money,
  plural,
  weekdayIndex,
} from "@/lib/pro/format";
import {
  Avatar,
  Bars,
  Empty,
  Kpi,
  KpiRow,
  Meter,
  Panel,
  Pill,
} from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { WhatsAppButton, downloadText, useAgenda, useCopy } from "./parts";

const WEEKDAY = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

function monthName(month: string) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Caja del mes: cobros por día y método, comisiones con sus reglas, alquiler
 * de sillón, horas fichadas y el resumen listo para la gestoría. Debajo, la
 * rentabilidad de cada silla y las horas que se quedan vacías.
 */
export function MonthView({ month }: { month: string }) {
  const { data, now, demo, can, ops } = useAgenda();
  const copy = useCopy();
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const summary = monthSummary(data, month);
  const label = monthName(month);
  const text = gestoriaText(data, summary, label);
  const reviews = reviewStats(data, now);
  const chairs = chairStats(data, now);
  const cabins = cabinStats(data, now);
  const empty = emptyHours(data, now);
  const showFinance = demo || can("finance.read");
  const totalDays = summary.days.length;

  if (!showFinance) return null;

  const launchValley = (weekday: number, hour: number) => {
    // Próximo día con ese día de la semana, y el hueco real de esa hora.
    let date = addDays(localDate(now), 1);
    while (weekdayIndex(date) !== weekday) date = addDays(date, 1);
    const gap = freeGaps(data, date, 0, 30).find(
      (g) => g.from <= hour * 60 && g.to >= (hour + 1) * 60,
    );
    setOffer(
      gap
        ? { gap: { ...gap, from: hour * 60, to: (hour + 1) * 60 } }
        : { date, from: hour * 60, to: (hour + 1) * 60 },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <KpiRow>
        <Kpi
          icon={Wallet}
          label="Cobrado en el mes"
          value={money(summary.totalCents, { round: true })}
          hint={`${money(summary.tipsCents, { round: true })} de propinas`}
          emphasis
        />
        <Kpi
          label="Servicios y productos"
          value={money(summary.serviceCents + summary.productCents, {
            round: true,
          })}
          hint={`${money(summary.productCents, { round: true })} en productos`}
        />
        <Kpi
          icon={Gift}
          label="Bonos y regalos"
          value={money(summary.prepaidCents, { round: true })}
          hint="cobrado por adelantado"
        />
        <Kpi
          icon={Star}
          label="Reseñas"
          value={`${reviews.asked} pedidas`}
          hint={`${reviews.received} nuevas este mes`}
        />
      </KpiRow>

      <Panel
        title="Cobros por día"
        description={`${plural(totalDays, "día", "días")} con caja en ${label}.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-10"
              disabled={!totalDays}
              onClick={() =>
                downloadText(
                  `caja-${data.space.slug}-${month}.csv`,
                  monthCsv(summary),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        }
      >
        {totalDays ? (
          <Bars
            values={summary.days.map((d) => d.total)}
            labels={summary.days.map((d) => d.date.slice(8))}
            highlightLast={month === localDate(now).slice(0, 7)}
            format={(v) => money(v, { round: true })}
            className="h-32"
          />
        ) : (
          <Empty icon={Wallet} title="Aún no hay cobros este mes" />
        )}
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          {(
            [
              ["Tarjeta", summary.byMethod.card],
              ["Efectivo", summary.byMethod.cash],
              ["Bizum", summary.byMethod.bizum],
            ] as const
          ).map(([name, cents]) => (
            <div key={name} className="rounded-xl bg-bg-secondary px-3 py-2.5">
              <p className="text-xs text-text-muted">{name}</p>
              <p className="font-heading text-base font-bold tabular">
                {money(cents, { round: true })}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Equipo y comisiones"
        description="Comisión sobre lo cobrado, sin propinas. Quien alquila sillón paga su cuota y no lleva comisión."
        flush
      >
        {summary.staff.length ? (
          <div className="overflow-x-auto pro-scroll">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border-light text-left text-xs uppercase tracking-wider text-text-muted">
                  <th className="px-5 py-2.5 font-semibold">Persona</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Servicios
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Productos
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Propinas
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Comisión
                  </th>
                  <th className="px-5 py-2.5 text-right font-semibold">
                    Horas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {summary.staff.map((row) => (
                  <tr key={row.staff.id}>
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2">
                        <Avatar
                          name={row.staff.name}
                          tone={row.staff.tone}
                          size="xs"
                        />
                        <span className="font-medium">
                          {row.staff.name.split(" ")[0]}
                        </span>
                        {row.chairRentCents ? (
                          <Pill>Alquila sillón</Pill>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {money(row.serviceCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {money(row.productCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {money(row.tipsCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular">
                      {row.chairRentCents
                        ? `Debe ${money(row.chairRentCents)}`
                        : money(row.commissionCents)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular">
                      {Math.round(row.clockedMinutes / 60)} h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-text-muted">
            Aún no hay cobros del equipo este mes.
          </p>
        )}
      </Panel>

      <Panel
        title="Para tu gestoría"
        description="El resumen del mes en texto, listo para pegar en un correo o un WhatsApp."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-10"
              onClick={() => copy(text, "Resumen copiado")}
            >
              <Copy className="h-4 w-4" /> Copiar
            </Button>
            <WhatsAppButton
              share
              message={text}
              label="Enviar"
              variant="dark"
            />
          </div>
        }
      >
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-bg-secondary p-4 font-sans text-sm text-text-secondary pro-scroll">
          {text}
        </pre>
      </Panel>

      {ops && chairs.length ? (
        <Panel
          title="Rentabilidad por silla"
          description="Últimas cuatro semanas: ocupación de las horas abiertas, lo que factura cada hora y cuántos repiten."
          flush
        >
          <ul className="divide-y divide-border-light">
            {chairs.map((row) => (
              <li
                key={row.staff.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5"
              >
                <Avatar name={row.staff.name} tone={row.staff.tone} size="sm" />
                <span className="min-w-[8rem] flex-1">
                  <span className="block text-sm font-semibold">
                    {row.staff.name.split(" ")[0]}
                  </span>
                  <Meter
                    value={row.occupancyPct}
                    max={100}
                    tone={row.occupancyPct < 50 ? "warning" : "violet"}
                    className="mt-1.5 max-w-48"
                  />
                  <span className="text-xs text-text-muted">
                    {row.occupancyPct} % ocupada
                  </span>
                </span>
                <span className="grid grid-cols-3 gap-4 text-right text-sm">
                  <span>
                    <span className="block font-semibold tabular">
                      {money(row.revenuePerHourCents)}
                    </span>
                    <span className="text-xs text-text-muted">por hora</span>
                  </span>
                  <span>
                    <span className="block font-semibold tabular">
                      {money(row.ticketCents)}
                    </span>
                    <span className="text-xs text-text-muted">ticket</span>
                  </span>
                  <span>
                    <span className="block font-semibold tabular">
                      {row.repeatPct} %
                    </span>
                    <span className="text-xs text-text-muted">repiten</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {ops && cabins.length ? (
        <Panel
          title="Rentabilidad por cabina"
          description="Últimas cuatro semanas, con las sesiones hechas a precio de tarifa y la preparación incluida en la ocupación."
          flush
        >
          <ul className="divide-y divide-border-light">
            {cabins.map((row) => {
              const top = data.services.find((s) => s.id === row.topServiceId);
              return (
                <li
                  key={row.cabin.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5"
                >
                  <span className="min-w-[8rem] flex-1">
                    <span className="block text-sm font-semibold">
                      {row.cabin.name}
                    </span>
                    <Meter
                      value={row.occupancyPct}
                      max={100}
                      tone={row.occupancyPct < 40 ? "warning" : "violet"}
                      className="mt-1.5 max-w-48"
                    />
                    <span className="text-xs text-text-muted">
                      {row.occupancyPct} % ocupada · {row.sessions} sesiones
                      {top ? ` · sobre todo ${top.name.toLowerCase()}` : ""}
                    </span>
                  </span>
                  <span className="grid grid-cols-2 gap-4 text-right text-sm">
                    <span>
                      <span className="block font-semibold tabular">
                        {money(row.perBusyHourCents)}
                      </span>
                      <span className="text-xs text-text-muted">
                        por hora ocupada
                      </span>
                    </span>
                    <span>
                      <span className="block font-semibold tabular">
                        {money(row.perOpenHourCents)}
                      </span>
                      <span className="text-xs text-text-muted">
                        por hora abierta
                      </span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {ops && empty.length ? (
        <Panel
          title="Horas que se quedan vacías"
          description="Las franjas de la semana con más sillas libres en el último mes."
          flush
        >
          <ul className="divide-y divide-border-light">
            {empty.map((hour) => (
              <li
                key={`${hour.weekday}-${hour.hour}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              >
                <Clock3
                  className="h-4 w-4 shrink-0 text-text-muted"
                  strokeWidth={1.9}
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">
                    Los {WEEKDAY[hour.weekday]} a las {hour.hour}:00
                  </span>
                  <span className="text-text-muted">
                    {" "}
                    · {hour.freePct} % libre
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-10"
                  disabled={!can("offer.launch")}
                  onClick={() => launchValley(hour.weekday, hour.hour)}
                >
                  <Zap className="h-4 w-4" /> Lanzar oferta
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </div>
  );
}
