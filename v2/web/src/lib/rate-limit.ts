import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Distributed rate-limit with graceful in-memory fallback.
 *
 * - If `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, we use
 *   Upstash sliding-window counters → globally consistent across every
 *   Vercel serverless instance.
 * - If the env vars are missing (local dev, or Upstash outage), we fall
 *   back to a per-instance in-memory token bucket so the site keeps working
 *   without losing all protection. The fallback is logged once.
 *
 * Public API is unchanged from the original implementation:
 *   const rl = await rateLimit(req, { key: "ai-chat", limit: 10, windowMs: 60_000 });
 *   if (!rl.ok) return rl.response;
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const upstashAvailable = Boolean(REDIS_URL && REDIS_TOKEN);

let redis: Redis | null = null;
if (upstashAvailable) {
  redis = new Redis({ url: REDIS_URL!, token: REDIS_TOKEN! });
}

// Cache Ratelimit instances by (limit, windowMs) so we don't recreate one
// per request. Keys are stable strings.
const ratelimitCache = new Map<string, Ratelimit>();

function getRatelimit(limit: number, windowMs: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${limit}@${windowMs}`;
  let rl = ratelimitCache.get(key);
  if (!rl) {
    const window = `${Math.max(1, Math.floor(windowMs / 1000))} s` as `${number} s`;
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      analytics: false,
      prefix: "franky:rl",
    });
    ratelimitCache.set(key, rl);
  }
  return rl;
}

// ─── In-memory fallback ────────────────────────────────────────────────────
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let fallbackWarned = false;

function fallbackRateLimit(
  id: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const existing = buckets.get(id);

  if (!existing || existing.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      let pruned = 0;
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) {
          buckets.delete(k);
          if (++pruned >= 100) break;
        }
      }
    }
    return { ok: true };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count++;
  return { ok: true };
}

// Resuelve la IP del cliente para usarla SOLO como clave de límite.
// Preferimos las cabeceras que inyecta la plataforma (Vercel rellena
// `x-real-ip` con la IP real del cliente, no falsificable). El primer valor
// de `x-forwarded-for` lo controla el cliente fuera de Vercel, así que lo
// dejamos como último recurso. La IP es dato personal y aquí solo necesitamos
// una clave estable y única, así que devolvemos un hash en lugar de la IP en
// claro (evita guardar PII en Upstash o en los buckets en memoria).
function clientIp(req: NextRequest | Request): string {
  const headers = req.headers;
  const real = headers.get("x-real-ip");
  if (real) return hashIp(real.trim());
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return hashIp(fwd.split(",")[0].trim());
  return "anonymous";
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function rateLimitedResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    {
      error: "rate_limited",
      retryAfter,
      message: "Demasiadas peticiones. Inténtalo en unos segundos.",
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * Rate-limit a request. Returns immediately for permitted requests; returns a
 * 429 NextResponse for blocked ones (caller should `return rl.response`).
 *
 * Note: this is now `async` because the Upstash check is a network round-trip.
 * If you have existing callers using `rateLimit(...)` without `await`, fix them.
 */
export async function rateLimit(
  req: NextRequest | Request,
  opts: {
    key: string;
    limit: number;
    windowMs: number;
    /**
     * Identidad adicional a la IP (normalmente el email o el user id).
     *
     * Limitar SOLO por IP deja pasar el credential stuffing distribuido: mil
     * IPs probando la misma cuenta nunca superan el umbral de ninguna IP. Con
     * `subject` la cuenta atacada tiene su propio contador, independientemente
     * de desde dónde vengan los intentos.
     *
     * Se guarda su hash, nunca el valor: en Upstash no debe acabar una lista
     * de emails de usuarios.
     */
    subject?: string | null;
  }
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const id = opts.subject
    ? `${opts.key}:subject:${hashIp(opts.subject.trim().toLowerCase())}`
    : `${opts.key}:${clientIp(req)}`;

  const rl = getRatelimit(opts.limit, opts.windowMs);
  if (rl) {
    try {
      const { success, reset } = await rl.limit(id);
      if (success) return { ok: true };
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      return { ok: false, response: rateLimitedResponse(retryAfter) };
    } catch (e) {
      // Upstash outage → fail open to fallback rather than 500 every request.
      console.warn("[rate-limit] Upstash error, using in-memory fallback:", e);
    }
  } else if (!fallbackWarned) {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL not set — using in-memory fallback (per-instance only)."
    );
    fallbackWarned = true;
  }

  const result = fallbackRateLimit(id, opts.limit, opts.windowMs);
  if (result.ok) return { ok: true };
  return { ok: false, response: rateLimitedResponse(result.retryAfter) };
}
