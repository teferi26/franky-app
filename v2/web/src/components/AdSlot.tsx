"use client";

import { useEffect, useRef, useState } from "react";

const COOKIE_CONSENT_KEY = "franky_cookie_consent";
const CONSENT_EVENT = "franky:cookie-consent-changed";

type Props = {
  /** AdSense slot id, e.g. "1234567890" — get it from the AdSense dashboard. */
  slot: string;
  /** Layout format: "auto" works for responsive blocks; pass specific ones for fixed sizes. */
  format?: "auto" | "fluid" | "rectangle" | "horizontal" | "vertical";
  /** Set to true for fully responsive units. */
  responsive?: boolean;
  /** Optional className for the outer wrapper (sizing/margins). */
  className?: string;
  /** Optional inline style for the <ins> tag (height, etc.). */
  style?: React.CSSProperties;
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * One AdSense ad unit. Renders nothing unless:
 *   - NEXT_PUBLIC_ADSENSE_CLIENT is set (i.e. the property is approved), and
 *   - the user has accepted the "marketing" cookie category.
 *
 * The <AdSenseLoader> in the root layout brings the SDK; this component just
 * registers a slot. Safe to drop on any page; it self-cancels until consent +
 * SDK are ready.
 */
export default function AdSlot({
  slot,
  format = "auto",
  responsive = true,
  className,
  style,
}: Props) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const insRef = useRef<HTMLModElement | null>(null);
  const [allowed, setAllowed] = useState(false);
  const pushedRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      if (typeof window === "undefined") return;
      try {
        const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
        const c = raw ? (JSON.parse(raw) as { marketing?: boolean }) : null;
        setAllowed(!!c?.marketing);
      } catch {
        setAllowed(false);
      }
    };
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!allowed || !client || pushedRef.current) return;
    // Registramos el slot sin temporizadores. El array window.adsbygoogle es una
    // cola: si el SDK aún no ha cargado, el push queda encolado y el script lo
    // procesa al terminar de cargar. AdSenseLoader inyecta el script de forma
    // diferida, así que basta con inicializar la cola (si no existe) y empujar.
    let cancelled = false;
    const push = () => {
      if (cancelled || pushedRef.current) return;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushedRef.current = true;
      } catch {
        // Cola presente pero el push falló: ignorar, no tiene sentido reintentar.
      }
    };

    // Si el SDK ya expone la cola, empujamos de inmediato. Si no, escuchamos el
    // evento load del script de AdSense (lo inyecta AdSenseLoader con ese id) y
    // empujamos en cuanto cargue, en lugar de sondear cada 250 ms.
    if (window.adsbygoogle) {
      push();
    } else {
      const script = document.getElementById(
        "adsense-bootstrap",
      ) as HTMLScriptElement | null;
      if (script) {
        script.addEventListener("load", push, { once: true });
        return () => {
          cancelled = true;
          script.removeEventListener("load", push);
        };
      }
      // El script aún no está en el DOM: encolamos igualmente (el SDK drena la
      // cola al cargar). Esto evita cualquier temporizador.
      push();
    }

    return () => {
      cancelled = true;
    };
  }, [allowed, client]);

  if (!client || !allowed) return null;

  return (
    <div className={className} aria-label="Anuncio">
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block", ...style }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
    </div>
  );
}
