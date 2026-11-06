"use client";

import * as React from "react";
import { proWebPrice } from "../../../../../shared/pro/web-pricing";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSession } from "@/components/SessionProvider";
import {
  PRO_VERTICALS,
  VERTICAL_ORDER,
  demoSpaceId,
} from "@/lib/pro/verticals";
import type { ProVerticalId } from "@/lib/pro/types";
import { PRO_CONTACT } from "@/lib/pro/contact";
import { FormField, inputClass } from "@/components/pro/kit";
import { money } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import { trackFire } from "@/lib/analytics";
import { withNext } from "@/lib/safe-next";
import { SECTOR_SITES } from "@/lib/sector-sites/catalog";

type Step = "sector" | "cuenta" | "datos" | "plan";
type Interval = "month" | "year";

export default function StartFlow({
  initialVertical = null,
  attribution = [],
}: {
  initialVertical?: ProVerticalId | null;
  attribution?: string[];
}) {
  const { user, loading } = useSession();
  const [step, setStep] = React.useState<Step>(
    initialVertical ? "datos" : "sector",
  );
  const [vertical, setVertical] = React.useState<ProVerticalId | null>(
    initialVertical,
  );
  const [business, setBusiness] = React.useState("");
  const [city, setCity] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [interval, setInterval] = React.useState<Interval>("month");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const request = React.useRef<{ body: string; key: string } | null>(null);
  const v = vertical ? PRO_VERTICALS[vertical] : null;
  const webPrice = vertical ? proWebPrice(vertical) : null;
  const currentStep =
    step !== "sector" && !user ? "cuenta" : step === "cuenta" ? "datos" : step;
  const valid =
    business.trim().length >= 2 &&
    city.trim().length >= 2 &&
    address.trim().length >= 3 &&
    phone.replace(/\D/g, "").length >= 9;
  const nextParams = new URLSearchParams(vertical ? { sector: vertical } : {});
  for (const entry of attribution) {
    const [key, value] = entry.split(": ");
    if (key.startsWith("utm_") && value) nextParams.set(key, value);
    if (key === "Página de origen" && value) nextParams.set("origen", value);
  }
  const returnHref = `/pro/empezar?${nextParams.toString()}`;

  async function startCheckout() {
    if (!v || !user || !valid || sending) return;
    setSending(true);
    setError(null);
    const body = JSON.stringify({
      sector: v.id,
      name: business.trim(),
      city: city.trim(),
      address: address.trim(),
      phone: phone.trim(),
      interval,
      attribution,
    });
    // La clave sobrevive a un reintento de red sin crear otro negocio o cobro.
    const storageKey = `franky-pro-onboarding:${user.id}:${v.id}`;
    if (!request.current) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        if (saved?.body === body && typeof saved?.key === "string")
          request.current = saved;
      } catch {
        /* La memoria mantiene el reintento si el navegador bloquea el almacenamiento. */
      }
    }
    if (request.current?.body !== body)
      request.current = { body, key: crypto.randomUUID() };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request.current));
    } catch {
      /* Se conserva en esta visita. */
    }
    try {
      const response = await fetch("/api/pro/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...JSON.parse(body),
          requestKey: request.current.key,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          result.error ?? "No hemos podido continuar. Vuelve a intentarlo.",
        );
      if (!result.workspaceId)
        throw new Error(
          "No hemos podido preparar tu espacio. Vuelve a intentarlo.",
        );
      trackFire("cta_clicked", {
        surface: "sector_site",
        action: "checkout_started",
        vertical: v.id,
      });
      if (result.status === "checkout" && result.url) {
        const target = new URL(result.url);
        if (
          target.protocol !== "https:" ||
          target.hostname !== "checkout.stripe.com"
        ) {
          throw new Error(
            "No hemos podido abrir el pago. Vuelve a intentarlo.",
          );
        }
        window.location.assign(target.href);
      } else {
        window.location.assign(
          `/pro/activar?workspace=${encodeURIComponent(result.workspaceId)}&order=${encodeURIComponent(result.orderId ?? "")}`,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No hemos podido continuar. Vuelve a intentarlo.",
      );
      setSending(false);
    }
  }

  return (
    <div className="min-h-dvh bg-bg-secondary/50">
      <header className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/pro"
          className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight"
        >
          <img src="/img/franky-icon.png" alt="" width={26} height={26} />
          Franky <span className="text-violet">Pro</span>
        </Link>
        <span className="text-sm text-text-muted">7 días gratis</span>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6">
        <ol
          aria-label="Pasos del alta"
          className="mb-8 grid grid-cols-4 gap-2 text-xs sm:text-sm"
        >
          {(["sector", "cuenta", "datos", "plan"] as const).map(
            (item, index) => (
              <li
                key={item}
                aria-current={currentStep === item ? "step" : undefined}
                className={cn(
                  "border-t-2 pt-3",
                  currentStep === item
                    ? "border-violet font-semibold text-text-primary"
                    : "border-border text-text-muted",
                )}
              >
                {index + 1}.{" "}
                {
                  {
                    sector: "Sector",
                    cuenta: "Cuenta",
                    datos: "Negocio",
                    plan: "Plan",
                  }[item]
                }
              </li>
            ),
          )}
        </ol>
        {currentStep === "sector" ? (
          <section className="animate-page-in">
            <p className="eyebrow">Empieza con Franky</p>
            <h1 className="mt-2 font-heading text-fluid-h1 font-extrabold">
              ¿Qué tipo de negocio tienes?
            </h1>
            <p className="mt-3 text-text-muted">
              Elige tu sector. Después preparas tu negocio y eliges tu plan.
            </p>
            <ul className="mt-8 grid gap-2.5 sm:grid-cols-2">
              {VERTICAL_ORDER.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={vertical === id}
                    onClick={() => setVertical(id)}
                    className={cn(
                      "flex min-h-20 w-full items-start gap-3 rounded-2xl border bg-bg-primary p-4 text-left transition-colors",
                      vertical === id
                        ? "border-violet ring-2 ring-violet/20"
                        : "border-border hover:border-text-primary/20",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        vertical === id
                          ? "border-violet bg-violet text-white"
                          : "border-border",
                      )}
                    >
                      {vertical === id ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {PRO_VERTICALS[id].label}
                      </span>
                      <span className="mt-1 block text-sm text-text-muted">
                        {
                          SECTOR_SITES.find((site) => site.vertical === id)
                            ?.description
                        }
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Button
              className="mt-6 w-full sm:w-auto"
              variant="dark"
              size="lg"
              disabled={!v}
              onClick={() => setStep("datos")}
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </Button>
          </section>
        ) : loading ? (
          <section
            aria-label="Comprobando tu cuenta"
            aria-busy="true"
            className="mx-auto max-w-xl space-y-4"
          >
            <div className="h-10 w-2/3 rounded-xl skeleton-shimmer" />
            <div className="h-64 rounded-2xl skeleton-shimmer" />
          </section>
        ) : currentStep === "cuenta" ? (
          <section className="mx-auto max-w-xl animate-page-in">
            <p className="eyebrow">{v?.label}</p>
            <h1 className="mt-3 font-heading text-fluid-h2 font-extrabold">
              Tu negocio empieza aquí
            </h1>
            <p className="mt-3 text-text-muted">
              Crea una cuenta de Franky o entra con la que ya tienes. Después
              solo necesitamos cuatro datos de tu negocio.
            </p>
            <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-6">
              <Link
                href={withNext("/registro", returnHref)}
                className={buttonVariants({ variant: "dark", size: "lg" })}
              >
                Crear cuenta <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={withNext("/login", returnHref)}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Ya tengo cuenta
              </Link>
              <p className="mt-1 text-center text-sm text-text-muted">
                Usa tu correo o las opciones de acceso disponibles en tu
                dispositivo.
              </p>
            </div>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => setStep("sector")}
            >
              <ArrowLeft className="h-4 w-4" /> Cambiar de sector
            </Button>
          </section>
        ) : currentStep === "datos" && v ? (
          <section className="mx-auto max-w-xl animate-page-in">
            <p className="eyebrow">{v.label}</p>
            <h1 className="mt-3 font-heading text-fluid-h2 font-extrabold">
              Vamos a preparar {v.noun}
            </h1>
            <p className="mt-3 text-text-muted">
              Estos datos aparecerán en tu ficha de Franky. El horario, los
              servicios y el equipo se añaden dentro.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) setStep("plan");
              }}
              className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-6"
            >
              <FormField label="Nombre del negocio" htmlFor="st-business">
                <input
                  id="st-business"
                  className={inputClass}
                  autoComplete="organization"
                  maxLength={120}
                  required
                  value={business}
                  onChange={(event) => setBusiness(event.target.value)}
                />
              </FormField>
              <FormField label="Ciudad" htmlFor="st-city">
                <input
                  id="st-city"
                  className={inputClass}
                  autoComplete="address-level2"
                  maxLength={100}
                  required
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
              </FormField>
              <FormField label="Dirección" htmlFor="st-address">
                <input
                  id="st-address"
                  className={inputClass}
                  autoComplete="street-address"
                  maxLength={200}
                  required
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </FormField>
              <FormField label="Teléfono" htmlFor="st-phone">
                <input
                  id="st-phone"
                  className={inputClass}
                  type="tel"
                  autoComplete="tel"
                  maxLength={25}
                  required
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </FormField>
              <Button type="submit" variant="dark" size="lg" disabled={!valid}>
                Elegir mi plan <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => setStep("sector")}
            >
              <ArrowLeft className="h-4 w-4" /> Cambiar de sector
            </Button>
          </section>
        ) : currentStep === "plan" && v ? (
          <section className="mx-auto max-w-xl animate-page-in">
            <p className="eyebrow">{business}</p>
            <h1 className="mt-3 font-heading text-fluid-h2 font-extrabold">
              Tu primera semana, gratis
            </h1>
            <p className="mt-3 text-text-muted">
              Elige cómo quieres pagar después. Tu guía y tu ficha de reservas
              estarán listas al terminar.
            </p>
            <fieldset className="mt-8 grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Periodo del plan</legend>
              {(["month", "year"] as const).map((period) => (
                <label
                  key={period}
                  className={cn(
                    "cursor-pointer rounded-2xl border bg-bg-primary p-5 shadow-card",
                    interval === period
                      ? "border-violet ring-2 ring-violet/20"
                      : "border-border",
                  )}
                >
                  <span className="flex items-center justify-between gap-4 font-semibold">
                    {period === "month" ? "Mensual" : "Anual"}
                    <input
                      type="radio"
                      name="interval"
                      value={period}
                      checked={interval === period}
                      onChange={() => setInterval(period)}
                      className="h-4 w-4 accent-violet"
                    />
                  </span>
                  <span className="mt-4 block font-heading text-3xl font-bold tabular">
                    {money(
                      (period === "month" ? webPrice!.monthly : webPrice!.annual) *
                        100,
                      { round: true },
                    )}
                  </span>
                  <span className="text-sm text-text-muted">
                    {period === "month" ? "al mes" : "al año"}
                  </span>
                </label>
              ))}
            </fieldset>
            {webPrice?.offerLabel ? (
              <p className="mt-3 text-sm font-semibold text-violet">
                {webPrice.offerLabel}. Precios + IVA
              </p>
            ) : null}
            {v.price.note ? (
              <p className="mt-3 text-sm text-text-muted">{v.price.note}</p>
            ) : null}
            <ul className="my-6 space-y-3 text-sm text-text-secondary">
              {[
                "7 días para probar todas las herramientas",
                "Tu ficha pública con enlace para compartir",
                "Gestiona tu plan y tus facturas desde Ajustes",
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <Check className="h-4 w-4 shrink-0 text-violet" />
                  {line}
                </li>
              ))}
            </ul>
            {error ? (
              <p role="alert" className="mb-4 text-sm font-semibold text-error">
                {error}
              </p>
            ) : null}
            <Button
              variant="dark"
              size="lg"
              className="w-full"
              loading={sending}
              disabled={sending}
              onClick={() => void startCheckout()}
            >
              Empieza gratis 7 días <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="mt-3 text-center text-xs text-text-muted">
              Revisa el importe final y añade tu forma de pago en el siguiente
              paso.
            </p>
            <Button
              variant="ghost"
              className="mt-4"
              disabled={sending}
              onClick={() => setStep("datos")}
            >
              <ArrowLeft className="h-4 w-4" /> Editar datos del negocio
            </Button>
          </section>
        ) : null}
        <footer className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-x-5 gap-y-3 border-t border-border pt-6 text-sm text-text-muted">
          <a
            href={PRO_CONTACT.whatsappHref(
              "Hola, tengo una duda sobre el alta de Franky Pro",
            )}
            className="inline-flex min-h-10 items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" /> ¿Dudas? Escríbenos por
            WhatsApp
          </a>
          {v ? (
            <Link
              href={`/pro/${demoSpaceId(v.id)}`}
              className="inline-flex min-h-10 items-center"
            >
              Probar la demo
            </Link>
          ) : null}
        </footer>
      </main>
    </div>
  );
}
