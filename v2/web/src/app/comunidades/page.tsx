import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import ComunidadesClient from "./client";

/**
 * Comunidades (migración 138). Portado de la app móvil. Privado: son grupos de
 * la propia universidad, no se indexan.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Comunidades",
  robots: { index: false, follow: false },
};

export default function ComunidadesPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial (v3): rótulo, título grande y una frase. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Tu gente</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Comunidades de tu campus
            </h1>
            <p className="mt-3 max-w-xl text-text-muted">
              Grupos por carrera, deporte o afición. Encuentra tu gente dentro de tu
              universidad.
            </p>
          </Reveal>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <ComunidadesClient />
      </div>
    </div>
  );
}
