import { isDemoPaymentActor } from '@/lib/payment-demo-guard';
import { assertCustomerOwner } from "@/lib/stripe-customer";
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Facturas del usuario autenticado, leídas de Stripe: suscripciones (plan de
 * negocio / Plan Propietario / Pro-Premium) y compras con factura (entradas,
 * invoice_creation). Acepta cookies (web) o Authorization: Bearer (app móvil,
 * pantalla "Mis facturas"). Solo lectura: los PDF y el hosted_invoice_url los
 * sirve Stripe directamente.
 */
export type InvoiceSummary = {
  id: string;
  number: string | null;
  created: number; // epoch seconds
  total_cents: number;
  currency: string;
  status: string | null;
  description: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};

export async function GET(req: NextRequest) {
  try {
    // Cada request dispara hasta 3 listados contra la API de Stripe: frena los
    // refrescos en bucle antes de gastar cuota del tercero.
    const rl = await rateLimit(req, { key: "stripe-invoices", limit: 20, windowMs: 60_000 });
    if (!rl.ok) return rl.response;

    const supabase = await createRequestSupabase(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    if (await isDemoPaymentActor(user.id)) return NextResponse.json({ error: 'Esta cuenta es de demostración. Los servicios de cobro reales están desactivados.' }, { status: 403 });

    // Todos los flujos de checkout comparten profiles.stripe_customer_id, pero
    // recogemos también los customer de las tablas de suscripción por si algún
    // alta antigua creó un customer separado. Dedupe y tope defensivo de 3.
    const admin = createAdminSupabase();
    const ids = new Set<string>();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.stripe_customer_id) ids.add(profile.stripe_customer_id);

    const [{ data: bizSubs, error: bizError }, { data: ownerSubs, error: ownerError }] = await Promise.all([
      admin.from("business_subscriptions").select("stripe_customer_id").eq("owner_id", user.id),
      admin.from("owner_subscriptions").select("stripe_customer_id").eq("owner_id", user.id),
    ]);
    if (bizError || ownerError) throw new Error("billing_history_unavailable");
    for (const row of [...(bizSubs ?? []), ...(ownerSubs ?? [])]) {
      if (row.stripe_customer_id) ids.add(row.stripe_customer_id);
    }

    const customers = [...ids].slice(0, 3);
    if (customers.length === 0) return NextResponse.json({ invoices: [] });

    const stripe = getStripe();
    const lists = await Promise.all(
      customers.map(async (customer) => {
        await assertCustomerOwner(stripe, customer, user.id);
        return (await stripe.invoices.list({ customer, limit: 24 })).data;
      })
    );

    const invoices: InvoiceSummary[] = lists
      .flat()
      // Borradores fuera: solo facturas emitidas (pagadas, abiertas o anuladas).
      .filter((inv) => inv.status !== "draft")
      .map((inv) => ({
        id: inv.id ?? "",
        number: inv.number ?? null,
        created: inv.created,
        total_cents: inv.total,
        currency: inv.currency,
        status: inv.status ?? null,
        description: inv.lines?.data?.[0]?.description ?? inv.description ?? null,
        hosted_invoice_url: req.headers.get('X-Franky-Client') === 'native' ? null : inv.hosted_invoice_url ?? null,
        invoice_pdf: inv.invoice_pdf ?? null,
      }))
      .sort((a, b) => b.created - a.created);

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("[stripe/invoices] error:", error);
    return NextResponse.json({ error: "Error al cargar las facturas" }, { status: 500 });
  }
}
