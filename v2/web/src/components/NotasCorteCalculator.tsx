"use client";

import { useState, useMemo, useEffect } from "react";
import { CURRENT_CUT_OFF_YEAR } from "@/lib/academic-year";
import { createClient } from "@/lib/supabase-client";
import Link from "next/link";
import {
  Calculator, RotateCcw, Info, CheckCircle, XCircle,
  TrendingUp, GraduationCap, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ────── Subject data ────── */
const materiasTroncales = [
  "Lengua Castellana y Literatura II",
  "Historia de España",
  "Lengua Extranjera II (Inglés)",
  "Lengua Extranjera II (Francés)",
  "Lengua Extranjera II (Alemán)",
];

const materiasModalidad = {
  ciencias: [
    "Matemáticas II", "Física", "Química", "Biología",
    "Geología", "Dibujo Técnico II",
  ],
  humanidades: [
    "Latín II", "Griego II", "Historia del Arte", "Geografía",
    "Matemáticas Aplicadas a las CCSS II", "Empresa y Diseño de Modelos de Negocio",
  ],
  artes: [
    "Fundamentos del Arte II", "Artes Escénicas", "Diseño", "Historia del Arte",
  ],
};

type Modalidad = keyof typeof materiasModalidad;

interface NotaMateria {
  nombre: string;
  nota: string;
  ponderacion: number;
}

type MatchedCareer = {
  id: string;
  name: string;
  branch: string;
  cut_off_score: number;
  universities: { name: string; short_name: string } | null;
};

const branchColors: Record<string, string> = {
  ciencias: "bg-blue-100 text-blue-700",
  ciencias_salud: "bg-green-100 text-green-700",
  ingenieria_arquitectura: "bg-orange/10 text-orange-700",
  artes_humanidades: "bg-fuchsia/10 text-fuchsia",
  ciencias_sociales_juridicas: "bg-violet-50 text-violet",
};

const branchLabels: Record<string, string> = {
  ciencias: "Ciencias",
  ciencias_salud: "Ciencias de la Salud",
  ingenieria_arquitectura: "Ingeniería y Arquitectura",
  artes_humanidades: "Artes y Humanidades",
  ciencias_sociales_juridicas: "CC. Sociales y Jurídicas",
};

/* ────── Gauge SVG ────── */
function ScoreGauge({ score, max, label }: { score: number; max: number; label: string }) {
  const pct = Math.min(score / max, 1);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct * 0.75); // 270° arc

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 120" className="w-32 h-32">
        {/* Background arc */}
        <circle
          cx="60" cy="60" r={radius}
          fill="none" stroke="#e5e7eb" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          transform="rotate(135 60 60)"
        />
        {/* Value arc */}
        <circle
          cx="60" cy="60" r={radius}
          fill="none" stroke="url(#gaugeGrad)" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={offset}
          transform="rotate(135 60 60)"
          className="transition-all duration-1000"
        />
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>
        </defs>
        <text x="60" y="55" textAnchor="middle" className="text-2xl font-extrabold fill-gray-900">
          {score.toFixed(3)}
        </text>
        <text x="60" y="72" textAnchor="middle" className="text-[10px] fill-gray-400">
          / {max.toFixed(0)}
        </text>
      </svg>
      <p className="text-xs font-bold text-text-secondary -mt-2">{label}</p>
    </div>
  );
}

