import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { createEmptyProfile } from '@/app/test-vocacional/types';
import { REQUIRED_PRACTICAL_QUESTIONS } from '@/app/test-vocacional/lib/quiz-flow';

const f = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111' },
  insert: vi.fn(), requests: [] as Record<string, unknown>[],
  university: { id: '22222222-2222-4222-8222-222222222222', name: 'Universidad pública de ejemplo con un nombre institucional muy largo', short_name: null, city: 'Alcalá de Henares', comunidad_autonoma: 'Madrid', type: 'publica', slug: 'ejemplo' },
}));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: f.user } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  from(table: string) { return { select() { return this; }, order() { return this; }, range() { return this; }, abortSignal: async () => ({ error: null, data: table === 'universities' ? [f.university] : [{ id: '33333333-3333-4333-8333-333333333333', name: 'Grado en Enfermería', branch: 'ciencias_salud', cut_off_score: 11.735, cut_off_year: 2026, campus: 'Guadalajara', modality: 'Presencial', duration_years: 4, employment_rate: 99, riasec_scores: null, degree_type: 'grado', universities: f.university }] }) }; },
}) }));
vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: async () => ({
  auth: { getUser: async () => ({ data: { user: f.user } }) },
  from: () => ({ insert: f.insert }),
}) }));
import ResultsSummary from '@/app/test-vocacional/components/ResultsSummary';
import { POST } from '@/app/api/vocational/save/route';

beforeEach(() => {
  sessionStorage.clear(); f.requests = [];
  f.insert.mockReset().mockReturnValue({ select: () => ({ single: async () => ({ error: null, data: { id: '44444444-4444-4444-8444-444444444444' } }) }) });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/vocational/justify') return new Response('{}', { status: 503 });
    if (url !== '/api/vocational/save') throw new Error(`Unexpected URL ${url}`);
    f.requests.push(JSON.parse(String(init.body)));
    return POST(new NextRequest('https://example.test/api/vocational/save', { ...init, signal: init.signal ?? undefined }));
  }));
});

describe('completed questionnaire to saved result', () => {
  it('saves the real client payload through the real API and retains campus and Big Five, with no university short name', async () => {
    const profile = createEmptyProfile();
    profile.riasec.S = 10; profile.riasec.I = 8; profile.aptitudes.interpersonal = 8;
    profile.pragmatico = { nota_estimada: 12.135, presupuesto: 1, duracion_max: 6 };
    profile.geografico = { comunidad_actual: 'castilla_la_mancha', movilidad: 1 };
    render(<ResultsSummary owner={f.user.id} profile={profile} answeredIds={[...REQUIRED_PRACTICAL_QUESTIONS]} bigFiveScores={{ O: 68, C: 71, E: 54, A: 75, N: 29 }} onRestart={() => {}} />);
    await screen.findByRole('link', { name: 'Ver mi resultado completo' });
    expect(f.requests).toHaveLength(1);
    const stored = f.insert.mock.calls[0][0];
    expect(stored.big_five).toEqual({ O: 68, C: 71, E: 54, A: 75, N: 29 });
    expect(stored.top_careers[0]).toMatchObject({ campus: 'Guadalajara', cut_off: 11.735, cut_off_year: 2026 });
    expect(stored.top_universities[0].campus).toBe('Guadalajara');
    expect(screen.getByRole('heading', { name: 'Tu resumen de personalidad' })).toBeInTheDocument();
    const aptitude = screen.getByRole('heading', { name: 'Aptitudes que has señalado' }).parentElement!;
    expect(within(aptitude).queryByText('Lógico-Matemática')).toBeNull();
    expect(within(aptitude).queryByText('0%')).toBeNull();
    expect(document.body.textContent).not.toContain('apuesta segura');
  });
});
