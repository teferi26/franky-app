import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createEmptyProfile } from '@/app/test-vocacional/types';
import { QUESTION_BANK } from '@/app/test-vocacional/lib/question-bank';
import { selectNextQuestion } from '@/app/test-vocacional/lib/adaptive-selector';
import { replayAnswers } from '@/app/test-vocacional/lib/answer-history';
import { encodeQuizDraft, decodeQuizDraft } from '@/app/test-vocacional/lib/quiz-draft';
import { buildCareerProfile } from '@/app/test-vocacional/lib/career-profiles';
import { computeAllMatches } from '@/app/test-vocacional/lib/matching-engine';
import { justifyCareer } from '@/app/test-vocacional/lib/justifications';
import { normalizeVocationalBigFive } from '@/lib/vocational-big-five';
import BigFiveSummary from '@/app/test-vocacional/components/BigFiveSummary';

describe('recommendations reflect evidence rather than unmeasured abilities', () => {
  const campus = QUESTION_BANK.find(q => q.id === 'q4_uni_campus')!;
  const duplicate = QUESTION_BANK.find(q => q.id === 'q4_12')!;
  it.each([campus.id, duplicate.id])('does not ask an equivalent campus question after %s', id => {
    expect(selectNextQuestion(createEmptyProfile(), new Set([id]), 4, [campus, duplicate])).toBeNull();
  });
  it('preserves both historical answers but scores only the last preference, including after restore or back', () => {
    const first = QUESTION_BANK.find(q => q.stage === 1)!;
    const initial = { questionId: first.id, stage: first.stage, option: first.options[0] };
    const older = { questionId: campus.id, stage: campus.stage, option: campus.options[0] };
    const latest = { questionId: duplicate.id, stage: duplicate.stage, option: duplicate.options[1] };
    const history = [initial, older, latest];
    const actual = replayAnswers(history);
    expect(actual.profile).toEqual(replayAnswers([initial, latest]).profile);
    expect(actual.answeredIds).toHaveLength(3);
    const restored = decodeQuizDraft(encodeQuizDraft(history))!;
    expect(restored.history).toHaveLength(3);
    expect(replayAnswers(restored.history).profile).toEqual(actual.profile);
    expect(replayAnswers(restored.history.slice(0, -1)).profile).toEqual(replayAnswers([initial, older]).profile);
  });
  it.each([[11.734, true], [11.735, false], [11.736, false]])('classifies a one-thousandth reference grade gap for %s correctly', (grade, expected) => {
    const profile = createEmptyProfile(); profile.pragmatico.nota_estimada = grade;
    const career = { ...buildCareerProfile('Grado en Enfermería', 'ciencias_salud', 11.735, 'grado'), id: 'example', name: 'Grado en Enfermería', branch: 'ciencias_salud', cut_off_score: 11.735, cut_off_year: 2026, university_id: null, duration_years: 4, employment_rate: 99 };
    expect(computeAllMatches(profile, [career])[0].isAspiracional).toBe(expected);
  });
  it('does not turn a stored employment figure into a guaranteed outcome', () => {
    const profile = createEmptyProfile(); profile.riasec.S = 8; profile.aptitudes.interpersonal = 8;
    const career = { ...buildCareerProfile('Grado en Enfermería', 'ciencias_salud', null, 'grado'), id: 'example', name: 'Grado en Enfermería', branch: 'ciencias_salud', cut_off_score: null, university_id: null, duration_years: 4, employment_rate: 99 };
    const explanation = justifyCareer(profile, null, computeAllMatches(profile, [career])[0]);
    expect(explanation).toContain('En tus respuestas');
    expect(explanation).not.toMatch(/99|apuesta segura|partes con ventaja|vas a brillar/);
  });
  it('normalises legacy traits while retaining zeros and genuine midpoints', () => {
    expect(normalizeVocationalBigFive({ openness: 0, conscientiousness: 50, neuroticism: 20 })).toEqual({ O: 0, C: 50, N: 20 });
    expect(normalizeVocationalBigFive({ O: NaN, C: -1, E: 101, A: '50' })).toEqual({});
  });
  it('shows legacy stability inverted exactly once without inventing missing traits', () => {
    render(<BigFiveSummary scores={{ neuroticism: 20 }} />);
    expect(screen.getByText('80/100')).toBeInTheDocument();
    expect(screen.getByText('Estabilidad emocional')).toBeInTheDocument();
    expect(screen.queryByText('Apertura a la experiencia')).toBeNull();
    expect(screen.queryByText('50/100')).toBeNull();
  });
  it('does not show five invented neutral traits for an empty historical object', () => {
    const { container } = render(<BigFiveSummary scores={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
