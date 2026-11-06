"use client";

// Verificacion del correo universitario (migracion 025), version web.
//
// Flujo completo:
//   1. El usuario escribe su correo oficial de la universidad.
//   2. POST /api/auth/student-verification: el servidor llama a la RPC
//      request_student_email_verification (valida dominio academico, genera
//      token de 24h) y envia el correo con el enlace. El token nunca baja al
//      navegador en este paso.
//   3. El enlace del correo vuelve a esta misma pagina con ?token=... y aqui
//      se llama a confirm_student_email (concedida a authenticated): el badge
//      queda activo y VerifiedBadge lo pinta en toda la web.
//
// Honestidad: si el emisor de correo no esta operativo (Resend sin configurar
// o caido), el servidor lo dice y aqui se muestra tal cual, sin fingir envios.
// Fail-soft en todas las lecturas.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, ArrowLeft, BadgeCheck, Loader2, MailCheck, MailX, Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { isNonStudentRole } from "@/lib/roles";
import VerifiedBadge from "@/components/VerifiedBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN_S = 60;

type Phase =
  | "cargando"      // comprobando sesion / perfil / token
  | "confirmando"   // consumiendo el token del enlace
  | "confirmado"    // token consumido con exito: badge conseguido
  | "ya-verificado" // el perfil ya tenia el badge
  | "formulario"    // pedir el correo
  | "enviado"       // correo enviado de verdad
  | "sin-emisor";   // solicitud registrada pero el correo NO salio

// Mensajes para los codigos de error de la RPC y del endpoint.
function humanRequestError(code: string): string {
  switch (code) {
    case "unsupported_domain":
      return "Ese dominio no es de una universidad reconocida. Usa tu correo oficial de estudiante (por ejemplo nombre@alu.ua.es o nombre@estudiantes.unizar.es).";
    case "invalid_email":
      return "Ese email no parece válido. Revísalo e inténtalo de nuevo.";
    case "email_taken":
      return "Ese correo ya está verificado en otra cuenta.";
    case "unauthorized":
      return "Tu sesión ha caducado. Recarga la página y vuelve a entrar.";
    case "rate_limited":
      return "Has pedido demasiadas verificaciones seguidas. Espera una hora e inténtalo de nuevo.";
    case "send_failed":
      return "No se pudo enviar el correo. Inténtalo de nuevo en un rato.";
    default:
      return "No se pudo completar la solicitud. Inténtalo de nuevo.";
  }
}

function humanConfirmError(raw: string): string {
  if (raw.includes("invalid_or_expired_token")) {
    return "Este enlace ya no es válido: caduca a las 24 horas y solo se puede usar una vez. Pide uno nuevo aquí abajo.";
  }
  if (raw.includes("email_taken")) {
    return "Ese correo ya está verificado en otra cuenta, así que este enlace no se puede usar.";
  }
  return "No se pudo confirmar la verificación. Pide un enlace nuevo aquí abajo.";
}

