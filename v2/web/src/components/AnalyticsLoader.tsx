"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

const COOKIE_CONSENT_KEY = "franky_cookie_consent";
const CONSENT_EVENT = "franky:cookie-consent-changed";

type ConsentShape = {
  essential?: boolean;
  analytics?: boolean;
  marketing?: boolean;
};

// Metricool (be.js) define este global al cargar.
declare global {
  interface Window {
    beTracker?: { t: (opts: { hash: string }) => void };
  }
}

const METRICOOL_HASH = "42ab18e3161dc18268bad2ee4f51cbff";

function readConsent(): ConsentShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentShape;
  } catch {
    return null;
  }
}

/**
 * Loads Google Analytics and the Metricool tracker only after the user has
 * accepted the analytics cookie category. RGPD-compliant and required before
 * Google AdSense will approve the site.
 *
 * The companion <CookieConsent> dispatches `CONSENT_EVENT` whenever the user
 * saves their choice, so this component reacts immediately without a reload.
 *
 * `nonce` comes from the per-request CSP nonce generated in middleware.ts.
 * Without it the strict script-src would block these tags.
 */
export default function AnalyticsLoader({ nonce }: { nonce?: string }) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const sync = () => {
      const c = readConsent();
      setAllowed(!!c?.analytics);
    };
    sync();

    window.addEventListener(CONSENT_EVENT, sync);
    // Cross-tab: if the user accepts cookies in another tab, mirror it here.
    window.addEventListener("storage", (e) => {
      if (e.key === COOKIE_CONSENT_KEY) sync();
    });
    return () => {
      window.removeEventListener(CONSENT_EVENT, sync);
    };
  }, []);

  if (!allowed) return null;

  return (
    <>
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
            nonce={nonce}
          />
          <Script id="google-analytics" strategy="afterInteractive" nonce={nonce}>
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}
      {/* Metricool — analítica de las campañas de redes. Mismo gate de
          consentimiento que GA; el hash identifica la cuenta de Franky. */}
      <Script
        src="https://tracker.metricool.com/resources/be.js"
        strategy="afterInteractive"
        nonce={nonce}
        onLoad={() => window.beTracker?.t({ hash: METRICOOL_HASH })}
      />
    </>
  );
}
