// =========================================================================
// send-push-notification
// =========================================================================
// Supabase Edge Function (Deno).
//
// Envía una push notification a TODOS los devices registrados de un usuario.
// Soporta iOS (APNs HTTP/2 con JWT) y Android (FCM HTTP v1 con OAuth Google).
//
// Invocación esperada (POST):
//   {
//     "user_id":  "uuid-of-recipient",
//     "title":    "Has hecho match con Marta",
//     "body":     "Empieza la conversación antes de que se enfríe.",
//     "data": {                                 // opcional, payload custom
//       "type": "match",                        // match | message | event | ...
//       "deeplink": "franky://chat/abc"
//     },
//     "channel":  "matches"                      // opcional, Android channel
//   }
//
// Secrets requeridos en Supabase Edge (configurar con `supabase secrets set`):
//   - SUPABASE_URL                  (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY     (auto-injected)
//   - FCM_SERVICE_ACCOUNT_JSON      (todo el JSON del service account FCM)
//   - APNS_KEY_ID                   (Key ID del .p8 en Apple Developer)
//   - APNS_TEAM_ID                  (Team ID Apple)
//   - APNS_BUNDLE_ID                ("es.franky.app" o similar)
//   - APNS_PRIVATE_KEY              (contenido del .p8, incluyendo BEGIN/END)
//   - APNS_HOST                     ("api.push.apple.com" prod | "api.sandbox.push.apple.com" dev)
//
// Disparadores típicos:
//   - DB trigger en `messages` INSERT (notifica al otro participant).
//   - DB trigger en `swipe_actions` cuando hay match (notifica a ambos).
//   - Llamada manual desde otra edge function (eventos, propietarios).
//
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { create as createJWT, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface DeviceToken {
  token: string;
  platform: "ios" | "android";
}

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  channel?: string;
}

interface DispatchResult {
  platform: "ios" | "android";
  token: string;
  ok: boolean;
  error?: string;
}

// -------------------------------------------------------------------------
// Client + helpers
// -------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// -------------------------------------------------------------------------
// FCM (Android) — HTTP v1
// -------------------------------------------------------------------------

let cachedFcmAccessToken: { token: string; exp: number } | null = null;

async function getFcmAccessToken(): Promise<{ token: string; projectId: string }> {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON not configured");
  const sa = JSON.parse(raw);
  const projectId = sa.project_id;

  if (cachedFcmAccessToken && cachedFcmAccessToken.exp > Date.now()) {
    return { token: cachedFcmAccessToken.token, projectId };
  }

  // Sign JWT with the service account private key (RS256).
  const pem = sa.private_key as string;
  const key = await importRsaPrivateKey(pem);

  const now = getNumericDate(0);
  const exp = getNumericDate(60 * 55); // 55 minutes
  const jwt = await createJWT(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp,
      iat: now,
    },
    key,
  );

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    throw new Error(`FCM token exchange failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  cachedFcmAccessToken = { token: data.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return { token: data.access_token, projectId };
}

async function sendFcm(
  recipient: DeviceToken,
  payload: PushPayload,
): Promise<DispatchResult> {
  try {
    const { token, projectId } = await getFcmAccessToken();
    const msg = {
      message: {
        token: recipient.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: {
          priority: "HIGH",
          notification: {
            channel_id: payload.channel ?? "default",
            click_action: payload.data?.deeplink,
          },
        },
      },
    };
    const resp = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(msg),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      // 404 / 410 → token inválido, lo borramos.
      if (resp.status === 404 || resp.status === 410) {
        await supabase.from("device_tokens").delete().eq("token", recipient.token);
      }
      return { platform: "android", token: recipient.token, ok: false, error: text };
    }
    return { platform: "android", token: recipient.token, ok: true };
  } catch (e) {
    return { platform: "android", token: recipient.token, ok: false, error: String(e) };
  }
}

// -------------------------------------------------------------------------
// APNs (iOS) — HTTP/2 with JWT (ES256)
// -------------------------------------------------------------------------

let cachedApnsJwt: { token: string; exp: number } | null = null;

async function getApnsJwt(): Promise<string> {
  if (cachedApnsJwt && cachedApnsJwt.exp > Date.now()) return cachedApnsJwt.token;
  const keyId = Deno.env.get("APNS_KEY_ID")!;
  const teamId = Deno.env.get("APNS_TEAM_ID")!;
  const pem = Deno.env.get("APNS_PRIVATE_KEY")!;

  const key = await importP8(pem);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await createJWT(
    { alg: "ES256", kid: keyId, typ: "JWT" },
    { iss: teamId, iat: now },
    key,
  );
  cachedApnsJwt = { token: jwt, exp: Date.now() + 50 * 60 * 1000 };
  return jwt;
}

async function sendApns(
  recipient: DeviceToken,
  payload: PushPayload,
): Promise<DispatchResult> {
  try {
    const jwt = await getApnsJwt();
    const bundleId = Deno.env.get("APNS_BUNDLE_ID")!;
    const host = Deno.env.get("APNS_HOST") ?? "api.push.apple.com";

    const body = {
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: "default",
        "mutable-content": 1,
      },
      ...(payload.data ?? {}),
    };

    const resp = await fetch(`https://${host}/3/device/${recipient.token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      // 410 Unregistered → token inválido, eliminar
      if (resp.status === 410) {
        await supabase.from("device_tokens").delete().eq("token", recipient.token);
      }
      return { platform: "ios", token: recipient.token, ok: false, error: text };
    }
    return { platform: "ios", token: recipient.token, ok: true };
  } catch (e) {
    return { platform: "ios", token: recipient.token, ok: false, error: String(e) };
  }
}

// -------------------------------------------------------------------------
// PEM helpers
// -------------------------------------------------------------------------

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(base64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function importP8(pem: string): Promise<CryptoKey> {
  const der = pemToDer(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

// -------------------------------------------------------------------------
// HTTP handler
// -------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const provided = new TextEncoder().encode(req.headers.get('authorization') ?? '');
  const expected = new TextEncoder().encode(`Bearer ${SERVICE_ROLE}`);
  let difference = provided.length ^ expected.length;
  for (let i=0;i<expected.length;i++) difference |= (provided[i] ?? 0) ^ expected[i];
  if (!SERVICE_ROLE || difference !== 0) return json({ error: 'unauthorized' }, 401);

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  if (!payload.user_id || !payload.title || !payload.body) {
    return json({ error: "user_id, title, body required" }, 400);
  }
  const { data: demoAllowed, error: demoError } = await supabase.rpc('workspace_email_allowed', {
    p_to: [], p_actor: payload.user_id, p_payload: payload.data ?? {},
  });
  if (demoError) return json({ error: 'demo_boundary_unavailable' }, 503);
  if (demoAllowed !== true) return json({ sent: 0, skipped: 'demo_scope' });

  // Fetch all device tokens for the recipient (bypasses RLS via service role).
  const { data: tokens, error } = await supabase
    .from("device_tokens")
    .select("token, platform")
    .eq("user_id", payload.user_id);

  if (error) return json({ error: error.message }, 500);
  if (!tokens || tokens.length === 0) return json({ sent: 0, results: [] });

  const results: DispatchResult[] = await Promise.all(
    tokens.map((t: DeviceToken) =>
      t.platform === "ios" ? sendApns(t, payload) : sendFcm(t, payload),
    ),
  );

  const okCount = results.filter((r) => r.ok).length;
  return json({ sent: okCount, total: results.length, results });
});
