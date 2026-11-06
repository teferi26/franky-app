"use client";

import * as React from "react";
import { MessageCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import type { ProTablesOps } from "@/lib/pro/tables-types";
import { emptyTablesOps } from "@/lib/pro/tables-ops";
import { buildTablesOps } from "@/lib/pro/demo/tables-ops";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { proCsvCell } from "@/lib/pro/csv";
import { cn } from "@/lib/utils";
import { Empty, Panel } from "../../kit";

/**
 * Piezas compartidas de la operación diaria de hostelería: acceso a
 * `tablesOps`, enlaces de WhatsApp, impresión y descarga de registros.
 */

export function useTablesOps() {
  const { data, update, demo, pending, vertical, now } = usePro();
  // Una visita de demo guardada antes de existir estas herramientas no trae
  // `tablesOps`: se reconstruye igual que la demo nueva y se guarda al usarla.
  const fallback = React.useMemo(
    () => (demo && !data.tablesOps ? seedFrom(data, now) : null),
    // Solo cuando falta: no hay que recalcularla con cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demo, Boolean(data.tablesOps)],
  );
  const ops = data.tablesOps ?? fallback;

  const save = React.useCallback(
    async (label: string, fn: (ops: ProTablesOps) => ProTablesOps) => {
      if (pending) return false;
      return update(`ops.${label}`, (d) => ({
        ...d,
        tablesOps: fn(d.tablesOps ?? fallback ?? emptyTablesOps()),
      }));
    },
    [pending, update, fallback],
  );

  /**
   * Cambia la operación y el resto del espacio en un solo paso: por ejemplo,
   * agotar en la vitrina también quita el producto de la carta y del QR.
   */
  const saveAll = React.useCallback(
    async (label: string, fn: (data: ProData, ops: ProTablesOps) => ProData) => {
      if (pending) return false;
      return update(`ops.${label}`, (d) =>
        fn(d, d.tablesOps ?? fallback ?? emptyTablesOps()),
      );
    },
    [pending, update, fallback],
  );

  return { ops, save, saveAll, vertical, demo, pending };
}

function seedFrom(data: ProData, now: Date): ProTablesOps {
  return buildTablesOps({
    vertical: data.space.vertical,
    now,
    hours: data.space.hours,
    staff: data.staff,
    clients: data.clients,
    menu: data.menu,
    bookings: data.bookings,
    groupRequests: data.groupRequests,
    studyOccupied: 0,
  });
}

/** Estado vacío cuando el espacio aún no tiene estas herramientas. */
export function OpsMissing({ icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <Panel>
      <Empty
        icon={icon}
        title={title}
        body="Todavía no hay nada apuntado aquí. En cuanto tu espacio tenga estos datos, los verás en esta pantalla."
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* WhatsApp                                                            */
/* ------------------------------------------------------------------ */

/** Enlace para compartir un texto sin destinatario (el dueño elige el chat). */
export function shareWhatsApp(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Botón que abre WhatsApp con el mensaje escrito. Quien lo pulsa decide si lo
 * envía; `onOpen` sirve para apuntar que se ha avisado.
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
}: {
  phone?: string;
  message: string;
  label?: string;
  onOpen?: () => void;
  variant?: "outline" | "dark" | "secondary" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
  /** Sin teléfono: abrir WhatsApp para elegir el chat. */
  share?: boolean;
}) {
  const href = share ? shareWhatsApp(message) : customerWhatsApp(phone, message);
  if (!href) {
    return (
      <Button variant={variant} size={size} className={cn("h-10", className)} disabled title="Sin teléfono en la ficha">
        <MessageCircle className="h-4 w-4" strokeWidth={1.9} /> {label}
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} className={cn("h-10", className)} asChild>
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => onOpen?.()}>
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
/* Imprimir y descargar                                                */
/* ------------------------------------------------------------------ */

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Abre una hoja limpia lista para imprimir (A4). El contenido ya viene
 * escapado por quien la llama.
 */
export function printDocument(title: string, bodyHtml: string) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Inter, system-ui, sans-serif; color: #111; font-size: 12px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h2 { font-size: 15px; margin: 18px 0 6px; }
  p.muted { color: #555; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; font-size: 11px; }
  td.c, th.c { text-align: center; }
  .big { font-size: 40px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; margin: 60px 0 16px; }
  .poster p { font-size: 20px; }
</style></head><body>${bodyHtml}<script>window.onload=function(){window.print()}</script></body></html>`);
  win.document.close();
  return true;
}

export function downloadCsv(filename: string, rows: string[][]) {
  const text = rows.map((r) => r.map((c) => proCsvCell(c)).join(";")).join("\n");
  const blob = new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */
/* Contador grande (táctil, a una mano)                                */
/* ------------------------------------------------------------------ */

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  label,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  suffix?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Quitar ${step}`}
        onClick={() => set(value - step)}
        disabled={value <= min}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-lg font-bold text-text-secondary transition-colors hover:border-text-primary/25 disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-[3.25rem] text-center font-heading text-lg font-bold tabular" aria-live="polite">
        {value}
        {suffix ? <span className="ml-0.5 text-xs font-medium text-text-muted">{suffix}</span> : null}
      </span>
      <button
        type="button"
        aria-label={`Añadir ${step}`}
        onClick={() => set(value + step)}
        disabled={value >= max}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-lg font-bold text-text-secondary transition-colors hover:border-text-primary/25 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

/** Nombre corto de una persona del equipo. */
export function staffFirstName(data: ProData, id?: string): string {
  const name = data.staff.find((s) => s.id === id)?.name;
  return name ? name.split(" ")[0] : "Equipo";
}
