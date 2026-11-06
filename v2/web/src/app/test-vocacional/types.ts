/* ═══════════════════════════════════════════════════════════
   Test Vocacional — Shared Types
   8-dimensional adaptive vocational test
   ═══════════════════════════════════════════════════════════ */

// ── RIASEC ──
export const RIASEC_KEYS = ["R", "I", "A", "S", "E", "C"] as const;
export type RiasecKey = (typeof RIASEC_KEYS)[number];
export type RiasecScores = Record<RiasecKey, number>;

// ── Aptitudes ──
export type AptitudesScores = {
  logico_matematica: number;
  verbal_linguistica: number;
  espacial_visual: number;
  cientifico_tecnica: number;
  interpersonal: number;
  corporal_kinestesica: number;
};

// ── Valores ──
export type ValoresScores = {
  seguridad_economica: number;
  impacto_social: number;
  prestigio: number;
  autonomia: number;
  creatividad: number;
  conciliacion: number;
};

// ── Aversiones ──
export type AversionesScores = {
  sangre: number;
  hablar_publico: number;
  matematicas: number;
  rutina: number;
  trabajar_solo: number;
};

// ── Ambición ──
export type AmbicionScores = {
  academica: number;
  economica: number;
  social: number;
};

// ── Estilo de vida ──
export type EstiloVidaScores = {
  urbano: number;       // +high = prefiere ciudad grande
  movilidad: number;    // +high = dispuesto a moverse
  ritmo: number;        // +high = intenso y ambicioso
  social: number;       // +high = muy social
};

// ── Pragmático ──
export type PragmaticoScores = {
  nota_estimada: number;        // 5-14
  presupuesto: number;          // 1=solo pública, 2=prefiere pública, 3=puede privada
  duracion_max: number;         // 4, 5, 6
};

// ── Geográfico ──
export type GeograficoScores = {
  comunidad_actual: string;     // e.g. "andalucia"
  movilidad: number;            // 1=local, 2=regional, 3=nacional
};

// ── Full Student Profile ──
export type StudentProfile = {
  riasec: RiasecScores;
  aptitudes: AptitudesScores;
  valores: ValoresScores;
  aversiones: AversionesScores;
  ambicion: AmbicionScores;
  estilo_vida: EstiloVidaScores;
  pragmatico: PragmaticoScores;
  geografico: GeograficoScores;
  // Derived tags from Stage 2 questions
  tags: Record<string, number>;
};

// ── Dimension Impact (from a question option) ──
export type DimensionImpact = {
  dimension: string;    // e.g. "riasec.I", "aversiones.sangre", "tags.medicina"
  delta: number;        // e.g. +3, -2
};

// ── Question types ──
export type QuestionType = "likert" | "choice" | "ranking" | "scenario" | "tradeoff" | "slider";

export type QuestionOption = {
  text: string;
  emoji?: string;
  impacts: DimensionImpact[];
  /** Explicit admission grade; accepted only for q4_01 and rebuilt on restore. */
  admissionGrade?: number;
};

export type QuestionCondition = {
  dimension: string;
  operator: "gt" | "lt" | "eq" | "between";
  value: number | [number, number];
};

export type AdaptiveQuestion = {
  id: string;
  stage: QuizStage;
  text: string;
  subtext?: string;
  type: QuestionType;
  options: QuestionOption[];
  weight: number;                       // 1-3
  info_gain_estimate: number;           // rough info gain ranking
  conditions?: QuestionCondition[];
  category_visual?: string;
};

// ── Career profile (enriched data for matching) ──
export type CareerProfile = {
  id: string;
  name: string;
  branch: string;
  university_id: string | null;
  university_type?: string;
  campus?: string | null;
  modality?: string | null;
  location_region?: string | null;
  cut_off_year?: number | null;
  degree_type?: string;
  duration_years: number;
  cut_off_score: number | null;
  employment_rate: number | null;
  riasec: RiasecScores;
  aptitudes: AptitudesScores;
  valores: ValoresScores;
  aversiones: string[];
  ambicion: number;
  tags: string[];
  slug?: string;
};

// ── City profile ──
export type CityProfile = {
  name: string;
  comunidad: string;
  size: "S" | "M" | "L" | "XL" | "XXL";
  cost_of_living: "bajo" | "medio" | "alto" | "muy_alto";
  climate: string;
  nightlife: number;      // 1-10
  culture: number;        // 1-10
  beach_proximity: "si" | "cerca" | "no";
  student_friendly: number; // 1-10
  transport: number;        // 1-10
  international: number;    // 1-10
};

// ── Match result ──
export type CareerMatch = {
  career: CareerProfile;
  scoreFinal: number;           // 0-100
  scoreBreakdown: {
    riasec: number;
    aptitud: number;
    valores: number;
    aversion: number;
    ambicion: number;
    pragmatico: number;
    tags: number;
  };
  explanation: string;
  isAspiracional: boolean;      // reference cut-off exceeds estimated grade by more than 1
};

export type UniversityMatch = {
  universityName: string;
  universitySlug?: string;
  city: string;
  comunidad: string;
  score: number;
  cutOff: number | null;
  type: string;
};

export type CityMatch = {
  city: CityProfile;
  score: number;
  reasons: string[];
};

// ── Quiz state ──
// Stage 1: Discovery + anchors directas (RIASEC + valores)
// Stage 5: Branch detection + doble grado (NUEVO, va después del 1)
// Stage 2: Cluster específico de la rama detectada
// Stage 3: Tradeoffs finos
// Stage 4: Pragmático + ciudad/universidad
export type QuizStage = 1 | 2 | 3 | 4 | 5;

export type QuizState = {
  stage: QuizStage;
  answeredIds: Set<string>;
  answers: Record<string, number>;    // questionId -> optionIndex
  profile: StudentProfile;
  questionPath: string[];             // ordered list of question IDs answered
  totalAnswered: number;
  startTime: number;
};

// ── Results ──
export type VocationalResults = {
  profile: StudentProfile;
  topCareers: CareerMatch[];
  aspirationalCareers: CareerMatch[];
  topCities: CityMatch[];
  questionPath: string[];
  completionTimeSeconds: number;
};

// ── Helper: default empty profile ──
export function createEmptyProfile(): StudentProfile {
  return {
    riasec: { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 },
    aptitudes: {
      logico_matematica: 0, verbal_linguistica: 0, espacial_visual: 0,
      cientifico_tecnica: 0, interpersonal: 0, corporal_kinestesica: 0,
    },
    valores: {
      seguridad_economica: 0, impacto_social: 0, prestigio: 0,
      autonomia: 0, creatividad: 0, conciliacion: 0,
    },
    aversiones: {
      sangre: 0, hablar_publico: 0, matematicas: 0,
      rutina: 0, trabajar_solo: 0,
    },
    ambicion: { academica: 0, economica: 0, social: 0 },
    estilo_vida: { urbano: 5, movilidad: 5, ritmo: 5, social: 5 },
    pragmatico: { nota_estimada: 0, presupuesto: 0, duracion_max: 0 },
    geografico: { comunidad_actual: "", movilidad: 0 },
    tags: {},
  };
}
