import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionCard from '@/app/test-vocacional/components/QuestionCard';
import { QUESTION_BANK } from '@/app/test-vocacional/lib/question-bank';
import { replayAnswers } from '@/app/test-vocacional/lib/answer-history';
const question = QUESTION_BANK.find(q => q.id === 'q4_04')!;
afterEach(cleanup);

describe('finding a region without scrolling through every option', () => {
  it('searches without accents and submits the original option', async () => {
    const done = vi.fn();
    render(<QuestionCard question={question} questionNumber={30} totalAnswered={29} onAnswer={done} />);
    fireEvent.change(screen.getByLabelText('Buscar una opción'), { target: { value: 'aragon' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 opción');
    fireEvent.click(screen.getByRole('button', { name: /Aragón/ }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(replayAnswers([{ questionId: question.id, stage: 4, option: done.mock.calls[0][0] }]).profile.geografico.comunidad_actual).toBe('aragon');
  });
  it('recovers from an empty search and includes autonomous cities and residence abroad', () => {
    render(<QuestionCard question={question} questionNumber={30} totalAnswered={29} onAnswer={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Buscar una opción'), { target: { value: 'no existe' } });
    expect(screen.getByRole('status')).toHaveTextContent('0 opciones');
    fireEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda y ver todas' }));
    for (const name of ['Ceuta', 'Melilla', 'Vivo fuera de España']) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
  });
});
