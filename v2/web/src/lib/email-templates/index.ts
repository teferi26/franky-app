/**
 * Plantillas de email para avisos de actividad (mensaje / like / match).
 *
 * Builders de HTML + texto plano, con estilos inline (los clientes de email
 * no aplican CSS externo de forma fiable). Cada función devuelve
 * `{ subject, html, text }` listo para `sendEmail()`.
 */

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

function safeOfficialUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function layout(opts: {
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  prefsUrl: string;
}): string {
  return `<!doctype html>
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
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:${TEXT};font-weight:800;">${opts.heading}</h1>
          <div style="font-size:15px;line-height:1.55;color:${TEXT};">${opts.bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:20px 24px 28px;">
          <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:${VIOLET};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:12px;">${opts.ctaLabel}</a>
        </td></tr>
        <tr><td style="padding:16px 24px 24px;border-top:1px solid #f0eaff;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">
            Recibes este correo porque tienes una cuenta en Franky.
            <a href="${escapeHtml(opts.prefsUrl)}" style="color:${VIOLET};text-decoration:underline;">Gestiona tus avisos</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function messageEmail(opts: {
  senderName: string;
  preview: string;
  chatUrl: string;
  prefsUrl: string;
}): EmailContent {
  const sender = escapeHtml(opts.senderName);
  const subject = `${opts.senderName} te ha escrito en Franky`;
  const previewHtml = opts.preview
    ? `<p style="margin:0 0 4px;color:${MUTED};">«${escapeHtml(opts.preview)}»</p>`
    : "";
  const html = layout({
    heading: `${sender} te ha escrito`,
    bodyHtml: `${previewHtml}<p style="margin:8px 0 0;">Tienes un mensaje sin leer esperándote.</p>`,
    ctaLabel: "Ver mensaje",
    ctaUrl: opts.chatUrl,
    prefsUrl: opts.prefsUrl,
  });
  const text = `${opts.senderName} te ha escrito en Franky.${
    opts.preview ? `\n\n«${opts.preview}»` : ""
  }\n\nÁbrelo aquí: ${opts.chatUrl}\n\nGestiona tus avisos: ${opts.prefsUrl}`;
  return { subject, html, text };
}

export function likeEmail(opts: {
  roomieUrl: string;
  prefsUrl: string;
}): EmailContent {
  const subject = "Tienes nuevos likes en Franky";
  const html = layout({
    heading: "¡Gustas! 💜",
    bodyHtml:
      `<p style="margin:0;">Alguien te ha dado like en RoomieMatch. Entra para descubrir quién es y dar el siguiente paso.</p>`,
    ctaLabel: "Ver mis likes",
    ctaUrl: opts.roomieUrl,
    prefsUrl: opts.prefsUrl,
  });
  const text = `Tienes nuevos likes en Franky.\n\nEntra para descubrir quién es: ${opts.roomieUrl}\n\nGestiona tus avisos: ${opts.prefsUrl}`;
  return { subject, html, text };
}

export interface InvoiceEmailItem {
  /** Número de factura de Stripe (p. ej. "FRNK-0042") o null si aún no tiene. */
  number: string | null;
  /** Importe ya formateado, p. ej. "80,00 €". */
  amountLabel: string;
  /** Fecha ya formateada, p. ej. "1 de julio de 2026". */
  dateLabel: string;
  /** Concepto (línea principal de la factura). */
  description: string | null;
  /** hosted_invoice_url de Stripe (ver online + descargar PDF). */
  url: string | null;
}

/**
 * Resumen mensual de facturas para propietarios/negocios con plan activo.
 * Cada factura enlaza a la página segura de Stripe (ver + PDF). El CTA lleva
 * al listado de facturas de la cuenta.
 */
export function monthlyInvoicesEmail(opts: {
  name: string | null;
  monthLabel: string;
  invoices: InvoiceEmailItem[];
  invoicesUrl: string;
  prefsUrl: string;
}): EmailContent {
  const hello = opts.name ? `Hola, ${escapeHtml(opts.name)}.` : "Hola.";
  const subject = `Tus facturas de Franky (${opts.monthLabel})`;
  const rows = opts.invoices
    .map((inv) => {
      const title = inv.number ? `Factura ${escapeHtml(inv.number)}` : "Factura";
      const desc = inv.description
        ? `<br><span style="color:${MUTED};font-size:13px;">${escapeHtml(inv.description)}</span>`
        : "";
      // Defensa en profundidad: el hosted_invoice_url viene de Stripe, pero se
      // escapa igual que el resto y solo se enlaza si es https.
      const link = inv.url && inv.url.startsWith("https://")
        ? `<a href="${escapeHtml(inv.url)}" style="color:${VIOLET};text-decoration:underline;font-size:13px;">Ver y descargar PDF</a>`
        : "";
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eaff;">
          <strong>${title}</strong> · ${escapeHtml(inv.dateLabel)}${desc}<br>${link}
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #f0eaff;white-space:nowrap;vertical-align:top;">
          <strong>${escapeHtml(inv.amountLabel)}</strong>
        </td>
      </tr>`;
    })
    .join("");
  const html = layout({
    heading: `Tus facturas de ${escapeHtml(opts.monthLabel)}`,
    bodyHtml:
      `<p style="margin:0 0 12px;">${hello} Este es el resumen de las facturas de tu plan en Franky este mes. Puedes verlas y descargar el PDF de cada una desde su enlace seguro de Stripe.</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`,
    ctaLabel: "Ver todas mis facturas",
    ctaUrl: opts.invoicesUrl,
    prefsUrl: opts.prefsUrl,
  });
  const text =
    `${opts.name ? `Hola, ${opts.name}.` : "Hola."} Tus facturas de Franky de ${opts.monthLabel}:\n\n` +
    opts.invoices
      .map(
        (inv) =>
          `- ${inv.number ? `Factura ${inv.number}` : "Factura"} · ${inv.dateLabel} · ${inv.amountLabel}` +
          (inv.description ? ` · ${inv.description}` : "") +
          (inv.url ? `\n  Ver/descargar: ${inv.url}` : "")
      )
      .join("\n") +
    `\n\nTodas tus facturas: ${opts.invoicesUrl}\n\nGestiona tus avisos: ${opts.prefsUrl}`;
  return { subject, html, text };
}

