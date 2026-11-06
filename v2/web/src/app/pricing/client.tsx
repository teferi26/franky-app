"use client";

import { useState } from "react";
import { Check, Minus, ArrowRight, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Reveal, RevealItem } from "@/components/motion";
import { cn } from "@/lib/utils";
import { PRICING, formatEur } from "@/lib/pricing";
import { safeStripeUrl } from '../../../../shared/payment-contract';

const plans = [
  {
    id: "free",
    name: "Gratis",
    description: "Para explorar",
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      { label: "Buscar carreras y universidades", included: true },
      { label: "Notas de corte actualizadas", included: true },
      { label: "Test vocacional RIASEC", included: true },
      { label: "Noticias y eventos", included: true },
      { label: "Filtro de becas básico", included: true },
      { label: "RoomieMatch IA", included: false },
      { label: "Alertas de becas", included: false },
      { label: "Chat ilimitado", included: false },
      { label: "Comparador avanzado", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Para estudiantes",
    priceMonthly: PRICING.pro.monthly,
    priceYearly: PRICING.pro.yearly,
    popular: true,
    features: [
      { label: "Todo lo del plan Gratis", included: true },
      { label: "RoomieMatch con IA", included: true },
      { label: "Alertas de becas personalizadas", included: true },
      { label: "Chat ilimitado", included: true },
      { label: "Comparador avanzado de carreras", included: true },
      { label: "Filtros premium de alojamiento", included: true },
      { label: "Soporte prioritario", included: false },
      { label: "Asesoramiento personalizado", included: false },
      { label: "API acceso", included: false },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    description: "Experiencia completa",
    priceMonthly: PRICING.premium.monthly,
    priceYearly: PRICING.premium.yearly,
    features: [
      { label: "Todo lo del plan Pro", included: true },
      { label: "Asesoramiento personalizado", included: true },
      { label: "Acceso anticipado a funciones", included: true },
      { label: "Badge verificado en perfil", included: true },
    ],
  },
];

const faqs = [
  {
    q: "¿Puedo cancelar en cualquier momento?",
    a: "Sí, puedes cancelar tu suscripción cuando quieras. Seguirás teniendo acceso hasta que termine el período pagado.",
  },
  {
    q: "¿Hay descuento para estudiantes?",
    a: "El plan Pro ya está pensado con precio de estudiante. Además, con el pago anual ahorras un 33%.",
  },
  {
    q: "¿Qué métodos de pago aceptáis?",
    a: "Aceptamos tarjeta de crédito/débito, Google Pay y Apple Pay a través de Stripe.",
  },
  {
    q: "¿Puedo cambiar de plan?",
    a: "Sí. Cancela tu plan actual desde tu cuenta y, cuando termine el período pagado, contrata el plan que prefieras.",
  },
];

export default function PricingClient() {
  const { user } = useAuth();
  const [annual, setAnnual] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      window.location.href = "/login?next=%2Fpricing";
      return;
    }

    if (planId === "free") return;

    setLoadingPlan(planId);
    setCheckoutError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "subscription",
          planId,
          interval: annual ? "year" : "month",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCheckoutError(
          typeof data?.error === "string"
            ? data.error
            : "No se ha podido iniciar el pago. Inténtalo de nuevo."
        );
        return;
      }
      const checkoutUrl = safeStripeUrl(data?.url);
      if (checkoutUrl) window.location.href = checkoutUrl;
      else setCheckoutError("No se ha podido abrir el pago. Inténtalo de nuevo.");
    } catch {
      setCheckoutError("No se ha podido iniciar el pago. Inténtalo de nuevo.");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Planes y precios</p>
            <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold text-text-primary">
              Elige tu plan de Franky
            </h1>
            <p className="mt-4 max-w-xl text-fluid-lead text-text-muted">
              Desde gratis hasta premium. Accede a herramientas avanzadas que te
              ayudarán en tu camino universitario.
            </p>
          </Reveal>

          {/* Periodo de facturación: control segmentado neutro. */}
          <Reveal delay={80} className="mt-8 flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Periodo de facturación" className="inline-flex items-center rounded-xl bg-bg-secondary p-1">
              <button
                type="button"
                onClick={() => setAnnual(false)}
                aria-pressed={!annual}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 ease-[var(--ease-out-quart)] cursor-pointer",
                  !annual
                    ? "bg-bg-primary font-semibold text-text-primary shadow-[0_1px_2px_rgba(18,16,25,0.08),0_0_0_1px_rgba(18,16,25,0.04)]"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setAnnual(true)}
                aria-pressed={annual}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 ease-[var(--ease-out-quart)] cursor-pointer",
                  annual
                    ? "bg-bg-primary font-semibold text-text-primary shadow-[0_1px_2px_rgba(18,16,25,0.08),0_0_0_1px_rgba(18,16,25,0.04)]"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                Anual
              </button>
            </div>
            <span
              className={cn(
                "text-sm font-medium text-violet transition-opacity duration-200",
                annual ? "opacity-100" : "opacity-0"
              )}
              aria-hidden={!annual}
            >
              Ahorras un 33 %
            </span>
          </Reveal>
        </div>
      </section>

      {/* Planes */}
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <Reveal stagger className="grid gap-5 md:grid-cols-3 md:items-stretch">
          {plans.map((plan, i) => {
            const price = annual ? plan.priceYearly : plan.priceMonthly;
            const monthlyEquivalent = formatEur(annual ? plan.priceYearly / 12 : plan.priceMonthly);
            const busy = loadingPlan === plan.id;

            return (
              <RevealItem key={plan.id} index={i} asChild>
                <article
                  className={cn(
                    "relative flex h-full flex-col rounded-3xl border bg-bg-primary p-7 shadow-card hover-lift sm:p-8",
                    plan.popular ? "border-violet ring-1 ring-violet" : "border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary">{plan.name}</h2>
                      <p className="mt-1 text-sm text-text-muted">{plan.description}</p>
                    </div>
                    {plan.popular && (
                      <span className="rounded-full bg-violet px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                        Recomendado
                      </span>
                    )}
                  </div>

                  <div className="mt-7 border-t border-border pt-6">
                    {price === 0 ? (
                      <p className="font-heading text-5xl font-extrabold tracking-tight text-text-primary">Gratis</p>
                    ) : (
                      <>
                        <p className="flex items-baseline gap-1.5">
                          <span className="tabular font-heading text-5xl font-extrabold tracking-tight text-text-primary">
                            {monthlyEquivalent}
                          </span>
                          <span className="text-sm text-text-muted">/mes</span>
                        </p>
                        <p
                          className={cn(
                            "tabular mt-1.5 text-xs text-text-muted transition-opacity duration-200",
                            annual ? "opacity-100" : "opacity-0"
                          )}
                          aria-hidden={!annual}
                        >
                          {formatEur(price)} facturado anualmente
                        </p>
                      </>
                    )}
                  </div>

                  <ul className="mt-7 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f.label} className="flex items-start gap-3 text-sm">
                        {f.included ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
                        ) : (
                          <Minus className="mt-0.5 h-4 w-4 shrink-0 text-text-muted/50" aria-hidden="true" />
                        )}
                        <span className={f.included ? "text-text-secondary" : "text-text-muted line-through decoration-text-muted/50"}>{f.label}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => handleSubscribe(plan.id)}
                    variant={plan.popular ? "default" : plan.id === "premium" ? "dark" : "outline"}
                    size="lg"
                    className="group mt-8 w-full"
                    loading={busy}
                    disabled={busy}
                  >
                    {busy ? (
                      "Procesando..."
                    ) : plan.id === "free" ? (
                      "Plan actual"
                    ) : (
                      <>
                        Empezar {plan.name}
                        <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </article>
              </RevealItem>
            );
          })}
        </Reveal>

        {checkoutError && (
          <p className="mt-6 text-center text-sm font-medium text-error animate-fade-in" role="alert">
            {checkoutError}
          </p>
        )}

        {/* Confianza */}
        <Reveal className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-text-muted">
          <span className="flex items-center gap-2">
            <Shield className="h-4 w-4" aria-hidden="true" />
            Pagos seguros con Stripe
          </span>
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4" aria-hidden="true" />
            Cancela cuando quieras
          </span>
        </Reveal>

        {/* Preguntas frecuentes */}
        <Reveal className="mx-auto mt-24 max-w-3xl">
          <p className="eyebrow">Dudas habituales</p>
          <h2 className="mt-3 font-heading text-fluid-h2 font-extrabold text-text-primary">Preguntas frecuentes</h2>
          <dl className="mt-8 divide-y divide-border border-y border-border">
            {faqs.map((faq, i) => (
              <div
                key={faq.q}
                className="grid gap-2 py-6 animate-list-in md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8"
                style={{ "--i": i } as React.CSSProperties}
              >
                <dt className="font-heading text-base font-semibold text-text-primary">{faq.q}</dt>
                <dd className="text-[15px] leading-relaxed text-text-secondary">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </div>
  );
}
