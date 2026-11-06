"use client";

import { trackAcademicConsultation } from '@/lib/academic-analytics';
import { formatAcademicDuration } from '@/lib/academic-duration';
import { useState, useMemo, useCallback } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import {
  Search,
  ArrowUpDown,
  ArrowUpRight,
  MapPin,
  X,
  SlidersHorizontal,
  ChevronDown,
  Clock,
  SearchX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cutOffCourse, cutOffForView, cutOffViewLabel, cutOffViewYear, missingCutOffLabel, type CutOffView } from "@/lib/academic-year";
import CutOffYearToggle from "@/components/CutOffYearToggle";
import { Button } from "@/components/ui/button";
import { ADMISSION_MODES, admissionLocation, admissionModeLabel, matchesAdmissionSearch } from "@/lib/admission-search";

import { unpackAdmissionCatalogue, type AdmissionCareer, type AdmissionCatalogue } from "@/lib/admission-catalogue";

// Ramas de conocimiento: etiqueta larga para el selector y corta para las
// filas. Sin iconos ni colores por rama: la lista se lee por tipografía.
const branchConfig: Record<string, { label: string; shortLabel: string }> = {
  ciencias: { label: "Ciencias", shortLabel: "Ciencias" },
  ciencias_salud: { label: "Ciencias de la Salud", shortLabel: "Salud" },
  ingenieria_arquitectura: { label: "Ingeniería y Arquitectura", shortLabel: "Ingeniería" },
  artes_humanidades: { label: "Artes y Humanidades", shortLabel: "Humanidades" },
  ciencias_sociales_juridicas: { label: "CC. Sociales y Jurídicas", shortLabel: "Sociales" },
};

// Estilos compartidos de los controles del filtro (v3): borde hairline, foco
// violeta, sin fondos tintados.
const CONTROL =
  "h-10 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary transition-colors focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-violet/20";
const LABEL = "mb-2 block text-xs font-semibold text-text-primary";

/**
 * Nota del curso elegido con el conmutador. Una fila sin nota de ese curso da
 * null: nunca se rellena con la de otro curso.
 */
function viewScore(career: AdmissionCareer, view: CutOffView): number | null {
  if (career.admission_without_cutoff) return null;
  return cutOffForView(career, view)?.score ?? null;
}

/** Nota grande en cifras tabulares; el texto de apoyo va en gris. */
function Score({ score, withoutCutoff, view, className }: { score: number | null; withoutCutoff?: boolean; view: CutOffView; className?: string }) {
  if (score === null) {
    return (
      <span className={cn("text-xs font-medium text-text-muted", className)}>
        {withoutCutoff ? "Sin nota de corte" : missingCutOffLabel(view)}
      </span>
    );
  }
  return (
    <span className={cn("font-heading text-lg font-extrabold tracking-tight text-text-primary tabular", className)}>
      {score.toFixed(3)}
    </span>
  );
}

/** Barra fina de posición sobre 14: violeta sólido, sin degradado. */
function ScoreBar({ score, max = 14 }: { score: number | null; max?: number }) {
  const pct = score === null ? 0 : Math.min((score / max) * 100, 100);
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-bg-secondary" aria-hidden="true">
      <div
        style={{ width: `${pct}%` }}
        className="h-full rounded-full bg-violet transition-[width] duration-700 ease-out"
      />
    </div>
  );
}

const PAGE_SIZE = 25;

