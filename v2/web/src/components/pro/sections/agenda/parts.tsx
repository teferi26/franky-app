"use client";

import * as React from "react";
import { MessageCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import type { ProAgendaOps } from "@/lib/pro/agenda-types";
import { emptyAgendaOps } from "@/lib/pro/agenda-ops";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { proCsvCell } from "@/lib/pro/csv";
import { cn } from "@/lib/utils";
import { Empty, Panel } from "../../kit";

/**
 * Piezas compartidas de las pantallas de agenda: acceso a `agendaOps`,
 * WhatsApp con el mensaje escrito, importes y descargas.
 */

/* ------------------------------------------------------------------ */
/* Datos propios del motor                                             */
/* ------------------------------------------------------------------ */

/**
 * Lista de espera, bonos, productos, plantillas... viven en `agendaOps`.
 *
 * En la demo siempre existen (una visita guardada antes de que existieran
 * empieza con el negocio vacío y se guarda al primer cambio). En un espacio
 * real todavía no llegan del servidor: `ops` es null y las pantallas lo
 * tratan como "aún no hay nada" en vez de romperse.
 */
export function useAgenda() {
  const store = usePro();
  const { data, demo, update, pending, can } = store;
  const fallback = React.useMemo(
    () => (demo && !data.agendaOps ? emptyAgendaOps(data.space) : null),
    // Solo cuando falta: no hay que recrearla con cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demo, Boolean(data.agendaOps)],
  );
  const ops: ProAgendaOps | null = data.agendaOps ?? fallback;

  /** Aplica un cambio del motor. Devuelve false si no se pudo guardar. */
  const run = React.useCallback(
    async (label: string, fn: (d: ProData) => ProData) => {
      if (pending) return false;
      return update(label, (d) =>
        fn(d.agendaOps || !fallback ? d : { ...d, agendaOps: fallback }),
      );
    },
    [pending, update, fallback],
  );

  /** ¿Se puede usar esta herramienta aquí? En real depende del servidor. */
  const allowed = React.useCallback(
    (label: string) => Boolean(ops) && !pending && can(label),
    [ops, pending, can],
  );

  return { ...store, ops, run, allowed };
}

/** Vacío que explica que la herramienta llegará con los datos del negocio. */
export function NotYet({
  icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
}) {
  return (
    <Panel>
      <Empty
        icon={icon}
        title={title}
        body={
          body ??
          "En cuanto tu espacio guarde estos datos, los verás aquí. Mientras, tu agenda y tu caja funcionan igual."
        }
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* WhatsApp                                                            */
/* ------------------------------------------------------------------ */

/** Enlace para compartir un texto eligiendo el chat. */
export function shareWhatsApp(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Abre WhatsApp con el mensaje ya escrito. Quien lo pulsa decide si lo envía;
 * `onOpen` sirve para apuntar que se ha avisado.
 */
export function WhatsAppButton({
  phone,
  message,
  label = "WhatsApp",
  onOpen,
  variant = "outline",
  size = "sm",
  className,
  share,
  disabled,
}: {
  phone?: string;
  message: string;
  label?: string;
  onOpen?: () => void;
  variant?: "outline" | "dark" | "secondary" | "ghost";
  size?: "sm" | "default";
  className?: string;
  /** Sin teléfono: abrir WhatsApp para elegir el chat. */
  share?: boolean;
  disabled?: boolean;
}) {
  const href = share
    ? shareWhatsApp(message)
    : customerWhatsApp(phone, message);
  if (!href || disabled) {
    return (
      <Button
        variant={variant}
        size={size}
        className={cn("h-10", className)}
        disabled
        title={href ? undefined : "Sin teléfono en la ficha"}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={1.9} /> {label}
      </Button>
    );
  }
  return (
    <Button
      variant={variant}
      size={size}
      className={cn("h-10", className)}
      asChild
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onOpen?.()}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={1.9} /> {label}
      </a>
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Importes                                                            */
/* ------------------------------------------------------------------ */

/** "1,35" o "1.35" a céntimos. Vacío o no numérico: null. */
export function parseEuros(text: string): number | null {
  const clean = text.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function eurosText(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/* ------------------------------------------------------------------ */
/* Descargar y copiar                                                  */
/* ------------------------------------------------------------------ */

export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([`﻿${text}`], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, rows: string[][]) {
  const text = rows.map((r) => r.map(proCsvCell).join(";")).join("\r\n");
  downloadText(filename, text, "text/csv;charset=utf-8");
}

/** Copia al portapapeles y avisa. */
export function useCopy() {
  const toast = useToast();
  return React.useCallback(
    async (text: string, title = "Copiado") => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(title, "Pégalo donde quieras.");
      } catch {
        toast.error("No se ha podido copiar", "Selecciona el texto a mano.");
      }
    },
    [toast],
  );
}

/* ------------------------------------------------------------------ */
/* Controles pequeños                                                  */
/* ------------------------------------------------------------------ */

/** Cantidad con coma decimal: 2,5 tubos, 0,25 de bote. */
export function qtyLabel(value: number): string {
  return value.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/** Contador táctil de más y menos. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  suffix?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const button =
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-lg font-bold text-text-secondary transition-colors hover:border-text-primary/25 disabled:opacity-40";
  return (
    <div
      className="inline-flex items-center gap-1"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        aria-label="Quitar uno"
        onClick={() => set(value - 1)}
        disabled={value <= min}
        className={button}
      >
        -
      </button>
      <span
        className="min-w-[2.75rem] text-center font-heading text-lg font-bold tabular"
        aria-live="polite"
      >
        {qtyLabel(value)}
        {suffix ? (
          <span className="ml-0.5 text-xs font-medium text-text-muted">
            {suffix}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        aria-label="Añadir uno"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        className={button}
      >
        +
      </button>
    </div>
  );
}

/** Botón de opción pequeño, para listas de horas, minutos o importes. */
export function OptionButton({
  active,
  onClick,
  children,
  className,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-10 rounded-xl border px-3 text-sm font-semibold tabular transition-colors disabled:opacity-40",
        active
          ? "border-violet bg-violet-50 text-violet-deep"
          : "border-border text-text-secondary hover:border-text-primary/25",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Nombre corto de una persona del equipo. */
export function staffFirst(data: ProData, id?: string): string {
  const name = data.staff.find((s) => s.id === id)?.name;
  return name ? name.split(" ")[0] : "Equipo";
}

/** Profesionales que dan servicio (sin recepción). */
export function serviceStaff(data: ProData) {
  return data.staff.filter((s) =>
    data.services.some((sv) => sv.staffIds.includes(s.id)),
  );
}

/** Aviso destacado dentro de un cajón o una tarjeta. */
export function Callout({
  tone = "neutral",
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  tone?: "neutral" | "warning" | "danger" | "violet" | "success";
  icon?: LucideIcon;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-bg-secondary/60",
    warning:
      "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30",
    danger:
      "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30",
    violet: "border-violet/25 bg-violet-50",
    success:
      "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30",
  };
  const iconTone = {
    neutral: "text-text-secondary",
    warning: "text-amber-700 dark:text-amber-300",
    danger: "text-rose-700 dark:text-rose-300",
    violet: "text-violet",
    success: "text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div className={cn("rounded-2xl border p-3.5", tones[tone], className)}>
      <div className="flex gap-2.5">
        {Icon ? (
          <Icon
            className={cn("mt-0.5 h-4 w-4 shrink-0", iconTone[tone])}
            strokeWidth={1.9}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          {children ? (
            <div className="mt-1 text-sm text-text-secondary">{children}</div>
          ) : null}
          {action ? (
            <div className="mt-2.5 flex flex-wrap gap-2">{action}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
