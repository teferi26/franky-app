"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { X, Scale, ArrowRight } from "lucide-react";
import { universityStudentContext } from '@/lib/university-evidence';
import { formatAcademicScore } from '@/lib/academic-score';
import { cutOffCourse, cutOffViewLabel, cutOffViewYear, type CutOffView } from '@/lib/academic-year';
import CutOffYearToggle from '@/components/CutOffYearToggle';
import Combobox from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Comparador de universidades, portado de la app movil (comparar-unis.tsx).
 *
 * En web solo existia el comparador de PISOS. Comparar universidades es una de
 * las intenciones de busqueda mas fuertes del sector ("UA o UMH", "Complutense
 * vs Autonoma") y no habia nada que la respondiera.
 *
 * La seleccion viaja en la URL (?unis=slug1,slug2) para que la comparativa se
 * pueda compartir por WhatsApp, que es como se decide esto de verdad.
 */
export type UniRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  city: string | null;
  comunidad_autonoma: string | null;
  type: string | null;
  founded_year: number | null;
  student_count: number | null;
  campus_count: number | null;
  institutional_sources?: unknown;
  cut_off_year: number | null;
  scored_offers: number;
  careers_count: number;
  min_cut_off: number | null;
  max_cut_off: number | null;
  // Mismos datos del curso anterior, para el conmutador de notas.
  scored_offers_prev: number;
  min_cut_off_prev: number | null;
  max_cut_off_prev: number | null;
};

const MAX = 4;

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n === null || n === undefined) return "Sin dato";
  return `${n.toLocaleString("es-ES")}${suffix}`;
}

