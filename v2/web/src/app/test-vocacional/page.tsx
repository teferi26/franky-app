"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Compass, ArrowRight, Clock, GraduationCap, Brain, MapPin, RotateCcw,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Magnetic } from "@/components/motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { StudentProfile } from "./types";
import { calculateBigFive, deriveMbtiType, generatePersonalityNarrative, getMbtiNickname } from "./lib/big-five";
import type { BigFiveScores } from "./lib/big-five";
import { useAuth } from "@/hooks/useAuth";
import { QUIZ_DRAFT_KEY, decodeQuizDraft, type AnswerEntry } from './lib/quiz-draft';
import { ownedDraftKey, BIG_FIVE_DRAFT_KEY, ATTEMPT_KEY, HANDOFF_KEY, PENDING_KEY } from './lib/draft-storage';

// Cada fase del test se carga bajo demanda (dynamic import por fase): la pagina arranca
// en intro y solo se ve una a la vez, asi que se evita empaquetar las 3 fases en el JS inicial.
const PhaseSpinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-bg-primary" role="status" aria-label="Cargando">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-violet" />
  </div>
);

const QuizEngine = dynamic(() => import("./components/QuizEngine"), { loading: PhaseSpinner });
const BigFiveQuiz = dynamic(() => import("./components/BigFiveQuiz"), { loading: PhaseSpinner });
const ResultsSummary = dynamic(() => import("./components/ResultsSummary"), { loading: PhaseSpinner });

type Phase = "loading" | "intro" | "existing" | "vocational" | "bigfive" | "results";

interface PendingBundle {
  profile: StudentProfile;
  answeredIds: string[];
  bigFiveScores: BigFiveScores;
  mbtiType: string;
  hollandCode: string;
  narrative: { summary: string; workStyle: string; strengths: string[] };
  completionSeconds: number | null;
}

interface ExistingResult {
  id: string;
  mbti_type: string | null;
  questions_answered: number | null;
  created_at: string;
}

export default function TestVocacionalPage() {
  const { user, loading: authLoading } = useAuth();
  if (authLoading) return <PhaseSpinner />;
  return <OwnedVocationalPage key={user?.id ?? 'anonymous'} owner={user?.id ?? null} />;
}

