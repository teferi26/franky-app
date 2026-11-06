/* ═══════════════════════════════════════════════════════════
   Matching Engine — computes SCORE_FINAL for every career
   against a student profile using 7-factor weighted formula.
   ═══════════════════════════════════════════════════════════ */

import type {
  StudentProfile, CareerProfile, CareerMatch,
  RiasecScores, ValoresScores,
} from "../types";
import { cosineSimilarity } from "./score-calculator";
import { matchesGeography } from './geography';

// ── Weights (sum = 1.0) ──
const W_RIASEC = 0.22;
const W_APTITUD = 0.15;
const W_VALORES = 0.12;
const W_AVERSION = 0.13;
const W_AMBICION = 0.05;
const W_PRAGMATICO = 0.13;
const W_TAGS = 0.20;

// ── Branch tag mapping ──
const BRANCH_TAG_TO_BRANCH: Record<string, string> = {
  rama_ciencias_salud: "ciencias_salud",
  rama_ingenieria_arquitectura: "ingenieria_arquitectura",
  rama_ciencias: "ciencias",
  rama_ciencias_sociales_juridicas: "ciencias_sociales_juridicas",
  rama_artes_humanidades: "artes_humanidades",
};

function detectUserBranches(profile: StudentProfile): { primary: string | null; secondary: string | null; primaryScore: number; secondaryScore: number } {
  const tags = profile.tags || {};
  const ramaScores: Array<{ branch: string; score: number }> = Object.entries(BRANCH_TAG_TO_BRANCH)
    .map(([tag, branch]) => ({ branch, score: tags[tag] || 0 }))
    .sort((a, b) => b.score - a.score);

  return {
    primary: ramaScores[0]?.score > 0 ? ramaScores[0].branch : null,
    secondary: ramaScores[1]?.score > 0 ? ramaScores[1].branch : null,
    primaryScore: ramaScores[0]?.score || 0,
    secondaryScore: ramaScores[1]?.score || 0,
  };
}

/**
 * Compute matches for ALL careers against the student profile.
 * Returns sorted CareerMatch[] (top matches first).
 */
