"use client";

import { useState } from "react";
import { Calculator, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotasCorteCalculatorWrapper from "./NotasCorteCalculatorWrapper";

export function CalculatorSection() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div id="calculadora" className="scroll-mt-24">
      {!isOpen ? (
        /* Invitación plegada: una fila tipográfica con la acción a la derecha. */
        <div className="hover-lift flex flex-col gap-6 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8 md:flex-row md:items-center">
          <div className="flex-1">
            <p className="eyebrow">Calculadora</p>
            <h3 className="mt-2 font-heading text-xl font-bold text-text-primary sm:text-2xl">
              ¿Quieres saber a qué carreras puedes acceder?
            </h3>
            <p className="mt-1.5 max-w-xl text-sm text-text-muted sm:text-base">
              Introduce tus notas de Bachillerato y EvAU y descubre al instante tu nota de admisión.
            </p>
          </div>

          <Button variant="dark" size="lg" className="group shrink-0" onClick={() => setIsOpen(true)}>
            <Calculator className="h-4 w-4" />
            Calcular mi nota
            <ArrowRight className="h-4 w-4 arrow-nudge" />
          </Button>
        </div>
      ) : (
        /* Calculadora desplegada. */
        <div className="animate-scale-in overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
          <div className="flex items-start justify-between gap-4 border-b border-border-light p-4 sm:p-6">
            <div>
              <h3 className="font-heading text-lg font-bold text-text-primary">
                Calculadora de nota de admisión
              </h3>
              <p className="mt-0.5 text-xs text-text-muted">
                Introduce tus notas y descubre tus opciones
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setIsOpen(false)} aria-label="Cerrar calculadora">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-4 sm:p-6">
            <NotasCorteCalculatorWrapper />
          </div>
        </div>
      )}
    </div>
  );
}
