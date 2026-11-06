"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Apple, Smartphone, X } from "lucide-react";
import { detectClientPlatform, storeUrlForPlatform } from "@/lib/device";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "franky_app_banner_dismissed";

/**
 * Banda discreta y descartable, SOLO en móvil (iOS/Android), que invita a
 * abrir/instalar la app de Franky. Sigue el mismo patrón visual y de
 * animación que CookieConsent: barra flotante compacta, blanca y opaca, con
 * la sombra flotante del sistema, sin tapar contenido crítico.
 *
 * - Se descarta con la X y no vuelve a salir (se recuerda en localStorage).
 * - En escritorio no se monta nada (ni siquiera un div vacío).
 * - Mientras la app no esté publicada en la tienda de esa plataforma
 *   (APP_STORE_ID / ANDROID_PACKAGE_NAME a null en lib/device.ts) muestra un
 *   texto de "muy pronto" SIN botón que enlace a ninguna URL de tienda
 *   inventada.
 * - La detección de plataforma se hace en un useEffect, no en el primer
 *   render: el user agent solo es fiable en cliente, así que SSR y el
 *   primer render en cliente coinciden (ambos "nada visible") y no rompe la
 *   hidratación.
 */
export default function SmartAppBanner() {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [entered, setEntered] = useState(false);
  const [href, setHref] = useState("/app");

  useEffect(() => {
    setPlatform(detectClientPlatform());
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      // localStorage puede fallar en incógnito estricto: mostramos el
      // banner igualmente, simplemente no recordará el descarte.
      setDismissed(false);
    }
    // Reenvía la query actual (utm_* del cartel/QR que trajo al visitante) a
    // /app, que decide el destino final (tienda, o la web si aún no está
    // publicada ahí). No usamos router de Next para leer esto porque solo
    // hace falta una vez, al montar.
    if (typeof window !== "undefined" && window.location.search) {
      setHref(`/app${window.location.search}`);
    }
  }, []);

  const show = (platform === "ios" || platform === "android") && !dismissed;

  useEffect(() => {
    if (!show) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [show]);

  if (platform !== "ios" && platform !== "android") return null;
  if (dismissed) return null;

  const storeReady = storeUrlForPlatform(platform) !== null;
  const label = platform === "ios" ? "App Store" : "Google Play";
  const Icon = platform === "ios" ? Apple : Smartphone;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // No es crítico: si falla, el visitante podrá volver a descartarla.
    }
    setDismissed(true);
  };

  return (
    <div
      role="complementary"
      aria-label="Instala la app de Franky"
      className={`md:hidden fixed inset-x-0 z-[9997] transition-[transform,opacity] duration-300 ease-[var(--ease-out-quart)] motion-reduce:transition-none ${
        entered ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0"
      }`}
      style={{ bottom: "calc(var(--cookie-bar-offset, 0px) + var(--tabbar-offset, 0px) + 0.75rem)" }}
    >
      <div className="mx-3 flex items-center gap-3 rounded-2xl border border-border bg-bg-primary px-4 py-3 shadow-float">
        <Icon className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-text-primary">
            {storeReady ? "Llévate Franky en tu móvil" : "Franky, muy pronto en tu móvil"}
          </p>
          <p className="truncate text-xs leading-snug text-text-muted">
            {storeReady ? `Descárgala en ${label}` : "Ya puedes usarla desde el navegador"}
          </p>
        </div>

        {storeReady && (
          <Link
            href={href}
            className={cn(buttonVariants({ variant: "dark", size: "sm" }), "shrink-0 rounded-full px-3.5")}
          >
            Abrir
          </Link>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar aviso de la app"
          className="shrink-0 rounded-full p-1.5 text-text-muted transition-colors duration-200 hover:bg-bg-secondary hover:text-text-primary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