export default function VerificarEstudianteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<Phase>("cargando");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // El token solo debe consumirse una vez aunque el efecto corra dos veces
  // (StrictMode en desarrollo): sin este candado, la segunda llamada veria
  // used_at ya puesto y pintaria un error falso.
  const confirmStarted = useRef(false);

  // Cuenta atras del boton de reenvio.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Carga el estado del perfil (badge ya conseguido / correo pendiente).
  const loadProfile = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // El middleware ya protege la ruta; esto es solo el cinturon.
      router.replace("/login?next=/perfil/verificar-estudiante");
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("student_email, student_email_verified, role")
      .eq("id", user.id)
      .maybeSingle();
    // Un propietario (o un gestor de universidad) no tiene correo de estudiante
    // que verificar: si llega aqui por un enlace viejo, vuelve a su perfil en
    // lugar de encontrarse un formulario que le pide su correo de la uni.
    if (isNonStudentRole(data?.role as string | null)) {
      router.replace("/perfil");
      return;
    }
    if (data?.student_email_verified === true) {
      setPhase("ya-verificado");
      return;
    }
    // Prefill con el correo pendiente si lo hay (mismo gesto que la app).
    if (data?.student_email) setEmail(String(data.student_email));
    setPhase("formulario");
  }, [router]);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token && !confirmStarted.current) {
      confirmStarted.current = true;
      (async () => {
        setPhase("confirmando");
        const supabase = createClient();
        const { error: rpcErr } = await supabase.rpc("confirm_student_email", {
          p_token: token,
        });
        // El token se quita de la URL en cuanto se ha intentado usar: asi un
        // refresco de la pagina no reintenta consumir un token ya gastado.
        router.replace("/perfil/verificar-estudiante");
        if (!rpcErr) {
          setPhase("confirmado");
          return;
        }
        // Si fallo, puede que el perfil ya este verificado por otro enlace:
        // se comprueba antes de ensenar el error.
        setConfirmError(humanConfirmError(rpcErr.message ?? ""));
        await loadProfile();
      })();
      return;
    }
    if (!token && phase === "cargando") {
      loadProfile();
    }
    // phase se omite a proposito: el efecto solo debe decidir en el arranque.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loadProfile, router]);

  const emailLooksOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const submit = useCallback(async () => {
    if (!emailLooksOk || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/student-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.sent === true) {
        setSentTo(String(body.email ?? email.trim()));
        setPhase("enviado");
        setCooldown(RESEND_COOLDOWN_S);
      } else if (res.status === 503 && body?.error === "email_not_configured") {
        // El hueco historico: la solicitud queda registrada en la base pero el
        // servidor no tiene emisor de correo activo. Se cuenta la verdad.
        setSentTo(email.trim());
        setPhase("sin-emisor");
      } else if (res.status === 429) {
        setError(humanRequestError("rate_limited"));
      } else {
        setError(humanRequestError(String(body?.error ?? "")));
      }
    } catch {
      setError("No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.");
    }
    setBusy(false);
  }, [email, emailLooksOk, busy]);

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera con la vuelta al perfil, como el resto de subpaginas */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
          <Link
            href="/perfil"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Mi perfil
          </Link>
          <p className="eyebrow mt-6">Mi cuenta</p>
          <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
            Distintivo de estudiante
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-muted">
            Confirma tu correo oficial de la universidad (no el de tu cuenta) y
            lleva el distintivo junto a tu nombre en todo Franky.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 pb-20 pt-8">
        <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
          {phase === "cargando" || phase === "confirmando" ? (
            <div className="py-10 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-violet mx-auto" />
              <p className="text-sm text-text-muted mt-3">
                {phase === "confirmando"
                  ? "Confirmando tu correo universitario..."
                  : "Cargando..."}
              </p>
            </div>
          ) : phase === "confirmado" ? (
            <div className="py-6 text-center">
              <BadgeCheck className="mx-auto mb-5 h-7 w-7 text-success" aria-hidden="true" />
              <h2 className="text-fluid-h2 font-extrabold text-text-primary">
                Correo confirmado
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-text-muted">
                Ya tienes el distintivo de estudiante verificado. Desde ahora
                acompaña a tu nombre en tu perfil, en RoomieMatch y en el resto
                de Franky.
              </p>
              <div className="mt-4 flex justify-center">
                <VerifiedBadge verified size="md" withLabel />
              </div>
              <Link
                href="/perfil"
                className={cn(buttonVariants({ size: "lg" }), "mt-8")}
              >
                Volver a mi perfil
              </Link>
            </div>
          ) : phase === "ya-verificado" ? (
            <div className="py-6 text-center">
              <BadgeCheck className="mx-auto mb-5 h-7 w-7 text-success" aria-hidden="true" />
              <h2 className="text-fluid-h2 font-extrabold text-text-primary">
                Ya estás verificado
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-text-muted">
                Tu correo universitario ya está confirmado y luces el distintivo
                de estudiante verificado.
              </p>
              <div className="mt-4 flex justify-center">
                <VerifiedBadge verified size="md" withLabel />
              </div>
              <Link
                href="/perfil"
                className={cn(buttonVariants({ size: "lg" }), "mt-8")}
              >
                Volver a mi perfil
              </Link>
            </div>
          ) : phase === "enviado" ? (
            <div className="py-6 text-center">
              <MailCheck className="mx-auto mb-5 h-7 w-7 text-violet" aria-hidden="true" />
              <h2 className="text-fluid-h2 font-extrabold text-text-primary">
                Revisa tu correo
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-text-muted">
                Hemos enviado un enlace de verificación a{" "}
                <span className="font-semibold text-text-primary">{sentTo}</span>.
                Ábrelo para conseguir tu distintivo. Caduca en 24 horas y, si no
                lo ves, mira en la carpeta de spam.
              </p>
              {error && (
                <p className="mt-4 text-sm text-error flex items-center justify-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </p>
              )}
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || cooldown > 0}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {cooldown > 0 ? `Reenviar en ${cooldown} s` : "Reenviar el correo"}
                </button>
                <Link
                  href="/perfil"
                  className="link-underline text-sm font-medium text-text-primary"
                >
                  Volver a mi perfil
                </Link>
              </div>
            </div>
          ) : phase === "sin-emisor" ? (
            <div className="py-6 text-center">
              <MailX className="mx-auto mb-5 h-7 w-7 text-warning" aria-hidden="true" />
              <h2 className="text-fluid-h2 font-extrabold text-text-primary">
                El correo no ha podido salir
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-text-muted">
                Tu solicitud para{" "}
                <span className="font-semibold text-text-primary">{sentTo}</span>{" "}
                ha quedado registrada, pero el envío de correos no está operativo
                en este momento, así que el enlace de verificación NO ha llegado
                a tu bandeja. Inténtalo de nuevo más tarde.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setPhase("formulario")}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  Volver a intentarlo
                </button>
                <Link
                  href="/perfil"
                  className="link-underline text-sm font-medium text-text-primary"
                >
                  Volver a mi perfil
                </Link>
              </div>
            </div>
          ) : (
            <div>
              {/* Aviso de un token de enlace que no se pudo consumir */}
              {confirmError && (
                <div className="mb-5 flex items-start gap-2 rounded-xl border border-warning/20 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{confirmError}</span>
                </div>
              )}

              <div>
                <BadgeCheck className="h-5 w-5 text-violet" aria-hidden="true" />
                <h2 className="mt-4 font-heading text-xl font-extrabold leading-tight text-text-primary">
                  Verifica tu correo universitario
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  Te enviaremos un enlace a ese correo. Al abrirlo, el
                  distintivo queda activo al momento.
                </p>
              </div>

              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <label
                  htmlFor="student-email"
                  className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary"
                >
                  Correo de tu universidad
                </label>
                <Input
                  id="student-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  placeholder="tunombre@alu.universidad.es"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                />
                <p className="mt-2 text-xs leading-relaxed text-text-muted">
                  Vale cualquier dominio académico reconocido: alu.ua.es,
                  gcloud.ua.es, estudiantes.unizar.es, alu.umh.es y muchos más.
                  Es distinto del correo con el que entras en tu cuenta.
                </p>
                {error && (
                  <p className="mt-3 text-sm text-error flex items-start gap-1.5">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
                  </p>
                )}
                <Button type="submit" size="lg" disabled={!emailLooksOk} loading={busy} className="mt-5">
                  {!busy && <Send className="h-4 w-4" />}
                  {busy ? "Enviando..." : "Enviar enlace de verificación"}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
