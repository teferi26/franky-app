import { describe, expect, it } from 'vitest';
import { packAdmissionCatalogue, unpackAdmissionCatalogue, type AdmissionCareer } from '../lib/admission-catalogue';
import { universityListing, universityPageHref, universityParams } from '../lib/university-listing';

describe('complete admission catalogue transport', () => {
  const university = { name: 'Universidad de Alicante', short_name: 'UA', city: 'Alicante', comunidad_autonoma: 'Comunidad Valenciana', slug: 'universidad-de-alicante' };
  it('preserves every offer, distinct campuses, unknown scores and verified access beyond the database page cap', () => {
    const careers: AdmissionCareer[] = Array.from({ length: 4384 }, (_, index) => ({
      id: String(index), slug: index % 2 ? `grado-${index}` : null,
      name: `Grado ${index}`, branch: index % 2 ? 'ciencias' : 'artes_humanidades',
      cut_off_score: index % 3 ? 12.125 : null, cut_off_year: index % 3 ? 2026 : null,
      cut_off_score_prev: index % 4 ? 11.5 : null, cut_off_year_prev: index % 4 ? 2025 : null,
      admission_without_cutoff: index % 5 === 0, campus: index % 2 ? 'Campus norte' : null,
      modality: index % 3 ? 'presencial' : 'online',
      duration_years: index % 7 ? index % 2 ? 5.5 : 4 : null, universities: index % 11 ? { ...university } : null,
    }));
    const packed = packAdmissionCatalogue(careers);
    expect(unpackAdmissionCatalogue(packed)).toEqual(careers);
    expect(packed.universities).toHaveLength(1);
    expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(careers).length * 0.4);
  });
  it('keeps unknown access distinct from verified access and does not lose a zero or an empty catalogue', () => {
    const [career] = unpackAdmissionCatalogue(packAdmissionCatalogue([{
      id: 'zero', slug: null, name: 'Example', branch: 'ciencias', cut_off_score: 0,
      cut_off_year: null, campus: null, duration_years: null, universities: university,
    }]));
    expect(career.cut_off_score).toBe(0);
    expect(career.admission_without_cutoff).toBe(false);
    expect(career.cut_off_score_prev).toBeNull();
    expect(career.cut_off_year_prev).toBeNull();
    expect(unpackAdmissionCatalogue(packAdmissionCatalogue([]))).toEqual([]);
  });
  it('reads catalogues packed before the previous-course columns existed', () => {
    const packed = packAdmissionCatalogue([{ id: 'old', slug: null, name: 'Old', branch: 'ciencias',
      cut_off_score: 10, cut_off_year: 2026, campus: null, duration_years: null, universities: null }]);
    packed.rows = packed.rows.map(row => row.slice(0, 11) as typeof row);
    const [career] = unpackAdmissionCatalogue(packed);
    expect(career).toMatchObject({ cut_off_score: 10, cut_off_score_prev: null, cut_off_year_prev: null });
  });
});

describe('university navigation', () => {
  const catalogue = Array.from({ length: 96 }, (_, index) => ({
    id: index, name: `Universidad ${index === 95 ? 'de Alcalá' : index}`,
    type: index % 2 ? 'privada' : 'publica', city: index % 2 ? 'Madrid' : 'Alicante',
    comunidad_autonoma: index % 2 ? 'Madrid' : 'Comunidad Valenciana',
  }));
  it('every university appears exactly once across pages', () => {
    const found = [1, 2, 3, 4].flatMap(page => universityListing(catalogue, { pagina: String(page) }).visible);
    expect(found).toEqual(catalogue);
    expect(new Set(found.map(uni => uni.id)).size).toBe(96);
  });
  it('searches the whole catalogue, handles accents and computes counts before pagination', () => {
    const result = universityListing(catalogue, { q: '  alcala  ' });
    expect(result.visible.map(uni => uni.id)).toEqual([95]);
    const publicas = universityListing(catalogue, { tipo: 'publica', pagina: '2' });
    expect(publicas.filtered).toHaveLength(48);
    expect(publicas.visible).toHaveLength(24);
    expect(publicas.visible.every(uni => uni.type === 'publica')).toBe(true);
  });
  it('normalizes malformed/out-of-range pages and preserves all filters in navigation links', () => {
    for (const pagina of ['NaN', '-1', '2junk', '1.5', '9007199254740993']) {
      expect(universityListing(catalogue, { pagina }).page).toBe(1);
    }
    expect(universityListing(catalogue, { pagina: '999' }).page).toBe(4);
    expect(universityListing(catalogue, { q: 'no existe', pagina: '4' }).visible).toEqual([]);
    const params = { q: 'Alcalá & Madrid', comunidad: 'Madrid', ciudad: 'Madrid', tipo: 'publica' };
    const link = new URL(universityPageHref(params, 2), 'https://franky.es');
    for (const [key, value] of Object.entries(params)) expect(link.searchParams.get(key)).toBe(value);
    expect(link.searchParams.get('pagina')).toBe('2');
    expect(universityPageHref({}, 1)).toBe('/universidades');
    expect(universityParams({ q: ['Alicante', 'Madrid'], pagina: ['2'] })).toMatchObject({ q: 'Alicante', pagina: '2' });
  });
});
