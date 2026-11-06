import { readLimitedBody } from './read-limited-body';

// Stable replacement documented at https://ai.google.dev/gemini-api/docs/deprecations
// Keep the endpoint fixed: neither callers nor client input can select a host.
export const GEMINI_MODEL = 'gemini-3.6-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class GeminiError extends Error {
  constructor(public readonly kind: 'http' | 'invalid' | 'unavailable', public readonly status?: number) {
    super(`Gemini ${kind}`);
    this.name = 'GeminiError';
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Only complete, unblocked final text is application data. Never return thoughts. */
export function readGeminiText(data: unknown): string {
  const response = record(data);
  const feedback = record(response?.promptFeedback);
  if (feedback?.blockReason) throw new GeminiError('invalid');
  const candidates = response?.candidates;
  const candidate = Array.isArray(candidates) ? record(candidates[0]) : null;
  if (candidate?.finishReason !== 'STOP') throw new GeminiError('invalid');
  if (Array.isArray(candidate.safetyRatings) && candidate.safetyRatings.some(rating => record(rating)?.blocked === true)) throw new GeminiError('invalid');
  const parts = record(candidate.content)?.parts;
  if (!Array.isArray(parts)) throw new GeminiError('invalid');
  const text = parts.flatMap(part => {
    const item = record(part);
    return item && item.thought !== true && typeof item.text === 'string' ? [item.text] : [];
  }).join('').trim();
  if (!text || text.length > 80_000) throw new GeminiError('invalid');
  return text;
}

export async function generateGeminiText(
  apiKey: string,
  payload: Record<string, unknown> & { generationConfig: Record<string, unknown> },
  timeoutMs = 20_000,
): Promise<string> {
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
      cache: 'no-store',
      body: JSON.stringify({ ...payload, generationConfig: {
        ...payload.generationConfig,
        thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
      } }),
    });
    // Error bodies can contain submitted text, images or credentials; do not read/log them.
    if (!response.ok) throw new GeminiError('http', response.status);
    return readGeminiText(JSON.parse(await readLimitedBody(response, 200_000)));
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    throw new GeminiError('unavailable');
  }
}
