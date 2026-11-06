/**
 * Honeypot trap handler.
 *
 * Endpoints like `/api/users/dump`, `/api/admin/all`, `/api/config` don't
 * exist — but attackers probing for weaknesses try them anyway. This helper
 * records the attempt to `security_incidents` via the log_security_incident
 * RPC and then returns a plain 404 so the attacker can't tell the bait
 * apart from a normal "not found".
 *
 * Usage in any route.ts:
 *
 *   import { honeypotResponse } from "@/lib/honeypot";
 *   export const GET = (req) => honeypotResponse(req, "users-dump");
 *   export const POST = GET;
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "anonymous";
}

export async function honeypotResponse(req: Request, label: string): Promise<NextResponse> {
  // Log the trap fire. Use the server Supabase client because the route is
  // typically anonymous; the log_security_incident RPC accepts anon callers.
  try {
    const supabase = await createServerSupabase();
    const ip = clientIp(req);
    const ipHash = await sha256(ip);
    await supabase.rpc("log_security_incident", {
      p_kind: "honeypot_hit",
      p_severity: "high",
      p_ip_hash: ipHash,
      p_ua: req.headers.get("user-agent") ?? null,
      p_path: new URL(req.url).pathname,
      p_details: {
        label,
        method: req.method,
        referer: req.headers.get("referer") ?? null,
        accept: req.headers.get("accept") ?? null,
      },
    });
  } catch {
    // Never let a honeypot crash a request. Swallow.
  }

  // Tarpit slightly to slow batch scanners. 250-750ms random delay.
  await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 500)));

  // 404 looks identical to "this endpoint really doesn't exist".
  return new NextResponse("Not Found", { status: 404 });
}
