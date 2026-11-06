import { describe, expect, it } from 'vitest';
import { resolveCareerRiasec } from '@/app/test-vocacional/lib/career-riasec';
import { buildCareerProfile } from '@/app/test-vocacional/lib/career-profiles';
import { computeAllMatches, getTopMatches } from '@/app/test-vocacional/lib/matching-engine';
import { createEmptyProfile, type CareerProfile } from '@/app/test-vocacional/types';
import { isCurrentVocationalResult, VOCATIONAL_MATCHING_VERSION } from '@/lib/vocational-version';
import { isCurrentVocationalResult as nativeIsCurrent, VOCATIONAL_MATCHING_VERSION as nativeVersion } from '../../../mobile/src/lib/vocational-version';

const zero = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
const generated = buildCareerProfile('Grado en Enfermería', 'ciencias_salud', 10, 'grado');

describe('career interests remain part of the recommendation', () => {
  it('counts the extra half-year when the student prefers a maximum of five years', () => {
    const student = createEmptyProfile();
    student.pragmatico.duracion_max = 5;
    const base = { ...generated, name: 'Opción', branch: 'ciencias_salud', university_id: null, cut_off_score: null, employment_rate: null };
    const matches = computeAllMatches(student, [
      { ...base, id: 'five', duration_years: 5 },
      { ...base, id: 'five-and-half', duration_years: 5.5 },
    ]);
    expect(matches.find(m => m.career.id === 'five')?.scoreBreakdown.pragmatico).toBe(1);
    expect(matches.find(m => m.career.id === 'five-and-half')?.scoreBreakdown.pragmatico).toBe(0.85);
    expect(matches.find(m => m.career.id === 'five-and-half')?.career.duration_years).toBe(5.5);
  });
  it('treats the database zero default as an unfilled profile', () => {
    const resolved = resolveCareerRiasec(generated.riasec, zero);
    expect(resolved).toEqual(generated.riasec);
    expect(resolved).not.toBe(generated.riasec);
    expect(resolved.S).toBeGreaterThan(resolved.A);
    expect(zero.S).toBe(0);
  });
  it.each([null, {}, { R: 8 }, { ...zero, S: '8' }, { ...zero, I: NaN }, { ...zero, I: Infinity }, { ...zero, I: -3 }, { ...zero, I: 101 }, [5, 4, 3, 2, 1, 0]])('uses the full fallback for an absent or invalid stored vector: %j', stored => {
    expect(resolveCareerRiasec(generated.riasec, stored)).toEqual(generated.riasec);
  });
  it('preserves a complete meaningful vector, including genuine zeros, without extra dimensions', () => {
    const stored = { ...zero, S: 80, extra: 100 };
    expect(resolveCareerRiasec(generated.riasec, stored)).toEqual({ ...zero, S: 80 });
    expect(stored.extra).toBe(100);
  });
  it('changes career order when the student changes interests, with all other factors equal', () => {
    const base = { ...generated, name: 'Opción', branch: 'ciencias_salud', university_id: null, duration_years: 4, cut_off_score: null, employment_rate: null };
    const choices: CareerProfile[] = [
      { ...base, id: 'social', riasec: resolveCareerRiasec({ ...zero, S: 10 }, zero) },
      { ...base, id: 'artistic', riasec: resolveCareerRiasec({ ...zero, A: 10 }, zero) },
    ];
    const student = createEmptyProfile();
    student.riasec = { ...zero, S: 10 };
    const social = computeAllMatches(student, choices);
    expect(social[0].career.id).toBe('social');
    expect(social[0].scoreFinal).toBeGreaterThan(social[1].scoreFinal);
    expect(social[0].scoreBreakdown.riasec).toBe(1);
    student.riasec = { ...zero, A: 10 };
    const artistic = computeAllMatches(student, choices);
    expect(artistic[0].career.id).toBe('artistic');
    expect(artistic[0].scoreFinal).toBeGreaterThan(artistic[1].scoreFinal);
  });
  it('distinguishes old saved results on both platforms without rewriting them', () => {
    expect(nativeVersion).toBe(VOCATIONAL_MATCHING_VERSION);
    for (const check of [isCurrentVocationalResult, nativeIsCurrent]) {
      expect(check(null)).toBe(false);
      expect(check({})).toBe(false);
      expect(check({ matching_version: 'older' })).toBe(false);
      expect(check({ matching_version: VOCATIONAL_MATCHING_VERSION })).toBe(true);
    }
  });
  it('recommends distinct degrees instead of filling the list with university duplicates', () => {
    const base = { ...generated, id: 'one', name: 'Grado en Psicología', branch: 'ciencias_salud', university_id: null, duration_years: 4, cut_off_score: null, employment_rate: null };
    const [match] = computeAllMatches(createEmptyProfile(), [base]);
    const candidates = [
      { ...match, career: { ...base, id: 'aspirational' }, scoreFinal: 95, isAspiracional: true },
      { ...match, career: { ...base, id: 'best' }, scoreFinal: 90, isAspiracional: false },
      { ...match, career: { ...base, id: 'duplicate', name: 'GRADO EN PSICOLOGIA' }, scoreFinal: 89, isAspiracional: false },
      { ...match, career: { ...base, id: 'other', name: 'Grado en Enfermería' }, scoreFinal: 88, isAspiracional: false },
      { ...match, career: { ...base, id: 'higher', name: 'Grado en Medicina' }, scoreFinal: 87, isAspiracional: true },
    ];
    const selected = getTopMatches(candidates, 2, 2);
    expect(selected.top.map(m => m.career.id)).toEqual(['best', 'other']);
    expect(selected.aspirational.map(m => m.career.id)).toEqual(['higher']);
  });
  it('does not hide an aspirational degree behind a weaker offer with the same high cut-off', () => {
    const student = createEmptyProfile();
    student.pragmatico = { nota_estimada: 5, presupuesto: 2, duracion_max: 4 };
    student.riasec.I = 10;
    for (const key of Object.keys(student.aptitudes) as (keyof typeof student.aptitudes)[]) student.aptitudes[key] = 3;
    const base = { ...buildCareerProfile('Grado en Enfermeria', 'ciencias_salud', 14, 'grado'), name: 'Grado en Enfermeria', branch: 'ciencias_salud', university_id: null, duration_years: 4, cut_off_score: 14, employment_rate: null };
    const matches = computeAllMatches(student, [
      { ...base, id: 'public', university_type: 'publica' },
      { ...base, id: 'private', university_type: 'privada' },
    ]);
    expect(matches.map(m => m.scoreFinal)).toEqual([46, 45]);
    expect(matches.every(m => m.isAspiracional)).toBe(true);
    const selected = getTopMatches(matches);
    expect(selected.top).toEqual([]);
    expect(selected.aspirational.map(m => m.career.id)).toEqual(['public']);
  });
});
