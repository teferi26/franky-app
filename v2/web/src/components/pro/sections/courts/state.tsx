"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { usePro } from "@/lib/pro/store";
import { courtsOps } from "@/lib/pro/courts-base";
import type { ProCourtsData } from "@/lib/pro/courts-types";
import { Empty } from "../../kit";

/**
 * Acceso a los datos propios del motor de pistas desde las pantallas.
 *
 * `ready` dice si este espacio los tiene: siempre en la demo y, en una cuenta
 * real, cuando el servidor ya guarda el documento del motor
 * (`pro_get_courts_state`). Si no, cada pantalla enseña su estado vacío.
 *
 * `canMix` dice si una acción puede tocar a la vez el documento y los cobros
 * (vender un bono con su pago, cobrar una inscripción). En una cuenta real
 * esos cobros se registran desde la reserva, así que solo se guarda la parte
 * del documento.
 */
export function useCourtsState(): {
  ops: ProCourtsData;
  ready: boolean;
  canMix: boolean;
} {
  const { data, demo } = usePro();
  return {
    ops: courtsOps(data),
    ready: demo || Boolean(data.courts),
    canMix: demo,
  };
}

/** Estado vacío de una pantalla del motor cuando la cuenta aún no tiene sus datos. */
export function CourtsNotReady({
  icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary">
      <Empty icon={icon} title={title} body={body} />
    </div>
  );
}

/** Lee `?vista=` de la URL al entrar (enlaces desde Hoy). */
export function useInitialView<T extends string>(
  allowed: readonly T[],
  fallback: T,
): [T, (v: T) => void] {
  const [view, setView] = React.useState<T>(fallback);
  React.useEffect(() => {
    try {
      const wanted = new URLSearchParams(window.location.search).get("vista");
      if (wanted && (allowed as readonly string[]).includes(wanted))
        setView(wanted as T);
    } catch {
      // Sin URL no hay nada que leer.
    }
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [view, setView];
}

/** Euros escritos a mano ("12,50") a céntimos. Devuelve null si no es un número. */
export function parseEuros(text: string): number | null {
  const clean = text.replace(/\s|€/g, "").replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Fecha corta de un día (YYYY-MM-DD): "vie 3 oct". */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
