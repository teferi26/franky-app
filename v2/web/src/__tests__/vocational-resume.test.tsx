import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuizEngine from '@/app/test-vocacional/components/QuizEngine';
import BigFiveQuiz from '@/app/test-vocacional/components/BigFiveQuiz';
import { BIG_FIVE_QUESTIONS } from '@/app/test-vocacional/lib/big-five';
import { QUESTION_BANK } from '@/app/test-vocacional/lib/question-bank';
import { replayAnswers } from '@/app/test-vocacional/lib/answer-history';
import { resolveQuizStep } from '@/app/test-vocacional/lib/quiz-flow';
import { encodeQuizDraft, QUIZ_DRAFT_KEY, type AnswerEntry } from '@/app/test-vocacional/lib/quiz-draft';
import { ownedDraftKey } from '@/app/test-vocacional/lib/draft-storage';
import type { AdaptiveQuestion, QuestionOption, QuizStage } from '@/app/test-vocacional/types';

// Replace only the animated card; transitions, restoration and completion are real.
vi.mock('@/app/test-vocacional/components/QuestionCard', () => ({ default: ({ question, onAnswer }: { question: AdaptiveQuestion; onAnswer: (o: QuestionOption) => void }) => <div><h2>{question.text}</h2>{question.options.map((option, i) => <button key={i} onClick={() => onAnswer(option)}>{option.text}</button>)}</div> }));

function completedHistory() {
  const history: AnswerEntry[] = [];
  let stage: QuizStage = 1;
  for (let n = 0; n < 80; n++) {
    const replay = replayAnswers(history);
    const step = resolveQuizStep(replay.profile, new Set(replay.answeredIds), stage, QUESTION_BANK, replay.recentDims);
    if (step.complete) return history;
    stage = step.stage;
    if (!step.question) throw new Error('Unexpected dead end');
    history.push({ questionId: step.question.id, option: step.question.options[0], stage });
  }
  throw new Error('Quiz did not finish');
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });

describe('returning from personality to vocational answers', () => {
  it('opens the last question for editing instead of completing again immediately', async () => {
    const history = completedHistory();
    sessionStorage.setItem(ownedDraftKey(QUIZ_DRAFT_KEY, 'alice'), encodeQuizDraft(history));
    const done = vi.fn();
    render(<QuizEngine owner="alice" resumePrevious onComplete={done} />);
    const last = QUESTION_BANK.find(q => q.id === history.at(-1)!.questionId)!;
    await screen.findByRole('heading', { name: last.text });
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: last.options.at(-1)!.text }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    const edited = [...history.slice(0, -1), { ...history.at(-1)!, option: last.options.at(-1)! }];
    expect(done.mock.calls[0][0]).toEqual(replayAnswers(edited).profile);
    expect(done.mock.calls[0][1]).toHaveLength(history.length);
  });
  it('resumes a completed draft normally only once when review was not requested', async () => {
    sessionStorage.setItem(ownedDraftKey(QUIZ_DRAFT_KEY, 'alice'), encodeQuizDraft(completedHistory()));
    const done = vi.fn();
    render(<QuizEngine owner="alice" onComplete={done} />);
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  });
  it('does not restore another owner’s complete draft', async () => {
    sessionStorage.setItem(ownedDraftKey(QUIZ_DRAFT_KEY, 'alice'), encodeQuizDraft(completedHistory()));
    const done = vi.fn();
    render(<QuizEngine owner="bob" resumePrevious onComplete={done} />);
    await screen.findByText(/0 respuestas/);
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });
  it('preserves both questionnaires when storage reads and writes fail', async () => {
    const history = completedHistory();
    const firstAnswers = Object.fromEntries(BIG_FIVE_QUESTIONS.slice(0, 5).map((q, i) => [q.id, i + 1]));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Storage disabled', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError'); });
    const done = vi.fn();
    function Journey() {
      const [phase, setPhase] = useState('personality');
      const [memoryHistory, setMemoryHistory] = useState(history);
      const [memoryAnswers, setMemoryAnswers] = useState(firstAnswers);
      return phase === 'personality'
        ? <BigFiveQuiz owner="alice" initialAnswers={memoryAnswers} onAnswersChange={setMemoryAnswers} onBack={() => setPhase('vocational')} onComplete={done} />
        : <QuizEngine owner="alice" resumePrevious initialHistory={memoryHistory} onComplete={(_, __, entries) => { setMemoryHistory(entries); setPhase('personality'); }} />;
    }
    render(<Journey />);
    await screen.findByText('Bloque 2 de 7');
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    const firstQuestion = BIG_FIVE_QUESTIONS[0];
    fireEvent.click(screen.getByRole('button', { name: `${firstQuestion.text}: De acuerdo` }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    const last = QUESTION_BANK.find(q => q.id === history.at(-1)!.questionId)!;
    await screen.findByRole('heading', { name: last.text });
    expect(screen.getByText(new RegExp(`${history.length - 1} respuestas$`))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: last.options.at(-1)!.text }));
    await screen.findByText('Bloque 2 de 7');
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByRole('button', { name: `${firstQuestion.text}: De acuerdo` })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    expect(done).not.toHaveBeenCalled();
  });
});
