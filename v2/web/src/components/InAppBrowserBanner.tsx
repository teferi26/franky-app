"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  externalUrlWithAttribution,
  inAppBrowserName,
  openInExternalBrowser,
} from "@/lib/in-app-browser";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Aviso que aparece SOLO dentro de webviews de apps (Instagram, TikTok…), donde
 * "Continuar con Google" no puede mostrar el selector de cuentas (ver
 * lib/in-app-browser.ts). Ofrece el salto al navegador real y, si el webview
 * bloquea el salto (Instagram lo hace en muchas versiones y no pasa nada al
 * pulsar), enseña la salida manual (⋯ → Abrir en el navegador) y un botón de
 * copiar el enlace, para que el usuario nunca se quede ante un botón muerto.
 *
 * Se detecta en un useEffect para no romper la hidratación: el user agent solo
 * existe en cliente, así que el primer render (SSR y cliente) no muestra nada.
 */
export default function InAppBrowserBanner({ className = "" }: { className?: string }) {
  const [appName, setAppName] = useState<string | null>(null);
  const [jumpFailed, setJumpFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  // Si el webview también bloquea el portapapeles, enseñamos la URL en claro
  // para que el usuario la copie a mano (selección larga).
  const [showRawUrl, setShowRawUrl] = useState(false);

  useEffect(() => {
    setAppName(inAppBrowserName());
  }, []);

  if (!appName) return null;

  const handleCopy = async () => {
    const url = externalUrlWithAttribution();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
      return;
    } catch {
      // Algunos webviews bloquean la Clipboard API: probamos la vía clásica.
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
        return;
      }
    } catch {
      // execCommand tampoco disponible.
    }
    setShowRawUrl(true);
  };

  return (
    // Diseño v3: superficie neutra con borde hairline, sin tinte ámbar de fondo.
    <div className={cn("rounded-2xl border border-border bg-bg-secondary/60 p-4 text-left animate-fade-in", className)}>
      <p className="mb-1 text-sm font-semibold text-text-primary">
        Estás en el navegador de {appName}
      </p>
      <p className="mb-3 text-xs leading-relaxed text-text-secondary">
        Aquí Google no puede enseñarte tus cuentas. Abre Franky en tu navegador
        y podrás registrarte con un solo toque.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openInExternalBrowser(undefined, () => setJumpFailed(true))}
          className={buttonVariants({ variant: "dark", size: "sm" })}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Abrir en mi navegador
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </button>
      </div>
      {showRawUrl && (
        <input
          readOnly
          value={externalUrlWithAttribution()}
          onFocus={(e) => e.target.select()}
          className="mt-2 w-full rounded-lg border border-border bg-bg-primary px-2.5 py-1.5 text-[11px] text-text-secondary focus:border-violet focus:outline-none"
          aria-label="Enlace para copiar manualmente"
        />
      )}
      {jumpFailed ? (
        <div className="mt-3 rounded-xl border border-border bg-bg-primary p-3 text-xs text-text-secondary animate-fade-in">
          <p className="mb-1 font-semibold text-text-primary">
            ¿No se ha abierto? {appName} a veces bloquea el salto. Sal en dos toques:
          </p>
          <p>
            1. Toca el menú <strong>⋯</strong> (arriba a la derecha).
            <br />
            2. Elige <strong>«Abrir en el navegador externo»</strong>.
          </p>
          <p className="mt-1">
            O usa «Copiar enlace» y pégalo en Chrome o Safari.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-text-muted">
          ¿No se abre? Toca el menú <strong>⋯</strong> de arriba y elige
          «Abrir en el navegador».
        </p>
      )}
    </div>
  );
}
