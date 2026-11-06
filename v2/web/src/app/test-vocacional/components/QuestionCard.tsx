"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AdaptiveQuestion, QuestionOption } from "../types";
import { admissionGradeOption, parseAdmissionGrade } from '../lib/admission-grade';

interface QuestionCardProps {
  question: AdaptiveQuestion;
  onAnswer: (option: QuestionOption) => void;
  questionNumber: number;
  totalAnswered: number;
  initialAnswer?: QuestionOption;
}

// Una pregunta del test: rótulo con el número, titular grande y las opciones
// como filas con borde hairline. La elegida pasa a borde oscuro con marca de
// verificación (el mismo control que el orientador de becas). Cada pregunta
// entra deslizándose desde la derecha con `animate-step-in`.
export default function QuestionCard({ question, onAnswer, questionNumber, initialAnswer }: QuestionCardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [gradeInput, setGradeInput] = useState(initialAnswer?.admissionGrade?.toLocaleString('es-ES', { maximumFractionDigits: 3 }) ?? '');
  const [gradeError, setGradeError] = useState(false);
  const [showRanges, setShowRanges] = useState(false);
  const [optionSearch, setOptionSearch] = useState('');
  const searchable = question.options.length >= 10;
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const visibleOptions = question.options.map((opt, i) => ({ opt, i })).filter(({ opt }) => !searchable || normalize(opt.text).includes(normalize(optionSearch)));
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  const handleSelect = (option: QuestionOption, idx: number) => {
    if (animating || pending.current) return;
    setSelected(idx);
    setAnimating(true);
    pending.current = setTimeout(() => {
      pending.current = null;
      onAnswer(option);
      setSelected(null);
      setAnimating(false);
    }, 350);
  };

  return (
    <div className="w-full max-w-lg animate-step-in">
      <div className="mb-8 text-center">
        <p className="eyebrow tabular">Pregunta {questionNumber}</p>
        <h2 className="mt-3 font-heading text-xl font-bold leading-snug text-text-primary sm:text-2xl">
          {question.text}
        </h2>
        {question.subtext && (
          <p className="mt-2 text-sm text-text-muted">{question.subtext}</p>
        )}
      </div>

      {question.id === 'q4_01' && <form className="mb-5 rounded-2xl border border-border bg-bg-primary p-5 shadow-card" noValidate onSubmit={event => {
        event.preventDefault();
        const grade = parseAdmissionGrade(gradeInput);
        if (grade === null) { setGradeError(true); return; }
        handleSelect(admissionGradeOption(grade), -1);
      }}>
        <label htmlFor="admission-grade" className="block text-sm font-semibold text-text-primary">Tu nota sobre 14</label>
        <div className="mt-3 flex flex-wrap gap-3">
          <Input
            id="admission-grade"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={gradeInput}
            onChange={event => { setGradeInput(event.target.value); setGradeError(false); }}
            placeholder="Ej. 11,735"
            maxLength={6}
            disabled={animating}
            aria-invalid={gradeError}
            aria-describedby={gradeError ? 'admission-grade-error' : 'admission-grade-help'}
            className="h-12 min-w-0 flex-1 text-lg font-semibold tabular"
          />
          <Button type="submit" variant="dark" size="lg" disabled={animating}>Usar esta nota</Button>
        </div>
        {gradeError ? <p id="admission-grade-error" role="alert" className="mt-3 text-sm text-text-secondary"><strong className="block font-semibold text-error">Revisa tu nota</strong>Introduce una nota entre 5 y 14, con hasta tres decimales. También puedes elegir un intervalo o indicar que aún no la sabes.</p>
          : <p id="admission-grade-help" className="mt-3 text-sm text-text-muted">Conservaremos los decimales. Las ponderaciones pueden cambiar según la carrera: revisa cada oferta.</p>}
        <button type="button" onClick={() => setShowRanges(value => !value)} aria-expanded={showRanges} className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-violet link-underline">{showRanges ? 'Ocultar intervalos' : 'Prefiero elegir un intervalo'}</button>
      </form>}

      {searchable && <div className="mb-4">
        <label htmlFor="question-option-search" className="block text-sm font-semibold text-text-primary">Buscar una opción</label>
        <Input id="question-option-search" type="search" value={optionSearch} onChange={event => setOptionSearch(event.target.value)} placeholder="Escribe para encontrarla…" autoComplete="off" className="mt-2 h-12" />
        <p role="status" className="mt-2 text-xs text-text-muted tabular">{visibleOptions.length} {visibleOptions.length === 1 ? 'opción' : 'opciones'}</p>
      </div>}
      {searchable && visibleOptions.length === 0 && <button onClick={() => setOptionSearch('')} className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-violet link-underline">Borrar búsqueda y ver todas</button>}

      <div className="space-y-2.5">
        {visibleOptions.map(({ opt, i }, position) => question.id === 'q4_01' && opt.impacts.length > 0 && !showRanges ? null : (
          <button
            key={i}
            type="button"
            onClick={() => handleSelect(opt, i)}
            disabled={animating}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-bg-primary px-4 py-3.5 text-left transition-quick animate-list-in",
              selected === i
                ? "border-text-primary shadow-card"
                : "border-border hover:border-text-primary/30 hover:bg-bg-secondary",
              animating && selected !== i && "opacity-40"
            )}
            style={{ "--i": position } as CSSProperties}
          >
            <span className={cn("min-w-0 flex-1 text-sm", selected === i ? "font-semibold text-text-primary" : "font-medium text-text-secondary")}>{opt.text}</span>
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-quick",
                selected === i ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-transparent"
              )}
              aria-hidden="true"
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
