import { NextResponse } from "next/server";
import { z } from "zod";
import { readLimitedBody, BodyTooLargeError } from './read-limited-body';

/**
 * Parse + validate a request body against a zod schema.
 *
 * Usage:
 *   const result = await validateBody(req, mySchema);
 *   if (result instanceof NextResponse) return result;   // already 400/413
 *   const data = result;                                  // typed!
 *
 * Why a helper:
 * - One uniform shape for validation errors ({ error: "validation_failed", message, details }).
 * - Caps body size so a malicious client can't OOM the function.
 * - Hides PII / huge fields from the error response.
 */
export async function validateBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
  opts: { maxBytes?: number; fieldLabels?: Record<string, string> } = {}
): Promise<z.infer<T> | NextResponse> {
  const maxBytes = opts.maxBytes ?? 100_000; // 100KB default

  // content-length lo pone el cliente y es omitible (chunked), asi que es solo
  // un descarte rapido: el tope real se aplica midiendo los bytes leidos.
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) {
    return NextResponse.json(
      { error: "body_too_large", maxBytes },
      { status: 413 }
    );
  }

  // El tope se aplica durante la lectura, también sin content-length.
  let raw: string;
  try {
    raw = await readLimitedBody(req, maxBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: 'body_too_large', maxBytes }, { status: 413 });
    }
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Mensaje legible (hallazgo A1): los clientes (sobre todo la app móvil)
    // enseñan `message` tal cual, así que se incluye el PRIMER problema
    // concreto en vez de dejar solo el volcado técnico de `details`. Si el
    // endpoint pasa una etiqueta para el campo (opts.fieldLabels), se
    // antepone para dar contexto cuando el texto del schema no lo trae.
    const first = parsed.error.issues[0];
    const field = String(first?.path?.[0] ?? "");
    const label = opts.fieldLabels?.[field];
    const message = first
      ? label
        ? `${label}: ${first.message}`
        : first.message
      : "Los datos enviados no son válidos";
    return NextResponse.json(
      { error: "validation_failed", message, details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  return parsed.data;
}

/**
 * Common schemas shared across endpoints. Keep these conservative:
 * the goal is to fail closed on weird input, not to handle every edge case.
 */
export const uuid = z.string().uuid();
export const safeString = (max = 500) =>
  z
    .string()
    .min(1)
    .max(max)
    // Strip control characters which never belong in user-supplied text.
    .regex(/^[^\x00-\x1F\x7F]*$/, "control_chars_not_allowed");

export const limitedArray = <T extends z.ZodTypeAny>(item: T, max = 50) =>
  z.array(item).max(max, { message: `max_${max}_items` });
