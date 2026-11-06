import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { finiteNumber, positiveNumber, salaryRange, researchDate, nationalLabourReference, workloadGuidance } from '../lib/career-evidence';
import { DifficultyCard, LabourEvidenceSection, PreUniversitySection, ProfileScope, SalidasSection, PostUniversitySection, type CareerProfile } from '../app/carreras/[id]/profile-sections';

const profile = (overrides: Partial<CareerProfile> = {}) => ({
  id: 'ade', slug: 'ade', canonical_name: 'ADE', kind: 'grado', branch: null,
  overview: null, difficulty_score: null, difficulty_rationale: null,
  cut_off_min: null, cut_off_max: null, cut_off_median: null, pre_university: null,
  university_stage: null, post_university: null, salidas: null, salario_medio: null,
  empleabilidad: null, why_study: null, why_not_study: null, sources: null,
  research_confidence: null, researched_at: null, ...overrides,
} as CareerProfile);

describe('career evidence boundaries in both clients', () => {
  it('keeps preparation advice without inventing a difficulty score', () => {
    render(<DifficultyCard profile={profile({ difficulty_rationale: 'Practica la interpretación de datos.' })} />);
    expect(screen.getByRole('heading', { name: 'Cómo preparar el estudio' })).toBeTruthy();
    expect(screen.getByText('Practica la interpretación de datos.')).toBeTruthy();
    expect(screen.queryByText('/ 10')).toBeNull();
  });
  it.each([null, undefined, NaN, 11, '6'])('does not turn an invalid score into a number when advice exists: %s', value => {
    expect(workloadGuidance(value, ' Consejo ')).toMatchObject({score:null,rationale:'Consejo',title:'Cómo preparar el estudio'});
  });
  it('omits empty guidance and preserves a legitimate zero estimate', () => {
    expect(workloadGuidance(null, '  ')).toBeNull();
    expect(workloadGuidance(null, {})).toBeNull();
    expect(workloadGuidance(0, null)).toMatchObject({score:0,title:'Dificultad orientativa'});
  });
  it('keeps the native rules identical without importing web runtime into Expo', () => {
    expect(readFileSync(resolve(process.cwd(), '../mobile/src/lib/career-evidence.ts'), 'utf8'))
      .toBe(readFileSync(resolve(process.cwd(), 'src/lib/career-evidence.ts'), 'utf8'));
  });
  it.each([null, undefined, '', '4', NaN, Infinity, -1])('never invents a positive study fact from %s', value => {
    expect(positiveNumber(value)).toBeNull();
  });
  it('preserves legitimate zero percentages without accepting out-of-range values', () => {
    expect(finiteNumber(0, 0, 100)).toBe(0);
    expect(finiteNumber(100.1, 0, 100)).toBeNull();
    expect(positiveNumber(0)).toBeNull();
  });
  it.each([[0, 0], [0, 30000], [40000, 20000], [NaN, 1000], ['20000', 30000], [30000]])('rejects misleading salary ranges %j', (...values) => {
    expect(salaryRange(values)).toBeNull();
  });
  it('keeps valid salary currencies and rejects invalid dates', () => {
    expect(salaryRange([20000, 30000], 'USD')).toBe('20.000 – 30.000 USD');
    expect(researchDate('bad-date')).toBeNull();
    expect(researchDate('2026-06-14T08:27:48Z')).toBe('junio de 2026');
  });
});

const official = {
  provider: 'SIIU', scope: 'national_field', field_code: '041301', field_name: 'Administración y empresa',
  cohort: '2019-2020', last_follow_up_year: 2024, verified_at: '2026-09-06T02:00:00Z',
  source_url: 'https://estadisticas.ciencia.gob.es/jaxiPx/Tabla.htm?file=verified.px',
};

