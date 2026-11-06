"use client";

import * as React from "react";
import { useInView } from "./Reveal";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Cifra que cuenta desde cero al entrar en pantalla. Se pinta el valor final en
 * el HTML del servidor (SEO y sin JS) y solo se anima en cliente.
 *
 *   <CountUp value={4384} suffix="+" />
 */
export function CountUp({
  value,
  suffix = "",
  prefix = "",
  duration = 1400,
  decimals = 0,
  locale = "es-ES",
  className,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  decimals?: number;
  locale?: string;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>({ amount: 0.4 });
  const reduce = useReducedMotion();
  const [shown, setShown] = React.useState(value);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    if (reduce) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      // easeOutExpo
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setShown(value * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce]);

  const text = shown.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

export default CountUp;
