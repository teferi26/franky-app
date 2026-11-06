"use client";

import { Calculator, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroCalculatorCTA() {
  return (
    <Button
      variant="dark"
      size="lg"
      className="group btn-shine"
      onClick={() => {
        const section = document.querySelector("#calculadora");
        if (section) {
          section.scrollIntoView({ behavior: "smooth", block: "center" });
          // Abre la calculadora si todavía está plegada.
          const ctaBtn = section.querySelector<HTMLButtonElement>("button");
          if (ctaBtn && ctaBtn.textContent?.includes("Calcular")) {
            setTimeout(() => ctaBtn.click(), 600);
          }
        }
      }}
    >
      <Calculator className="h-4 w-4" />
      Calcular mi nota
      <ArrowRight className="h-4 w-4 arrow-nudge" />
    </Button>
  );
}
