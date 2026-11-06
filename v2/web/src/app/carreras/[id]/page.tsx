import { formatAcademicDuration } from '@/lib/academic-duration';
import { notFound, permanentRedirect } from "next/navigation";
import { academicReference } from '@/lib/academic-reference';
import { unstable_cache } from "next/cache";
import { ACADEMIC_CATALOGUE_VERSION } from "@/lib/academic-catalogue-version";
import { createPublicSupabase } from "@/lib/supabase-server";
import { careerMatch } from "@/lib/career-lookup";
import Link from "next/link";
import {
  ArrowRight, BookOpen, Briefcase, TrendingUp,
  MapPin, Clock, GraduationCap, Building,
  ExternalLink, School, Languages, CreditCard, MessageCircle
} from "lucide-react";
import type { Metadata } from "next";
import CareerComments from "./career-comments";
import CareerRating from "./career-rating";
import SectionNav from "@/components/SectionNav";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, Magnetic, ScrollProgress } from "@/components/motion";
import { cn } from "@/lib/utils";
import JsonLd from "@/components/JsonLd";
import AcademicConsultation from "@/components/AcademicConsultation";
import CutOffSource from "@/components/CutOffSource";
import { CURRENT_CUT_OFF_YEAR, cutOffCourse, cutOffForView, missingCutOffLabel, type CutOffRecord } from "@/lib/academic-year";
import { formatAcademicScore } from "@/lib/academic-score";
import { positiveNumber, workloadGuidance } from "@/lib/career-evidence";
import {
  type CareerProfile,
  OverviewSection,
  DifficultyCard,
  PreUniversitySection,
  UniversityStageSection,
  PostUniversitySection,
  SalidasSection,
  WhySection,
  SourcesSection,
  ProfileScope,
  LabourEvidenceSection,
} from "./profile-sections";

// Ficha pública cacheable: la nota de corte y los datos del grado son lo que la
// gente busca y no dependen del visitante. Cliente anon sin cookies. El layout
// raíz lee headers(), así que el HTML se renderiza por petición y este
// `revalidate` no lo evita; los DATOS sí se cachean una hora (abajo).
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

// Rendimiento (sep-2026): antes generateMetadata hacía su propia consulta y la
// página encadenaba otras cuatro en serie (carrera, perfil, misma carrera en
// otras unis, similares): cinco viajes a Supabase por visita. Ahora es una
// sola función cacheada por (columna, valor): la carrera primero y las tres
// dependientes en paralelo, con una hora de caché de datos.
//
// Arreglo de paso: "misma carrera en otras universidades" excluía la actual
// con `.neq("id", <parámetro de la URL>)`. Como la URL canónica lleva el slug
// y `id` es uuid, PostgREST rechazaba el filtro y la sección "Dónde
// estudiarla" no salía nunca. Se excluye por `career.id`, que es lo correcto
// entre por slug o por uuid.
// Nota del curso vigente de una fila. Una nota de otro curso nunca se enseña
// como actual en la ficha, en metadatos ni en las comparativas.
const currentScore = (row: CutOffRecord & { admission_without_cutoff?: boolean | null }) =>
  row.admission_without_cutoff ? null : cutOffForView(row, "current")?.score ?? null;

