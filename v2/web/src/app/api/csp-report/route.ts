import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * CSP violation collector.
 *
 * Browsers POST here whenever the strict CSP blocks something — useful for:
 * - Spotting real XSS attempts (someone injected a payload that the policy
 *   actually stopped).
 * - Catching legitimate scripts we forgot to allowlist (false positives).
 *
 * Body shape (CSP Reporting Level 1):
 *   { "csp-report": { document-uri, violated-directive, blocked-uri, source-file, ... } }
 *
 * We accept anonymous POSTs (browsers send no cookies for CSP reports) but
 * cap the body size and apply a per-IP rate-limit to prevent log flooding.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap CSP reports per IP to 60/minute. Browsers can legitimately fire bursts
// during page-load if a misconfig blocks dozens of resources, but more than
// that is abuse / log-flood.
const MAX_REPORTS_PER_MIN = 60;
const bucket = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "anonymous";
}

export async function POST(req: Request) {
  // Rate-limit per IP (in-memory; per-instance is fine here, the risk is
  // local log-flooding only).
  const ip = clientIp(req);
  const now = Date.now();
  const entry = bucket.get(ip);
  if (entry && entry.resetAt > now) {
    if (entry.count >= MAX_REPORTS_PER_MIN) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
    entry.count++;
  } else {
    bucket.set(ip, { count: 1, resetAt: now + 60_000 });
  }

  // Reject oversized bodies (real reports are < 2KB).
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 10_000) {
    return NextResponse.json({ ok: false, error: "body_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Browsers send either { "csp-report": {...} } (Level 1) or a Reports API
  // body. Normalise both to a single object.
  const raw = (body as Record<string, unknown>)?.["csp-report"] ?? body;

  // Validar la forma antes de guardar: un atacante podria enviar JSON
  // arbitrario para envenenar el panel de violaciones. Aceptamos solo objetos
  // planos que tengan al menos una clave conocida de un informe CSP, y nos
  // quedamos unicamente con esas claves (descartamos cualquier campo extra).
  const report = sanitizeReport(raw);
  if (!report) {
    return NextResponse.json({ ok: false, error: "invalid_report" }, { status: 400 });
  }

  try {
    const supabase = await createServerSupabase();
    // Best-effort insert; if the table doesn't exist yet (migration 043 not
    // applied) we just drop the report rather than 500.
    await supabase.from("csp_violations").insert({
      ip_hash: ip ? await sha256(ip) : null,
      ua: req.headers.get("user-agent") ?? null,
      report,
    });
  } catch {
    // Swallow — we never want a CSP report to crash the API.
  }

  // 204 No Content: must not carry a body (NextResponse.json would write one
  // and the Response constructor rejects a body with status 204).
  return new NextResponse(null, { status: 204 });
}

// Claves conocidas de un informe CSP (Reporting Level 1 y Reports API).
// Solo conservamos estas para evitar que entren campos arbitrarios en la BD.
const CSP_REPORT_KEYS = [
  "document-uri",
  "documentURL",
  "referrer",
  "violated-directive",
  "effective-directive",
  "effectiveDirective",
  "original-policy",
  "originalPolicy",
  "disposition",
  "blocked-uri",
  "blockedURL",
  "line-number",
  "lineNumber",
  "column-number",
  "columnNumber",
  "source-file",
  "sourceFile",
  "status-code",
  "statusCode",
  "script-sample",
  "sample",
] as const;

// Devuelve un objeto solo con las claves conocidas de un informe CSP, o null
// si el cuerpo no es un objeto plano o no contiene ninguna clave reconocible.
function sanitizeReport(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const key of CSP_REPORT_KEYS) {
    if (key in src) clean[key] = src[key];
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