export default function CompararUnisClient({
  universities,
  initialSlugs,
}: {
  universities: UniRow[];
  initialSlugs: string[];
}) {
  const [selected, setSelected] = useState<string[]>(
    initialSlugs.filter((s) => universities.some((u) => u.slug === s)).slice(0, MAX)
  );

  const chosen = useMemo(
    () =>
      selected
        .map((slug) => universities.find((u) => u.slug === slug))
        .filter((u): u is UniRow => Boolean(u)),
    [selected, universities]
  );

  const syncUrl = (next: string[]) => {
    setSelected(next);
    // replaceState en vez de router.push: cambiar la selección no debería
    // llenar el historial de pasos intermedios, pero el enlace sí tiene que
    // poder copiarse tal cual.
    const url = next.length
      ? `${window.location.pathname}?unis=${next.join(",")}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  };

  const add = (slug: string) => {
    if (!slug || selected.includes(slug) || selected.length >= MAX) return;
    syncUrl([...selected, slug]);
  };
  const remove = (slug: string) => syncUrl(selected.filter((s) => s !== slug));

  const available = universities.filter((u) => !selected.includes(u.slug));
  // Curso de las notas: por defecto el vigente.
  const [view, setView] = useState<CutOffView>("current");
  const prev = view === "previous";

  const ROWS: { label: string; value: (u: UniRow) => string }[] = [
    { label: "Ciudad", value: (u) => u.city || "Sin dato" },
    { label: "Comunidad", value: (u) => u.comunidad_autonoma || "Sin dato" },
    { label: "Titularidad", value: (u) => (u.type === "publica" ? "Pública" : "Privada") },
    { label: "Fundada en", value: (u) => (u.founded_year ? String(u.founded_year) : "Sin dato") },
    { label: "Estudiantes", value: (u) => fmt(u.student_count) },
    { label: "Periodo del alumnado", value: (u) => u.student_count == null ? 'Sin dato' : universityStudentContext(u) },
    { label: "Campus", value: (u) => fmt(u.campus_count) },
    { label: "Ofertas en Franky", value: (u) => fmt(u.careers_count) },
    { label: "Curso de las notas", value: () => cutOffCourse(cutOffViewYear(view)) },
    { label: "Ofertas con nota en ese curso", value: (u) => fmt(prev ? u.scored_offers_prev : u.scored_offers) },
    {
      label: "Nota de corte más alta",
      value: (u) => {
        const max = prev ? u.max_cut_off_prev : u.max_cut_off;
        return max ? formatAcademicScore(max) : `Sin nota ${cutOffViewLabel(view)}`;
      },
    },
    {
      label: "Nota de corte más baja",
      value: (u) => {
        const min = prev ? u.min_cut_off_prev : u.min_cut_off;
        return min ? formatAcademicScore(min) : `Sin nota ${cutOffViewLabel(view)}`;
      },
    },
  ];

  return (
    <div>
      {/* Selector */}
      <div className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chosen.map((u) => (
            <span
              key={u.slug}
              className="inline-flex items-center gap-1.5 rounded-full bg-text-primary py-1.5 pl-3.5 pr-1.5 text-sm font-medium text-bg-primary animate-scale-in"
            >
              {u.short_name || u.name}
              <button
                onClick={() => remove(u.slug)}
                aria-label={`Quitar ${u.name} de la comparativa`}
                className="rounded-full p-1 transition-colors hover:bg-bg-primary/20"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {chosen.length === 0 && (
            <span className="text-sm text-text-muted">
              Elige al menos dos universidades para compararlas
            </span>
          )}
        </div>

        {selected.length < MAX ? (
          <Combobox
            className="max-w-md"
            options={available.map((u) => ({
              value: u.slug,
              label: u.short_name || u.name,
              hint: [u.city, u.comunidad_autonoma].filter(Boolean).join(", ") || null,
            }))}
            value=""
            onChange={add}
            placeholder="Añadir universidad…"
            searchPlaceholder="Buscar universidad…"
            allLabel={null}
          />
        ) : (
          <p className="text-sm text-text-muted">
            Máximo {MAX} a la vez. Quita alguna para añadir otra.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-3xl text-sm leading-relaxed text-text-muted">Los rangos usan solo las notas del curso {cutOffViewLabel(view)}, el mismo para todas las universidades. Las ofertas incluyen variantes de campus y programas del catálogo, y pueden no cubrir toda la oferta oficial. Más estudiantes o antigüedad no implica que una universidad encaje mejor contigo.</p>
        <CutOffYearToggle view={view} onChange={setView} className="shrink-0 self-start" />
      </div>

      {/* Tabla limpia: cabecera hairline, filas con hover neutro, cifras tabulares. */}
      {chosen.length >= 1 ? (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-bg-primary">
          <table className={`w-full border-collapse text-sm ${chosen.length > 2 ? 'min-w-[720px]' : 'table-fixed'}`}>
            <caption className="sr-only">
              Comparativa de {chosen.map((u) => u.name).join(", ")}
            </caption>
            <thead>
              <tr className="border-b border-border bg-bg-secondary/60">
                <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  &nbsp;
                </th>
                {chosen.map((u) => (
                  <th key={u.slug} scope="col" className="px-4 py-3.5 text-left">
                    <Link
                      href={`/universidades/${u.slug}`}
                      className="font-heading text-base font-bold text-text-primary transition-colors hover:text-violet"
                    >
                      {u.short_name || u.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.label}
                  style={{ "--i": i } as CSSProperties}
                  className="animate-list-in border-b border-border-light transition-colors duration-200 hover:bg-bg-secondary"
                >
                  <th
                    scope="row"
                    className="px-4 py-3 text-left text-sm font-medium text-text-muted"
                  >
                    {row.label}
                  </th>
                  {chosen.map((u) => (
                    <td key={u.slug} className="px-4 py-3 font-semibold text-text-primary tabular">
                      {row.value(u)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="transition-colors duration-200 hover:bg-bg-secondary">
                <th scope="row" className="px-4 py-3 text-left text-sm font-medium text-text-muted">
                  Su muro
                </th>
                {chosen.map((u) => (
                  <td key={u.slug} className="px-4 py-3">
                    <Link
                      href={`/fomo/${u.slug}`}
                      className="group inline-flex items-center gap-1 text-sm font-semibold text-text-primary transition-colors hover:text-violet"
                    >
                      Ver FOMO <ArrowRight className="h-3.5 w-3.5 arrow-nudge" />
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-border">
          <EmptyState
            compact
            icon={Scale}
            title="Elige universidades arriba"
            description={`Puedes comparar hasta ${MAX} a la vez y compartir el enlace: la selección se guarda en la propia URL.`}
          />
        </div>
      )}
    </div>
  );
}
