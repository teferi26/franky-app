"use client";

import * as React from "react";
import { AlertTriangle, CalendarDays, ChevronDown, Download, MapPin, Stamp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import { capitalize, dayLabel, localDate, time } from "@/lib/pro/format";
import {
  CREDIT_MIN_ATTENDANCE,
  activityClashes,
  attendancePct,
  creditEligible,
  creditsCsv,
  decideCredits,
  ectsFor,
  pendingCreditGroups,
  uniExtrasOf,
  type CreditGroup,
} from "@/lib/pro/university";
import type { UniAssociation } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import { Empty, Panel, Pill, Tip } from "../../kit";
import { downloadCsv, useUniAction } from "./ui";

/* ------------------------------------------------------------------ */
/* Créditos con asistencia verificada                                  */
/* ------------------------------------------------------------------ */

export function CreditsView({ associationId, onClearFilter }: { associationId: string | null; onClearFilter: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const extras = uniExtrasOf(data);
  const associations = data.uniAssociations as UniAssociation[];
  const groups = pendingCreditGroups(extras.credits, associations).filter((g) => !associationId || g.associationId === associationId);
  const eligibleIds = groups.flatMap((g) => g.requests.filter(creditEligible).map((r) => r.id));
  const validated = extras.credits.filter((r) => r.status === "validated");
  const filterName = associations.find((a) => a.id === associationId)?.name;

  const decide = (ids: string[], status: "validated" | "revision") =>
    run(
      status === "validated" ? "credits.validate" : "credits.revision",
      (d) => decideCredits(d, ids, status, now),
      status === "validated" ? `${ids.length} solicitudes validadas` : `Revisión pedida para ${ids.length}`,
      status === "validated" ? "Ya puedes descargarlas para secretaría." : "La asociación recibe quién no llega a la asistencia mínima.",
    );

  const exportCsv = () => downloadCsv(`creditos-secretaria-${localDate(now)}.csv`, creditsCsv(extras.credits, associations, extras.hoursPerEcts));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="font-heading text-base font-bold">
            {eligibleIds.length ? `${eligibleIds.length} solicitudes cumplen la asistencia` : "Nada que validar ahora"}
          </p>
          <p className="text-sm text-text-muted">
            Regla del centro: {extras.hoursPerEcts} horas son 1 ECTS y hace falta el {CREDIT_MIN_ATTENDANCE} % de las sesiones con check-in.
          </p>
          {filterName ? (
            <button type="button" onClick={onClearFilter} className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold">
              Solo {filterName} <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!validated.length}>
            <Download className="h-4 w-4" /> Para secretaría ({validated.length})
          </Button>
          <Button variant="dark" onClick={() => decide(eligibleIds, "validated")} disabled={!eligibleIds.length}>
            <Stamp className="h-4 w-4" /> Validar {eligibleIds.length}
          </Button>
        </div>
      </div>

      {groups.length ? (
        groups.map((g) => <CreditGroupCard key={g.key} group={g} hoursPerEcts={extras.hoursPerEcts} onDecide={decide} />)
      ) : (
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
          <Empty
            icon={Stamp}
            title="No hay créditos por validar"
            body="Cuando una asociación termine una actividad con check-in, sus solicitudes llegan aquí con las horas y la asistencia de cada persona."
          />
        </div>
      )}

      <Tip title="Sin hojas de firmas">
        Las horas salen de los check-in con cuenta universitaria, no de una hoja que se firma al final. Los nombres solo aparecen aquí y en el archivo para secretaría: el resto de cifras del campus siempre son agregadas.
      </Tip>
    </div>
  );
}

function CreditGroupCard({
  group,
  hoursPerEcts,
  onDecide,
}: {
  group: CreditGroup;
  hoursPerEcts: number;
  onDecide: (ids: string[], status: "validated" | "revision") => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const eligible = group.requests.filter(creditEligible);
  const below = group.requests.filter((r) => !creditEligible(r));
  const shown = expanded ? group.requests : group.requests.slice(0, 4);

  return (
    <Panel
      title={group.activity}
      description={`${group.association} · ${group.hours} h, ${ectsFor(group.hours, hoursPerEcts).toLocaleString("es-ES")} ECTS por persona`}
      flush
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <Pill tone="success">{eligible.length} cumplen</Pill>
        {below.length ? <Pill tone="warning">{below.length} por debajo del {CREDIT_MIN_ATTENDANCE} %</Pill> : null}
      </div>
      <ul className="divide-y divide-border-light border-t border-border-light">
        {shown.map((r) => {
          const ok = creditEligible(r);
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.student}</span>
                <span className="block truncate text-xs text-text-muted">{r.faculty}</span>
              </span>
              <span className={cn("shrink-0 text-xs tabular", ok ? "text-text-muted" : "font-semibold text-amber-700 dark:text-amber-300")}>
                {r.attended} de {r.sessions} sesiones · {attendancePct(r)} %
              </span>
            </li>
          );
        })}
      </ul>
      {group.requests.length > 4 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-h-10 w-full items-center justify-center gap-1 border-t border-border-light text-sm font-semibold text-text-secondary hover:bg-bg-secondary"
        >
          {expanded ? "Ver menos" : `Ver las ${group.requests.length}`}
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </button>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border-light px-4 py-3 sm:px-5">
        {below.length ? (
          <Button variant="outline" onClick={() => onDecide(below.map((r) => r.id), "revision")}>
            Pedir revisión de {below.length}
          </Button>
        ) : null}
        <Button variant="dark" disabled={!eligible.length} onClick={() => onDecide(eligible.map((r) => r.id), "validated")}>
          Validar {eligible.length}
        </Button>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Calendario de actividades con choques de espacio                    */
/* ------------------------------------------------------------------ */

export function ActivitiesView() {
  const { data, now } = usePro();
  const extras = uniExtrasOf(data);
  const associations = data.uniAssociations as UniAssociation[];
  const today = localDate(now);
  const upcoming = extras.assocActivities
    .filter((a) => localDate(a.end) >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const clashes = activityClashes(upcoming);
  const clashCount = [...clashes.values()].reduce((a, list) => a + list.length, 0) / 2;
  const byId = new Map(upcoming.map((a) => [a.id, a]));
  const days = [...new Set(upcoming.map((a) => localDate(a.start)))];
  const nameOf = (id: string) => associations.find((a) => a.id === id)?.name ?? "Asociación";

  if (!upcoming.length) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
        <Empty
          icon={CalendarDays}
          title="Sin actividades programadas"
          body="Cuando las asociaciones programen actividades en Franky, las verás aquí juntas y te avisaremos si dos coinciden en el mismo espacio y a la misma hora."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {clashCount ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
          <p>
            <span className="font-semibold">{clashCount === 1 ? "Hay 1 choque de espacio." : `Hay ${clashCount} choques de espacio.`}</span> Dos actividades coinciden en el mismo sitio a la misma hora: avisa a una de las asociaciones antes de que llegue el día.
          </p>
        </div>
      ) : null}

      {days.map((day) => (
        <Panel key={day} title={capitalize(dayLabel(`${day}T12:00:00Z`))} flush>
          <ul className="divide-y divide-border-light">
            {upcoming
              .filter((a) => localDate(a.start) === day)
              .map((a) => {
                const clash = clashes.get(a.id) ?? [];
                return (
                  <li key={a.id} className={cn("flex gap-3 px-4 py-3 sm:px-5", clash.length && "bg-amber-50/60 dark:bg-amber-950/20")}>
                    <span className="w-24 shrink-0 text-sm font-semibold tabular">
                      {time(a.start)}
                      <span className="block text-xs font-normal text-text-muted">hasta {time(a.end)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{a.title}</span>
                      <span className="block truncate text-xs text-text-muted">{nameOf(a.associationId)}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
                        <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{a.place}</span>
                      </span>
                      {clash.length ? (
                        <span className="mt-1.5 inline-flex">
                          <Pill tone="warning">Coincide con {clash.map((id) => byId.get(id)?.title ?? "otra actividad").join(", ")}</Pill>
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
