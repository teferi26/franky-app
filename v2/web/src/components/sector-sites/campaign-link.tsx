"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentProps } from "react";

/** Conserva solo etiquetas de campaña, nunca la URL completa ni datos de acceso. */
export default function CampaignLink({
  href,
  ...props
}: ComponentProps<typeof Link> & { href: string }) {
  const [destination, setDestination] = useState(href);
  useEffect(() => {
    const target = new URL(href, window.location.origin);
    const current = new URLSearchParams(window.location.search);
    for (const key of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ]) {
      const value = current.get(key);
      if (value && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value))
        target.searchParams.set(key, value);
    }
    setDestination(`${target.pathname}${target.search}${target.hash}`);
  }, [href]);
  return <Link href={destination} {...props} />;
}
