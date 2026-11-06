"use client";

import type { CSSProperties } from "react";
import type { CityMatch } from "../types";
import { Badge } from "@/components/ui/badge";
import { SpotlightCard, CountUp } from "@/components/motion";

interface CityMatchSectionProps {
  cities: CityMatch[];
}

const sizeLabels: Record<string, string> = {
  S: "Ciudad pequeña",
  M: "Ciudad mediana",
  L: "Ciudad grande",
  XL: "Ciudad muy grande",
  XXL: "Metrópolis",
};

const communityLabels: Record<string, string> = {
  andalucia: 'Andalucía', aragon: 'Aragón', asturias: 'Asturias', baleares: 'Illes Balears',
  canarias: 'Canarias', cantabria: 'Cantabria', castilla_la_mancha: 'Castilla-La Mancha',
  castilla_leon: 'Castilla y León', cataluna: 'Cataluña', comunidad_valenciana: 'Comunitat Valenciana',
  extremadura: 'Extremadura', galicia: 'Galicia', la_rioja: 'La Rioja', madrid: 'Comunidad de Madrid',
  murcia: 'Región de Murcia', navarra: 'Navarra', pais_vasco: 'País Vasco',
};

// Ciudades afines: tarjetas limpias con el puesto en cifra, la afinidad
// contando al entrar y los rasgos en insignias outline. Sin medallas ni
// emojis: el orden ya lo dice el número.
export default function CityMatchSection({ cities }: CityMatchSectionProps) {
  if (cities.length === 0) return (
    <section className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
      <h3 className="font-heading text-lg font-bold text-text-primary">Ciudades para estudiar</h3>
      <p className="mt-2 text-sm text-text-secondary">Todavía no tenemos ciudades con datos suficientes para tu zona. Puedes explorar universidades y sus campus para comparar opciones.</p>
    </section>
  );

  return (
    <div>
      <p className="eyebrow">Dónde estudiar</p>
      <h3 className="mt-2 font-heading text-xl font-bold text-text-primary">Ciudades que encajan contigo</h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cities.map((cm, i) => {
          const city = cm.city;
          const pct = cm.score;
          return (
            <SpotlightCard asChild key={city.name}>
              <article
                className="group hover-lift flex flex-col rounded-2xl border border-border bg-bg-primary p-4 shadow-card hover:border-text-primary/15 animate-list-in"
                style={{ "--i": i } as CSSProperties}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow tabular">{String(i + 1).padStart(2, "0")}</p>
                    <h4 className="mt-1 font-heading text-base font-bold text-text-primary">{city.name}</h4>
                    <p className="text-xs text-text-muted">{communityLabels[city.comunidad] || city.comunidad}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <CountUp value={pct} suffix="%" className="font-heading text-2xl font-extrabold tracking-tight text-text-primary" />
                    <p className="max-w-20 text-[10px] leading-tight text-text-muted">afinidad orientativa</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{sizeLabels[city.size] || city.size}</Badge>
                  <Badge variant="outline">Coste orientativo: {city.cost_of_living.replaceAll('_', ' ')}</Badge>
                  {city.beach_proximity !== "no" && (
                    <Badge variant="outline">{city.beach_proximity === 'si' ? 'Playa en la ciudad' : 'Costa en el entorno'}</Badge>
                  )}
                  {city.student_friendly >= 8 && (
                    <Badge variant="default">Universitaria</Badge>
                  )}
                </div>

                {cm.reasons.length > 0 && (
                  <p className="mt-3 text-xs leading-relaxed text-text-muted">
                    {cm.reasons.slice(0, 2).join(" · ")}
                  </p>
                )}
              </article>
            </SpotlightCard>
          );
        })}
      </div>
    </div>
  );
}
