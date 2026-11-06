"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-client";
import Link from "next/link";
import { AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import AuthShell, { AuthNotice, AuthResult } from "@/app/auth/AuthShell";

export const dynamic = "force-dynamic";

/**
 * Recuperación de contraseña (M-UX-029), paso 1: pedir el email.
 *
 * Al enviar llama a supabase.auth.resetPasswordForEmail con redirectTo
 * directo a /restablecer (no a /auth/callback). Motivo: el callback server
 * intercambia el code y luego rebota al onboarding o al dashboard según el
 * perfil, lo que secuestraría el flujo de recovery antes de poder cambiar la
 * contraseña. /restablecer es un client component y el cliente de navegador
 * tiene detectSessionInUrl + flowType pkce, así que intercambia el code y
 * establece la sesión de recovery él mismo.
 *
 * Anti enumeración: mostramos SIEMPRE el mismo mensaje de éxito, exista o no
 * la cuenta. El precheck (rate limit por IP) frena el abuso del envío masivo
 * de correos; el captcha se retiró porque bloqueaba usuarios reales.
 */
export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  // Hasta que React no hidrata, el onSubmit de abajo no existe: si alguien
  // pulsa antes (móvil lento, conexión mala, webview), el navegador envía el
  // formulario de forma NATIVA por GET y el email acaba en la URL, en el
  // historial del navegador y en los logs del servidor. El botón se mantiene
  // desactivado hasta estar hidratado.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const preRes = await fetch("/api/auth/precheck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // El email va para el límite POR CUENTA: sin él, cualquiera puede pedir
      // recuperación de la misma dirección desde mil IPs y llenarle el buzón.
      body: JSON.stringify({ action: "recover", email }),
    });
    if (!preRes.ok) {
      setError("Demasiados intentos desde esta red. Espera unos minutos.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer`,
    });

    // Anti enumeración: pase lo que pase (cuenta inexistente, rate-limit del
    // proveedor, etc.) enseñamos el mismo mensaje neutro. Solo registramos el
    // error en consola para diagnóstico, nunca lo mostramos al usuario.
    if (err) {
      console.warn("resetPasswordForEmail:", err.message);
    }

    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <AuthResult
        tone="success"
        icon={<CheckCircle className="h-10 w-10" strokeWidth={1.5} />}
        title="Revisa tu correo"
        actions={
          <Link href="/login" className={cn(buttonVariants({ variant: "dark", size: "lg" }))}>
            Volver a iniciar sesión
          </Link>
        }
      >
        Si ese correo tiene cuenta, te hemos enviado un enlace para
        restablecer la contraseña. Revisa también la carpeta de spam o
        promociones.
      </AuthResult>
    );
  }

  return (
    <AuthShell
      eyebrow="Recuperar acceso"
      title="¿Has olvidado tu contraseña?"
      subtitle="Escribe tu email y te enviaremos un enlace para crear una nueva."
      aside={
        <>
          Pasa a todo el mundo.
          <br />
          <span className="text-violet">Lo arreglamos en un minuto.</span>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <AuthNotice tone="error" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}>
            {error}
          </AuthNotice>
        )}

        <Field id="recover-email" label="Email">
          <Input
            id="recover-email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="tu@email.com"
            aria-invalid={error ? true : undefined}
          />
        </Field>

        <Button type="submit" size="lg" loading={loading} disabled={!hydrated} className="group w-full">
          {loading ? "Enviando..." : "Enviar enlace de recuperación"}
          {!loading && <ArrowRight className="h-4 w-4 arrow-nudge" />}
        </Button>
      </form>

      <div className="mt-8 border-t border-border-light pt-6 text-sm text-text-muted">
        <p>
          ¿Te has acordado?{" "}
          <Link href="/login" className="link-underline font-semibold text-text-primary">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
