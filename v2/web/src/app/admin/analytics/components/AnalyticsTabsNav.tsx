"use client";

import {
  BarChart3,
  Users,
  GraduationCap,
  Activity,
  Euro,
  Boxes,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TabKey =
  | "overview"
  | "demographics"
  | "academic"
  | "engagement"
  | "monetization"
  | "content"
  | "security"
  | "growth";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { key: "overview", label: "Resumen", icon: BarChart3 },
  { key: "demographics", label: "Demografía", icon: Users },
  { key: "academic", label: "Académico", icon: GraduationCap },
  { key: "engagement", label: "Uso y actividad", icon: Activity },
  { key: "monetization", label: "Monetización", icon: Euro },
  { key: "content", label: "Contenido", icon: Boxes },
  { key: "security", label: "Seguridad", icon: ShieldAlert },
  { key: "growth", label: "Crecimiento", icon: TrendingUp },
];

export function readAnalyticsTab(value: string | null): TabKey {
  return TABS.find(tab => tab.key === value)?.key ?? 'overview';
}

export default function AnalyticsTabsNav({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    // Rejilla que envuelve, no tira con scroll horizontal: las 8 secciones se
    // ven de golpe en cualquier ancho. Mismo criterio que la navegación del
    // panel principal, para que las dos pantallas se comporten igual.
    <nav className="mb-6" aria-label="Secciones del dashboard analítico">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-[background-color,color,border-color] duration-200",
              active === key
                ? "border-text-primary bg-text-primary text-bg-primary"
                : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/40 hover:text-text-primary"
            )}
            aria-current={active === key ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
