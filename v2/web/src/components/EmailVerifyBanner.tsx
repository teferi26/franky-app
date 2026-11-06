"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck, MailWarning, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useAccountGuard, withAccountScope } from '@/components/AccountScope';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Aviso de "confirma tu email", con botón de reenvío.
 *
 * La verificación es diferida (el usuario ya está dentro), así que esto no
 * bloquea nada: solo recuerda que hay un correo pendiente y da un botón para
 * reenviarlo. También muestra el resultado cuando se vuelve del enlace
 * (?email_verificado=ok|caducado|invalido, que pone /api/auth/verify-email).
 *
 * Se apoya en `profiles.email_verified_at` (migración 141). Si la columna aún
 * no existe, no se pinta nada (fail-safe).
 */
function EmailVerifyBanner() {
  const { isCurrent } = useAccountGuard();
  const params = useSearchParams();
  const outcome = params.get("email_verificado");

  const [state, setState] = useState<"loading" | "verified" | "pending" | "hidden">("loading");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [sendError, setSendError] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) setState("hidden");
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("email_verified_at")
        .eq("id", user.id)
        .maybeSingle();
      if (!mounted) return;
      // Columna inexistente (migración sin aplicar) → no molestar.
      if (error) return setState("hidden");
      setState(data?.email_verified_at ? "verified" : "pending");
    })();
    return () => {
      mounted = false;
    };
  }, [outcome]);

  const resend = async () => {
    if (sending.current) return;
    sending.current = true;
    setSendError(false);
    setResending(true);
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (!response.ok) throw new Error('resend_unconfirmed');
      const result = await response.json();
      if (!isCurrent()) return;
      if (result.already) { setState('verified'); return; }
      setResent(true);
    } catch {
      if (isCurrent()) setSendError(true);
    } finally {
      sending.current = false;
      if (isCurrent()) setResending(false);
    }
  };

  // Resultado de volver del enlace.
  if (state === "verified") {
    // Solo se muestra el banner de éxito si se acaba de verificar.
    if (outcome === "ok") {
      return (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50 p-3 text-sm text-emerald-700 animate-fade-in dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <MailCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          ¡Email confirmado! Ya tienes la cuenta al 100%.
        </div>
      );
    }
    return null;
  }

  if (state !== "pending") return null;

  const enlaceCaducado = outcome === "caducado";

  return (
    // Diseño v3: tarjeta blanca con borde hairline; el aviso lo da el icono
    // en ámbar y el texto, no un fondo tintado.
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-border bg-bg-primary p-4 shadow-card animate-fade-in">
      <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-text-primary">
          {outcome === 'temporal' ? 'La confirmación sigue pendiente' : enlaceCaducado ? "Ese enlace ha caducado" : "Confirma tu email"}
        </p>
        {/* El bloqueo es real desde la migración 145 (trigger en FOMO, Crush,
            chat, mercado y comunidades) para cuentas creadas desde el
            25-jul-2026; las anteriores están exentas. El copy lo refleja sin
            sobreprometer. */}
        <p className="mt-0.5 text-text-muted">
          {outcome === 'temporal' ? 'No hemos podido confirmar el correo por un problema temporal. Vuelve a abrir el enlace del correo en unos minutos.' : 'Sirve para recuperar la cuenta si pierdes la contraseña, y las cuentas nuevas lo necesitan para publicar y chatear.'}
        </p>
        {sendError && <p role="alert" className="mt-2 text-error">No se ha podido confirmar el envío. Espera un momento y vuelve a intentarlo.</p>}
        {resent ? (
          <p className="mt-2 text-success">Te lo hemos reenviado. Revisa tu bandeja.</p>
        ) : (
          <button
            onClick={resend}
            disabled={resending}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}
          >
            {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {enlaceCaducado ? "Enviarme uno nuevo" : "Reenviar el correo"}
          </button>
        )}
      </div>
    </div>
  );
}

export default withAccountScope(EmailVerifyBanner, { silent: true });
