"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Barra de medida que crece desde cero al montar. Solo CSS: la anchura pasa de
 * 0 al valor con una transición, sin librerías. Con `delay` se encadenan
 * varias barras en cascada. Respeta `prefers-reduced-motion` (el CSS global
 * anula la transición).
 */
export default function MeterBar({
  value,
  delay = 0,
  className,
  barClassName,
}: {
  /** Porcentaje entre 0 y 100. */
  value: number;
  delay?: number;
  className?: string;
  barClassName?: string;
}) {
  const target = Math.max(0, Math.min(100, value));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (typeof requestAnimationFrame !== "function") {
      setWidth(target);
      return;
    }
    const raf = requestAnimationFrame(() => setWidth(target));
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-bg-tertiary", className)} aria-hidden="true">
      <div
        className={cn(
          "h-full rounded-full bg-violet transition-[width] duration-700 ease-[var(--ease-out-quart)]",
          barClassName
        )}
        style={{ width: `${width}%`, transitionDelay: `${delay}ms` }}
      />
    </div>
  );
}
