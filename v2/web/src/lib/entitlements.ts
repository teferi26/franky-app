// entitlements.ts
//
// Utilidades para robustecer el webhook de Stripe. El objetivo principal es
// que un fallo de escritura en Supabase NO se trague silenciosamente: hoy el
// webhook respondia 200 aunque la BD fallara, asi que Stripe no reintentaba y
// el pago quedaba cobrado pero sin reflejarse (M-COD-001 / M-BIZ-015).
//
// Idea: cada escritura critica pasa por `assertWrite`, que registra el error
// con contexto (event.id, event.type) y lanza una excepcion. El handler del
// webhook deja propagar esa excepcion y responde un 500, de modo que Stripe
// reintenta el MISMO evento mas tarde. Por eso todas las operaciones deben ser
// idempotentes (ver notas de cada helper): un reintento no debe duplicar nada.
//
// No se introduce ninguna tabla nueva (no podemos crear migraciones aqui), asi
// que la idempotencia se apoya en:
//   * upsert sobre columnas con restriccion UNIQUE (owner/business subs), y
//   * comprobaciones "leer y luego escribir" cuando no hay UNIQUE fiable
//     (tabla `subscriptions` de usuario, que no tiene UNIQUE en
//     stripe_subscription_id en 001_schema.sql).

import type { createAdminSupabase } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";

// El mismo cliente service-role que usa el webhook: con sus genericos reales
// las tablas tipan bien (con ReturnType<typeof createClient> sin genericos
// todo resolvia a never y el typecheck fallaba).
type SupabaseAdmin = ReturnType<typeof createAdminSupabase>;

// Forma minima de un resultado de escritura de supabase-js: solo nos importa
// si trae `error`. Evita acoplarnos a los tipos genericos del SDK.
type WriteResult = { error: { message?: string; code?: string } | null };

/**
 * Error critico de webhook. Al propagarse hasta el handler hace que el
 * endpoint responda 500 y Stripe reintegue el evento. Lleva el contexto del
 * evento para depurar en logs.
 */
export class WebhookCriticalError extends Error {
  constructor(
    message: string,
    public readonly context: { eventId: string; eventType: string; op: string },
  ) {
    super(message);
    this.name = "WebhookCriticalError";
  }
}

export type EventContext = { id: string; type: string };

/**
 * Envuelve una escritura critica en Supabase. Si el resultado trae `error`,
 * lo registra con console.error + contexto del evento y LANZA, para que el
 * webhook devuelva no-2xx y Stripe reintente.
 *
 * Uso: `await assertWrite(event, "owner_subscriptions.upsert", await supabase...)`
 * Pasamos el resultado ya resuelto (await en el call site) para no cambiar la
 * forma de las llamadas existentes.
 */
export async function assertWrite<T extends WriteResult>(
  event: EventContext,
  op: string,
  result: T,
): Promise<T> {
  if (result.error) {
    console.error(
      `[stripe-webhook] escritura critica fallida op=${op} event.id=${event.id} event.type=${event.type} code=${result.error.code ?? "?"} msg=${result.error.message ?? "?"}`,
    );
    throw new WebhookCriticalError(
      `Escritura critica fallida en ${op}`,
      { eventId: event.id, eventType: event.type, op },
    );
  }
  return result;
}

/**
 * Upsert idempotente de la suscripcion Pro/Premium de usuario en la tabla
 * `subscriptions`.
 *
 * Por que no usar upsert(onConflict) directamente: en 001_schema.sql la columna
 * `stripe_subscription_id` NO tiene restriccion UNIQUE, asi que un
 * upsert con onConflict no puede deduplicar de forma fiable y un reintento de
 * Stripe podria insertar una fila duplicada. Para garantizar idempotencia sin
 * depender de un constraint inexistente, hacemos "leer y luego escribir":
 *   1. Buscamos una fila existente por stripe_subscription_id.
 *   2. Si existe, UPDATE; si no, INSERT.
 * Ambos caminos son seguros de repetir.
 *
 * Devuelve true si hubo cambios efectivos (no es estrictamente necesario, pero
 * resulta util para logs/tests).
 */
