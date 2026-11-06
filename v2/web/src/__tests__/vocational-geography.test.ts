import { describe, expect, it } from 'vitest';
import { createEmptyProfile, type CareerProfile } from '@/app/test-vocacional/types';
import { matchCities } from '@/app/test-vocacional/lib/city-profiles';
import { careerCommunity, normalizeCommunity, isDistanceOffer } from '@/app/test-vocacional/lib/geography';
import { buildCareerProfile } from '@/app/test-vocacional/lib/career-profiles';
import { computeAllMatches, getTopMatches } from '@/app/test-vocacional/lib/matching-engine';
import { justifyUniversity } from '@/app/test-vocacional/lib/justifications';

describe('geographic recommendations respect constraints and score limits', () => {
  it('keeps the city affinity within the result API bounds even with a local bonus', () => {
    const profile = createEmptyProfile();
    profile.estilo_vida.urbano = 10;
    profile.estilo_vida.social = 10;
    profile.pragmatico.presupuesto = 3;
    profile.geografico = { comunidad_actual: 'cataluna', movilidad: 2 };
    profile.tags = { clima_calido: 4, playa_importante: 4, ciudad_internacional: 4 };
    const cities = matchCities(profile);
    expect(cities[0].city.name).toBe('Barcelona');
    for (const city of cities) expect(city.score).toBeLessThanOrEqual(100);
  });
  it('does not silently replace a local-only search with cities elsewhere', () => {
    const profile = createEmptyProfile();
    profile.geografico = { comunidad_actual: 'ceuta', movilidad: 1 };
    expect(matchCities(profile)).toEqual([]);
  });
  it.each([['Comunidad de Madrid', 'madrid'], ['Principado de Asturias', 'asturias'], ['Illes Balears', 'baleares'], ['Castilla y León', 'castilla_leon'], ['Comunitat Valenciana', 'comunidad_valenciana']])('recognises the catalogue name %s', (input, expected) => {
    expect(normalizeCommunity(input)).toBe(expected);
  });
  it('uses the campus locality before the university headquarters region', () => {
    expect(careerCommunity('Guadalajara', 'Comunidad de Madrid')).toBe('castilla_la_mancha');
    expect(careerCommunity('Guipúzcoa', 'Navarra')).toBe('pais_vasco');
    expect(careerCommunity('Facultad de Ciencias', 'Comunidad Valenciana')).toBe('comunidad_valenciana');
    expect(careerCommunity('Sin localizar', null)).toBeNull();
  });
  it.each(['Semipresencial', 'presencial', 'Online y presencial', '', null])('does not promise remote study for %s', modality => {
    expect(isDistanceOffer(modality)).toBe(false);
  });
  it('filters by location before picking a university for a repeated degree, preserving remote options and the public constraint', () => {
    const profile = createEmptyProfile();
    profile.geografico = { comunidad_actual: 'Castilla-La Mancha', movilidad: 1 };
    profile.pragmatico.presupuesto = 1;
    const base = { ...buildCareerProfile('Grado en Enfermería', 'ciencias_salud', null, 'grado'), name: 'Grado en Enfermería', branch: 'ciencias_salud', university_id: null, university_type: 'publica', cut_off_score: null, duration_years: 4, employment_rate: null };
    const careers: CareerProfile[] = [
      { ...base, id: 'headquarters', location_region: 'madrid', modality: 'Presencial' },
      { ...base, id: 'local-campus', location_region: careerCommunity('Guadalajara', 'Comunidad de Madrid'), modality: 'Presencial' },
      { ...base, id: 'remote', name: 'Otra carrera', location_region: 'madrid', modality: 'A distancia' },
      { ...base, id: 'hybrid', name: 'Otra híbrida', location_region: 'madrid', modality: 'Semipresencial' },
      { ...base, id: 'private', name: 'Otra privada', location_region: 'castilla_la_mancha', university_type: 'privada' },
      { ...base, id: 'unknown', name: 'Sin ubicación' },
    ];
    const matches = computeAllMatches(profile, careers);
    expect(new Set(matches.map(m => m.career.id))).toEqual(new Set(['local-campus', 'remote']));
    expect(getTopMatches(matches).top.find(m => m.career.name === 'Grado en Enfermería')?.career.id).toBe('local-campus');
    profile.geografico.movilidad = 3;
    expect(computeAllMatches(profile, careers)).toHaveLength(5);
  });
  it.each([
    ['Guadalajara', 'Comunidad de Madrid', 'Castilla-La Mancha'],
    ['Guipúzcoa', 'Navarra', 'País Vasco'],
  ])('explains the actual %s campus rather than the university headquarters', (campus, headquarters, home) => {
    const profile = createEmptyProfile();
    profile.geografico = { comunidad_actual: home, movilidad: 1 };
    const career = { ...buildCareerProfile('Grado en Enfermería', 'ciencias_salud', null, 'grado'), name: 'Grado en Enfermería', branch: 'ciencias_salud', id: 'example', university_id: null, university_type: 'publica', cut_off_score: null, duration_years: 4, employment_rate: null, campus, modality: 'Presencial' };
    const explanation = justifyUniversity(profile, { id: 'example', name: 'Universidad', short_name: null, type: 'publica', city: 'Sede principal', comunidad_autonoma: headquarters }, career);
    expect(explanation).toContain(`(${campus}) está en tu comunidad o ciudad autónoma`);
    expect(explanation).not.toContain('fuera de la zona');
  });
  it('explains distance study without presenting its headquarters as a relocation', () => {
    const profile = createEmptyProfile();
    profile.geografico = { comunidad_actual: 'ceuta', movilidad: 1 };
    const career = { ...buildCareerProfile('Grado en Enfermería', 'ciencias_salud', null, 'grado'), name: 'Grado', branch: 'ciencias_salud', id: 'example', university_id: null, university_type: 'publica', cut_off_score: null, duration_years: 4, employment_rate: null, campus: 'Madrid', modality: 'Online' };
    const explanation = justifyUniversity(profile, { id: 'example', name: 'Universidad', short_name: null, type: 'publica', city: 'Madrid', comunidad_autonoma: 'Madrid' }, career);
    expect(explanation).toContain('La oferta figura a distancia');
    expect(explanation).toContain('prácticas o los exámenes');
    expect(explanation).not.toContain('fuera de la zona');
  });
  it.each([[11.734, 'por debajo del'], [11.735, 'en el mismo nivel que el'], [11.736, 'por encima del']])('compares the exact %s grade with a dated reference without promising admission', (grade, comparison) => {
    const profile = createEmptyProfile();
    profile.pragmatico.nota_estimada = grade;
    const career = { ...buildCareerProfile('Grado en Enfermería', 'ciencias_salud', null, 'grado'), name: 'Grado', branch: 'ciencias_salud', id: 'example', university_id: null, university_type: 'publica', cut_off_score: 11.735, cut_off_year: 2026, duration_years: 4, employment_rate: null };
    const explanation = justifyUniversity(profile, { id: 'example', name: 'Universidad', short_name: null, type: 'publica', city: 'Madrid', comunidad_autonoma: 'Madrid' }, career);
    expect(explanation).toContain(comparison);
    expect(explanation).toContain('corte de referencia de 2026 (11,735)');
    expect(explanation).toContain('no garantiza plaza');
    expect(explanation).not.toContain('entrarías');
  });
});