export function computeAllMatches(
  profile: StudentProfile,
  careers: CareerProfile[]
): CareerMatch[] {
  const results: CareerMatch[] = [];
  const branches = detectUserBranches(profile);
  // Preferencia doble grado vs simple: gana la señal DOMINANTE. Comparamos las
  // dos puntuaciones (en vez de umbrales fijos independientes) porque las
  // preguntas "combo" suman doble_grado aunque el usuario dijera que prefiere un
  // grado simple. Si su señal dominante es "simple", los dobles se hunden.
  const doubleScore = profile.tags?.doble_grado || 0;
  const simpleScore = profile.tags?.grado_simple || 0;
  const prefersSimple = simpleScore >= 2 && simpleScore >= doubleScore;
  const wantsDoubleGrado = doubleScore >= 2 && doubleScore > simpleScore;

  for (const career of careers) {
    if (!matchesGeography(profile, career)) continue;
    // "Solo pública" is a constraint, not a small contribution to an average.
    if (profile.pragmatico.presupuesto === 1 && career.university_type === "privada") continue;
    const breakdown = computeBreakdown(profile, career);

    let scoreFinal =
      W_RIASEC * breakdown.riasec +
      W_APTITUD * breakdown.aptitud +
      W_VALORES * breakdown.valores +
      W_AVERSION * breakdown.aversion +
      W_AMBICION * breakdown.ambicion +
      W_PRAGMATICO * breakdown.pragmatico +
      W_TAGS * breakdown.tags;

    // ── Branch boost (mixed mode: top 1 dominates, secondary opens window) ──
    if (branches.primary && career.branch === branches.primary) {
      scoreFinal += (1 - scoreFinal) * 0.18; // strong boost to primary branch
    } else if (branches.secondary && career.branch === branches.secondary && branches.secondaryScore >= branches.primaryScore * 0.4) {
      scoreFinal += (1 - scoreFinal) * 0.10; // moderate boost to secondary
    } else if (branches.primary && career.branch !== branches.primary && career.branch !== branches.secondary) {
      // Soft penalty for unrelated branches — but cross-matches still possible
      scoreFinal *= 0.78;
    }

    // ── Double grado boost / penalty ──
    const isDouble = career.tags?.includes("doble_grado");
    if (isDouble && wantsDoubleGrado) {
      scoreFinal += (1 - scoreFinal) * 0.22;
      // Extra boost if it spans user's primary AND secondary branch
      if (branches.primary && branches.secondary && career.tags?.includes(`branch_${branches.primary}`) && career.tags?.includes(`branch_${branches.secondary}`)) {
        scoreFinal += (1 - scoreFinal) * 0.08;
      }
    } else if (isDouble && prefersSimple) {
      // Dijo que prefiere grado simple → hunde los dobles para que NO aparezcan
      // arriba. Antes era un -15% débil y los dobles seguían colándose al top.
      scoreFinal *= 0.4;
    } else if (!isDouble && prefersSimple) {
      scoreFinal += (1 - scoreFinal) * 0.06; // refuerza los grados simples
    }

    // ── Specific combination tags boost (q5_combo_*, q2_te*, q3_dg*) ──
    // Solo si NO ha pedido grado simple: si lo pidió, no reflotamos dobles.
    const userTags = profile.tags || {};
    if (career.tags && !prefersSimple) {
      // If career name matches both informática and ade → check user's doble_informatica_ade tag
      const hasInfo = career.tags.includes("informatica") || career.tags.includes("programacion");
      const hasAde = career.tags.includes("ade") || career.tags.includes("empresa");
      if (hasInfo && hasAde && (userTags.doble_informatica_ade || 0) >= 3) {
        scoreFinal += (1 - scoreFinal) * 0.20;
      }
      const hasDerecho = career.tags.includes("derecho");
      if (hasDerecho && hasAde && (userTags.doble_derecho_ade || 0) >= 3) {
        scoreFinal += (1 - scoreFinal) * 0.20;
      }
      const hasFisica = career.tags.includes("fisica");
      const hasMates = career.tags.includes("matematicas");
      if (hasFisica && hasMates && (userTags.doble_mates_fisica || 0) >= 3) {
        scoreFinal += (1 - scoreFinal) * 0.20;
      }
    }

    // Bounded preference index; not a calibrated probability.
    const pctScore = Number.isFinite(scoreFinal) ? Math.max(0, Math.min(99, Math.round(scoreFinal * 100))) : 0;

    // Reference-grade gap must be independent of affinity. A weak match does
    // not make an offer with a high cut-off academically reachable.
    const isAspiracional =
      career.cut_off_score !== null &&
      profile.pragmatico.nota_estimada > 0 &&
      profile.pragmatico.nota_estimada < career.cut_off_score;

    results.push({
      career,
      scoreFinal: pctScore,
      scoreBreakdown: breakdown,
      explanation: generateExplanation(profile, career, breakdown),
      isAspiracional,
    });
  }

  results.sort((a, b) => b.scoreFinal - a.scoreFinal);
  return results;
}

/**
 * Recommend different study directions, with the best matching offer for each.
 * The career detail still lists the other universities/campuses.
 */
export function getTopMatches(
  allMatches: CareerMatch[],
  topN = 10,
  aspirationalN = 5
): { top: CareerMatch[]; aspirational: CareerMatch[] } {
  const top: CareerMatch[] = [];
  const aspirational: CareerMatch[] = [];
  const key = (match: CareerMatch) => match.career.name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const available = new Set(allMatches.filter(match => !match.isAspiracional).map(key));
  const selected = new Set<string>();

  for (const m of allMatches) {
    const name = key(m);
    if (selected.has(name)) continue;
    if (m.isAspiracional) {
      // Only show sufficiently compatible choices in the aspirational list.
      if (m.scoreFinal <= 45) continue;
      // Do not call a whole degree aspirational when another matching offer
      // of the same degree falls within the student's reference grade.
      if (available.has(name)) continue;
      if (aspirational.length < aspirationalN) { aspirational.push(m); selected.add(name); }
    } else {
      if (top.length < topN) { top.push(m); selected.add(name); }
    }
    if (top.length >= topN && aspirational.length >= aspirationalN) break;
  }

  return { top, aspirational };
}