function OwnedVocationalPage({ owner }: { owner: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceRedo = searchParams.get("redo") === "1";

  const [phase, setPhase] = useState<Phase>("loading");
  const [existingResult, setExistingResult] = useState<ExistingResult | null>(null);
  const [vocationalProfile, setVocationalProfile] = useState<StudentProfile | null>(null);
  const [vocationalAnsweredIds, setVocationalAnsweredIds] = useState<string[]>([]);
  const [bigFiveAnswers, setBigFiveAnswers] = useState<Record<string, number> | null>(null);
  const [pendingBundle, setPendingBundle] = useState<PendingBundle | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [resumePrevious, setResumePrevious] = useState(false);
  const [vocationalHistory, setVocationalHistory] = useState<AnswerEntry[] | undefined>();
  const acceptedHandoff = useRef<Record<string, unknown> | null>(null);
  useEffect(() => { try { setHasDraft(!!decodeQuizDraft(sessionStorage.getItem(ownedDraftKey(QUIZ_DRAFT_KEY, owner)))?.history.length); } catch {} }, [phase, owner]);

  // Detect existing result on load (also flush any pending result from sessionStorage)
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (forceRedo) {
      setPhase("intro");
      return;
    }
    if (!owner) {
      setPhase("intro");
      return;
    }

    // If we have a pending result stashed from before login, save it now
    let pending: Record<string, unknown> | null = acceptedHandoff.current;
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      const handoff = raw && raw.length < 100000 ? JSON.parse(raw) : null;
      if (handoff?.confirmed === true && Number.isFinite(handoff.at) && Date.now()-handoff.at < 600000 && handoff.at <= Date.now() && handoff.bundle?.profile && Array.isArray(handoff.bundle.answeredIds)) {
        pending = handoff.bundle;
        // Persist under the account before consuming the one-time handoff.
        // A reload or failed save can now recover the same result and attempt.
        sessionStorage.setItem(ownedDraftKey(PENDING_KEY, owner), JSON.stringify({ at: Date.now(), bundle: pending }));
        sessionStorage.setItem(ownedDraftKey(ATTEMPT_KEY, owner), crypto.randomUUID());
        sessionStorage.removeItem(HANDOFF_KEY);
      } else if (!pending) {
        const saved = sessionStorage.getItem(ownedDraftKey(PENDING_KEY, owner));
        const draft = saved && saved.length < 100000 ? JSON.parse(saved) : null;
        if (draft?.at <= Date.now() && Date.now()-draft.at < 86400000 && draft.bundle?.profile && Array.isArray(draft.bundle.answeredIds)) pending = draft.bundle;
      }
      acceptedHandoff.current = pending;
    } catch {}

    if (pending) {
      // Re-render ResultsSummary with the pending bundle so it saves with full enrichment
      const bundle = pending as unknown as PendingBundle;
      setPendingBundle(bundle);
      setVocationalProfile(bundle.profile);
      setVocationalAnsweredIds(bundle.answeredIds);
      setPhase("results");
      return;
    }

    fetch("/api/vocational/result", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.result) {
          setExistingResult({
            id: data.result.id,
            mbti_type: data.result.mbti_type,
            questions_answered: data.result.questions_answered,
            created_at: data.result.created_at,
          });
          setPhase("existing");
        } else {
          setPhase("intro");
        }
      })
      .catch(() => { if (!cancelled) setPhase("intro"); });
    return () => { cancelled = true; controller.abort(); };
  }, [owner, forceRedo]);

  const handleVocationalComplete = useCallback((profile: StudentProfile, ids: string[], history: AnswerEntry[]) => {
    setResumePrevious(false);
    setVocationalHistory(history);
    setVocationalProfile(profile);
    setVocationalAnsweredIds(ids);
    setPhase("bigfive");
  }, []);

  const handleBigFiveComplete = useCallback((answers: Record<string, number>) => {
    setBigFiveAnswers(answers);
    setPhase("results");
  }, []);

  const handleStart = () => {
    setResumePrevious(false);
    setVocationalHistory(undefined);
    acceptedHandoff.current = null;
    try { for (const key of [QUIZ_DRAFT_KEY, BIG_FIVE_DRAFT_KEY, ATTEMPT_KEY, PENDING_KEY]) sessionStorage.removeItem(ownedDraftKey(key, owner)); sessionStorage.removeItem(HANDOFF_KEY); } catch {}
    setPendingBundle(null); setBigFiveAnswers(null); setVocationalProfile(null); setVocationalAnsweredIds([]);
    setStartTime(Date.now());
    setPhase("vocational");
  };

  /* ── LOADING ── */
  if (phase === "loading") return <PhaseSpinner />;

  /* ── EXISTING RESULT (logged + has result, not redoing) ── */
  if (phase === "existing" && existingResult) {
    const nickname = existingResult.mbti_type ? getMbtiNickname(existingResult.mbti_type) : null;
    return (
      <div className="relative min-h-screen overflow-hidden bg-bg-primary">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 pb-16 lg:pt-24 lg:pb-24">
          <div className="max-w-2xl">
            <p className="eyebrow animate-slide-up">Test vocacional</p>
            <h1 className="mt-4 text-fluid-h1 font-extrabold text-text-primary animate-slide-up [animation-delay:60ms]">
              Ya hiciste el test
            </h1>
            <p className="mt-4 max-w-lg text-fluid-lead text-text-secondary animate-slide-up [animation-delay:120ms]">
              Tu resultado del{" "}
              {new Date(existingResult.created_at).toLocaleDateString("es-ES", { dateStyle: "long" })}
              {existingResult.questions_answered ? `, con ${existingResult.questions_answered} respuestas` : ""}.
            </p>
            {nickname && (
              <p className="mt-4 inline-flex items-center gap-2 font-heading text-lg font-bold text-violet animate-slide-up [animation-delay:160ms]">
                <Compass className="h-5 w-5" aria-hidden="true" />
                {nickname.label}
              </p>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center animate-slide-up [animation-delay:200ms]">
              <Magnetic>
                <Link
                  href="/test-vocacional/resultado"
                  className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group")}
                >
                  Ver mis resultados
                  <ArrowRight className="arrow-nudge h-4 w-4" aria-hidden="true" />
                </Link>
              </Magnetic>
              <Button variant="outline" size="lg" onClick={() => setPhase("intro")}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Volver a hacer
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── INTRO ── */
  if (phase === "intro") {
    return (
      <div className="relative min-h-screen overflow-hidden bg-bg-primary">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 pb-16 lg:pt-24 lg:pb-24">
          <div className="max-w-3xl">
            <p className="eyebrow animate-slide-up">Test vocacional · RIASEC y Big Five</p>
            <h1 className="mt-4 text-fluid-display font-extrabold text-text-primary animate-slide-up [animation-delay:60ms]">
              Descubre la carrera
              <br />
              <span className="text-violet">que encaja contigo.</span>
            </h1>
            <p className="mt-6 max-w-xl text-fluid-lead text-text-secondary animate-slide-up [animation-delay:120ms]">
              Un test profundo en dos partes: primero tu vocación (RIASEC, valores, aptitudes,
              estilo de vida) y después tu personalidad (Big Five). Te recomendamos carreras,
              universidades concretas y ciudades para tu perfil, y te explicamos el porqué.
            </p>

            {hasDraft && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-primary p-4 shadow-card animate-slide-up [animation-delay:150ms]">
                <p className="text-sm text-text-secondary">Tienes respuestas guardadas en esta pestaña durante 24 horas.</p>
                <Button variant="outline" onClick={() => { setStartTime(Date.now()); setPhase("vocational"); }}>
                  Continuar donde lo dejé
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}

            <div className="mt-8 animate-slide-up [animation-delay:180ms]">
              <Magnetic>
                <Button size="lg" variant="dark" className="btn-shine group" onClick={handleStart}>
                  Empezar test
                  <ArrowRight className="arrow-nudge h-4 w-4" aria-hidden="true" />
                </Button>
              </Magnetic>
            </div>

            {/* Cuatro datos del test en una fila, con el icono suelto. */}
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-border-light pt-8 sm:grid-cols-4 animate-slide-up [animation-delay:240ms]">
              <Stat icon={Clock} value="20-25 min" label="Duración" />
              <Stat icon={Brain} value="2 tests" label="Vocación y personalidad" />
              <Stat icon={GraduationCap} value="Carreras reales" label="Con su nota de corte" />
              <Stat icon={MapPin} value="Ciudades afines" label="Para tu forma de vivir" />
            </dl>

            <p className="mt-8 max-w-xl text-xs text-text-muted animate-slide-up [animation-delay:300ms]">
              Modelo basado en RIASEC (Holland) + Big Five (OCEAN), los marcos psicométricos
              más usados en orientación vocacional.
              {!owner && " Te pediremos iniciar sesión al final para guardar tus resultados."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── VOCATIONAL QUIZ ── */
  if (phase === "vocational") {
    return <QuizEngine owner={owner} resumePrevious={resumePrevious} initialHistory={vocationalHistory} onComplete={handleVocationalComplete} />;
  }

  /* ── BIG FIVE QUIZ ── */
  if (phase === "bigfive") {
    return (
      <BigFiveQuiz
        owner={owner}
        initialAnswers={bigFiveAnswers ?? undefined}
        onAnswersChange={setBigFiveAnswers}
        onComplete={handleBigFiveComplete}
        onBack={() => { setResumePrevious(true); setPhase("vocational"); }}
      />
    );
  }

  /* ── RESULTS ── */
  if (phase === "results" && vocationalProfile) {
    let bigFiveScores: BigFiveScores;
    let mbtiType: string;
    let hollandCode: string;
    let narrative: { summary: string; workStyle: string; strengths: string[] };
    let completionSeconds: number | null;

    if (pendingBundle) {
      ({ bigFiveScores, mbtiType, hollandCode, narrative, completionSeconds } = pendingBundle);
    } else if (bigFiveAnswers) {
      bigFiveScores = calculateBigFive(bigFiveAnswers);
      mbtiType = deriveMbtiType(bigFiveScores);
      const topRiasec = (Object.entries(vocationalProfile.riasec) as [string, number][])
        .sort(([, a], [, b]) => b - a).slice(0, 3).map(([k]) => k);
      const topValues = (Object.entries(vocationalProfile.valores) as [string, number][])
        .sort(([, a], [, b]) => b - a).slice(0, 3).map(([k]) => k);
      const topAptitudes = (Object.entries(vocationalProfile.aptitudes) as [string, number][])
        .sort(([, a], [, b]) => b - a).slice(0, 3).map(([k]) => k);
      narrative = generatePersonalityNarrative({
        bigFive: bigFiveScores,
        mbtiType,
        topRiasec,
        topValues,
        topAptitudes,
      });
      hollandCode = topRiasec.join("");
      completionSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : null;
    } else {
      return null;
    }

    return (
      <ResultsSummary
        owner={owner}
        profile={vocationalProfile}
        answeredIds={vocationalAnsweredIds}
        onRestart={() => {
          setVocationalProfile(null);
          setVocationalAnsweredIds([]);
          setBigFiveAnswers(null);
          setPendingBundle(null);
          setExistingResult(null);
          setPhase("intro");
          router.replace("/test-vocacional");
        }}
        bigFiveScores={bigFiveScores}
        mbtiType={mbtiType}
        narrative={narrative}
        completionSeconds={completionSeconds}
        hollandCode={hollandCode}
      />
    );
  }

  return null;
}

// Dato de la portada: icono suelto en violeta, valor en Outfit y rótulo pequeño.
function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: string; label: string }) {
  return (
    <div className="min-w-0">
      <Icon className="h-5 w-5 text-violet" aria-hidden="true" />
      <dt className="sr-only">{label}</dt>
      <dd className="mt-2 font-heading text-lg font-bold tracking-tight text-text-primary">{value}</dd>
      <dd className="mt-0.5 text-xs text-text-muted">{label}</dd>
    </div>
  );
}
