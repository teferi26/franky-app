/* ═══════════════════════════════════════════════════════════
   Adaptive Question Selector — chooses the next question
   based on entropy, conditions, diversity, and info gain.
   ═══════════════════════════════════════════════════════════ */

import type { AdaptiveQuestion, StudentProfile, QuizStage, QuestionCondition } from "../types";
import { calculateDimensionEntropy } from "./score-calculator";
import { questionTopic } from './question-topics';

/**
 * Select the best next question for the student to answer.
 */
export function selectNextQuestion(
  profile: StudentProfile,
  answeredIds: Set<string>,
  currentStage: QuizStage,
  questionBank: AdaptiveQuestion[],
  recentDimensions: string[] = []
): AdaptiveQuestion | null {
  // 1. Filter eligible questions
  const answeredTopics = new Set([...answeredIds].map(questionTopic));
  const eligible = questionBank.filter(
    (q) =>
      q.stage === currentStage &&
      !answeredTopics.has(questionTopic(q.id)) &&
      meetsConditions(q.conditions, profile)
  );

  if (eligible.length === 0) return null;

  // 2. Calculate entropy by dimension
  const entropy = calculateDimensionEntropy(profile);

  // 3. Score each question
  const scored = eligible.map((q) => ({
    question: q,
    score: calculateInfoGain(q, entropy, recentDimensions),
  }));

  // 4. Sort by score descending, return best
  scored.sort((a, b) => b.score - a.score);
  return scored[0].question;
}

/**
 * Stage flow: 1 → 5 (branch + doble grado) → 2 → 3 → 4
 * Stage 5 sits between 1 and 2 in the user's experience.
 */
export const STAGE_FLOW: QuizStage[] = [1, 5, 2, 3, 4];

/**
 * Determine whether the quiz should advance to the next stage.
 */
export function shouldAdvanceStage(
  currentStage: QuizStage,
  totalAnswered: number,
  profile: StudentProfile
): boolean {
  switch (currentStage) {
    case 1:
      // Stage 1 → 5 (branch detection): at least 8 questions and RIASEC starting to consolidate
      if (totalAnswered < 8) return false;
      return hasRiasecConfidence(profile) || totalAnswered >= 12;

    case 5:
      // Stage 5 → 2: when all 4 branch+doble-grado questions are answered
      // We measure this by tag presence: rama_X must be set AND doble_grado/grado_simple must be set
      return hasBranchAnswered(profile);

    case 2:
      // Stage 2 → 3: at least 25 total questions answered
      return totalAnswered >= 25;

    case 3:
      // Stage 3 → 4: at least 35 total questions
      return totalAnswered >= 35;

    case 4:
      // Final completion also requires practical answers; quiz-flow owns it.
      return false;

    default:
      return false;
  }
}

/**
 * Get the next stage number (or null if finished).
 */
export function getNextStage(current: QuizStage): QuizStage | null {
  const idx = STAGE_FLOW.indexOf(current);
  if (idx === -1 || idx === STAGE_FLOW.length - 1) return null;
  return STAGE_FLOW[idx + 1];
}

/**
 * Get max questions (for approximate progress bar).
 * The test is adaptive so this is an estimate.
 */
export function getEstimatedTotal(): number {
  return 50; // Upper target; conditional branches may finish sooner.
}

/**
 * Get the stage label for display.
 */
export function getStageLabel(stage: QuizStage): string {
  switch (stage) {
    case 1: return "Descubrimiento";
    case 5: return "Tu rama";
    case 2: return "Refinamiento";
    case 3: return "Diferenciación";
    case 4: return "Ajuste práctico";
  }
}

export function getStageDescription(stage: QuizStage): string {
  switch (stage) {
    case 1: return "Conociendo tu perfil general";
    case 5: return "Detectando tu rama y si te interesa un doble grado";
    case 2: return "Profundizando en tus áreas de interés";
    case 3: return "Diferenciando entre carreras similares";
    case 4: return "Últimos ajustes prácticos";
  }
}

// ── Internal helpers ──

function meetsConditions(
  conditions: QuestionCondition[] | undefined,
  profile: StudentProfile
): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((c) => {
    const value = getNestedValue(profile, c.dimension);
    // An unknown dimension cannot satisfy a condition. In particular, an
    // unanswered interest is not evidence for a specialised follow-up.
    if (value === undefined) return false;

    switch (c.operator) {
      case "gt":
        return value > (c.value as number);
      case "lt":
        return value < (c.value as number);
      case "eq":
        return value === (c.value as number);
      case "between": {
        const [min, max] = c.value as [number, number];
        return value >= min && value <= max;
      }
      default:
        return true;
    }
  });
}

function getNestedValue(profile: StudentProfile, path: string): number | undefined {
  const [group, key] = path.split(".");
  if (!group || !key) return undefined;

  if (group === "tags") {
    return profile.tags[key] ?? 0;
  }

  const section = profile[group as keyof StudentProfile];
  if (typeof section === "object" && section !== null) {
    const val = (section as Record<string, unknown>)[key];
    return typeof val === "number" ? val : undefined;
  }
  return undefined;
}

function calculateInfoGain(
  q: AdaptiveQuestion,
  entropy: Record<string, number>,
  recentDimensions: string[]
): number {
  let score = 0;

  // Collect unique top-level dimensions this question touches
  const dimensionsTouched = new Set<string>();
  for (const option of q.options) {
    for (const impact of option.impacts) {
      dimensionsTouched.add(impact.dimension.split(".")[0]);
    }
  }

  // Questions touching high-entropy dimensions are more valuable
  for (const dim of dimensionsTouched) {
    score += (entropy[dim] || 0) * q.weight;
  }

  // Bonus for info_gain_estimate
  score += (q.info_gain_estimate || 5) * 0.5;

  // Penalty for repeating recently asked dimensions (diversity)
  const recentSet = new Set(recentDimensions);
  for (const dim of dimensionsTouched) {
    if (recentSet.has(dim)) {
      score *= 0.7;
    }
  }

  return score;
}

function hasRiasecConfidence(profile: StudentProfile): boolean {
  const vals = Object.values(profile.riasec).sort((a, b) => b - a);
  // Top 2 RIASEC should be significantly ahead of the rest
  if (vals.length < 3) return false;
  const gap = vals[1] - vals[2]; // gap between 2nd and 3rd
  return gap >= 3 || vals[0] >= 8;
}

/**
 * Stage 5 finishes when the user has answered the branch question (a tag.rama_X
 * is set) AND the doble grado preference is set (doble_grado or grado_simple).
 */
function hasBranchAnswered(profile: StudentProfile): boolean {
  const tags = profile.tags || {};
  const hasRama =
    (tags.rama_ciencias_salud || 0) >= 1 ||
    (tags.rama_ingenieria_arquitectura || 0) >= 1 ||
    (tags.rama_ciencias || 0) >= 1 ||
    (tags.rama_ciencias_sociales_juridicas || 0) >= 1 ||
    (tags.rama_artes_humanidades || 0) >= 1;
  const hasDoubleAnswer = (tags.doble_grado || 0) >= 1 || (tags.grado_simple || 0) >= 1 || (tags.doble_grado_neutral || 0) >= 1;
  return hasRama && hasDoubleAnswer;
}