describe('national SIIU indicators', () => {
  it('keeps the cohort and national field attached to both follow-up periods', () => {
    render(<LabourEvidenceSection profile={profile({
      empleabilidad: { ...official, metric: 'ss_affiliation_rate', one_year_pct: 63.82, valor_pct: 78.91 },
      salario_medio: { ...official, metric: 'annual_contribution_base', one_year_eur: 21305.69, four_years_eur: 32426.89 },
    })} />);
    expect(screen.getByText('63,82 %')).toBeTruthy();
    expect(screen.getByText('78,91 %')).toBeTruthy();
    expect(screen.getByText('21.305,69 €')).toBeTruthy();
    expect(screen.getByText('32.426,89 €')).toBeTruthy();
    expect(screen.getAllByText(/Cohorte 2019-2020 · seguimiento hasta 2024/)).toHaveLength(2);
    expect(screen.getAllByText('Campo nacional: Administración y empresa')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Abrir tabla oficial del SIIU' })).toHaveLength(2);
  });
  it('distinguishes a suppressed observation from a genuine zero percentage', () => {
    render(<LabourEvidenceSection profile={profile({ empleabilidad: { ...official, metric: 'ss_affiliation_rate', one_year_pct: 0, valor_pct: null } })} />);
    expect(screen.getByText('0,00 %')).toBeTruthy();
    expect(screen.getByText('No publicado')).toBeTruthy();
    expect(screen.getByText(/no significa cero/)).toBeTruthy();
  });
  it('does not duplicate the official affiliation block in the study stages', () => {
    render(<PostUniversitySection post={{ insercion_laboral: { ...official, tasa_afiliacion_ss: 78.91, anios_referencia: 'Cohorte 2019-2020', fuente: 'SIIU' }, master_necesario: 'opcional' }} />);
    expect(screen.queryByText(/78,91/)).toBeNull();
    expect(screen.getByText('Opcional')).toBeTruthy();
  });
  it.each([
    { scope: 'university' }, { field_code: '' }, { field_name: '' }, { cohort: '2019-2021' },
    { last_follow_up_year: 2025 }, { source_url: 'https://estadisticas.ciencia.gob.es.fake.example/table' },
    { source_url: 'javascript:alert(1)' }, { source_url: 'https://name:secret@estadisticas.ciencia.gob.es/table' },
  ])('does not badge a malformed or different-scope reference as official: %j', change => {
    expect(nationalLabourReference({ ...official, ...change })).toBeNull();
  });
});

describe('visible scope of career guidance', () => {
  it('separates guide review date from the measurement period', () => {
    render(<ProfileScope profile={profile({ researched_at: '2026-06-14', sources: [{ url: 'https://example.com/study' }] })} />);
    expect(screen.getByText(/Guía general de la titulación/)).toBeTruthy();
    expect(screen.getByText(/Cada indicador conserva el periodo/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ver fuentes/ }).getAttribute('href')).toBe('#fuentes');
  });
  it('does not rename a contribution base or a four-year follow-up as a starting salary or five-year salary', () => {
    const source = 'Publicación de 2023: base de cotización media 14.123 € al año y 22.996 € a los 4 años.';
    render(<LabourEvidenceSection profile={profile({ salario_medio: { recien_egresado_eur: 14123, cinco_anios_eur: 22996, fuente: source } })} />);
    expect(screen.getByText(source)).toBeTruthy();
    expect(screen.queryByText(/Salario inicial|a 5 años/)).toBeNull();
    expect(screen.getByText(/no equivale a un sueldo neto/)).toBeTruthy();
  });
  it('requires both the definition and source of an employment percentage', () => {
    const { rerender, container } = render(<LabourEvidenceSection profile={profile({ empleabilidad: { valor_pct: 99, fuente: 'Informe' } })} />);
    expect(container.textContent).toBe('');
    rerender(<LabourEvidenceSection profile={profile({ empleabilidad: { valor_pct: 72, fuente: 'Informe 2023', definicion: 'Afiliación a los cuatro años del egreso' } })} />);
    expect(screen.getByText('72 %')).toBeTruthy();
    expect(screen.getByText('Afiliación a los cuatro años del egreso')).toBeTruthy();
  });
  it('shows difficulty as an estimate and does not render invalid scores', () => {
    const { rerender, container } = render(<DifficultyCard profile={profile({ difficulty_score: 20 })} />);
    expect(container.textContent).toBe('');
    rerender(<DifficultyCard profile={profile({ difficulty_score: 6.5 })} />);
    expect(screen.getByText(/Valoración orientativa de Franky/)).toBeTruthy();
  });
  it('replaces the unversioned historical cutoff range with current admission guidance', () => {
    render(<PreUniversitySection pre={{ bachillerato_recomendado: 'Ciencias Sociales' }} />);
    expect(screen.queryByText(/2025|Desde 5/)).toBeNull();
    expect(screen.getByRole('link', { name: /Explorar notas por curso/ })).toBeTruthy();
  });
  it('does not publish an unsourced affiliation metric', () => {
    render(<PostUniversitySection post={{ insercion_laboral: { tasa_afiliacion_ss: 93, anios_referencia: '2023' } }} />);
    expect(screen.queryByText('93 %')).toBeNull();
  });
  it('retains career paths while suppressing zero, missing-source and missing-currency salary claims', () => {
    render(<SalidasSection salidas={[
      { rol: 'Emprender', salario_espana_eur: { junior: [0, 0], con_experiencia: [0, 0], fuente: 'Variable' } },
      { rol: 'Puesto sin fuente', salario_espana_eur: { junior: [40000, 60000] } },
      { rol: 'Analista', salario_espana_eur: { junior: [20000, 30000], fuente: 'Guía profesional 2025' }, salario_extranjero: [{ pais: 'País', rango: [80000, 90000], fuente: 'Guía 2025' }] },
    ]} />);
    expect(screen.getByText('Emprender')).toBeTruthy();
    expect(screen.queryByText(/0 – 0 €|40.000|80.000/)).toBeNull();
    expect(screen.getByText(/Fuente: Guía profesional 2025/)).toBeTruthy();
    expect(screen.getAllByText(/20.000 – 30.000/).length).toBeGreaterThan(0);
  });
});
