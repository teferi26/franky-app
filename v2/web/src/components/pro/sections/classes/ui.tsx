"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Descarga un CSV con BOM para que Excel lea bien las tildes. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Selector de número con botones grandes (jugadores, plazas). Táctiles de 40 px. */
export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label: string;
}) {
  const btn =
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-lg font-semibold text-text-primary transition-colors hover:border-text-primary/30 disabled:opacity-40";
  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Menos ${label.toLowerCase()}`}>
        <Minus className="h-4 w-4" strokeWidth={1.9} />
      </button>
      <span className="w-8 text-center font-heading text-xl font-extrabold tabular">{value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Más ${label.toLowerCase()}`}>
        <Plus className="h-4 w-4" strokeWidth={1.9} />
      </button>
    </div>
  );
}

/** Cifra grande con su rótulo, para bloques de resumen dentro de paneles. */
export function Figure({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "danger" | "success" | "warning" }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-heading text-2xl font-extrabold tracking-[-0.02em] tabular",
          tone === "danger" && "text-rose-700 dark:text-rose-300",
          tone === "success" && "text-emerald-700 dark:text-emerald-300",
          tone === "warning" && "text-amber-700 dark:text-amber-300",
        )}
      >
        {value}
      </p>
      {hint ? <p className="truncate text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

/** Escapa texto para meterlo en el HTML de una hoja imprimible. */
export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
}

/**
 * Abre una ventana con una hoja lista para imprimir (cartel, tablón,
 * certificado). Devuelve false si el navegador bloquea la ventana.
 */
export function printSheet(title: string, css: string, body: string): boolean {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#141318;margin:40px}${css}</style></head><body>${body}
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
  return true;
}
