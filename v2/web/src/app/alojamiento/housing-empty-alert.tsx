"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, Check } from "lucide-react";
import { useSession } from "@/components/SessionProvider";
import { recordHousingSearch } from "@/components/HousingSearchAlert";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * CTA del estado vacío de /alojamiento: "Avísame cuando haya pisos en X".
 *
 * Reutiliza el aviso de búsqueda que ya existe (RPC save_housing_search,
 * tabla housing_search_intents, 30 días): con sesión lo activa en el acto;
 * sin sesión lleva al registro y vuelve a la misma búsqueda, donde el aviso
 * queda a un clic.
 */
export default function HousingEmptyAlert({ city, budget }: { city?: string; budget?: number | null }) {
  const { user } = useSession();
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const place = city?.trim();
  const label = place ? `Avísame cuando haya pisos en ${place}` : "Avísame cuando haya pisos";

  if (!user || !place) {
    const back = place ? `/alojamiento?ciudad=${encodeURIComponent(place)}` : "/alojamiento";
    const href = user
      ? "#filtros-alojamiento"
      : `/registro?next=${encodeURIComponent(back)}&aviso=pisos`;
    return (
      <div className="mt-6 flex justify-center">
        <Link href={href} className={buttonVariants({ variant: "outline" })}>
          <BellRing className="h-4 w-4 text-violet" aria-hidden="true" />
          {user ? "Elige una ciudad para activar avisos" : label}
        </Link>
      </div>
    );
  }

  const save = async () => {
    if (state === "saving") return;
    setState("saving");
    try {
      await recordHousingSearch(user.id, place, budget ?? null, true);
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <Button variant="outline" onClick={save} disabled={state === "saving" || state === "done"}>
        {state === "done" ? (
          <Check className="h-4 w-4 text-violet" aria-hidden="true" />
        ) : (
          <BellRing className="h-4 w-4 text-violet" aria-hidden="true" />
        )}
        {state === "done" ? `Te avisaremos de pisos en ${place}` : state === "saving" ? "Guardando…" : label}
      </Button>
      <p role="status" className="text-sm text-text-muted">
        {state === "error" ? "No se ha podido activar el aviso. Vuelve a intentarlo." : state === "done" ? "Aviso activo durante 30 días." : ""}
      </p>
    </div>
  );
}
