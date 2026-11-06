"use client";

import { CountUp } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "flat";

type Props = {
  label: string;
  value: number | string | null | undefined;
  loading?: boolean;
  formatter?: (v: number | string) => string;
  /** Current period absolute count (used to compute delta vs previous). */
  current?: number;
  /** Previous period absolute count. */
  previous?: number;
  /** Override the delta % directly (skips current/previous math). */
  deltaPct?: number;
  /** Subtitle shown under the value. */
  caption?: string;
  /**
   * Acento heredado del diseño anterior. Se mantiene por compatibilidad con las
   * pestañas que aún lo pasan, pero ya no pinta fondos de color: en el sistema
   * v3 las cifras van sobre blanco y el color queda para los estados.
   */
  accent?: "violet" | "fuchsia" | "emerald" | "amber" | "rose" | "slate";
  /** Compact card (smaller font, narrower). */
  compact?: boolean;
  /** Índice para la cascada de entrada. */
  index?: number;
};

function defaultFormatter(v: number | string): string {
  if (typeof v === "string") return v;
  if (Number.isFinite(v)) return v.toLocaleString("es-ES");
  return String(v);
}

function computeTrend(current?: number, previous?: number, deltaPct?: number): { pct: number | null; trend: Trend } {
  if (deltaPct !== undefined && Number.isFinite(deltaPct)) {
    return { pct: deltaPct, trend: deltaPct > 0.5 ? "up" : deltaPct < -0.5 ? "down" : "flat" };
  }
  if (current === undefined || previous === undefined || !Number.isFinite(current) || !Number.isFinite(previous)) return { pct: null, trend: "flat" };
  // A zero baseline has no defined percentage change; +100% would be invented.
  if (previous === 0) return { pct: null, trend: current > 0 ? "up" : "flat" };
  const pct = ((current - previous) / previous) * 100;
  return { pct, trend: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat" };
}

export default function KpiCard({
  label,
  value,
  loading = false,
  formatter,
  current,
  previous,
  deltaPct,
  caption,
  compact = false,
  index,
}: Props) {
  const available = value !== null && value !== undefined && (typeof value !== 'number' || Number.isFinite(value));
  const display = available ? (formatter ?? defaultFormatter)(value!) : 'Sin dato';
  const { pct, trend } = computeTrend(current, previous, deltaPct);
  // Solo contamos cifras limpias: si hay formateador propio (importes, %) se
  // pinta el texto ya formateado para no reescribir su lógica.
  const counts = available && typeof value === "number" && !formatter;

  return (
    <div
      style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}
      className={cn("min-w-0 border-l border-border pl-4", index !== undefined && "animate-list-in")}
    >
      <p className="eyebrow">{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "tabular font-heading font-extrabold tracking-tight text-text-primary",
            compact ? "text-2xl" : "text-3xl sm:text-4xl"
          )}
        >
          {loading ? (
            <>
              <span aria-hidden className="skeleton-shimmer inline-block h-8 w-20 rounded bg-bg-secondary" />
              <span className="sr-only">Cargando</span>
            </>
          ) : (
            <span aria-label={available ? undefined : 'Dato no disponible'}>
              {/* key: CountUp solo anima al montar, así refleja los cambios de filtro */}
              {counts ? <CountUp key={value as number} value={value as number} /> : display}
            </span>
          )}
        </span>
        {!loading && available && pct !== null && (
          <Badge
            variant={trend === "up" ? "success" : trend === "down" ? "destructive" : "outline"}
            className="tabular"
            aria-label={`Variación ${pct.toFixed(1)}% vs período anterior`}
          >
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(1)}%
          </Badge>
        )}
      </div>
      {!loading && available && previous === 0 && current !== undefined && current > 0 && (
        <p className="mt-1 text-xs text-text-muted">Periodo anterior: 0 · variación porcentual no calculable</p>
      )}
      {caption && <p className="mt-1 text-xs text-text-muted">{caption}</p>}
    </div>
  );
}
