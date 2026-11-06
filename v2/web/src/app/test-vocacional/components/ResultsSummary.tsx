"use client";

import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase-client";
import Link from "next/link";
import {
  ArrowRight, RotateCcw,
  CheckCircle, ChevronDown, LogIn, Brain, Gem, AlertTriangle, Target, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem } from "@/components/motion";
import MeterBar from "./MeterBar";
import type { StudentProfile, CareerMatch, CareerProfile, CityMatch } from "../types";
import { buildCareerProfile } from "../lib/career-profiles";
import { resolveCareerRiasec } from '../lib/career-riasec';
import { VOCATIONAL_MATCHING_VERSION } from '@/lib/vocational-version';
import { REQUIRED_PRACTICAL_QUESTIONS } from '../lib/quiz-flow';
import { computeAllMatches, getTopMatches } from "../lib/matching-engine";
import { matchCities } from "../lib/city-profiles";
import { justifyCareer, justifyUniversity, justifyCity, buildProfileSummary } from "../lib/justifications";
import type { BigFiveScores } from "../lib/big-five";
import ProfileRadar from "./ProfileRadar";
import CareerResultCard from "./CareerResultCard";
import CityMatchSection from "./CityMatchSection";
import BigFiveSummary from './BigFiveSummary';
import { QUIZ_DRAFT_KEY } from '../lib/quiz-draft';
import { ownedDraftKey, BIG_FIVE_DRAFT_KEY, ATTEMPT_KEY, HANDOFF_KEY, PENDING_KEY, removeUnchangedDraft } from '../lib/draft-storage';
import { careerCommunity } from '../lib/geography';

interface ResultsSummaryProps {
  owner: string | null;
  profile: StudentProfile;
  answeredIds: string[];
  onRestart: () => void;
  bigFiveScores?: BigFiveScores;
  mbtiType?: string;
  hollandCode?: string;
  narrative?: { summary: string; workStyle: string; strengths: string[] };
  completionSeconds?: number | null;
}

type DbCareer = {
  id: string;
  name: string;
  branch: string;
  cut_off_score: number | null;
  cut_off_year: number | null;
  campus: string | null;
  modality: string | null;
  duration_years: number;
  employment_rate: number | null;
  riasec_scores: Record<string, number> | null;
  degree_type: string | null;
  universities: { id: string; name: string; short_name: string; slug: string; type: string; comunidad_autonoma: string | null }[] | null;
};

