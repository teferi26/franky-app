import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import UniversityCardImage from "./UniversityCardImage";
import { UNIVERSITY_GALLERIES } from "@/lib/university-gallery";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { MapPin, Users, Building2, BadgeCheck, Scale, ArrowRight, ArrowUpRight } from "lucide-react";
import { createPublicSupabase } from "@/lib/supabase-server";
import type { Metadata } from "next";
import UniversityFilters from "./filters";
import { listingMetadata } from "@/lib/listing-seo";
import { universityStudentContext } from "@/lib/university-evidence";
import { ACADEMIC_CATALOGUE_VERSION } from "@/lib/academic-catalogue-version";
import { completeCatalogue } from "@/lib/complete-catalogue";
import { universityListing, universityPageHref, universityParams } from "@/lib/university-listing";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, SpotlightCard } from "@/components/motion";
import { cn } from "@/lib/utils";

// One public catalogue cache, shared by every search and page. Search input
// never creates a new cache entry or another database round trip.
export const revalidate = 3600;
const getUniversidades = unstable_cache(async () => {
  const supabase = createPublicSupabase();
  return completeCatalogue((from, to) => supabase.from("universities")
    .select("id, name, slug, type, city, comunidad_autonoma, image_url, student_count, founded_year, description, is_partner, partner_tier, institutional_sources")
    .order("name").order("id").range(from, to));
}, ["universidades-catalogo-v2", ACADEMIC_CATALOGUE_VERSION], { revalidate: 3600 });

// Metadatos por variante: las combinaciones de filtros van a noindex y la
// paginación lleva su propia canonical, para no generar casi-duplicados de la
// misma página. Ver lib/listing-seo.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return listingMetadata({
    path: "/universidades",
    title: "Universidades de España",
    description: "Explora todas las universidades públicas y privadas de España. Filtra por comunidad autónoma, tipo, ciudad y más.",
    params: universityParams(await searchParams),
    paginationKeys: ["pagina"],
  });
}

