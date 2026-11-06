"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Reveal } from "@/components/motion";
import { passwordSchema, isPwnedPassword } from "@/lib/password-strength";
import LegalConsentNote from "@/app/registro/LegalConsentNote";

/**
 * Alta de propietario/inmobiliaria: registro SIN pasar por el flujo de
 * estudiante (queja directa de los empresarios). Crea la cuenta con rol
 * propietario, sin onboarding de uni/carrera, y aterriza en el Plan
 * Inmobiliarias para arrancar la prueba de 7 días.
 */
export default function AltaPropietarioPage() {
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");
  // Hasta que React no hidrata, el onSubmit de abajo no existe: si alguien
  // pulsa antes (móvil lento, conexión mala, webview), el navegador envía el
  // formulario de forma NATIVA por GET y la contraseña acaba en la URL, en el
  // historial del navegador y en los logs del servidor. El botón se mantiene
  // desactivado hasta estar hidratado.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const NEXT_URL = "/negocio/propietario";

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const pwCheck = passwordSchema.safeParse(password);
    if (!pwCheck.success) {
      setError(pwCheck.error.issues[0]?.message ?? "Contraseña no válida");
      return;
    }
    try {
      if (await isPwnedPassword(password)) {
        setError("Esta contraseña aparece en filtraciones públicas. Elige otra.");
        return;
      }
    } catch {
      // HIBP caído: no bloqueamos el alta.
    }
    setLoading(true);

    const res = await fetch("/api/auth/signup-propietario", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password, phone, city }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setError("Demasiados registros desde esta red. Inténtalo en un rato.");
      } else {
        setError(data.message || "No se pudo crear la cuenta. Inténtalo de nuevo.");
      }
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError("Cuenta creada. Inicia sesión con tu email y contraseña.");
      setLoading(false);
      return;
    }

    window.location.href = NEXT_URL;
  };

  // Cuenta ya existente (p. ej. entró con Google como estudiante): conversión
  // a cuenta de propietario sin crear otra.
  const handleConvert = async () => {
    setConverting(true);
    setError("");
    try {
      const res = await fetch("/api/negocio/convertir", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo convertir la cuenta.");
        setConverting(false);
        return;
      }
      window.location.href = NEXT_URL;
    } catch {
      setError("Error inesperado. Inténtalo de nuevo.");
      setConverting(false);
    }
  };

  return (
    <div className="bg-bg-primary">
      <div className="mx-auto max-w-lg px-4 sm:px-6 py-10 sm:py-16">
        <Reveal variant="fade">
          <Link
            href="/negocio"
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Volver
          </Link>

          <p className="eyebrow mt-6">Cuenta para inmobiliarias y propietarios</p>
          <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
            Crea tu cuenta de propietario.
          </h1>
          <p className="mt-3 max-w-xl text-text-muted">
            Sin universidad, sin carrera, sin preguntas de estudiante: solo lo que
            necesitas para gestionar tus pisos y elegir la tarifa que mejor se ajuste a tu cartera.
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

        {user && !authLoading ? (
          <Reveal delay={80} className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" strokeWidth={1.75} />
              <div className="flex-1">
                <h2 className="font-heading text-lg font-bold text-text-primary">Ya tienes sesión iniciada</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Podemos convertir tu cuenta actual en cuenta de propietario:
                  conservas tu email y contraseña, y se desbloquea el panel de
                  inmobiliaria.
                </p>
                <Button
                  variant="dark"
                  className="group mt-5"
                  onClick={handleConvert}
                  loading={converting}
                >
                  {converting ? "Convirtiendo…" : "Convertir mi cuenta en propietario"}
                  <ArrowRight className="h-4 w-4 arrow-nudge" />
                </Button>
                <p className="mt-4 text-xs text-text-muted">
                  ¿Prefieres una cuenta nueva solo para la inmobiliaria?{" "}
                  <button
                    type="button"
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.auth.signOut();
                      window.location.reload();
                    }}
                    className="link-underline font-semibold text-text-primary"
                  >
                    Cierra sesión
                  </button>{" "}
                  y verás el formulario de registro.
                </p>
              </div>
            </div>
          </Reveal>
        ) : (
          <Reveal delay={80} className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
            <form onSubmit={handleRegister} className="space-y-5">
              <Field id="alta-nombre" label="Nombre o inmobiliaria" required>
                <Input
                  id="alta-nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Inmobiliaria García"
                  required
                  maxLength={120}
                  autoComplete="organization"
                />
              </Field>
              <Field id="alta-email" label="Email" required>
                <Input
                  id="alta-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@tuinmobiliaria.com"
                  required
                  autoComplete="email"
                />
              </Field>
              <Field id="alta-password" label="Contraseña" required hint="Mínimo 10 caracteres.">
                <Input
                  id="alta-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 10 caracteres"
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="alta-telefono" label="Teléfono" optional>
                  <Input
                    id="alta-telefono"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="612 345 678"
                    maxLength={30}
                    autoComplete="tel"
                  />
                </Field>
                <Field id="alta-ciudad" label="Ciudad" optional>
                  <Input
                    id="alta-ciudad"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Alicante"
                    maxLength={120}
                    autoComplete="address-level2"
                  />
                </Field>
              </div>

              <Button
                type="submit"
                variant="dark"
                size="lg"
                className="group w-full"
                loading={loading}
                disabled={!hydrated || !name.trim() || !email.trim() || !password}
              >
                {loading ? "Creando cuenta…" : "Crear cuenta de propietario"}
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Button>
              <LegalConsentNote />
            </form>

            <p className="mt-5 text-center text-xs text-text-muted">
              ¿Ya tienes cuenta?{" "}
              <Link
                href={`/login?next=${encodeURIComponent("/negocio/alta")}`}
                className="link-underline font-semibold text-text-primary"
              >
                Inicia sesión
              </Link>{" "}
              y la convertimos en cuenta de propietario.
            </p>
          </Reveal>
        )}

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-text-muted">
          <li className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Datos protegidos (RGPD)
          </li>
          <li className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Consulta tu plan antes de contratar
          </li>
        </ul>
      </div>
    </div>
  );
}
