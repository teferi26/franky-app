"use client";

import { formatAcademicDuration } from '@/lib/academic-duration';
import Link from "next/link";
import { ThumbsUp, ThumbsDown, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpotlightCard, CountUp } from "@/components/motion";
import type { CareerMatch } from "../types";

interface CareerResultCardProps {
  match: CareerMatch;
  universityName?: string;
  justification?: string;
  feedback: boolean | null;
  onFeedback: (positive: boolean) => void;
  rank?: number;
}

const branchLabels: Record<string, string> = {
  ciencias: "Ciencias",
  ciencias_salud: "Ciencias de la Salud",
  ingenieria_arquitectura: "Ingeniería y Arquitectura",
  artes_humanidades: "Artes y Humanidades",
  ciencias_sociales_juridicas: "CC. Sociales y Jurídicas",
};

// Tarjeta de carrera recomendada: puesto en cifra, título en Outfit, afinidad
// que cuenta al entrar y metadatos en insignias outline (sin pastillas de
// colores por rama). Elevación y foco de luz al pasar el ratón.
export default function CareerResultCard({ match, universityName, justification, feedback, onFeedback, rank }: CareerResultCardProps) {
  const pct = match.scoreFinal;
  const career = match.career;

  return (
    <SpotlightCard asChild>
      <article className="group hover-lift flex h-full flex-col rounded-2xl border border-border bg-bg-primary p-5 shadow-card hover:border-text-primary/15">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {rank && (
              <p className="eyebrow tabular">{String(rank).padStart(2, "0")}</p>
            )}
            <Link
              href={`/carreras/${career.id}`}
              className="mt-1 block font-heading text-base font-bold leading-snug text-text-primary transition-colors line-clamp-2 hover:text-violet"
            >
              {career.name}
            </Link>
            {universityName && (
              <p className="mt-0.5 text-sm text-text-muted">{universityName}</p>
            )}
            {(career.campus || career.modality) && <p className="mt-1 text-xs text-text-muted">{[career.campus, career.modality].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="shrink-0 text-right">
            <CountUp value={pct} suffix="%" className="font-heading text-2xl font-extrabold tracking-tight text-text-primary" />
            <p className="max-w-20 text-[10px] leading-tight text-text-muted">afinidad orientativa</p>
          </div>
        </div>

        {match.isAspiracional && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">El corte de referencia supera tu nota estimada. Revisa las condiciones de acceso.</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="outline">{branchLabels[career.branch] || career.branch}</Badge>
          {career.cut_off_score != null && career.cut_off_score > 0 && (
            <Badge variant="outline" className="tabular">
              Corte de referencia{career.cut_off_year ? ` ${career.cut_off_year}` : ''}: {career.cut_off_score.toLocaleString('es-ES', { maximumFractionDigits: 3 })}
            </Badge>
          )}
          {career.duration_years && (
            <Badge variant="outline">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatAcademicDuration(career.duration_years)}
            </Badge>
          )}
        </div>

        {!justification && match.explanation && (
          <p className="mt-3 text-xs leading-relaxed text-text-muted">
            {match.explanation}
          </p>
        )}
        {justification && <p className="mt-3 text-sm leading-relaxed text-text-secondary">{justification}</p>}

        <details className="mt-4 rounded-xl border border-border-light bg-bg-secondary/60 p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-text-primary">¿Cómo calculamos esta afinidad?</summary>
          <p className="mt-2 leading-relaxed text-text-muted">Comparamos tus respuestas con el perfil de la titulación. El índice combina intereses, aptitudes declaradas, valores y preferencias. No es una probabilidad de admisión ni de éxito: revisa el plan de estudios y los requisitos oficiales.</p>
          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5">
            {Object.entries({ riasec: "Intereses", aptitud: "Aptitudes", valores: "Valores", aversion: "Tareas que evitarías", ambicion: "Objetivos", pragmatico: "Condiciones prácticas", tags: "Preferencias" }).map(([key, label]) => <div key={key} className="flex justify-between gap-2"><dt className="text-text-secondary">{label}</dt><dd className="font-semibold text-text-primary tabular">{Math.round(Math.max(0, Math.min(1, match.scoreBreakdown[key as keyof typeof match.scoreBreakdown])) * 100)}/100</dd></div>)}
          </dl>
        </details>

        <div className="mt-auto flex items-center justify-between pt-4">
          <Link
            href={`/carreras/${career.id}`}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-violet"
          >
            Ver carrera
            <ArrowRight className="arrow-nudge h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onFeedback(true)}
              className={cn(feedback === true && "bg-emerald-50 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300")}
              title="Me interesa"
              aria-label="Me interesa"
              aria-pressed={feedback === true}
            >
              <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onFeedback(false)}
              className={cn(feedback === false && "bg-rose-50 text-rose-700 hover:bg-rose-50 hover:text-rose-700 dark:bg-rose-950/40 dark:text-rose-300")}
              title="No me interesa"
              aria-label="No me interesa"
              aria-pressed={feedback === false}
            >
              <ThumbsDown className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </article>
    </SpotlightCard>
  );
}
