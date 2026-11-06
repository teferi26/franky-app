"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, ArrowRight, Moon, Snowflake, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProResource } from "@/lib/pro/types";
import { addDays, durationLabel, localDate, money, plural } from "@/lib/pro/format";
import { MATCH_MINUTES, isShared, isValley, priceFor } from "@/lib/pro/courts";
import { clockLabel } from "@/lib/pro/courts-base";
import { coldSpots, valleyResults, type ColdSpot } from "@/lib/pro/courts-ops";
import { forecastWeeks } from "@/lib/pro/courts-desk";
import { mondayOf, occupancyCompare, resourceMonthHours } from "@/lib/pro/courts-admin";
import { cn } from "@/lib/utils";
import { Empty, Kpi, KpiRow, PageHeader, Panel, Pill, Segmented, StepNav, Tip } from "../../kit";
import { sectionHref } from "../../shell";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { courtsCopy } from "./parts";
import { UniCalendarPanel } from "./uni-calendar";
import { shortDate } from "./state";

/**
 * Ocupación que se entiende: mapa de calor de la semana por media hora,
 * valle frente al resto, comparación con la semana anterior y, en cada
 * franja fría, una acción para llenarla. Solo lee reservas y pistas, así que
 * funciona igual en la demo y en una cuenta real.
 */

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAYS_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Intensidad del violeta según la ocupación: cinco escalones fáciles de leer. */
function heatClass(v: number | null): string {
  if (v === null) return "bg-bg-secondary";
  if (v <= 0.05) return "bg-bg-tertiary";
  if (v <= 0.25) return "bg-violet/15";
  if (v <= 0.5) return "bg-violet/35";
  if (v <= 0.75) return "bg-violet/60";
  return "bg-violet";
}

function pctLabel(v: number) {
  return `${Math.round(v * 100)} %`;
}

