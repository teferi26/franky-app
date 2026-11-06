import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NotasCorteListing } from '../app/notas-corte/NotasCorteListing';
import { packAdmissionCatalogue } from '../lib/admission-catalogue';
import CutOffSource from '../components/CutOffSource';

const base = { slug: null, branch: 'ciencias', campus: null, places_offered: null, demand_ratio: null,
  employment_rate: 99, duration_years: 4, cut_off_year: null, cut_off_score: null,
  universities: { name: 'UNED', short_name: 'UNED', city: 'Madrid', comunidad_autonoma: 'Madrid', slug: 'uned' } };
const careers = [
  { ...base, id: 'open', name: 'Grado abierto', admission_without_cutoff: true },
  { ...base, id: 'unknown', name: 'Grado por verificar' },
  { ...base, id: 'ranked', name: 'Grado con nota', cut_off_score: 11.234, cut_off_year: 2026 },
];
const props = { catalogue: packAdmissionCatalogue(careers), branchCounts: { ciencias: 3 }, initialBuscar: '', initialRama: '', initialOrden: 'desc', initialNotaMin: '', initialNotaMax: '' };

describe('verified admission without cutoff', () => {
  it('matches accented names when typed without accents and clears the search accessibly', () => {
    render(<NotasCorteListing {...props} catalogue={packAdmissionCatalogue([
      { ...base, id: 'biology', name: 'Grado en Biología' },
      { ...base, id: 'other', name: 'Grado en Historia' },
    ])} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por carrera, universidad o campus' }), { target: { value: ' BIOLOGIA ' } });
    expect(screen.getByRole('link', { name: /Grado en Biología/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Grado en Historia/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda' }));
    expect(screen.getByRole('link', { name: /Grado en Historia/ })).toBeTruthy();
  });
  it('never treats an unknown score as confirmed access and restores all results when cleared', () => {
    render(<NotasCorteListing {...props} initialWithoutCutoff />);
    expect(screen.getByRole('link', { name: /Grado abierto/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Grado por verificar/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Grado con nota/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Limpiar filtros/ }));
    expect(screen.getByRole('link', { name: /Grado por verificar/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Grado con nota/ })).toBeTruthy();
    expect(screen.queryByText(/99% empleo/)).toBeNull();
  });
  it('shows the verified access requirements and their official source without a fictitious academic year', () => {
    render(<CutOffSource career={{ admission_without_cutoff: true, cut_off_year: null,
      cut_off_round: 'Debes cumplir los requisitos de acceso',
      cut_off_source_url: 'https://www.uned.es/acceso', cut_off_verified_at: '2026-09-05T16:00:00Z' }} />);
    expect(screen.getByText('Acceso sin nota de corte')).toBeTruthy();
    expect(screen.getByText(/Debes cumplir los requisitos de acceso/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /fuente oficial/ }).getAttribute('href')).toBe('https://www.uned.es/acceso');
    expect(screen.queryByText(/Curso sin confirmar/)).toBeNull();
  });
});

describe('campus and study mode discovery', () => {
  const offers = [
    { ...base, id: 'leon', name: 'Grado en Enfermería', campus: 'León', modality: 'presencial', cut_off_score: 11.29 },
    { ...base, id: 'ponferrada', name: 'Grado en Enfermería', campus: 'Ponferrada', modality: 'presencial', cut_off_score: 10.861 },
    { ...base, id: 'psych-class', name: 'Grado en Psicología', campus: 'Burgos', modality: 'presencial', cut_off_score: 10.269 },
    { ...base, id: 'psych-online', name: 'Grado en Psicología', campus: 'Burgos', modality: 'online', cut_off_score: 8.404 },
  ];
  it('filters by the degree campus instead of the university headquarters and resets it', () => {
    render(<NotasCorteListing {...props} catalogue={packAdmissionCatalogue(offers)} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Campus o ciudad' }), { target: { value: 'Ponferrada' } });
    const found = screen.getAllByRole('link');
    expect(found).toHaveLength(1);
    expect(found[0].getAttribute('href')).toBe('/carreras/ponferrada');
    fireEvent.click(screen.getByRole('button', { name: /Limpiar filtros/ }));
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });
  it('distinguishes online and classroom offers and keeps the chosen mode visible in table view', () => {
    render(<NotasCorteListing {...props} catalogue={packAdmissionCatalogue(offers)} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Modalidad' }), { target: { value: 'online' } });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/carreras/psych-online');
    fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));
    expect(screen.getByRole('table').textContent).toContain('Online');
    fireEvent.click(screen.getByRole('button', { name: /Limpiar filtros/ }));
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });
  it('finds a degree plus its mode across separate fields without accents', () => {
    render(<NotasCorteListing {...props} catalogue={packAdmissionCatalogue(offers)} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por carrera, universidad o campus' }), { target: { value: '  psicologia ONLINE  ' } });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/carreras/psych-online');
  });
});

describe('ordinary and other admission routes', () => {
  it('does not present an extraordinary-only value as an ordinary cutoff or free access', () => {
    render(<CutOffSource career={{ cut_off_year: 2026, cut_off_score: null,
      cut_off_extraordinary: 7.136, cut_off_round: 'Cupo general · 4ª readmisión · 03/09/2026' }} />);
    expect(screen.getByText('Admisión · 2026/2027')).toBeTruthy();
    expect(screen.getByText(/No hay una nota ordinaria 26\/27 verificada/)).toBeTruthy();
    expect(screen.getByText(/Convocatoria extraordinaria: 7,136/)).toBeTruthy();
    expect(screen.queryByText('Acceso sin nota de corte')).toBeNull();
  });
  it('keeps the reference tied to its own list when a later round uses another access route', () => {
    render(<CutOffSource career={{ cut_off_year: 2026, cut_off_score: 6.12,
      cut_off_round: 'Ordinaria: primera lista. Última referencia de bachillerato homologado: 6,750' }} />);
    expect(screen.getByText(/La nota ordinaria es una referencia de la lista indicada/)).toBeTruthy();
    expect(screen.getByText(/bachillerato homologado: 6,750/)).toBeTruthy();
    expect(screen.queryByText(/último acceso publicado/)).toBeNull();
  });
});

describe('current and previous course switch', () => {
  const rows = [
    { ...base, id: 'both', name: 'Grado con dos cursos', cut_off_score: 12.5, cut_off_year: 2026, cut_off_score_prev: 11.25, cut_off_year_prev: 2025 },
    { ...base, id: 'old-only', name: 'Grado solo con nota vieja', cut_off_score: 9.5, cut_off_year: 2025 },
    { ...base, id: 'prev-only', name: 'Grado con nota anterior', cut_off_score: null, cut_off_year: null, cut_off_score_prev: 13.1, cut_off_year_prev: 2025 },
  ];
  const listing = <NotasCorteListing {...props} catalogue={packAdmissionCatalogue(rows)} />;
  const rowText = (name: RegExp) => screen.getByRole('link', { name }).textContent ?? '';

  it('shows only the current course by default and never passes an old score as current', () => {
    render(listing);
    expect(rowText(/Grado con dos cursos/)).toContain('12.500');
    expect(rowText(/Grado solo con nota vieja/)).not.toContain('9.500');
    expect(rowText(/Grado solo con nota vieja/)).toContain('Sin nota 26/27');
    expect(rowText(/Grado con nota anterior/)).toContain('Sin nota 26/27');
  });

  it('switches every score, sort and filter to the previous course with one button', () => {
    render(listing);
    fireEvent.click(screen.getByRole('button', { name: 'Ver notas 25/26' }));
    expect(rowText(/Grado con dos cursos/)).toContain('11.250');
    expect(rowText(/Grado solo con nota vieja/)).toContain('9.500');
    expect(rowText(/Grado con nota anterior/)).toContain('13.100');
    expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe('/carreras/prev-only');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Nota de corte mínima' }), { target: { value: '11' } });
    expect(screen.getAllByRole('link')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Ver notas 26/27' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(rowText(/Grado con dos cursos/)).toContain('12.500');
  });

  it('keeps each course with its own source in the career page', () => {
    render(<CutOffSource career={{ cut_off_score: 12.5, cut_off_year: 2026, cut_off_round: 'Primera lista 2026',
      cut_off_source_url: 'https://example.es/2026', cut_off_score_prev: 11.25, cut_off_year_prev: 2025,
      cut_off_round_prev: 'Primera lista 2025', cut_off_source_url_prev: 'https://example.es/2025' }} />);
    expect(screen.getByText('Admisión · 2026/2027')).toBeTruthy();
    expect(screen.getByText('12,500')).toBeTruthy();
    expect(screen.getByRole('link', { name: /fuente oficial/ }).getAttribute('href')).toBe('https://example.es/2026');
    fireEvent.click(screen.getByRole('button', { name: 'Ver notas 25/26' }));
    expect(screen.getByText('Admisión · 2025/2026')).toBeTruthy();
    expect(screen.getByText('11,250')).toBeTruthy();
    expect(screen.getByText(/Primera lista 2025/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /fuente oficial/ }).getAttribute('href')).toBe('https://example.es/2025');
  });

  it('does not offer the switch when there is no previous score', () => {
    render(<CutOffSource career={{ cut_off_score: 12.5, cut_off_year: 2026 }} />);
    expect(screen.queryByRole('button', { name: /Ver notas/ })).toBeNull();
  });
});
