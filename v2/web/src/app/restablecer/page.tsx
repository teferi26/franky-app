"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import AuthShell, { AuthNotice, AuthResult } from "@/app/auth/AuthShell";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { passwordSchema, isPwnedPassword } from "@/lib/password-strength";

export const dynamic = "force-dynamic";

/**
 * Recuperación de contraseña (M-UX-029), paso 2: fijar la nueva contraseña.
 *
 * El usuario llega aquí desde el enlace del email. El cliente de navegador usa
 * flowType pkce + detectSessionInUrl, así que al cargar la página el SDK
 * detecta el ?code=... de la URL, lo intercambia y establece una sesión de
 * tipo recovery. Por eso apuntamos resetPasswordForEmail directo a esta ruta y
 * NO a /auth/callback: ese callback, tras intercambiar, rebota al onboarding o
 * al dashboard según el perfil, lo que cortaría el flujo antes de poder
 * cambiar la contraseña.
 *
 * Los resets iniciados desde la app móvil llegan en cambio con flujo implicit
 * (tokens en el fragmento de la URL); ese caso se maneja a mano en el efecto
 * de abajo con setSession, porque el SDK pkce no sabe consumirlo.
 *
 * Escuchamos onAuthStateChange para confirmar que hay sesión de recovery. Si
 * el enlace está caducado o es inválido (o se abre en un navegador distinto al
 * que pidió el reset, donde no existe el verifier pkce), no habrá sesión y
 * mostramos un mensaje claro con enlace a /recuperar.
 */
