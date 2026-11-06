import type { Metadata } from "next";
import CrearComunidadClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear comunidad",
  robots: { index: false, follow: false },
};

export default function CrearComunidadPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:py-14">
        <p className="eyebrow">Comunidades</p>
        <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
          Crear una comunidad
        </h1>
        <p className="mt-2 text-text-muted">
          Será de tu universidad y tú entras como administrador.
        </p>
        <div className="mt-8">
          <CrearComunidadClient />
        </div>
      </div>
    </div>
  );
}
