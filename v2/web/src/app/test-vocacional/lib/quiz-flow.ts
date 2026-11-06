import type { AdaptiveQuestion, QuizStage, StudentProfile } from '../types';
import { getNextStage, selectNextQuestion, shouldAdvanceStage } from './adaptive-selector';

export const REQUIRED_PRACTICAL_QUESTIONS = ['q4_01', 'q4_02', 'q4_03', 'q4_04', 'q4_05'] as const;
export type QuizStep = { stage: QuizStage; question: AdaptiveQuestion | null; complete: boolean };

/** Exhausting one conditional branch advances the quiz, not the results page. */
export function resolveQuizStep(
  profile: StudentProfile,
  answeredIds: Set<string>,
  initialStage: QuizStage,
  bank: AdaptiveQuestion[],
  recentDimensions: string[] = [],
): QuizStep {
  let stage = initialStage;
  for (let visited = 0; visited < 5; visited += 1) {
    const next = getNextStage(stage);
    if (next !== null && shouldAdvanceStage(stage, answeredIds.size, profile)) {
      stage = next;
      continue;
    }

    const practicalDone = REQUIRED_PRACTICAL_QUESTIONS.every(id => answeredIds.has(id));
    // Ask the essential constraints first; a question-count limit must never
    // bypass grade, budget, mobility, region or study duration.
    const required = stage === 4 ? REQUIRED_PRACTICAL_QUESTIONS
      .filter(id => !answeredIds.has(id)).map(id => bank.find(q => q.id === id && q.stage === 4)).find(Boolean) : undefined;
    const question = required ?? selectNextQuestion(profile, answeredIds, stage, bank, recentDimensions);
    if (stage === 4 && practicalDone && (answeredIds.size >= 50 || !question)) {
      return { stage, question: null, complete: true };
    }
    if (question) return { stage, question, complete: false };
    if (next === null) return { stage, question: null, complete: false };
    stage = next;
  }
  return { stage, question: null, complete: false };
}
