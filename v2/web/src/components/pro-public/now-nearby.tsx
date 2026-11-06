"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, Clock3, MapPin, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { money, time } from "@/lib/pro/format";

type LiveOffer = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  discount_pct: number;
  price_cents: number | null;
  final_price_cents: number | null;
  starts_at: string | null;
  ends_at: string | null;
  slots_left: number | null;
  students_only: boolean;
  distance_km: number | null;
  business: { name: string; slug: string; vertical: string; city: string | null; walk_minutes_to_campus: number | null };
};

/**
 * "Ahora cerca": las ofertas relámpago y horas valle que los negocios de
 * Franky Pro tienen activas en este momento. Si no hay ninguna (o la función
 * aún no existe en la base de datos), no pinta nada.
 */
export function NowNearby({ city, title = "Ahora cerca de ti" }: { city?: string; title?: string }) {
  const [offers, setOffers] = React.useState<LiveOffer[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = (lat?: number, lng?: number) =>
      createClient()
        .rpc("list_pro_live_offers", { p_city: city ?? null, p_lat: lat ?? null, p_lng: lng ?? null, p_limit: 12 })
        .then(({ data, error }) => {
          if (alive && !error && Array.isArray(data)) setOffers(data as LiveOffer[]);
        });
    void load();
    return () => {
      alive = false;
    };
  }, [city]);

  if (!offers?.length) return null;
  return (
    <section aria-label={title} className="mb-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-violet">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> En directo
          </p>
          <h2 className="mt-1 font-heading text-xl font-extrabold tracking-tight">{title}</h2>
        </div>
        <p className="hidden text-sm text-text-muted sm:block">Descuentos de última hora para estudiantes</p>
      </div>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {offers.map((o) => (
          <li key={o.id} className="w-[260px] shrink-0 snap-start">
            <Link
              href={`/n/${o.business.slug}`}
              className="group flex h-full flex-col rounded-2xl border border-border bg-bg-primary p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-violet px-2 py-0.5 text-[0.68rem] font-bold text-white">
                <Zap className="h-3 w-3" aria-hidden /> {o.discount_pct ? `-${o.discount_pct} %` : o.title}
              </span>
              <span className="mt-2 line-clamp-2 font-heading text-[0.98rem] font-bold leading-snug">{o.detail}</span>
              <span className="mt-0.5 text-sm text-text-muted">{o.business.name}</span>
              {o.final_price_cents !== null && o.price_cents !== null ? (
                <span className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-heading text-lg font-extrabold tabular">{money(o.final_price_cents)}</span>
                  <span className="text-xs text-text-muted line-through tabular">{money(o.price_cents)}</span>
                </span>
              ) : null}
              <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-text-muted">
                {o.ends_at ? (
                  <span className="flex items-center gap-1">
                    <Clock3 className="h-3 w-3" aria-hidden /> Hasta las {time(o.ends_at)}
                  </span>
                ) : null}
                {o.distance_km !== null ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden /> {o.distance_km.toLocaleString("es-ES")} km
                  </span>
                ) : o.business.walk_minutes_to_campus !== null ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden /> {o.business.walk_minutes_to_campus} min del campus
                  </span>
                ) : null}
                {o.students_only ? (
                  <span className="flex items-center gap-1 text-violet-deep">
                    <BadgeCheck className="h-3 w-3" aria-hidden /> Estudiantes
                  </span>
                ) : null}
                {o.slots_left !== null ? <span>Quedan {o.slots_left}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
