import { describe, expect, it, vi } from 'vitest';
import { validateWorkspaceDraft, workspaceDraftPayload, workspaceFormFields, type WorkspaceDraft } from '../../../mobile/src/lib/workspace-form';
import { hasWorkspacePermission, primaryResource, secondaryResource } from '../../../mobile/src/lib/workspace-model';
import type { Workspace } from '../../../shared/workspaces';

function draft(values: Record<string, string> = {}): WorkspaceDraft { return { values, images: [], clientRequestId: 'stable-retry-key' }; }

describe('professional native form contracts', () => {
  it('allows incomplete drafts and requires publish-ready housing fields', () => {
    const data = draft({ title: 'Piso en el centro' });
    expect(validateWorkspaceDraft('housing', data, false)).toEqual({});
    expect(validateWorkspaceDraft('housing', data, true)).toMatchObject({ city: expect.any(String), price_monthly: expect.any(String) });
  });
  it('accepts Spanish decimal prices without converting to the wrong amount', () => {
    const payload = workspaceDraftPayload('housing', draft({ title: 'Piso luminoso', city: 'Alicante', price_monthly: '750,50', bedrooms: '3' }));
    expect(payload.price_monthly).toBe(750.5);
    expect(payload.bedrooms).toBe(3);
    expect(payload.client_request_id).toBe('stable-retry-key');
  });
  it('converts tickets to integer cents and preserves a free event', () => {
    expect(workspaceDraftPayload('event', draft({ price_euros: '19,99' })).price_cents).toBe(1999);
    expect(workspaceDraftPayload('event', draft({ price_euros: '0' })).price_cents).toBe(0);
    expect(workspaceDraftPayload('event', draft({ price_euros: '19,99' }))).not.toHaveProperty('price_euros');
  });
  it('allows audience drafts but requires their selected source before publication', () => {
    const input = draft({ title: 'Evento', audience: 'member' });
    expect(validateWorkspaceDraft('event', input, false)).toEqual({});
    expect(validateWorkspaceDraft('event', input, true).community_resource_id).toBeTruthy();
    expect(validateWorkspaceDraft('event', draft({ title: 'Evento', audience: 'verified_university' }), true).audience_university_id).toBeTruthy();
    expect(validateWorkspaceDraft('event', draft({ title: 'Evento', audience: 'admin' }), false).audience).toBeTruthy();
    expect(validateWorkspaceDraft('event', draft({ title: 'Evento', audience: 'member', community_resource_id: 'forged' }), false).community_resource_id).toBeTruthy();
  });
  it('keeps university audience selection separate from institutional campus authority', () => {
    const id = '10000000-0000-4000-8000-000000000001';
    const input = draft({ audience: 'verified_university', audience_university_id: id, community_resource_id: 'discarded', university_verified: 'true' });
    expect(workspaceDraftPayload('event', input)).toMatchObject({ audience: 'verified_university', audience_university_id: id });
    expect(workspaceDraftPayload('event', input)).not.toHaveProperty('campus_id');
    expect(workspaceDraftPayload('event', input)).not.toHaveProperty('community_resource_id');
    expect(workspaceDraftPayload('event', input)).not.toHaveProperty('university_verified');
    expect(workspaceDraftPayload('event', draft({ audience: 'public', audience_university_id: id }))).not.toHaveProperty('audience_university_id');
  });
  it.each(['-1', 'Infinity', 'NaN', '1e3', '1,000,20', '1.234'])('rejects ambiguous or invalid money: %s', value => {
    expect(validateWorkspaceDraft('housing', draft({ title: 'Casa', price_monthly: value }), false).price_monthly).toBeTruthy();
  });
  it('validates event ordering and integer capacity before sending', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-22T00:00:00Z').getTime());
    const data = draft({ title: 'Concierto', city: 'Madrid', starts_at: '2026-10-10T18:00:00Z', ends_at: '2026-10-10T17:00:00Z', capacity: '1.5' });
    expect(validateWorkspaceDraft('event', data, true)).toMatchObject({ ends_at: expect.any(String), capacity: expect.any(String) });
    vi.restoreAllMocks();
  });
  it('never forwards forged organizational authority fields', () => {
    const payload = workspaceDraftPayload('housing', draft({ title: 'Piso', is_verified: 'true', organization_id: 'another', owner_id: 'another', role: 'admin' }));
    expect(payload).not.toHaveProperty('is_verified'); expect(payload).not.toHaveProperty('organization_id'); expect(payload).not.toHaveProperty('owner_id'); expect(payload).not.toHaveProperty('role');
  });
  it('does not accept credential-bearing or executable academic source links', () => {
    for (const source_url of ['javascript:alert(1)', 'http://example.org', 'https://user:pass@example.org']) expect(validateWorkspaceDraft('academic', draft({ title: 'Carrera', source_url }), false).source_url).toBeTruthy();
  });
  it('uses exact server capabilities rather than owner role inference', () => {
    const workspace = { status: 'active', role: 'owner', permissions: ['resource.read'] } as Workspace;
    expect(hasWorkspacePermission(workspace, 'content.manage')).toBe(false);
    expect(hasWorkspacePermission({ ...workspace, status: 'suspended', permissions: ['content.manage'] }, 'content.manage')).toBe(false);
  });
  it('keeps professional routes distinct for each audience', () => {
    expect(['housing', 'community', 'leisure', 'university'].map(kind => primaryResource(kind as Workspace['kind']))).toEqual(['housing', 'event', 'venue', 'academic']);
    expect(secondaryResource('housing')).toBe('visit'); expect(secondaryResource('university')).toBe('event');
  });
  it('requires city and meaningful body before publishing local community or leisure posts', () => {
    const input = draft({ title: 'Una actividad', body: 'Hi' });
    expect(validateWorkspaceDraft('post', input, true, 'leisure')).toMatchObject({ city: expect.any(String), body: expect.any(String) });
    expect(validateWorkspaceDraft('post', draft({ title: 'Una actividad', body: 'Plan del fin de semana', city: 'Alicante', minimum_age: '18' }), true, 'community')).toEqual({});
    expect(validateWorkspaceDraft('post', draft({ title: 'Una actividad', body: 'a'.repeat(4001), city: 'Alicante', minimum_age: '16' }), true, 'leisure')).toMatchObject({ body: expect.any(String), minimum_age: expect.any(String) });
  });
  it('keeps institutional FOMO free of city and age targeting fields', () => {
    const input = draft({ title: 'Aviso de matrícula', body: 'Hoy se abre la matrícula', city: 'Alicante', minimum_age: '18' });
    expect(workspaceFormFields('post', 'university').some(field => field.key === 'city')).toBe(false);
    expect(workspaceDraftPayload('post', input, 'university')).not.toHaveProperty('city');
    expect(workspaceDraftPayload('post', input, 'university')).not.toHaveProperty('minimum_age');
    expect(validateWorkspaceDraft('post', draft({ title: 'Aviso', body: 'Hoy se abre la matrícula' }), true, 'university')).toEqual({});
  });
  it('publishes text-only local posts with a bounded age classification', () => {
    const input = { ...draft({ title: 'Plan', body: 'Plan de tarde', city: 'Madrid', minimum_age: '18' }), images: ['private-photo.jpg'] };
    expect(workspaceDraftPayload('post', input, 'leisure')).toMatchObject({ city: 'Madrid', minimum_age: 18, images: [] });
    expect(workspaceDraftPayload('post', draft({ title: 'Plan', body: 'Plan familiar', city: 'Madrid' }), 'community').minimum_age).toBe(0);
  });
});
