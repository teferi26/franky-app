"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMMISSION, formatPct, stripeProcessingLabel } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export interface PayoutsAccount {
  charges_enabled: boolean;
  onboarding_status: "pending" | "restricted" | "active" | "disabled";
}

/**
 * Tarjeta única de "cuenta de cobros" (Stripe Connect). La usan la página
 * general /cobros (cualquiera que venda algo: entradas de eventos, visitas,
 * alquiler) y el panel de propietario, para que el alta se explique igual en
 * todas partes.
 *
 * `returnTo` es la ruta (misma web) a la que Stripe devuelve al terminar; el
 * endpoint de alta solo acepta rutas relativas.
 *
 * Visual (v3): superficie neutra, estado como punto de color + texto (sin
 * pastillas tintadas) y un solo botón principal.
 */
export default function PayoutsCard({
  account,
  returnTo,
}: {
  account: PayoutsAccount | null;
  returnTo: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = account?.charges_enabled === true;

  const startOnboarding = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_to: returnTo }),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      setError(json.error ?? "No se pudo iniciar el alta de cobros.");
    } catch {
      setError("Error de red al iniciar el alta de cobros.");
    }
    setLoading(false);
  };

  const openDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/connect/login-link", { method: "POST" });
      const json = await res.json();
      if (json.url) window.open(json.url, "_blank");
      else setError(json.error ?? "No se pudo abrir el panel de cobros.");
    } catch {
      setError("Error de red al abrir el panel de cobros.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Cuenta de cobros</p>
          <h2 className="mt-2 font-heading text-xl font-bold text-text-primary sm:text-2xl">
            {ready ? "Todo listo para cobrar" : "Activa tus cobros"}
          </h2>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold text-text-secondary">
          <span
            aria-hidden="true"
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              ready ? "bg-success" : "bg-warning"
            )}
          />
          {ready ? "Activa" : "Pendiente"}
        </span>
      </div>

      {ready ? (
        <div className="mt-5 space-y-5">
          <p className="max-w-prose text-[15px] leading-relaxed text-text-secondary">
            Comisión de Franky: {formatPct(COMMISSION.ticket)} en entradas de
            eventos, {formatPct(COMMISSION.visit)} en visitas y{" "}
            {formatPct(COMMISSION.rent)} en rentas, más los gastos de pago con
            tarjeta de Stripe ({stripeProcessingLabel()} por cobro); el resto
            llega directamente a tu cuenta bancaria. En las entradas esos gastos
            van sumados al precio, así que tú recibes justo el neto que fijaste.
          </p>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <Button onClick={openDashboard} loading={loading} variant="outline">
            {!loading && <ExternalLink className="h-4 w-4" strokeWidth={1.75} />}
            Gestionar cuenta de cobros
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <p className="max-w-prose text-[15px] leading-relaxed text-text-secondary">
            Para recibir dinero por Franky (entradas de tus eventos, visitas,
            alquiler o reservas) necesitas una cuenta de cobros gestionada por
            Stripe. Tarda unos minutos y solo se hace una vez: te pedirán tu
            nombre, tu DNI y el IBAN donde quieres el dinero.
          </p>
          {account ? (
            <p className="flex items-start gap-2.5 rounded-xl border border-border bg-bg-secondary/60 px-4 py-3 text-sm text-text-secondary">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} />
              <span>
                Ya has empezado el alta y Stripe está verificando tu cuenta. Si
                falta algún dato, continúa el proceso para completarlo; en cuanto
                la activen podrás recibir el dinero de tus ventas.
              </span>
            </p>
          ) : null}
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <Button onClick={startOnboarding} loading={loading} variant="dark" size="lg">
            {!loading && <CreditCard className="h-4 w-4" strokeWidth={1.75} />}
            {account ? "Continuar alta de cobros" : "Activar mis cobros"}
          </Button>
        </div>
      )}
    </section>
  );
}
