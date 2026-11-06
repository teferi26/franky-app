"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Línea fina pegada arriba que indica cuánto se ha leído. Para artículos y
 * fichas largas. Sin re-renders: escribe `transform` en cada scroll.
 */
export function ScrollProgress({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      el.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-violet", className)}
      style={{ transform: "scaleX(0)" }}
    />
  );
}

export default ScrollProgress;
