import { Resend } from "resend";
import { createAdminSupabase } from '@/lib/supabase-admin';

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || "Franky <no-reply@franky.es>";

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!RESEND_KEY) return null;
  if (!client) client = new Resend(RESEND_KEY);
  return client;
}

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export async function sendEmail(opts: {
  /** Uno o varios destinatarios (Resend admite hasta 50 por envío). */
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /**
   * A dónde va la respuesta cuando alguien le da a "Responder". Lo usan los
   * avisos al equipo: el correo llega de no-reply@franky.es, pero respondiendo
   * se le contesta directamente a quien escribió.
   */
  replyTo?: string;
  idempotencyKey?: string;
  /** Actor and original notification payload keep service-role/demo boundaries. */
  actorUserId?: string;
  demoContext?: Record<string, unknown>;
}): Promise<SendEmailResult> {
  const c = getClient();
  if (!c) {
    // Fallback: no API key configured. Log to server output so the flow can be
    // exercised end-to-end before the production key is provisioned.
    console.warn("[email] RESEND_API_KEY not set. Email NOT sent.");
    return { ok: false, error: "email_not_configured" };
  }
  try {
    const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(email => email.match(/<([^>]+)>/)?.[1] ?? email);
    const { data: allowed, error: demoError } = await createAdminSupabase().rpc('workspace_email_allowed', {
      p_to: recipients, p_actor: opts.actorUserId ?? null, p_payload: opts.demoContext ?? {},
    });
    // No email leaves Franky while its demo boundary cannot be verified.
    if (demoError || allowed !== true) return { ok: false, error: demoError ? 'email_boundary_unavailable' : 'demo_email_disabled' };
    const { data, error } = await c.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    }, opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
