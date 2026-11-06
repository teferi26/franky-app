"use client";

import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Reveal, CountUp } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Piezas visuales compartidas por todas las pantallas del panel de
 * administración (sistema v3 "Editorial"). Mismo lenguaje que el panel de
 * propietario: cabecera con rótulo y título grande, superficies blancas con
 * borde hairline, tablas con cabecera en eyebrow y cifras en tabular. Se
 * copia el patrón en vez de importarlo para que cada panel evolucione solo.
 */

/** Misma clase que los selects e inputs nativos del resto de la web. */
export const controlClass =
  "h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";

/** Versión compacta para controles dentro de tablas. */
export const controlSmClass =
  "h-8 w-full rounded-lg border border-border bg-bg-primary px-2.5 text-xs text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";

export const labelClass = "mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary";

/** Cabecera de pantalla: rótulo pequeño, título grande y una frase. */
export function PanelHeader({
  eyebrow = "Panel de administración",
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "flex flex-col gap-6 border-b border-border-light pb-8 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">{title}</h1>
        {description && <p className="mt-3 max-w-xl text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </Reveal>
  );
}

/** Título de bloque dentro del panel: rótulo + h2 en font-heading. */
export function SectionTitle({
  eyebrow,
  title,
  description,
  aside,
  className,
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Tag className={cn("font-heading text-lg font-bold text-text-primary sm:text-xl", eyebrow && "mt-2")}>
          {title}
        </Tag>
        {description && <p className="mt-1.5 max-w-xl text-sm text-text-muted">{description}</p>}
      </div>
      {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}

/** Superficie neutra de bloque (formularios, tablas, avisos). */
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-border bg-bg-primary shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

/** Cabecera interna de un Panel: título a la izquierda, acciones a la derecha. */
export function PanelHead({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("border-b border-border-light px-5 py-4 sm:px-6", className)}>{children}</div>;
}

/** Cuerpo interno de un Panel. */
export function PanelContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-5 sm:px-6", className)}>{children}</div>;
}

/**
 * Métrica editorial: rótulo pequeño, cifra grande en tabular que cuenta al
 * entrar y, si procede, la variación en una insignia. Sin colores de fondo.
 */
export function Metric({
  label,
  value,
  caption,
  delta,
  tone = "neutral",
  index = 0,
  className,
}: {
  label: ReactNode;
  value: number;
  caption?: ReactNode;
  /** Variación porcentual frente al periodo anterior. */
  delta?: number | null;
  /** Resalta la cifra cuando exige atención. */
  tone?: "neutral" | "warning" | "error";
  index?: number;
  className?: string;
}) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const deltaVariant = !hasDelta ? "outline" : delta! > 0.5 ? "success" : delta! < -0.5 ? "destructive" : "outline";
  return (
    <div
      style={{ "--i": index } as CSSProperties}
      className={cn("animate-list-in min-w-0 border-l border-border pl-4", className)}
    >
      <p className="eyebrow truncate">{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span
          className={cn(
            "tabular font-heading text-3xl font-extrabold tracking-tight sm:text-4xl",
            tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "text-text-primary"
          )}
        >
          <CountUp key={value} value={value} />
        </span>
        {hasDelta && (
          <Badge variant={deltaVariant} className="tabular">
            {delta! >= 0 ? "+" : ""}
            {delta!.toFixed(1)}%
          </Badge>
        )}
      </div>
      {caption && <p className="mt-1 text-xs text-text-muted">{caption}</p>}
    </div>
  );
}

/** Pastilla de filtro: una activa con fondo oscuro, el resto con borde. */
export function Chip({
  active,
  children,
  className,
  index,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; index?: number }) {
  return (
    <button
      type="button"
      style={index !== undefined ? ({ "--i": index } as CSSProperties) : undefined}
      className={cn(
        index !== undefined && "animate-list-in",
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-[background-color,color,border-color] duration-200 disabled:pointer-events-none disabled:opacity-50",
        active
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/40 hover:text-text-primary",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Aviso inline: neutro, con el icono suelto y el color solo en el icono. */
export function Notice({
  tone = "info",
  icon: Icon,
  children,
  onClose,
  className,
  role,
}: {
  tone?: "info" | "warning" | "success" | "error";
  icon?: LucideIcon;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  role?: string;
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
      role={role ?? (tone === "error" ? "alert" : "status")}
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

/** Texto de estado (cargando, vacío) centrado y discreto. */
export function Quiet({ children, role, className }: { children: ReactNode; role?: string; className?: string }) {
  return (
    <p role={role} className={cn("py-10 text-center text-sm text-text-muted", className)}>
      {children}
    </p>
  );
}

/** Estilos de tabla del panel: cabecera en eyebrow, filas con hover. */
export const tableWrapClass = "overflow-x-auto rounded-xl border border-border";
export const tableClass = "w-full min-w-[640px] border-collapse text-sm";
export const thClass = "eyebrow whitespace-nowrap border-b border-border bg-bg-secondary/60 px-4 py-3 text-left";
export const thRightClass = "eyebrow whitespace-nowrap border-b border-border bg-bg-secondary/60 px-4 py-3 text-right";
export const tdClass = "border-b border-border-light px-4 py-3 align-middle";
export const trClass = "transition-colors last:[&>td]:border-b-0 hover:bg-bg-secondary";
