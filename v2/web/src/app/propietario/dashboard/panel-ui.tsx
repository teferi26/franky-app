"use client";

import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * Piezas visuales compartidas por todas las pantallas del panel de propietario
 * (sistema v3 "Editorial"). Antes cada sección repetía a mano la misma cabecera
 * verde con el icono en un cuadrado, las mismas pastillas de piso y los mismos
 * avisos de colores; aquí viven una sola vez para que el panel se lea igual
 * esté donde esté el propietario.
 */

/** Misma clase que los selects e inputs nativos de los filtros de alojamiento. */
export const controlClass =
  "h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";

export const labelClass = "mb-1.5 block text-sm font-semibold text-text-primary";

/** Cabecera de pantalla: rótulo pequeño, título grande y una frase. */
export function PanelHeader({
  eyebrow = "Panel de propietario",
  title,
  description,
  actions,
  wide = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Ancho del resumen (max-w-6xl) frente al de las secciones (max-w-4xl). */
  wide?: boolean;
}) {
  return (
    <section className="border-b border-border-light">
      <div
        className={cn(
          "mx-auto px-4 py-10 sm:px-6 lg:px-8 lg:py-14",
          wide ? "max-w-6xl" : "max-w-4xl"
        )}
      >
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">{title}</h1>
            {description && (
              <p className="mt-3 max-w-xl text-text-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </Reveal>
      </div>
    </section>
  );
}

/** Contenedor de contenido bajo la cabecera, con el mismo ancho. */
export function PanelBody({
  children,
  wide = false,
  className,
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto px-4 py-8 sm:px-6 lg:px-8 lg:py-12",
        wide ? "max-w-6xl" : "max-w-4xl",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Título de bloque dentro del panel: rótulo + h2 en font-heading. */
export function SectionTitle({
  eyebrow,
  title,
  description,
  aside,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className={cn("font-heading text-xl font-bold text-text-primary sm:text-2xl", eyebrow && "mt-2")}>
          {title}
        </h2>
        {description && <p className="mt-1.5 max-w-xl text-sm text-text-muted">{description}</p>}
      </div>
      {aside}
    </div>
  );
}

/** Superficie neutra de bloque (formularios, tablas, avisos). */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-bg-primary shadow-card", className)}>
      {children}
    </div>
  );
}

/** Selector de piso: pastillas, una activa con fondo oscuro. */
export function PisoChips({
  items,
  selected,
  onSelect,
}: {
  items: { id: string; title: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="tablist" aria-label="Piso">
      {items.map((a, i) => {
        const active = selected === a.id;
        return (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(a.id)}
            style={{ "--i": i } as CSSProperties}
            className={cn(
              "animate-list-in inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-[background-color,color,border-color] duration-200",
              active
                ? "border-text-primary bg-text-primary text-bg-primary"
                : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/40 hover:text-text-primary"
            )}
          >
            {a.title}
          </button>
        );
      })}
    </div>
  );
}

/** Aviso inline: neutro, con el icono suelto y el color solo en el icono. */
export function Notice({
  tone = "info",
  icon: Icon,
  children,
  onClose,
  className,
}: {
  tone?: "info" | "warning" | "success" | "error";
  icon?: LucideIcon;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const Fallback = tone === "success" ? CheckCircle2 : AlertCircle;
  const Ico = Icon ?? Fallback;
  const iconColor =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "error"
          ? "text-error"
          : "text-violet";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-border bg-bg-secondary/60 px-4 py-3 text-sm text-text-secondary",
        className
      )}
    >
      <Ico className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="-m-1 rounded-md p-1 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary"
          aria-label="Cerrar aviso"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Estilos de tabla del panel: cabecera en eyebrow, filas con hover. */
export const tableClass = "w-full min-w-[560px] border-collapse text-sm";
export const thClass = "eyebrow border-b border-border px-4 py-3 text-left font-semibold";
export const tdClass = "border-b border-border-light px-4 py-3 align-middle";
export const trClass = "transition-colors hover:bg-bg-secondary";