export function matchEmail(opts: {
  matchName: string;
  chatUrl: string;
  prefsUrl: string;
}): EmailContent {
  const name = escapeHtml(opts.matchName);
  const subject = "¡Has hecho match en Franky!";
  const html = layout({
    heading: `¡Match con ${name}! 🎉`,
    bodyHtml:
      `<p style="margin:0;">A los dos os gustáis. Empieza la conversación antes de que se enfríe.</p>`,
    ctaLabel: "Enviar mensaje",
    ctaUrl: opts.chatUrl,
    prefsUrl: opts.prefsUrl,
  });
  const text = `¡Has hecho match con ${opts.matchName} en Franky!\n\nEmpieza la conversación: ${opts.chatUrl}\n\nGestiona tus avisos: ${opts.prefsUrl}`;
  return { subject, html, text };
}

/** Crush (intercambio de Instagram): petición recibida o match. El título y
 *  el cuerpo llegan ya redactados desde la notificación (incluyen el nombre). */
export function crushEmail(opts: {
  title: string;
  body: string;
  crushUrl: string;
  prefsUrl: string;
}): EmailContent {
  const subject = opts.title || "Tienes novedades en Crush 💜";
  const html = layout({
    heading: escapeHtml(subject),
    bodyHtml: `<p style="margin:0;">${escapeHtml(opts.body || "Entra en Crush para verlo.")}</p>`,
    ctaLabel: "Ir a Crush",
    ctaUrl: opts.crushUrl,
    prefsUrl: opts.prefsUrl,
  });
  const text = `${subject}\n\n${opts.body || "Entra en Crush para verlo."}\n\nÁbrelo aquí: ${opts.crushUrl}\n\nGestiona tus avisos: ${opts.prefsUrl}`;
  return { subject, html, text };
}

/** Comentario en tu publicación del FOMO. */
export function commentEmail(opts: {
  title: string;
  preview: string;
  threadUrl: string;
  prefsUrl: string;
}): EmailContent {
  const subject = opts.title || "Han comentado tu publicación en Franky";
  const previewHtml = opts.preview
    ? `<p style="margin:0 0 4px;color:${MUTED};">«${escapeHtml(opts.preview)}»</p>`
    : "";
  const html = layout({
    heading: escapeHtml(subject),
    bodyHtml: `${previewHtml}<p style="margin:8px 0 0;">Entra para responder.</p>`,
    ctaLabel: "Ver comentario",
    ctaUrl: opts.threadUrl,
    prefsUrl: opts.prefsUrl,
  });
  const text = `${subject}${opts.preview ? `\n\n«${opts.preview}»` : ""}\n\nRespóndele aquí: ${opts.threadUrl}\n\nGestiona tus avisos: ${opts.prefsUrl}`;
  return { subject, html, text };
}

