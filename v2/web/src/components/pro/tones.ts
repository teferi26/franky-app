import type { ToneKey } from "@/lib/pro/types";

/**
 * Colores de persona o recurso (columnas de agenda, pistas, clases). Son
 * funcionales, no decorativos: sirven para distinguir de un vistazo quién
 * atiende qué. Todos con su versión oscura.
 */
export const TONES: Record<ToneKey, { block: string; bar: string; dot: string; text: string; soft: string; ring: string }> = {
  violet: {
    block: "bg-violet-50 dark:bg-violet-950/40",
    bar: "bg-violet-500",
    dot: "bg-violet-500",
    text: "text-violet-900 dark:text-violet-100",
    soft: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
    ring: "ring-violet-500/40",
  },
  sky: {
    block: "bg-sky-50 dark:bg-sky-950/40",
    bar: "bg-sky-500",
    dot: "bg-sky-500",
    text: "text-sky-900 dark:text-sky-100",
    soft: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
    ring: "ring-sky-500/40",
  },
  emerald: {
    block: "bg-emerald-50 dark:bg-emerald-950/40",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-900 dark:text-emerald-100",
    soft: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
    ring: "ring-emerald-500/40",
  },
  amber: {
    block: "bg-amber-50 dark:bg-amber-950/40",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-950 dark:text-amber-100",
    soft: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200",
    ring: "ring-amber-500/40",
  },
  rose: {
    block: "bg-rose-50 dark:bg-rose-950/40",
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    text: "text-rose-900 dark:text-rose-100",
    soft: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
    ring: "ring-rose-500/40",
  },
  teal: {
    block: "bg-teal-50 dark:bg-teal-950/40",
    bar: "bg-teal-500",
    dot: "bg-teal-500",
    text: "text-teal-900 dark:text-teal-100",
    soft: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
    ring: "ring-teal-500/40",
  },
  slate: {
    block: "bg-slate-100 dark:bg-slate-800/60",
    bar: "bg-slate-500",
    dot: "bg-slate-500",
    text: "text-slate-900 dark:text-slate-100",
    soft: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    ring: "ring-slate-500/40",
  },
};

export const TONE_ORDER: ToneKey[] = ["violet", "sky", "emerald", "amber", "rose", "teal", "slate"];