export function NotasCorteListing({
  catalogue,
  branchCounts,
  initialBuscar,
  initialRama,
  initialOrden,
  initialNotaMin,
  initialNotaMax,
  initialUniversidad = "",
  initialWithoutCutoff = false,
}: {
  catalogue: AdmissionCatalogue;
  branchCounts: Record<string, number>;
  initialBuscar: string;
  initialRama: string;
  initialOrden: string;
  initialNotaMin: string;
  initialNotaMax: string;
  /** Nombre de la universidad si se llega con ?universidad=<uuid>. */
  initialUniversidad?: string;
  initialWithoutCutoff?: boolean;
}) {
  const careers = useMemo(() => unpackAdmissionCatalogue(catalogue), [catalogue]);
  const [searchQuery, setSearchQuery] = useState(initialBuscar);
  const [selectedRama, setSelectedRama] = useState(initialRama);
  const [selectedComunidad, setSelectedComunidad] = useState("");
  const [selectedCiudad, setSelectedCiudad] = useState("");
  const [selectedMode, setSelectedMode] = useState("");
  const [selectedUniversidad, setSelectedUniversidad] = useState(initialUniversidad);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">(
    initialOrden === "asc" ? "asc" : "desc"
  );
  const [notaMin, setNotaMin] = useState(initialNotaMin);
  const [notaMax, setNotaMax] = useState(initialNotaMax);
  const [withoutCutoff, setWithoutCutoff] = useState(initialWithoutCutoff);
  const [showFilters, setShowFilters] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  // Curso de las notas mostradas: por defecto el vigente.
  const [yearView, setYearView] = useState<CutOffView>("current");
  const course = cutOffCourse(cutOffViewYear(yearView));

  // Compute unique filter options from career data
  const filterOptions = useMemo(() => {
    const comunidades = new Set<string>();
    const cities = new Set<string>();
    const unis = new Set<string>();

    careers.forEach((c) => {
      if (c.universities?.comunidad_autonoma) comunidades.add(c.universities.comunidad_autonoma);
      if (admissionLocation(c)) cities.add(admissionLocation(c));
      if (c.universities?.name) unis.add(c.universities.name);
    });

    return {
      comunidades: [...comunidades].sort((a, b) => a.localeCompare(b, "es")),
      cities: [...cities].sort((a, b) => a.localeCompare(b, "es")),
      universities: [...unis].sort((a, b) => a.localeCompare(b, "es")),
    };
  }, [careers]);

  // Cascading: filter cities/unis based on selected comunidad
  const availableCities = useMemo(() => {
    if (!selectedComunidad) return filterOptions.cities;
    const set = new Set<string>();
    careers.forEach((c) => {
      if (c.universities?.comunidad_autonoma === selectedComunidad && admissionLocation(c))
        set.add(admissionLocation(c));
    });
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [careers, selectedComunidad, filterOptions.cities]);

  const availableUniversities = useMemo(() => {
    let filtered = careers;
    if (selectedComunidad) filtered = filtered.filter((c) => c.universities?.comunidad_autonoma === selectedComunidad);
    if (selectedCiudad) filtered = filtered.filter((c) => admissionLocation(c) === selectedCiudad);
    const set = new Set<string>();
    filtered.forEach((c) => { if (c.universities?.name) set.add(c.universities.name); });
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [careers, selectedComunidad, selectedCiudad]);

  // Client-side filtering for instant UX
  const filteredCareers = useMemo(() => {
    let result = [...careers];
    if (withoutCutoff) result = result.filter(c => c.admission_without_cutoff === true);

    if (searchQuery) {
      result = result.filter(c => matchesAdmissionSearch(c, searchQuery));
    }

    if (selectedRama) {
      result = result.filter((c) => c.branch === selectedRama);
    }

    if (selectedComunidad) {
      result = result.filter((c) => c.universities?.comunidad_autonoma === selectedComunidad);
    }

    if (selectedCiudad) {
      result = result.filter((c) => admissionLocation(c) === selectedCiudad);
    }
    if (selectedMode) result = result.filter(c => c.modality === selectedMode);

    if (selectedUniversidad) {
      result = result.filter((c) => c.universities?.name === selectedUniversidad);
    }

    // Filtrar por nota descarta las titulaciones sin nota en el curso elegido:
    // no se puede afirmar si entran o no en el rango pedido.
    const score = new Map(result.map((c) => [c.id, viewScore(c, yearView)]));
    const min = parseFloat(notaMin);
    const max = parseFloat(notaMax);
    if (notaMin && !Number.isNaN(min)) {
      result = result.filter((c) => {
        const value = score.get(c.id);
        return value != null && value >= min;
      });
    }
    if (notaMax && !Number.isNaN(max)) {
      result = result.filter((c) => {
        const value = score.get(c.id);
        return value != null && value <= max;
      });
    }

    // Las que no tienen nota van siempre al final, sea cual sea el orden.
    result.sort((a, b) => {
      const sa = score.get(a.id) ?? null;
      const sb = score.get(b.id) ?? null;
      if (sa === null && sb === null) return a.name.localeCompare(b.name, "es");
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sortOrder === "desc" ? sb - sa : sa - sb;
    });

    return result;
  }, [careers, searchQuery, selectedRama, selectedComunidad, selectedCiudad, selectedMode, selectedUniversidad, sortOrder, notaMin, notaMax, withoutCutoff, yearView]);

  const visibleCareers = filteredCareers.slice(0, visibleCount);
  const hasMore = visibleCount < filteredCareers.length;

  const activeFilterCount = [
    searchQuery,
    withoutCutoff,
    selectedRama,
    selectedComunidad,
    selectedCiudad,
    selectedMode,
    selectedUniversidad,
    notaMin,
    notaMax,
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedRama("");
    setSelectedComunidad("");
    setSelectedCiudad("");
    setSelectedMode("");
    setSelectedUniversidad("");
    setNotaMin("");
    setNotaMax("");
    setWithoutCutoff(false);
    setSortOrder("desc");
    setVisibleCount(PAGE_SIZE);
  }, []);

  return (
    <div>
      {/* ==== Buscador y filtros ==== */}
      <div className="mb-6 rounded-2xl border border-border bg-bg-primary p-4 shadow-card md:p-5">
        <div className="flex flex-col gap-3 md:flex-row">
          {/* Búsqueda */}
          <div className="relative min-w-0 md:flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Carrera, universidad o campus…"
              aria-label="Buscar por carrera, universidad o campus"
              className={cn(CONTROL, "h-11 pl-10 pr-10 placeholder:text-text-muted")}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Orden */}
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
            aria-label={sortOrder === "desc" ? "Ordenar de menor a mayor nota" : "Ordenar de mayor a menor nota"}
          >
            <ArrowUpDown className="h-4 w-4" />
            {sortOrder === "desc" ? "Mayor a menor" : "Menor a mayor"}
          </Button>

          {/* Filtros */}
          <Button
            type="button"
            variant={showFilters || activeFilterCount > 0 ? "secondary" : "outline"}
            className="h-11"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="filtros-notas"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-text-primary px-1.5 text-[10px] font-bold text-bg-primary tabular">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Filtros desplegados */}
        {showFilters && (
          <div id="filtros-notas" className="animate-fade-in overflow-hidden">
            <div className="mt-4 border-t border-border-light pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Comunidad Autónoma */}
                <div>
                  <label htmlFor="filtro-comunidad" className={LABEL}>Comunidad Autónoma</label>
                  <select
                    id="filtro-comunidad"
                    value={selectedComunidad}
                    onChange={(e) => {
                      setSelectedComunidad(e.target.value);
                      setSelectedCiudad("");
                      setSelectedUniversidad("");
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className={cn(CONTROL, "cursor-pointer")}
                  >
                    <option value="">Todas las comunidades</option>
                    {filterOptions.comunidades.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Ciudad */}
                <div>
                  <label htmlFor="filtro-ciudad" className={LABEL}>Campus o ciudad</label>
                  <select
                    id="filtro-ciudad"
                    value={selectedCiudad}
                    onChange={(e) => {
                      setSelectedCiudad(e.target.value);
                      setSelectedUniversidad("");
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className={cn(CONTROL, "cursor-pointer")}
                  >
                    <option value="">Todos los campus</option>
                    {availableCities.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Universidad */}
                <div>
                  <label htmlFor="filtro-universidad" className={LABEL}>Universidad</label>
                  <select
                    id="filtro-universidad"
                    value={selectedUniversidad}
                    onChange={(e) => {
                      setSelectedUniversidad(e.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className={cn(CONTROL, "cursor-pointer")}
                  >
                    <option value="">Todas las universidades</option>
                    {availableUniversities.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                {/* Rama */}
                <div>
                  <label htmlFor="filtro-rama" className={LABEL}>Rama de conocimiento</label>
                  <select
                    id="filtro-rama"
                    value={selectedRama}
                    onChange={(e) => {
                      setSelectedRama(e.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className={cn(CONTROL, "cursor-pointer")}
                  >
                    <option value="">Todas las ramas</option>
                    {Object.entries(branchConfig).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.label}
                        {branchCounts[key] ? ` (${branchCounts[key]})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Modalidad */}
                <div>
                  <label htmlFor="filtro-modalidad" className={LABEL}>Modalidad</label>
                  <select
                    id="filtro-modalidad"
                    value={selectedMode}
                    onChange={(e) => {
                      setSelectedMode(e.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className={cn(CONTROL, "cursor-pointer")}
                  >
                    <option value="">Todas las modalidades</option>
                    {ADMISSION_MODES.map((mode) => (
                      <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                  </select>
                </div>

                {/* Rango de nota */}
                <div>
                  <label htmlFor="filtro-nota-min" className={LABEL}>Rango de nota de corte</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="filtro-nota-min"
                      type="number"
                      min="0"
                      max="14"
                      step="0.1"
                      value={notaMin}
                      onChange={(e) => {
                        setNotaMin(e.target.value);
                        setVisibleCount(PAGE_SIZE);
                      }}
                      placeholder="Mín."
                      aria-label="Nota de corte mínima"
                      className={cn(CONTROL, "text-center tabular")}
                    />
                    <span className="shrink-0 text-sm text-text-muted" aria-hidden="true">a</span>
                    <input
                      type="number"
                      min="0"
                      max="14"
                      step="0.1"
                      value={notaMax}
                      onChange={(e) => {
                        setNotaMax(e.target.value);
                        setVisibleCount(PAGE_SIZE);
                      }}
                      placeholder="Máx."
                      aria-label="Nota de corte máxima"
                      className={cn(CONTROL, "text-center tabular")}
                    />
                  </div>
                </div>

                <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-text-primary">
                  <input
                    type="checkbox"
                    checked={withoutCutoff}
                    onChange={(e) => {
                      setWithoutCutoff(e.target.checked);
                      setNotaMin("");
                      setNotaMax("");
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className="h-4 w-4 accent-violet"
                  />
                  Acceso sin nota de corte
                </label>

                {/* Limpiar */}
                <div className="flex items-end">
                  {activeFilterCount > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-3 w-3" />
                      Limpiar filtros ({activeFilterCount})
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==== Recuento y vista ==== */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p role="status" className="text-sm text-text-muted tabular">
          {filteredCareers.length === careers.length ? (
            <>
              Mostrando <strong className="font-semibold text-text-primary">{Math.min(visibleCount, filteredCareers.length)}</strong> de{" "}
              <strong className="font-semibold text-text-primary">{filteredCareers.length}</strong> carreras
            </>
          ) : (
            <>
              <strong className="font-semibold text-text-primary">{filteredCareers.length}</strong>{" "}
              {filteredCareers.length === 1 ? "resultado encontrado" : "resultados encontrados"}
            </>
          )}
        </p>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-text-muted tabular sm:inline">Notas {cutOffViewLabel(yearView)}</span>
          <CutOffYearToggle
            view={yearView}
            onChange={(next) => {
              setYearView(next);
              setVisibleCount(PAGE_SIZE);
            }}
          />
          {/* Selector de vista */}
          <div className="hidden items-center gap-1 rounded-lg border border-border p-1 md:flex" role="group" aria-label="Tipo de vista">
            {([["cards", "Lista"], ["table", "Tabla"]] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === mode
                    ? "bg-text-primary text-bg-primary"
                    : "text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ==== Contenido ==== */}
      {filteredCareers.length === 0 ? (
        /* Vacío del sistema: misma ilustración de marca que el resto de
           listados. Se mantiene "Limpiar filtros" como acción principal, que
           es la única salida real cuando no cuadra nada. */
        <EmptyState
          icon={SearchX}
          title="No encontramos ninguna carrera"
          description={
            searchQuery
              ? `Nada coincide con “${searchQuery}”. Prueba con el nombre de la carrera o el de la universidad.`
              : "Ninguna carrera cumple los filtros que tienes puestos. Quita alguno y vuelve a mirar."
          }
          action={{ onClick: clearFilters, label: "Limpiar filtros" }}
        />
      ) : viewMode === "cards" ? (
        /* ==== Lista densa: una fila por titulación, cifra a la derecha ==== */
        <div>
          <ol className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border bg-bg-primary">
            {visibleCareers.map((career, i) => {
              const rank = sortOrder === "desc" ? i + 1 : filteredCareers.length - i;
              const score = viewScore(career, yearView);
              return (
                <li key={career.id} className="animate-fade-in">
                  <Link
                    href={`/carreras/${career.slug || career.id}`} onClick={() => void trackAcademicConsultation('cutoff', career.id)}
                    className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-bg-secondary md:px-5"
                  >
                    <span className="hidden w-8 shrink-0 text-right text-xs font-semibold text-text-muted tabular sm:block">
                      {rank}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h3 className="font-heading text-[15px] font-bold leading-snug text-text-primary transition-colors group-hover:text-violet md:text-base">
                          {career.name}
                        </h3>
                        <span className="text-xs text-text-muted">
                          {branchConfig[career.branch]?.shortLabel || career.branch}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                        <span className="font-medium">
                          {career.universities?.short_name || career.universities?.name || "Universidad sin datos"}
                        </span>
                        {admissionLocation(career) && (
                          <span className="flex items-center gap-1 text-xs text-text-muted">
                            <MapPin className="h-3 w-3" />
                            {admissionLocation(career)}
                          </span>
                        )}
                        {admissionModeLabel(career.modality) && (
                          <span className="text-xs text-text-muted">{admissionModeLabel(career.modality)}</span>
                        )}
                        {career.duration_years && (
                          <span className="flex items-center gap-1 text-xs text-text-muted">
                            <Clock className="h-3 w-3" />
                            {formatAcademicDuration(career.duration_years)}
                          </span>
                        )}
                      </div>

                      {/* En móvil la nota va debajo, con su barra. */}
                      <div className="mt-2.5 md:hidden">
                        <div className="mb-1 flex items-baseline justify-between gap-3">
                          <span className="text-xs text-text-muted">
                            {career.admission_without_cutoff ? "Requisitos de acceso" : course}
                          </span>
                          <Score score={score} withoutCutoff={career.admission_without_cutoff} view={yearView} />
                        </div>
                        <ScoreBar score={score} />
                      </div>
                    </div>

                    {/* Nota en escritorio: columna fija a la derecha. */}
                    <div className="hidden w-32 shrink-0 flex-col items-end gap-1.5 md:flex">
                      <Score score={score} withoutCutoff={career.admission_without_cutoff} view={yearView} className="text-right" />
                      <span className="text-[11px] text-text-muted">
                        {career.admission_without_cutoff ? "Requisitos de acceso" : course}
                      </span>
                      <div className="w-24">
                        <ScoreBar score={score} />
                      </div>
                    </div>

                    <ArrowUpRight className="hidden h-4 w-4 shrink-0 text-text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover:-translate-y-px group-hover:translate-x-px group-hover:opacity-100 md:block" />
                  </Link>
                </li>
              );
            })}
          </ol>

          {/* Cargar más */}
          {hasMore && (
            <div className="flex justify-center pt-6">
              <Button type="button" variant="outline" size="lg" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                <ChevronDown className="h-4 w-4" />
                Mostrar más ({filteredCareers.length - visibleCount} restantes)
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* ==== Tabla ==== */
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {[
                    { label: "#", className: "w-10 text-left" },
                    { label: "Carrera", className: "text-left" },
                    { label: "Universidad", className: "hidden text-left md:table-cell" },
                    { label: "Rama", className: "hidden text-left lg:table-cell" },
                    { label: "Duración", className: "hidden text-left lg:table-cell" },
                    { label: `Nota ${cutOffViewLabel(yearView)}`, className: "text-right" },
                  ].map((h) => (
                    <th key={h.label} scope="col" className={cn("px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted", h.className)}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {visibleCareers.map((career, i) => {
                  const score = viewScore(career, yearView);
                  return (
                    <tr key={career.id} className="group transition-colors hover:bg-bg-secondary">
                      <td className="px-4 py-3 text-xs font-medium text-text-muted tabular">{i + 1}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/carreras/${career.slug || career.id}`} onClick={() => void trackAcademicConsultation('cutoff', career.id)}
                          className="font-semibold text-text-primary transition-colors group-hover:text-violet"
                        >
                          {career.name}
                        </Link>
                        {admissionModeLabel(career.modality) && (
                          <p className="mt-0.5 text-xs text-text-muted">{admissionModeLabel(career.modality)}</p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary md:table-cell">
                        {career.universities?.short_name || career.universities?.name || "Sin datos"}
                        {admissionLocation(career) && (
                          <span className="text-xs text-text-muted"> · {admissionLocation(career)}</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-text-muted lg:table-cell">
                        {branchConfig[career.branch]?.shortLabel || career.branch}
                      </td>
                      <td className="hidden px-4 py-3 text-text-secondary lg:table-cell">
                        {career.duration_years != null ? formatAcademicDuration(career.duration_years) : <span className="text-xs text-text-muted">Sin datos</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {score === null ? (
                          <span className="text-xs text-text-muted">
                            {career.admission_without_cutoff ? "Sin nota de corte" : missingCutOffLabel(yearView)}
                          </span>
                        ) : (
                          <span className="font-heading font-extrabold text-text-primary tabular">
                            {score.toFixed(3)}
                            <span className="block text-[11px] font-normal text-text-muted">{course}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="flex justify-center border-t border-border-light p-4">
              <Button type="button" variant="ghost" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
                <ChevronDown className="h-4 w-4" />
                Mostrar más
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
