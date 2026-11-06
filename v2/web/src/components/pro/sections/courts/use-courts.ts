"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import { time } from "@/lib/pro/format";
import { overdueMatches, releaseMatches } from "@/lib/pro/courts-ops";

/**
 * Libera las pistas de los partidos abiertos que no se han completado a su
 * hora límite. Se ejecuta con la app abierta (Hoy y Pistas) y avisa una vez.
 */
export function useAutoRelease() {
  const { data, now, demo, update } = usePro();
  const toast = useToast();
  const overdue = demo ? overdueMatches(data, now) : [];
  const key = overdue.map((m) => m.id).join(",");

  React.useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    const at = now.toISOString();
    void update("match.release", (d) => releaseMatches(d, ids, at));
    toast.success(
      ids.length === 1 ? "Pista liberada" : `${ids.length} pistas liberadas`,
      `${ids.length === 1 ? "Un partido abierto no se completó" : "Hay partidos abiertos que no se completaron"} a tiempo. Desde las ${time(at)} se pueden reservar.`,
    );
    // Solo cuando aparece un partido vencido nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