/** Nuevo evento en tu ciudad / universidad. */
export function eventEmail(opts: {
  title: string;
  description: string;
  eventUrl: string;
  prefsUrl: string;
}): EmailContent {
  const subject = opts.title || "Hay un plan nuevo cerca de ti en Franky";
  const descHtml = opts.description
    ? `<p style="margin:0 0 4px;color:${MUTED};">${escapeHtml(opts.description)}</p>`
    : "";
  const html = layout({
    heading: escapeHtml(subject),
    bodyHtml: `${descHtml}<p style="margin:8px 0 0;">Mira los detalles y apúntate antes de que se llene.</p>`,
    ctaLabel: "Ver evento",
    ctaUrl: opts.eventUrl,
    prefsUrl: opts.prefsUrl,
  });
  const text = `${subject}${opts.description ? `\n\n${opts.description}` : ""}\n\nVer evento: ${opts.eventUrl}\n\nGestiona tus avisos: ${opts.prefsUrl}`;
  return { subject, html, text };
}

/**
 * Piso disponible en tu zona (migración 169): un piso nuevo en la provincia
 * donde la persona busca, o uno que pasa a alquilarse por habitaciones. El
 * título y el cuerpo ya vienen redactados desde la base de datos.
 */
export function housingEmail(opts: {
  title: string;
  body: string;
  listingUrl: string;
  prefsUrl: string;
}): EmailContent {
  const subject = opts.title || "Hay un piso nuevo en tu zona en Franky";
  const bodyHtml = opts.body
    ? `<p style="margin:0 0 4px;color:${MUTED};">${escapeHtml(opts.body)}</p>`
    : "";
  const html = layout({
    heading: escapeHtml(subject),
    bodyHtml: `${bodyHtml}<p style="margin:8px 0 0;">Mira las fotos y escribe al propietario antes de que vuele.</p>`,
    ctaLabel: "Ver el piso",
    ctaUrl: opts.listingUrl,
    prefsUrl: opts.prefsUrl,
  });
  const text = `${subject}${opts.body ? `\n\n${opts.body}` : ""}\n\nVer el piso: ${opts.listingUrl}\n\nGestiona tus avisos: ${opts.prefsUrl}`;
  return { subject, html, text };
}

/**
 * Verificacion de email (diferida). Se envia al crear la cuenta, pero el
 * usuario ya esta dentro: el correo NO bloquea nada, solo desbloquea las
 * acciones sensibles. Por eso el tono es de "confirma cuando puedas", no de
 * "haz esto o no entras".
 */
export function verifyEmailTemplate(opts: {
  name: string | null;
  url: string;
  hours: number;
}): EmailContent {
  const hi = opts.name ? `Hola ${escapeHtml(opts.name)}, ` : "";
  const subject = "Confirma tu email en Franky";
  const html = layout({
    heading: "Confirma tu email",
    bodyHtml:
      `<p style="margin:0 0 10px;">${hi}tu cuenta ya está activa y puedes usarla ahora mismo.</p>` +
      `<p style="margin:0 0 10px;">Confirma tu correo para poder publicar y chatear, y para recuperar la contraseña si algún día la pierdes.</p>` +
      `<p style="margin:0;color:${MUTED};font-size:13px;">El enlace caduca en ${opts.hours} horas. Si no has creado ninguna cuenta en Franky, ignora este correo.</p>`,
    ctaLabel: "Confirmar mi email",
    ctaUrl: opts.url,
    prefsUrl: "https://franky.es/perfil",
  });
  const text =
    `${hi}tu cuenta de Franky ya está activa.\n\n` +
    `Confirma tu correo aquí (caduca en ${opts.hours} h): ${opts.url}\n\n` +
    `Si no has creado ninguna cuenta en Franky, ignora este correo.`;
  return { subject, html, text };
}

/**
 * Aviso de cierre de plazo de una beca suscrita (cron becas-alerts).
 * El tono es de urgencia util, no de marketing: quedan pocos dias y el
 * usuario pidio explicitamente este aviso.
 */
