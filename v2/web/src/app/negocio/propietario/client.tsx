"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, AlertCircle, Check, CheckCircle2, CreditCard,
  Home, Shield, Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal, Magnetic } from "@/components/motion";
import { OWNER_PLAN, formatEur } from "@/lib/pricing";
import { HousingOfferConsent, HousingOfferStatus } from "../components/housing-offer";
import { HOUSING_OFFER_VERSION } from "@/lib/housing-offer";
import { cn } from "@/lib/utils";

interface OwnerStatus {
  authenticated: boolean;
  active: boolean;
  status: string | null;
  billing: string | null;
  listingsUsed: number;
  maxListings: number;
  periodEnd: string | null;
  /**
   * false si este propietario ya disfrutó la prueba (es una por cuenta).
   * Opcional a propósito: el endpoint no lo devuelve cuando no hay sesión.
   */
  trialAvailable?: boolean;
}

const FEATURES = [
  `Publica hasta ${OWNER_PLAN.maxListings} pisos sin pagar por anuncio`,
  "Tus pisos se publican al instante, sin pasar por la pasarela de pago",
  "Galería con fotos y vídeos de cada piso",
  "Indica tu % de comisión como inmobiliaria si quieres",
  "Panel para gestionar tus anuncios y tu facturación",
  "Sin permanencia: cancela cuando quieras",
];

