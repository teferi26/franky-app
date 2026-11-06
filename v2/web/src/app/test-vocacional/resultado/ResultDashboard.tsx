"use client";

import { formatAcademicDuration } from '@/lib/academic-duration';
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  Brain, GraduationCap, MapPin, Download,
  RotateCcw, ChevronDown, ChevronUp, Trophy, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { renderSafeMarkdown } from "@/lib/sanitize";
import { isCurrentVocationalResult } from '@/lib/vocational-version';
import { getMbtiNickname, type BigFiveTrait } from "../lib/big-five";

import { Reveal } from "@/components/motion";
import BigFiveSummary from '../components/BigFiveSummary';
import MeterBar from '../components/MeterBar';

interface CareerJustified {
  career_id?: string;
  name: string;
  branch: string;
  score: number;
  justification: string;
  university_name?: string;
  university_short?: string;
  university_id?: string;
  university_type?: string;
  city?: string;
  comunidad?: string;
  cut_off?: number | null;
  cut_off_year?: number | null;
  campus?: string | null;
  modality?: string | null;
  duration_years?: number;
  employment_rate?: number | null;
  is_aspirational?: boolean;
}

interface UniJustified {
  campus?: string | null;
  modality?: string | null;
  cut_off_year?: number | null;
  university_id: string;
  name: string;
  short_name: string;
  city: string;
  comunidad: string;
  type: string;
  career_name?: string;
  cut_off?: number | null;
  justification: string;
}

interface CityJustified {
  name: string;
  comunidad: string;
  size: string;
  cost_of_living: string;
  score: number;
  justification: string;
  reasons?: string[];
}

interface ResultRow {
  id: string;
  created_at: string;
  scores: Record<string, number> | null;
  top_categories: string[] | null;
  big_five: Record<BigFiveTrait, number> | null;
  mbti_type: string | null;
  holland_code: string | null;
  personality_narrative: string | null;
  strengths: string[] | null;
  work_style: string | null;
  top_careers: CareerJustified[] | null;
  top_universities: UniJustified[] | null;
  top_cities: CityJustified[] | null;
  profile_snapshot: Record<string, unknown> | null;
  questions_answered: number | null;
}

interface Props {
  result: ResultRow;
}

const RIASEC_LABELS: Record<string, string> = {
  R: "Realista",
  I: "Investigador",
  A: "Artístico",
  S: "Social",
  E: "Emprendedor",
  C: "Convencional",
};

const BRANCH_LABELS: Record<string, string> = {
  ciencias: 'Ciencias', ciencias_salud: 'Ciencias de la Salud',
  ingenieria_arquitectura: 'Ingeniería y Arquitectura',
  artes_humanidades: 'Artes y Humanidades',
  ciencias_sociales_juridicas: 'Ciencias Sociales y Jurídicas',
};

const RIASEC_DESCRIPTIONS: Record<string, string> = {
  R: "Práctico, manual, orientado a resultados tangibles",
  I: "Analítico, curioso, le encanta investigar",
  A: "Creativo, expresivo, sensibilidad estética",
  S: "Empático, colaborador, motivado por ayudar",
  E: "Líder, persuasivo, ambicioso",
  C: "Organizado, metódico, atento al detalle",
};

