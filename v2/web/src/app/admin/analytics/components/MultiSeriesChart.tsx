"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export type ChartSeries = { key: string; label: string; color: string };

/**
 * Gráfica de área con N series sobre el mismo eje temporal (p. ej. leads de
 * Tafa vs Pau). `data` son filas { date, [serie.key]: number }.
 */
export default function MultiSeriesChart({
  data,
  series,
  height = 280,
}: {
  data: Record<string, string | number>[];
  series: ChartSeries[];
  height?: number;
}) {
  if (!data?.length || !series.length) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-border bg-bg-secondary/40 text-sm text-text-muted"
        style={{ height }}
      >
        Sin datos para este período
      </div>
    );
  }

  const fmtDate = (iso: string) => {
    try {
      return format(parseISO(iso), "d MMM", { locale: es });
    } catch {
      return iso;
    }
  };
  const fmtFullDate = (iso: string) => {
    try {
      return format(parseISO(iso), "EEEE, d 'de' MMMM yyyy", { locale: es });
    } catch {
      return iso;
    }
  };
  const labelByKey = Object.fromEntries(series.map((s) => [s.key, s.label]));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            stroke="var(--color-text-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={20}
          />
          <YAxis
            stroke="var(--color-text-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={40}
          />
          <Tooltip
            labelFormatter={(l) => fmtFullDate(String(l))}
            contentStyle={{
              backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            formatter={(value, name) => [
              Number(value).toLocaleString("es-ES"),
              labelByKey[String(name)] ?? String(name),
            ]}
          />
          <Legend
            formatter={(value) => labelByKey[String(value)] ?? String(value)}
            wrapperStyle={{ fontSize: 12 }}
          />
          {/* Relleno plano: el sistema v3 no usa degradados en las gráficas */}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.08}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
