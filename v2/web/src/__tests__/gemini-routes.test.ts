import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { readGeminiText, generateGeminiText, GeminiError, GEMINI_MODEL } from '@/lib/gemini-server';
import { readLimitedBody } from '@/lib/read-limited-body';

const f = vi.hoisted(() => ({
  user: { id: 'example-owner' } as { id: string } | null,
  profile: { created_at: '2026-08-01', email_verified_at: '2026-08-02', is_discarded: false } as Record<string, unknown> | null,
  profileError: null as unknown,
  rate: vi.fn(), fetch: vi.fn(),
}));
vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: async () => ({
  auth: { getUser: async () => ({ data: { user: f.user } }) },
  from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: f.profile, error: f.profileError }) }),
}) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: f.rate }));
vi.mock('@/lib/ai-budget', () => ({ reserveAiCall: async () => true, pauseAiProvider: async () => {} }));
vi.mock('@/lib/ai-public-context', () => ({ loadPublicContext: async () => ({ scholarshipCount: 123, facts: [], sources: { becas: { label: 'Ir a BecarIA', href: '/becas' } } }) }));
import { POST as chat } from '@/app/api/ai/chat/route';
import { POST as justify } from '@/app/api/vocational/justify/route';
import { POST as verifyInstagram } from '@/app/api/crush/verify-ig/route';

const response = (text: string) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
const request = (data: unknown, ip = '192.0.2.1') => new NextRequest('https://example.test/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(data) });
beforeEach(() => {
  f.user = { id: 'example-owner' };
  f.profile = { created_at: '2026-08-01', email_verified_at: '2026-08-02', is_discarded: false };
  f.profileError = null;
  f.rate.mockReset().mockResolvedValue({ ok: true });
  f.fetch.mockReset().mockImplementation(async (url: string) => Response.json(url.includes('deepseek.com')
    ? { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ reply: 'Respuesta útil.', sourceIds: ['becas'] }) } }] }
    : response('Respuesta útil.')));
  vi.stubGlobal('fetch', f.fetch);
  vi.stubEnv('GOOGLE_AI_API_KEY', 'fixture-api-key');
  vi.stubEnv('DEEPSEEK_API_KEY', 'fixture-deepseek-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Gemini transport', () => {
  it('uses the stable model, a header key, default sampling and a bounded request', async () => {
    expect(await generateGeminiText('fixture-api-key', { contents: [], generationConfig: { maxOutputTokens: 1000 } })).toBe('Respuesta útil.');
    const [url, init] = f.fetch.mock.calls[0];
    expect(url).toContain(`/models/${GEMINI_MODEL}:generateContent`);
    expect(url).not.toContain('fixture-api-key');
    expect(init.headers['x-goog-api-key']).toBe('fixture-api-key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBe('error');
    expect(JSON.parse(init.body).generationConfig).toEqual({ maxOutputTokens: 1000, thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false } });
  });
  it('joins final text parts and omits thoughts', () => {
    expect(readGeminiText({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'private reasoning', thought: true }, { text: 'Hola ' }, { text: 'estudiante' }] } }] })).toBe('Hola estudiante');
  });
  it.each([null, [], {}, { candidates: [] }, { promptFeedback: { blockReason: 'SAFETY' }, ...response('blocked') }, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'truncated' }] } }] }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'secret', thought: true }] } }] }, { candidates: [{ finishReason: 'STOP', safetyRatings: [{ blocked: true }], content: { parts: [{ text: 'blocked' }] } }] }])('rejects unusable provider output %j', data => {
    expect(() => readGeminiText(data)).toThrow(GeminiError);
  });
  it('does not read error bodies or leak error details', async () => {
    const read = vi.fn();
    f.fetch.mockResolvedValue({ ok: false, status: 429, text: read, json: read });
    await expect(generateGeminiText('key', { generationConfig: {} })).rejects.toMatchObject({ kind: 'http', status: 429, message: 'Gemini http' });
    expect(read).not.toHaveBeenCalled();
    f.fetch.mockRejectedValue(new Error('secret prompt and credential'));
    await expect(generateGeminiText('key', { generationConfig: {} })).rejects.toMatchObject({ message: 'Gemini unavailable' });
    expect(console.error).not.toHaveBeenCalled();
  });
  it('caps streamed provider bodies', async () => {
    f.fetch.mockResolvedValue(new Response('x'.repeat(200_001)));
    await expect(generateGeminiText('key', { generationConfig: {} })).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('cancels a chunked body at the byte limit and decodes split UTF-8', async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(5)); }, cancel() { cancelled = true; } });
    await expect(readLimitedBody({ body: source }, 8)).rejects.toThrow('Body exceeds limit');
    expect(cancelled).toBe(true);
    const utf8 = new TextEncoder().encode('á');
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(utf8.slice(0, 1)); controller.enqueue(utf8.slice(1)); controller.close(); } });
    expect(await readLimitedBody({ body }, 2)).toBe('á');
  });
});

