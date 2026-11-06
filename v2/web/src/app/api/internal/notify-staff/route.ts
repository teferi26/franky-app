import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { validateBody } from "@/lib/api-helpers";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getServerEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { staffAlertEmail } from "@/lib/email-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = getServerEnv().NOTIFY_EMAIL_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supplied = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = await validateBody(req, z.object({ alert_id: z.string().uuid() }));
  if (parsed instanceof NextResponse) return parsed;
  const supabase = createAdminSupabase();
  const { data: alert, error } = await supabase.from("staff_alert_outbox").select("*").eq("id", parsed.alert_id).single();
  if (error || !alert) return NextResponse.json({ error: "alert_not_found" }, { status: 404 });
  if (alert.status === "accepted") return NextResponse.json({ accepted: true });
  if (alert.status === "failed") return NextResponse.json({ error: "retry_limit" }, { status: 409 });
  const recipients = (alert.recipients ?? []) as string[];
  const data = alert.data as Record<string, unknown>;
  const tipo = ["mensaje", "denuncia", "sugerencia"].includes(alert.tipo) ? alert.tipo as "mensaje" | "denuncia" | "sugerencia" : "otro";
  const tpl = staffAlertEmail({ tipo, titulo: alert.titulo, cuerpo: alert.cuerpo, data, origin: "https://franky.es" });
  const result = recipients.length ? await sendEmail({
    to: recipients, subject: tpl.subject, html: tpl.html, text: tpl.text,
    replyTo: typeof data.email === "string" && data.email.includes("@") ? data.email : undefined,
    idempotencyKey: `staff-alert/${alert.id}`,
    demoContext: data,
  }) : { ok: false as const, error: "sin_destinatarios" };
  const { error: saved } = await supabase.from("staff_alert_outbox").update(result.ok ? {
    status: "accepted", provider_id: result.id, accepted_at: new Date().toISOString(), last_error: null,
  } : { last_error: result.error.slice(0, 500) }).eq("id", alert.id);
  if (saved) return NextResponse.json({ error: "receipt_not_saved" }, { status: 500 });
  // Accepted by the email provider does not prove delivery to an inbox.
  return NextResponse.json({ accepted: result.ok }, { status: result.ok ? 200 : 502 });
}
