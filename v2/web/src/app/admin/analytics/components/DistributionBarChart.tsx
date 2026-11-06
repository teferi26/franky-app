"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Datum = { label: string; count: number };

// Violeta para lo principal y una escala de grises para el resto: sin arcoíris.
const PALETTE = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#9ca3af", "#b0b5bd", "#c7cbd1", "#dde0e4"];

export default function DistributionBarChart({
  data,
  height = 280,
  horizontal = true,
  labelFormatter,
}: {
  data: Datum[];
  height?: number;
  horizontal?: boolean;
  labelFormatter?: (label: string) => string;
}) {
  if (!data?.length) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-border bg-bg-secondary/40 text-sm text-text-muted"
        style={{ height }}
      >
        Sin datos
      </div>
    );
  }

  // Sort descending by count for visual hierarchy
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const fmt = labelFormatter ?? ((s: string) => s);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={sorted}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 5, right: 20, left: horizontal ? 0 : -20, bottom: 0 }}
        >
          {horizontal ? (
            <>
              <YAxis
                type="category"
                dataKey="label"
                tickFormatter={fmt}
                stroke="var(--color-text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <XAxis type="number" hide />
            </>
          ) : (
            <>
              <XAxis
                dataKey="label"
                tickFormatter={fmt}
                stroke="var(--color-text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={60}
              />
              <YAxis
                stroke="var(--color-text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={40}
              />
            </>
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(v) => Number(v).toLocaleString("es-ES")}
            labelFormatter={(l) => fmt(String(l))}
          />
          <Bar dataKey="count" radius={[4, 4, 4, 4]}>
            {sorted.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
