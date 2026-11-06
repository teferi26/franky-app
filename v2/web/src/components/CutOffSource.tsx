"use client";

import { useState } from "react";
import { ExternalLink, Info } from "lucide-react";
import CutOffYearToggle from "@/components/CutOffYearToggle";
import {
  CURRENT_CUT_OFF_YEAR,
  cutOffCourse,
  cutOffForView,
  cutOffViewLabel,
  cutOffViewYear,
  type CutOffRecord,
  type CutOffView,
} from "@/lib/academic-year";

type CutOffCareer = CutOffRecord & {
  cut_off_verified_at?: string | null;
  cut_off_extraordinary?: number | null;
  admission_without_cutoff?: boolean;
};

const formatScore = (score: number) =>
  score.toLocaleString("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/**
 * Nota de corte de la ficha con su convocatoria y fuente oficial. Por defecto
 * enseña el curso vigente; si hay nota del curso anterior, un botón la muestra
 * con su propia convocatoria y fuente, sin mezclarla con la vigente.
 */
export default function CutOffSource({ career }: { career: CutOffCareer }) {
  const [view, setView] = useState<CutOffView>("current");
  const withoutCutoff = career.admission_without_cutoff === true;
  const resolved = withoutCutoff ? null : cutOffForView(career, view);
  const hasPrevious = !withoutCutoff && cutOffForView(career, "previous") !== null;

  // Los datos propios de la fila (fecha de comprobación, extraordinaria y la
  // convocatoria cuando aún no hay nota ordinaria) solo valen para su curso.
  const mainIsCurrent = career.cut_off_year === CURRENT_CUT_OFF_YEAR;
  const ownRow = view === "current" && (mainIsCurrent || withoutCutoff);
  const round = resolved?.round ?? (ownRow ? career.cut_off_round : null);
  const rawSource = resolved ? resolved.sourceUrl : ownRow ? career.cut_off_source_url : null;
  const source = rawSource && /^https:\/\//i.test(rawSource) ? rawSource : null;
  const date = ownRow && career.cut_off_verified_at ? new Date(career.cut_off_verified_at) : null;
  const extraordinary = ownRow && !withoutCutoff ? career.cut_off_extraordinary : null;

  return (
    <aside className="mb-6 rounded-2xl border border-border bg-bg-primary p-4 text-sm leading-relaxed">
      <div className="flex gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="font-semibold text-text-primary">
              {withoutCutoff ? "Acceso sin nota de corte" : `Admisión · ${cutOffCourse(cutOffViewYear(view))}`}
            </p>
            {(hasPrevious || view === "previous") && <CutOffYearToggle view={view} onChange={setView} />}
          </div>
          {resolved && (
            <p className="text-text-primary">
              Nota ordinaria {cutOffViewLabel(view)}:{" "}
              <strong className="font-heading font-extrabold tabular">{formatScore(resolved.score)}</strong>
            </p>
          )}
          <p className="text-text-secondary">{round || "Convocatoria sin verificar"}.</p>
          <p className="text-text-secondary">
            {withoutCutoff
              ? "Consulta la vía de acceso y el calendario de matrícula."
              : resolved
                ? view === "previous"
                  ? "Es la nota del curso anterior. Sirve para ver la tendencia, no como nota vigente."
                  : "La nota ordinaria es una referencia de la lista indicada. No garantiza una plaza en la siguiente adjudicación."
                : `No hay una nota ordinaria ${cutOffViewLabel(view)} verificada. Esto no significa que el acceso sea libre.`}
          </p>
          {extraordinary != null && (
            <p className="text-text-secondary">
              Convocatoria extraordinaria: {formatScore(Number(extraordinary))}. Es un proceso distinto de la ordinaria.
            </p>
          )}
          {source ? (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className="link-underline inline-flex min-h-10 items-center gap-2 font-semibold text-violet"
            >
              Consultar la fuente oficial <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <p className="text-text-muted">
              Pendiente de contrastar la publicación oficial. Confirma la cifra con la universidad antes de decidir.
            </p>
          )}
          {date && !Number.isNaN(date.getTime()) && (
            <p className="text-xs text-text-muted">
              Fuente comprobada el {date.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
