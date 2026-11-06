"use client";

import { useEffect, useId, useState } from "react";
import { Calendar, X, ChevronDown, RefreshCw } from "lucide-react";
import { useAnalyticsFilters, type RangeKey } from "../hooks/useAnalyticsFilters";
import { cn } from "@/lib/utils";
import { analyticsPeriodLabel } from '@/lib/analytics-period';
import { controlClass } from '../../components/panel-ui';

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
  { value: "12m", label: "12 meses" },
  { value: "all", label: "Histórico" },
];

const GENDER_OPTIONS = [
  { value: "hombre", label: "Hombre" },
  { value: "mujer", label: "Mujer" },
  { value: "no_binario", label: "No binario" },
  { value: "prefiero_no_decirlo", label: "Prefiere no decir" },
];

const AGE_OPTIONS = [
  { value: "<18", label: "<18" },
  { value: "18-21", label: "18-21" },
  { value: "22-25", label: "22-25" },
  { value: "26-30", label: "26-30" },
  { value: "30+", label: "30+" },
];

const STUDENT_TYPE_OPTIONS = [
  { value: "bachillerato", label: "Bachillerato" },
  { value: "fp", label: "FP" },
  { value: "universidad", label: "Universidad" },
  { value: "master", label: "Máster" },
  { value: "otro", label: "Otro" },
];

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6];

const COMUNIDADES = [
  "Andalucía", "Aragón", "Asturias", "Baleares", "Canarias",
  "Cantabria", "Castilla-La Mancha", "Castilla y León", "Cataluña",
  "Extremadura", "Galicia", "La Rioja", "Madrid", "Murcia",
  "Navarra", "País Vasco", "Valencia", "Ceuta", "Melilla",
];

type UniOption = { id: string; name: string; short_name: string | null; city: string };

