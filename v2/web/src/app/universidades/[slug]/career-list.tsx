"use client";
import type { CSSProperties } from "react";
import { formatAcademicDuration } from '@/lib/academic-duration';
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight, SlidersHorizontal, X } from "lucide-react";
import { COURSE_BRANCH_LABELS, courseAdmissionForView, filterUniversityCourses, universityCourseOptions } from '@/lib/university-catalogue';
import { cutOffViewLabel, type CutOffView } from '@/lib/academic-year';
import CutOffYearToggle from '@/components/CutOffYearToggle';
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Desplegables con los mismos tokens que ui/input.tsx (no hay Select del sistema).
const selectClass =
  "min-h-11 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";

export type UniversityCareer = { id: string; slug?: string | null; name: string; branch: string; cut_off_score: number | null; cut_off_year: number | null; cut_off_score_prev?: number | null; cut_off_year_prev?: number | null; admission_without_cutoff?: boolean; duration_years: number | null; campus: string | null };
export default function UniversityCareerList({ careers }: { careers: UniversityCareer[] }) {
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [campus, setCampus] = useState("");
  const [limit, setLimit] = useState(12);
  // Curso de las notas: por defecto el vigente; el botón enseña el anterior.
  const [view, setView] = useState<CutOffView>('current');
  const filtered = useMemo(() => filterUniversityCourses(careers, { query, branch, campus }), [careers, query, branch, campus]);
  const branches = useMemo(() => universityCourseOptions(careers, 'branch'), [careers]);
  const campuses = useMemo(() => universityCourseOptions(careers, 'campus'), [careers]);
  const hasFilters = !!(query.trim() || branch || campus);
  const clearFilters = () => { setQuery(''); setBranch(''); setCampus(''); setLimit(12); };
  return <>
    <label className="relative mb-4 block">
      <span className="sr-only">Buscar una carrera en esta universidad</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <Input value={query} onChange={e => { setQuery(e.target.value); setLimit(12); }} type="search" placeholder="Busca una carrera o un campus" className="pl-10" />
    </label>
    <div className="mb-5 grid gap-3 sm:grid-cols-2">
      {branches.length > 1 && <label className="min-w-0 text-xs font-semibold text-text-secondary"><span className="mb-1.5 flex items-center gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" />Rama de estudios</span><select value={branch} onChange={e => { setBranch(e.target.value); setLimit(12); }} className={selectClass}><option value="">Todas las ramas</option>{branches.map(value => <option key={value} value={value}>{COURSE_BRANCH_LABELS[value] ?? value}</option>)}</select></label>}
      {campuses.length > 1 && <label className="min-w-0 text-xs font-semibold text-text-secondary"><span className="mb-1.5 block">Campus o centro</span><select value={campus} onChange={e => { setCampus(e.target.value); setLimit(12); }} className={selectClass}><option value="">Todos los campus y centros</option>{campuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    </div>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="text-sm font-semibold text-text-primary tabular" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'oferta académica' : 'ofertas académicas'}{hasFilters ? ` de ${careers.length}` : ''}</p>
      {careers.length > 0 && (
        <span className="flex items-center gap-2">
          <span className="text-xs text-text-muted tabular">Notas {cutOffViewLabel(view)}</span>
          <CutOffYearToggle view={view} onChange={setView} />
        </span>
      )}
    </div>
    {hasFilters && (
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"><X className="h-3.5 w-3.5" />Quitar filtros</button>
      </div>
    )}
    <p className="mb-4 text-xs leading-relaxed text-text-muted">Un mismo grado puede tener distintas ofertas por campus o programa. Las notas son las del curso {cutOffViewLabel(view)} y no garantizan plaza.</p>
    {filtered.length > 0 && (
      <div className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border">
        {filtered.slice(0, limit).map((career, i) => {
          const admission = courseAdmissionForView(career, view);
          return (
            <Link
              key={career.id}
              href={`/carreras/${career.slug || career.id}`}
              style={{ "--i": i } as CSSProperties}
              className="group animate-list-in flex items-center justify-between gap-4 px-4 py-4 transition-colors duration-200 hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug text-text-primary transition-colors group-hover:text-violet">{career.name}</span>
                <span className="mt-1 block text-xs text-text-muted">{[career.campus, career.duration_years ? formatAcademicDuration(career.duration_years) : null].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="max-w-28 text-right">
                  <span className="block font-heading text-lg font-bold text-text-primary tabular">{admission.label}</span>
                  <span className="block text-[11px] text-text-muted">{admission.period}</span>
                  {career.admission_without_cutoff && <span className="mt-1 block text-[10px] text-text-muted">Revisa los requisitos</span>}
                </span>
                <ArrowUpRight className="hidden h-4 w-4 text-text-muted transition-[transform,color] duration-200 group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-violet sm:block" />
              </span>
            </Link>
          );
        })}
      </div>
    )}
    {filtered.length === 0 && <div className="rounded-2xl bg-bg-secondary px-4 py-10 text-center"><p className="font-heading font-bold text-text-primary">{careers.length ? 'No encontramos una coincidencia' : 'Estamos ampliando este catálogo'}</p><p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">{careers.length ? 'Prueba con menos palabras o cambia los filtros de rama y campus.' : 'Consulta la oferta vigente en la web oficial de la universidad.'}</p>{hasFilters && <button type="button" onClick={clearFilters} className="mt-3 min-h-11 text-sm font-semibold text-text-primary underline underline-offset-4 hover:text-violet">Ver todas las ofertas</button>}</div>}
    {filtered.length > limit && <button type="button" onClick={() => setLimit(value => value + 24)} className={cn(buttonVariants({ variant: "outline" }), "mt-5 w-full")}>Ver más ofertas ({filtered.length - limit})</button>}
  </>;
}
