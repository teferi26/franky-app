"use client";

import * as React from "react";
import { LineChart } from "lucide-react";
import { money } from "@/lib/pro/format";
import { PRIVACY_MIN_GROUP, zoneObservatory } from "@/lib/pro/university";
import type { ProUniMarketRoom, UniHousing } from "@/lib/pro/university-types";
import { Empty, Meter, Panel } from "../../kit";
import { HiddenGroup } from "./ui";

/* ------------------------------------------------------------------ */
/* Observatorio de precios por zona                                    */
/* ------------------------------------------------------------------ */

export function PriceObservatory({ market }: { market: ProUniMarketRoom[] }) {
  const zones = zoneObservatory(market, "room");
  const top = Math.max(1, ...zones.filter((z) => !z.hidden).map((z) => z.medianCents));
  return (
    <Panel
      title="Precio de una habitación por zona"
      description={`Mediana de habitaciones verificadas. Zonas con menos de ${PRIVACY_MIN_GROUP} no se muestran.`}
    >
      {zones.length ? (
        <ul className="flex flex-col gap-3">
          {zones.map((z) => (
            <li key={z.zone} className="text-sm">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  {z.zone}
                  {z.hidden ? null : <span className="text-xs text-text-muted"> · {z.medianMinutes} min al campus</span>}
                </span>
                {z.hidden ? <HiddenGroup /> : <span className="font-semibold tabular">{money(z.medianCents, { round: true })}</span>}
              </div>
              {z.hidden ? null : <Meter value={z.medianCents} max={top} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">Cuando haya habitaciones verificadas en varias zonas verás aquí su precio mediano.</p>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Distancia y precio                                                  */
/* ------------------------------------------------------------------ */

const W = 640;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 36, left: 52 };

/**
 * Cada punto es una habitación verificada: a la derecha, más lejos del
 * campus; arriba, más cara. Los pisos de la lista se marcan en oscuro.
 */
export function DistancePriceMap({
  market,
  listings,
  onPick,
}: {
  market: ProUniMarketRoom[];
  listings: UniHousing[];
  onPick: (id: string) => void;
}) {
  const rooms = market.filter((r) => r.kind === "room");
  const withData = listings.filter((h) => h.minutesToCampus && h.priceCents < 80000);
  if (!rooms.length && !withData.length) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
        <Empty icon={LineChart} title="Aún no hay pisos verificados" body="Cuando verifiques pisos, aquí verás de un vistazo cuánto cuestan según lo lejos que estén del campus." />
      </div>
    );
  }
  const prices = [...rooms.map((r) => r.priceCents), ...withData.map((h) => h.priceCents)];
  const minutes = [...rooms.map((r) => r.minutesToCampus), ...withData.map((h) => h.minutesToCampus ?? 0)];
  const pMin = Math.floor(Math.min(...prices) / 5000) * 5000;
  const pMax = Math.ceil(Math.max(...prices) / 5000) * 5000;
  const mMax = Math.ceil(Math.max(...minutes) / 5) * 5;
  const x = (m: number) => PAD.left + (m / mMax) * (W - PAD.left - PAD.right);
  const y = (c: number) => PAD.top + (1 - (c - pMin) / Math.max(1, pMax - pMin)) * (H - PAD.top - PAD.bottom);
  const priceTicks = Array.from({ length: 4 }, (_, i) => pMin + ((pMax - pMin) * i) / 3);
  const minuteTicks = Array.from({ length: mMax / 5 + 1 }, (_, i) => i * 5);

  return (
    <Panel title="Distancia y precio" description="Cada punto es una habitación verificada. Toca un piso de tu lista para abrirlo.">
      <div className="overflow-x-auto pro-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[480px]" role="img" aria-label="Precio de las habitaciones según los minutos al campus">
          {priceTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border-light" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-text-muted text-[11px] tabular">
                {Math.round(t / 100)} €
              </text>
            </g>
          ))}
          {minuteTicks.map((m) => (
            <text key={m} x={x(m)} y={H - PAD.bottom + 18} textAnchor="middle" className="fill-text-muted text-[11px] tabular">
              {m} min
            </text>
          ))}
          {rooms.map((r, i) => (
            <circle key={i} cx={x(r.minutesToCampus)} cy={y(r.priceCents)} r={4} className="fill-violet" fillOpacity={0.28} />
          ))}
          {withData.map((h) => (
            <g key={h.id} role="button" tabIndex={0} aria-label={`${h.title}, ${money(h.priceCents, { round: true })}`} onClick={() => onPick(h.id)} onKeyDown={(e) => e.key === "Enter" && onPick(h.id)} className="cursor-pointer focus:outline-none">
              <circle cx={x(h.minutesToCampus ?? 0)} cy={y(h.priceCents)} r={14} fill="transparent" />
              <circle cx={x(h.minutesToCampus ?? 0)} cy={y(h.priceCents)} r={6} className="fill-text-primary stroke-bg-primary" strokeWidth={2} />
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet/30" aria-hidden /> Habitaciones verificadas del campus
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-text-primary" aria-hidden /> Pisos de esta lista
        </span>
      </div>
    </Panel>
  );
}
