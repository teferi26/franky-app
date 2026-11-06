"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * Entrada al hacer scroll. El elemento arranca invisible (CSS `[data-reveal]`
 * en globals.css) y al entrar en el viewport recibe `.is-inview`, que dispara
 * la transición. Sin JS pesado: un IntersectionObserver compartido por página.
 *
 *   <Reveal>…</Reveal>                       fade + subida (por defecto)
 *   <Reveal variant="blur" delay={120}>      desenfoque a nítido
 *   <Reveal index={i}>                       cascada: cada índice +70 ms
 *   <Reveal stagger>                         el CONTENEDOR se observa y sus
 *       <div data-reveal style={{"--i":0}}>  hijos con data-reveal entran en
 *       <div data-reveal style={{"--i":1}}>  cascada con su propio --i
 *   </Reveal>
 *   <Reveal asChild><Link …/></Reveal>       sin div extra (Slot de Radix)
 *
 * Se puede usar dentro de componentes de servidor: solo el envoltorio es de
 * cliente, los hijos siguen renderizándose en el servidor.
 *
 * Seguridad: si al montar el elemento ya está en pantalla se marca visible al
 * instante (sin esperar al observer), y si el navegador no tiene
 * IntersectionObserver se marca todo visible. Con `prefers-reduced-motion`
 * el CSS anula la transición entera.
 */
type Variant = "up" | "fade" | "scale" | "left" | "right" | "blur";

type RevealProps<T extends React.ElementType = "div"> = {
  as?: T;
  asChild?: boolean;
  variant?: Variant;
  /** Índice en una lista: retrasa 70 ms por posición (tope 14). */
  index?: number;
  /** Retraso adicional en ms. */
  delay?: number;
  /** Observa el contenedor y deja que los hijos `[data-reveal]` entren solos. */
  stagger?: boolean;
  /** Fracción visible necesaria para disparar (0 a 1). */
  amount?: number;
  /** Margen del observer (por defecto dispara un poco antes de entrar). */
  rootMargin?: string;
  once?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "style" | "className" | "children">;

let sharedObserver: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, (visible: boolean) => void>();

function getObserver(rootMargin: string, threshold: number) {
  // Un observer por combinación es lo ideal, pero en la práctica todos usan
  // los valores por defecto: se comparte uno y se crea otro solo si cambian.
  if (
    sharedObserver &&
    sharedObserver.rootMargin === rootMargin &&
    sharedObserver.thresholds[0] === threshold
  ) {
    return sharedObserver;
  }
  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) callbacks.get(e.target)?.(e.isIntersecting);
    },
    { rootMargin, threshold }
  );
  if (!sharedObserver) sharedObserver = obs;
  return obs;
}

export function useInView<T extends Element>(
  opts: { amount?: number; rootMargin?: string; once?: boolean } = {}
) {
  const { amount = 0.15, rootMargin = "0px 0px -8% 0px", once = true } = opts;
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    // Ya visible al montar: sin retraso.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.95 && r.bottom > 0) {
      setInView(true);
      if (once) return;
    }
    const obs = getObserver(rootMargin, amount);
    callbacks.set(el, (visible) => {
      if (visible) {
        setInView(true);
        if (once) {
          obs.unobserve(el);
          callbacks.delete(el);
        }
      } else if (!once) {
        setInView(false);
      }
    });
    obs.observe(el);
    return () => {
      obs.unobserve(el);
      callbacks.delete(el);
    };
  }, [amount, rootMargin, once]);

  return { ref, inView } as const;
}

export function Reveal<T extends React.ElementType = "div">({
  as,
  asChild = false,
  variant = "up",
  index,
  delay,
  stagger = false,
  amount,
  rootMargin,
  once = true,
  className,
  style,
  children,
  ...rest
}: RevealProps<T>) {
  const { ref, inView } = useInView<HTMLElement>({ amount, rootMargin, once });
  const Comp: React.ElementType = asChild ? Slot : as ?? "div";

  const cssVars: React.CSSProperties = { ...style };
  if (index !== undefined) (cssVars as Record<string, unknown>)["--i"] = index;
  if (delay !== undefined) (cssVars as Record<string, unknown>)["--reveal-delay"] = `${delay}ms`;

  return (
    <Comp
      ref={ref}
      // El contenedor con `stagger` no se anima a sí mismo: solo propaga
      // `.is-inview` a los hijos con data-reveal.
      data-reveal={stagger ? undefined : variant}
      className={cn(inView && "is-inview", className)}
      style={cssVars}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/**
 * Hijo de un `<Reveal stagger>`: solo pone el atributo y el índice. Sirve para
 * no repetir `data-reveal` y `style={{"--i"}}` a mano en cada tarjeta.
 */
export function RevealItem({
  index = 0,
  variant = "up",
  asChild = false,
  className,
  style,
  children,
  ...rest
}: {
  index?: number;
  variant?: Variant;
  asChild?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const Comp: React.ElementType = asChild ? Slot : "div";
  return (
    <Comp
      data-reveal={variant}
      className={className}
      style={{ ...style, ["--i" as string]: index } as React.CSSProperties}
      {...rest}
    >
      {children}
    </Comp>
  );
}

export default Reveal;
