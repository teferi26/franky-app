"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; count: number; cumulative?: number };

// Convierte una fecha ISO (YYYY-MM-DD o ISO completo) en un Date local sin
// desplazamiento de zona horaria: tomamos solo la parte de fecha y la
// construimos con componentes locales, igual que hacia parseISO.
function parseLocalDate(iso: string): Date {
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return new Date(iso);
  return new Date(y, m - 1, d);
}

const shortDateFmt = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});
const fullDateFmt = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function TimeSeriesChart({
  data,
  showCumulative = false,
  height = 280,
  color = "#8b5cf6",
  label = "Registros",
}: {
  data: Point[];
  showCumulative?: boolean;
  height?: number;
  color?: string;
  label?: string;
}) {
  if (!data?.length) {
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
      // "5 jun" (sin punto en la abreviatura del mes, como antes)
      return shortDateFmt.format(parseLocalDate(iso)).replace(".", "");
    } catch {
      return iso;
    }
  };
  const fmtFullDate = (iso: string) => {
    try {
      // "jueves, 5 de junio 2026"
      return fullDateFmt.format(parseLocalDate(iso));
    } catch {
      return iso;
    }
  };

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
              String(name) === "count" ? label : "Acumulado",
            ]}
          />
          {/* Relleno plano: el sistema v3 no usa degradados en las gráficas */}
          <Area
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.08}
          />
          {showCumulative && (
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              fill="transparent"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
