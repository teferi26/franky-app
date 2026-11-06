"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type Datum = { label: string; count: number };

// Violeta para lo principal y una escala de grises para el resto: sin arcoíris.
const PALETTE = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#9ca3af", "#b0b5bd", "#c7cbd1", "#dde0e4"];

export default function DistributionPieChart({
  data,
  height = 260,
  labelFormatter,
}: {
  data: Datum[];
  height?: number;
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

  const fmt = labelFormatter ?? ((s: string) => s);
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              strokeWidth={2}
              stroke="var(--color-bg-primary)"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-bg-primary)",
              color: "var(--color-text-primary)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v) => [Number(v).toLocaleString("es-ES"), ""]}
              labelFormatter={(l) => fmt(String(l))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend with raw counts + percentages */}
      <ul className="space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 break-words text-text-secondary">{fmt(d.label)}</span>
            <span className="tabular font-medium text-text-primary">
              {d.count.toLocaleString("es-ES")}
            </span>
            <span className="tabular w-12 text-right text-xs text-text-muted">
              {total ? ((d.count / total) * 100).toFixed(1) : "0"}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
