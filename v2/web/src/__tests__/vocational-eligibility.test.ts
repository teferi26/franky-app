import { describe, expect, it } from 'vitest';
import { createEmptyProfile } from '@/app/test-vocacional/types';
import { QUESTION_BANK } from '@/app/test-vocacional/lib/question-bank';
import { selectNextQuestion } from '@/app/test-vocacional/lib/adaptive-selector';
import { decodeQuizDraft } from '@/app/test-vocacional/lib/quiz-draft';
import { replayAnswers } from '@/app/test-vocacional/lib/answer-history';

describe('only ask follow-ups supported by previous answers', () => {
  const doubles = QUESTION_BANK.filter(q => q.id.startsWith('q3_dg'));
  it('does not treat absent interest tags as interest in every double degree', () => {
    const profile = createEmptyProfile();
    profile.riasec.S = 20; profile.tags.medicina = 12;
    expect(selectNextQuestion(profile, new Set(), 3, doubles)).toBeNull();
    profile.tags.informatica = 2;
    expect(selectNextQuestion(profile, new Set(), 3, doubles)?.id).toBe('q3_dg01');
  });
  it('rejects a condition on an unknown profile dimension', () => {
    const question = { ...doubles[0], conditions: [{ dimension: 'missing.field', operator: 'lt' as const, value: 10 }] };
    expect(selectNextQuestion(createEmptyProfile(), new Set(), 3, [question])).toBeNull();
  });
  it('lets the student decline specialised options without adding a preference', () => {
    const questions = QUESTION_BANK.filter(q => q.stage === 2 || q.stage === 3);
    expect(questions.length).toBeGreaterThan(30);
    for (const q of questions) {
      const neutral = q.options.find(option => option.impacts.length === 0);
      expect(neutral, q.id).toBeDefined();
      expect(replayAnswers([{ questionId: q.id, stage: q.stage, option: neutral! }]).profile).toEqual(createEmptyProfile());
    }
  });
  it('restores a historical sequence even if a stricter selector would skip those questions now', () => {
    const choices = ['q1_01', 'q3_dg01', 'q3_dg02', 'q4_01'].map(id => ({ id, option: 0 }));
    const draft = decodeQuizDraft(JSON.stringify({ at: Date.now(), choices }));
    expect(draft?.history.map(entry => entry.questionId)).toEqual(choices.map(c => c.id));
    expect(draft?.stage).toBe(4);
  });
  it('rejects a draft that moves backwards through phases', () => {
    const choices = ['q1_01', 'q4_01', 'q3_dg01'].map(id => ({ id, option: 0 }));
    expect(decodeQuizDraft(JSON.stringify({ at: Date.now(), choices }))).toBeNull();
  });
});
