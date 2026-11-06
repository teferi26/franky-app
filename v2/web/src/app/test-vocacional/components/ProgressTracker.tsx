"use client";

import { cn } from "@/lib/utils";
import type { QuizStage } from "../types";
import { getStageDescription, STAGE_FLOW } from "../lib/adaptive-selector";

interface ProgressTrackerProps {
  stage: QuizStage;
  totalAnswered: number;
  estimatedTotal: number;
}

const STAGE_LABELS: { stage: QuizStage; label: string }[] = [
  { stage: 1, label: "Descubrimiento" },
  { stage: 5, label: "Tu rama" },
  { stage: 2, label: "Refinamiento" },
  { stage: 3, label: "Diferenciación" },
  { stage: 4, label: "Ajuste" },
];

// Progreso del test: una línea fina, cinco puntos por fase y el recuento en
// cifra tabular. Sin degradados ni parpadeos: la fase actual se marca con un
// anillo suave alrededor del punto.
export default function ProgressTracker({ stage, totalAnswered, estimatedTotal }: ProgressTrackerProps) {
  const progress = estimatedTotal > 0 ? Math.min((totalAnswered / estimatedTotal) * 100, 95) : 0;
  const currentIndex = STAGE_FLOW.indexOf(stage);

  return (
    <div className="w-full">
      <div className="h-1 overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-violet transition-[width] duration-500 ease-[var(--ease-out-quart)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        {STAGE_LABELS.map((s) => {
          const index = STAGE_FLOW.indexOf(s.stage);
          const done = currentIndex > index;
          const current = stage === s.stage;
          return (
            <div key={s.stage} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-[background-color,box-shadow] duration-300",
                  done && "bg-violet",
                  current && "bg-violet ring-4 ring-violet/15",
                  !done && !current && "bg-border"
                )}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "hidden text-[11px] font-medium sm:block",
                  currentIndex >= index ? "text-text-primary" : "text-text-muted"
                )}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-center text-xs text-text-muted tabular">
        {getStageDescription(stage)} · {totalAnswered} {totalAnswered === 1 ? 'respuesta' : 'respuestas'}
      </p>
    </div>
  );
}
