"use client";

import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cutOffViewLabel, type CutOffView } from "@/lib/academic-year";

/**
 * Único conmutador entre las notas del curso vigente y las del anterior.
 * Por defecto se ve el vigente; el botón ofrece siempre "el otro" curso.
 */
export default function CutOffYearToggle({
  view,
  onChange,
  className,
}: {
  view: CutOffView;
  onChange: (next: CutOffView) => void;
  className?: string;
}) {
  const other: CutOffView = view === "current" ? "previous" : "current";
  return (
    <Button
      type="button"
      variant={view === "previous" ? "secondary" : "outline"}
      size="sm"
      onClick={() => onChange(other)}
      className={cn("rounded-full tabular", className)}
    >
      <History className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      Ver notas {cutOffViewLabel(other)}
    </Button>
  );
}