export default async function UniversidadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = universityParams(await searchParams);

  const catalogue = await getUniversidades();
  const { filtered: universities, visible, page, pages, start } = universityListing(catalogue, params);
  // Invalid/out-of-range URLs must not present the last page under a different
  // canonical or leave a visitor on an empty page after changing a filter.
  if (params.pagina !== undefined && params.pagina !== (page > 1 ? String(page) : undefined)) {
    redirect(universityPageHref(params, page));
  }
  const uniqueComunidades = [...new Set(catalogue.map(uni => uni.comunidad_autonoma).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, "es"));
  const uniqueCiudades = [...new Set(catalogue
    .filter(uni => !params.comunidad || uni.comunidad_autonoma === params.comunidad)
    .map(uni => uni.city).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, "es"));
  const total = universities.length;
  const publicas = universities.filter(u => u.type === "publica").length;
  const privadas = universities.filter(u => u.type === "privada").length;

  // Paginación limpia: botones del sistema, la página actual en oscuro.
  const pagination = pages > 1 && (
    <nav aria-label="Páginas de universidades" className="flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 && (
        <Link href={`${universityPageHref(params, page - 1)}#resultados`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Anterior
        </Link>
      )}
      {Array.from({ length: pages }, (_, index) => index + 1).map(number =>
        <Link
          key={number}
          href={`${universityPageHref(params, number)}#resultados`}
          aria-label={`Página ${number}`}
          aria-current={page === number ? "page" : undefined}
          className={cn(buttonVariants({ variant: page === number ? "dark" : "ghost", size: "sm" }), "min-w-9 px-2 tabular")}
        >
          {number}
        </Link>
      )}
      {page < pages && (
        <Link href={`${universityPageHref(params, page + 1)}#resultados`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Siguiente
        </Link>
      )}
    </nav>
  );

  const stats = [
    { value: total, label: total === 1 ? "universidad" : "universidades" },
    { value: publicas, label: publicas === 1 ? "pública" : "públicas" },
    { value: privadas, label: privadas === 1 ? "privada" : "privadas" },
  ];

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* ============ CABECERA ============ */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow">Catálogo</p>
              <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
                Universidades de España
              </h1>
              <p className="mt-3 max-w-xl text-text-muted">
                Explora todas las universidades públicas y privadas. Descubre sus campus,
                compara carreras y entra en la comunidad de tu universidad.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <dl className="flex gap-6">
                {stats.map((s) => (
                  <div key={s.label}>
                    <dd className="font-heading text-2xl font-extrabold tracking-tight text-text-primary tabular">
                      {s.value.toLocaleString("es-ES")}
                    </dd>
                    <dt className="text-xs text-text-muted">{s.label}</dt>
                  </div>
                ))}
              </dl>
              {/* El comparador salió del navbar (24-jul): su casa es esta página. */}
              <Link
                href="/universidades/comparar"
                className={cn(buttonVariants({ variant: "outline" }), "group")}
              >
                <Scale className="h-4 w-4 text-violet" />
                Comparar universidades
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
            </div>
          </Reveal>

          <UniversityFilters comunidades={uniqueComunidades} ciudades={uniqueCiudades} />
        </div>
      </section>

      {/* ============ RESULTADOS ============ */}
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <div id="resultados" className="mb-6 flex scroll-mt-28 flex-wrap items-center justify-between gap-4">
          <p role="status" className="text-sm text-text-muted">
            {total} {total === 1 ? "universidad encontrada" : "universidades encontradas"}{total > 0 && ` · Mostrando ${start + 1} a ${start + visible.length}`}
          </p>
          {pagination}
        </div>

        <Reveal stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((uni, i) => (
            <RevealItem key={uni.id} index={i} asChild>
              <SpotlightCard asChild>
                <Link
                  href={`/universidades/${uni.slug}`}
                  className="group hover-lift flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15"
                >
                  {/* Foto en marco, con zoom lento al pasar el ratón. */}
                  <div className="img-zoom relative aspect-[16/10] bg-bg-secondary">
                    <UniversityCardImage src={UNIVERSITY_GALLERIES[uni.slug]?.images[0] ?? uni.image_url} name={`${uni.name}${UNIVERSITY_GALLERIES[uni.slug] ? " · Recreación con IA" : ""}`} />
                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-bg-primary/95 px-2.5 py-1 text-[11px] font-semibold text-text-primary shadow-card">
                        {uni.type === "publica" ? "Pública" : "Privada"}
                      </span>
                      {uni.is_partner && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-bg-primary/95 px-2.5 py-1 text-[11px] font-semibold text-violet-deep shadow-card"
                          title="Universidad colaboradora de Franky"
                        >
                          <BadgeCheck className="h-3.5 w-3.5" />
                          {uni.partner_tier === "fundadora" ? "Fundadora" : "Colaboradora"}
                        </span>
                      )}
                    </div>
                    {UNIVERSITY_GALLERIES[uni.slug] && (
                      <span className="absolute bottom-3 right-3 rounded-full bg-bg-dark/70 px-2 py-0.5 text-[10px] font-medium text-white">
                        Recreación con IA
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-heading text-[17px] font-bold leading-snug text-text-primary transition-colors group-hover:text-violet">
                        {uni.name}
                      </h3>
                      <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover:-translate-y-px group-hover:translate-x-px group-hover:opacity-100" />
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-text-muted">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {uni.city}, {uni.comunidad_autonoma}
                        {uni.founded_year ? ` · desde ${uni.founded_year}` : ""}
                      </span>
                    </p>
                    {uni.student_count != null && uni.student_count > 0 && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <span className="tabular">
                          {uni.student_count.toLocaleString("es-ES")} estudiantes · {universityStudentContext(uni)}
                        </span>
                      </p>
                    )}

                    {uni.description && (
                      <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-text-muted">
                        {uni.description.length > 200 ? `${uni.description.slice(0, 200).trimEnd()}…` : uni.description}
                      </p>
                    )}
                  </div>
                </Link>
              </SpotlightCard>
            </RevealItem>
          ))}
        </Reveal>

        {pages > 1 && <div className="mt-10">{pagination}</div>}

        {/* Vacío del sistema: misma ilustración de marca que el resto de
            listados y, sobre todo, una salida. */}
        {total === 0 && (
          <EmptyState
            icon={Building2}
            title="No encontramos ninguna universidad"
            description="Ningún campus coincide con lo que has buscado. Prueba con menos filtros o mira el listado completo."
            action={{ href: "/universidades", label: "Ver todas las universidades" }}
            secondaryAction={{ href: "/notas-corte", label: "Buscar por nota de corte" }}
          />
        )}
      </div>
    </div>
  );
}