function weekdaysLabel(days: number[]): string {
  if (days.length >= 5) return "Entre semana";
  if (days.length === 1) return `Los ${DAYS_LONG[days[0]]}`;
  const names = days.map((d) => DAYS_LONG[d]);
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`.replace(/^./, (c) => c.toUpperCase());
}

export default function OcupacionSection() {
  const { data, now, vertical, spaceId } = usePro();
  const copy = courtsCopy(vertical.id);
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const [monday, setMonday] = React.useState(mondayOf(today));
  const [resourceId, setResourceId] = React.useState<string>("all");
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const [picked, setPicked] = React.useState<{ date: string; minute: number } | null>(null);

  const rid = resourceId === "all" ? undefined : resourceId;
  const compare = occupancyCompare(data, monday, rid);
  const heat = compare.thisWeek;
  // Las franjas frías se buscan en la semana pasada entera: ya ha ocurrido.
  const colds = coldSpots(compare.lastWeek);
  const month = today.slice(0, 7);
  const valley = valleyResults(data, `${month}-01`, today);
  const isThisWeek = monday === mondayOf(today);
  const firstCourt = data.resources.find((r) => (rid ? r.id === rid : !isShared(r))) ?? data.resources[0];

  const offerFor = (date: string, from: number, to: number) => {
    const r = firstCourt;
    if (!r) return;
    const price = isShared(r)
      ? r.pricePerHourCents === null
        ? null
        : r.pricePerHourCents * 4
      : priceFor({ ...r, valleyPricePerHourCents: undefined }, date, from, coworking ? 120 : MATCH_MINUTES);
    if (price === null) return;
    setOffer({
      what: copy.what(r),
      date,
      from,
      to,
      priceCents: price,
      slots: Math.max(1, Math.floor((to - from) / (coworking ? 120 : MATCH_MINUTES))),
    });
  };

  const nextDateFor = (weekday: number) => {
    let d = addDays(today, 1);
    while ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7 !== weekday) d = addDays(d, 1);
    return d;
  };

  const delta = compare.deltaPoints;
  const description = heat.rows.some((r) => r.cells.some((c) => c !== null))
    ? `Media del ${pctLabel(heat.average)}${compare.lastWeek.average ? `, ${Math.abs(delta)} ${Math.abs(delta) === 1 ? "punto" : "puntos"} ${delta >= 0 ? "más" : "menos"} que la semana anterior` : ""}. Las mañanas valle, al ${pctLabel(compare.valley)}.`
    : "Cerrado toda la semana.";

  const pickedCell = picked
    ? (() => {
        const row = heat.rows.find((r) => r.date === picked.date);
        const k = heat.slots.indexOf(picked.minute);
        return row && k >= 0 ? row.cells[k] : null;
      })()
    : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Ocupación"
        title={`Semana del ${shortDate(monday)} al ${shortDate(addDays(monday, 6))}`}
        description={description}
        actions={
          colds[0] ? (
            <Button variant="dark" onClick={() => offerFor(nextDateFor(colds[0].weekdays[0] ?? 0), colds[0].from, colds[0].to)}>
              Llenar la franja más fría
            </Button>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StepNav
            label=""
            onPrev={() => setMonday(addDays(monday, -7))}
            onNext={() => setMonday(addDays(monday, 7))}
            onToday={() => setMonday(mondayOf(today))}
            isToday={isThisWeek}
          />
          {data.resources.length > 1 ? (
            <Segmented
              size="sm"
              label={copy.many}
              value={resourceId}
              onChange={setResourceId}
              options={[{ value: "all", label: "Todas" }, ...data.resources.map((r) => ({ value: r.id, label: r.name }))]}
            />
          ) : null}
        </div>
      </PageHeader>

      <KpiRow>
        <Kpi label="Esta semana" value={pctLabel(heat.average)} emphasis hint={`${copy.many} ocupadas de media`} />
        <Kpi
          label="Frente a la anterior"
          value={`${delta > 0 ? "+" : ""}${delta}`}
          icon={delta >= 0 ? TrendingUp : TrendingDown}
          hint="puntos de ocupación"
        />
        <Kpi label="Valle (10 a 14 h)" value={pctLabel(compare.valley)} icon={Snowflake} hint="entre semana" />
        <Kpi label="Valle con Franky" value={money(valley.revenueCents, { round: true })} hint={`${plural(valley.bookings, "reserva", "reservas")} este mes`} />
      </KpiRow>

      <Panel
        title="Mapa de la semana"
        description="Cada casilla es media hora. Toca una franja fría para llenarla."
        flush
      >
        <div className="overflow-x-auto px-4 py-4 pro-scroll sm:px-5">
          <div
            className="grid min-w-[640px] gap-[3px]"
            style={{ gridTemplateColumns: `2.6rem repeat(${heat.slots.length}, minmax(0, 1fr))` }}
          >
            <span />
            {heat.slots.map((m) => (
              <span key={m} className="text-center text-[0.6rem] text-text-muted tabular">
                {m % 60 === 0 && (m / 60) % 2 === 0 ? clockLabel(m).slice(0, 2) : ""}
              </span>
            ))}
            {heat.rows.map((row) => (
              <React.Fragment key={row.date}>
                <span className={cn("self-center text-xs font-semibold", row.date === today ? "text-violet" : "text-text-muted")}>
                  {DAYS[row.weekday]}
                </span>
                {row.cells.map((v, k) => {
                  const minute = heat.slots[k];
                  const active = picked?.date === row.date && picked.minute === minute;
                  return (
                    <button
                      key={minute}
                      type="button"
                      disabled={v === null}
                      onClick={() => setPicked({ date: row.date, minute })}
                      aria-label={`${DAYS_LONG[row.weekday]} a las ${clockLabel(minute)}: ${v === null ? "cerrado" : pctLabel(v)}`}
                      className={cn(
                        "h-7 rounded-[4px] transition-[box-shadow] sm:h-8",
                        heatClass(v),
                        active && "ring-2 ring-text-primary ring-offset-1 ring-offset-bg-primary",
                      )}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[0.7rem] text-text-muted">
            Vacío
            {[0, 0.2, 0.4, 0.7, 1].map((v) => (
              <span key={v} className={cn("h-3 w-5 rounded-[3px]", heatClass(v))} />
            ))}
            Lleno
          </div>
        </div>
        {picked && pickedCell !== null ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border-light px-4 py-3 sm:px-5">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">
                {DAYS_LONG[(new Date(`${picked.date}T12:00:00Z`).getUTCDay() + 6) % 7]} {shortDate(picked.date).split(" ").slice(1).join(" ")}, {clockLabel(picked.minute)}
              </span>
              <span className="text-text-muted">: {pctLabel(pickedCell ?? 0)} ocupado</span>
            </span>
            {(pickedCell ?? 0) <= 0.5 && !coworking && isValley(picked.date, picked.minute) ? (
              <>
                <Link
                  href={sectionHref(spaceId, "escuela")}
                  className="inline-flex min-h-10 items-center rounded-xl px-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
                >
                  Clínic
                </Link>
                <Link
                  href={`${sectionHref(spaceId, "torneos")}?vista=liga`}
                  className="inline-flex min-h-10 items-center rounded-xl px-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
                >
                  Liga
                </Link>
              </>
            ) : null}
            {(pickedCell ?? 0) <= 0.5 ? (
              <Button
                size="sm"
                variant="outline"
                className="min-h-10"
                onClick={() => {
                  // Una franja ya pasada se ofrece el mismo día de la semana que viene.
                  let date = picked.date;
                  while (date < today) date = addDays(date, 7);
                  offerFor(date, picked.minute, picked.minute + (coworking ? 120 : MATCH_MINUTES));
                }}
              >
                Oferta a estudiantes
              </Button>
            ) : (
              <Pill tone="success">Franja buena</Pill>
            )}
          </div>
        ) : null}
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          title="Franjas frías que se repiten"
          description="Casi vacías tres días o más la semana pasada."
          flush
        >
          {colds.length ? (
            <div className="divide-y divide-border-light">
              {colds.map((c) => (
                <ColdRow
                  key={`${c.from}-${c.to}`}
                  spot={c}
                  coworking={coworking}
                  onOffer={() => offerFor(nextDateFor(c.weekdays[0] ?? 0), c.from, c.to)}
                  leagueHref={`${sectionHref(spaceId, "torneos")}?vista=liga`}
                />
              ))}
            </div>
          ) : (
            <Empty icon={Activity} title="Ninguna franja fría" body="La semana pasada no hubo huecos que se repitieran. Buen trabajo." />
          )}
        </Panel>

        {coworking ? <ForecastPanel today={today} normasHref={sectionHref(spaceId, "normas")} /> : <CourtHoursPanel month={month} />}
      </div>

      <UniCalendarPanel />

      <Tip title="Cómo leerlo">
        {coworking
          ? "Las mañanas entre clases son las más fáciles de llenar con estudiantes. Una oferta de puesto de mañana llega a quien tiene examen cerca."
          : "Un club da dinero a partir del 60 o 70 % de ocupación. La punta se llena sola: lo que marca la diferencia son las mañanas y el mediodía."}
      </Tip>

      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </div>
  );
}

function ColdRow({
  spot,
  coworking,
  onOffer,
  leagueHref,
}: {
  spot: ColdSpot;
  coworking: boolean;
  onOffer: () => void;
  leagueHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
      <Snowflake className="h-4 w-4 shrink-0 text-sky-600" strokeWidth={1.9} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {weekdaysLabel(spot.weekdays)}, de {clockLabel(spot.from)} a {clockLabel(spot.to)}
        </span>
        <span className="block text-xs text-text-muted">
          {durationLabel(spot.to - spot.from)} casi vacías{spot.valley ? ", en franja valle" : ""}
        </span>
      </span>
      <div className="flex gap-2">
        {!coworking && spot.valley ? (
          <Link
            href={leagueHref}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-text-secondary hover:text-text-primary"
          >
            Liga <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.9} />
          </Link>
        ) : null}
        <Button size="sm" variant="outline" className="min-h-10" onClick={onOffer}>
          Oferta
        </Button>
      </div>
    </div>
  );
}

function ForecastPanel({ today, normasHref }: { today: string; normasHref: string }) {
  const weeks = forecastWeeks(today, 16);
  const peak = weeks.find((w) => w.level === "muy alta");
  const color: Record<(typeof weeks)[number]["level"], string> = {
    baja: "bg-bg-tertiary",
    normal: "bg-violet/30",
    alta: "bg-violet/60",
    "muy alta": "bg-violet",
  };
  const height: Record<(typeof weeks)[number]["level"], string> = {
    baja: "25%",
    normal: "45%",
    alta: "70%",
    "muy alta": "100%",
  };
  return (
    <Panel
      title="Previsión de llenos"
      description="Estimada con el calendario habitual de exámenes de la zona."
    >
      <div className="flex h-28 items-end gap-1">
        {weeks.map((w) => (
          <div key={w.week} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${shortDate(w.week)}: ${w.level}${w.reason ? `, ${w.reason.toLowerCase()}` : ""}`}>
            <div className={cn("w-full rounded-[4px]", color[w.level])} style={{ height: height[w.level] }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.65rem] text-text-muted">
        <span>{shortDate(weeks[0].week)}</span>
        <span>{shortDate(weeks[weeks.length - 1].week)}</span>
      </div>
      {peak ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-bg-secondary p-3 text-sm">
          <Moon className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
          <span className="min-w-0 flex-1">
            Desde el {shortDate(peak.week)} llega {peak.reason?.toLowerCase() ?? "la época fuerte"}. Si abres de noche, ponlo ya en tu horario especial.
          </span>
          <Link href={normasHref} className="shrink-0 text-sm font-semibold text-violet">
            Horario
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}

function CourtHoursPanel({ month }: { month: string }) {
  const { data } = usePro();
  const rows = resourceMonthHours(data, month).filter((r) => {
    const res = data.resources.find((x) => x.id === r.resourceId);
    return res && !isShared(res as ProResource);
  });
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  return (
    <Panel title="Horas jugadas este mes" description="Para planificar el césped y el mantenimiento de cada pista.">
      {rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.resourceId}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{data.resources.find((x) => x.id === r.resourceId)?.name}</span>
                <span className="tabular text-text-muted">{durationLabel(r.minutes)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
                <div className="h-full rounded-full bg-violet" style={{ width: `${Math.round((r.minutes / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">Aún no hay horas este mes.</p>
      )}
    </Panel>
  );
}
