"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { usePro } from "@/lib/pro/store";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import type { CommunityActivity } from "@/lib/pro/community-types";
import {
  cohortComparison,
  cohortDelta,
  newcomerInviteMessage,
} from "@/lib/pro/community-cohort";
import { Avatar, Panel } from "../../kit";
import { sectionHref } from "../../shell";

/**
 * La hornada de septiembre en el Resumen: cuántos socios nuevos han vuelto,
 * comparado con el curso anterior en las mismas fechas, y a quién invitar.
 */

const STEPS = ["Al menos 1 actividad", "Han vuelto (2 o más)", "Ya son de la casa (3 o más)"];

function deltaText(delta: number | null, previousPct: number | undefined): string {
  if (delta === null || previousPct === undefined) return "Es el primer curso con datos: el año que viene podrás compararlo.";
  if (delta === 0) return `Igual que el curso pasado a estas alturas (${previousPct} %).`;
  const points = Math.abs(delta) === 1 ? "punto" : "puntos";
  return delta > 0
    ? `${delta} ${points} más que el curso pasado a estas alturas (${previousPct} %).`
    : `${-delta} ${points} menos que el curso pasado a estas alturas (${previousPct} %).`;
}

export function CohortPanel() {
  const { data, now, spaceId } = usePro();
  const comparison = cohortComparison(data, now);
  const { current, previous } = comparison;
  if (!current.joined) return null;

  const delta = cohortDelta(comparison);
  const next = (data.activities as CommunityActivity[])
    .filter((a) => a.status === "published" && a.date >= now.toISOString())
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const url = `https://franky.es/n/${data.space.slug}`;
  const invite = current.neverCame
    .map((m) => ({
      member: m,
      href: customerWhatsApp(
        m.phone,
        newcomerInviteMessage({ member: m, spaceName: data.space.name, activity: next, url }),
      ),
    }))
    .filter((x) => x.href);

  return (
    <Panel
      title="La hornada de este curso"
      description={`${current.joined} socios nuevos desde julio. Cuántos vuelven después de la primera vez.`}
    >
      <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{current.pct[1]} %</p>
      <p className="text-sm text-text-muted">ha vuelto a una segunda actividad</p>
      <p className={delta !== null && delta < 0 ? "mt-1 text-xs font-semibold text-warning" : "mt-1 text-xs text-text-muted"}>
        {deltaText(delta, previous?.pct[1])}
      </p>

      <ul className="mt-4 flex flex-col gap-3" aria-label="Socios nuevos por actividades">
        {STEPS.map((label, i) => (
          <li key={label}>
            <div className="mb-1 flex justify-between gap-3 text-xs">
              <span className="text-text-secondary">{label}</span>
              <span className="font-semibold tabular">
                {current.atLeast[i]} <span className="font-normal text-text-muted">({current.pct[i]} %)</span>
              </span>
            </div>
            <div className="relative h-1.5 w-full rounded-full bg-bg-tertiary">
              <div className="h-full rounded-full bg-violet" style={{ width: `${current.pct[i]}%` }} />
              {previous ? (
                <span
                  className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-text-primary/45"
                  style={{ left: `calc(${previous.pct[i]}% - 1px)` }}
                  title={`Curso ${previous.course.label}: ${previous.pct[i]} %`}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {previous ? (
        <p className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-text-muted">
          <span className="inline-block h-3 w-0.5 rounded-full bg-text-primary/45" aria-hidden /> Curso{" "}
          {previous.course.label} en las mismas fechas
        </p>
      ) : null}

      {current.neverCame.length ? (
        <div className="mt-4 border-t border-border-light pt-4">
          <p className="text-sm font-semibold">
            {current.neverCame.length === 1
              ? "1 socio nuevo aún no ha venido a nada"
              : `${current.neverCame.length} socios nuevos aún no han venido a nada`}
          </p>
          <p className="text-xs text-text-muted">
            {next ? `Invítales a ${next.title}: un mensaje personal funciona mejor que el grupo.` : "Un mensaje personal funciona mejor que el grupo."}
          </p>
          {invite.length ? (
            <ul className="mt-2 flex flex-col">
              {invite.slice(0, 4).map(({ member, href }) => (
                <li key={member.id}>
                  <a
                    href={href ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-10 items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm hover:bg-bg-secondary"
                  >
                    <Avatar name={member.name} size="xs" tone="sky" />
                    <span className="min-w-0 flex-1 truncate">{member.name}</span>
                    <span className="shrink-0 text-xs font-semibold text-violet">WhatsApp</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            href={`${sectionHref(spaceId, "miembros")}?filtro=nuevos`}
            className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
          >
            Ver los socios nuevos <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}
