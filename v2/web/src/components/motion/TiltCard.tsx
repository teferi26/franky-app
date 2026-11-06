"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * Inclinación 3D sutil hacia el cursor (máximo unos grados). Para el visual
 * del hero y tarjetas destacadas, no para listas enteras.
 */
export function TiltCard({
  children,
  max = 6,
  className,
  style,
}: {
  children: React.ReactNode;
  /** Grados máximos de inclinación. */
  max?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transition = "transform 120ms var(--ease-out-quart)";
    el.style.transform = `perspective(1100px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateZ(0)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 600ms var(--ease-spring)";
    el.style.transform = "perspective(1100px) rotateX(0deg) rotateY(0deg)";
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn("will-change-transform", className)}
      style={{ transformStyle: "preserve-3d", ...style }}
    >
      {children}
    </div>
  );
}

export default TiltCard;
