"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StudentProfile, QuizStage, QuestionOption } from "../types";
import { createEmptyProfile } from "../types";
import { replayAnswers } from "../lib/answer-history";
import { getEstimatedTotal } from "../lib/adaptive-selector";
import { resolveQuizStep } from '../lib/quiz-flow';
import { QUESTION_BANK } from "../lib/question-bank";
import QuestionCard from "./QuestionCard";
import ProgressTracker from "./ProgressTracker";
import { QUIZ_DRAFT_KEY, encodeQuizDraft, decodeQuizDraft } from '../lib/quiz-draft';
import { ownedDraftKey } from '../lib/draft-storage';

interface QuizEngineProps {
  owner: string | null;
  resumePrevious?: boolean;
  initialHistory?: HistoryEntry[];
  onComplete: (profile: StudentProfile, answeredIds: string[], history: HistoryEntry[]) => void;
}

interface HistoryEntry {
  questionId: string;
  option: QuestionOption;
  stage: QuizStage;
}

export default function QuizEngine({ onComplete, owner, resumePrevious = false, initialHistory }: QuizEngineProps) {
  const [profile, setProfile] = useState<StudentProfile>(createEmptyProfile);
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [stage, setStage] = useState<QuizStage>(1);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [reviewedAnswer, setReviewedAnswer] = useState<HistoryEntry | null>(null);
  const [recentDims, setRecentDims] = useState<string[]>([]);
  const completed = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let entries = initialHistory;
    try {
      entries ??= decodeQuizDraft(sessionStorage.getItem(ownedDraftKey(QUIZ_DRAFT_KEY, owner)))?.history;
    } catch { /* Storage may be unavailable; the quiz still works. */ }
    if (entries?.length) {
      const restoredHistory = resumePrevious ? entries.slice(0, -1) : entries;
      if (resumePrevious) setReviewedAnswer(entries[entries.length - 1]);
      const replay = replayAnswers(restoredHistory);
      setHistory(restoredHistory); setProfile(replay.profile); setAnsweredIds(replay.answeredIds); setRecentDims(replay.recentDims); setStage(entries[entries.length - 1].stage); setRestored(true);
    }
    setDraftReady(true);
  }, [owner, resumePrevious, initialHistory]);
  useEffect(() => {
    if (!draftReady) return;
    try { sessionStorage.setItem(ownedDraftKey(QUIZ_DRAFT_KEY, owner), encodeQuizDraft(history)); } catch {}
  }, [history, draftReady, owner]);

  // Select next question based on current state
  const step = resolveQuizStep(profile, new Set(answeredIds), stage, QUESTION_BANK, recentDims);
  const currentQuestion = step.question;

  const handleAnswer = useCallback((option: QuestionOption) => {
    if (!currentQuestion || !draftReady || completed.current) return;

    // Apply impacts to profile
    const newHistory = [...history, { questionId: currentQuestion.id, option, stage: step.stage }];
    const { profile: newProfile, recentDims: newRecent, answeredIds: newAnswered } = replayAnswers(newHistory);

    // Check stage advancement
    const nextStep = resolveQuizStep(newProfile, new Set(newAnswered), step.stage, QUESTION_BANK, newRecent);

    // Update state
    setProfile(newProfile);
    setAnsweredIds(newAnswered);
    setHistory(newHistory);
    setReviewedAnswer(null);
    setRecentDims(newRecent);
    setStage(nextStep.stage);
    try { sessionStorage.setItem(ownedDraftKey(QUIZ_DRAFT_KEY, owner), encodeQuizDraft(newHistory)); } catch {}

    // Check completion
    if (nextStep.complete && !completed.current) {
      completed.current = true;
      onComplete(newProfile, newAnswered, newHistory);
    }
  }, [currentQuestion, history, step.stage, onComplete, draftReady, owner]);

  const handleBack = useCallback(() => {
    if (history.length === 0) return;

    const lastEntry = history[history.length - 1];
    setReviewedAnswer(lastEntry);
    const newHistory = history.slice(0, -1);
    const { profile: newProfile, answeredIds: newAnswered, recentDims: newRecent } = replayAnswers(newHistory);

    setProfile(newProfile);
    setAnsweredIds(newAnswered);
    setHistory(newHistory);
    setStage(lastEntry.stage);
    setRecentDims(newRecent);
  }, [history, answeredIds, profile]);

  const estimatedTotal = getEstimatedTotal();

  useEffect(() => {
    if (draftReady && step.complete && answeredIds.length > 0 && !completed.current) {
      completed.current = true;
      onComplete(profile, answeredIds, history);
    }
  }, [step.complete, answeredIds, profile, onComplete, draftReady, history]);

  if (!draftReady) return <p role="status" className="p-12 text-center text-text-secondary animate-page-in">Preparando el test…</p>;
  if (!currentQuestion) return step.complete
    ? <p role="status" className="p-12 text-center text-text-secondary animate-page-in">Preparando tus recomendaciones…</p>
    : <div role="alert" className="mx-auto max-w-lg p-12 text-center animate-page-in"><p className="text-text-secondary">No hemos podido continuar el test. Tus respuestas siguen guardadas.</p><Button variant="outline" onClick={handleBack} className="mt-5">Volver a la pregunta anterior</Button></div>;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress */}
      <div className="fixed top-20 left-0 right-0 z-40 border-b border-border-light bg-bg-primary/85 px-4 pt-2 pb-1 backdrop-blur-sm">
        {restored && <p role="status" className="mx-auto max-w-lg text-xs font-medium text-violet animate-fade-in">Hemos recuperado tus respuestas de esta pestaña.</p>}
        <ProgressTracker
          stage={step.stage}
          totalAnswered={answeredIds.length}
          estimatedTotal={estimatedTotal}
        />
      </div>

      {/* Question area */}
      <div className="flex-1 flex items-center justify-center px-4 py-28">
        <QuestionCard
          key={currentQuestion.id}
          question={currentQuestion}
          onAnswer={handleAnswer}
          questionNumber={answeredIds.length + 1}
          totalAnswered={answeredIds.length}
          initialAnswer={reviewedAnswer?.questionId === currentQuestion.id ? reviewedAnswer.option : undefined}
        />
      </div>

      {/* Back button */}
      {history.length > 0 && (
        <div className="fixed bottom-6 left-6 animate-fade-in">
          <button
            onClick={handleBack}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shadow-card")}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Anterior
          </button>
        </div>
      )}
    </div>
  );
}