export default function ResultsSummary({
  owner,
  profile,
  answeredIds,
  onRestart,
  bigFiveScores,
  mbtiType,
  hollandCode,
  narrative,
  completionSeconds,
}: ResultsSummaryProps) {
  const supabase = useMemo(() => createClient(), []);
  const [topMatches, setTopMatches] = useState<CareerMatch[]>([]);
  const [aspirationalMatches, setAspirationalMatches] = useState<CareerMatch[]>([]);
  const [cityMatches, setCityMatches] = useState<CityMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});
  const [resultId, setResultId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showAspirational, setShowAspirational] = useState(false);
  const [uniNames, setUniNames] = useState<Record<string, string>>({});
  const needsLogin = !owner;
  const practicalComplete = REQUIRED_PRACTICAL_QUESTIONS.every(id => answeredIds.includes(id));
  const attempt = useRef<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);

  const prepareLoginHandoff = () => {
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ confirmed: true, at: Date.now(), bundle: { profile, answeredIds, bigFiveScores, mbtiType, hollandCode, narrative, completionSeconds } }));
      for (const key of [QUIZ_DRAFT_KEY, BIG_FIVE_DRAFT_KEY, ATTEMPT_KEY]) sessionStorage.removeItem(ownedDraftKey(key, null));
    } catch {}
  };

  // Load careers and compute matches
  useEffect(() => {
    let computed = false;
    let cancelled = false;
    const controller = new AbortController();
    const attemptKey = ownedDraftKey(ATTEMPT_KEY, owner);
    if (!attempt.current) {
      try { const stored = sessionStorage.getItem(attemptKey); if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) attempt.current = stored; } catch {}
      attempt.current ??= crypto.randomUUID();
      try { sessionStorage.setItem(attemptKey, attempt.current); } catch {}
    }
    const attemptId = attempt.current;
    const snapshots = [QUIZ_DRAFT_KEY, BIG_FIVE_DRAFT_KEY, ATTEMPT_KEY, PENDING_KEY].map(key => {
      const owned = ownedDraftKey(key, owner);
      try { return [owned, sessionStorage.getItem(owned)] as const; } catch { return [owned, null] as const; }
    });
    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id ?? null) !== owner) { cancelled = true; controller.abort(); }
    });
    async function load() {
      setLoading(true);
      setLoadError(false);
      setSaveError(false);
      // PostgREST caps each response. Read the complete catalogue with a stable
      // order; otherwise recommendations depend on the first 1,000 database rows.
      const careers: DbCareer[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("careers")
          .select("id, name, branch, cut_off_score, cut_off_year, campus, modality, duration_years, employment_rate, riasec_scores, degree_type, universities(id, name, short_name, slug, type, comunidad_autonoma)")
          .order("id").range(offset, offset + 499).abortSignal(controller.signal);
        if (error) throw error;
        if (cancelled) return;
        const rows = (data ?? []).map(row => ({ ...row, universities: Array.isArray(row.universities) ? row.universities : row.universities ? [row.universities] : [] })) as DbCareer[];
        careers.push(...rows);
        if (rows.length < 500) break;
      }
      const { data: authData } = await supabase.auth.getUser();
      if (cancelled || (authData.user?.id ?? null) !== owner) return;

      if (authData?.user) setUserId(authData.user.id);

      if (!careers || careers.length === 0) {
        setLoading(false);
        return;
      }

      // Build career profiles from DB data
      const careerProfiles: CareerProfile[] = careers.map((c: DbCareer) => {
        const built = buildCareerProfile(
          c.name,
          c.branch as "ciencias" | "ciencias_salud" | "ingenieria_arquitectura" | "artes_humanidades" | "ciencias_sociales_juridicas",
          c.cut_off_score,
          (c.degree_type as "grado" | "doble_grado") ?? "grado"
        );

        const riasec = resolveCareerRiasec(built.riasec, c.riasec_scores);

        return {
          id: c.id,
          name: c.name,
          branch: c.branch,
          cut_off_score: c.cut_off_score,
          duration_years: c.duration_years,
          employment_rate: c.employment_rate,
          university_id: c.universities?.[0]?.id ?? null,
          university_type: c.universities?.[0]?.type ?? undefined,
          campus: c.campus,
          modality: c.modality,
          location_region: careerCommunity(c.campus, c.universities?.[0]?.comunidad_autonoma),
          cut_off_year: c.cut_off_year,
          degree_type: c.degree_type ?? undefined,
          riasec,
          aptitudes: built.aptitudes,
          valores: built.valores,
          aversiones: built.aversiones,
          ambicion: built.ambicion,
          tags: built.tags,
        } satisfies CareerProfile;
      });

      // Build university name map
      const names: Record<string, string> = {};
      for (const c of careers) {
        const uni = c.universities?.[0];
        if (uni) names[c.id] = uni.short_name || uni.name;
      }
      setUniNames(names);

      // Compute matches
      const allMatches = computeAllMatches(profile, careerProfiles);
      const { top, aspirational } = getTopMatches(allMatches, 10, 5);
      setTopMatches(top);
      setAspirationalMatches(aspirational);

      // Compute city matches
      const cities = matchCities(profile, 5);
      setCityMatches(cities);
      setJustifications(Object.fromEntries([...top, ...aspirational].map(m => [m.career.id, justifyCareer(profile, bigFiveScores ?? null, m)])));

      setLoading(false);
      computed = true;

      // Save results via API (only if logged in — anonymous users will be prompted to login first)
      if (authData?.user) {
        // Justificaciones personalizadas con IA (Gemini). Una sola llamada para
        // todas las carreras (top + aspiracionales). Si falla por cualquier
        // motivo (sin cuota, error, timeout) caemos a las plantillas mejoradas.
        const aiInput = [
          ...top.map((m) => ({
            id: m.career.id, name: m.career.name, branch: m.career.branch,
            score: m.scoreFinal, cut_off: m.career.cut_off_score,
            cut_off_year: m.career.cut_off_year, is_aspirational: false,
          })),
          ...aspirational.map((m) => ({
            id: m.career.id, name: m.career.name, branch: m.career.branch,
            score: m.scoreFinal, cut_off: m.career.cut_off_score,
            cut_off_year: m.career.cut_off_year, is_aspirational: true,
          })),
        ];
        let aiJust: Record<string, string> = {};
        try {
          const summary = buildProfileSummary(profile, bigFiveScores ?? null, mbtiType, hollandCode);
          const jr = await fetch("/api/vocational/justify", {
            signal: controller.signal,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profileSummary: summary, careers: aiInput }),
          });
          if (cancelled) return;
          if (jr.ok) {
            const jj = await jr.json();
            if (cancelled) return;
            if (jj?.justifications && typeof jj.justifications === "object") {
              aiJust = jj.justifications;
            }
          }
        } catch {
          // silencioso: fallback a plantillas
        }

        if (cancelled) return;
        const careerJust = top.map((m) => {
          const uni = (careers.find((c: DbCareer) => c.id === m.career.id)?.universities || [])[0];
          return {
            career_id: m.career.id,
            name: m.career.name,
            branch: m.career.branch,
            score: m.scoreFinal,
            justification: aiJust[m.career.id] || justifyCareer(profile, bigFiveScores ?? null, m),
            university_id: uni?.id,
            university_name: uni?.name,
            university_short: uni?.short_name ?? undefined,
            university_type: uni?.type,
            cut_off: m.career.cut_off_score,
            cut_off_year: m.career.cut_off_year,
            campus: m.career.campus,
            modality: m.career.modality,
            location_region: m.career.location_region,
            duration_years: m.career.duration_years,
            employment_rate: m.career.employment_rate,
            is_aspirational: false,
          };
        });
        const aspirationalJust = aspirational.map((m) => {
          const uni = (careers.find((c: DbCareer) => c.id === m.career.id)?.universities || [])[0];
          return {
            career_id: m.career.id,
            name: m.career.name,
            branch: m.career.branch,
            score: m.scoreFinal,
            justification: aiJust[m.career.id] || justifyCareer(profile, bigFiveScores ?? null, m),
            university_id: uni?.id,
            university_name: uni?.name,
            university_short: uni?.short_name ?? undefined,
            cut_off: m.career.cut_off_score,
            cut_off_year: m.career.cut_off_year,
            campus: m.career.campus,
            modality: m.career.modality,
            location_region: m.career.location_region,
            duration_years: m.career.duration_years,
            is_aspirational: true,
          };
        });

        // Build top universities (one per top career)
        const universitiesData = await supabase
          .from("universities")
          .select("id, name, short_name, type, city, comunidad_autonoma").abortSignal(controller.signal);
        if (cancelled) return;
        if (universitiesData.error) throw universitiesData.error;
        const uniById = new Map<string, { id: string; name: string; short_name: string | null; type: string; city: string; comunidad_autonoma: string }>();
        for (const u of (universitiesData.data || [])) uniById.set(u.id, u);

        const topUniversities = top.slice(0, 8).map((m) => {
          const dbCareer = careers.find((c: DbCareer) => c.id === m.career.id);
          const uni = dbCareer?.universities?.[0];
          if (!uni) return null;
          const fullUni = uniById.get(uni.id);
          if (!fullUni) return null;
          return {
            university_id: fullUni.id,
            name: fullUni.name,
            short_name: fullUni.short_name ?? undefined,
            city: fullUni.city,
            comunidad: fullUni.comunidad_autonoma,
            campus: m.career.campus,
            modality: m.career.modality,
            location_region: m.career.location_region,
            cut_off_year: m.career.cut_off_year,
            type: fullUni.type,
            career_name: m.career.name,
            cut_off: m.career.cut_off_score,
            justification: justifyUniversity(profile, fullUni, m.career),
          };
        }).filter(Boolean);

        const topCitiesEnriched = cities.map((cm) => ({
          name: cm.city.name,
          comunidad: cm.city.comunidad,
          size: cm.city.size,
          cost_of_living: cm.city.cost_of_living,
          score: cm.score,
          reasons: cm.reasons,
          justification: justifyCity(profile, bigFiveScores ?? null, cm.city),
        }));

        const { data: currentAuth } = await supabase.auth.getUser();
        if (cancelled || currentAuth.user?.id !== owner) return;
        const saveRes = await fetch("/api/vocational/save", {
          signal: controller.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedUserId: owner, attemptId,
            profile: { ...profile, matching_version: practicalComplete ? VOCATIONAL_MATCHING_VERSION : 'legacy-incomplete' },
            bigFive: bigFiveScores,
            mbtiType,
            hollandCode,
            personalityNarrative: narrative?.summary,
            workStyle: narrative?.workStyle,
            strengths: narrative?.strengths,
            topCareers: [...careerJust, ...aspirationalJust],
            topUniversities,
            topCities: topCitiesEnriched,
            answeredIds,
            completionSeconds,
          }),
        });
        if (cancelled) return;
        if (saveRes.ok) {
          const json = await saveRes.json();
          if (cancelled) return;
          setResultId(json.resultId);
          setSaved(true);
          try { for (const [key, snapshot] of snapshots) removeUnchangedDraft(key, snapshot); } catch {}
        } else { setSaveError(true); }
      }
    }

    void load().catch(() => { if (!cancelled) { setLoading(false); if (computed) setSaveError(true); else setLoadError(true); } });
    return () => { cancelled = true; controller.abort(); authSubscription.subscription.unsubscribe(); };
  }, [supabase, profile, answeredIds, retry, owner]);

  const handleFeedback = useCallback(async (careerId: string, positive: boolean) => {
    setFeedback((prev) => ({ ...prev, [careerId]: positive }));
    if (!resultId || !userId) return;
    await supabase
      .from("vocational_feedback")
      .upsert({ user_id: userId, result_id: resultId, career_id: careerId, is_positive: positive });
  }, [resultId, userId, supabase]);

  if (loadError) return <div role="alert" className="mx-auto max-w-lg p-10 text-center"><h2 className="text-xl font-bold">No hemos podido completar el análisis</h2><p className="my-4">Tus respuestas siguen aquí. Reintenta para consultar todo el catálogo.</p><button onClick={() => setRetry(value => value + 1)} className="rounded-xl bg-violet px-5 py-3 text-white">Reintentar</button></div>;
  if (loadError) return (
    <div role="alert" className="mx-auto max-w-lg px-4 py-24 text-center animate-page-in">
      <p className="eyebrow">Test vocacional</p>
      <h2 className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-text-primary">No hemos podido completar el análisis</h2>
      <p className="mt-3 text-text-secondary">Tus respuestas siguen aquí. Reintenta para consultar todo el catálogo.</p>
      <Button onClick={() => setRetry(value => value + 1)} className="mt-6">Reintentar</Button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <div className="text-center animate-page-in">
          <div className="mx-auto mb-5 h-9 w-9 animate-spin rounded-full border-2 border-border border-t-violet" aria-hidden="true" />
          <p className="font-heading text-lg font-bold text-text-primary">Analizando tu perfil...</p>
          <p className="mt-1 text-sm text-text-muted">Comparando con miles de carreras</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary animate-page-in">
      {/* Cabecera editorial: rótulo, titular grande y avisos de estado */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Tus resultados</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">Tu perfil vocacional</h1>
            <p className="mt-4 text-lg text-text-secondary">
              A partir de {answeredIds.length} {answeredIds.length === 1 ? 'respuesta' : 'respuestas'}, comparamos tus intereses, aptitudes declaradas y preferencias con el catálogo de carreras.
            </p>
            {!practicalComplete && <aside className="mt-6 rounded-2xl border border-border bg-bg-secondary/60 p-4 text-left text-sm text-text-secondary">Este recorrido terminó sin algunos ajustes prácticos. Repite el test para incluir tu nota, presupuesto y movilidad.<button onClick={onRestart} className="mt-2 inline-flex min-h-11 items-center font-semibold text-violet link-underline">Completar mi orientación</button></aside>}
            {saved && (
              <div className="mt-5 flex flex-col items-center gap-2">
                <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-success">
                  <CheckCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Resultados guardados en tu perfil
                </p>
                <Link
                  href="/test-vocacional/resultado"
                  className="group inline-flex items-center gap-1.5 text-sm font-semibold text-violet"
                >
                  Ver mi resultado completo
                  <ArrowRight className="h-3.5 w-3.5 arrow-nudge" aria-hidden="true" />
                </Link>
              </div>
            )}
            {saveError && <div role="alert" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">Tus recomendaciones están calculadas, pero no se han guardado en tu perfil.<button onClick={() => setRetry(value=>value+1)} className="ml-2 font-bold underline">Reintentar guardado</button></div>}
            {needsLogin && (
              <div className="mt-6 inline-flex flex-col items-center gap-3 rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
                <p className="text-sm text-text-secondary">
                  Inicia sesión o regístrate para guardar este resultado en tu perfil.
                </p>
                <Link
                  href="/login?next=/test-vocacional"
                  onClick={prepareLoginHandoff}
                  className={buttonVariants({ variant: "dark" })}
                >
                  <LogIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Inicia sesión para guardar
                </Link>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        {/* Personalidad + radar + dimensiones */}
        {bigFiveScores && <Reveal className="mb-6"><BigFiveSummary scores={bigFiveScores} /></Reveal>}
        <Reveal className="mb-12 grid gap-6 md:grid-cols-2">
          <div className="flex items-center justify-center rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
            <ProfileRadar profile={profile} />
          </div>

          <div className="space-y-3">
            {/* Aptitudes principales */}
            <DimensionCard
              title="Aptitudes que has señalado"
              icon={Brain}
              items={Object.entries(profile.aptitudes)
                .filter(([, value]) => value > 0)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([k, v]) => ({ label: formatLabel(k), value: v, max: 15 }))}
            />
            {/* Valores principales */}
            <DimensionCard
              title="Lo que valoras"
              icon={Gem}
              items={Object.entries(profile.valores)
                .filter(([, value]) => value > 0)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([k, v]) => ({ label: formatLabel(k), value: v, max: 15 }))}
            />
            {/* Aversiones */}
            {Object.entries(profile.aversiones).some(([, v]) => v > 3) && (
              <DimensionCard
                title="Lo que evitas"
                icon={AlertTriangle}
                items={Object.entries(profile.aversiones)
                  .filter(([, v]) => v > 3)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 3)
                  .map(([k, v]) => ({ label: formatLabel(k), value: v, max: 10, inverted: true }))}
              />
            )}
          </div>
        </Reveal>

        {/* Carreras recomendadas */}
        {profile.geografico.movilidad === 1 && profile.geografico.comunidad_actual && <aside className="mb-6 rounded-2xl border border-border bg-bg-secondary/60 p-5 text-sm text-text-secondary">Has elegido estudiar en tu zona. Mostramos ofertas ubicadas en ella según la ubicación disponible en el catálogo y opciones a distancia. En estas últimas, revisa si las prácticas o los exámenes exigen desplazarte.</aside>}
        {topMatches.length === 0 && aspirationalMatches.length === 0 && <section className="mb-12 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8"><h2 className="font-heading text-xl font-bold text-text-primary">No hemos encontrado ofertas con estas condiciones</h2><p className="mt-2 text-sm text-text-secondary">El catálogo puede tener información incompleta sobre campus o modalidad. Revisa otras ofertas o ajusta tus preferencias.</p><div className="mt-4 flex flex-wrap gap-4"><Link href="/notas-corte" className="inline-flex min-h-11 items-center font-semibold text-violet link-underline">Explorar carreras</Link><button onClick={onRestart} className="min-h-11 font-semibold text-violet link-underline">Revisar mis preferencias</button></div></section>}
        {topMatches.length > 0 && (
          <div className="mb-12">
            <Reveal className="mb-6">
              <p className="eyebrow">Carreras</p>
              <h2 className="mt-2 font-heading text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">
                Carreras para explorar
              </h2>
            </Reveal>
            <Reveal stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topMatches.map((m, i) => (
                <RevealItem key={m.career.id} index={i} className="h-full">
                  <CareerResultCard
                    match={m}
                    justification={justifications[m.career.id]}
                    universityName={uniNames[m.career.id]}
                    feedback={feedback[m.career.id] ?? null}
                    onFeedback={(positive) => handleFeedback(m.career.id, positive)}
                    rank={i + 1}
                  />
                </RevealItem>
              ))}
            </Reveal>
          </div>
        )}

        {/* Opciones con corte superior a la nota */}
        {aspirationalMatches.length > 0 && (
          <Reveal className="mb-12">
            <button
              onClick={() => setShowAspirational(!showAspirational)}
              aria-expanded={showAspirational}
              className="mb-3 flex items-center gap-2 text-text-primary transition-colors hover:text-violet"
            >
              <Target className="h-5 w-5 text-violet" strokeWidth={1.75} aria-hidden="true" />
              <span className="font-heading text-lg font-bold">Opciones con un corte superior a tu nota</span>
              <ChevronDown className={cn("h-5 w-5 text-text-muted transition-transform duration-300 ease-[var(--ease-out-quart)]", showAspirational && "rotate-180")} aria-hidden="true" />
            </button>
            <p className="mb-5 max-w-2xl text-sm text-text-muted">
              Su corte de referencia supera tu nota estimada. Puede cambiar en cada convocatoria: consulta las vías de acceso y los requisitos de cada oferta.
            </p>
            {showAspirational && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {aspirationalMatches.map((m, i) => (
                  <div key={m.career.id} className="h-full animate-list-in" style={{ ["--i" as string]: i } as CSSProperties}>
                    <CareerResultCard
                      match={m}
                      justification={justifications[m.career.id]}
                      universityName={uniNames[m.career.id]}
                      feedback={feedback[m.career.id] ?? null}
                      onFeedback={(positive) => handleFeedback(m.career.id, positive)}
                    />
                  </div>
                ))}
              </div>
            )}
          </Reveal>
        )}

        {/* Ciudades */}
        <Reveal className="mb-12 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
          <CityMatchSection cities={cityMatches} />
        </Reveal>

        {/* Acciones finales */}
        <Reveal className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="outline" size="lg" onClick={onRestart}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Repetir Test
          </Button>
          <Link href="/notas-corte" className={cn(buttonVariants({ variant: "dark", size: "lg" }), "group")}>
            Explorar Carreras
            <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </div>
  );
}

