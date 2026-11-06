import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import MercadoClient from "./client";

/**
 * Mercado estudiantil (migración 137). Portado de la app móvil.
 *
 * Privado: el mercado es de la propia universidad, así que no se indexa ni se
 * abre a anónimos. El grueso es client-side porque usa la RPC con la sesión
 * del usuario.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mercado de tu universidad",
  robots: { index: false, follow: false },
};

export default function MercadoPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial (v3): rótulo, título grande y una frase. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Entre estudiantes</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Mercado de tu campus
            </h1>
            <p className="mt-3 max-w-xl text-text-muted">
              Compra, vende e intercambia con gente de tu universidad. Libros,
              muebles, clases, transporte compartido y lo que se te ocurra.
            </p>
          </Reveal>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <MercadoClient />
      </div>
    </div>
  );
}