/* ════════ MAIN COMPONENT ════════ */
export default function NotasCorteCalculator() {
  const [step, setStep] = useState(0);
  const [mediaBachillerato, setMediaBachillerato] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("ciencias");
  const [troncales, setTroncales] = useState<Record<string, string>>({});
  const [especificas, setEspecificas] = useState<NotaMateria[]>([
    { nombre: "", nota: "", ponderacion: 0.2 },
    { nombre: "", nota: "", ponderacion: 0.2 },
  ]);
  const [showResults, setShowResults] = useState(false);
  const [matchedCareers, setMatchedCareers] = useState<MatchedCareer[]>([]);
  const [loadingCareers, setLoadingCareers] = useState(false);

  /* ── Computed scores ── */
  const mediaFaseTroncal = useMemo(() => {
    const notas = Object.values(troncales).map((n) => parseFloat(n)).filter((n) => !isNaN(n));
    if (notas.length === 0) return 0;
    return notas.reduce((a, b) => a + b, 0) / notas.length;
  }, [troncales]);

  const notaAcceso = useMemo(() => {
    const media = parseFloat(mediaBachillerato);
    if (isNaN(media)) return 0;
    return media * 0.6 + mediaFaseTroncal * 0.4;
  }, [mediaBachillerato, mediaFaseTroncal]);

  const faseEspecifica = useMemo(() => {
    return especificas
      .map((e) => {
        const nota = parseFloat(e.nota);
        if (isNaN(nota) || nota < 5) return 0;
        return nota * e.ponderacion;
      })
      .sort((a, b) => b - a)
      .slice(0, 2)
      .reduce((a, b) => a + b, 0);
  }, [especificas]);

  const notaAdmision = notaAcceso + faseEspecifica;

  /* ── Fetch matching careers after results ── */
  useEffect(() => {
    if (!showResults || notaAdmision <= 0) return;
    setLoadingCareers(true);
    const supabase = createClient();
    supabase
      .from("careers")
      .select("id, name, branch, cut_off_score, universities(name, short_name)")
      .not("cut_off_score", "is", null)
      .lte("cut_off_score", notaAdmision)
      // Siempre contra la nota del curso vigente.
      .eq("cut_off_year", CURRENT_CUT_OFF_YEAR)
      .order("cut_off_score", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) {
          setMatchedCareers(
            data.map((c) => ({
              ...c,
              cut_off_score: Number(c.cut_off_score),
              universities: Array.isArray(c.universities) ? c.universities[0] : c.universities,
            })) as MatchedCareer[]
          );
        }
        setLoadingCareers(false);
      });
  }, [showResults, notaAdmision]);

  const handleReset = () => {
    setMediaBachillerato("");
    setTroncales({});
    setEspecificas([
      { nombre: "", nota: "", ponderacion: 0.2 },
      { nombre: "", nota: "", ponderacion: 0.2 },
    ]);
    setShowResults(false);
    setMatchedCareers([]);
    setStep(0);
  };

  const handleCalculate = () => {
    setShowResults(true);
  };

  const canProceed = [
    () => mediaBachillerato !== "" && !isNaN(parseFloat(mediaBachillerato)),
    () => true, // modalidad always selected
    () => Object.values(troncales).some((v) => v !== ""),
    () => true, // specific phase is optional
  ];

  const steps = ["Bachillerato", "Modalidad", "Troncales", "Específica"];

  return (
    <div className="mx-auto max-w-3xl py-8">
      {/* ── Step indicator ── */}
      {!showResults && (
        <div className="flex items-center justify-center gap-1 mb-8">
          {steps.map((s, i) => (
            <button
              key={s}
              onClick={() => i <= step && setStep(i)}
              className="flex items-center gap-1"
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  i < step
                    ? "bg-violet text-white"
                    : i === step
                    ? "bg-violet text-white ring-4 ring-violet/20"
                    : "bg-gray-100 text-gray-400"
                )}
              >
                {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={cn("w-8 sm:w-12 h-0.5", i < step ? "bg-violet" : "bg-border")} />
              )}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-bg-primary p-6 sm:p-8">
        {!showResults ? (
          <>
            {/* ═══ Step 0: Media bachillerato ═══ */}
            {step === 0 && (
              <div className="animate-in fade-in">
                <h3 className="text-lg font-bold font-heading mb-1 flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-violet" />
                  Nota media de Bachillerato
                </h3>
                <p className="text-sm text-text-secondary mb-4">
                  Tu media de 1º y 2º de Bachillerato (sobre 10).
                </p>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.01"
                  value={mediaBachillerato}
                  onChange={(e) => setMediaBachillerato(e.target.value)}
                  placeholder="Ej: 7.80"
                  className="w-full max-w-52 px-4 py-3 rounded-xl border-2 border-border-light focus:border-violet focus:ring-2 focus:ring-violet/20 outline-none font-semibold text-lg"
                  autoFocus
                />
                {mediaBachillerato && (
                  <p className="text-xs text-text-muted mt-2">
                    Peso en nota de acceso: <strong>{(parseFloat(mediaBachillerato) * 0.6).toFixed(3)}</strong> (×0,6)
                  </p>
                )}
              </div>
            )}

            {/* ═══ Step 1: Modalidad ═══ */}
            {step === 1 && (
              <div className="animate-in fade-in">
                <h3 className="text-lg font-bold font-heading mb-1 flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-violet" />
                  Modalidad de Bachillerato
                </h3>
                <p className="text-sm text-text-secondary mb-4">
                  Selecciona tu itinerario para cargar las materias correspondientes.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(Object.keys(materiasModalidad) as Modalidad[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setModalidad(m)}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all",
                        modalidad === m
                          ? "border-violet bg-violet-50"
                          : "border-border-light hover:border-violet/30"
                      )}
                    >
                      <p className="font-bold text-sm capitalize">
                        {m === "humanidades" ? "Humanidades y CCSS" : m === "ciencias" ? "Ciencias y Tecnología" : "Artes"}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        {materiasModalidad[m].length} materias
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ═══ Step 2: Troncales ═══ */}
            {step === 2 && (
              <div className="animate-in fade-in">
                <h3 className="text-lg font-bold font-heading mb-1 flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-violet" />
                  Fase Obligatoria (Troncales EvAU)
                </h3>
                <p className="text-sm text-text-secondary mb-4">
                  Nota de cada examen troncal (sobre 10). Se calcula la media.
                </p>
                <div className="space-y-2.5">
                  {[
                    ...materiasTroncales,
                    modalidad === "ciencias"
                      ? "Matemáticas II"
                      : modalidad === "humanidades"
                      ? "Latín II / Mat. Aplicadas"
                      : "Fundamentos del Arte II",
                  ].map((materia) => (
                    <div key={materia} className="flex items-center gap-3">
                      <label className="text-sm font-medium flex-1 min-w-0 truncate">{materia}</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.01"
                        value={troncales[materia] || ""}
                        onChange={(e) => setTroncales({ ...troncales, [materia]: e.target.value })}
                        placeholder="Nota"
                        aria-label={`Nota de ${materia}`}
                        className="w-20 px-3 py-2 rounded-xl border border-border-light focus:border-violet focus:ring-2 focus:ring-violet/20 outline-none text-center font-semibold"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-text-muted mt-3">
                  Media troncal: <strong>{mediaFaseTroncal.toFixed(3)}</strong> → Peso: <strong>{(mediaFaseTroncal * 0.4).toFixed(3)}</strong> (×0,4)
                </p>
              </div>
            )}

            {/* ═══ Step 3: Specific phase ═══ */}
            {step === 3 && (
              <div className="animate-in fade-in">
                <h3 className="text-lg font-bold font-heading mb-1 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-violet" />
                  Fase Voluntaria (Específica)
                </h3>
                <p className="text-sm text-text-secondary mb-4">
                  Las 2 mejores notas (≥5) × ponderación suman hasta +4 puntos.
                </p>
                <div className="space-y-3">
                  {especificas.map((esp, i) => (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <select
                        value={esp.nombre}
                        onChange={(e) => {
                          const u = [...especificas];
                          u[i] = { ...u[i], nombre: e.target.value };
                          setEspecificas(u);
                        }}
                        className="flex-1 min-w-40 px-3 py-2.5 rounded-xl border border-border-light focus:border-violet outline-none text-sm"
                      >
                        <option value="">Seleccionar materia...</option>
                        {materiasModalidad[modalidad].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.01"
                        value={esp.nota}
                        onChange={(e) => {
                          const u = [...especificas];
                          u[i] = { ...u[i], nota: e.target.value };
                          setEspecificas(u);
                        }}
                        placeholder="Nota"
                        className="w-20 px-3 py-2.5 rounded-xl border border-border-light focus:border-violet outline-none text-center font-semibold"
                      />
                      <select
                        value={esp.ponderacion}
                        onChange={(e) => {
                          const u = [...especificas];
                          u[i] = { ...u[i], ponderacion: parseFloat(e.target.value) };
                          setEspecificas(u);
                        }}
                        className="w-20 px-3 py-2.5 rounded-xl border border-border-light focus:border-violet outline-none text-sm font-semibold"
                      >
                        <option value="0.1">×0.1</option>
                        <option value="0.2">×0.2</option>
                      </select>
                      {especificas.length > 1 && (
                        <button
                          onClick={() => setEspecificas(especificas.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600 p-1"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {especificas.length < 4 && (
                    <button
                      onClick={() => setEspecificas([...especificas, { nombre: "", nota: "", ponderacion: 0.2 }])}
                      className="text-sm text-violet hover:underline font-medium"
                    >
                      + Añadir otra materia
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Nav buttons ── */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border-light">
              {step > 0 ? (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="text-sm text-text-muted hover:text-violet font-medium"
                >
                  ← Anterior
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border-light text-text-secondary text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reiniciar
                </button>
                {step < 3 ? (
                  <button
                    onClick={() => setStep((s) => s + 1)}
                    disabled={!canProceed[step]()}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-text-primary text-bg-primary font-semibold transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-card-hover cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Siguiente
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleCalculate}
                    disabled={!mediaBachillerato}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-text-primary text-bg-primary font-semibold transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-card-hover cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Calculator className="h-4 w-4" />
                    Calcular mi nota
                  </button>
                )}
              </div>
            </div>

            {/* ── Live preview ── */}
            {notaAcceso > 0 && (
              <div className="mt-6 p-4 rounded-xl border border-border bg-bg-secondary/60">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Nota de acceso provisional:</span>
                  <span className="font-extrabold text-violet text-lg">{notaAcceso.toFixed(3)}</span>
                </div>
                {faseEspecifica > 0 && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-text-secondary">+ Fase específica:</span>
                    <span className="font-bold text-fuchsia">+{faseEspecifica.toFixed(3)}</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* ═══════ RESULTS ═══════ */
          <div className="animate-in fade-in">
            <h3 className="text-xl font-bold font-heading mb-6 text-center">Tu resultado</h3>

            {/* Score gauges */}
            <div className="flex flex-wrap justify-center gap-6 mb-8">
              <ScoreGauge score={notaAcceso} max={10} label="Nota de Acceso" />
              <ScoreGauge score={notaAdmision} max={14} label="Nota de Admisión" />
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl border border-border bg-bg-primary p-4 text-center">
                <p className="text-[10px] text-text-muted uppercase tracking-wide">Bachillerato ×0,6</p>
                <p className="font-heading text-xl font-extrabold text-text-primary tabular">{(parseFloat(mediaBachillerato || "0") * 0.6).toFixed(3)}</p>
              </div>
              <div className="rounded-xl border border-border bg-bg-primary p-4 text-center">
                <p className="text-[10px] text-text-muted uppercase tracking-wide">Troncales ×0,4</p>
                <p className="font-heading text-xl font-extrabold text-text-primary tabular">{(mediaFaseTroncal * 0.4).toFixed(3)}</p>
              </div>
              <div className="rounded-xl border border-border bg-bg-primary p-4 text-center">
                <p className="text-[10px] text-text-muted uppercase tracking-wide">Fase Específica</p>
                <p className="font-heading text-xl font-extrabold text-text-primary tabular">+{faseEspecifica.toFixed(3)}</p>
              </div>
            </div>

            {/* Formula info */}
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 mb-8">
              <div className="flex gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-800">
                  <p><strong>Nota de acceso</strong> = Media Bachillerato × 0,6 + Media troncales EvAU × 0,4</p>
                  <p className="mt-0.5"><strong>Nota de admisión</strong> = Nota de acceso + 2 mejores materias específicas (≥5) × ponderación</p>
                </div>
              </div>
            </div>

            {/* Matching careers */}
            <div className="border-t border-border-light pt-6">
              <h4 className="text-lg font-bold font-heading mb-1 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-violet" />
                Carreras a las que puedes acceder
              </h4>
              <p className="text-sm text-text-secondary mb-4">
                Con tu nota de <strong className="text-violet">{notaAdmision.toFixed(3)}</strong>, podrías entrar en estas carreras:
              </p>

              {loadingCareers ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-3 border-violet border-t-transparent rounded-full" />
                </div>
              ) : matchedCareers.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {matchedCareers.map((c) => {
                    const margin = notaAdmision - c.cut_off_score;
                    return (
                      <Link
                        key={c.id}
                        href={`/carreras/${c.id}`}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border-light hover:border-text-primary/20 hover:bg-bg-secondary transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm group-hover:text-violet transition-colors truncate">
                            {c.name}
                          </p>
                          <p className="text-xs text-text-muted truncate">
                            {c.universities?.short_name || c.universities?.name}
                          </p>
                        </div>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", branchColors[c.branch] || "bg-gray-100 text-gray-600")}>
                          {branchLabels[c.branch] || c.branch}
                        </span>
                        <div className="text-right shrink-0 w-20">
                          <p className="text-sm font-bold text-violet">{c.cut_off_score.toFixed(3)}</p>
                          <p className={cn("text-[10px] font-semibold", margin >= 1 ? "text-emerald-600" : margin >= 0.2 ? "text-amber-600" : "text-red-500")}>
                            +{margin.toFixed(3)} margen
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-text-muted py-6 text-sm">
                  No se encontraron carreras con nota de corte ≤ {notaAdmision.toFixed(3)}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap justify-center gap-3 mt-8 pt-6 border-t border-border-light">
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-violet/20 text-violet font-semibold hover:border-violet/40 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Recalcular
              </button>
              <Link
                href="/notas-corte"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-text-primary text-bg-primary font-semibold transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-card-hover cursor-pointer"
              >
                Explorar todas las carreras
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
