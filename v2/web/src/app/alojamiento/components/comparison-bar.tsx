"use client";

import Link from "next/link";
import { Scale, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useComparison } from "./comparison-context";

/**
 * Barra flotante del comparador (v3): una sola superficie blanca con sombra
 * flotante, sin cuadrados tintados. Entra desde abajo con `animate-sheet-in`.
 */
export default function ComparisonBar() {
  const { selectedIds, clearSelection } = useComparison();

  if (selectedIds.length === 0) return null;

  const canCompare = selectedIds.length >= 2;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-sheet-in">
      <div className="mx-auto max-w-7xl px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-bg-primary/95 px-4 py-3 shadow-float backdrop-blur-lg sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Scale className="h-5 w-5 shrink-0 text-violet" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-text-primary tabular">
                {selectedIds.length} {selectedIds.length === 1 ? "piso" : "pisos"}
              </p>
              <p className="text-xs leading-tight text-text-muted">
                {canCompare ? "Listo para comparar" : "Mínimo 2, máximo 4"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-xl px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary"
            >
              Limpiar
            </button>
            {canCompare ? (
              <Link
                href={`/alojamiento/comparar?ids=${selectedIds.join(",")}`}
                className={cn(buttonVariants({ variant: "dark", size: "sm" }), "group h-9 px-4")}
              >
                Comparar ({selectedIds.length})
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
            ) : (
              <span
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 cursor-not-allowed px-4 opacity-60")}
                title="Selecciona al menos 2 pisos"
              >
                Comparar
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