export function scholarshipDeadlineEmail(opts: {
  name: string;
  provider: string | null;
  daysLeft: number;
  deadline: string;
  becaUrl: string;
  prefsUrl?: string;
  officialUrl: string | null;
}): EmailContent {
  const officialUrl = safeOfficialUrl(opts.officialUrl);
  const dias = opts.daysLeft === 1 ? "MAÑANA" : `en ${opts.daysLeft} días`;
  const fecha = new Date(opts.deadline).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
  });
  const subject =
    opts.daysLeft === 1
      ? `⏰ ÚLTIMO DÍA para pedir la ${opts.name}`
      : `La ${opts.name} cierra en ${opts.daysLeft} días`;
  const html = layout({
    heading: `Esta beca cierra ${dias}`,
    bodyHtml:
      `<p style="margin:0 0 8px;"><strong>${escapeHtml(opts.name)}</strong>${
        opts.provider ? ` (${escapeHtml(opts.provider)})` : ""
      }</p>` +
      `<p style="margin:0 0 8px;">Nos pediste que te avisáramos: el plazo termina el <strong>${fecha}</strong>. Si la vas a pedir, este es el momento.</p>` +
      (officialUrl
        ? `<p style="margin:0;color:${MUTED};font-size:13px;">Solicitud oficial: <a href="${escapeHtml(officialUrl)}" style="color:${VIOLET};">${escapeHtml(officialUrl)}</a></p>`
        : ""),
    ctaLabel: "Ver la beca en Franky",
    ctaUrl: opts.becaUrl,
    prefsUrl: opts.prefsUrl ?? "https://franky.es/perfil",
  });
  const text =
    `${opts.name}${opts.provider ? ` (${opts.provider})` : ""} cierra ${dias} (${fecha}).\n\n` +
    `Ficha en Franky: ${opts.becaUrl}\n` +
    (officialUrl ? `Solicitud oficial: ${officialUrl}\n` : "") +
    `\nRecibes este aviso porque activaste la alerta de esta beca.`;
  return { subject, html, text };
}

/**
 * Aviso al EQUIPO (admin y analistas) de algo que ha entrado en la plataforma:
 * un mensaje del buzón, una denuncia o una sugerencia (migración 167).
 *
 * Va con el contenido COMPLETO dentro a propósito: la gracia es poder leerlo y
 * decidir desde el propio correo, sin tener que entrar al panel a ver de qué
 * iba. Y con reply-to al remitente, así responder por email ya le contesta.
 */
export function staffAlertEmail(opts: {
  tipo: "mensaje" | "denuncia" | "sugerencia" | "otro";
  titulo: string;
  cuerpo: string;
  data?: Record<string, unknown>;
  origin: string;
}): EmailContent {
  const etiqueta = {
    mensaje: "Mensaje en el buzón",
    denuncia: "Denuncia",
    sugerencia: "Sugerencia",
    otro: "Aviso",
  }[opts.tipo];

  const nombre = typeof opts.data?.nombre === "string" ? opts.data.nombre : null;
  const email = typeof opts.data?.email === "string" ? opts.data.email : null;
  const ruta = typeof opts.data?.url === "string" && opts.data.url.startsWith("/")
    ? opts.data.url
    : "/admin";

  const deQuien = [nombre, email].filter(Boolean).join(" · ");
  const subject = `[Franky] ${etiqueta}: ${opts.titulo || "sin asunto"}`;

  const html = layout({
    heading: `${etiqueta}${opts.titulo ? `: ${escapeHtml(opts.titulo)}` : ""}`,
    bodyHtml:
      (deQuien
        ? `<p style="margin:0 0 12px;color:${MUTED};font-size:13px;">De: <strong style="color:${TEXT};">${escapeHtml(deQuien)}</strong></p>`
        : "") +
      `<div style="white-space:pre-wrap;background:#faf7ff;border-left:3px solid ${VIOLET};padding:12px 14px;border-radius:8px;">${escapeHtml(
        opts.cuerpo || "(sin texto)"
      )}</div>` +
      (email
        ? `<p style="margin:12px 0 0;color:${MUTED};font-size:13px;">Responde a este correo y le contestas directamente.</p>`
        : ""),
    ctaLabel: "Abrir el panel",
    ctaUrl: `${opts.origin}${ruta}`,
    prefsUrl: `${opts.origin}/admin`,
  });

  const text =
    `${etiqueta}${opts.titulo ? `: ${opts.titulo}` : ""}\n` +
    (deQuien ? `De: ${deQuien}\n` : "") +
    `\n${opts.cuerpo || "(sin texto)"}\n\n` +
    `Panel: ${opts.origin}${ruta}\n`;

  return { subject, html, text };
}
