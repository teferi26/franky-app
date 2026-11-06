import type { Metadata } from "next";
import { createPublicSupabase } from "@/lib/supabase-server";
import { unstable_cache } from 'next/cache';
import { completeCatalogue } from '@/lib/complete-catalogue';
import { ACADEMIC_CATALOGUE_VERSION } from '@/lib/academic-catalogue-version';
import { summarizeUniversityAdmission } from '@/lib/university-comparison';
import { CURRENT_CUT_OFF_YEAR, PREVIOUS_CUT_OFF_YEAR } from '@/lib/academic-year';
import Breadcrumbs from "@/components/Breadcrumbs";
import { Reveal } from "@/components/motion";
import CompararUnisClient, { type UniRow } from "./client";

/**
 * Comparador de universidades. Portado de la app movil (comparar-unis.tsx),
 * donde ya existia; en web solo habia comparador de pisos.
 *
 * Publico e indexable: "UA o UMH", "que universidad elijo" y similares son
 * busquedas de decision con muchisimo volumen en junio y julio.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Comparar universidades de España",
  description:
    "Compara hasta cuatro universidades españolas lado a lado: ciudad, titularidad, número de estudiantes, grados que ofrecen y sus notas de corte máxima y mínima.",
  alternates: { canonical: "/universidades/comparar" },
  openGraph: {
    title: "Comparar universidades de España",
    description:
      "Ciudad, titularidad, estudiantes, grados y notas de corte, lado a lado.",
    url: "/universidades/comparar",
    type: "website",
  },
};

const getComparisonCatalogue = unstable_cache(async () => {
  const supabase = createPublicSupabase();
  const [unis, careers] = await Promise.all([
    completeCatalogue((from, to) => supabase.from('universities')
      .select('id, slug, name, short_name, city, comunidad_autonoma, type, founded_year, student_count, campus_count, institutional_sources')
      .order('id').range(from, to)),
    completeCatalogue((from, to) => supabase.from('careers')
      .select('university_id, cut_off_score, cut_off_year, cut_off_score_prev, cut_off_year_prev, admission_without_cutoff')
      .order('id').range(from, to)),
  ]);
  return { unis, careers };
}, ['universidades-comparar-curso-anterior', ACADEMIC_CATALOGUE_VERSION], { revalidate: 3600 });

export default async function CompararUniversidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ unis?: string }>;
}) {
  const params = await searchParams;
  const { unis, careers } = await getComparisonCatalogue();
  // Rangos por curso: el vigente por defecto y el anterior para el conmutador.
  const agg = summarizeUniversityAdmission(careers, CURRENT_CUT_OFF_YEAR);
  const aggPrev = summarizeUniversityAdmission(careers, PREVIOUS_CUT_OFF_YEAR);

  const rows: UniRow[] = (unis ?? [])
    .filter((u) => u.slug)
    .map((u) => {
      const a = agg.get(u.id) ?? { count: 0, min: null, max: null, year: null, scored: 0 };
      const p = aggPrev.get(u.id) ?? { count: 0, min: null, max: null, year: null, scored: 0 };
      return {
        id: u.id,
        slug: u.slug as string,
        name: u.name,
        short_name: u.short_name,
        city: u.city,
        comunidad_autonoma: u.comunidad_autonoma,
        type: u.type,
        founded_year: u.founded_year,
        student_count: u.student_count,
        campus_count: u.campus_count,
        institutional_sources: u.institutional_sources,
        cut_off_year: a.year,
        scored_offers: a.scored,
        careers_count: a.count,
        min_cut_off: a.min,
        max_cut_off: a.max,
        scored_offers_prev: p.scored,
        min_cut_off_prev: p.min,
        max_cut_off_prev: p.max,
      };
    });

  const initialSlugs = (params.unis ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* ============ CABECERA ============ */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 pt-6 pb-10 sm:px-6 lg:px-8 lg:pt-8 lg:pb-14">
          <Breadcrumbs
            items={[
              { name: "Inicio", href: "/" },
              { name: "Universidades", href: "/universidades" },
              { name: "Comparar" },
            ]}
          />
          <Reveal className="mt-8 max-w-2xl">
            <p className="eyebrow">Universidades</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Comparar universidades
            </h1>
            <p className="mt-3 max-w-xl text-text-muted">
              Hasta cuatro a la vez, lado a lado. El enlace guarda tu selección,
              así que puedes mandarlo tal cual al grupo y discutirlo con datos.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <Reveal delay={80}>
          <CompararUnisClient universities={rows} initialSlugs={initialSlugs} />
        </Reveal>
      </div>
    </div>
  );
}
