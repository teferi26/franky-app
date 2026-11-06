"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { buttonVariants } from "@/components/ui/button";

type SpotLink = {
  slug: string;
  vertical: string;
  booking_enabled: boolean;
  card_enabled: boolean;
  card_discount_pct: number;
  live_offers: number;
};

const ACTION: Record<string, string> = {
  hairdresser: "Pedir cita",
  beauty: "Pedir cita",
  restaurant: "Reservar mesa",
  bar: "Reservar mesa",
  cafe: "Ver carta y ventajas",
  pub: "Reservar zona",
  nightclub: "Entradas y listas",
  sports: "Reservar clase",
  sports_facility: "Reservar pista",
  academy: "Ver grupos",
  culture: "Reservar",
  coworking: "Reservar puesto",
};

/**
 * En la ficha de un local de /ocio: si el negocio usa Franky Pro, lleva a su
 * ficha con reservas, ventajas de Franky Card y ofertas de ahora mismo.
 */
export function ProSpotCta({ spotId }: { spotId: string }) {
  const [link, setLink] = React.useState<SpotLink | null>(null);

  React.useEffect(() => {
    let alive = true;
    createClient()
      .rpc("get_pro_link_for_spot", { p_spot_id: spotId })
      .then(({ data, error }) => {
        if (alive && !error && data && typeof data === "object") setLink(data as SpotLink);
      });
    return () => {
      alive = false;
    };
  }, [spotId]);

  if (!link) return null;
  return (
    <div className="rounded-2xl border border-violet/25 bg-violet-50 p-5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-violet-deep">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> En Franky
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {link.card_enabled ? (
          <span className="rounded-full bg-text-primary px-2.5 py-0.5 text-xs font-semibold text-bg-primary">Franky Card -{link.card_discount_pct} %</span>
        ) : null}
        {link.live_offers ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet px-2.5 py-0.5 text-xs font-semibold text-white">
            <Zap className="h-3 w-3" aria-hidden /> {link.live_offers} {link.live_offers === 1 ? "oferta ahora" : "ofertas ahora"}
          </span>
        ) : null}
      </div>
      <Link href={`/n/${link.slug}`} className={buttonVariants({ variant: "dark", size: "lg", className: "mt-4 w-full" })}>
        {link.booking_enabled ? ACTION[link.vertical] ?? "Reservar" : "Ver en Franky"} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