const getCareerPage = unstable_cache(
  async (column: "id" | "slug", value: string) => {
    const supabase = createPublicSupabase();
    const { data: career, error } = await supabase
      .from("careers")
      .select("*, universities(id, name, slug, city, comunidad_autonoma, type, logo_url)")
      .eq(column, value)
      .maybeSingle();
    // Un fallo de BD se relanza a propósito: devolver null lo cachearía como
    // "no existe" (404) durante una hora.
    if (error) throw new Error(`No se pudo cargar la carrera: ${error.message}`);
    if (!career) return null;

    const [profileRes, othersRes, similarRes] = await Promise.all([
      // Perfil profundo de la familia de carrera (migración 118). Query
      // separada para que la ficha siga funcionando si la columna/tabla aún
      // no existe.
      career.profile_id
        ? supabase.from("career_profiles").select("*").eq("id", career.profile_id).single()
        : Promise.resolve({ data: null }),
      // Misma carrera en otras universidades (sección "Dónde estudiarla").
      supabase
        .from("careers")
        .select("id, slug, name, cut_off_score, cut_off_year, cut_off_score_prev, cut_off_year_prev, admission_without_cutoff, duration_years, price_first_year, language, modality, campus, universities(id, name, slug, city, type)")
        .eq("name", career.name)
        .neq("id", career.id)
        .order("cut_off_score", { ascending: false, nullsFirst: false })
        .limit(50),
      // Carreras similares (misma rama, distinto nombre).
      supabase
        .from("careers")
        .select("id, slug, name, branch, cut_off_score, cut_off_year, cut_off_score_prev, cut_off_year_prev, admission_without_cutoff, universities(name, slug)")
        .eq("branch", career.branch)
        .neq("name", career.name)
        .neq("id", career.id)
        .order("cut_off_score", { ascending: false, nullsFirst: false })
        .limit(6),
    ]);

    return {
      career,
      profile: ((profileRes.data as CareerProfile | null) ?? null),
      sameCareerOthers: othersRes.data ?? [],
      similarCareers: similarRes.data ?? [],
    };
  },
  ["carrera-ficha-v7-curso-anterior", ACADEMIC_CATALOGUE_VERSION],
  { revalidate: 3600 }
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const match = careerMatch(id);
  const career = (await getCareerPage(match.column, match.value))?.career;

  if (!career) return { title: "Carrera no encontrada" };

  const uni = career.universities as unknown as UniRef | null;
  const score = currentScore(career);
  const nota = score != null ? `nota de corte ${formatAcademicScore(score)}` : "nota de corte";
  const title = `${career.name} en ${uni?.name || "España"}: ${nota}`;
  const location = career.campus || uni?.city;
  const description = `${career.name} en ${uni?.name || "España"}${location ? `, ${location}` : ""}: ${score != null ? `nota de corte ${formatAcademicScore(score)}, ` : ""}duración, precio, idioma y comparativa con otras universidades.`;

  // Canonical SIEMPRE al slug legible, aunque se haya entrado por el UUID viejo.
  const canonicalPath = `/carreras/${career.slug || id}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalPath,
    },
  };
}

// Forma de la relación embebida universities(...) en las queries de esta página
interface UniRef {
  id?: string;
  name?: string | null;
  slug?: string | null;
  city?: string | null;
  comunidad_autonoma?: string | null;
  type?: string | null;
  logo_url?: string | null;
}

const branchLabels: Record<string, string> = {
  ciencias: "Ciencias",
  ciencias_salud: "Ciencias de la Salud",
  ingenieria_arquitectura: "Ingeniería y Arquitectura",
  artes_humanidades: "Artes y Humanidades",
  ciencias_sociales_juridicas: "Ciencias Sociales y Jurídicas",
};

export default async function CareerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const match = careerMatch(id);
  const page = await getCareerPage(match.column, match.value);

  if (!page) notFound();

  const { career, profile, sameCareerOthers, similarCareers } = page;
  const workload = workloadGuidance(profile?.difficulty_score, profile?.difficulty_rationale);
  const academic = academicReference(career);

  // Se entró por el UUID viejo (cartel, QR, enlace antiguo): redirige 301 a la
  // URL con slug para consolidar la autoridad SEO en una sola dirección.
  // Fuera de la función cacheada a propósito: un redirect no es un dato.
  if (match.column === "id" && career.slug) {
    permanentRedirect(`/carreras/${career.slug}`);
  }

  const uni = career.universities as unknown as UniRef | null;
  const careerScore = currentScore(career);

  // La ficha es de catálogo (datos cacheados) para SEO: la edición de admin se
  // hace desde /admin, no inline, para no atar el render a la sesión.

  // Parse structured fields
  const reasonsToStudy: string[] = (career.reasons_to_study as string[]) || [];
  const reasonsNotToStudy: string[] = (career.reasons_not_to_study as string[]) || [];
  const jobRoles: string[] = (career.job_roles as string[]) || [];

  let prospects: string[] = [];
  if (career.career_prospects) {
    try {
      const parsed = JSON.parse(career.career_prospects);
      if (parsed.prospects) prospects = parsed.prospects;
    } catch {
      prospects = career.career_prospects.split("\n").filter((s: string) => s.trim());
    }
  }

  const totalOffersShown = (sameCareerOthers?.length || 0) + 1;

  // Datos estructurados Course con la universidad como proveedor.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: career.name,
    url: `https://franky.es/carreras/${career.slug || career.id}`,
    ...(career.description ? { description: career.description as string } : {}),
    ...(uni
      ? {
          provider: {
            "@type": "CollegeOrUniversity",
            name: uni.name,
            ...(uni.slug ? { url: `https://franky.es/universidades/${uni.slug}` } : {}),
          },
        }
      : {}),
    ...(careerScore != null
      ? {
          coursePrerequisites: `Nota de corte: ${formatAcademicScore(careerScore)} (${CURRENT_CUT_OFF_YEAR})`,
        }
      : {}),
  };

  // Offer-specific facts only; family guidance is shown with its scope below.
  const eur0 = (n: number) => `${Math.round(n).toLocaleString("es-ES")} €`;
  type HeroStat = { icon: typeof TrendingUp; value: string; label: string; tone: string };
  // `icon` y `tone` se conservan en los datos; la cinta los pinta en tinta y sin icono.
  const heroStats: HeroStat[] = [];
  if (career.admission_without_cutoff)
    heroStats.push({ icon: GraduationCap, value: "Sin corte", label: "Requisitos de acceso", tone: "violet" });
  else if (careerScore != null)
    heroStats.push({ icon: TrendingUp, value: formatAcademicScore(careerScore), label: `Corte ${cutOffCourse(CURRENT_CUT_OFF_YEAR)}`, tone: "violet" });
  else
    heroStats.push({ icon: GraduationCap, value: "Sin dato", label: missingCutOffLabel("current"), tone: "violet" });
  if (positiveNumber(career.duration_years) != null)
    heroStats.push({ icon: Clock, value: formatAcademicDuration(career.duration_years), label: positiveNumber(career.credits) != null ? `${career.credits} ECTS` : 'Créditos por confirmar', tone: 'violet' });
  else if (positiveNumber(career.credits) != null)
    heroStats.push({ icon: BookOpen, value: `${career.credits} ECTS`, label: 'Duración por confirmar', tone: 'violet' });
  if (career.modality)
    heroStats.push({ icon: School, value: career.modality, label: 'Modalidad del grado', tone: 'blue' });
  if (heroStats.length < 4 && positiveNumber(career.price_first_year) != null)
    heroStats.push({ icon: CreditCard, value: eur0(Number(career.price_first_year)), label: "Precio 1er año", tone: "success" });
  if (heroStats.length < 4 && career.language)
    heroStats.push({ icon: Languages, value: career.language, label: "Idioma", tone: "blue" });
  const stats4 = heroStats.slice(0, 4);

  const navItems = [
    { id: "resumen", label: "Resumen", show: !!(profile?.overview || career.description) },
    { id: "dificultad", label: workload?.score == null ? "Preparación" : "Dificultad", show: !!workload },
    { id: "etapas", label: "Etapas", show: !!(profile?.pre_university || profile?.university_stage || profile?.post_university) },
    { id: "datos-laborales", label: "Datos laborales", show: !!(profile?.empleabilidad?.fuente || profile?.salario_medio?.fuente) },
    { id: "salidas", label: "Salidas", show: !!(profile?.salidas?.length || jobRoles.length || prospects.length || profile?.why_study?.length || reasonsToStudy.length) },
    { id: "universidades", label: "Dónde estudiarla", show: !!(sameCareerOthers && sameCareerOthers.length > 0) },
    { id: "opiniones", label: "Opiniones", show: true },
  ].filter((n) => n.show).map(({ id, label }) => ({ id, label }));

  // Superficies de la ficha (v3): marco hairline blanco, sin cristal.
  const SECTION = "rounded-2xl border border-border bg-bg-primary p-6 sm:p-8";
  const H2 = "font-heading text-2xl font-bold tracking-tight text-text-primary";
  const externalLinks = [
    career.faculty_url ? { href: career.faculty_url as string, label: "Web de la Facultad", icon: Building } : null,
    career.career_url ? { href: career.career_url as string, label: "Ficha de la carrera", icon: BookOpen } : null,
    career.plan_url ? { href: career.plan_url as string, label: "Plan de estudios", icon: GraduationCap } : null,
  ].filter((l): l is { href: string; label: string; icon: typeof Building } => l !== null);
  const infoRows: { label: string; value: string; strong?: boolean }[] = [
    { label: "Tipo", value: career.degree_type?.replace("_", " ") || "Por confirmar" },
    { label: "Duración", value: positiveNumber(career.duration_years) != null ? formatAcademicDuration(career.duration_years) : "Por confirmar" },
    { label: "Créditos", value: positiveNumber(career.credits) != null ? `${career.credits} ECTS` : "Por confirmar" },
    { label: "Modalidad", value: career.modality || "Por confirmar" },
    ...(career.language ? [{ label: "Idioma", value: career.language as string }] : []),
    ...(career.campus ? [{ label: "Campus / centro", value: career.campus as string }] : []),
    ...(career.places_offered ? [{ label: "Plazas", value: String(career.places_offered) }] : []),
    ...(career.demand_ratio ? [{ label: "Ratio demanda", value: `${Number(career.demand_ratio).toFixed(1)}x` }] : []),
    ...(career.price_first_year ? [{ label: "Precio 1er año", value: `${Number(career.price_first_year).toLocaleString("es-ES")} €`, strong: true }] : []),
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-bg-primary">
      <ScrollProgress /><AcademicConsultation kind="career" entityId={career.id} />
      <JsonLd data={jsonLd} />

      {/* ============ CABECERA ============ */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <Breadcrumbs
            items={[
              { name: "Inicio", href: "/" },
              { name: "Notas de corte", href: "/notas-corte" },
              { name: career.name },
            ]}
          />

          <Reveal className="mt-8 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{branchLabels[career.branch] || career.branch}</Badge>
              {career.degree_type && (
                <Badge variant="outline" className="capitalize">{career.degree_type.replace("_", " ")}</Badge>
              )}
              {totalOffersShown > 1 && (
                <Badge variant="secondary">{totalOffersShown} ofertas para comparar</Badge>
              )}
            </div>

            <h1 className="mt-5 break-words text-balance text-fluid-h1 font-extrabold text-text-primary">
              {career.name}
            </h1>

            {uni && (
              <Link
                href={`/universidades/${uni.slug || uni.id}`}
                className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-text-secondary transition-colors hover:text-violet"
              >
                <Building className="h-4 w-4 shrink-0" />
                <span className="font-medium">{uni.name}</span>
                {(career.campus || uni.city) && (
                  <>
                    <span className="text-text-muted">·</span>
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{career.campus || uni.city}</span>
                  </>
                )}
              </Link>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {uni?.slug && (
                <Magnetic>
                  <Link
                    href={`/fomo/${uni.slug}`}
                    className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group")}
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" />
                    Pregunta a su comunidad en FOMO
                    <ArrowRight className="h-4 w-4 shrink-0 arrow-nudge" />
                  </Link>
                </Magnetic>
              )}
              <Link href="/notas-corte#calculadora" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group")}>
                <TrendingUp className="h-4 w-4 text-violet" />
                Calcular mi nota
              </Link>
            </div>
          </Reveal>

          {/* Cifras del grado en una fila tipográfica. */}
          {stats4.length > 0 && (
            <Reveal stagger className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-border-light py-8 sm:grid-cols-4">
              {stats4.map((st, i) => (
                <RevealItem key={st.label} index={i} className="min-w-0">
                  <p className="break-words font-heading text-3xl font-extrabold capitalize tracking-tight text-text-primary tabular">{st.value}</p>
                  <p className="mt-1 text-xs text-text-muted">{st.label}</p>
                </RevealItem>
              ))}
            </Reveal>
          )}
        </div>
      </section>

      {/* ============ CONTENIDO ============ */}
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        {academic && (
          <a href="#datos-academicos" className="link-underline mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-violet">
            <BookOpen className="h-4 w-4 shrink-0" />
            Duración y créditos comprobados · Ver detalles
          </a>
        )}
        <AcademicConsultation kind="cutoff" entityId={career.id} /><CutOffSource career={{
          cut_off_score: career.cut_off_score, cut_off_year: career.cut_off_year,
          cut_off_round: career.cut_off_round, cut_off_source_url: career.cut_off_source_url,
          cut_off_verified_at: career.cut_off_verified_at, cut_off_extraordinary: career.cut_off_extraordinary,
          cut_off_score_prev: career.cut_off_score_prev, cut_off_year_prev: career.cut_off_year_prev,
          cut_off_round_prev: career.cut_off_round_prev, cut_off_source_url_prev: career.cut_off_source_url_prev,
          admission_without_cutoff: career.admission_without_cutoff,
        }} />

        {navItems.length > 1 && <SectionNav items={navItems} />}

        <div className="grid gap-12 lg:grid-cols-12 lg:items-start">
          {/* min-w-0: en WebKit los items de grid tienen min-width:auto y no
              encogen por debajo del min-content de un hijo (p. ej. la tabla de
              otras universidades), lo que desbordaba la columna en iOS. */}
          <div className="min-w-0 space-y-8 lg:col-span-8">
            {profile && <ProfileScope profile={profile} />}

            {/* ¿Qué es? Perfil profundo con vuelta al campo antiguo. */}
            {profile?.overview ? (
              <Reveal id="resumen" className="scroll-mt-32">
                <OverviewSection profile={profile} careerName={career.name} />
              </Reveal>
            ) : career.description ? (
              <Reveal as="section" id="resumen" className={cn("scroll-mt-32", SECTION)}>
                <h2 className={H2}>¿Qué es {career.name}?</h2>
                <p className="mt-4 leading-relaxed text-text-secondary">{career.description}</p>
              </Reveal>
            ) : null}

            {/* Dificultad */}
            {profile && workload && (
              <Reveal id="dificultad" className="scroll-mt-32">
                <DifficultyCard profile={profile} />
              </Reveal>
            )}

            {/* Etapas: antes, durante y después de la universidad. */}
            {profile && (profile.pre_university || profile.university_stage || profile.post_university) && (
              <div id="etapas" className="scroll-mt-32 space-y-8">
                <Reveal><PreUniversitySection pre={profile.pre_university} /></Reveal>
                <Reveal><UniversityStageSection stage={profile.university_stage} /></Reveal>
                <Reveal><PostUniversitySection post={profile.post_university} /></Reveal>
              </div>
            )}

            {profile && (
              <Reveal id="datos-laborales" className="scroll-mt-32">
                <LabourEvidenceSection profile={profile} />
              </Reveal>
            )}

            {/* Salidas y por qué sí o no. */}
            <div id="salidas" className="scroll-mt-32 space-y-8">
              {profile?.salidas && profile.salidas.length > 0 ? (
                <Reveal><SalidasSection salidas={profile.salidas} /></Reveal>
              ) : jobRoles.length > 0 || prospects.length > 0 ? (
                <Reveal as="section" className={SECTION}>
                  <h2 className={cn(H2, "flex items-center gap-2")}>
                    <Briefcase className="h-5 w-5 text-violet" />
                    Salidas profesionales
                  </h2>
                  <ol className="mt-5 divide-y divide-border-light">
                    {(jobRoles.length > 0 ? jobRoles : prospects).map((item, i) => (
                      <li key={i} className="flex items-baseline gap-4 py-2.5 text-sm text-text-secondary">
                        <span className="w-6 shrink-0 font-heading text-xs font-bold text-violet tabular">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {item}
                      </li>
                    ))}
                  </ol>
                </Reveal>
              ) : null}

              <Reveal>
                <WhySection
                  whyStudy={profile?.why_study?.length ? profile.why_study : reasonsToStudy}
                  whyNot={profile?.why_not_study?.length ? profile.why_not_study : reasonsNotToStudy}
                />
              </Reveal>
            </div>

            {/* ============ MISMA CARRERA EN OTRAS UNIVERSIDADES ============ */}
            {sameCareerOthers && sameCareerOthers.length > 0 && (
              <Reveal as="section" id="universidades" className={cn("scroll-mt-32", SECTION)}>
                <h2 className={H2}>Dónde estudiar {career.name}</h2>
                <p className="mt-2 text-sm text-text-muted">
                  Compara esta ficha con {sameCareerOthers.length} ofertas del catálogo. Una universidad puede tener varios campus o modalidades. Consulta el curso de cada nota.
                </p>

                <div className="-mx-6 mt-5 overflow-x-auto px-6 sm:-mx-8 sm:px-8">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                        <th scope="col" className="pb-3 pr-3">Universidad</th>
                        <th scope="col" className="pb-3 text-right">Nota {cutOffCourse(CURRENT_CUT_OFF_YEAR)}</th>
                        <th scope="col" className="hidden pb-3 text-right sm:table-cell">Precio</th>
                        <th scope="col" className="hidden pb-3 text-left md:table-cell md:pl-6">Idioma</th>
                        <th scope="col" className="hidden pb-3 text-left md:table-cell">Modalidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {/* Fila de la universidad actual, destacada. */}
                      <tr className="bg-bg-secondary/60">
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>Actual</Badge>
                            <span className="font-semibold text-text-primary">{uni?.name}</span>
                          </div>
                          {career.campus && <span className="text-xs text-text-muted">{career.campus}</span>}
                        </td>
                        <td className="py-3 text-right font-heading font-extrabold text-text-primary tabular">
                          {careerScore != null ? formatAcademicScore(careerScore) : <span className="text-xs font-normal text-text-muted">{missingCutOffLabel("current")}</span>}
                          {careerScore != null && <span className="block text-[10px] font-normal text-text-muted">{cutOffCourse(CURRENT_CUT_OFF_YEAR)}</span>}
                        </td>
                        <td className="hidden py-3 text-right tabular sm:table-cell">
                          {career.price_first_year ? `${Number(career.price_first_year).toLocaleString("es-ES")} €` : <span className="text-xs text-text-muted">Sin dato</span>}
                        </td>
                        <td className="hidden py-3 capitalize md:table-cell md:pl-6">{career.language || <span className="text-xs text-text-muted">Sin dato</span>}</td>
                        <td className="hidden py-3 capitalize md:table-cell">{career.modality || <span className="text-xs text-text-muted">Sin dato</span>}</td>
                      </tr>
                      {sameCareerOthers.map((other) => {
                        const otherUni = other.universities as unknown as UniRef | null;
                        const otherScore = currentScore(other);
                        return (
                          <tr key={other.id} className="transition-colors hover:bg-bg-secondary">
                            <td className="py-3 pr-3">
                              <Link
                                href={`/carreras/${other.slug || other.id}`}
                                className="font-medium text-text-primary transition-colors hover:text-violet"
                              >
                                {otherUni?.name}
                              </Link>
                              <div className="flex items-center gap-1 text-xs text-text-muted">
                                <MapPin className="h-3 w-3" />
                                {other.campus || otherUni?.city}
                                {otherUni?.type && (
                                  <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                                    {otherUni.type === "publica" ? "Púb." : "Priv."}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 text-right font-heading font-extrabold text-text-primary tabular">
                              {otherScore != null ? (
                                formatAcademicScore(otherScore)
                              ) : (
                                <span className="text-xs font-normal text-text-muted">{missingCutOffLabel("current")}</span>
                              )}
                            </td>
                            <td className="hidden py-3 text-right tabular sm:table-cell">
                              {other.price_first_year ? `${Number(other.price_first_year).toLocaleString("es-ES")} €` : <span className="text-xs text-text-muted">Sin dato</span>}
                            </td>
                            <td className="hidden py-3 capitalize md:table-cell md:pl-6">{other.language || <span className="text-xs text-text-muted">Sin dato</span>}</td>
                            <td className="hidden py-3 capitalize md:table-cell">{other.modality || <span className="text-xs text-text-muted">Sin dato</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Reveal>
            )}

            {/* Carreras parecidas de la misma rama. */}
            {similarCareers && similarCareers.length > 0 && (
              <Reveal as="section" className={SECTION}>
                <h2 className={H2}>Otras carreras de esta rama</h2>
                <ul className="mt-5 divide-y divide-border-light">
                  {similarCareers.map((sc) => (
                    <li key={sc.id}>
                      <Link
                        href={`/carreras/${sc.slug || sc.id}`}
                        className="group -mx-3 flex items-center justify-between gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-bg-secondary"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-violet">{sc.name}</p>
                          <p className="text-xs text-text-muted">{(sc.universities as unknown as UniRef | null)?.name}</p>
                        </div>
                        {currentScore(sc) != null && (
                          <span className="shrink-0 font-heading text-sm font-extrabold text-text-primary tabular">
                            {formatAcademicScore(currentScore(sc)!)}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {/* Fuentes de los datos investigados. */}
            {profile && <Reveal><SourcesSection profile={profile} /></Reveal>}

            {/* ============ VALORACIÓN Y OPINIONES ============ */}
            <div id="opiniones" className="scroll-mt-32 space-y-8">
              <Reveal><CareerRating careerId={career.id} /></Reveal>
              <Reveal><CareerComments careerId={career.id} /></Reveal>
            </div>
          </div>

          {/* ============ LATERAL ============ */}
          <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:col-span-4">
            <Reveal variant="fade" delay={150} as="section" id="datos-academicos" className="scroll-mt-32 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
              <h2 className="font-heading text-lg font-bold text-text-primary">Información del grado</h2>
              <dl className="mt-3 divide-y divide-border-light text-sm">
                {infoRows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-4 py-2.5">
                    <dt className="text-text-muted">{row.label}</dt>
                    <dd className={cn("min-w-0 break-words text-right capitalize tabular", row.strong ? "font-bold text-text-primary" : "font-medium text-text-primary")}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {academic && (
                <div className="mt-4 rounded-xl bg-bg-secondary p-4 text-sm">
                  <p className="font-semibold text-text-primary">Duración y créditos comprobados</p>
                  <p className="mt-1 text-text-muted">Revisados el {academic.checkedDate}.</p>
                  {academic.note && <p className="mt-2 leading-relaxed text-text-muted">{academic.note}</p>}
                  <a href={academic.url} target="_blank" rel="noopener noreferrer" className="link-underline mt-2 inline-flex min-h-11 items-center gap-2 font-medium text-violet">
                    {academic.title}<ExternalLink className="h-4 w-4 shrink-0" />
                  </a>
                </div>
              )}
            </Reveal>

            {/* Enlaces oficiales */}
            {externalLinks.length > 0 && (
              <Reveal variant="fade" delay={200} as="section" className="rounded-2xl border border-border bg-bg-primary p-6">
                <h2 className="font-heading text-lg font-bold text-text-primary">Enlaces</h2>
                <ul className="mt-3 divide-y divide-border-light">
                  {externalLinks.map((l) => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 py-2.5 text-sm text-text-primary transition-colors hover:text-violet"
                      >
                        <l.icon className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-violet" />
                        <span className="flex-1">{l.label}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      </a>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {/* Etiquetas */}
            {career.tags && career.tags.length > 0 && (
              <Reveal variant="fade" delay={250} as="section" className="rounded-2xl border border-border bg-bg-primary p-6">
                <h2 className="font-heading text-lg font-bold text-text-primary">Áreas relacionadas</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {career.tags.map((tag: string, i: number) => (
                    <Badge key={i} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </Reveal>
            )}

            {/* Única superficie oscura de la ficha: el test vocacional. */}
            <Reveal variant="scale" delay={300} className="rounded-2xl bg-bg-dark p-6 text-white">
              <h3 className="font-heading text-lg font-bold">¿No sabes qué estudiar?</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Haz nuestro test vocacional y descubre qué carrera encaja con tu personalidad.
              </p>
              <Link
                href="/test-vocacional"
                className={cn(buttonVariants({ variant: "onBrand" }), "group mt-5 w-full")}
              >
                Descubrir mi carrera ideal
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
            </Reveal>
          </aside>
        </div>
      </div>
    </div>
  );
}
