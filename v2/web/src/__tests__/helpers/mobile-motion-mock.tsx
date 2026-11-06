import React from "react";

/**
 * Doble de src/components/motion.tsx (app móvil) para los tests que cargan las
 * pantallas nativas con un `require` propio.
 *
 * Las pantallas usan las primitivas de movimiento desde el rediseño v3, pero un
 * test de comportamiento no debe depender de animaciones: aquí cada primitiva
 * pinta su contenido de inmediato, en su estado final. Así el árbol que ve el
 * test es el mismo que ve la persona cuando la animación termina.
 */
type Kids = { children?: React.ReactNode };

export const motionMock = {
  FadeIn: ({ children }: Kids) => <>{children}</>,
  Stagger: ({ children }: Kids) => <>{children}</>,
  PressScale: ({ children }: Kids) => <>{children}</>,
  Pulse: ({ children }: Kids) => <>{children}</>,
  // Cerrado no pinta nada: es lo que ve el usuario antes de desplegar.
  Collapsible: ({ open, children }: Kids & { open?: boolean }) =>
    open ? <>{children}</> : null,
  AnimatedNumber: ({ value, prefix = "", suffix = "", decimals = 0 }: {
    value: number; prefix?: string; suffix?: string; decimals?: number;
  }) => (
    <span>
      {prefix}
      {Number(value).toLocaleString("es-ES", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  ),
  ScrollHeader: ({ title, subtitle, right }: {
    title?: string; subtitle?: string; right?: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <span>{subtitle}</span> : null}
      {right}
    </div>
  ),
  useScrollHeader: () => ({ scrollY: { interpolate: () => 0 }, onScroll: () => {} }),
  useLayoutAnim: () => () => {},
  EASE_OUT: (t: number) => t,
  EASE_SPRING: { speed: 18, bounciness: 6 },
};

export default motionMock;
