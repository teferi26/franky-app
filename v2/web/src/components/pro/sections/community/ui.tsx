"use client";

import * as React from "react";
import { Check, MessageCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import type { CommunityPayMethod } from "@/lib/pro/community-types";
import { cn } from "@/lib/utils";

/**
 * Piezas pequeñas que comparten Material, Pedidos y Viajes.
 */

/**
 * Guarda un cambio y avisa solo cuando de verdad se ha guardado. En un
 * espacio real sin estas tablas `update` devuelve false y se dice claro.
 */
export function useCommunitySave() {
  const { update } = usePro();
  const toast = useToast();
  return React.useCallback(
    async (
      label: string,
      recipe: (d: ProData) => ProData,
      done?: { title: string; detail?: string },
    ): Promise<boolean> => {
      const ok = await update(label, recipe);
      if (ok && done) toast.success(done.title, done.detail);
      if (!ok) toast.error("No se ha podido guardar", "Vuelve a intentarlo en un momento.");
      return ok;
    },
    [toast, update],
  );
}

/** Botón redondo de WhatsApp de 40 px. Se queda en verde cuando ya se ha enviado hoy. */
export function WhatsAppButton({
  href,
  label,
  onOpen,
  done,
}: {
  href: string;
  label: string;
  onOpen?: () => void;
  done?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      onClick={onOpen}
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
        done
          ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-border text-text-secondary hover:border-text-primary/25 hover:text-text-primary",
      )}
    >
      {done ? <Check className="h-4 w-4" strokeWidth={1.9} /> : <MessageCircle className="h-4 w-4" strokeWidth={1.9} />}
    </a>
  );
}

/** Euros escritos a mano ("12,50" o "12.5") a céntimos. null si no es un importe. */
export function parseEuros(value: string): number | null {
  const clean = value.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToInput(cents?: number): string {
  if (!cents) return "";
  return (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
}

const PAID_WITH: Record<CommunityPayMethod, string> = {
  efectivo: "en efectivo",
  bizum: "por Bizum",
  transferencia: "por transferencia",
  tarjeta: "con tarjeta",
  franky: "con Franky",
};

/** "por Bizum", "en efectivo": para frases como "Pagado en efectivo". */
export function paidWith(via: CommunityPayMethod): string {
  return PAID_WITH[via];
}
