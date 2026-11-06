"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import { localDate } from "@/lib/pro/format";
import {
  daysUntil,
  uniCalendar,
  valleyOfferPrice,
  welcomePackOf,
  type UniMoment,
} from "@/lib/pro/courts-growth";
import { cn } from "@/lib/utils";
import { Panel, Pill } from "../../kit";
import { sectionHref } from "../../shell";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { shortDate } from "./state";
import { WelcomePackDrawer } from "./welcome-pack";

/**
 * El curso de las universidades de la zona, momento a momento, con la
 * campaña que toca en cada uno y el botón que la lanza. Las fechas son las
 * habituales del calendario universitario español (la Semana Santa se
 * calcula cada año); cada universidad publica el suyo.
 */
export function UniCalendarPanel({ limit = 5 }: { limit?: number }) {
  const { data, now, vertical, spaceId } = usePro();
  const today = localDate(now);
  const kind = vertical.id === "coworking" ? "coworking" : "sports_facility";
  const moments = uniCalendar(today, kind).slice(0, limit);
  const [welcome, setWelcome] = React.useState(false);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const packDone = Boolean(welcomePackOf(data, today));

  const launch = (m: UniMoment) => {
    if (m.action.kind === "welcome") setWelcome(true);
    else if (m.action.kind === "offer") {
      const price = valleyOfferPrice(data.resources, today);
      setOffer({
        what: m.action.title,
        date: m.from > today ? m.from : today,
        from: 10 * 60,
        to: 14 * 60,
        priceCents: price ?? undefined,
        slots: kind === "coworking" ? 10 : 6,
      });
    }
  };

  return (
    <>
      <Panel
        title="Calendario universitario"
        description="Lo que viven tus estudiantes en cada momento del curso y qué campaña encaja."
        flush
      >
        <ol className="divide-y divide-border-light">
          {moments.map((m, i) => {
            const current = m.from <= today;
            const days = daysUntil(today, m.from);
            const done = m.action.kind === "welcome" && packDone;
            return (
              <li key={m.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
                <span className="flex w-4 shrink-0 flex-col items-center pt-1.5" aria-hidden>
                  <span className={cn("h-2.5 w-2.5 rounded-full", current ? "bg-violet" : "border border-border bg-bg-primary")} />
                  {i < moments.length - 1 ? <span className="mt-1 w-px flex-1 bg-border-light" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold">{m.title}</span>
                    {current ? (
                      <Pill tone="violet">Ahora</Pill>
                    ) : (
                      <span className="text-xs text-text-muted">
                        {shortDate(m.from)}
                        {days <= 45 ? `, en ${days} ${days === 1 ? "día" : "días"}` : ""}
                      </span>
                    )}
                    {m.demand === "alta" ? <Pill tone="warning">Más demanda</Pill> : m.demand === "baja" ? <Pill>Más flojo</Pill> : null}
                  </span>
                  <span className="mt-0.5 block text-[0.82rem] text-text-muted">{m.what}</span>
                  <span className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-[0.82rem] font-medium text-text-secondary">{m.idea}</span>
                    {done ? (
                      <Pill tone="success">Hecho</Pill>
                    ) : m.action.kind === "section" ? (
                      <Link
                        href={`${sectionHref(spaceId, m.action.section)}${m.action.query ?? ""}`}
                        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
                      >
                        {m.cta} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.9} />
                      </Link>
                    ) : (
                      <Button size="sm" variant={current ? "dark" : "outline"} className="min-h-10" onClick={() => launch(m)}>
                        {m.cta}
                      </Button>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </Panel>
      <WelcomePackDrawer open={welcome} onClose={() => setWelcome(false)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </>
  );
}
