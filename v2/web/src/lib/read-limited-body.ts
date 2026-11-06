/** Enforce the byte limit while consuming the stream, including chunked bodies. */
export async function readLimitedBody(source: { body: ReadableStream<Uint8Array> | null }, maxBytes: number): Promise<string> {
  if (!source.body) return '';
  const reader = source.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export class BodyTooLargeError extends Error {
  constructor() { super('Body exceeds limit'); this.name = 'BodyTooLargeError'; }
}
