"use client";

import type { CSSProperties } from "react";
import {
  BarChart3, Users, AlertTriangle, UserPlus, BookOpen, Building2,
  Trophy, Newspaper, CalendarDays, Home, Star, CheckCircle, Trash2, Monitor, Inbox, ScrollText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Navegación del panel admin (sistema v3).
 *
 * En escritorio es una columna lateral fija con las secciones agrupadas por
 * lo que hacen: lo que se mira a diario (comunidad), lo que se edita de vez
 * en cuando (catálogo) y lo que es cola de trabajo (gestión). En móvil se
 * reduce a un desplegable nativo con los mismos grupos, así no hay tiras
 * horizontales que arrastrar a ciegas.
 */

type Item = {
  value: string;
  label: string;
  icon: LucideIcon;
  /** Un contador que exige atención se pinta en rojo, no en gris. */
  urgent?: boolean;
  /** Secciones que el analista no puede usar. */
  adminOnly?: boolean;
};

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Comunidad",
    items: [
      { value: "overview", label: "Resumen", icon: BarChart3 },
      { value: "users", label: "Usuarios", icon: Users },
      { value: "inbox", label: "Buzón", icon: Inbox },
      { value: "reports", label: "Reportes", icon: AlertTriangle, urgent: true },
      { value: "audit", label: "Auditoría", icon: ScrollText },
      { value: "party", label: "Fiesta · OBS", icon: Monitor, adminOnly: true },
      { value: "propietario", label: "Equipo", icon: UserPlus, adminOnly: true },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { value: "careers", label: "Carreras", icon: BookOpen },
      { value: "universities", label: "Universidades", icon: Building2 },
      { value: "scholarships", label: "Becas", icon: Trophy },
      { value: "news", label: "Noticias", icon: Newspaper },
      { value: "events", label: "Eventos", icon: CalendarDays },
      { value: "accommodations", label: "Alojamiento", icon: Home },
      { value: "leisure", label: "Ocio", icon: Star },
    ],
  },
  {
    title: "Gestión",
    items: [
      { value: "suggestions", label: "Sugerencias", icon: CheckCircle, adminOnly: true },
      { value: "discarded", label: "Papelera", icon: Trash2, adminOnly: true },
    ],
  },
];

export function AdminNav({
  active,
  onSelect,
  readOnly,
  pendingReports,
  discarded,
}: {
  active: string;
  onSelect: (value: string) => void;
  readOnly?: boolean;
  pendingReports: number;
  discarded: number;
}) {
  const countFor = (value: string) =>
    value === "reports" ? pendingReports : value === "discarded" ? discarded : 0;
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((i) => !(i.adminOnly && readOnly)),
  })).filter((g) => g.items.length);
  let index = 0;

  return (
    <nav aria-label="Secciones del panel" className="lg:sticky lg:top-24">
      {/* Móvil: desplegable nativo con los mismos grupos. */}
      <label className="block lg:hidden">
        <span className="eyebrow">Sección</span>
        <select
          value={active}
          onChange={(e) => onSelect(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-[15px] font-medium text-text-primary focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15"
        >
          {groups.map((group) => (
            <optgroup key={group.title} label={group.title}>
              {group.items.map((item) => {
                const count = countFor(item.value);
                return (
                  <option key={item.value} value={item.value}>
                    {item.label}
                    {count > 0 ? ` (${count})` : ""}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
      </label>

      {/* Escritorio: columna lateral. */}
      <div className="hidden space-y-6 lg:block">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="eyebrow mb-2 px-3">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = active === item.value;
                const count = countFor(item.value);
                const i = index++;
                return (
                  <li key={item.value} style={{ "--i": i } as CSSProperties} className="animate-list-in">
                    <button
                      type="button"
                      onClick={() => onSelect(item.value)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-[background-color,color] duration-200",
                        isActive
                          ? "bg-bg-secondary font-semibold text-text-primary"
                          : "font-medium text-text-secondary hover:bg-bg-secondary/70 hover:text-text-primary"
                      )}
                    >
                      <item.icon
                        className={cn("h-4 w-4 shrink-0", isActive ? "text-violet" : "text-text-muted group-hover:text-text-primary")}
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            "tabular shrink-0 text-xs font-semibold",
                            item.urgent ? "text-error" : "text-text-muted"
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
