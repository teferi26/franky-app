import { describe, expect, it } from 'vitest';
import { academicChanges, academicDraftFromResource, academicProposalPayload, newAcademicDraft, restoreAcademicDraft, validateAcademicDraft, type AcademicDraft } from '../../../mobile/src/lib/workspace-academic-form';

function draft(overrides: Partial<AcademicDraft> = {}): AcademicDraft {
  return { ...newAcademicDraft(), targetType: 'career', target: { id: 'career-id', title: 'Grado en Física', university_id: 'university-id', data: { name: 'Grado en Física', cut_off_score: 12, cut_off_year: 2025 } }, selected: ['description'], values: { description: 'Descripción actualizada' }, clientRequestId: 'academic-stable-retry', ...overrides };
}
describe('academic proposal mobile form', () => {
  it('requires a scoped target and at least one selected field for server drafts', () => {
    expect(validateAcademicDraft(draft({ target: null, selected: [] }), false)).toMatchObject({ target: expect.any(String), selected: expect.any(String) });
  });
  it('allows a local working draft before source and course are ready, but not submission', () => {
    expect(validateAcademicDraft(draft(), false)).toEqual({});
    expect(validateAcademicDraft(draft(), true)).toMatchObject({ sourceUrl: expect.any(String), academicYear: expect.any(String), reason: expect.any(String) });
  });
  it('never forwards organization authority, snapshots or unselected academic fields', () => {
    const value = draft({ selected: ['description', 'is_verified', 'organization_id'], values: { description: 'Texto', is_verified: 'true', organization_id: 'other', name: 'No seleccionado' } });
    expect(academicChanges(value)).toEqual({ description: 'Texto' });
    expect(academicProposalPayload(value, false)).not.toHaveProperty('academic_target_data');
    expect(academicProposalPayload(value, false)).not.toHaveProperty('p_organization_id');
    expect(academicProposalPayload(value, false).p_client_request_id).toBe('academic-stable-retry');
  });
  it('supports explicit optional clearing without erasing unselected fields', () => {
    expect(academicChanges(draft({ selected: ['campus'], values: { campus: '', description: '' } }))).toEqual({ campus: null });
    expect(validateAcademicDraft(draft({ selected: ['name'], values: { name: '' } }), false).name).toBeTruthy();
  });
  it('parses Spanish decimals with official precision and integer constraints', () => {
    const value = draft({ selected: ['duration_years', 'cut_off_score', 'cut_off_year'], values: { duration_years: '4,5', cut_off_score: '12,875', cut_off_year: '2026' }, academicYear: '2026-2027' });
    expect(validateAcademicDraft(value, false)).toEqual({});
    expect(academicChanges(value)).toEqual({ duration_years: 4.5, cut_off_score: 12.875, cut_off_year: 2026 });
    expect(validateAcademicDraft(draft({ selected: ['duration_years', 'credits'], values: { duration_years: '4.55', credits: '240.5' } }), false)).toMatchObject({ duration_years: expect.any(String), credits: expect.any(String) });
  });
  it('requires paired cutoff fields even when only a round is being updated', () => {
    expect(validateAcademicDraft(draft({ selected: ['cut_off_round'], values: { cut_off_round: 'Ordinaria' } }), false).cut_off_score).toBeTruthy();
    expect(validateAcademicDraft(draft({ selected: ['cut_off_score', 'cut_off_year'], values: { cut_off_score: '11.3', cut_off_year: '2025' }, academicYear: '2026-2027' }), true).cut_off_year).toBeTruthy();
  });
  it('allows withdrawing a cutoff only with its year retained', () => {
    expect(validateAcademicDraft(draft({ selected: ['cut_off_score', 'cut_off_year'], values: { cut_off_score: '', cut_off_year: '2026' } }), false)).toEqual({});
    expect(validateAcademicDraft(draft({ selected: ['cut_off_score', 'cut_off_year'], values: { cut_off_score: '', cut_off_year: '' } }), false).cut_off_year).toBeTruthy();
  });
  it.each(['javascript:alert(1)', 'http://example.edu', 'https://user:pass@example.edu'])('rejects an unsafe source: %s', sourceUrl => {
    expect(validateAcademicDraft(draft({ sourceUrl }), false).sourceUrl).toBeTruthy();
  });
  it('rejects nonconsecutive academic years', () => {
    expect(validateAcademicDraft(draft({ academicYear: '2026-2028' }), false).academicYear).toBeTruthy();
  });
  it('restores only documented proposed fields and server reference values', () => {
    const restored = academicDraftFromResource({ id: 'proposal', title: 'Título', data: { academic_target_type: 'career', academic_target_id: 'career-id', academic_target_title: 'Grado', academic_target_data: { campus: 'Madrid' }, proposed_changes: { campus: null, is_verified: true }, source_url: 'https://example.edu', academic_year: '2026-2027', description: 'Motivo', client_request_id: 'saved-request' } });
    expect(restored.selected).toEqual(['campus']); expect(restored.values).toEqual({ campus: '' }); expect(restored.target?.data.campus).toBe('Madrid'); expect(restored.clientRequestId).toBe('saved-request');
  });
  it('rejects malformed local drafts before they reach the editable form', () => {
    expect(restoreAcademicDraft({ ...draft(), sourceUrl: null })).toBeNull();
    expect(restoreAcademicDraft({ ...draft(), targetType: 'admin' })).toBeNull();
    expect(restoreAcademicDraft({ ...draft(), values: { description: { injected: true } } })).toBeNull();
    expect(restoreAcademicDraft(draft())?.clientRequestId).toBe('academic-stable-retry');
  });
});
