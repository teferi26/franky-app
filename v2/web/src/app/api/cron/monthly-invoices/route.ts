import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { monthlyInvoicesEmail, type InvoiceEmailItem } from "@/lib/email-templates";
import { formatEur } from "@/lib/pricing";

/**
 * Cron mensual (vercel.json: día 2 a las 09:00 UTC): envía a cada propietario
 * o negocio con plan activo el resumen de sus facturas de Stripe del último
 * mes, con enlace seguro para ver cada una y descargar el PDF.
 *
 * Auth: Vercel invoca el cron con Authorization: Bearer <CRON_SECRET>.
 * Sin CRON_SECRET configurado el endpoint queda inactivo (fail closed).
 */
export const maxDuration = 60;

function secretMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Estados de suscripción que siguen facturando (past_due incluido: la factura
// existe aunque el cobro haya fallado, y verla ayuda a regularizar).
const BILLABLE = ["active", "past_due", "trialing"];

export async function GET(req: NextRequest) {
  const env = getServerEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!secretMatches(req.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabase();

  // 1. Titulares con plan que factura: negocio por ficha + Plan Propietario.
  const [{ data: bizSubs }, { data: ownerSubs }] = await Promise.all([
    admin
      .from("business_subscriptions")
      .select("owner_id, stripe_customer_id, status")
      .in("status", BILLABLE),
    admin
      .from("owner_subscriptions")
      .select("owner_id, stripe_customer_id, status")
      .in("status", BILLABLE),
  ]);

  const customersByOwner = new Map<string, Set<string>>();
  for (const row of [...(bizSubs ?? []), ...(ownerSubs ?? [])]) {
    if (!row.owner_id || !row.stripe_customer_id) continue;
    const set = customersByOwner.get(row.owner_id) ?? new Set<string>();
    set.add(row.stripe_customer_id);
    customersByOwner.set(row.owner_id, set);
  }
  if (customersByOwner.size === 0) {
    return NextResponse.json({ owners: 0, sent: 0 });
  }

  // 2. Email y nombre de cada titular.
  const ownerIds = [...customersByOwner.keys()];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ownerIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  // 3. Facturas de Stripe emitidas en los últimos ~32 días (cubre el mes
  //    anterior completo aunque el cron corra el día 2).
  const sinceEpoch = Math.floor(Date.now() / 1000) - 32 * 24 * 3600;
  const monthLabel = new Date(Date.now() - 15 * 24 * 3600 * 1000).toLocaleDateString(
    "es-ES",
    { month: "long", year: "numeric" }
  );

  const stripe = getStripe();
  const origin = req.nextUrl.origin;
  let sent = 0;
  const errors: string[] = [];

  for (const [ownerId, customerIds] of customersByOwner) {
    const profile = profileById.get(ownerId);
    if (!profile?.email) continue;

    try {
      const lists = await Promise.all(
        [...customerIds].slice(0, 3).map((customer) =>
          stripe.invoices
            .list({ customer, created: { gte: sinceEpoch }, limit: 20 })
            .then((r) => r.data)
            .catch(() => [])
        )
      );
      const invoices: InvoiceEmailItem[] = lists
        .flat()
        .filter((inv) => inv.status === "paid" || inv.status === "open")
        .sort((a, b) => b.created - a.created)
        .map((inv) => ({
          number: inv.number ?? null,
          amountLabel: formatEur(inv.total / 100),
          dateLabel: new Date(inv.created * 1000).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          description: inv.lines?.data?.[0]?.description ?? inv.description ?? null,
          url: inv.hosted_invoice_url ?? null,
        }));
      if (invoices.length === 0) continue;

      const content = monthlyInvoicesEmail({
        name: profile.full_name ?? null,
        monthLabel,
        invoices,
        invoicesUrl: `${origin}/negocio/dashboard`,
        prefsUrl: `${origin}/notificaciones`,
      });
      // Clave de idempotencia: si Vercel reintenta el cron el mismo día, el
      // titular no recibe el resumen dos veces.
      const result = await sendEmail({ to: profile.email, ...content, actorUserId: ownerId, idempotencyKey: `monthly-invoices/${ownerId}/${sinceEpoch - (sinceEpoch % 86400)}` });
      if (result.ok) sent++;
      else errors.push(`${ownerId}: ${result.error}`);
    } catch (e) {
      errors.push(`${ownerId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // El detalle de errores va al log del servidor; la respuesta JSON (visible
  // en el dashboard de crons de Vercel) solo lleva conteos.
  if (errors.length) console.error("[cron/monthly-invoices] fallos:", errors);
  return NextResponse.json({ owners: customersByOwner.size, sent, failed: errors.length });
}