export async function upsertUserSubscription(
  supabase: SupabaseAdmin,
  event: EventContext,
  row: {
    userId: string;
    customerId: string | null;
    subscriptionId: string;
    plan: "student" | "premium" | "free";
    status: string;
    /** Periodo real de la suscripcion en Stripe (se lee antes de escribir). */
    periodStartIso?: string | null;
    periodEndIso?: string | null;
  },
): Promise<void> {
  // El periodo solo se escribe si lo traemos: admin_monetization_summary
  // deduce mensual/anual de (current_period_end - current_period_start), y una
  // fila sin periodo contaba siempre como mensual.
  const period: Record<string, string | null> = {};
  if (row.periodStartIso !== undefined) period.current_period_start = row.periodStartIso;
  if (row.periodEndIso !== undefined) period.current_period_end = row.periodEndIso;
  const status = userSubscriptionStatus(row.status);
  const { data: existing, error: selErr } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", row.subscriptionId)
    .maybeSingle();

  // Un fallo de lectura aqui tambien es critico: si no podemos comprobar si ya
  // existe, no podemos garantizar idempotencia, asi que reintentamos.
  if (selErr) {
    console.error(
      `[stripe-webhook] lectura previa fallida op=subscriptions.select event.id=${event.id} msg=${selErr.message}`,
    );
    throw new WebhookCriticalError("No se pudo leer subscriptions para idempotencia", {
      eventId: event.id,
      eventType: event.type,
      op: "subscriptions.select",
    });
  }

  if (existing?.id) {
    await assertWrite(
      event,
      "subscriptions.update",
      await supabase
        .from("subscriptions")
        .update({
          user_id: row.userId,
          stripe_customer_id: row.customerId,
          plan: row.plan,
          status,
          ...period,
        })
        .eq("id", existing.id),
    );
  } else {
    await assertWrite(
      event,
      "subscriptions.insert",
      await supabase.from("subscriptions").insert({
        user_id: row.userId,
        stripe_customer_id: row.customerId,
        stripe_subscription_id: row.subscriptionId,
        plan: row.plan,
        status,
        ...period,
      }),
    );
  }
}

/**
 * Marca como `past_due` la suscripcion de usuario afectada por un
 * invoice.payment_failed (dunning) y deja una notificacion para avisar al
 * usuario de que actualice su tarjeta (M-BIZ-099).
 *
 * Idempotencia:
 *   * El UPDATE de estado es idempotente (poner past_due dos veces = igual).
 *   * La notificacion se inserta SOLO si no existe ya una notificacion de
 *     dunning sin leer para esa misma suscripcion, para que los reintentos de
 *     Stripe (o varios intentos de cobro de la misma factura) no la dupliquen.
 *
 * Nota: usamos type='system' porque el CHECK de `notifications.type` en
 * 001_schema.sql no incluia 'payment'. El correo sale por Resend
 * (sendPaymentFailedEmail), best-effort y con clave de idempotencia.
 */
export async function markUserSubscriptionPastDue(
  supabase: SupabaseAdmin,
  event: EventContext,
  args: { subscriptionId: string; invoiceId: string | null; invoiceUrl?: string | null },
): Promise<void> {
  // 1. Pasar la suscripcion a past_due y recuperar el usuario para notificar.
  const { data: updated, error: updErr } = await supabase
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", args.subscriptionId)
    .select("id, user_id")
    .maybeSingle();

  if (updErr) {
    console.error(
      `[stripe-webhook] no se pudo marcar past_due op=subscriptions.past_due event.id=${event.id} sub=${args.subscriptionId} msg=${updErr.message}`,
    );
    throw new WebhookCriticalError("No se pudo marcar la suscripcion como past_due", {
      eventId: event.id,
      eventType: event.type,
      op: "subscriptions.past_due",
    });
  }

  // Si no hay fila (p. ej. el fallo es de una suscripcion B2B/owner que se
  // maneja en su propio handler, o de una factura sin suscripcion de usuario),
  // no es un error critico: simplemente no hay nada que avisar aqui.
  const userId = (updated as { user_id?: string } | null)?.user_id;
  if (!userId) {
    console.error(
      `[stripe-webhook] invoice.payment_failed sin suscripcion de usuario asociada sub=${args.subscriptionId} event.id=${event.id} (puede ser B2B/owner)`,
    );
    return;
  }

  // 2. Notificar al usuario, sin duplicar en reintentos.
  const { data: prior } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("is_read", false)
    .eq("type", "system")
    .contains("data", { kind: "payment_failed", stripe_subscription_id: args.subscriptionId })
    .limit(1)
    .maybeSingle();

  if (prior?.id) return; // ya hay un aviso pendiente; no duplicar.

  // M-BIZ-099: ademas del aviso en la app, correo con enlace para pagar.
  await sendPaymentFailedEmail(supabase, {
    userId,
    invoiceId: args.invoiceId,
    invoiceUrl: args.invoiceUrl ?? null,
    kind: "user",
  });
  await assertWrite(
    event,
    "notifications.payment_failed",
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "system",
      title: "Pago rechazado",
      body: "No hemos podido cobrar tu suscripcion. Actualiza tu metodo de pago para no perder el acceso.",
      data: {
        kind: "payment_failed",
        stripe_subscription_id: args.subscriptionId,
        invoice_id: args.invoiceId,
      },
    }),
  );
}

