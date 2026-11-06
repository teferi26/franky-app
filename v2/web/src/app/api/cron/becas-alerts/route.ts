import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getServerEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { scholarshipDeadlineEmail } from "@/lib/email-templates";

/**
 * Cron diario: avisa por email de las becas suscritas que cierran en <= 7 días.
 *
 * Auth idéntica al resto de crons: Vercel invoca con
 * `Authorization: Bearer <CRON_SECRET>` y sin secreto configurado el endpoint
 * queda inactivo (fail closed). El muro del middleware deja pasar /api/cron/.
 *
 * Idempotente: cada alerta se marca con notified_at al enviarse, así que
 * relanzar el cron no duplica correos.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function secretMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const env = getServerEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!secretMatches(req.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabase();
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 24 * 3600_000);

  // Becas suscritas, aún abiertas y que cierran dentro de la ventana.
  const { data: alerts, error } = await admin
    .from("scholarship_alerts")
    .select(
      "user_id, scholarship_id, scholarships(id, name, provider, deadline, url)"
    )
    .is("notified_at", null)
    .limit(500);

  if (error) {
    // Migración 146 sin aplicar u otro problema de esquema: reportar y salir.
    console.error("[cron/becas-alerts]", error.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  type Row = {
    user_id: string;
    scholarship_id: string;
    scholarships: {
      id: string;
      name: string;
      provider: string | null;
      deadline: string | null;
      url: string | null;
    } | null;
  };

  const due = ((alerts ?? []) as unknown as Row[]).filter((a) => {
    const d = a.scholarships?.deadline ? new Date(a.scholarships.deadline) : null;
    return d !== null && d >= now && d <= horizon;
  });

  let sent = 0;
  let failed = 0;

  for (const alert of due) {
    const beca = alert.scholarships!;
    // El email vive en auth.users; profiles no lo duplica (a propósito).
    const { data: userRes } = await admin.auth.admin.getUserById(alert.user_id);
    const email = userRes?.user?.email;
    if (!email) {
      failed++;
      continue;
    }

    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(beca.deadline!).getTime() - now.getTime()) / (24 * 3600_000))
    );
    const tpl = scholarshipDeadlineEmail({
      name: beca.name,
      provider: beca.provider,
      daysLeft,
      deadline: beca.deadline!,
      becaUrl: `https://franky.es/becas/${beca.id}`,
      officialUrl: beca.url,
    });

    const res = await sendEmail({ to: email, ...tpl, actorUserId: alert.user_id });
    if (res.ok) {
      await admin
        .from("scholarship_alerts")
        .update({ notified_at: new Date().toISOString() })
        .eq("user_id", alert.user_id)
        .eq("scholarship_id", alert.scholarship_id);
      sent++;
    } else {
      // Sin marcar: se reintenta mañana. Un fallo puntual de Resend no debe
      // perder el aviso de un plazo.
      failed++;
    }
  }

  return NextResponse.json({ ok: true, candidates: due.length, sent, failed });
}
