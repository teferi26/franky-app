// Cabeceras reales mínimas de cada formato (magic bytes) para los tests de subida.
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0, 0, 0, 0]);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
export const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
export const HTML = bytesOf('<html><script>alert(document.cookie)</script></html>');

/** Uint8Array respaldado por ArrayBuffer (BlobPart válido para TypeScript). */
export function bytesOf(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(text));
}

export function uploadRequest(url: string, bytes: Uint8Array<ArrayBuffer>, name: string, type: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new File([bytes], name, { type }));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return new Request(url, { method: 'POST', body: form });
}