export default function ResultDashboard({ result }: Props) {
  const toast = useToast();
  const [showAllCareers, setShowAllCareers] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const careers = result.top_careers || [];
  const universities = result.top_universities || [];
  const cities = result.top_cities || [];
  const bigFive = result.big_five || null;
  const strengths = result.strengths || [];
  const mbtiType = result.mbti_type || "";
  const nickname = mbtiType ? getMbtiNickname(mbtiType) : null;

  const visibleCareers = showAllCareers ? careers : careers.slice(0, 5);

  const hollandCode = result.holland_code || (result.top_categories || []).join("");

  const downloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/vocational/pdf?id=${result.id}`);
      if (!res.ok) throw new Error("No se pudo generar el PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `franky-test-vocacional-${result.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo generar el PDF", "Inténtalo de nuevo en unos segundos.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary animate-page-in">
      {/* Cabecera editorial */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Tus resultados</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">Tu perfil vocacional</h1>
            <p className="mt-4 text-base text-text-secondary sm:text-lg">
              Basado en {result.questions_answered ?? 0} respuestas{bigFive ? ' y tu perfil de personalidad Big Five' : ''}.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={downloadPdf} disabled={downloadingPdf} variant="dark">
                <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {downloadingPdf ? "Generando…" : "Descargar PDF"}
              </Button>
              <Button asChild variant="outline">
                <Link href="/test-vocacional?redo=1">
                  <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Volver a hacer
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:py-14">
        {!isCurrentVocationalResult(result.profile_snapshot) && <aside className="rounded-2xl border border-border bg-bg-secondary/60 p-5">
          <h2 className="font-heading text-lg font-bold text-text-primary">Puedes actualizar tus recomendaciones</h2>
          <p className="mt-2 text-sm text-text-secondary">Hemos revisado cómo se comparan tus intereses y tus condiciones para estudiar. Este resultado conserva el cálculo anterior; repite el test para obtener recomendaciones con el cálculo actual.</p>
          <Link href="/test-vocacional?redo=1" className="mt-3 inline-flex min-h-11 items-center font-semibold text-violet link-underline">Actualizar mi orientación</Link>
        </aside>}

        {/* Personalidad */}
        <Reveal>
          <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <Brain className="mt-1 h-7 w-7 shrink-0 text-violet" strokeWidth={1.5} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Tu tipo de personalidad</p>
                <h2 className="mt-2 font-heading text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">
                  {nickname?.label || "Perfil único"}
                </h2>
                {mbtiType && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">{mbtiType}</Badge>
                    {hollandCode && <Badge variant="outline" className="text-xs">Holland: {hollandCode.slice(0, 3).toUpperCase()}</Badge>}
                  </div>
                )}
              </div>
            </div>

            {result.personality_narrative && (
              // Narrativa generada por IA: siempre pasa por el sanitizador.
              <div
                className="prose prose-sm mt-6 max-w-none leading-relaxed text-text-secondary"
                dangerouslySetInnerHTML={{
                  __html: renderSafeMarkdown(result.personality_narrative),
                }}
              />
            )}
            {result.work_style && (
              <p className="mt-4 text-sm text-text-secondary">{result.work_style}</p>
            )}

            {strengths.length > 0 && (
              <div className="mt-6 border-t border-border-light pt-5">
                <p className="eyebrow">Tus fortalezas</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {strengths.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-primary px-3 py-1.5 text-sm text-text-primary">
                      <Trophy className="h-3.5 w-3.5 text-violet" strokeWidth={1.75} aria-hidden="true" />
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </Reveal>

        {bigFive && <Reveal><BigFiveSummary scores={bigFive} /></Reveal>}

        {/* RIASEC */}
        {result.scores && (
          <Reveal>
            <Card className="p-6 sm:p-8">
              <p className="eyebrow">Intereses</p>
              <h3 className="mt-2 font-heading text-xl font-bold text-text-primary">Tu perfil de intereses (RIASEC)</h3>
              <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {Object.entries(result.scores)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, val], idx) => {
                    const max = Math.max(...Object.values(result.scores || {}));
                    const pct = max > 0 ? Math.round((val / max) * 100) : 0;
                    return (
                      <div key={key}>
                        <div className="mb-2 flex items-baseline justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                              <span className="w-5 shrink-0 text-xs font-bold text-text-muted tabular">{idx + 1}.</span>
                              {RIASEC_LABELS[key] || key}
                            </p>
                            <p className="pl-7 text-xs text-text-muted">{RIASEC_DESCRIPTIONS[key]}</p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-text-primary tabular">{pct}%</span>
                        </div>
                        <MeterBar value={pct} delay={idx * 80} />
                      </div>
                    );
                  })}
              </div>
            </Card>
          </Reveal>
        )}

        {/* Carreras */}
        {careers.length > 0 && (
          <Reveal>
            <Card className="p-6 sm:p-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">Carreras</p>
                  <h3 className="mt-2 font-heading text-xl font-bold text-text-primary">Carreras recomendadas para ti</h3>
                </div>
                <Badge variant="outline">{careers.length} {careers.length === 1 ? 'opción' : 'opciones'}</Badge>
              </div>
              <p className="mt-3 max-w-2xl text-sm text-text-secondary">La afinidad orienta sobre tus preferencias. No es una probabilidad de admisión ni garantiza una plaza. Consulta la nota y los requisitos actuales de cada oferta.</p>
              <div className="mt-6 space-y-4">
                {visibleCareers.map((c, idx) => (
                  <CareerCard key={`${c.career_id || c.name}-${idx}`} career={c} rank={idx + 1} />
                ))}
              </div>
              {careers.length > 5 && (
                <button
                  onClick={() => setShowAllCareers((v) => !v)}
                  aria-expanded={showAllCareers}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-sm font-semibold text-violet link-underline"
                >
                  {showAllCareers ? (
                    <>Ver menos <ChevronUp className="h-4 w-4" aria-hidden="true" /></>
                  ) : (
                    <>Ver las {careers.length - 5} restantes <ChevronDown className="h-4 w-4" aria-hidden="true" /></>
                  )}
                </button>
              )}
            </Card>
          </Reveal>
        )}

        {/* Universidades */}
        {universities.length > 0 && (
          <Reveal>
            <Card className="p-6 sm:p-8">
              <p className="eyebrow">Universidades</p>
              <h3 className="mt-2 font-heading text-xl font-bold text-text-primary">Universidades concretas para tu perfil</h3>
              <div className="mt-6 space-y-4">
                {universities.slice(0, 8).map((u, i) => (
                  <div key={`${u.university_id}-${u.career_name || ""}`} className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card animate-list-in sm:p-5" style={{ ["--i" as string]: i } as CSSProperties}>
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-heading font-bold text-text-primary">{u.name}</p>
                        <p className="text-sm text-text-muted">
                          {u.career_name && `${u.career_name} · `}{u.campus ? `Campus: ${u.campus}` : `Sede: ${u.city} · ${u.comunidad}`}{u.modality ? ` · ${u.modality}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={u.type === "publica" ? "success" : "outline"}>
                          {u.type === "publica" ? "Pública" : u.type === "privada" ? "Privada" : "Tipo por confirmar"}
                        </Badge>
                        {u.cut_off != null && <span className="text-xs text-text-muted tabular">Corte{u.cut_off_year ? ` ${u.cut_off_year}` : ''}: {u.cut_off.toLocaleString('es-ES', { maximumFractionDigits: 3 })}</span>}
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-text-secondary">{u.justification}</p>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        )}

        {/* Ciudades */}
        {cities.length > 0 && (
          <Reveal>
            <Card className="p-6 sm:p-8">
              <p className="eyebrow">Ciudades</p>
              <h3 className="mt-2 flex items-center gap-2 font-heading text-xl font-bold text-text-primary">
                <MapPin className="h-5 w-5 text-violet" strokeWidth={1.75} aria-hidden="true" />
                Ciudades que más encajan contigo
              </h3>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {cities.map((c, i) => (
                  <div key={c.name} className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card animate-list-in sm:p-5" style={{ ["--i" as string]: i } as CSSProperties}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <p className="font-heading font-bold text-text-primary">{c.name}</p>
                      <span className="text-sm font-semibold text-text-primary tabular">{Math.round(c.score)}%</span>
                    </div>
                    <p className="mb-2 text-xs text-text-muted">{c.comunidad}</p>
                    <p className="text-sm leading-relaxed text-text-secondary">{c.justification}</p>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        )}

        {/* Nota final */}
        <div className="mx-auto max-w-2xl pt-4 text-center text-xs text-text-muted">
          <p>
            Resultado generado el {new Date(result.created_at).toLocaleDateString("es-ES", { dateStyle: "long" })}.
          </p>
          <p className="mt-1">
            Orientación basada en tus respuestas, el modelo de intereses RIASEC{bigFive ? ', Big Five' : ''} y el catálogo académico disponible. El porcentaje es un índice propio de afinidad; este test no sustituye una orientación profesional.
          </p>
        </div>
      </div>
    </div>
  );
}

function CareerCard({ career, rank }: { career: CareerJustified; rank: number }) {
  return (
    <div className="hover-lift rounded-2xl border border-border bg-bg-primary p-4 shadow-card animate-list-in sm:p-5" style={{ ["--i" as string]: rank - 1 } as CSSProperties}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-text-muted tabular">#{rank}</span>
            <p className="min-w-0 flex-1 break-words font-heading font-bold text-text-primary">{career.name}</p>
            {career.is_aspirational && (
              <Badge variant="warning" className="text-[10px]">
                <AlertCircle className="mr-0.5 h-2.5 w-2.5" aria-hidden="true" />
                Corte superior a tu nota
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-muted">
            {BRANCH_LABELS[career.branch] || career.branch}
            {career.duration_years ? ` · ${formatAcademicDuration(career.duration_years)}` : ""}
            {career.cut_off ? ` · Corte de referencia${career.cut_off_year ? ` ${career.cut_off_year}` : ''}: ${career.cut_off.toLocaleString('es-ES', { maximumFractionDigits: 3 })}` : ""}
            {career.employment_rate ? ` · Empleabilidad: ${Math.round(career.employment_rate)}%` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-heading text-2xl font-extrabold tracking-tight text-text-primary tabular">{career.score}%</div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted">afinidad</div>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">{career.justification}</p>
      {career.university_name && (
        <p className="mt-2 flex items-center gap-1 text-xs text-text-muted">
          <GraduationCap className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          {career.university_short || career.university_name}
          {career.city && ` · ${career.city}`}
        </p>
      )}
      {(career.campus || career.modality) && <p className="mt-1 text-xs text-text-muted">{[career.campus, career.modality].filter(Boolean).join(' · ')}</p>}
      {career.career_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(career.career_id) && (
        <Link href={`/carreras/${career.career_id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-violet link-underline">Ver carrera y requisitos</Link>
      )}
    </div>
  );
}
