import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { validateBody } from "@/lib/api-helpers";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getServerEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import {
  messageEmail,
  likeEmail,
  matchEmail,
  crushEmail,
  commentEmail,
  eventEmail,
  housingEmail,
} from "@/lib/email-templates";
import { toWebNotificationPath } from "@/lib/notification-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ventanas de throttle (minutos). Evitan spamear cuando llegan eventos seguidos.
const THROTTLE_MIN = {
  message: 60, // máx 1 email por conversación cada hora hasta que lo lean
  roomie_like: 8 * 60, // likes agrupados: 1 cada 8h
  match: 5, // anti-duplicado por par; el match es raro de por sí
  comment: 6 * 60, // comentarios agrupados por publicación: 1 cada 6h
  event: 24 * 60, // máx 1 email de eventos al día por usuario (ref global)
  // Pisos en tu zona (169): 1 email cada 12h por persona, aunque salgan tres
  // pisos seguidos. In-app y push llevan cada uno; el email no debe convertirse
  // en un goteo si una inmobiliaria sube la cartera entera de golpe.
  accommodation: 12 * 60,
} as const;

// Si el destinatario estuvo activo en los últimos N minutos asumimos que verá
// el push / la notificación in-app y no le mandamos email del mensaje.
const ACTIVE_WINDOW_MIN = 15;

const CATEGORY: Record<string, string> = {
  message: "chat_messages",
  match: "matches",
  roomie_like: "likes",
  comment: "comments", // sin toggle propio en notification_preferences → fail open
  event: "events",
  accommodation: "accommodation", // toggle "Alojamiento" de notification_preferences (070)
};

const schema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(["message", "match", "roomie_like", "comment", "event", "accommodation"]),
  title: z.string().max(300).optional().default(""),
  body: z.string().max(2000).optional().default(""),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

// data.url viene de nuestros triggers, pero por defensa solo aceptamos rutas
// internas (evita que un dato manipulado convierta el CTA en open redirect).
// Además se traduce el vocabulario de la app móvil al de la web (p. ej. la
// notificación de match de Crush Live escribe /crush-live, que en web es
// /crush/live): si no, el CTA del correo daba un 404.
function internalUrl(origin: string, raw: unknown, fallback: string): string {
  const path = toWebNotificationPath(typeof raw === "string" ? raw : null) ?? fallback;
  return `${origin}${path}`;
}

function secretMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const env = getServerEnv();
  const secret = env.NOTIFY_EMAIL_SECRET;
  if (!secret) {
    // Sin secreto configurado el endpoint queda inactivo (fail closed).
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!secretMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = await validateBody(req, schema);
  if (parsed instanceof NextResponse) return parsed;
  const { user_id, type, title, body, data } = parsed;

  const supabase = createAdminSupabase();
  const origin = req.nextUrl.origin;
  const prefsUrl = `${origin}/notificaciones`;

  // 1. Destinatario.
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, last_seen")
    .eq("id", user_id)
    .single();
  if (!profile?.email) {
    return NextResponse.json({ sent: false, skipped: "no_email" });
  }

  // 2. Preferencias por categoría + ventana DnD (reutiliza el helper de push).
  const category = CATEGORY[type];
  const { data: allowed, error: prefErr } = await supabase.rpc("should_send_push", {
    p_user_id: user_id,
    p_category: category,
  });
  if (prefErr) {
    console.error("[notify-email] should_send_push error:", prefErr.message);
  }
  if (allowed === false) {
    return NextResponse.json({ sent: false, skipped: "prefs_off_or_dnd" });
  }

  // 3. Inactividad (solo mensajes): si está activo, ya lo verá por push/in-app.
  if (type === "message") {
    const now = Date.now();
    const lastSeen = profile.last_seen ? new Date(profile.last_seen).getTime() : 0;
    if (now - lastSeen < ACTIVE_WINDOW_MIN * 60_000) {
      return NextResponse.json({ sent: false, skipped: "recipient_active" });
    }
    const conversationId = String(data.conversation_id ?? "");
    if (conversationId) {
      const { data: part } = await supabase
        .from("conversation_participants")
        .select("last_read_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", user_id)
        .maybeSingle();
      const lastRead = part?.last_read_at ? new Date(part.last_read_at).getTime() : 0;
      if (now - lastRead < ACTIVE_WINDOW_MIN * 60_000) {
        return NextResponse.json({ sent: false, skipped: "recently_read" });
      }
    }
  }

  // 4. Throttle por (user, category, ref). `ref` agrupa: conversación para
  //    mensajes, 'likes' global para likes, peer (o kind de Crush) para
  //    matches, la publicación para comentarios y 'events' global (1/día).
  const ref =
    type === "message"
      ? String(data.conversation_id ?? "")
      : type === "match"
        ? String(data.target_user_id ?? data.kind ?? "")
        : type === "comment"
          ? String(data.url ?? "comments")
          : type === "event"
            ? "events"
            : type === "accommodation"
              ? "housing"
              : "likes";
  const windowMin = THROTTLE_MIN[type];

  const { data: logRow } = await supabase
    .from("email_notification_log")
    .select("last_sent_at")
    .eq("user_id", user_id)
    .eq("category", category)
    .eq("ref", ref)
    .maybeSingle();
  if (logRow?.last_sent_at) {
    const elapsed = Date.now() - new Date(logRow.last_sent_at).getTime();
    if (elapsed < windowMin * 60_000) {
      return NextResponse.json({ sent: false, skipped: "throttled" });
    }
  }

  // 5. Plantilla.
  let email;
  const kind = String(data.kind ?? "");
  if (type === "message") {
    email = messageEmail({
      senderName: title || "Alguien",
      preview: body || "",
      chatUrl: `${origin}/chats`,
      prefsUrl,
    });
  } else if (type === "match" && (kind === "ig_request" || kind === "ig_match")) {
    // Crush: el título/cuerpo de la notificación ya traen el nombre redactado.
    email = crushEmail({
      title,
      body,
      crushUrl: internalUrl(origin, data.url, "/crush"),
      prefsUrl,
    });
  } else if (type === "match") {
    let matchName = "tu match";
    const peerId = String(data.target_user_id ?? "");
    if (peerId) {
      const { data: peer } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", peerId)
        .single();
      if (peer?.full_name) matchName = peer.full_name;
    }
    email = matchEmail({ matchName, chatUrl: `${origin}/chats`, prefsUrl });
  } else if (type === "comment") {
    email = commentEmail({
      title,
      preview: body || "",
      threadUrl: internalUrl(origin, data.url, "/fomo"),
      prefsUrl,
    });
  } else if (type === "event") {
    email = eventEmail({
      title,
      description: body || "",
      eventUrl: internalUrl(origin, data.url, "/eventos"),
      prefsUrl,
    });
  } else if (type === "accommodation") {
    email = housingEmail({
      title,
      body: body || "",
      listingUrl: internalUrl(origin, data.url, "/alojamiento"),
      prefsUrl,
    });
  } else {
    email = likeEmail({ roomieUrl: `${origin}/roomie-match`, prefsUrl });
  }

  // 6. Registrar throttle ANTES de enviar (evita ráfagas concurrentes) y enviar.
  await supabase
    .from("email_notification_log")
    .upsert(
      { user_id, category, ref, last_sent_at: new Date().toISOString() },
      { onConflict: "user_id,category,ref" }
    );

  const result = await sendEmail({
    to: profile.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    actorUserId: user_id,
    demoContext: data,
  });
  if (!result.ok) {
    console.error("[notify-email] send failed:", result.error);
    return NextResponse.json({ sent: false, error: result.error });
  }
  return NextResponse.json({ sent: true });
}
