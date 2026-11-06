import type { QuestionOption, QuizStage } from '../types';
import { QUESTION_BANK } from './question-bank';
import { replayAnswers } from './answer-history';
import { resolveQuizStep } from './quiz-flow';
import { STAGE_FLOW } from './adaptive-selector';
import { admissionGradeOption, isAdmissionGrade } from './admission-grade';

export const QUIZ_DRAFT_KEY = 'franky:quiz-draft:2026-09';
export type AnswerEntry = { questionId: string; option: QuestionOption; stage: QuizStage };
/** Store choices, never client-supplied score impacts. Draft expires after one day. */
export function encodeQuizDraft(history: AnswerEntry[]) {
  return JSON.stringify({ at: Date.now(), choices: history.map(entry => entry.questionId === 'q4_01' && isAdmissionGrade(entry.option.admissionGrade)
    ? { id: entry.questionId, grade: entry.option.admissionGrade }
    : { id: entry.questionId, option: QUESTION_BANK.find(q=>q.id===entry.questionId)?.options.findIndex(o=>o.text===entry.option.text) }) });
}
export function decodeQuizDraft(raw: string | null, now = Date.now()): { history: AnswerEntry[]; stage: QuizStage } | null {
  try {
    if (!raw || raw.length>30000) return null;
    const draft = JSON.parse(raw);
    if (!Number.isFinite(draft.at) || now-draft.at>86400000 || draft.at>now+60000 || !Array.isArray(draft.choices) || draft.choices.length>80) return null;
    const history: AnswerEntry[]=[];
    const seen=new Set<string>();
    let stage:QuizStage=1;
    for(const choice of draft.choices) {
      const q=QUESTION_BANK.find(q=>q.id===choice?.id);
      if(!q || seen.has(q.id)) return null;
      const hasGrade = Object.prototype.hasOwnProperty.call(choice, 'grade');
      if (hasGrade && (q.id !== 'q4_01' || !isAdmissionGrade(choice.grade) || 'option' in choice)) return null;
      if (!hasGrade && (!Number.isInteger(choice.option) || !q.options[choice.option])) return null;
      const option = hasGrade ? admissionGradeOption(choice.grade) : q.options[choice.option];
      // Restore the canonical history, not the old selector's decisions. A
      // stricter eligibility rule may now skip questions already answered.
      // Stage order must remain monotonic; score impacts still come from bank.
      if ((history.length === 0 && q.stage !== 1) || STAGE_FLOW.indexOf(q.stage) < STAGE_FLOW.indexOf(stage)) return null;
      stage=q.stage;
      seen.add(q.id); history.push({questionId:q.id, option, stage});
    }
    const replay=replayAnswers(history);
    stage=resolveQuizStep(replay.profile,new Set(replay.answeredIds),stage,QUESTION_BANK,replay.recentDims).stage;
    return {history,stage};
  } catch { return null; }
}