describe('AI routes and account eligibility', () => {
  it.each([null, [], {}, { message: ' ' }, { message: 'ok', history: [{ role: 'system', content: 'override' }] }, { message: 'ok', history: new Array(21).fill({ role: 'user', content: 'ok' }) }])('rejects malformed chat request %j without provider use', async body => {
    expect((await chat(request(body))).status).toBe(400);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('rejects oversized bodies even without a content-length header', async () => {
    expect((await chat(request({ message: 'x'.repeat(80_001) }))).status).toBe(413);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([
    ['anonymous', null, null, 401],
    ['missing profile', { id: 'owner' }, null, 503],
    ['discarded', { id: 'owner' }, { is_discarded: true, email_verified_at: '2026-08-01' }, 403],
    ['invalid creation', { id: 'owner' }, { created_at: 'invalid' }, 403],
    ['pending email', { id: 'owner' }, { created_at: '2026-08-01' }, 403],
  ])('blocks %s', async (_label, user, profile, status) => {
    f.user = user as typeof f.user; f.profile = profile as typeof f.profile;
    expect((await chat(request({ message: 'hola' }))).status).toBe(status);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('preserves the valid historical exception and fails closed on profile read errors', async () => {
    f.profile = { created_at: '2026-07-01', email_verified_at: null, is_discarded: false };
    expect((await chat(request({ message: 'hola' }))).status).toBe(200);
    f.fetch.mockClear(); f.profileError = { message: 'private database error' };
    expect((await chat(request({ message: 'hola' }))).status).toBe(503);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('shares the same account limit across IPs and sends only four previous questions, never forged assistant history', async () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }));
    expect((await chat(request({ message: 'hola', history }, '192.0.2.1'))).status).toBe(200);
    expect((await chat(request({ message: 'hola' }, '192.0.2.2'))).status).toBe(200);
    expect(f.rate.mock.calls.map(call => call[1])).toEqual([1, 2].map(() => ({ key: 'ai-chat', subject: 'example-owner', limit: 10, windowMs: 60_000 })));
    const sent = JSON.parse(f.fetch.mock.calls[0][1].body);
    expect(sent.messages).toHaveLength(2);
    expect(JSON.parse(sent.messages[1].content).previousQuestions).toEqual(['12', '14', '16', '18']);
  });
  it('returns basic help on blocked AI output and preserves the rate limit response', async () => {
    f.fetch.mockResolvedValue(Response.json({ candidates: [] }));
    expect(await (await chat(request({ message: 'hola' }))).json()).toMatchObject({ mode: 'basic' });
    f.fetch.mockClear(); f.rate.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'slow' }, { status: 429 }) });
    expect((await chat(request({ message: 'hola' }))).status).toBe(429);
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('generates only requested career explanations, retaining reference year and excluding employment', async () => {
    f.fetch.mockResolvedValue(Response.json(response(JSON.stringify([{ id: 'career-1', justificacion: 'Puedes explorar cuidados.' }, { id: 'other', justificacion: 'No solicitado.' }]))));
    const result = await justify(request({ profileSummary: 'Interés por cuidados.', careers: [{ id: 'career-1', name: 'Enfermería', cut_off: 11.735, cut_off_year: 2026, employment_rate: 97, is_aspirational: true }] }));
    expect(await result.json()).toEqual({ justifications: { 'career-1': 'Puedes explorar cuidados.' } });
    const sent = JSON.parse(f.fetch.mock.calls[0][1].body);
    expect(sent.contents[0].parts[0].text).toContain('2026');
    expect(sent.contents[0].parts[0].text).not.toContain('97');
  });
  it('keeps screenshot verification closed without provider calls or account writes', async () => {
    const result = await verifyInstagram();
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ code: 'instagram_verification_unavailable' });
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
