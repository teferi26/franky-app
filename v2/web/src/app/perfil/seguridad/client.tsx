"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
  Trash2,
  KeyRound,
} from "lucide-react";
import {
  enrollTotp,
  verifyTotp,
  listFactors,
  unenroll,
  getAal,
  waitForAal2,
  type EnrollResult,
} from "@/lib/mfa";
import { sanitizeNext } from "@/lib/safe-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackFire } from "@/lib/analytics";

type Factor = { id: string; friendly_name?: string | null; status: string };

/**
 * Gestión del segundo factor (MFA) desde el perfil.
 *
 * Dos modos, según cómo se llegue:
 *   * Normal: el usuario entra a activar o quitar su MFA cuando quiere.
 *   * `?mfa=required`: le ha mandado el middleware porque intentaba entrar a
 *     /admin sin segundo factor. Se le explica y, al terminar, se le devuelve
 *     a donde iba (?next).
 */
export default function SeguridadClient() {
  const router = useRouter();
  const params = useSearchParams();
  const required = params.get("mfa") === "required";
  const next = sanitizeNext(params.get("next"));

  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [aal, setAal] = useState<{ current: string | null; next: string | null } | null>(null);
  const [enroll, setEnroll] = useState<EnrollResult | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // Tras el código correcto hay una espera real (cookie + revalidación). Sin
  // avisar, el formulario se vacía y parece que no ha pasado nada.
  const [elevating, setElevating] = useState(false);

  const refresh = useCallback(async () => {
    const [f, a] = await Promise.all([listFactors(), getAal()]);
    setFactors(f as Factor[]);
    setAal(a);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const verified = (factors ?? []).filter((f) => f.status === "verified");
  const hasVerified = verified.length > 0;
  // Sesión ya elevada a aal2: si venía obligado por el middleware, ya puede volver.
  const sessionElevated = aal?.current === "aal2";

  /**
   * Vuelve a donde el middleware nos echó, una sola vez y sin dejar al usuario
   * atrapado.
   *
   * Dos cosas hacían falta y faltaban las dos:
   *   1. Esperar a que la cookie con el token aal2 esté escrita (waitForAal2),
   *      porque si no el middleware lee aal1 y rebota otra vez aquí.
   *   2. router.refresh() antes de navegar: /admin ya está en el Router Cache
   *      del cliente CON la redirección a esta página (la pobló el intento
   *      inicial y los prefetch del Navbar). Al ser `replace` una navegación
   *      soft, sin invalidar el caché se reproduce la redirección y parece que
   *      el panel "no carga" hasta que recargas a mano.
   */
  const returning = useRef(false);
  const finishAndReturn = useCallback(async () => {
    if (returning.current) return;
    returning.current = true;
    setElevating(true);
    await waitForAal2();
    router.refresh();
    router.replace(next);
  }, [next, router]);

  useEffect(() => {
    if (required && sessionElevated) {
      void finishAndReturn();
    }
  }, [required, sessionElevated, finishAndReturn]);

  const startEnroll = async () => {
    setError("");
    setBusy(true);
    try {
      const result = await enrollTotp();
      setEnroll(result);
      // Rendimiento (sep-2026): la librería del QR (unos 25 KB gzip) solo se
      // descarga al iniciar el alta del segundo factor; el resto de la página
      // de seguridad (y quien solo viene a verificar) no la necesita.
      const { default: QRCode } = await import("qrcode");
      setQr(await QRCode.toDataURL(result.totpUri, { margin: 1, width: 220 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar la activación.");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enroll) return;
    setError("");
    setBusy(true);
    try {
      await verifyTotp(enroll.factorId, code);
      trackFire("cta_clicked", { action: "mfa_enabled" });
      setEnroll(null);
      setQr(null);
      setCode("");
      await refresh();
      if (required) await finishAndReturn();
    } catch {
      setError("Código incorrecto o caducado. Mira la app y prueba con el código actual.");
    } finally {
      setBusy(false);
    }
  };

  // Ya tiene factor pero la sesión es aal1 (entró solo con contraseña): hay que
  // pedir el código para elevar ESTA sesión, no inscribir uno nuevo.
  const elevateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifyTotp(verified[0].id, code);
      setCode("");
      await refresh();
      if (required) await finishAndReturn();
    } catch {
      setError("Código incorrecto o caducado.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (factorId: string) => {
    setError("");
    setBusy(true);
    try {
      await unenroll(factorId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar el factor.");
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!enroll) return;
    try {
      await navigator.clipboard.writeText(enroll.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin portapapeles: el secreto ya está a la vista */
    }
  };

  if (factors === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="eyebrow">Mi cuenta</p>
      <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
        Seguridad de la cuenta
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-muted">
        Añade un segundo factor y nadie podrá entrar solo con tu contraseña.
      </p>

      {required && !sessionElevated && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold text-text-primary">
              El panel de administración requiere segundo factor
            </p>
            <p className="mt-1 text-text-muted">
              {hasVerified
                ? "Introduce el código de tu app de autenticación para continuar."
                : "Actívalo aquí una vez y podrás entrar. Te llevará menos de un minuto."}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-error/5 p-3 text-sm text-error">
          {error}
        </p>
      )}

      {/* Estado actual */}
      <div className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
        <div className="flex items-start gap-3">
          <span className={hasVerified ? "mt-0.5 text-success" : "mt-0.5 text-text-muted"}>
            {hasVerified ? <ShieldCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
          </span>
          <div>
            <p className="font-heading font-extrabold text-text-primary">
              {hasVerified ? "Segundo factor activo" : "Sin segundo factor"}
            </p>
            <p className="text-sm text-text-muted">
              {hasVerified
                ? sessionElevated
                  ? "Esta sesión ya está verificada."
                  : "Tienes MFA, pero esta sesión aún no lo ha usado."
                : "Tu cuenta se protege solo con la contraseña."}
            </p>
          </div>
        </div>

        {/* Elevar sesión existente (tiene factor, sesión aal1). */}
        {hasVerified && !sessionElevated && !enroll && (
          <form onSubmit={elevateSession} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="mfa-elevate" className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
                Código de tu app
              </label>
              <Input
                id="mfa-elevate"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="tabular w-32 text-center text-lg tracking-widest"
              />
            </div>
            <Button type="submit" disabled={code.length !== 6} loading={busy || elevating}>
              {elevating ? "Entrando…" : "Verificar"}
            </Button>
            {elevating && (
              <p className="w-full text-xs text-text-muted">
                Código correcto. Abriendo el panel…
              </p>
            )}
          </form>
        )}

        {/* Lista de factores para quitar. */}
        {hasVerified && sessionElevated && (
          <ul className="mt-4 space-y-2">
            {verified.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-xl border border-border-light px-4 py-2.5"
              >
                <span className="text-sm">{f.friendly_name || "App de autenticación"}</span>
                <button
                  onClick={() => remove(f.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-text-muted transition-colors hover:bg-error/5 hover:text-error"
                >
                  <Trash2 className="h-4 w-4" /> Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Alta de un factor nuevo. */}
      {!hasVerified && !enroll && (
        <Button onClick={startEnroll} size="lg" loading={busy} className="mt-8">
          {!busy && <ShieldCheck className="h-4 w-4" />}
          Activar segundo factor
        </Button>
      )}

      {enroll && qr && (
        <div className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
          <h2 className="font-heading text-xl font-extrabold text-text-primary">Escanea el código</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Ábrelo con Google Authenticator, Authy, 1Password o la app que uses, y
            luego escribe el código de 6 dígitos que te muestre.
          </p>
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Image
              src={qr}
              alt="Código QR para configurar el segundo factor"
              width={180}
              height={180}
              className="rounded-xl border border-border"
              unoptimized
            />
            <div className="flex-1">
              <p className="text-xs font-medium text-text-muted">¿No puedes escanear?</p>
              <button
                onClick={copySecret}
                className="mt-1 inline-flex items-center gap-2 rounded-lg border border-border bg-bg-secondary/50 px-3 py-2 font-mono text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {enroll.secret}
              </button>

              <form onSubmit={confirmEnroll} className="mt-4">
                <label htmlFor="mfa-code" className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
                  Código de la app
                </label>
                <div className="flex gap-2">
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    className="tabular w-32 text-center text-lg tracking-widest"
                  />
                  <Button type="submit" disabled={code.length !== 6} loading={busy}>
                    Confirmar
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
