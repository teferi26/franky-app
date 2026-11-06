import { describe, expect, it } from 'vitest';
import * as web from '../lib/admission-search';
import * as mobile from '../../../mobile/src/lib/admission-search';
import { packAdmissionCatalogue, unpackAdmissionCatalogue } from '../lib/admission-catalogue';

for (const [platform, api] of [['web', web], ['mobile', mobile]] as const) {
  describe(`${platform} admission search`, () => {
    const degree = { name: 'Grado en Enfermería', campus: 'Ponferrada', modality: 'presencial',
      universities: { name: 'Universidad de León', short_name: 'ULE', city: 'León' } };
    it('uses the identified campus, falling back only when the campus is missing or blank', () => {
      expect(api.admissionLocation(degree)).toBe('Ponferrada');
      expect(api.admissionLocation({ ...degree, campus: '   ' })).toBe('León');
      expect(api.admissionLocation({ name: 'Unknown' })).toBe('');
    });
    it('searches campus, acronym, degree and mode together, case/accent independently', () => {
      expect(api.matchesAdmissionSearch(degree, ' ENFERMERIA  ULE ponferrada ')).toBe(true);
      expect(api.matchesAdmissionSearch(degree, 'enfermeria online')).toBe(false);
      expect(api.matchesAdmissionSearch(degree, '   ')).toBe(true);
    });
    it('does not label an unknown mode as classroom teaching', () => {
      expect(api.admissionModeLabel(null)).toBe('');
      expect(api.admissionModeLabel('unsupported')).toBe('');
      expect(api.admissionModeLabel('online')).toBe('Online');
    });
  });
}

it('preserves known modes and accepts an older packed catalogue without inventing a mode', () => {
  const packed = packAdmissionCatalogue([{ id: 'a', name: 'Grado', slug: null, branch: 'ciencias',
    campus: 'Burgos', modality: 'online', duration_years: 4, cut_off_score: 8.404, cut_off_year: 2026, universities: null }]);
  expect(unpackAdmissionCatalogue(packed)[0].modality).toBe('online');
  // Catálogo antiguo: tupla sin modalidad ni curso anterior.
  packed.rows[0] = packed.rows[0].slice(0, 10) as typeof packed.rows[0];
  expect(unpackAdmissionCatalogue(packed)[0].modality).toBe(null);
});
