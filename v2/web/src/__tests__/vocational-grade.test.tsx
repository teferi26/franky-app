import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionCard from '@/app/test-vocacional/components/QuestionCard';
import QuizEngine from '@/app/test-vocacional/components/QuizEngine';
import { QUESTION_BANK } from '@/app/test-vocacional/lib/question-bank';
import { admissionGradeOption, parseAdmissionGrade } from '@/app/test-vocacional/lib/admission-grade';
import { decodeQuizDraft, encodeQuizDraft } from '@/app/test-vocacional/lib/quiz-draft';
import { replayAnswers } from '@/app/test-vocacional/lib/answer-history';

afterEach(() => { cleanup(); sessionStorage.clear(); });
const question = QUESTION_BANK.find(q => q.id === 'q4_01')!;
describe('precise admission grade', () => {
  it.each([['11,735', 11.735], ['11.735', 11.735], ['5', 5], ['14', 14]])('accepts %s and preserves its value', (input, value) => {
    expect(parseAdmissionGrade(input as string)).toBe(value);
  });
  it.each(['', '4.999', '14.001', '11.7351', 'Infinity', 'NaN', '1e1', '10,2.3'])('rejects %s', input => {
    expect(parseAdmissionGrade(input)).toBeNull();
  });
  it('restores an exact grade using canonical impacts and supports older interval drafts', () => {
    const first = QUESTION_BANK.find(q => q.id === 'q1_01')!;
    const history = [{ questionId: first.id, stage: first.stage, option: first.options[0] }, { questionId: question.id, stage: question.stage, option: admissionGradeOption(11.735) }];
    const raw = encodeQuizDraft(history);
    expect(JSON.parse(raw).choices[1]).toEqual({ id: 'q4_01', grade: 11.735 });
    expect(replayAnswers(decodeQuizDraft(raw)!.history).profile.pragmatico.nota_estimada).toBe(11.735);
    history[1].option = question.options[0];
    expect(replayAnswers(decodeQuizDraft(encodeQuizDraft(history))!.history).profile.pragmatico.nota_estimada).toBe(6);
  });
  it.each([{ id: 'q1_01', grade: 10 }, { id: 'q4_01', grade: 15 }, { id: 'q4_01', grade: '12' }, { id: 'q4_01', grade: 12, option: 0 }])('rejects an invalid numeric draft entry %j', choice => {
    const choices = [{ id: 'q1_02', option: 0 }, choice];
    expect(decodeQuizDraft(JSON.stringify({ at: Date.now(), choices }))).toBeNull();
  });
  it('shows validation, accepts comma decimals and submits once', async () => {
    const done = vi.fn();
    render(<QuestionCard question={question} questionNumber={30} totalAnswered={29} onAnswer={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta nota' }));
    expect(screen.getByRole('alert')).toHaveTextContent('entre 5 y 14');
    fireEvent.change(screen.getByLabelText('Tu nota sobre 14'), { target: { value: '11,735' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta nota' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta nota' }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(done).toHaveBeenCalledWith(admissionGradeOption(11.735));
  });
  it('prefills the exact grade when reviewing an answer, while retaining unknown and interval options', () => {
    render(<QuestionCard question={question} questionNumber={30} totalAnswered={29} onAnswer={vi.fn()} initialAnswer={admissionGradeOption(11.735)} />);
    expect(screen.getByLabelText('Tu nota sobre 14')).toHaveValue('11,735');
    expect(screen.getByRole('button', { name: /Aún no lo sé/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /5 a 7/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prefiero elegir un intervalo' }));
    expect(screen.getByRole('button', { name: /5 a 7/ })).toBeInTheDocument();
  });
  it('returns to a precise grade through the real engine without clearing it', async () => {
    const first = QUESTION_BANK.find(q => q.id === 'q1_01')!;
    const history = [{ questionId: first.id, stage: first.stage, option: first.options[0] }, { questionId: question.id, stage: question.stage, option: admissionGradeOption(11.735) }];
    render(<QuizEngine owner="alice" initialHistory={history} onComplete={vi.fn()} />);
    await screen.findByRole('heading', { name: '¿Tipo de universidad?' });
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await screen.findByRole('heading', { name: question.text });
    expect(screen.getByLabelText('Tu nota sobre 14')).toHaveValue('11,735');
    fireEvent.change(screen.getByLabelText('Tu nota sobre 14'), { target: { value: '12,135' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta nota' }));
    await screen.findByRole('heading', { name: '¿Tipo de universidad?' });
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByLabelText('Tu nota sobre 14')).toHaveValue('12,135');
  });
});
