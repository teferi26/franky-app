import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Ticket, Wallet } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase-server";
import PayoutsCard from "@/components/PayoutsCard";
import { Reveal } from "@/components/motion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cobros",
  description: "Activa tu cuenta de cobros para recibir el dinero de tus ventas en Franky.",
  robots: { index: false, follow: false },
};

/**
 * Cobros para CUALQUIER usuario que venda algo en Franky (entradas de eventos,
 * visitas, alquiler…).
 *
 * Por qué existe: el alta de cobros solo se podía empezar desde el panel de
 * propietario (cerrado por rol en el middleware) o desde la ficha de un evento
 * de pago YA publicado. Un estudiante que quería vender entradas se topaba con
 * un aparente círculo vicioso ("necesito cuenta de cobros para vender, pero solo
 * puedo crearla después de publicar el evento"). Esta página rompe el círculo:
 * se puede activar antes, durante o después, y desde cualquier sitio.
 */
export default async function CobrosPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/cobros");

  // RLS: connect_accounts_select_own deja al usuario leer su propia fila.
  const { data: account } = await supabase
    .from("connect_accounts")
    .select("charges_enabled, onboarding_status")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera tipográfica (v3): sin banda de color ni icono en cuadrado. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Reveal>
            <p className="eyebrow">Cobros</p>
            <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
              Recibe el dinero de lo que vendas en Franky
            </h1>
            <p className="mt-3 max-w-xl text-text-muted">
              Entradas de eventos, visitas de pago o alquiler: una sola cuenta de
              cobros, gestionada por Stripe, para todo.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Reveal>
          <PayoutsCard account={account ?? null} returnTo="/cobros?onboarded=1" />
        </Reveal>

        <Reveal delay={80}>
          <h2 className="font-heading text-xl font-bold text-text-primary sm:text-2xl">
            ¿Para qué la necesitas?
          </h2>
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-text-secondary">
            Si vendes entradas de un evento, el asistente paga con tarjeta, Apple
            Pay o Google Pay dentro de Franky y el dinero va a tu cuenta. Puedes
            activarla <strong className="text-text-primary">antes</strong> de crear
            el evento o después de publicarlo: mientras no esté activa, tu evento
            se ve pero nadie puede comprar entradas. Lo mismo sirve para las
            visitas de pago y el alquiler si publicas pisos.
          </p>

          <dl className="mt-6 divide-y divide-border-light border-y border-border-light">
            <div className="flex items-start gap-4 py-4">
              <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-violet" strokeWidth={1.75} />
              <div>
                <dt className="font-semibold text-text-primary">Entradas y reservas</dt>
                <dd className="mt-1 text-sm text-text-muted">
                  El comprador paga en dos toques sin salir de la app y tú recibes
                  el neto que fijaste.
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-4 py-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet" strokeWidth={1.75} />
              <div>
                <dt className="font-semibold text-text-primary">Datos bancarios seguros</dt>
                <dd className="mt-1 text-sm text-text-muted">
                  Los gestiona Stripe, no Franky: nosotros nunca vemos ni guardamos
                  tu IBAN ni tus tarjetas.
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-4 py-4">
              <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-violet" strokeWidth={1.75} />
              <div>
                <dt className="font-semibold text-text-primary">Todo en tu Cartera</dt>
                <dd className="mt-1 text-sm text-text-muted">
                  Tus ingresos y el desglose de cada venta los ves en la Cartera de
                  la app, y las fechas de ingreso en tu panel de Stripe.
                </dd>
              </div>
            </div>
          </dl>

          <p className="mt-6 text-sm text-text-muted">
            ¿Quieres crear un evento?{" "}
            <Link
              href="/eventos/crear"
              className="group inline-flex items-center gap-1 font-semibold text-text-primary link-underline"
            >
              Publica tu evento
              <ArrowRight className="h-4 w-4 arrow-nudge" strokeWidth={1.75} />
            </Link>
          </p>
        </Reveal>
      </div>
    </div>
  );
}
