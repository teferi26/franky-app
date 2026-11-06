"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Lightbulb, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingStatus, ToneKey } from "@/lib/pro/types";
import { capitalize, initials } from "@/lib/pro/format";
import { TONES } from "./tones";

/* ------------------------------------------------------------------ */
/* Elementos fijos                                                      */
/* ------------------------------------------------------------------ */

/**
 * Todo lo que lleve `position: fixed` (barra inferior, botón flotante, modo
 * pantalla completa) debe ir dentro de <FixedPortal>. La transición global de
 * página (app/template.tsx) deja un `transform` en un contenedor padre y, con
 * él, `fixed` pasa a ser relativo a ese contenedor en vez de a la pantalla.
 */
export function FixedPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/* ------------------------------------------------------------------ */
/* Cabecera de página                                                  */
/* ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 pb-5 sm:pb-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="mt-1.5 font-heading text-[1.65rem] font-extrabold leading-tight tracking-[-0.025em] text-text-primary sm:text-[2rem]">
            {title}
          </h1>
          {description ? <p className="mt-1.5 max-w-2xl text-[0.95rem] text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Cifras                                                              */
/* ------------------------------------------------------------------ */

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  emphasis,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  emphasis?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "group flex min-w-0 flex-col rounded-2xl border px-4 py-3.5 text-left transition-colors",
        emphasis ? "border-violet/25 bg-violet-50" : "border-border bg-bg-primary",
        onClick && "cursor-pointer hover:border-text-primary/20",
      )}
    >
      <span className="flex items-center gap-1.5 text-[0.8rem] font-medium text-text-muted">
        {Icon ? <Icon className={cn("h-3.5 w-3.5", emphasis && "text-violet")} strokeWidth={1.9} /> : null}
        {label}
      </span>
      <span className="mt-1 font-heading text-[1.6rem] font-extrabold leading-none tracking-[-0.02em] text-text-primary tabular">
        {value}
      </span>
      {hint ? <span className="mt-1.5 truncate text-xs text-text-muted">{hint}</span> : null}
    </Comp>
  );
}

