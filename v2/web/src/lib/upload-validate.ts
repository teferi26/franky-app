/**
 * Magic-byte (file signature) check for upload safety.
 *
 * Why this matters: clients can lie in the `Content-Type` header and in the
 * file extension. The only honest source is the first few bytes of the file
 * itself. We accept the file ONLY if its real header matches one of the
 * allowed image formats. Anything else (executables, archives, HTML with
 * `<script>` masquerading as .jpg) is rejected.
 */

type ImageType = "jpg" | "png" | "webp" | "gif";

const SIGNATURES: Record<ImageType, number[]> = {
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [0x52, 0x49, 0x46, 0x46], // "RIFF" — additionally check WEBP at offset 8
  gif: [0x47, 0x49, 0x46, 0x38], // "GIF8"
};

function startsWith(buf: Uint8Array, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Read the first 32 bytes of a File and return its detected image type, or
 * null if it doesn't match any of the formats we accept.
 */
export async function detectImageType(file: File | Blob): Promise<ImageType | null> {
  const buf = new Uint8Array(await file.slice(0, 32).arrayBuffer());

  if (startsWith(buf, SIGNATURES.jpg)) return "jpg";
  if (startsWith(buf, SIGNATURES.png)) return "png";
  if (startsWith(buf, SIGNATURES.gif)) return "gif";
  if (
    startsWith(buf, SIGNATURES.webp) &&
    buf[8] === 0x57 && // W
    buf[9] === 0x45 && // E
    buf[10] === 0x42 && // B
    buf[11] === 0x50 // P
  ) {
    return "webp";
  }
  return null;
}

const MIME_BY_TYPE: Record<ImageType, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Full upload validation: enforces both size and real content-type.
 * Throws a string error code on rejection so callers can return a clean 400.
 */
export async function assertSafeImageUpload(
  file: File,
  opts: { maxBytes?: number; allowed?: ImageType[] } = {}
): Promise<{ type: ImageType; mime: string }> {
  const maxBytes = opts.maxBytes ?? 8 * 1024 * 1024; // 8 MB default
  const allowed = opts.allowed ?? (["jpg", "png", "webp", "gif"] as ImageType[]);

  if (!(file instanceof File)) throw "not_a_file";
  if (file.size <= 0) throw "empty_file";
  if (file.size > maxBytes) throw "file_too_large";

  const real = await detectImageType(file);
  if (!real) throw "unsupported_image_format";
  if (!allowed.includes(real)) throw "format_not_allowed";

  // Sanity check the declared MIME aligns with reality (best-effort).
  const expectedMime = MIME_BY_TYPE[real];
  if (file.type && file.type !== expectedMime && !(real === "jpg" && file.type === "image/jpg")) {
    // Don't reject — some clients send the wrong header. Just log.
    console.warn(`[upload-validate] MIME mismatch: declared=${file.type} actual=${expectedMime}`);
  }

  return { type: real, mime: expectedMime };
}