// ── Internal scoring functions ──

function computeBreakdown(
  profile: StudentProfile,
  career: CareerProfile
) {
  // Normalize student aptitudes to 0-10 for fair comparison
  const normApt = normalizeToScale(profile.aptitudes as unknown as Record<string, number>);

  return {
    riasec: scoreRiasec(profile.riasec, career.riasec),
    aptitud: scoreAptitud(normApt, career.aptitudes as unknown as Record<string, number>),
    valores: scoreValores(profile.valores, career.valores),
    aversion: scoreAversion(profile.aversiones, career.aversiones),
    ambicion: scoreAmbicion(profile.ambicion, career.ambicion),
    pragmatico: scorePragmatico(profile.pragmatico, career),
    tags: scoreTags(profile.tags, career.tags),
  };
}

/**
 * Normalize a scored record so the max value = targetMax.
 * Preserves relative proportions.
 */
function normalizeToScale(scores: Record<string, number>, targetMax = 10): Record<string, number> {
  const vals = Object.values(scores);
  const max = Math.max(...vals.map(Math.abs));
  if (max <= 0) return { ...scores };
  if (max <= targetMax) return { ...scores };
  const scale = targetMax / max;
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) {
    result[k] = v * scale;
  }
  return result;
}

function scoreRiasec(student: RiasecScores, ideal: RiasecScores): number {
  return cosineSimilarity(
    student as unknown as Record<string, number>,
    ideal as unknown as Record<string, number>
  );
}

/**
 * Aptitudes: requirement-fulfillment approach.
 * Student value >= career requirement → 1.0 (meets/exceeds).
 * Student value < requirement → proportional (sv/rv).
 */
function scoreAptitud(student: Record<string, number>, required: Record<string, number>): number {
  const keys = Object.keys(required);
  if (keys.length === 0) return 0.5;

  let sum = 0;
  for (const k of keys) {
    const sv = student[k] || 0;
    const rv = required[k] || 0;
    if (rv <= 1) {
      sum += 0.7; // career barely needs this → neutral-positive
    } else if (sv >= rv) {
      sum += 1.0; // student meets or exceeds
    } else {
      sum += Math.max(0.1, sv / rv); // proportional match
    }
  }
  return sum / keys.length;
}

/**
 * Valores: cosine similarity for alignment (scale-invariant).
 */
function scoreValores(student: ValoresScores, rewarded: ValoresScores): number {
  return cosineSimilarity(
    student as unknown as Record<string, number>,
    rewarded as unknown as Record<string, number>
  );
}

/**
 * Aversion penalty: high student aversion + career incompatibility → penalty.
 */
function scoreAversion(
  student: { sangre: number; hablar_publico: number; matematicas: number; rutina: number; trabajar_solo: number },
  incompatibles: string[]
): number {
  if (incompatibles.length === 0) return 1.0;

  let penalty = 1.0;
  for (const aversion of incompatibles) {
    const studentVal = (student as Record<string, number>)[aversion] || 0;
    if (studentVal > 7) {
      penalty *= 0.1;
    } else if (studentVal > 5) {
      penalty *= 0.4;
    } else if (studentVal > 3) {
      penalty *= 0.7;
    }
  }
  return penalty;
}

/**
 * Ambicion: soft match between student and career ambition level.
 */
function scoreAmbicion(
  student: { academica: number; economica: number; social: number },
  careerLevel: number
): number {
  const studentAvg = (student.academica + student.economica + student.social) / 3;
  // Cap to 0-10 range for fair comparison with career level (1-10)
  const capped = Math.min(10, studentAvg);
  const diff = Math.abs(capped - careerLevel) / 10;
  return Math.max(0.2, 1 - diff);
}

/**
 * Pragmatic filters: nota, presupuesto, duration.
 * Returns 1.0 if not yet answered (values at 0).
 */
