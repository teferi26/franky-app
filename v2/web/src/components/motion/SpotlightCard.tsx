"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * Tarjeta con un foco de luz que sigue al cursor (`.spotlight` en globals.css).
 * Solo escribe dos variables CSS en `pointermove`: sin re-renders de React.
 *
 *   <SpotlightCard className="rounded-2xl border …">…</SpotlightCard>
 *   <SpotlightCard asChild><Link href="…" className="…">…</Link></SpotlightCard>
 *
 * En pantallas táctiles no hay cursor y el efecto simplemente no aparece.
 */
export function SpotlightCard({
  asChild = false,
  className,
  children,
  onPointerMove,
  ...rest
}: {
  asChild?: boolean;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const Comp: React.ElementType = asChild ? Slot : "div";
  const handleMove = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
      el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
      onPointerMove?.(e);
    },
    [onPointerMove]
  );
  return (
    <Comp className={cn("spotlight", className)} onPointerMove={handleMove} {...rest}>
      {children}
    </Comp>
  );
}

export default SpotlightCard;