export default function AnalyticsFiltersBar({ onRefresh }: { onRefresh?: () => void }) {
  const { filters, setFilters } = useAnalyticsFilters();
  const [expanded, setExpanded] = useState(false);

  // Universidad y ciudad existían en el hook, en la URL y en el SQL, pero no
  // tenían ningún control: eran filtros muertos, alcanzables solo escribiendo
  // la query a mano. El catálogo se pide una vez, al desplegar los filtros.
  const [unis, setUnis] = useState<UniOption[]>([]);
  const [catalogueLoaded, setCatalogueLoaded] = useState(false);
  const [catalogueError, setCatalogueError] = useState(false);
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);
  useEffect(() => {
    if (!expanded || catalogueLoaded) return;
    const controller = new AbortController();
    setCatalogueError(false);
    (async () => {
      try {
        const res = await fetch("/api/locations/structure", { signal: controller.signal });
        if (!res.ok) throw new Error('catalogue_unavailable');
        // El endpoint devuelve un árbol comunidad → ciudad → universidades;
        // aquí solo hace falta la lista plana con su ciudad.
        const data = (await res.json()) as {
          structure?: {
            cities?: { city: string; universities?: { id: string; name: string; short_name: string | null }[] }[];
          }[];
        };
        if (!Array.isArray(data.structure)) throw new Error('invalid_catalogue');
        const list: UniOption[] = [];
        for (const comunidad of data.structure ?? []) {
          for (const c of comunidad.cities ?? []) {
            for (const u of c.universities ?? []) {
              list.push({ id: u.id, name: u.name, short_name: u.short_name, city: c.city });
            }
          }
        }
        if (!controller.signal.aborted) { setUnis(list); setCatalogueLoaded(true); }
      } catch {
        if (!controller.signal.aborted) setCatalogueError(true);
      }
    })();
    return () => controller.abort();
  }, [expanded, catalogueLoaded, catalogueAttempt]);

  const cityOptions = Array.from(new Set(unis.map((u) => u.city).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "es"));

  const activeCount =
    filters.comunidad.length +
    filters.city.length +
    filters.university.length +
    filters.gender.length +
    filters.age.length +
    filters.studentType.length +
    filters.year.length;

  const clearAll = () =>
    setFilters({
      range: "30d",
      comunidad: [],
      city: [],
      university: [],
      gender: [],
      age: [],
      studentType: [],
      year: [],
    });

  return (
    <div className={cn("-mx-4 mb-6 border-b border-border-light bg-bg-primary/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8", !expanded && 'sticky top-20 z-30')}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range pills */}
        <label className="min-w-0 flex-1 sm:hidden">
          <span className="sr-only">Periodo del análisis</span>
          <select value={filters.range} onChange={event => setFilters({ range: event.target.value as RangeKey })} className={controlClass}>
            {RANGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            {filters.range.startsWith('custom:') && <option value={filters.range}>{analyticsPeriodLabel(filters.range)}</option>}
          </select>
        </label>
        <div className="hidden items-center gap-1 rounded-2xl border border-border p-1 sm:flex" aria-label="Periodo del análisis">
          <Calendar className="ml-2 h-4 w-4 text-text-muted" strokeWidth={1.75} aria-hidden />
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilters({ range: opt.value })}
              aria-pressed={filters.range === opt.value}
              className={cn(
                "min-h-11 rounded-xl px-3 py-2 text-xs font-medium transition-[background-color,color] duration-200",
                filters.range === opt.value
                  ? "bg-text-primary text-bg-primary"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Expand / collapse */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="analytics-profile-filters"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-200 hover:border-text-primary/40 hover:text-text-primary"
        >
          Filtros
          {activeCount > 0 && (
            <span className="tabular inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-text-primary px-1 text-[10px] font-bold text-bg-primary">
              {activeCount}
            </span>
          )}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")}
            strokeWidth={1.75}
          />
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-text-muted transition-colors duration-200 hover:text-error"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            <span className="sr-only sm:not-sr-only">Limpiar filtros</span>
          </button>
        )}

        <div className="hidden flex-1 sm:block" />

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors duration-200 hover:border-text-primary/40 hover:text-text-primary"
            aria-label="Actualizar indicadores"
            title="Actualizar indicadores"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {expanded && (
        <div id="analytics-profile-filters" className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <FilterGroup
            title="Comunidad autónoma"
            options={COMUNIDADES.map((c) => ({ value: c, label: c }))}
            selected={filters.comunidad}
            onChange={(next) => setFilters({ comunidad: next })}
          />
          <FilterGroup
            title="Género"
            options={GENDER_OPTIONS}
            selected={filters.gender}
            onChange={(next) => setFilters({ gender: next })}
          />
          <FilterGroup
            title="Edad"
            options={AGE_OPTIONS}
            selected={filters.age}
            onChange={(next) => setFilters({ age: next })}
          />
          <FilterGroup
            title="Tipo de estudiante"
            options={STUDENT_TYPE_OPTIONS}
            selected={filters.studentType}
            onChange={(next) => setFilters({ studentType: next })}
          />
          <FilterGroup
            title="Año (universidad)"
            options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: `${y}º` }))}
            selected={filters.year.map(String)}
            onChange={(next) => setFilters({ year: next.map((s) => parseInt(s, 10)).filter(Number.isFinite) })}
          />
          {unis.length > 0 && (
            <FilterGroup
              title="Universidad"
              options={unis.map((u) => ({ value: u.id, label: u.short_name ? `${u.short_name} · ${u.name}` : u.name }))}
              selected={filters.university}
              onChange={(next) => setFilters({ university: next })}
            />
          )}
          {!catalogueLoaded && <div className="rounded-xl border border-border bg-bg-secondary/40 p-4 text-sm text-text-secondary" role={catalogueError ? 'alert' : 'status'}>
            {catalogueError ? <><p>No se pudo cargar el filtro de universidad y ciudad.</p><button type="button" onClick={() => setCatalogueAttempt(a => a + 1)} className="mt-3 min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-secondary">Reintentar catálogo</button></> : 'Cargando universidades y ciudades…'}
          </div>}
          {catalogueLoaded && !unis.length && <p className="p-4 text-sm text-text-muted">No hay universidades y ciudades disponibles en el catálogo.</p>}
          {cityOptions.length > 0 && (
            <FilterGroup
              title="Ciudad"
              options={cityOptions.map((c) => ({ value: c, label: c }))}
              selected={filters.city}
              onChange={(next) => setFilters({ city: next })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const searchId = useId();
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  const matches = options.filter(option => normalize(option.label).includes(normalize(search)) || selected.includes(option.value));
  const visible = matches.filter(option => selected.includes(option.value)).concat(matches.filter(option => !selected.includes(option.value)).slice(0, 20));
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  };
  return (
    <fieldset className="min-w-0 rounded-xl border border-border bg-bg-primary p-3">
      <legend className="eyebrow px-1">
        {title}
      </legend>
      {options.length > 8 && <div className="mb-3"><label htmlFor={searchId} className="sr-only">Buscar en {title}</label><input id={searchId} value={search} onChange={event => setSearch(event.target.value)} placeholder={`Buscar en ${title.toLocaleLowerCase('es')}…`} className={controlClass} /></div>}
      <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
        {visible.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              aria-pressed={active}
              disabled={!active && selected.length >= 30}
              className={cn(
                "min-h-11 break-words rounded-xl border px-2.5 py-2 text-left text-xs transition-[background-color,color,border-color] duration-200 disabled:opacity-50",
                active
                  ? "border-text-primary bg-text-primary font-semibold text-bg-primary"
                  : "border-border text-text-secondary hover:border-text-primary/40 hover:text-text-primary"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {!visible.length && <p role="status" className="text-xs text-text-muted">No hay coincidencias.</p>}
      {matches.length > visible.length && <p className="mt-2 text-xs text-text-muted">Mostrando {visible.length} de {matches.length}. Busca para encontrar más opciones.</p>}
      {selected.length >= 30 && <p className="mt-2 text-xs text-text-muted">Puedes seleccionar hasta 30 opciones por filtro.</p>}
    </fieldset>
  );
}
