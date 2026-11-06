"use client";

import { useState } from "react";
import { Sparkles, CheckCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase-client";
import { writeAttributionCookie } from "@/lib/attribution";
import { sanitizeNext } from "@/lib/safe-next";

/**
 * Acceso por enlace mágico (OTP por email).
 *
 * Es la vía sin contraseña: el usuario pone su correo, recibe un enlace y entra
 * sin recordar ni teclear nada. Complementa al login clásico (que sigue ahí) y
 * es especialmente útil para quien se registró hace meses y no recuerda la
 * contraseña.
 *
 * Usa `signInWithOtp` con `shouldCreateUser: false`: este control es para
 * ENTRAR, no para registrarse a ciegas (el alta tiene su propio flujo con
 * nombre y atribución). Si el correo no existe, Supabase no manda nada y el
 * mensaje es deliberadamente neutro para no revelar qué correos están dados de
 * alta.
 */
export default function MagicLinkButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Rate limit compartido con el resto de auth (por IP y por cuenta).
      const pre = await fetch("/api/auth/precheck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "recover", email }),
      });
      if (!pre.ok) {
        setError(
          pre.status === 429
            ? "Demasiados intentos. Espera unos minutos."
            : "No se pudo enviar. Recarga la página."
        );
        setLoading(false);
        return;
      }

      writeAttributionCookie();
      const supabase = createClient();
      const next = sanitizeNext(new URLSearchParams(window.location.search).get("next"));
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      // Mensaje neutro pase lo que pase: no revelar si el correo existe.
      if (err && !/rate|limit/i.test(err.message)) {
        setSent(true);
      } else if (err) {
        setError("Demasiados intentos. Espera unos minutos.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Algo ha fallado. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div
        role="status"
        className={cn(
          "flex items-start gap-2 rounded-xl border border-success/20 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 animate-fade-in dark:bg-emerald-950/30 dark:text-emerald-300",
          className
        )}
      >
        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Si ese correo tiene cuenta, te acabamos de enviar un enlace para entrar.
          Míralo en tu bandeja (y en spam por si acaso).
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full", className)}
      >
        <Sparkles className="h-4 w-4 text-violet" aria-hidden="true" />
        Entrar con un enlace mágico
      </button>
    );
  }

  return (
    <form onSubmit={send} className={cn("space-y-3 animate-fade-in", className)}>
      {error && (
        <p role="alert" className="rounded-xl border border-error/20 bg-rose-50 p-3 text-xs font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </p>
      )}
      <label htmlFor="magic-email" className="block text-[13px] font-semibold tracking-tight text-text-primary">
        Tu email
      </label>
      <Input
          id="magic-email"
          type="email"
          name="magic-email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="tu@email.com"
          aria-invalid={error ? true : undefined}
        />
      <Button type="submit" size="lg" loading={loading} className="w-full">
        {!loading && <Sparkles className="h-4 w-4" aria-hidden="true" />}
        Enviarme el enlace
      </Button>
    </form>
  );
}