/* ── Componentes auxiliares ── */

function DimensionCard({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: LucideIcon;
  items: { label: string; value: number; max: number; inverted?: boolean }[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
      <h3 className="mb-4 flex items-center gap-2 font-heading text-sm font-bold text-text-primary">
        <Icon className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" />
        {title}
      </h3>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-text-secondary">Tus respuestas aún no aportan señales suficientes en este apartado.</p>}
        {items.map((item, i) => {
          const pct = Math.min((Math.abs(item.value) / item.max) * 100, 100);
          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-xs text-text-secondary">{item.label}</span>
                <span className="text-xs font-medium text-text-muted">{pct >= 66 ? 'Más presente' : pct >= 33 ? 'Presente' : 'Algo presente'}</span>
              </div>
              <MeterBar value={pct} delay={i * 80} barClassName={item.inverted ? "bg-amber-400" : undefined} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatLabel(key: string): string {
  const map: Record<string, string> = {
    logico_matematica: "Lógico-Matemática",
    verbal_linguistica: "Verbal-Lingüística",
    cientifico_tecnica: "Científico-Técnica",
    espacial_visual: "Espacial-Visual",
    interpersonal: "Interpersonal",
    corporal_kinestesica: "Corporal-Kinestésica",
    creatividad: "Creatividad",
    impacto_social: "Impacto Social",
    prestigio: "Prestigio",
    seguridad_economica: "Seguridad Económica",
    autonomia: "Autonomía",
    conciliacion: "Conciliación",
    matematicas: "Matemáticas",
    sangre: "Sangre/Cuerpo",
    hablar_publico: "Hablar en público",
    trabajar_solo: "Trabajar solo",
    rutina: "Rutina",
  };
  return map[key] || key.replace(/_/g, " ");
}
