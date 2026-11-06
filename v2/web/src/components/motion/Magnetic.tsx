"use client";

import * as React from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * El hijo se desplaza unos píxeles hacia el cursor mientras está cerca y
 * vuelve con un muelle al salir. Para botones principales y logos.
 *
 *   <Magnetic><Link className={buttonVariants()} …/></Magnetic>
 *
 * Sin re-renders: se escribe `transform` directamente. Desactivado en táctil
 * y con `prefers-reduced-motion`.
 */
export function Magnetic({
  children,
  strength = 0.28,
  radius = 90,
  className,
}: {
  children: React.ReactNode;
  /** Fracción del desplazamiento del cursor que sigue el elemento. */
  strength?: number;
  /** Distancia (px) alrededor del elemento en la que actúa. */
  radius?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches) return;

    let raf = 0;
    const reset = () => {
      el.style.transition = "transform 480ms var(--ease-spring)";
      el.style.transform = "translate3d(0,0,0)";
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const reach = Math.max(r.width, r.height) / 2 + radius;
      cancelAnimationFrame(raf);
      if (dist > reach) {
        raf = requestAnimationFrame(reset);
        return;
      }
      raf = requestAnimationFrame(() => {
        el.style.transition = "transform 160ms var(--ease-out-quart)";
        el.style.transform = `translate3d(${dx * strength}px, ${dy * strength}px, 0)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [strength, radius, reduce]);

  return (
    <div ref={ref} className={className} style={{ display: "inline-block", willChange: "transform" }}>
      {children}
    </div>
  );
}

export default Magnetic;
