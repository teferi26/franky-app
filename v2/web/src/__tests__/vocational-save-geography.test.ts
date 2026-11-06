import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createEmptyProfile } from '@/app/test-vocacional/types';
import { matchCities } from '@/app/test-vocacional/lib/city-profiles';

const state = vi.hoisted(() => ({ insert: vi.fn(), userId: '11111111-1111-4111-8111-111111111111' as string | null }));
vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: async () => ({
  auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
  from: () => ({ insert: state.insert }),
}) }));
import { POST } from '@/app/api/vocational/save/route';

beforeEach(() => {
  state.userId = '11111111-1111-4111-8111-111111111111';
  state.insert.mockReset().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: '22222222-2222-4222-8222-222222222222' }, error: null }) }) });
});
const request = (body: unknown) => new NextRequest('https://example.test/api/vocational/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('persisting geographic recommendations', () => {
  it.each([5.5, 2.3, 4, null])('preserves an official fractional duration of %j years', async duration_years => {
    const response = await POST(request({ profile: {}, topCareers: [{ name: 'Doble grado', score: 70, duration_years }] }));
    expect(response.status).toBe(200);
    expect(state.insert.mock.calls[0][0].top_careers[0].duration_years).toBe(duration_years);
  });
  it.each([5.55, '5.5', 0, 11])('rejects malformed or unsupported saved duration %j', async duration_years => {
    expect((await POST(request({ profile: {}, topCareers: [{ name: 'Doble grado', score: 70, duration_years }] }))).status).toBe(400);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it('accepts the personality shape sent by the completed web questionnaire', async () => {
    const bigFive = { O: 68, C: 71, E: 54, A: 75, N: 29 };
    const response = await POST(request({ profile: createEmptyProfile(), bigFive }));
    expect(response.status).toBe(200);
    expect(state.insert.mock.calls[0][0].big_five).toEqual(bigFive);
  });
  it('normalises the legacy personality shape without inverting neuroticism', async () => {
    const response = await POST(request({ profile: {}, bigFive: { openness: 0, conscientiousness: 50, extraversion: 100, agreeableness: 75, neuroticism: 29 } }));
    expect(response.status).toBe(200);
    expect(state.insert.mock.calls[0][0].big_five).toEqual({ O: 0, C: 50, E: 100, A: 75, N: 29 });
  });
  it.each([{ O: 101 }, { N: -1 }, { C: '50' }, { openness: 101 }, { O: 80, openness: 20 }, { extra: 2 }])('rejects invalid or ambiguous personality %j', async bigFive => {
    expect((await POST(request({ profile: {}, bigFive }))).status).toBe(400);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it('saves the formerly 106-point city and preserves bounded offer metadata', async () => {
    const profile = createEmptyProfile();
    profile.estilo_vida.urbano = 10; profile.estilo_vida.social = 10;
    profile.pragmatico.presupuesto = 3;
    profile.geografico = { comunidad_actual: 'cataluna', movilidad: 2 };
    profile.tags = { clima_calido: 4, playa_importante: 4, ciudad_internacional: 4 };
    const cities = matchCities(profile).map(c => ({ name: c.city.name, score: c.score, comunidad: c.city.comunidad }));
    const career = { name: 'Grado de ejemplo', score: 70, campus: 'Guadalajara', modality: 'Presencial', location_region: 'castilla_la_mancha', cut_off: 11.735, cut_off_year: 2026 };
    const university = { name: 'Universidad de ejemplo', city: 'Alcalá de Henares', campus: 'Guadalajara', modality: 'Presencial', location_region: 'castilla_la_mancha', cut_off_year: 2026 };
    const response = await POST(request({ profile, topCities: cities, topCareers: [career], topUniversities: [university] }));
    expect(response.status).toBe(200);
    expect(state.insert.mock.calls[0][0].top_cities[0]).toMatchObject({ name: 'Barcelona', score: 99 });
    expect(state.insert.mock.calls[0][0].top_careers[0]).toEqual(career);
    expect(state.insert.mock.calls[0][0].top_universities[0]).toEqual(university);
    expect(state.insert.mock.calls[0][0].user_id).toBe(state.userId);
  });
  it('rejects invalid campus metadata in a university result too', async () => {
    expect((await POST(request({ profile: {}, topUniversities: [{ name: 'Universidad', campus: 'x'.repeat(201) }] }))).status).toBe(400);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it.each([{ campus: 'a'.repeat(201) }, { modality: {} }, { cut_off_year: 2026.5 }, { location_region: 3 }])('rejects invalid offer metadata %j before inserting', invalid => {
    return POST(request({ profile: {}, topCareers: [{ name: 'Grado', score: 70, ...invalid }] })).then(response => {
      expect(response.status).toBe(400);
      expect(state.insert).not.toHaveBeenCalled();
    });
  });
  it('requires a signed-in user and rejects an attempt for another account', async () => {
    expect((await POST(request({ profile: {}, expectedUserId: '33333333-3333-4333-8333-333333333333' }))).status).toBe(409);
    state.userId = null;
    expect((await POST(request({ profile: {} }))).status).toBe(401);
    expect(state.insert).not.toHaveBeenCalled();
  });
});