export default function PropietarioPlanClient({ canceled, deferredHousingEnabled = false, deferredHousingReady = false }: { canceled: boolean; deferredHousingEnabled?: boolean; deferredHousingReady?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<OwnerStatus | null>(null);
  const [billing, setBilling] = useState<"monthly" | "quarterly">("monthly");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(
    canceled ? "El pago fue cancelado. Puedes intentarlo de nuevo." : null
  );

  useEffect(() => {
    fetch("/api/negocio/owner-status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [user]);

  const subscribe = async () => {
    if (deferredHousingEnabled && !accepted) return;
    if (!user) {
      window.location.href = "/login?next=%2Fnegocio%2Fpropietario";
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "owner", billing, ...(deferredHousingEnabled ? { offerVersion: HOUSING_OFFER_VERSION } : {}) }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || "No se pudo iniciar el pago");
        setSubmitting(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Error inesperado. Inténtalo de nuevo.");
      setSubmitting(false);
    }
  };

  const openPortal = async () => {
    setOpening(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setOpening(false);
    }
  };

  const quarterFull = OWNER_PLAN.monthly * OWNER_PLAN.introMonths; // 240
  const isActive = !!status?.active;
  // Nuevas altas: espera sin plazo. Los contratos anteriores conservan su fecha.
  const conPrueba = deferredHousingEnabled || status?.trialAvailable === true;
  const waitingInterest = deferredHousingReady && status?.status === "trialing" && !status.periodEnd;
  const enPrueba = status?.status === "trialing";

  const importe =
    billing === "quarterly"
      ? `${formatEur(OWNER_PLAN.introQuarterTotal, { decimals: 0 })}/trimestre`
      : `${formatEur(OWNER_PLAN.monthly, { decimals: 0 })}/mes`;

  return (
    <div className="bg-bg-primary">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <Reveal variant="fade">
          <Link
            href="/negocio"
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Volver
          </Link>

          <p className="eyebrow mt-6">Para inmobiliarias y gestores de pisos</p>
          <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
            Plan Inmobiliarias.
          </h1>
          <p className="mt-3 max-w-xl text-text-muted">
            {conPrueba && (
              <>
                Empieza con <strong className="text-text-primary">{deferredHousingEnabled ? "publicación gratis hasta tu primer interesado" : "7 días de prueba gratis"}</strong>. Después,{" "}
              </>
            )}
            una sola cuota de <strong className="text-text-primary">{formatEur(OWNER_PLAN.monthly, { decimals: 0 })}/mes</strong> y
            publica hasta <strong className="text-text-primary">{OWNER_PLAN.maxListings} pisos</strong> sin pagar por cada anuncio.
          </p>
        </Reveal>

        {error && (
          <p
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-xl border border-error/30 px-3.5 py-3 text-sm font-medium text-error"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {user && deferredHousingReady && <div className="mt-6"><HousingOfferStatus /></div>}

        {/* Plan ya activo */}
        {isActive && status && (
          <Reveal delay={80} className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" strokeWidth={1.75} />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-lg font-bold text-text-primary">
                    {enPrueba
                      ? (waitingInterest ? "Tus pisos se publican gratis hasta el primer interesado" : "Tu prueba contratada está activa")
                      : "Tu Plan Inmobiliarias está activo"}
                  </h2>
                  <Badge variant="success">{enPrueba ? "En prueba" : "Activo"}</Badge>
                </div>
                <dl className="mt-4 grid gap-4 border-t border-border-light pt-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-text-muted">Pisos publicados</dt>
                    <dd className="mt-1 font-heading text-2xl font-extrabold text-text-primary tabular">
                      {status.listingsUsed}
                      <span className="text-sm font-semibold text-text-muted">/{status.maxListings}</span>
                    </dd>
                  </div>
                  {status.periodEnd && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-text-muted">
                        {enPrueba ? "Primer cobro" : "Próxima renovación"}
                      </dt>
                      <dd className="mt-1 font-heading text-2xl font-extrabold text-text-primary tabular">
                        {new Date(status.periodEnd).toLocaleDateString("es-ES")}
                      </dd>
                    </div>
                  )}
                  {status.billing === "quarterly_intro" && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-text-muted">Modalidad</dt>
                      <dd className="mt-1 text-sm text-text-secondary">
                        Trimestre inicial con -20% (luego {formatEur(OWNER_PLAN.monthly, { decimals: 0 })}/mes)
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild variant="dark" className="group">
                    <Link href="/negocio/registro?type=housing">
                      <Home className="h-4 w-4" />
                      Subir un piso
                      <ArrowRight className="h-4 w-4 arrow-nudge" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/negocio/dashboard">Mi panel</Link>
                  </Button>
                  <Button variant="outline" onClick={openPortal} loading={opening}>
                    {!opening && <Settings className="h-4 w-4" />}
                    {opening ? "Abriendo…" : "Facturación"}
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        )}

        {/* Selector de pago */}
        {!isActive && (
          <>
            <Reveal delay={80} className="mt-8">
              <p className="text-sm font-semibold text-text-primary">Elige cómo pagar</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Modalidad de pago">
                {/* Trimestre inicial con descuento */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={billing === "quarterly"}
                  onClick={() => { setBilling("quarterly"); setAccepted(false); }}
                  className={cn(
                    "hover-lift relative flex flex-col rounded-2xl border bg-bg-primary p-6 text-left shadow-card transition-[border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2",
                    billing === "quarterly"
                      ? "border-2 border-text-primary"
                      : "border-border hover:border-text-primary/30"
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="eyebrow">
                      {conPrueba ? "Prueba gratis + primer trimestre" : "Primer trimestre de golpe"}
                    </span>
                    <Badge variant={billing === "quarterly" ? "dark" : "outline"}>
                      {conPrueba
                        ? `0 € hoy · -${OWNER_PLAN.introDiscountPct}%`
                        : `-${OWNER_PLAN.introDiscountPct}% de alta`}
                    </Badge>
                  </span>
                  <span className="mt-4 font-heading text-4xl font-extrabold tracking-tight text-text-primary tabular">
                    {formatEur(OWNER_PLAN.introQuarterTotal, { decimals: 0 })}
                    <span className="ml-1 text-sm font-semibold text-text-muted">/ 3 primeros meses</span>
                  </span>
                  <span className="mt-1 text-xs text-text-muted">
                    <span className="line-through">{formatEur(quarterFull, { decimals: 0 })}</span>
                    {conPrueba
                      ? (deferredHousingEnabled ? " · gratis hasta el primer interesado" : " · 7 días de prueba disponibles una vez por cuenta")
                      : " · un único pago inicial"}
                  </span>
                  <span className="mt-3 text-sm text-text-secondary">
                    {conPrueba
                      ? (deferredHousingEnabled ? "Con el primer interesado se cobra el trimestre automáticamente y después, " : "Tras la prueba se cobra el trimestre automáticamente y después, ")
                      : "Después, "}
                    {formatEur(OWNER_PLAN.monthly, { decimals: 0 })}/mes.
                  </span>
                </button>

                {/* Mensual */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={billing === "monthly"}
                  onClick={() => { setBilling("monthly"); setAccepted(false); }}
                  className={cn(
                    "hover-lift relative flex flex-col rounded-2xl border bg-bg-primary p-6 text-left shadow-card transition-[border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2",
                    billing === "monthly"
                      ? "border-2 border-text-primary"
                      : "border-border hover:border-text-primary/30"
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="eyebrow">Mensual</span>
                    {conPrueba && (
                      <Badge variant={billing === "monthly" ? "dark" : "outline"}>
                        0 € hoy
                      </Badge>
                    )}
                  </span>
                  <span className="mt-4 font-heading text-4xl font-extrabold tracking-tight text-text-primary tabular">
                    {formatEur(OWNER_PLAN.monthly, { decimals: 0 })}
                    <span className="ml-1 text-sm font-semibold text-text-muted">/mes</span>
                  </span>
                  <span className="mt-1 text-xs text-text-muted">
                    sin permanencia
                    {conPrueba && (deferredHousingEnabled ? " · gratis hasta el primer interesado" : " · 7 días de prueba disponibles una vez por cuenta")}
                  </span>
                  <span className="mt-3 text-sm text-text-secondary">
                    {conPrueba
                      ? (deferredHousingEnabled ? "Con el primer interesado se cobra el primer mes y se renueva cada mes. Cancela cuando quieras." : "Tras la prueba se cobra el primer mes y se renueva cada mes. Cancela cuando quieras.")
                      : "Se renueva cada mes. Cancela cuando quieras."}
                  </span>
                </button>
              </div>
            </Reveal>

            {/* Qué incluye */}
            <Reveal delay={140} className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
              <h2 className="font-heading text-lg font-bold text-text-primary">Qué incluye</h2>
              <ul className="mt-4 space-y-2.5">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-text-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={2.25} />
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={200} className="mt-8">
              {deferredHousingEnabled && <HousingOfferConsent billing={billing} accepted={accepted} onChange={setAccepted} />}
              <Magnetic className="mt-4 block">
                <Button
                  variant="dark"
                  size="lg"
                  className="group w-full"
                  onClick={subscribe}
                  loading={submitting}
                  disabled={authLoading || (deferredHousingEnabled && !accepted)}
                >
                  {submitting ? (
                    "Procesando…"
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      {conPrueba
                        ? (deferredHousingEnabled ? "Guardar tarjeta · 0 € hoy" : "Empezar prueba de 7 días")
                        : `Darme de alta · ${importe}`}
                      <ArrowRight className="h-4 w-4 arrow-nudge" />
                    </>
                  )}
                </Button>
              </Magnetic>
              <p className="mt-3 text-center text-xs text-text-muted">{deferredHousingEnabled ? "Guardas la tarjeta hoy sin cobro. La cuota se activa con el primer mensaje o solicitud de visita en Franky." : conPrueba ? "La tarjeta se guarda hoy y la tarifa elegida se cobra al finalizar la prueba de 7 días. Cancela antes si no quieres continuar." : "La tarifa elegida se cobra al contratar y se renueva según sus condiciones. Revisa el importe final en Stripe."}</p>
              {!user && !authLoading && (
                <p className="mt-2 text-center text-xs text-text-muted">
                  Necesitas una cuenta: te llevaremos a iniciar sesión primero.
                </p>
              )}

              <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-text-muted">
                <li className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Pagos seguros con Stripe
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Cancela cuando quieras
                </li>
              </ul>
            </Reveal>
          </>
        )}
      </div>
    </div>
  );
}
