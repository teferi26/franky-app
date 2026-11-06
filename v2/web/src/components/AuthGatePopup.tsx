"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, GraduationCap, Heart, X, AlertCircle, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase-client";
import { useSession } from "@/components/SessionProvider";
import { writeAttributionCookie } from "@/lib/attribution";
import { isInAppBrowser, openInExternalBrowser } from "@/lib/in-app-browser";
import InAppBrowserBanner from "@/components/InAppBrowserBanner";

const DISMISS_KEY = "franky_authgate_dismissed";
const SCROLL_THRESHOLD = 300;

type AuthState = "loading" | "anon" | "authed";

const BANNER_DISMISS_KEY = "franky_authgate_banner_dismissed";

export default function AuthGatePopup() {
  const pathname = usePathname();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [showPopup, setShowPopup] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Elemento que tenia el foco antes de abrir el modal, para devolverlo al cerrar.
  const openerRef = useRef<HTMLElement | null>(null);

  // Only active on the home page
  const onHome = pathname === "/";

  // La sesión sale del contexto compartido: este componente hacía su propio
  // getUser(), el tercero de la misma carga junto con Navbar y LazyChrome.
  const { user: sessionUser, loading: sessionLoading } = useSession();
  useEffect(() => {
    setAuthState(sessionLoading ? "loading" : sessionUser ? "authed" : "anon");
  }, [sessionUser, sessionLoading]);

  // Read dismissed flag from sessionStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
    }
    if (sessionStorage.getItem(BANNER_DISMISS_KEY) === "1") {
      setBannerDismissed(true);
    }
  }, []);

  // Scroll trigger: open popup once the user scrolls past threshold (only on home, only anon, only once)
  useEffect(() => {
    if (!onHome || authState !== "anon" || dismissed || showPopup) return;

    const handleScroll = () => {
      if (window.scrollY > SCROLL_THRESHOLD) {
        setShowPopup(true);
      }
    };

    // Check current scroll position (in case user already scrolled past)
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [onHome, authState, dismissed, showPopup]);

  // Auto-open after a delay as a fallback so visitors who don't scroll still see it.
  // 30s gives slow connections (and dev-mode compiles) enough time to settle before
  // the popup appears — shorter values can fire before the hero is even visible.
  useEffect(() => {
    if (!onHome || authState !== "anon" || dismissed || showPopup) return;
    const t = setTimeout(() => setShowPopup(true), 30000);
    return () => clearTimeout(t);
  }, [onHome, authState, dismissed, showPopup]);

  // Accesibilidad del modal: al abrir, guardar el elemento con foco, mover el
  // foco dentro del dialogo, atrapar Tab y cerrar con Escape. Al cerrar, devolver
  // el foco al elemento que lo abrio.
  useEffect(() => {
    if (!showPopup) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    // Mover el foco al primer elemento interactivo del dialogo.
    const focusable = getFocusable();
    (focusable[0] ?? dialog).focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleDismiss();
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Devolver el foco al elemento que abrio el modal si sigue en el documento.
      const opener = openerRef.current;
      if (opener && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [showPopup]);

  // Aviso cuando estamos en un webview y el salto al navegador real falla.
  const [webviewMsg, setWebviewMsg] = useState<string | null>(null);
  // En webviews (Instagram/TikTok) Google no puede funcionar: el botón ni se
  // pinta y el CTA es «Crear cuenta» (email). Detectado en useEffect para no
  // romper la hidratación.
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setInApp(isInAppBrowser());
  }, []);

  const handleGoogleLogin = async () => {
    // Dentro del webview de Instagram/TikTok el OAuth de Google no funciona
    // (403 disallowed_useragent): saltamos al navegador real y, si la app
    // bloquea el salto, enseñamos la salida manual en vez de un botón muerto.
    if (isInAppBrowser()) {
      openInExternalBrowser(undefined, () =>
        setWebviewMsg(
          "¿No se ha abierto tu navegador? Toca el menú ⋯ de arriba y elige «Abrir en el navegador externo», o crea tu cuenta con email desde «Crear cuenta»."
        )
      );
      return;
    }
    // First-touch (UTMs del embajador) → cookie efímera que lee /auth/callback.
    writeAttributionCookie();
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  const handleDismiss = () => {
    setShowPopup(false);
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Storage may be unavailable (private mode); ignore.
    }
  };

  // Don't render anything if not on home, still loading, or authenticated
  if (!onHome || authState !== "anon") return null;

  return (
    // reducedMotion vivía en el MotionConfig global de AppProviders; al sacar
    // framer-motion del árbol raíz, cada isla de motion.* lo declara en local.
    //
    // Diseño v3: el modal es una hoja blanca con borde hairline y la sombra
    // flotante del sistema. Sin banda de degradado arriba: el logo va suelto,
    // el titular en Outfit grande y los tres argumentos como lista limpia con
    // el icono suelto. Botones del sistema (dark, default, outline).
    <MotionConfig reducedMotion="user">
      {/* Main popup */}
      <AnimatePresence>
        {showPopup && (
          <motion.div
            key="authgate-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-bg-dark/50 px-3 sm:items-center sm:px-4"
            onClick={handleDismiss}
            role="dialog"
            aria-modal="true"
            aria-labelledby="authgate-title"
          >
            <motion.div
              ref={dialogRef}
              tabIndex={-1}
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-float focus:outline-none"
            >
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Cerrar"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors duration-200 hover:bg-bg-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="px-6 pt-8 sm:px-8">
                <Image
                  src="/img/franky-icon.png"
                  alt="Franky"
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-[13px]"
                />
                <p className="eyebrow mt-5">Comunidad universitaria de España</p>
                <h2
                  id="authgate-title"
                  className="mt-2 font-heading text-[26px] font-extrabold leading-[1.08] tracking-tight text-text-primary sm:text-3xl"
                >
                  La mayor comunidad de estudiantes de España
                </h2>
                <p className="mt-2 text-sm text-text-muted sm:text-[15px]">
                  Estamos creando algo único. Únete gratis y forma parte.
                </p>
              </div>

              {/* Body */}
              <div className="px-6 pb-6 pt-5 sm:px-8">
                <ul className="mb-6 divide-y divide-border-light border-y border-border-light">
                  {[
                    { icon: GraduationCap, strong: "Carreras, becas y notas de corte", rest: "al día" },
                    { icon: Heart, strong: "Alojamiento y RoomieMatch", rest: "para encontrar tu piso y tu gente" },
                    { icon: Users, strong: "Eventos y vida social", rest: "en tu ciudad universitaria" },
                  ].map(({ icon: Icon, strong, rest }, i) => (
                    <li
                      key={strong}
                      className="flex items-start gap-3 py-2.5 animate-list-in"
                      style={{ ["--i" as string]: i + 2 }}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
                      <p className="text-sm text-text-secondary">
                        <span className="font-semibold text-text-primary">{strong}</span> {rest}
                      </p>
                    </li>
                  ))}
                </ul>

                {/* Solo visible dentro de webviews (Instagram/TikTok…): explica
                    por qué Google no funciona ahí y da el salto al navegador. */}
                <InAppBrowserBanner className="mb-4" />

                {webviewMsg && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-error/20 bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {webviewMsg}
                  </div>
                )}

                {!inApp && (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className={cn(buttonVariants({ variant: "dark", size: "lg" }), "w-full")}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continuar con Google
                </button>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Link href="/registro" className={cn(buttonVariants(), "btn-shine w-full")}>
                    Crear cuenta
                  </Link>
                  <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                    Iniciar sesión
                  </Link>
                </div>

                <button
                  type="button"
                  onClick={handleDismiss}
                  className="link-underline mx-auto mt-4 block text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
                >
                  Más tarde
                </button>

                <p className="mt-3 text-center text-[11px] leading-relaxed text-text-muted">
                  Es gratis. Sin spam. Al continuar aceptas los{" "}
                  <Link href="/terminos" className="underline underline-offset-2 hover:text-text-primary">
                    términos
                  </Link>{" "}
                  y la{" "}
                  <Link href="/privacidad" className="underline underline-offset-2 hover:text-text-primary">
                    privacidad
                  </Link>
                  .
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky banner after dismiss: píldora casi negra con la sombra
          flotante, la única superficie oscura de esta pieza. */}
      <AnimatePresence>
        {dismissed && !showPopup && !bannerDismissed && (
          <motion.div
            key="authgate-banner"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="fixed left-1/2 z-[9997] w-[calc(100%-1rem)] max-w-md -translate-x-1/2"
            style={{ bottom: "calc(var(--cookie-bar-offset, 0px) + 12px)" }}
          >
            <div className="flex items-center gap-2 rounded-full bg-bg-dark py-2 pl-4 pr-2 text-white shadow-float">
              <p className="min-w-0 flex-1 truncate text-xs sm:text-sm">
                Únete a la mayor comunidad de estudiantes
              </p>
              <button
                type="button"
                onClick={() => setShowPopup(true)}
                className="group inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors duration-200 hover:bg-violet-50"
              >
                Crear cuenta
                <ArrowRight className="h-3 w-3 arrow-nudge" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setBannerDismissed(true);
                  try {
                    sessionStorage.setItem(BANNER_DISMISS_KEY, "1");
                  } catch {
                    // ignore (private mode)
                  }
                }}
                aria-label="Cerrar"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
