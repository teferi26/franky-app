import 'server-only';
import { unstable_cache } from 'next/cache';
import { createPublicSupabase } from './supabase-server';
import { SCHOLARSHIP_ALIASES } from './scholarship-aliases';
import { plazoInfo } from './becas';
import { normalizeQuestion, PUBLIC_SERVICES, PUBLIC_EXTRA_ACTIONS, relevantServices, type AssistantAction } from './ai-public';

type IndexRow = { id: string; name: string; provider: string | null; comunidad_autonoma: string | null; target_audience: string[] | null; coverage: string[] | null };
export type PublicContext = { scholarshipCount: number | null; facts: unknown[]; sources: Record<string, AssistantAction>; scholarshipId?: string };
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const STOP = new Set('para como donde cuando quien quiero necesito saber puedo tengo sobre esta este estas estos beca becas ayuda ayudas una unos unas los las del que con por sus mis son hay requisitos documentos documento plazo plazos abierta abierto disponibles disponible solicitar solicitud'.split(' '));
export function rankScholarships(rows: IndexRow[], question: string) {
  const words = [...new Set(normalizeQuestion(question).match(/[a-z0-9]{3,}/g) ?? [])].filter(w => !STOP.has(w)).slice(0, 25);
  return rows.map(row => {
    const title = new Set(normalizeQuestion(`${row.name} ${row.provider ?? ''}`).match(/[a-z0-9]+/g) ?? []);
    const rest = new Set(normalizeQuestion(`${row.comunidad_autonoma ?? ''} ${row.target_audience?.join(' ') ?? ''} ${row.coverage?.join(' ') ?? ''}`).match(/[a-z0-9]+/g) ?? []);
    // Whole words: "general" must not retrieve every "Generalitat" scholarship.
    let score = words.reduce((sum, word) => sum + (title.has(word) ? 4 : rest.has(word) ? 1 : 0), 0);
    // MEC is the common name for the Ministry's general scholarships even
    // where the current public title spells out "Ministerio" instead.
    if (words.includes('mec') && title.has('ministerio') && title.has('general')) score += 16;
    return { row, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name)).slice(0, 3).map(item => item.row.id);
}

const getScholarshipIndex = unstable_cache(async () => {
  const db = createPublicSupabase();
  const rows: IndexRow[] = [];
  const signal = AbortSignal.timeout(4000);
  for (let offset = 0; offset < 10_000; offset += 500) {
    const result = await db.from('scholarships')
      .select('id,name,provider,comunidad_autonoma,target_audience,coverage')
      .eq('is_active', true).order('id').range(offset, offset + 499).abortSignal(signal);
    if (result.error) throw new Error('Public catalogue unavailable');
    rows.push(...(result.data as IndexRow[] ?? []).filter(row => ID.test(row.id) && !SCHOLARSHIP_ALIASES[row.id]));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
  throw new Error('Public catalogue exceeds bound');
}, ['ai-public-scholarships-v1'], { revalidate: 900 });

// Only fields displayed on /becas/[id]. No select(*), session, private storage,
// filesystem, remote browsing or model tools. Explicit projection below too.
export const PUBLIC_SCHOLARSHIP_FIELDS = 'id,name,provider,type,description,amount_min,amount_max,opens_at,closes_at,deadline,deadline_note,target_audience,coverage,comunidad_autonoma,convocatoria,requirements,application_process,documents_required,url_verified_at';
function boundedValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.slice(0, 1500);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (depth > 3) return null;
  if (Array.isArray(value)) return value.slice(0, 18).map(v => boundedValue(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 12).map(([key, v]) => [key.slice(0, 60), boundedValue(v, depth + 1)]));
  return null;
}

export async function loadPublicContext(message: string, previousQuestion = '', scholarshipId?: string): Promise<PublicContext> {
  const matched = relevantServices(message, previousQuestion);
  const relevant = new Set(matched.map(service => service.id));
  if (scholarshipId) relevant.add('becas');
  if (matched.some(service => ['roomies', 'pisos', 'eventos', 'estudio'].includes(service.id))) relevant.add('app');
  const services = relevant.size ? PUBLIC_SERVICES.filter(service => relevant.has(service.id)) : PUBLIC_SERVICES;
  const sources: PublicContext['sources'] = Object.fromEntries(services.map(({ id, label, href }) => [id, { label, href }]));
  PUBLIC_EXTRA_ACTIONS.forEach((action, i) => { sources[`help-${i}`] = action; });
  const facts: unknown[] = services.map(({ id, description }) => ({ sourceId: id, information: description }));
  const context: PublicContext = { scholarshipCount: null, facts, sources };
  if (!scholarshipId && !relevantServices(message, previousQuestion).some(service => service.id === 'becas')) return context;
  try {
    const index = await getScholarshipIndex();
    context.scholarshipCount = index.length;
    const canonicalId = scholarshipId ? SCHOLARSHIP_ALIASES[scholarshipId] ?? scholarshipId : undefined;
    const ids = canonicalId ? index.some(row => row.id === canonicalId) ? [canonicalId] : []
      : rankScholarships(index, `${message} ${previousQuestion}`);
    if (!ids.length) return context;
    const { data, error } = await createPublicSupabase().from('scholarships').select(PUBLIC_SCHOLARSHIP_FIELDS)
      .eq('is_active', true).in('id', ids).limit(3).abortSignal(AbortSignal.timeout(2500));
    if (error) return context;
    for (const row of data ?? []) {
      if (!ID.test(row.id)) continue;
      const sourceId = `scholarship-${row.id}`;
      sources[sourceId] = { label: `Ver ${String(row.name).slice(0, 140)}`, href: `/becas/${row.id}` };
      const detail: Record<string, unknown> = {};
      for (const field of PUBLIC_SCHOLARSHIP_FIELDS.split(',')) detail[field] = boundedValue(row[field as keyof typeof row]);
      if (JSON.stringify(detail).length > 9000) {
        for (const field of ['description', 'requirements', 'application_process', 'documents_required']) {
          if (JSON.stringify(detail[field]).length > 1700) detail[field] = 'Información extensa: consultar la ficha pública completa.';
        }
      }
      facts.push({ sourceId, detail, deadlineState: plazoInfo(row.deadline, Date.now(), row).estado,
        caution: 'Datos publicados en el catálogo, no verificados en directo. estimada significa PLAZO CERRADO, nunca un nuevo plazo estimado. No garantizan elegibilidad ni concesión. Comprueba las bases y su curso en la ficha.' });
      if (canonicalId === row.id) context.scholarshipId = row.id;
    }
  } catch { /* Navigation remains available without the catalogue. */ }
  return context;
}
