import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import {
  getSectorSlugFromHost,
  isSectorSubdomainEnabled,
} from "@/lib/sector-sites/routing";

export const CARD_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};
export const CARD_SITE = "https://franky.es";

/** Cookie writes stay same-origin; native clients authenticate using a bearer token. */
export function cardOriginAllowed(req: NextRequest): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  // Cada sector acepta solo su propio origen HTTPS y su Host real. El dominio
  // hermano y las cabeceras de proxy no amplían este permiso.
  const host = req.headers.get("host");
  const slug = getSectorSlugFromHost(host);
  if (slug) {
    if (!isSectorSubdomainEnabled(slug)) return false;
    const sectorHost = `${slug}.franky.es`;
    const sectorOrigin = `https://${sectorHost}`;
    return (
      host === sectorHost &&
      origin === sectorOrigin &&
      new URL(req.url).origin === sectorOrigin
    );
  }

  const allowed = new Set([CARD_SITE, "https://www.franky.es"]);
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }
  return allowed.has(origin);
}

export async function cardRequest(req: NextRequest, key: string, limit = 30) {
  if (!cardOriginAllowed(req))
    return {
      response: NextResponse.json(
        { error: "Origen no permitido." },
        { status: 403, headers: CARD_PRIVATE_HEADERS },
      ),
    } as const;
  const client = await createRequestSupabase(req);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    return {
      response: NextResponse.json(
        { error: "Inicia sesión para continuar." },
        { status: 401, headers: CARD_PRIVATE_HEADERS },
      ),
    } as const;
  const { data: usable, error: unusable } = await client.rpc(
    "account_session_usable",
  );
  if (unusable || usable !== true)
    return {
      response: NextResponse.json(
        { error: "La cuenta no está disponible." },
        { status: 403, headers: CARD_PRIVATE_HEADERS },
      ),
    } as const;
  const rate = await rateLimit(req, {
    key: `franky-card:${key}`,
    subject: user.id,
    limit,
    windowMs: 60_000,
  });
  if (!rate.ok) return { response: rate.response } as const;
  return { client, user } as const;
}

export function cardFailure(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: CARD_PRIVATE_HEADERS },
  );
}
