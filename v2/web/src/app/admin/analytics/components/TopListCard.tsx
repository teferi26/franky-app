"use client";

import { cn } from "@/lib/utils";

type Item = {
  label: string;
  count: number;
  /** Optional secondary text (e.g. comunidad, city). */
  sublabel?: string;
  /** Optional 0..100 progress bar overlay (otherwise computed from max). */
  pct?: number;
};

export default function TopListCard({
  items,
  emptyLabel = "Sin datos",
  formatter,
  className,
  numbered = true,
}: {
  items: Item[];
  emptyLabel?: string;
  formatter?: (n: number) => string;
  className?: string;
  numbered?: boolean;
}) {
  if (!items?.length) {
    return (
      <div className={cn("rounded-xl border border-border bg-bg-secondary/40 p-6 text-center text-sm text-text-muted", className)}>
        {emptyLabel}
      </div>
    );
  }

  const max = Math.max(...items.map((i) => i.count));
  const fmt = formatter ?? ((n: number) => n.toLocaleString("es-ES"));

  return (
    <ol className={cn("space-y-1", className)}>
      {items.map((item, i) => {
        const pct = Math.min(100, Math.max(0, item.pct ?? (max > 0 ? (item.count / max) * 100 : 0)));
        return (
          <li key={`${item.label}-${i}`} className="relative">
            <div className="absolute inset-y-0 left-0 rounded-lg bg-bg-secondary transition-[width] duration-500"
                 style={{ width: `${pct}%` }} aria-hidden />
            <div className="relative flex items-center gap-3 rounded-lg px-3 py-2">
              {numbered && (
                <span className="tabular w-6 shrink-0 text-xs font-semibold text-text-muted">
                  {i + 1}.
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-medium text-text-primary">{item.label}</div>
                {item.sublabel && (
                  <div className="break-words text-xs text-text-muted">{item.sublabel}</div>
                )}
              </div>
              <span className="tabular shrink-0 text-sm font-semibold text-text-primary">
                {fmt(item.count)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
