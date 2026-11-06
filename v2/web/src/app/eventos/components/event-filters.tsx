"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { Search, SlidersHorizontal, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVENT_CATEGORIES, EVENT_CATEGORY_ORDER } from "./event-category";
import { cn } from "@/lib/utils";

interface Props {
  cities: string[];
  categoryCounts: Record<string, number>;
  totalCount: number;
}

const DATE_RANGES = [
  { key: "", label: "Todos" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mes" },
  { key: "trimestre", label: "3 meses" },
];

const SORT_OPTIONS = [
  { key: "", label: "Próximos (fecha asc)" },
  { key: "fecha-desc", label: "Fecha descendente" },
  { key: "titulo", label: "Nombre (A-Z)" },
];

/** Chip de filtro (v3): contorno hairline en reposo, casi negro cuando está activo. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium",
        "transition-[color,background-color,border-color] duration-200 ease-[var(--ease-out-quart)] cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/30",
        active
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}

const selectClass =
  "h-10 rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-violet/30 hover:border-text-primary/30";

export default function EventFilters({ cities, categoryCounts, totalCount }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showAdvanced, setShowAdvanced] = useState(() => {
    return !!(searchParams.get("fecha") || searchParams.get("gratis") || searchParams.get("pasados"));
  });

  const get = (key: string) => searchParams.get(key) || "";

  const buildUrl = useCallback(
    (overrides: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(overrides)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      return `/eventos?${params.toString()}`;
    },
    [searchParams]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const params = new URLSearchParams(searchParams.toString());
      // Solo se actualizan los campos del formulario
      const formKeys = ["buscar", "ciudad"];
      for (const key of formKeys) {
        const v = (fd.get(key) || "").toString().trim();
        if (v) params.set(key, v);
        else params.delete(key);
      }
      router.push(`/eventos?${params.toString()}`);
    },
    [router, searchParams]
  );

  const setParam = useCallback(
    (key: string, value: string) => {
      router.push(buildUrl({ [key]: value }));
    },
    [router, buildUrl]
  );

  const clearAll = () => router.push("/eventos");

  const activeCategory = get("categoria");
  const activeDate = get("fecha");
  const isFreOnly = get("gratis") === "1";
  const showPast = get("pasados") === "1";
  const hasFilters = searchParams.toString().length > 0;

  const advancedCount = [
    activeDate ? 1 : 0,
    isFreOnly ? 1 : 0,
    showPast ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="mb-8">
      {/* Fila superior: buscador + ciudad + acción */}
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
            <Input
              name="buscar"
              type="text"
              defaultValue={get("buscar")}
              placeholder="Buscar eventos"
              className="pl-10"
            />
          </div>
          <select
            name="ciudad"
            aria-label="Filtrar eventos por ciudad"
            defaultValue={get("ciudad")}
            className={cn(selectClass, "min-w-[180px]")}
          >
            <option value="">Todas las ciudades</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Button type="submit" variant="dark" className="shrink-0">
            <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Buscar
          </Button>
          {hasFilters && (
            <Button type="button" variant="ghost" onClick={clearAll} className="shrink-0">
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Limpiar
            </Button>
          )}
        </div>
      </form>

      {/* Categorías en chips */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Chip active={!activeCategory} onClick={() => setParam("categoria", "")}>
          Todos <span className="text-text-muted tabular">{totalCount}</span>
        </Chip>
        {EVENT_CATEGORY_ORDER.map((key) => {
          const count = categoryCounts[key] || 0;
          if (count === 0) return null;
          const cat = EVENT_CATEGORIES[key];
          const Icon = cat.icon;
          const active = activeCategory === key;
          return (
            <Chip key={key} active={active} onClick={() => setParam("categoria", active ? "" : key)}>
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {cat.plural}
              <span className={cn("tabular", active ? "text-bg-primary/70" : "text-text-muted")}>{count}</span>
            </Chip>
          );
        })}
      </div>

      {/* Más filtros */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Más filtros
        {advancedCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-text-primary px-1.5 text-[11px] font-semibold text-bg-primary tabular">
            {advancedCount}
          </span>
        )}
        {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>

      {showAdvanced && (
        <div className="mt-4 space-y-5 border-t border-border-light pt-5 animate-fade-in">
          <div>
            <p className="eyebrow mb-2.5 text-text-muted">Fecha</p>
            <div className="flex flex-wrap gap-2">
              {DATE_RANGES.map((r) => (
                <Chip
                  key={r.key}
                  active={activeDate === r.key || (!activeDate && !r.key)}
                  onClick={() => setParam("fecha", activeDate === r.key ? "" : r.key)}
                >
                  {r.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox"
                checked={isFreOnly}
                onChange={(e) => setParam("gratis", e.target.checked ? "1" : "")}
                className="h-4 w-4 rounded border-border accent-[var(--color-violet)]"
              />
              <span className="text-sm text-text-secondary">Solo eventos gratuitos</span>
            </label>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox"
                checked={showPast}
                onChange={(e) => setParam("pasados", e.target.checked ? "1" : "")}
                className="h-4 w-4 rounded border-border accent-[var(--color-violet)]"
              />
              <span className="text-sm text-text-secondary">Incluir eventos pasados</span>
            </label>
          </div>

          <div>
            <p className="eyebrow mb-2.5 text-text-muted">Ordenar por</p>
            <select
              value={get("orden")}
              onChange={(e) => setParam("orden", e.target.value)}
              aria-label="Ordenar eventos"
              className={selectClass}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
