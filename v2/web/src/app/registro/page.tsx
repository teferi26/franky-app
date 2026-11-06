"use client";

import { useState, useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import AuthShell, { AuthDivider, AuthNotice, GoogleMark } from "@/app/auth/AuthShell";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { attributionAsAuthMetadata, writeAttributionCookie } from "@/lib/attribution";
import { withNext, sanitizeNext, isProOnboardingNext } from "@/lib/safe-next";
import Link from "next/link";
import { Mail, Eye, EyeOff, AlertCircle, Users, Home, Sparkles, ArrowRight, Ticket } from "lucide-react";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import InAppBrowserBanner from "@/components/InAppBrowserBanner";
import { passwordSchema, isPwnedPassword, PASSWORD_MIN_LENGTH, PWNED_PASSWORD_MESSAGE } from "@/lib/password-strength";
import LegalConsentNote from "./LegalConsentNote";
import { trackFire } from "@/lib/analytics";
import { persistExplicitGrowthCode } from '@/lib/growth-attribution';
import { isInAppBrowser, openInExternalBrowser } from "@/lib/in-app-browser";

export const dynamic = 'force-dynamic'

export default function RegistroPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState('');
  const [linkedInvitation, setLinkedInvitation] = useState('');
  // El código de invitación va plegado: la mayoría no tiene uno y, como primer
  // campo, frenaba el alta. Se despliega relleno si llega por /r/[código].
  const [showInvite, setShowInvite] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Hasta que React no hidrata, el onSubmit de abajo no existe: si alguien
  // pulsa antes (móvil lento, conexión mala, webview), el navegador envía el
  // formulario de forma NATIVA por GET y la contraseña acaba en la URL, en el
  // historial del navegador y en los logs del servidor. El botón se mantiene
  // desactivado hasta estar hidratado.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const router = useRouter();
  // Registro con email plegado: Google es la vía primaria (arriba) y el correo
  // queda como opción secundaria, plegada bajo el separador (M-UX-001).
  const [showEmailForm, setShowEmailForm] = useState(false);
  // Dentro de webviews (Instagram/TikTok, donde aterrizan /tafa, /pau y /new)
  // Google no puede funcionar: se oculta y el email es la única vía.
  const [inApp, setInApp] = useState(false);
  // Destino tras registrarse (p. ej. /crush si vienes del cartel). Llega como
  // ?next=… desde el enlace de /login, que lo hereda del middleware.
  const [nextParam, setNextParam] = useState<string | null>(null);
  useEffect(() => {
    setNextParam(new URLSearchParams(window.location.search).get("next"));
    const invite = new URLSearchParams(window.location.search).get('invite');
    // /r/[código] redirige aquí con ?invite=<código>. OJO: ?ref=<campaña> es
    // otra cosa (atribución de carteles QR, ver lib/attribution.ts), no un
    // código de invitación, así que no se usa para rellenar este campo.
    if (invite && /^[a-z0-9][a-z0-9_-]{5,63}$/i.test(invite)) {
      setLinkedInvitation(invite);
      setInvitationCode(invite);
      setShowInvite(true);
    }
    // Dentro de un webview (Instagram/TikTok…) el email es la única vía que
    // funciona seguro sin salir de la app: lo desplegamos de serie y ocultamos
    // Google (ahí Google bloquea su OAuth, no es decisión nuestra).
    if (isInAppBrowser()) {
      setShowEmailForm(true);
      setInApp(true);
    }
  }, []);

  // OAuth con Google: cookie de atribución, ?next saneado vía withNext y
  // redirección al callback.
  const handleOAuth = async (provider: "google") => {
    // En webviews de apps (Instagram, TikTok…) no existe la sesión de Google
    // del dispositivo: el usuario acabaría tecleando su email (o Google
    // bloquearía el flujo). Mejor saltar directamente al navegador real, donde
    // el selector de cuentas sí aparece. El banner de arriba explica el porqué.
    if (provider === "google" && isInAppBrowser()) {
      // Si la app bloquea el salto (Instagram lo hace en muchas versiones),
      // enseñamos la salida manual y dejamos el formulario de email a la vista.
      openInExternalBrowser(undefined, () => {
        setShowEmailForm(true);
        setError(
          "¿No se ha abierto tu navegador? Toca el menú ⋯ de arriba y elige «Abrir en el navegador externo», o crea tu cuenta con email aquí mismo."
        );
      });
      return;
    }
    writeAttributionCookie();
    persistExplicitGrowthCode(invitationCode);
    const supabase = createClient();
    const next = new URLSearchParams(window.location.search).get("next");
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}${withNext("/auth/callback", next)}`,
        ...(provider === "google"
          ? { queryParams: { prompt: "select_account" } }
          : {}),
      },
    });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const pwCheck = passwordSchema.safeParse(password);
    if (!pwCheck.success) {
      setError(pwCheck.error.issues[0]?.message ?? "Contraseña no válida");
      return;
    }
    // HaveIBeenPwned check (k-anonymity; only the SHA-1 prefix leaves the browser).
    // We surface this as a warning the user has to clear — fail open if HIBP is down.
    try {
      if (await isPwnedPassword(password)) {
        setError(PWNED_PASSWORD_MESSAGE);
        return;
      }
    } catch {
      // Ignore HIBP errors; we don't want to block signup if the service is down.
    }
    setLoading(true);

    // El servidor crea la cuenta YA confirmada (sin email de confirmación:
    // el SMTP de Supabase fallaba y el round-trip mataba el embudo) y aquí
    // iniciamos sesión al momento: del formulario directo al onboarding.
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password, attribution: { ...attributionAsAuthMetadata(), ...(invitationCode.trim() ? { growth_explicit_code: invitationCode.trim() } : {}) } }),
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
      // Cuenta creada pero login fallido (rarísimo): que al menos pueda entrar a mano.
      setError("Cuenta creada. Inicia sesión con tu email y contraseña.");
      setLoading(false);
      return;
    }

    // Embudo de alta: sin esto no se puede saber cuánta gente llega a crear la
    // cuenta y cuánta se cae antes (la web no emitía ni un evento de producto).
    trackFire("signup_completed", { method: "email" });

    const next = new URLSearchParams(window.location.search).get("next");
    router.push(isProOnboardingNext(next) ? sanitizeNext(next) : withNext("/onboarding", next));
    router.refresh();
  };

  // Piezas de la pantalla. El orden cambia en webviews (ver abajo).
  const minimap = (
    <>
      {/* Mini-mapa del camino: crea la expectativa de un proceso corto y
          con final feliz (el registro se percibía tedioso por no saber
          cuánto quedaba ni para qué servía). */}
      <ol className="mb-6 flex items-center gap-2 text-[11px] font-medium text-text-muted">
        <li className="flex items-center gap-1.5 font-semibold text-text-primary">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet text-[10px] font-bold text-white tabular">1</span>
          Tu cuenta
        </li>
        <li className="h-px w-5 bg-border" aria-hidden="true" />
        <li className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-bold text-text-muted tabular">2</span>
          Tu perfil
        </li>
        <li className="h-px w-5 bg-border" aria-hidden="true" />
        <li>Dentro</li>
      </ol>
    </>
  );

  const notices = (
    <>
      {/* Aviso solo visible dentro de webviews (Instagram/TikTok…): ahí el
          login con Google no muestra el selector de cuentas. */}
      <InAppBrowserBanner className="mb-5" />
      {linkedInvitation && <div className="mb-5 rounded-xl border border-border p-4 text-sm"><p>Tienes una invitación a Franky. Crea tu cuenta aquí y después entra en la app con la misma cuenta.</p><p className="mt-2">Tu código ya está puesto en el formulario: <strong className="break-all">{linkedInvitation}</strong>.</p><a className="mt-2 inline-block text-violet underline" href={`/r/${encodeURIComponent(linkedInvitation)}?install=android`}>Instalar desde Google Play con esta invitación</a></div>}
    </>
  );

  const benefits = (
    <>
      {/* Qué gano registrándome: 3 beneficios concretos, visibles antes del
          formulario para que el esfuerzo tenga lógica. */}
      <ul className="mb-6 space-y-2">
        {[
          { icon: Users, label: "Gente de tu uni y tu carrera" },
          { icon: Home, label: "Tu roomie más compatible" },
          { icon: Sparkles, label: "Becas y notas de corte" },
        ].map((b, i) => (
          <li
            key={b.label}
            className="flex items-center gap-2.5 text-sm text-text-secondary animate-list-in"
            style={{ "--i": i } as React.CSSProperties}
          >
            <b.icon className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
            {b.label}
          </li>
        ))}
      </ul>
    </>
  );

  const authOptions = (
    <>
      {/* Vía primaria: registro con Google. Grande y arriba del pliegue para
          que el embudo de los QR del campus no muera en un formulario de
          email (M-UX-001). Oculto en webviews: ahí Google no funciona. */}
      {!inApp && (<>
      <button
        type="button"
        onClick={() => handleOAuth("google")}
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
      >
        <GoogleMark className="h-5 w-5" />
        Continuar con Google
      </button>

      {/* Separador hacia la vía secundaria (correo). */}
      <AuthDivider>o con tu correo</AuthDivider>
      </>)}

      {/* Formulario de email plegado: sigue disponible, pero ya no domina la
          pantalla. Al abrirlo se despliega in situ (sin recargar). */}
      {!showEmailForm ? (
        <button
          type="button"
          onClick={() => setShowEmailForm(true)}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
        >
          <Mail className="h-4 w-4" />
          Registrarme con email y contraseña
        </button>
      ) : (
      <form onSubmit={handleRegister} className="space-y-5 animate-fade-in">
        {error && (
          <AuthNotice tone="error" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}>
            {error}
          </AuthNotice>
        )}

        <Field id="signup-name" label="Nombre">
          {/* name + autoComplete: sin ellos el autorrelleno del móvil y
              los gestores de contraseñas no reconocían el formulario. */}
          <Input
            id="signup-name"
            name="name"
            type="text"
            autoComplete="given-name"
            autoCapitalize="words"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Tu nombre"
            aria-invalid={error ? true : undefined}
          />
        </Field>

        <Field id="signup-email" label="Email">
          <Input
            id="signup-email"
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

        <div>
          <label htmlFor="signup-password" className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
            Contraseña
          </label>
          <div className="relative">
            <Input
              id="signup-password"
              name="new-password"
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              placeholder={`Mín. ${PASSWORD_MIN_LENGTH} caracteres. Una frase que recuerdes vale`}
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

        {showInvite ? (
          <Field id="signup-invitation" label="Código de invitación (opcional)">
            <Input id="signup-invitation" value={invitationCode} onChange={(e) => setInvitationCode(e.target.value)} maxLength={64} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Si alguien te ha invitado, escribe su código" />
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            aria-expanded={false}
            aria-controls="signup-invitation"
            className="link-underline inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            <Ticket className="h-4 w-4" aria-hidden="true" />
            ¿Tienes código de invitación?
          </button>
        )}

        <Button type="submit" size="lg" loading={loading} disabled={!hydrated} className="group w-full">
          {loading ? "Creando tu cuenta…" : "Crear cuenta gratis"}
          {!loading && <ArrowRight className="h-4 w-4 arrow-nudge" />}
        </Button>
      </form>
      )}

      <LegalConsentNote className="mt-4" />
    </>
  );

  return (
    <AuthShell
      eyebrow="Crear cuenta"
      title="Únete a tu comunidad universitaria"
      subtitle="Gratis y en menos de 1 minuto."
      asideEyebrow="Comunidad universitaria de España"
      aside={
        <>
          Gente de tu uni,
          <br />
          becas, piso y planes.
          <br />
          <span className="text-violet">Todo en un sitio.</span>
        </>
      }
    >
      {/* Dentro de webviews (Instagram/TikTok…) el formulario de email es la
          única vía y va desplegado ARRIBA: ahí se aterriza desde /tafa, /pau
          y /new, y los beneficios y el minimapa lo empujaban por debajo del
          pliegue. Fuera de webviews se mantiene el orden de siempre. */}
      {inApp ? (
        <>
          {notices}
          {authOptions}
          <div className="mt-8">
            {minimap}
            {benefits}
          </div>
        </>
      ) : (
        <>
          {minimap}
          {notices}
          {benefits}
          {authOptions}
        </>
      )}

      <div className="mt-8 border-t border-border-light pt-6 text-sm text-text-muted">
        <p>
          ¿Ya tienes cuenta?{" "}
          <Link href={withNext("/login", nextParam)} className="link-underline font-semibold text-text-primary">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
