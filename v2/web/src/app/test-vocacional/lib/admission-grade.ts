import type { QuestionOption } from '../types';

export function isAdmissionGrade(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 5 && value <= 14
    && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;
}

export function parseAdmissionGrade(input: string): number | null {
  const clean = input.trim();
  if (!/^\d{1,2}(?:[.,]\d{1,3})?$/.test(clean)) return null;
  const value = Number(clean.replace(',', '.'));
  return isAdmissionGrade(value) ? value : null;
}

/** Canonical effects, never effects supplied by storage. */
export function admissionGradeOption(grade: number): QuestionOption {
  if (!isAdmissionGrade(grade)) throw new Error('Invalid admission grade');
  return {
    text: `Mi nota de admisión: ${grade.toLocaleString('es-ES', { maximumFractionDigits: 3 })}`,
    admissionGrade: grade,
    impacts: [{ dimension: 'pragmatico.nota_estimada', delta: grade }],
  };
}
