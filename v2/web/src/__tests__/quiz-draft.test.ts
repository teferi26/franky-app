import { describe, expect, it } from 'vitest';
import { decodeQuizDraft, encodeQuizDraft } from '@/app/test-vocacional/lib/quiz-draft';
import { QUESTION_BANK } from '@/app/test-vocacional/lib/question-bank';
import { replayAnswers } from '@/app/test-vocacional/lib/answer-history';

describe('recovering vocational choices', () => {
  const q=QUESTION_BANK.find(q=>q.stage===1)!;
  it('rebuilds scores from the current question bank instead of persisted impacts', () => {
    const history=[{questionId:q.id,option:q.options[0],stage:1 as const}];
    const raw=encodeQuizDraft(history);
    expect(raw).not.toContain('impacts');
    const restored=decodeQuizDraft(raw)!;
    expect(replayAnswers(restored.history)).toEqual(replayAnswers(history));
  });
  it('rejects expired, duplicate or out-of-range answers', () => {
    const choice={id:q.id,option:0};
    expect(decodeQuizDraft(JSON.stringify({at:0,choices:[choice]}))).toBeNull();
    expect(decodeQuizDraft(JSON.stringify({at:Date.now(),choices:[choice,choice]}))).toBeNull();
    expect(decodeQuizDraft(JSON.stringify({at:Date.now(),choices:[{...choice,option:999}]}))).toBeNull();
  });
});
