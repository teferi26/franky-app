import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { ACADEMIC_CATALOGUE_VERSION } from "@/lib/academic-catalogue-version";
import { ArrowRight, TrendingUp, Share2 } from "lucide-react";
import { Reveal } from "@/components/motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createPublicSupabase } from "@/lib/supabase-server";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import SimuladorClient from "./client";
import { completeCatalogue } from "@/lib/complete-catalogue";

/**
 * Simulador de admisión: "con tu nota, ¿en cuántas carreras entras?".
 *
 * La nota viaja en la URL (?nota=11.2) para que el resultado se pueda pegar
 * tal cual en el grupo de WhatsApp, que es donde se decide esto cada junio.
 * Público e indexable: "con un 11 que puedo estudiar" es una búsqueda
 * enorme en junio/julio y nadie la responde con datos completos.
 *
 * El grueso del cálculo va en el cliente sobre un dataset compacto
 * (nota+rama por carrera) servido por esta página con ISR: una sola consulta
 * por hora para todos los visitantes, y el deslizador responde al instante
 * sin más viajes a la base.
 */
export const revalidate = 3600;

const getAdmissionCatalogue = unstable_cache(async () => {
  const supabase = createPublicSupabase();
  return completeCatalogue((from, to) => supabase.from("careers")
    .select("cut_off_score, branch, admission_without_cutoff")
    .order("id").range(from, to));
}, ["simulador-catalogo-completo-v1", ACADEMIC_CATALOGUE_VERSION], { revalidate: 3600 });

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ nota?: string }>;
}): Promise<Metadata> {
  const { nota } = await searchParams;
  const parsed = nota ? Number(String(nota).replace(",", ".")) : null;
  const valid = parsed !== null && Number.isFinite(parsed) && parsed >= 5 && parsed <= 14;

  const title = valid
    ? `Con un ${parsed!.toLocaleString("es-ES")} en la EvAU: carreras a las que llegas`
    : "Simulador de admisión: ¿a qué carreras llegas con tu nota?";
  const description = valid
    ? `Descubre a cuántas carreras universitarias de España llegas con un ${parsed!.toLocaleString("es-ES")} de nota de admisión, con las notas de corte disponibles y su curso de referencia.`
    : `Mueve el deslizador con tu nota de admisión y ve al instante a cuántas carreras de España llegas, con las notas de corte disponibles y su curso de referencia. Gratis y sin registro.`;

  return {
    title,
    description,
    // Canonical SIN la nota: cada valor del deslizador no es una página
    // distinta para Google, es la misma herramienta.
    alternates: { canonical: "/simulador" },
    openGraph: { title, description, url: "/simulador", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SimuladorPage({
  searchParams,
}: {
  searchParams: Promise<{ nota?: string }>;
}) {
  const { nota } = await searchParams;
  const data = await getAdmissionCatalogue();
  const withoutCutoff = data.filter(c => c.admission_without_cutoff).length;
  const scores = data.filter(c => c.cut_off_score != null && Number(c.cut_off_score) > 0).map((c) => ({
    s: Number(c.cut_off_score),
    b: (c.branch as string) ?? "otros",
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Simulador de admisión universitaria",
    url: "https://franky.es/simulador",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <JsonLd data={jsonLd} />

      {/* ============ CABECERA ============ */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 pt-6 pb-12 sm:px-6 lg:px-8 lg:pt-8 lg:pb-16">
          <Breadcrumbs
            className="mb-8"
            items={[{ name: "Inicio", href: "/" }, { name: "Simulador de admisión" }]}
          />
          <Reveal className="max-w-3xl">
            <p className="eyebrow">Simulador de admisión</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              ¿A qué llegas con tu nota?
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-muted">
              Mueve el deslizador y compara contra las {scores.length.toLocaleString("es-ES")}{" "}
              notas de corte disponibles, con cursos de referencia que pueden variar. El enlace
              guarda tu nota: pégalo en el grupo y que cada uno vea lo suyo.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-muted">
              <Share2 className="h-3.5 w-3.5" />
              Sin registro. Compartible con un toque.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <Reveal variant="scale" delay={100}>
          <SimuladorClient scores={scores} initialNota={nota ?? null} />
        </Reveal>

        {withoutCutoff > 0 && (
          <Reveal as="aside" className="mt-6 rounded-2xl border border-border bg-bg-primary p-5 text-sm">
            <p className="font-semibold text-text-primary">También hay {withoutCutoff} titulaciones con acceso sin nota de corte</p>
            <p className="mt-2 leading-relaxed text-text-secondary">Se muestran aparte de la comparación por nota. Debes cumplir la vía de acceso y el plazo de matrícula que indique cada universidad.</p>
            <Link href="/notas-corte?acceso=sin-corte" className="link-underline mt-3 inline-flex min-h-10 items-center gap-2 font-semibold text-violet">
              Consultar titulaciones y requisitos <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        )}

        {/* Salidas hacia donde se decide de verdad. */}
        <Reveal as="nav" aria-label="Herramientas relacionadas" className="mt-12 border-t border-border-light pt-8">
          <p className="eyebrow">Sigue por aquí</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { href: "/notas-corte", label: "Todas las carreras y notas de corte" },
              { href: "/nota-media", label: "Calculadora de nota media" },
              { href: "/test-vocacional", label: "Test vocacional" },
              { href: "/becas", label: "Becas que te tocan" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 rounded-full px-4 text-sm font-medium")}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </Reveal>

        <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-text-muted">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Las notas de corte cambian cada año con la demanda: la del curso
          pasado es una referencia, no una garantía. Úsalo para orientarte, no
          como promesa de plaza.
        </p>
      </div>
    </div>
  );
}
