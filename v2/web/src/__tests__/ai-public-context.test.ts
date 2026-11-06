import { beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ queries: [] as { table: string; fields?: string; filters: unknown[][] }[], rows: [] as Record<string, unknown>[], details: [] as Record<string, unknown>[], fail: false }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/supabase-server', () => ({ createPublicSupabase: () => ({ from(table: string) {
  const query = { table, filters: [] as unknown[][], fields: '' }; f.queries.push(query);
  let detail = false;
  return { select(fields: string) { query.fields = fields; return this; }, eq(...args: unknown[]) { query.filters.push(args); return this; },
    order() { return this; }, range() { return this; }, in(...args: unknown[]) { detail = true; query.filters.push(args); return this; }, limit() { return this; },
    async abortSignal() { return { data: detail ? f.details : f.rows, error: f.fail ? { message: 'PRIVATE DB ERROR' } : null }; } };
} }) }));
import { loadPublicContext, rankScholarships } from '@/lib/ai-public-context';
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  f.queries = []; f.fail = false;
  f.rows = [{ id, name: 'Beca MEC', provider: 'Ministerio', comunidad_autonoma: null, target_audience: ['grado'], coverage: ['matricula'] }];
  f.details = [{ ...f.rows[0], description: 'Descripción pública', deadline: '2020-01-01', requirements: { academicos: ['Estar matriculado'] }, documents_required: ['Solicitud'], private_notes: 'SECRET', user_id: 'PRIVATE USER', api_key: 'PRIVATE KEY' }];
});
describe('public grounding', () => {
  it('uses an explicit anonymous public projection, active rows and real count', async () => {
    const context = await loadPublicContext('¿Qué pide la beca MEC?');
    expect(context.scholarshipCount).toBe(1);
    expect(f.queries.every(q => q.table === 'scholarships' && !q.fields?.includes('*') && q.filters.some(filter => filter[0] === 'is_active' && filter[1] === true))).toBe(true);
    const serialized = JSON.stringify(context); expect(serialized).toContain('Estar matriculado'); expect(serialized).toContain('PLAZO CERRADO');
    expect(serialized).not.toMatch(/SECRET|PRIVATE USER|PRIVATE KEY|private_notes|api_key/);
  });
  it('loads the selected scholarship even when the question contains no scholarship keyword', async () => {
    const context = await loadPublicContext('¿Qué documentos necesito?', '', id);
    expect(context.scholarshipId).toBe(id); expect(context.sources[`scholarship-${id}`].href).toBe(`/becas/${id}`);
  });
  it('never substitutes an inactive or nonexistent selected record', async () => {
    const context = await loadPublicContext('requisitos MEC', '', '22222222-2222-4222-8222-222222222222');
    expect(context.scholarshipId).toBeUndefined(); expect(f.queries).toHaveLength(1);
  });
  it('keeps the count unknown during database failure and exposes no errors', async () => {
    f.fail = true; const context = await loadPublicContext('becas');
    expect(context.scholarshipCount).toBeNull(); expect(JSON.stringify(context)).not.toContain('PRIVATE DB ERROR');
  });
  it('does not query user or social records for navigation', async () => {
    await loadPublicContext('Busco piso y eventos'); expect(f.queries).toHaveLength(0);
  });
  it('ranks relevant names and refuses unrelated scholarships', () => {
    expect(rankScholarships(f.rows as never[], 'MEC')).toEqual([id]);
    expect(rankScholarships(f.rows as never[], 'becas')).toEqual([]);
    expect(rankScholarships(f.rows as never[], 'beca inexistente')).toEqual([]);
    expect(rankScholarships([{ ...f.rows[0], name: 'Ayudas Generalitat', provider: 'Generalitat' }] as never[], 'beca general')).toEqual([]);
    expect(rankScholarships([
      { ...f.rows[0], id: 'unrelated', name: 'Programa General Fulbright', provider: 'Fulbright' },
      { ...f.rows[0], id: 'ministry', name: 'Beca general del Ministerio para grado y máster', provider: 'Ministerio de Educación' },
    ] as never[], 'beca general MEC')[0]).toBe('ministry');
  });
});
