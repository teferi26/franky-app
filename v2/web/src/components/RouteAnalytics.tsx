"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { screenName } from "@/lib/screen-name";
import { trackFire } from "@/lib/analytics";

export default function RouteAnalytics() {
  const pathname = usePathname();
  const { user } = useSession();
  const [allowed, setAllowed] = useState(false);
  const last = useRef("");
  useEffect(() => {
    const sync = () => {
      try { setAllowed(JSON.parse(localStorage.getItem("franky_cookie_consent") ?? "{}").analytics === true); }
      catch { setAllowed(false); }
    };
    sync();
    window.addEventListener("franky:cookie-consent-changed", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("franky:cookie-consent-changed", sync); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => {
    if (!allowed || !user) { last.current = ""; return; }
    const key = `${user.id}:${pathname}`;
    if (last.current === key) return;
    last.current = key;
    trackFire("screen_view", { screen: screenName(pathname) });
  }, [pathname, allowed, user]);
  return null;
}
