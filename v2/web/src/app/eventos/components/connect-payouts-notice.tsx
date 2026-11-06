"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Loader2, Wallet, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "loading" | "none" | "pending" | "active" | "unknown";

/**
 * Aviso de cobros en los formularios que venden entradas (crear y editar
 * evento). Dice la verdad del estado REAL de la cuenta del organizador en vez
 * de prometer un paso posterior.
 *
 * Antes, el formulario decía "podrás activar tus cobros desde la página del
 * evento, justo después de publicarlo" y era el único camino: el alta solo se
 * podía empezar desde una ficha ya publicada (o desde el panel de propietario,
 * cerrado por rol). Se leía como un círculo vicioso — "necesito cuenta para
 * vender, pero solo puedo crearla después de vender" — y la gente se atascaba.
 * Ahora se puede activar aquí mismo, antes de publicar.
 *
 * `onBeforeLeave` permite a la página guardar su borrador antes de salir a
 * Stripe (el alta es una redirección completa, no un popup).
 */
export default function ConnectPayoutsNotice({
  returnTo,
  onBeforeLeave,
  leaveHint = "Te llevamos a Stripe y al volver sigues con el evento donde lo dejaste.",
}: {
  returnTo: string;
  onBeforeLeave?: () => void;
  /** Qué pasa con lo que hay en pantalla al salir a Stripe. */
  leaveHint?: string;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stripe/connect/status");
        const json = await res.json();
        if (cancelled) return;
        const s = json?.status;
        setStatus(s === "none" || s === "pending" || s === "active" ? s : "unknown");
      } catch {
        if (!cancelled) setStatus("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startOnboarding() {
    setLeaving(true);
    setError(null);
    try {
      onBeforeLeave?.();
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_to: returnTo }),
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url as string;
        return;
      }
      setError(json?.error ?? "No se pudo iniciar el alta de cobros.");
    } catch {
      setError("Error de red al iniciar el alta de cobros.");
    }
    setLeaving(false);
  }

  if (status === "loading") {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-text-muted">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
        Comprobando tus cobros…
      </p>
    );
  }

  if (status === "active") {
    return (
      // Estado bueno: rótulo con icono suelto, sin caja verde.
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={1.75} aria-hidden="true" />
        <span>
          <strong className="font-semibold text-text-primary">Tus cobros ya están activos.</strong> Recibirás el dinero de cada
          entrada vendida (menos la comisión) en la cuenta que diste de alta.
        </span>
      </p>
    );
  }

  const isPending = status === "pending";

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-border bg-bg-secondary/60 p-4">
      <div className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
        {isPending ? (
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden="true" />
        )}
        {isPending ? (
          <span>
            Ya empezaste el alta y <strong>Stripe está verificando tu cuenta</strong>.
            Puedes publicar el evento igualmente: se pondrá a la venta en cuanto la
            activen. Si les falta algún dato, continúa el proceso.
          </span>
        ) : status === "unknown" ? (
          <span>
            Para vender entradas necesitas una cuenta de cobros (la gestiona
            Stripe). No hemos podido comprobar si ya la tienes: revísalo en{" "}
            <Link href="/cobros" className="link-underline font-semibold text-text-primary">
              tus cobros
            </Link>
            .
          </span>
        ) : (
          <span>
            Para vender entradas necesitas una <strong>cuenta de cobros</strong> (la
            gestiona Stripe: te pedirá tu nombre, DNI e IBAN, unos minutos). Puedes
            activarla <strong>ahora</strong> o después de publicar; hasta que esté
            activa, el evento se ve pero nadie puede comprar entradas.
          </span>
        )}
      </div>
      {error && <p role="alert" className="text-xs font-medium text-error">{error}</p>}
      <Button type="button" variant="outline" size="sm" onClick={startOnboarding} loading={leaving}>
        {!leaving &&
          (isPending ? (
            <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Wallet className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          ))}
        {isPending ? "Continuar en Stripe" : "Activar mis cobros ahora"}
      </Button>
      <p className="text-[11px] leading-relaxed text-text-muted">{leaveHint}</p>
    </div>
  );
}