export default function RestablecerPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // Hasta que React no hidrata, el onSubmit de abajo no existe: si alguien
  // pulsa antes (móvil lento, conexión mala, webview), el navegador envía el
  // formulario de forma NATIVA por GET y la contraseña acaba en la URL, en el
  // historial del navegador y en los logs del servidor. El botón se mantiene
  // desactivado hasta estar hidratado.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Estado del enlace: comprobando | válido (hay sesión de recovery) | inválido.
  const [linkStatus, setLinkStatus] = useState<"checking" | "valid" | "invalid">("checking");

  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    // El SDK emite PASSWORD_RECOVERY cuando intercambia el code del enlace.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setLinkStatus("valid");
      }
    });

    // Reset iniciado desde la app móvil (hallazgo C3): el cliente móvil de
    // Supabase usa flujo implicit, así que los tokens llegan en el fragmento
    // de la URL (#access_token=...&refresh_token=...&type=recovery). Este
    // cliente web es pkce y no sabe consumir ese callback (lo rechaza con
    // "Not a valid PKCE flow url"), de modo que lo detectamos a mano y
    // fijamos la sesión con setSession. El flujo pkce de la web (?code=...)
    // sigue intacto por el camino de siempre (detectSessionInUrl).
    const hash = window.location.hash;
    if (hash.includes("access_token=")) {
      const hashParams = new URLSearchParams(hash.slice(1));
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      const type = hashParams.get("type");
      if (access_token && refresh_token && type === "recovery") {
        // Limpiamos el fragmento cuanto antes para no dejar los tokens a la
        // vista en la barra de direcciones ni en el historial.
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
        supabase.auth
          .setSession({ access_token, refresh_token })
          .then(({ data, error: sessErr }) => {
            if (!sessErr && data.session) {
              settled = true;
              setLinkStatus("valid");
            }
            // Si falla (tokens caducados o ya usados), el temporizador de
            // abajo acabará marcando el enlace como no válido, igual que en
            // el flujo pkce.
          });
      }
    }

    // Si la sesión ya estaba establecida cuando montamos (intercambio rápido o
    // sesión previa), la detectamos aquí. Damos un margen porque el intercambio
    // del code es asíncrono al cargar la página.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setLinkStatus("valid");
      }
    });

    // Si tras un margen razonable no hay sesión, el enlace no es válido.
    const timer = setTimeout(() => {
      if (settled) return;
      supabase.auth.getSession().then(({ data }) => {
        setLinkStatus(data.session ? "valid" : "invalid");
      });
    }, 2500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const pwCheck = passwordSchema.safeParse(password);
    if (!pwCheck.success) {
      setError(pwCheck.error.issues[0]?.message ?? "Contraseña no válida");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    // HaveIBeenPwned: misma política que en registro. Falla en abierto si el
    // servicio no responde, para no bloquear el cambio de contraseña.
    try {
      if (await isPwnedPassword(password)) {
        setError("Esta contraseña aparece en filtraciones públicas. Elige otra.");
        return;
      }
    } catch {
      // Ignoramos errores de HIBP.
    }
    setLoading(true);

    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });

    if (err) {
      // Suele significar que la sesión de recovery caducó mientras rellenaba.
      setError(
        "No se ha podido cambiar la contraseña. Puede que el enlace haya caducado. Pide uno nuevo."
      );
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    // Cerramos la sesión de recovery y mandamos a /login para que entre con la
    // contraseña nueva, dejando un aviso de éxito.
    await supabase.auth.signOut();
    setTimeout(() => {
      router.push("/login?reset=ok");
      router.refresh();
    }, 1800);
  };

  if (success) {
    return (
      <AuthResult
        tone="success"
        icon={<CheckCircle className="h-10 w-10" strokeWidth={1.5} />}
        title="Contraseña actualizada"
        actions={
          <Link href="/login?reset=ok" className={cn(buttonVariants({ variant: "dark", size: "lg" }))}>
            Ir a iniciar sesión
          </Link>
        }
      >
        Ya puedes iniciar sesión con tu nueva contraseña. Te llevamos al
        inicio de sesión...
      </AuthResult>
    );
  }

  if (linkStatus === "checking") {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-16">
        <div className="flex items-center gap-3 text-sm text-text-muted animate-fade-in" role="status">
          <span className="h-2 w-2 rounded-full bg-violet animate-pulse-ring" aria-hidden="true" />
          Comprobando el enlace...
        </div>
      </div>
    );
  }

  if (linkStatus === "invalid") {
    return (
      <AuthResult
        tone="warning"
        icon={<AlertCircle className="h-10 w-10" strokeWidth={1.5} />}
        title="Enlace caducado o no válido"
        actions={
          <Link href="/recuperar" className={cn(buttonVariants({ variant: "dark", size: "lg" }))}>
            Pedir un enlace nuevo
          </Link>
        }
      >
        Este enlace para restablecer la contraseña ya no sirve (ha caducado,
        ya se usó, o se abrió en un dispositivo distinto al que lo pidió).
        Pide uno nuevo y vuelve a intentarlo.
      </AuthResult>
    );
  }

  return (
    <AuthShell
      eyebrow="Nueva contraseña"
      title="Crea una contraseña nueva"
      subtitle="Elige una contraseña segura para tu cuenta."
      aside={
        <>
          Una frase que recuerdes
          <br />
          <span className="text-violet">vale más que mil símbolos.</span>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <AuthNotice tone="error" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}>
            {error}
          </AuthNotice>
        )}

        <div>
          <label htmlFor="reset-password" className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
            Nueva contraseña
          </label>
          <div className="relative">
            <Input
              id="reset-password"
              name="new-password"
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              placeholder="Mín. 10 caracteres. Una frase que recuerdes vale"
              aria-invalid={error ? true : undefined}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={showPwd}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <PasswordStrengthMeter password={password} />
        </div>

        <Field id="reset-password-confirm" label="Repite la contraseña">
          <Input
            id="reset-password-confirm"
            name="confirm-password"
            type={showPwd ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={10}
            placeholder="••••••••"
            aria-invalid={error ? true : undefined}
          />
        </Field>

        <Button type="submit" size="lg" loading={loading} disabled={!hydrated} className="group w-full">
          {loading ? "Guardando..." : "Guardar contraseña nueva"}
          {!loading && <ArrowRight className="h-4 w-4 arrow-nudge" />}
        </Button>
      </form>

      <div className="mt-8 border-t border-border-light pt-6 text-sm text-text-muted">
        <p>
          ¿Problemas con el enlace?{" "}
          <Link href="/recuperar" className="link-underline font-semibold text-text-primary">
            Pide uno nuevo
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