function scorePragmatico(
  student: { nota_estimada: number; presupuesto: number; duracion_max: number },
  career: CareerProfile
): number {
  // If Stage 4 not answered yet, skip pragmatic filter
  if (student.nota_estimada <= 0 && student.presupuesto <= 0 && student.duracion_max <= 0) return 1.0;

  let score = 1.0;

  // Nota de corte filter
  if (career.cut_off_score !== null && student.nota_estimada > 0) {
    if (student.nota_estimada < career.cut_off_score - 1) {
      score *= 0.1; // hard fail but visible as aspirational
    } else if (student.nota_estimada < career.cut_off_score) {
      score *= 0.6; // tight
    }
  }

  // Presupuesto
  if (student.presupuesto > 0) {
    if (student.presupuesto === 1 && career.university_type === "privada") {
      score *= 0.0; // excluded
    } else if (student.presupuesto === 2 && career.university_type === "privada") {
      score *= 0.5;
    }
  }

  // Duration
  if (student.duracion_max > 0 && career.duration_years > student.duracion_max) {
    const excess = career.duration_years - student.duracion_max;
    score *= Math.max(0.2, 1 - excess * 0.3);
  }

  return score;
}

/**
 * Tag matching: student interest tags vs career tags.
 * Student tags accumulate values from question answers; career tags from buildCareerProfile.
 */
function scoreTags(studentTags: Record<string, number>, careerTags: string[]): number {
  if (careerTags.length === 0) return 0.5;

  let matchScore = 0;
  let hasAnyTag = false;

  for (const tag of careerTags) {
    const studentVal = studentTags[tag] || 0;
    if (studentVal > 0) {
      hasAnyTag = true;
      matchScore += Math.min(1.0, studentVal / 3); // 3+ student value = full match
    }
  }

  if (!hasAnyTag) {
    // No overlap at all — check if student has ANY tags
    const totalStudentTags = Object.values(studentTags).filter((v) => v > 0).length;
    if (totalStudentTags === 0) return 0.5; // not enough data
    return 0.15; // student has tags but none match this career
  }

  return matchScore / careerTags.length;
}

// ── Explanation generator ──

function generateExplanation(
  profile: StudentProfile,
  career: CareerProfile,
  breakdown: ReturnType<typeof computeBreakdown>
): string {
  const parts: string[] = [];

  const riasecNames: Record<string, string> = {
    R: "práctico", I: "investigador", A: "creativo",
    S: "social", E: "emprendedor", C: "organizativo",
  };

  // Top RIASEC match
  if (breakdown.riasec > 0.8) {
    const topRiasec = (Object.entries(profile.riasec) as [string, number][])
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([k]) => riasecNames[k] || k);
    parts.push(`Tu perfil ${topRiasec.join(" y ")} encaja muy bien`);
  } else if (breakdown.riasec > 0.6) {
    parts.push("Tu tipo de personalidad es compatible");
  }

  // Aptitude highlight
  if (breakdown.aptitud > 0.7) {
    const topApt = (Object.entries(profile.aptitudes) as [string, number][])
      .sort(([, a], [, b]) => b - a)[0];
    if (topApt && topApt[1] > 3) {
      const aptNames: Record<string, string> = {
        logico_matematica: "lógico-matemática",
        verbal_linguistica: "verbal",
        espacial_visual: "espacial-visual",
        cientifico_tecnica: "científico-técnica",
        interpersonal: "interpersonal",
        corporal_kinestesica: "corporal-kinestésica",
      };
      parts.push(`Tu aptitud ${aptNames[topApt[0]] || topApt[0]} es un punto fuerte`);
    }
  }

  // Values alignment
  if (breakdown.valores > 0.7) {
    parts.push("Tus valores se alinean con esta carrera");
  }

  // Tag match
  if (breakdown.tags > 0.6) {
    parts.push("Tus intereses específicos encajan bien");
  }

  // Aversion warning
  if (breakdown.aversion < 0.5) {
    parts.push("Ojo: alguna de tus aversiones puede ser un reto");
  }

  if (parts.length === 0) {
    parts.push("Esta carrera tiene un perfil compatible con tus intereses");
  }

  return parts.join(". ") + ".";
}
