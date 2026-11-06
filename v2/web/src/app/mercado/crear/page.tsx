import type { Metadata } from "next";
import CrearAnuncioClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Publicar en el mercado",
  robots: { index: false, follow: false },
};

export default function CrearAnuncioPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:py-14">
        <p className="eyebrow">Mercado</p>
        <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
          Publicar en el mercado
        </h1>
        <p className="mt-2 text-text-muted">
          Lo verá la gente de tu universidad. Sé claro con el título y el precio.
        </p>
        <div className="mt-8">
          <CrearAnuncioClient />
        </div>
      </div>
    </div>
  );
}
