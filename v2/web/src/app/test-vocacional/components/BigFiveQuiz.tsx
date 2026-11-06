"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BIG_FIVE_QUESTIONS } from "../lib/big-five";

import { ownedDraftKey, BIG_FIVE_DRAFT_KEY } from '../lib/draft-storage';

const LIKERT_LABELS = [
  "Totalmente en desacuerdo",
  "En desacuerdo",
  "Neutral",
  "De acuerdo",
  "Totalmente de acuerdo",
];

interface Props {
  owner: string | null;
  onComplete: (answers: Record<string, number>) => void;
  onBack?: () => void;
  initialAnswers?: Record<string, number>;
  onAnswersChange?: (answers: Record<string, number>) => void;
}

const PER_PAGE = 5;

export default function BigFiveQuiz({ onComplete, onBack, owner, initialAnswers, onAnswersChange }: Props) {
  const initial = useRef(initialAnswers);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [ready, setReady] = useState(false);
  const completed = useRef(false);
  useEffect(() => {
    let candidate = initial.current;
    try {
      const raw = sessionStorage.getItem(ownedDraftKey(BIG_FIVE_DRAFT_KEY, owner));
      const draft = raw && raw.length < 10000 ? JSON.parse(raw) : null;
      if (draft && Number.isFinite(draft.at) && Date.now()-draft.at < 86400000 && draft.at <= Date.now()+60000 && draft.answers && typeof draft.answers === 'object') {
        candidate ??= draft.answers;
      }
    } catch {}
    if (candidate) {
      const clean = Object.fromEntries(Object.entries(candidate).filter(([id,value])=>BIG_FIVE_QUESTIONS.some(q=>q.id===id)&&Number.isInteger(value)&&Number(value)>=1&&Number(value)<=5)) as Record<string,number>;
      setAnswers(clean);
      const first = BIG_FIVE_QUESTIONS.findIndex(q=>clean[q.id]==null);
      setPage(first < 0 ? Math.ceil(BIG_FIVE_QUESTIONS.length/PER_PAGE)-1 : Math.floor(first/PER_PAGE));
    }
    setReady(true);
  }, [owner]);
  useEffect(() => { if (ready) { onAnswersChange?.(answers); try { sessionStorage.setItem(ownedDraftKey(BIG_FIVE_DRAFT_KEY, owner),JSON.stringify({at:Date.now(),answers})); } catch {} } }, [answers,ready,owner,onAnswersChange]);

  const totalPages = Math.ceil(BIG_FIVE_QUESTIONS.length / PER_PAGE);
  const start = page * PER_PAGE;
  const end = start + PER_PAGE;
  const visible = BIG_FIVE_QUESTIONS.slice(start, end);

  const allAnswered = visible.every((q) => typeof answers[q.id] === "number");
  const progress = Math.round((Object.keys(answers).length / BIG_FIVE_QUESTIONS.length) * 100);

  const setAnswer = (id: string, value: number) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const handleNext = () => {
    if (!allAnswered || completed.current) return;
    if (page < totalPages - 1) {
      setPage((p) => p + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      completed.current = true;
      onComplete(answers);
    }
  };

  if (!ready) return <p role="status" className="p-12 text-center text-text-muted">Recuperando tus respuestas…</p>;
  return (
    <div className="min-h-screen bg-bg-primary px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        {/* Cabecera editorial de la segunda parte. */}
        <div className="mb-8">
          <p className="eyebrow">Segunda parte · Personalidad</p>
          <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
            ¿Cómo eres tú?
          </h2>
          <p className="mt-3 max-w-xl text-text-secondary">
            {BIG_FIVE_QUESTIONS.length} frases para explorar tus rasgos de personalidad (Big Five). Marca cuánto se parece a ti cada una.
          </p>
        </div>

        {/* Progreso: línea fina y bloque en cifra tabular. */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs text-text-muted tabular">
            <span>Bloque {page + 1} de {totalPages}</span>
            <span>{progress}% completado</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className="h-full rounded-full bg-violet transition-[width] duration-500 ease-[var(--ease-out-quart)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Cada bloque entra desde la derecha; dentro, las frases en cascada. */}
        <div key={page} className="animate-step-in space-y-4">
          {visible.map((q, idx) => (
            <div
              key={q.id}
              className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card animate-list-in"
              style={{ "--i": idx } as CSSProperties}
            >
              <p className="mb-4 font-medium text-text-primary">
                <span className="mr-2 text-sm text-text-muted tabular">{start + idx + 1}.</span>
                {q.text}
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((val) => {
                  const active = answers[q.id] === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAnswer(q.id, val)}
                      className={cn(
                        "group flex cursor-pointer flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-[10px] leading-tight transition-quick sm:text-xs",
                        active ? "font-semibold text-text-primary" : "text-text-muted hover:text-text-secondary"
                      )}
                      title={LIKERT_LABELS[val - 1]}
                      aria-pressed={active}
                      aria-label={`${q.text}: ${LIKERT_LABELS[val - 1]}`}
                    >
                      <span
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-full border font-semibold tabular transition-quick sm:h-9 sm:w-9",
                          active
                            ? "border-text-primary bg-text-primary text-bg-primary shadow-card"
                            : "border-border bg-bg-primary text-text-secondary group-hover:border-text-primary/40"
                        )}
                      >
                        {val}
                      </span>
                      <span className="text-center">{LIKERT_LABELS[val - 1]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Navegación: volver como fantasma, continuar como acción principal. */}
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border-light pt-6">
          <Button
            variant="ghost"
            onClick={() => (page > 0 ? setPage((p) => p - 1) : onBack?.())}
            disabled={page === 0 && !onBack}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {page === 0 ? "Volver" : "Anterior"}
          </Button>
          <Button variant="dark" onClick={handleNext} disabled={!allAnswered} className="group">
            {page === totalPages - 1 ? "Ver mi perfil completo" : "Siguiente"}
            <ArrowRight className="arrow-nudge h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