/**
 * Estados de Stripe -> CHECK de `subscriptions.status` (001: active, trialing,
 * canceled, past_due, incomplete). Un estado fuera del CHECK hacia fallar la
 * escritura critica y Stripe reintentaba el evento durante dias.
 */
export function userSubscriptionStatus(status: string): string {
  if (["active", "trialing", "canceled", "past_due", "incomplete"].includes(status)) return status;
  if (status === "incomplete_expired") return "canceled";
  // unpaid / paused: ya no se cobra, pero la suscripcion existe.
  return "past_due";
}

/** Igual para `owner_subscriptions.status` (105: incluye unpaid). */
export function ownerSubscriptionStatus(status: string): string {
  if (["incomplete", "active", "past_due", "canceled", "unpaid", "trialing"].includes(status)) return status;
  if (status === "incomplete_expired") return "canceled";
  return "unpaid"; // paused: sin cobro, los pisos no deben seguir visibles.
}

/**
 * Deja una incidencia de cobro en la cola de revision manual (migracion
 * 20260924200000, RPC flag_payment_review, que avisa al equipo la primera vez).
 * NUNCA lanza: se usa justo donde no queremos tumbar el webhook. Si la RPC no
 * existe todavia (migracion sin aplicar) queda al menos el log.
 */
export async function flagPaymentReview(
  supabase: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }> },
  kind: string,
  reference: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  console.error('[payments] revision manual', { kind, reference, detail });
  try {
    const { error } = await supabase.rpc("flag_payment_review", { p_kind: kind, p_reference: reference, p_detail: detail });
    if (error) console.error(`[payments] no se pudo guardar la revision kind=${kind} ref=${reference}: ${error.message ?? "?"}`);
  } catch (err) {
    console.error('[payments] no se pudo guardar la revision', { kind, reference, error: err });
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Correo de impago (past_due) con enlace para pagar la factura y al panel de
 * facturacion, donde esta el boton del portal de Stripe. Best-effort: un fallo
 * enviando no puede tumbar el webhook. La clave de idempotencia evita repetir
 * el correo en los reintentos de Stripe de la MISMA factura.
 */
export async function sendPaymentFailedEmail(
  supabase: SupabaseAdmin,
  args: { userId: string; invoiceId: string | null; invoiceUrl: string | null; kind: "user" | "owner" | "business" },
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", args.userId)
      .maybeSingle();
    const email = (profile as { email?: string | null } | null)?.email;
    if (!email) return;
    const name = (profile as { full_name?: string | null } | null)?.full_name ?? null;
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://franky.es").replace(/\/$/, "");
    const billingUrl = args.kind === "user" ? `${site}/pricing` : `${site}/negocio/dashboard`;
    const what =
      args.kind === "owner"
        ? "tu Plan Propietario"
        : args.kind === "business"
          ? "la suscripción de tu ficha"
          : "tu suscripción";
    const lines = [
      name ? `Hola, ${name}.` : "Hola.",
      `No hemos podido cobrar ${what}. Tu banco ha rechazado el último cargo.`,
      "Para no perder el acceso, actualiza tu método de pago o paga la factura pendiente.",
      ...(args.invoiceUrl ? [`Pagar la factura: ${args.invoiceUrl}`] : []),
      `Gestionar la facturación: ${billingUrl}`,
      "Si ya lo has solucionado, ignora este correo.",
    ];
    const result = await sendEmail({
      to: email,
      subject: "No hemos podido cobrar tu suscripción de Franky",
      text: lines.join("\n\n"),
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;padding:24px">${lines
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("")}</div>`,
      idempotencyKey: `payment-failed/${args.invoiceId ?? args.userId}/${args.userId}`,
      actorUserId: args.userId,
    });
    if (!result.ok) console.error(`[payments] correo de impago no enviado user=${args.userId}: ${result.error}`);
  } catch (err) {
    console.error('[payments] correo de impago fallido', { userId: args.userId, error: err });
  }
}