export function KpiRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3", className)}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Sin relleno interior: para listas y tablas que llegan al borde. */
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-bg-primary shadow-card", className)}>
      {title || action ? (
        <div className="flex items-start justify-between gap-3 border-b border-border-light px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="font-heading text-[1.02rem] font-bold tracking-[-0.01em] text-text-primary">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[0.82rem] text-text-muted">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn(flush ? "" : "p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Fila de lista densa (clientes, reservas, interesados). */
export function Row({
  children,
  onClick,
  className,
  as,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  as?: "div" | "li";
  href?: string;
}) {
  const base = cn(
    "flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5",
    (onClick || href) && "cursor-pointer transition-colors hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none",
    className,
  );
  if (href) {
    return (
      <a href={href} className={base}>
        {children}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {children}
      </button>
    );
  }
  const Comp = as ?? "div";
  return <Comp className={base}>{children}</Comp>;
}

export function RowList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border-light", className)}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Persona                                                             */
/* ------------------------------------------------------------------ */

export function Avatar({
  name,
  tone = "slate",
  size = "md",
  className,
}: {
  name: string;
  tone?: ToneKey;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { xs: "h-6 w-6 text-[0.62rem]", sm: "h-8 w-8 text-[0.7rem]", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        TONES[tone].soft,
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Estados                                                             */
/* ------------------------------------------------------------------ */

const STATUS: Record<BookingStatus, { label: string; className: string }> = {
  requested: { label: "Por confirmar", className: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  confirmed: { label: "Confirmada", className: "bg-bg-secondary text-text-secondary" },
  arrived: { label: "Ha llegado", className: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" },
  in_service: { label: "Atendiendo", className: "bg-violet-50 text-violet-deep" },
  done: { label: "Cobrada", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  no_show: { label: "No vino", className: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  cancelled: { label: "Cancelada", className: "bg-bg-secondary text-text-muted line-through" },
};

export function StatusPill({ status, label }: { status: BookingStatus; label?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[0.72rem] font-semibold", s.className)}>
      {label ?? s.label}
    </span>
  );
}

export const BOOKING_STATUS_LABEL = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.label]),
) as Record<BookingStatus, string>;

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "violet" | "success" | "warning" | "danger" | "info" | "dark";
  className?: string;
}) {
  const tones = {
    neutral: "bg-bg-secondary text-text-secondary",
    violet: "bg-violet-50 text-violet-deep",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    warning: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    danger: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    info: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
    dark: "bg-text-primary text-bg-primary",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.72rem] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Punto vivo: algo que está pasando ahora (en directo, abierto, fichado). */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 rounded-full bg-emerald-500 pro-live", className)} />;
}

/* ------------------------------------------------------------------ */
/* Vacíos y consejos de la guía                                        */
/* ------------------------------------------------------------------ */

export function Empty({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {Icon ? <Icon className="h-7 w-7 text-text-muted" strokeWidth={1.6} /> : null}
      <p className="mt-3 font-heading text-base font-bold text-text-primary">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Tip({ children, title = "Consejo", className }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm", className)}>
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
      <div className="min-w-0 text-text-secondary">
        <span className="font-semibold text-text-primary">{title}. </span>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controles                                                           */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  label,
}: {
  options: { value: T; label: React.ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-bg-secondary p-1 pro-scroll", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-[background-color,color,box-shadow] duration-200",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[0.82rem]",
              active ? "bg-bg-primary text-text-primary shadow-card" : "text-text-muted hover:text-text-primary",
            )}
          >
            {o.label}
            {typeof o.count === "number" ? (
              <span className={cn("tabular text-[0.7rem]", active ? "text-violet" : "text-text-muted")}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar",
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  return (
    <label className={cn("relative flex h-10 items-center", className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted" strokeWidth={1.9} />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full rounded-xl border border-border bg-bg-primary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20"
      />
    </label>
  );
}

export function IconButton({
  label,
  icon: Icon,
  onClick,
  className,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-bg-primary text-text-secondary transition-colors hover:border-text-primary/25 hover:text-text-primary disabled:opacity-40",
        className,
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.9} />
    </button>
  );
}

/** Flechas para moverse por días o semanas y volver a hoy. */
export function StepNav({
  label,
  onPrev,
  onNext,
  onToday,
  isToday,
}: {
  label: React.ReactNode;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  isToday?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <IconButton label="Anterior" icon={ChevronLeft} onClick={onPrev} />
      <IconButton label="Siguiente" icon={ChevronRight} onClick={onNext} />
      {onToday ? (
        <button
          type="button"
          onClick={onToday}
          disabled={isToday}
          className="h-9 rounded-xl border border-border px-3 text-[0.82rem] font-semibold text-text-secondary transition-colors hover:border-text-primary/25 hover:text-text-primary disabled:opacity-40"
        >
          Hoy
        </button>
      ) : null}
      <span className="ml-1.5 min-w-0 truncate font-heading text-[1.02rem] font-bold text-text-primary">
        {typeof label === "string" ? capitalize(label) : label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel lateral (detalle y formularios)                               */
/* ------------------------------------------------------------------ */

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[#0d0c14]/40 backdrop-blur-[1px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "pro-drawer-in fixed inset-x-0 bottom-0 z-[61] flex max-h-[92dvh] flex-col rounded-t-3xl border border-border bg-bg-primary shadow-float focus:outline-none",
            "md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:rounded-3xl",
            wide ? "md:w-[560px]" : "md:w-[440px]",
          )}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4 md:pt-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-heading text-lg font-bold leading-snug text-text-primary">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-text-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">Detalle</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pro-scroll">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-light px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Formularios compactos                                               */
/* ------------------------------------------------------------------ */

export function FormField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[0.82rem] font-semibold text-text-primary">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20 disabled:opacity-60";

export const textareaClass =
  "min-h-[84px] w-full rounded-xl border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20";

/** Elección rápida de una opción entre pocas, en botones. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: React.ReactNode; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-10 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left text-sm transition-colors",
              active
                ? "border-violet bg-violet-50 text-violet-deep"
                : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/25 hover:text-text-primary",
            )}
          >
            <span className="font-semibold">{o.label}</span>
            {o.hint ? <span className={cn("text-xs", active ? "text-violet-deep/80" : "text-text-muted")}>{o.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Barra de progreso fina (ocupación, aforo, pasos). */
export function Meter({ value, max, className, tone = "violet" }: { value: number; max: number; className?: string; tone?: "violet" | "success" | "warning" | "danger" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = { violet: "bg-violet", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-rose-500" }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out-expo)]", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Mini gráfico de barras para tendencias (7 días, 12 semanas). */
export function Bars({
  values,
  labels,
  highlightLast = true,
  className,
  format,
}: {
  values: number[];
  labels?: string[];
  highlightLast?: boolean;
  className?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className={cn("flex h-28 items-end gap-1.5", className)}>
      {values.map((v, i) => {
        const last = highlightLast && i === values.length - 1;
        return (
          <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[0.65rem] font-semibold text-text-muted opacity-0 transition-opacity group-hover:opacity-100 tabular">
              {format ? format(v) : v}
            </span>
            <div
              className={cn("w-full rounded-md transition-colors", last ? "bg-violet" : "bg-bg-tertiary group-hover:bg-violet/40")}
              style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
              title={format ? format(v) : String(v)}
            />
            {labels ? <span className="truncate text-[0.65rem] text-text-muted">{labels[i]}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Etiqueta clave/valor alineada para fichas y detalles. */
export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="min-w-0 text-right font-medium text-text-primary">{children}</span>
    </div>
  );
}
