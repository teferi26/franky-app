import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import {
  SectorHeader,
  SectorFooter,
} from "@/components/sector-sites/site-chrome";
import { SECTOR_SITES } from "@/lib/sector-sites/catalog";
import { sectorHref } from "@/lib/sector-sites/routing";
import { PRO_VERTICALS } from "@/lib/pro/verticals";

export const metadata: Metadata = {
  title: "Franky para negocios, comunidades y universidades",
  description:
    "Encuentra el Franky de tu sector: peluquerías, restaurantes, ocio, inmobiliarias, asociaciones y universidades. Tu actividad conectada con los estudiantes.",
  alternates: { canonical: "https://franky.es/sectores" },
  robots: { index: true, follow: true },
};

export default function SectorsPage() {
  const groups = Array.from(
    new Set(SECTOR_SITES.map((site) => PRO_VERTICALS[site.vertical].group)),
  );
  return (
    <div className="bg-bg-primary text-text-primary">
      <SectorHeader
        name="Para tu actividad"
        homeHref="/sectores"
        accessHref="/pro"
      />
      <section className="mx-auto max-w-7xl px-5 pb-12 pt-16 sm:px-8 lg:pt-24">
        <p className="eyebrow">Tú haces lo tuyo. Franky lo conecta.</p>
        <h1 className="mt-5 max-w-4xl font-heading text-fluid-display font-extrabold tracking-tight">
          Hay un Franky
          <br />
          para <span className="text-violet">lo que haces.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-muted">
          Tu peluquería, tu local, tu comunidad o tu campus. Encuentra tu
          espacio y descubre cómo formar parte de la vida universitaria.
        </p>
      </section>
      <div className="mx-auto max-w-7xl space-y-12 px-5 pb-20 sm:px-8">
        {groups.map((group) => (
          <section key={group}>
            <h2 className="mb-5 border-b border-border-light pb-4 font-heading text-xl font-bold">
              {group}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {SECTOR_SITES.filter(
                (site) => PRO_VERTICALS[site.vertical].group === group,
              ).map((site) => (
                <a
                  href={sectorHref(site.slug)}
                  key={site.slug}
                  className="group flex flex-col rounded-2xl border border-border p-6 transition-colors hover:border-violet focus-visible:outline-violet"
                >
                  <span className="flex items-center justify-between gap-3 font-heading text-2xl font-bold tracking-tight">
                    {site.name}
                    <ArrowUpRight className="h-5 w-5 shrink-0 text-violet" />
                  </span>
                  <span className="mt-3 text-sm leading-relaxed text-text-muted">
                    {site.description}
                  </span>
                  <span className="mt-auto pt-6 text-sm font-semibold">
                    Descubrir mi Franky
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
      <SectorFooter name="Sectores" />
    </div>
  );
}
