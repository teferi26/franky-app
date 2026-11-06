"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-client";
import { writeAttributionCookie } from "@/lib/attribution";
import { sanitizeNext, withNext, isProOnboardingNext } from "@/lib/safe-next";
import { isCrushPartyEntry } from '@/lib/crush-party-route';
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Eye, EyeOff, AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import InAppBrowserBanner from "@/components/InAppBrowserBanner";
import { isInAppBrowser, openInExternalBrowser } from "@/lib/in-app-browser";
import { trackFire } from "@/lib/analytics";
import MagicLinkButton from "@/components/MagicLinkButton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import AuthShell, { AuthDivider, AuthNotice, GoogleMark } from "@/app/auth/AuthShell";
import LegalConsentNote from "@/app/registro/LegalConsentNote";

// Apple Sign-In: solo se ofrece si está dado de alta el proveedor en Supabase
// (variable de entorno). Sin el client id de Apple el botón fallaría, así que
// mejor no pintarlo hasta que exista.
const appleEnabled = process.env.NEXT_PUBLIC_APPLE_ENABLED === "1";

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Hasta que React no hidrata, el onSubmit de abajo no existe: si alguien
  // pulsa antes (móvil lento, conexión mala), el navegador envía el formulario
  // de forma NATIVA por GET y la contraseña acaba en la URL, en el historial y
  // en los logs del servidor. Visto de verdad en los registros del servidor de
  // desarrollo. El botón se mantiene desactivado hasta estar hidratado.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // Aviso verde tras restablecer la contraseña (?reset=ok desde /restablecer).
  const [resetOk, setResetOk] = useState(false);
  // Dentro de webviews (Instagram/TikTok, donde aterrizan /tafa, /pau y /new)
  // Google no puede funcionar (403 de Google), así que ni se ofrece: solo
  // email. El banner queda como salida para cuentas antiguas de Google.
  // Se detecta en useEffect para no romper la hidratación.
  const [inApp, setInApp] = useState(false);

  // Recovery dialog state — shown when an existing soft-deleted user logs in.
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [postLoginProfile, setPostLoginProfile] = useState<{ onboarding_completed: boolean | null; selfDeleted: boolean } | null>(null);

  // Destino tras iniciar sesión (p. ej. /crush si vienes del cartel). El
  // middleware ya lo añade como ?next=… al rebotar a /login desde una ruta privada.
  const [nextParam, setNextParam] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextParam(params.get("next"));
    setResetOk(params.get("reset") === "ok");
    setInApp(isInAppBrowser());
    // La vuelta de Google/Apple rebota aquí con ?error=… cuando el intercambio
    // del código falla (p. ej. el flujo empezó en otro navegador o caducó).
    // Antes el rebote era silencioso y parecía que "no pasaba nada".
    if (params.get("error") === "callback_failed") {
      setError(
        "No se pudo completar el inicio de sesión con Google. Vuelve a intentarlo aquí mismo; si empezaste en otra app o navegador, termina el proceso en este."
      );
    }
  }, []);

  const router = useRouter();

  const goAfterLogin = (onboarding_completed: boolean | null) => {
    const next = sanitizeNext(
      new URLSearchParams(window.location.search).get("next")
    );
    if (!onboarding_completed && !isCrushPartyEntry(next) && !isProOnboardingNext(next)) {
      // Aún sin onboarding: lo arrastramos para volver al destino al terminar.
      router.push(withNext("/onboarding", next));
    } else {
      router.push(next);
    }
    router.refresh();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    setLoading(true);

    // Rate limit por IP contra fuerza bruta (el captcha se retiró: bloqueaba
    // usuarios reales, sobre todo dentro de webviews de Instagram/TikTok).
    const preRes = await fetch("/api/auth/precheck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // El email va para el límite POR CUENTA (además del de IP): sin él, un
      // ataque distribuido contra una sola cuenta pasa sin tocar techo.
      body: JSON.stringify({ action: "login", email }),
    });
    if (!preRes.ok) {
      const data = await preRes.json().catch(() => ({}));
      if (preRes.status === 429) {
        setError("Demasiados intentos. Espera unos minutos antes de volver a intentarlo.");
      } else {
        setError(data.message || "Verificación fallida. Recarga la página.");
      }
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (err) {
      setError(err.message === "Invalid login credentials"
        ? "Email o contraseña incorrectos"
        : err.message);
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed, is_discarded, self_deleted")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single();

    if (profile?.is_discarded) {
      // Soft-deleted account → ask the user whether to recover.
      setPostLoginProfile({
        onboarding_completed: profile.onboarding_completed,
        selfDeleted: Boolean(profile.self_deleted),
      });
      setRecoveryNeeded(true);
      setLoading(false);
      return;
    }

    trackFire("login_completed", { method: "password" });
    goAfterLogin(profile?.onboarding_completed ?? null);
  };

  const handleRecover = async () => {
    setRecovering(true);
    try {
      const res = await fetch("/api/account/recover", { method: "POST" });
      if (!res.ok) {
        setError("No se pudo recuperar la cuenta. Inténtalo de nuevo.");
        setRecovering(false);
        return;
      }
      goAfterLogin(postLoginProfile?.onboarding_completed ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRecovering(false);
    }
  };

  const handleAbandonRecovery = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setRecoveryNeeded(false);
    setPostLoginProfile(null);
    setError("Tu cuenta sigue eliminada. Cuando quieras recuperarla, vuelve a iniciar sesión.");
    router.refresh();
  };

  return (
    <AuthShell
      eyebrow="Iniciar sesión"
      title="Bienvenido de nuevo"
      subtitle="Entra y sigue donde lo dejaste en tu campus."
      asideEyebrow="Comunidad universitaria de España"
      aside={
        <>
          Lo que pasa hoy en tu campus,
          <br />
          <span className="text-violet">sin perderte nada.</span>
        </>
      }
    >
      {recoveryNeeded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0c14]/50 px-4 backdrop-blur-[2px] animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-border bg-bg-primary p-7 shadow-float animate-scale-in">
            <GraduationCap className="h-6 w-6 text-violet" />
            <h2 className="mt-5 font-heading text-xl font-extrabold text-text-primary">¿Quieres recuperar tu cuenta?</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {postLoginProfile?.selfDeleted
                ? "Eliminaste tu cuenta hace un tiempo. Si quieres, puedes recuperarla y volver a la app como si nada."
                : "Tu cuenta está marcada como eliminada por un administrador. Si la recuperas, podrás seguir usándola con todos tus datos. Si crees que es un error, contacta con soporte."}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={handleRecover} loading={recovering} size="lg" className="w-full">
                {recovering ? "Recuperando…" : "Sí, recuperar mi cuenta"}
              </Button>
              <Button onClick={handleAbandonRecovery} disabled={recovering} variant="outline" size="lg" className="w-full">
                No, mantenla eliminada
              </Button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        {resetOk && !error && (
          <AuthNotice tone="success" icon={<CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}>
            Contraseña actualizada. Ya puedes iniciar sesión.
          </AuthNotice>
        )}
        {error && (
          <AuthNotice tone="error" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}>
            {error}
          </AuthNotice>
        )}

        <Field id="login-email" label="Email">
          {/* name + autoComplete + inputMode: sin esto el autorrelleno de
              iOS/Android y los gestores de contraseñas no reconocían el
              formulario y el usuario tenía que teclearlo todo a mano. */}
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username webauthn"
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

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="block text-sm font-semibold text-text-primary">
              Contraseña
            </label>
            <Link href="/recuperar" className="link-underline text-xs font-medium text-text-muted hover:text-text-primary">
              ¿La has olvidado?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Tu contraseña"
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
        </div>

        <Button type="submit" size="lg" loading={loading} disabled={!hydrated} className="group w-full">
          {loading ? "Entrando…" : "Iniciar sesión"}
          {!loading && <ArrowRight className="h-4 w-4 arrow-nudge" />}
        </Button>
      </form>

      {/* Aviso solo visible dentro de webviews (Instagram/TikTok…): con
          Google oculto, es la salida para cuentas antiguas de Google
          (no tienen contraseña; necesitan el navegador real). */}
      <InAppBrowserBanner className="mt-6" />

      {/* OAuth: oculto dentro de webviews, donde Google no puede funcionar. */}
      {!inApp && (<>
      <AuthDivider>o continúa con</AuthDivider>

      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={async () => {
            // En webviews saltamos al navegador real: ahí sí aparece el
            // selector de cuentas de Google (ver lib/in-app-browser.ts).
            // Si la app bloquea el salto, avisamos con la salida manual en
            // vez de dejar un botón que no hace nada.
            if (isInAppBrowser()) {
              openInExternalBrowser(undefined, () =>
                setError(
                  "¿No se ha abierto tu navegador? Toca el menú ⋯ de arriba y elige «Abrir en el navegador externo», o inicia sesión con tu email y contraseña aquí mismo."
                )
              );
              return;
            }
            writeAttributionCookie();
            const supabase = createClient();
            const next = new URLSearchParams(window.location.search).get("next") || "/";
            await supabase.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
                queryParams: { prompt: "select_account" },
              },
            });
          }}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
        >
          <GoogleMark />
          Google
        </button>
      </div>

      {/* Apple: se muestra solo si hay client id configurado (variable
          NEXT_PUBLIC_APPLE_ENABLED). Apple exige este botón para poder
          publicar la app si se ofrece Google, pero el proveedor hay que
          darlo de alta antes en el panel de Supabase. */}
      {appleEnabled && (
        <button
          onClick={async () => {
            writeAttributionCookie();
            const supabase = createClient();
            const next = new URLSearchParams(window.location.search).get("next") || "/";
            await supabase.auth.signInWithOAuth({
              provider: "apple",
              options: {
                redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
              },
            });
          }}
          className={cn(buttonVariants({ variant: "dark", size: "lg" }), "mt-3 w-full")}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09l-.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Continuar con Apple
        </button>
      )}

      {/* Google y Apple crean la cuenta si aún no existe: se informa aquí de
          los textos legales que se aceptan con ese alta. */}
      <LegalConsentNote
        className="mt-3"
        action={appleEnabled ? "continuar con Google o Apple" : "continuar con Google"}
      />

      {/* Enlace mágico: acceso sin contraseña, para quien no la recuerda. */}
      <AuthDivider>o sin contraseña</AuthDivider>
      <MagicLinkButton />
      </>)}

      <div className="mt-8 space-y-2 border-t border-border-light pt-6 text-sm text-text-muted">
        <p>
          ¿No tienes cuenta?{" "}
          <Link href={withNext("/registro", nextParam)} className="link-underline font-semibold text-text-primary">
            Regístrate gratis
          </Link>
        </p>
        <p className="text-xs">
          ¿Eres inmobiliaria o propietario?{" "}
          <Link href="/negocio/alta" className="link-underline font-semibold text-text-primary">
            Crea tu cuenta de propietario
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
