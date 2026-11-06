import 'server-only';
import { readLimitedBody } from './read-limited-body';

// Fixed host and model, verified through the provider's /models endpoint.
export const DEEPSEEK_MODEL = 'deepseek-flash';
const ENDPOINT = 'https://api.deepseek.com/chat/completions';
export type DeepSeekMessage = { role: 'system' | 'user'; content: string };
export class DeepSeekError extends Error {
  constructor(public readonly status?: number) { super('Assistant unavailable'); }
}

export async function generateDeepSeekReply(apiKey: string, messages: DeepSeekMessage[]): Promise<unknown> {
  try {
    if (Buffer.byteLength(JSON.stringify(messages), 'utf8') > 60_000) throw new DeepSeekError();
    const response = await fetch(ENDPOINT, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: DEEPSEEK_MODEL, messages, stream: false,
        thinking: { type: 'disabled' }, max_tokens: 900, response_format: { type: 'json_object' } }),
    });
    // Provider errors may echo submitted text. Never read, return or log them.
    if (!response.ok) throw new DeepSeekError(response.status);
    const data = JSON.parse(await readLimitedBody(response, 64_000));
    const choice = data?.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string'
      || !choice.message.content.trim() || choice.message.content.length > 6000) throw new DeepSeekError();
    // Ignore reasoning_content, tool calls, provider metadata and usage entirely.
    return JSON.parse(choice.message.content);
  } catch (error) {
    throw error instanceof DeepSeekError ? error : new DeepSeekError();
  }
}
