import { createEmptyProfile, type QuestionOption, type QuizStage } from "../types";
import { applyImpacts } from "./score-calculator";
import { COMUNIDAD_MAPPING } from "./question-bank";
import { questionTopic } from './question-topics';

export interface AnswerEntry { questionId: string; option: QuestionOption; stage: QuizStage }

// Replay into a fresh profile. React state and previous answers remain immutable,
// and going back restores the exact state, including non-numeric answers.
export function replayAnswers(history: AnswerEntry[]) {
  const profile = createEmptyProfile();
  let recentDims: string[] = [];
  const lastAnswer = new Map(history.map((entry, index) => [questionTopic(entry.questionId), index]));
  for (const [index, entry] of history.entries()) {
    if (lastAnswer.get(questionTopic(entry.questionId)) !== index) continue;
    applyImpacts(profile, entry.option.impacts);
    if (entry.questionId === "q4_04") {
      profile.geografico.comunidad_actual = COMUNIDAD_MAPPING[entry.option.text] ?? "";
    }
    recentDims = [...entry.option.impacts.map(impact => impact.dimension.split(".")[0]), ...recentDims].slice(0, 6);
  }
  return { profile, recentDims, answeredIds: history.map(entry => entry.questionId) };
}
