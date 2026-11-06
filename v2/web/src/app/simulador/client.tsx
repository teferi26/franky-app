"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Share2, Check, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Deslizador del simulador. Todo el cálculo es local sobre el dataset compacto
 * que sirve la página (ISR): mover la nota no dispara ni una petición.
 *
 * La nota se refleja en la URL con replaceState para que el enlace copiado
 * lleve el resultado puesto, sin llenar el historial de pasos intermedios.
 */
type Score = { s: number; b: string };

const BRANCH_LABEL: Record<string, string> = {
  ciencias: "Ciencias",
  ciencias_salud: "C. de la Salud",
  ingenieria_arquitectura: "Ingeniería y Arq.",
  artes_humanidades: "Artes y Human.",
  ciencias_sociales_juridicas: "CC. Soc. y Jurídicas",
};

export default function SimuladorClient({
  scores,
  initialNota,
}: {
  scores: Score[];
  initialNota: string | null;
}) {
  const parsed = initialNota ? Number(initialNota.replace(",", ".")) : NaN;
  const [nota, setNota] = useState<number>(
    Number.isFinite(parsed) && parsed >= 5 && parsed <= 14 ? parsed : 10
  );
  const [copied, setCopied] = useState(false);

  // La URL siempre lleva la nota actual: es lo que hace el enlace compartible.
  useEffect(() => {
    const url = `${window.location.pathname}?nota=${nota.toFixed(2)}`;
    window.history.replaceState(null, "", url);
  }, [nota]);

  const stats = useMemo(() => {
    const total = scores.length;
    const reach = scores.filter((c) => c.s <= nota);
    const byBranch = new Map<string, number>();
    for (const c of reach) byBranch.set(c.b, (byBranch.get(c.b) ?? 0) + 1);
    const pct = total > 0 ? Math.round((reach.length / total) * 100) : 0;
    return {
      total,
      count: reach.length,
      pct,
      branches: [...byBranch.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [scores, nota]);

  const share = async () => {
    const url = `https://franky.es/simulador?nota=${nota.toFixed(2)}`;
    const text = `Con un ${nota.toLocaleString("es-ES")} llego a ${stats.count.toLocaleString("es-ES")} carreras 👀`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Simulador de admisión · Franky", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* compartir cancelado: no es un error */
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
      {/* Nota elegida */}
      <div className="text-center">
        <div
          className="font-heading text-6xl font-extrabold tracking-tight text-text-primary tabular sm:text-7xl"
          aria-live="polite"
        >
          {nota.toLocaleString("es-ES", { minimumFractionDigits: 2 })}
        </div>
        <p className="mt-1 text-sm text-text-muted">Tu nota de admisión (sobre 14)</p>
      </div>

      {/* Deslizador */}
      <div className="mx-auto mt-6 max-w-xl">
        <label htmlFor="sim-nota" className="sr-only">
          Nota de admisión
        </label>
        <input
          id="sim-nota"
          type="range"
          min={5}
          max={14}
          step={0.05}
          value={nota}
          onChange={(e) => setNota(Number(e.target.value))}
          className="w-full cursor-pointer accent-violet"
        />
        <div className="mt-1 flex justify-between text-xs text-text-muted tabular">
          <span>5</span>
          <span>14</span>
        </div>
      </div>

      {/* Resultado */}
      <div className="mt-8 grid gap-8 border-t border-border-light pt-8 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <div className="font-heading text-5xl font-extrabold tracking-tight text-violet tabular">
            {stats.count.toLocaleString("es-ES")}
          </div>
          <p className="mt-1 text-sm font-medium text-text-primary">
            carreras a tu alcance
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            el {stats.pct}% de las {stats.total.toLocaleString("es-ES")} con nota
          </p>
        </div>

        <div className="sm:col-span-2">
          <p className="eyebrow mb-3">Por rama</p>
          <ul className="space-y-2">
            {stats.branches.map(([branch, count]) => (
              <li key={branch} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-text-secondary">
                  {BRANCH_LABEL[branch] ?? branch}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-secondary">
                  <div
                    className="h-full rounded-full bg-violet transition-[width] duration-300"
                    style={{ width: `${stats.count > 0 ? (count / stats.count) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-sm font-semibold text-text-primary tabular">
                  {count.toLocaleString("es-ES")}
                </span>
              </li>
            ))}
            {stats.branches.length === 0 && (
              <li className="text-sm leading-relaxed text-text-muted">
                Con esa nota no llegas a ninguna de las carreras con corte
                publicado, pero muchas titulaciones admiten con un 5: mira el
                catálogo completo.
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button type="button" variant="dark" size="lg" onClick={share}>
          {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          {copied ? "Enlace copiado" : "Compartir mi resultado"}
        </Button>
        <Link
          href={`/notas-corte?nota_max=${nota.toFixed(2)}&orden=desc`}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group")}
        >
          Ver cuáles son
          <ArrowRight className="h-4 w-4 arrow-nudge" />
        </Link>
      </div>
    </div>
  );
}
