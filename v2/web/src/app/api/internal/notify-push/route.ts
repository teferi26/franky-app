import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { validateBody } from "@/lib/api-helpers";
import { expoResults, pushCategory, pushContent, pushSuppression, validExpoToken, type DeviceResult } from "@/lib/push-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.union([
  z.object({ alert_id: z.string().uuid(), lease_id: z.string().uuid() }),
  z.object({ user_id: z.string().uuid(), title: z.string().min(1).max(200), body: z.string().max(500).nullish(), data: z.record(z.string(), z.unknown()).optional() }),
]);

export async function POST(req: Request) {
  const deadline = Date.now() + 25_000;
  const secret = process.env.NOTIFY_EMAIL_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supplied = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await validateBody(req, schema);
  if (parsed instanceof NextResponse) return parsed;
  const admin = createAdminSupabase();
  const job = "alert_id" in parsed ? parsed : null;
  let message: { user_id: string; title: string; body?: string | null; data?: Record<string, unknown> };
  let previous: DeviceResult[] = [];
  if ("alert_id" in parsed) {
    const { data: row, error } = await admin.from("push_delivery_outbox").select("notification_id,status,device_results,attempts,lease_id").eq("id", parsed.alert_id).maybeSingle();
    if (error) return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
    if (!row || row.lease_id !== parsed.lease_id) return NextResponse.json({ error: "stale_lease" }, { status: 409 });
    if (row.status !== "sending") return NextResponse.json({ ok: true, skipped: "finished" });
    const claim = await admin.from("push_delivery_outbox").update({ status: "processing", next_attempt_at: new Date(Date.now() + 120_000).toISOString() }).eq("id", parsed.alert_id).eq("lease_id", parsed.lease_id).eq("status", "sending").gt("next_attempt_at", new Date().toISOString()).select("id");
    if (claim.error) return NextResponse.json({ error: "claim_failed" }, { status: 503 });
    if (!claim.data?.length) return NextResponse.json({ ok: true, skipped: "already_claimed" });
    const { data: notification, error: readError } = await admin.from("notifications").select("user_id,title,body,data,type").eq("id", row.notification_id).maybeSingle();
    if (readError || !notification) return NextResponse.json({ error: "notification_unavailable" }, { status: 503 });
    message = { ...notification, data: { ...(notification.data as Record<string, unknown>), type: notification.type } };
    previous = Array.isArray(row.device_results) ? row.device_results as DeviceResult[] : [];
  } else message = parsed;

  const finish = async (status: "accepted" | "skipped" | "pending" | "failed", reason: string | null, results = previous) => {
    if (!job) return true;
    const { data, error } = await admin.from("push_delivery_outbox").update({ status, last_error: reason, device_results: results,
      ...(status === "accepted" ? { accepted_at: new Date().toISOString() } : {}),
    }).eq("id", job.alert_id).eq("lease_id", job.lease_id).in("status", ["processing", "provider_sending"]).select("id");
    return !error && !!data?.length;
  };
  const skipped = async (reason: string) => {
    const saved = await finish("skipped", reason);
    return NextResponse.json(saved ? { ok: true, skipped: reason } : { error: "receipt_not_saved" }, { status: saved ? 200 : 503 });
  };
  const { data: demoAllowed, error: demoError } = await admin.rpc('workspace_email_allowed', { p_to: [], p_actor: message.user_id, p_payload: message.data ?? {} });
  if (demoError) return NextResponse.json({ error: 'demo_boundary_unavailable' }, { status: 503 });
  if (demoAllowed !== true) return skipped('demo_scope');
  // A failed preference read must not become implicit permission to send.
  const { data: profile, error: profileError } = await admin.from("profiles").select("is_discarded,push_prefs").eq("id", message.user_id).maybeSingle();
  if (profileError) return NextResponse.json({ error: "preferences_unavailable" }, { status: 503 });
  if (!profile || profile.is_discarded) return skipped("no_user");
  const suppression = pushSuppression(profile.push_prefs, message.data?.type);
  if (suppression) return skipped(suppression);
  const { data: rawTokens, error: tokensError } = await admin.from("device_tokens").select("id,token").eq("user_id", message.user_id).limit(20);
  if (tokensError) return NextResponse.json({ error: "devices_unavailable" }, { status: 503 });
  const devices = (rawTokens ?? []).filter(t => validExpoToken(t.token));
  if (!devices.length) return skipped("no_tokens");
  // Already accepted devices are never deliberately sent again on a partial retry.
  const tokens = devices.filter(t => !previous.some(r => r.device_id === t.id && r.status !== "retry"));
  const category = pushCategory(message.data?.type);
  if (["events", "news", "housing"].includes(category) && tokens.length) {
    const { data: allowed, error } = await admin.rpc("claim_product_push_window", { p_user_id: message.user_id, p_category: category, p_job_id: job?.alert_id ?? null });
    if (error) return NextResponse.json({ error: "throttle_unavailable" }, { status: 503 });
    if (!allowed) return skipped("throttled");
  }
  let results = previous;
  if (tokens.length) {
    if (Date.now() >= deadline - 1000) return NextResponse.json({ error: "request_deadline" }, { status: 503 });
    if (job) {
      const sendClaim = await admin.from("push_delivery_outbox").update({ status: "provider_sending" }).eq("id", job.alert_id).eq("lease_id", job.lease_id).eq("status", "processing").gt("next_attempt_at", new Date(Date.now() + 30_000).toISOString()).select("id");
      if (sendClaim.error || !sendClaim.data?.length) return NextResponse.json({ error: "stale_send_lease" }, { status: 409 });
      if (Date.now() >= deadline - 1000) {
        await finish("pending", "Deadline elapsed before provider dispatch");
        return NextResponse.json({ error: "request_deadline" }, { status: 503 });
      }
    }
    // El aviso lleva el texto real (quién y por qué). Cada token tiene un único
    // dueño (device_tokens_one_owner) y se borra al cerrar sesión, así que el
    // banner solo llega al móvil de la persona con la sesión abierta.
    const unread = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", message.user_id).eq("is_read", false);
    const content = pushContent(message, unread.error ? null : unread.count);
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))),
        body: JSON.stringify(tokens.map(t => ({ to: t.token, ...content }))),
      });
      const fresh = expoResults(tokens.map(t => t.id), await response.json().catch(() => null), response.ok);
      results = [...previous.filter(r => !tokens.some(t => t.id === r.device_id)), ...fresh];
      const dead = fresh.filter(r => r.error === "DeviceNotRegistered").map(r => r.device_id);
      if (dead.length) await admin.from("device_tokens").delete().eq("user_id", message.user_id).in("id", dead);
    } catch {
      await finish("failed", "Provider outcome unknown; manual review required");
      return NextResponse.json({ error: "push_failed" }, { status: 502 });
    }
  }
  const retry = results.filter(r => r.status === "retry").length;
  const failed = results.filter(r => r.status === "permanent_error").length;
  const accepted = results.filter(r => r.status === "accepted").length;
  const unknown = results.filter(r => r.status === "unknown").length;
  const status = unknown ? "failed" : retry ? "pending" : failed ? "failed" : "accepted";
  const saved = await finish(status, unknown ? "Provider outcome unknown; manual review required" : retry || failed ? `${retry} retryable; ${failed} permanent errors` : null, results);
  if (!saved) return NextResponse.json({ error: "receipt_not_saved" }, { status: 503 });
  // A ticket proves Expo accepted the request, not delivery to the person's phone.
  return NextResponse.json({ ok: !retry && !failed && !unknown, accepted, failed, retry, unknown }, { status: retry || failed || unknown ? 502 : 200 });
}
