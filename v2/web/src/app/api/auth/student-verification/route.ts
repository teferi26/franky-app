import { NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { createRequestSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";

/**
 * Solicita la verificacion del correo UNIVERSITARIO (migracion 025) y envia
 * el email con el enlace de confirmacion.
 *
 * Este endpoint cierra el hueco que dejaba la migracion: la RPC
 * request_student_email_verification valida el dominio academico, genera el
 * token y lo DEVUELVE al llamante con el comentario "the web layer is then
 * responsible for sending the email". Hasta ahora nadie enviaba ese correo
 * (la app movil llama a la RPC directamente y descarta el token). Aqui la RPC
 * se llama en el servidor con la sesion del usuario, el token nunca baja al
 * navegador y el correo sale de verdad via Resend (src/lib/email.ts).
 *
 * El enlace apunta a /perfil/verificar-estudiante?token=... (pagina protegida
 * por el muro de auth del middleware; el redirect a /login conserva la query,
 * asi que el token sobrevive aunque el usuario abra el enlace sin sesion).
 * La confirmacion la hace esa pagina llamando a confirm_student_email, que
 * esta concedida a authenticated.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_HOURS = 24; // lo fija la RPC (now() + interval '24 hours')

const schema = z.object({
  email: z.string().trim().toLowerCase().min(6).max(320).email(),
});

function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://franky.es");
  return raw.replace(/\/+$/, "");
}

// Plantilla local (mismo lenguaje visual que src/lib/email-templates, que es
// de los avisos de actividad y no se toca desde aqui). Estilos inline porque
// los clientes de correo no aplican CSS externo de forma fiable.
const VIOLET = "#7C3AED";
const VIOLET_DARK = "#5B21B6";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const BG = "#f5f0ff";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function studentVerificationEmail(opts: { url: string; email: string }) {
  const subject = "Confirma tu correo universitario en Franky";
  const safeUrl = escapeHtml(opts.url);
  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(124,60,237,0.08);">
        <tr><td style="background:linear-gradient(135deg,${VIOLET},${VIOLET_DARK});padding:20px 24px;">
          <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Franky</span>
        </td></tr>
        <tr><td style="padding:28px 24px 8px;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:${TEXT};font-weight:800;">Confirma tu correo universitario</h1>
          <div style="font-size:15px;line-height:1.55;color:${TEXT};">
            <p style="margin:0 0 8px;">Has pedido el distintivo de estudiante verificado para <strong>${escapeHtml(opts.email)}</strong>.</p>
            <p style="margin:0;">Pulsa el botón para confirmarlo y lucir el distintivo junto a tu nombre en todo Franky. El enlace caduca en ${TOKEN_TTL_HOURS} horas.</p>
          </div>
        </td></tr>
        <tr><td style="padding:20px 24px 28px;">
          <a href="${safeUrl}" style="display:inline-block;background:${VIOLET};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:12px;">Confirmar mi correo</a>
        </td></tr>
        <tr><td style="padding:16px 24px 24px;border-top:1px solid #f0eaff;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">
            Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
            <a href="${safeUrl}" style="color:${VIOLET};word-break:break-all;">${safeUrl}</a>
          </p>
          <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">
            Si no has pedido esta verificación, ignora este correo: nadie puede verificarse sin abrir el enlace.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = `Confirma tu correo universitario en Franky

Has pedido el distintivo de estudiante verificado para ${opts.email}.
Abre este enlace para confirmarlo (caduca en ${TOKEN_TTL_HOURS} horas):

${opts.url}

Si no has pedido esta verificación, ignora este correo.`;
  return { subject, html, text };
}

// Traduce los RAISE EXCEPTION de la RPC a codigos estables para el cliente.
function rpcErrorCode(message: string): { code: string; status: number } {
  if (message.includes("unsupported_domain")) return { code: "unsupported_domain", status: 422 };
  if (message.includes("invalid_email")) return { code: "invalid_email", status: 422 };
  if (message.includes("email_taken")) return { code: "email_taken", status: 409 };
  if (message.includes("not_authenticated")) return { code: "unauthorized", status: 401 };
  return { code: "rpc_failed", status: 500 };
}

export async function POST(request: Request) {
  // createRequestSupabase acepta cookies (web) y Bearer (app movil), asi la
  // app podra apuntar aqui el dia que quiera enviar el correo de verdad.
  const supabase = await createRequestSupabase(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3 solicitudes por hora y usuario: de sobra para quien no encuentra el
  // correo, insuficiente para usar Franky de maquina de spam contra buzones
  // universitarios (la RPC ya invalida los tokens anteriores en cada peticion).
  const rl = await rateLimit(request, {
    key: "student-verification",
    subject: user.id,
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return rl.response;

  const parsed = await validateBody(request, schema);
  if (parsed instanceof NextResponse) return parsed;
  const email = parsed.email;

  // La RPC valida dominio academico, unicidad y genera el token (24h).
  //
  // Preferimos la variante de SERVIDOR (migracion 149, service_role): la
  // publica dejo de devolver el token precisamente porque devolverselo a
  // cualquier cliente autenticado permitia auto-verificarse sin abrir el
  // buzon. Si la 149 aun no esta aplicada, caemos a la variante publica
  // (que en ese caso todavia devuelve el token): asi el endpoint funciona
  // antes y despues de aplicar la migracion.
  let token: string | undefined;
  {
    const admin = createAdminSupabase();
    const { data, error: adminErr } = await admin.rpc(
      "request_student_email_verification_admin",
      { p_user_id: user.id, p_email: email }
    );
    if (!adminErr) {
      const row = Array.isArray(data) ? data[0] : data;
      token = row?.token;
    } else if (/does not exist|42883|PGRST202/i.test(adminErr.message ?? "")) {
      // 149 sin aplicar: variante publica con la sesion del usuario.
      const { data: pubData, error: pubErr } = await supabase.rpc(
        "request_student_email_verification",
        { p_email: email }
      );
      if (pubErr) {
        const { code, status } = rpcErrorCode(pubErr.message ?? "");
        if (code === "rpc_failed") {
          console.error("[student-verification] RPC error:", pubErr.message);
        }
        return NextResponse.json({ error: code }, { status });
      }
      const row = Array.isArray(pubData) ? pubData[0] : pubData;
      token = row?.token;
    } else {
      const { code, status } = rpcErrorCode(adminErr.message ?? "");
      if (code === "rpc_failed") {
        console.error("[student-verification] RPC admin error:", adminErr.message);
      }
      return NextResponse.json({ error: code }, { status });
    }
  }
  if (!token) {
    console.error("[student-verification] RPC sin token en la respuesta");
    return NextResponse.json({ error: "rpc_failed" }, { status: 500 });
  }

  // El token NUNCA baja al navegador: solo viaja dentro del enlace del correo.
  const url = `${siteUrl()}/perfil/verificar-estudiante?token=${encodeURIComponent(token)}`;
  const tpl = studentVerificationEmail({ url, email });
  const res = await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text, actorUserId: user.id });

  if (!res.ok) {
    // Honestidad ante todo: si el emisor no esta configurado o Resend falla,
    // se dice claro que el correo NO ha salido (nada de fingir el envio).
    const notConfigured = res.error === "email_not_configured";
    return NextResponse.json(
      { sent: false, error: notConfigured ? "email_not_configured" : "send_failed" },
      { status: notConfigured ? 503 : 502 }
    );
  }

  return NextResponse.json({ sent: true, email });
}
