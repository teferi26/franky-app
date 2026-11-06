import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Cinta que se desplaza en bucle (logos de universidades, ciudades, temas).
 * CSS puro: el contenido se duplica dentro de una pista que se mueve un 50 %
 * (exactamente una copia). Se pausa al pasar el ratón y se desactiva con
 * `prefers-reduced-motion`.
 *
 *   <Marquee duration={45}>
 *     {logos.map(l => <span key={l}>{l}</span>)}
 *   </Marquee>
 */
export function Marquee({
  children,
  duration = 40,
  gap = "3rem",
  reverse = false,
  fade = true,
  className,
}: {
  children: React.ReactNode;
  /** Segundos por vuelta. */
  duration?: number;
  gap?: string;
  reverse?: boolean;
  /** Difumina los bordes laterales. */
  fade?: boolean;
  className?: string;
}) {
  const copy = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" style={{ gap, paddingRight: gap }} aria-hidden={hidden || undefined}>
      {children}
    </div>
  );
  return (
    <div
      className={cn("flex w-full overflow-hidden", className)}
      style={
        fade
          ? {
              maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
              WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
            }
          : undefined
      }
    >
      <div
        className="flex shrink-0 items-center animate-marquee"
        style={{
          ["--marquee-duration" as string]: `${duration}s`,
          animationDirection: reverse ? "reverse" : undefined,
        }}
      >
        {copy(false)}
        {copy(true)}
      </div>
    </div>
  );
}

export default Marquee;
