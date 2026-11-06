import { isDemoPaymentActor } from '@/lib/payment-demo-guard';
import { assertCustomerOwner } from "@/lib/stripe-customer";
import { rateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabase } from "@/lib/supabase-server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(req: NextRequest) {
  try {
    const rl = await rateLimit(req, { key: "stripe-portal", limit: 10, windowMs: 60_000 });
    if (!rl.ok) return rl.response;
    // createRequestSupabase: la app móvil manda Authorization: Bearer; la web
    // sigue entrando por cookies como siempre.
    const supabase = await createRequestSupabase(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (await isDemoPaymentActor(user.id)) return NextResponse.json({ error: 'Esta cuenta es de demostración. Los servicios de cobro reales están desactivados.' }, { status: 403 });

    if (req.headers.get('X-Franky-Client') === 'native') return NextResponse.json({ error: 'Portal no disponible desde la app.' }, { status: 403 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: "Sin cliente de Stripe" }, { status: 404 });
    }

    const stripe = getStripe();
    await assertCustomerOwner(stripe, profile.stripe_customer_id, user.id);
    // Configuración fija del portal (STRIPE_PORTAL_CONFIGURATION_ID): la de
    // Franky NO permite cambiar de plan desde el portal (los cambios de plan
    // pasan por nuestro checkout, que valida precios, prueba y duplicados).
    // Sin la variable, Stripe usa la configuración por defecto de la cuenta,
    // que puede permitirlo: se deja aviso en el log.
    const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
    if (!configuration) console.warn("[stripe-portal] STRIPE_PORTAL_CONFIGURATION_ID no configurado; se usa la configuración por defecto del portal.");
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${req.nextUrl.origin}/negocio/dashboard`,
      ...(configuration ? { configuration } : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe portal error:", error);
    return NextResponse.json({ error: "Error al abrir el portal" }, { status: 500 });
  }
}
