import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * Estado vacío del sistema (v3): icono suelto sobre un disco neutro con un
 * anillo de trazo discontinuo (SVG inline, sin fotos ni emojis), título en
 * Outfit, una frase útil y un CTA. Entra con una escala suave.
 *
 * Cada lista de la web tenía su "No hay nada" distinto: unos con emoji, otros
 * con un icono gris y otros con un texto suelto. Un vacío bien hecho es la
 * mejor oportunidad de decirle a la persona qué hacer ahora, por eso el CTA es
 * casi obligatorio.
 *
 *   <EmptyState
 *     icon={CalendarDays}
 *     title="Todavía no hay planes"
 *     description="Sé quien organice el primero de tu campus."
 *     action={{ href: "/eventos/crear", label: "Crear un plan" }}
 *   />
 */
export type EmptyStateAction =
  | { href: string; label: string; onClick?: never }
  | { onClick: () => void; label: string; href?: never };

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  tone = "violet",
  compact = false,
  className,
  children,
}: {
  icon?: React.ElementType;
  title: string;
  description?: React.ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  tone?: "violet" | "fuchsia" | "orange";
  /** Versión más baja para columnas laterales o tarjetas pequeñas. */
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const toneClass =
    tone === "fuchsia"
      ? "text-fuchsia"
      : tone === "orange"
        ? "text-orange"
        : "text-violet";

  return (
    <div
      className={cn(
        "flex flex-col items-center text-center animate-scale-in",
        compact ? "px-4 py-8" : "px-6 py-14 sm:py-20",
        className
      )}
    >
      <EmptyIllustration className={cn(compact ? "h-20 w-20" : "h-28 w-28", toneClass)}>
        {Icon && <Icon className={cn(compact ? "h-7 w-7" : "h-9 w-9")} aria-hidden="true" />}
      </EmptyIllustration>
      <h3
        className={cn(
          "mt-5 font-heading font-bold tracking-tight text-text-primary",
          compact ? "text-base" : "text-xl sm:text-2xl"
        )}
      >
        {title}
      </h3>
      {description && (
        <p className={cn("mt-2 max-w-sm leading-relaxed text-text-muted", compact ? "text-xs" : "text-sm")}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row">
          {action && <ActionButton action={action} />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
      {children}
    </div>
  );
}

function ActionButton({
  action,
  variant = "default",
}: {
  action: EmptyStateAction;
  variant?: "default" | "outline";
}) {
  const cls = cn(buttonVariants({ variant: variant === "default" ? "dark" : variant }), variant === "default" && "btn-shine");
  if (action.href) {
    return (
      <Link href={action.href} className={cls}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  );
}

/**
 * Ilustración de marca (v3): un disco neutro casi imperceptible, un anillo de
 * trazo discontinuo en el color del contexto y el icono de la sección en el
 * centro. SVG inline para pesar cero, heredar `currentColor` y verse bien en
 * oscuro. Ya no lleva degradado ni burbujas de colores sueltos.
 */
export function EmptyIllustration({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <svg
        viewBox="0 0 120 120"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="60" cy="60" r="52" fill="var(--color-bg-secondary)" />
        <circle
          cx="60"
          cy="60"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.25"
          strokeDasharray="3 7"
          strokeLinecap="round"
        />
        <circle cx="96" cy="32" r="3" fill="currentColor" fillOpacity="0.35" />
        <circle cx="24" cy="88" r="2.5" fill="currentColor" fillOpacity="0.25" />
      </svg>
      <span className="relative">{children}</span>
    </div>
  );
}
