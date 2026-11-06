"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PRO_CONTACT } from "@/lib/pro/contact";

export default function ActivationFlow({
  workspaceId,
  orderId,
  cancelled = false,
}: {
  workspaceId: string;
  orderId: string;
  cancelled?: boolean;
}) {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [waiting, setWaiting] = React.useState(false);
  const [checkoutUrl, setCheckoutUrl] = React.useState<string | null>(null);
  const [resume, setResume] = React.useState(cancelled);
  const [slug, setSlug] = React.useState("");
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    if (!workspaceId || !orderId) return;
    let live = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const check = async () => {
      setChecking(true);
      try {
        const params = new URLSearchParams({
          workspace: workspaceId,
          order: orderId,
        });
        const response = await fetch(`/api/pro/onboarding?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!live) return;
        if (response.ok && result.status === "active") {
          setReady(true);
          setSlug(result.slug ?? "");
          router.replace(`/pro/${encodeURIComponent(workspaceId)}/guia`);
          return;
        }
        if (
          response.ok &&
          ["checkout", "cancelled", "failed"].includes(result.status)
        ) {
          setResume(true);
          if (result.url) {
            const target = new URL(result.url);
            if (
              target.protocol === "https:" &&
              target.hostname === "checkout.stripe.com"
            )
              setCheckoutUrl(target.href);
          }
          return;
        }
      } catch {
        // Un corte de conexión mantiene la espera y permite volver a comprobar.
      } finally {
        if (live) setChecking(false);
      }
      if (!live) return;
      attempts += 1;
      setWaiting(attempts >= 4);
      if (attempts < 20)
        timer = setTimeout(check, Math.min(1500 + attempts * 500, 5000));
    };
    void check();
    return () => {
      live = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [workspaceId, orderId, router, revision]);

  async function retryActivation() {
    setChecking(true);
    try {
      const response = await fetch("/api/pro/onboarding/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, orderId }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status === "active") {
        setReady(true);
        router.replace(`/pro/${encodeURIComponent(workspaceId)}/guia`);
        return;
      }
      if (response.ok && result.status === "checkout" && result.url) {
        const target = new URL(result.url);
        if (
          target.protocol === "https:" &&
          target.hostname === "checkout.stripe.com"
        ) {
          setCheckoutUrl(target.href);
          setResume(true);
          return;
        }
      }
    } catch {
      // La comprobación continúa aunque el proveedor tarde en responder.
    } finally {
      setChecking(false);
    }
    setRevision((value) => value + 1);
  }
  const missing = !workspaceId || !orderId;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-secondary/50 px-4 py-12">
      <section
        className="w-full max-w-lg rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-10"
        aria-live="polite"
      >
        <p className="eyebrow">Franky Pro</p>
        {ready ? (
          <Check className="mt-6 h-8 w-8 text-violet" strokeWidth={1.75} />
        ) : (
          <RefreshCw className="mt-6 h-8 w-8 text-violet" strokeWidth={1.75} />
        )}
        <h1 className="mt-5 font-heading text-fluid-h2 font-extrabold">
          {missing
            ? "Retoma tu alta"
            : ready
              ? "Tu espacio está listo"
              : resume
                ? "Tu espacio te espera"
                : "Activando tu cuenta"}
        </h1>
        <p className="mt-3 text-text-muted">
          {missing
            ? "Vuelve al alta para preparar tu negocio y elegir tu plan."
            : ready
              ? "Te llevamos a tu guía de primeros pasos."
              : resume
                ? "Puedes retomar el pago cuando quieras. Tus datos del negocio ya están guardados."
                : waiting
                  ? "Seguimos comprobando la confirmación del pago. Esta pantalla se actualiza sola."
                  : "Estamos preparando tu guía y tu ficha pública. Solo falta confirmar tu suscripción."}
        </p>
        {checkoutUrl ? (
          <a
            href={checkoutUrl}
            className={buttonVariants({
              variant: "dark",
              size: "lg",
              className: "mt-6 w-full",
            })}
          >
            Retomar el pago <ArrowRight className="h-4 w-4" />
          </a>
        ) : null}
        {!missing && !ready ? (
          <Button
            variant={checkoutUrl ? "outline" : "dark"}
            className="mt-4 w-full"
            loading={checking}
            disabled={checking}
            onClick={() => void retryActivation()}
          >
            Volver a comprobar
          </Button>
        ) : null}
        {missing ? (
          <Link
            href="/pro/empezar"
            className={buttonVariants({
              variant: "dark",
              className: "mt-6 w-full",
            })}
          >
            Continuar mi alta
          </Link>
        ) : null}
        {ready && slug ? (
          <Link
            href={`/n/${encodeURIComponent(slug)}`}
            className={buttonVariants({
              variant: "outline",
              className: "mt-6 w-full",
            })}
          >
            Ver mi ficha pública
          </Link>
        ) : null}
        <a
          href={PRO_CONTACT.whatsappHref(
            "Hola, tengo una duda al activar Franky Pro",
          )}
          className="mt-5 flex min-h-10 items-center justify-center text-center text-sm text-text-muted"
        >
          ¿Dudas? Escríbenos por WhatsApp
        </a>
      </section>
    </main>
  );
}
