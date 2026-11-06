"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

const COOKIE_CONSENT_KEY = "franky_cookie_consent";
const CONSENT_EVENT = "franky:cookie-consent-changed";

/**
 * Loads the Google AdSense bootstrap script once the user has accepted
 * marketing cookies. Without consent we do not load the SDK at all, so no
 * personalised ads or tracking pixels fire.
 *
 * The script tag itself is harmless without an active publisher id, but the
 * env var doubles as a feature flag — set NEXT_PUBLIC_ADSENSE_CLIENT in Vercel
 * once Google approves the property.
 */
export default function AdSenseLoader({ nonce }: { nonce?: string }) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const [allowed, setAllowed] = useState(false);

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
    window.addEventListener("storage", (e) => {
      if (e.key === COOKIE_CONSENT_KEY) sync();
    });
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  if (!client || !allowed) return null;

  return (
    <Script
      id="adsense-bootstrap"
      async
      strategy="afterInteractive"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      crossOrigin="anonymous"
      nonce={nonce}
    />
  );
}
