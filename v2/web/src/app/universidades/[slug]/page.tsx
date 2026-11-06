import AcademicConsultation from "@/components/AcademicConsultation";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Quote, Link2, MapPin, Users, Building2, Globe, ArrowRight, Flame, Heart, MessageCircle, BadgeCheck, TrendingUp } from "lucide-react";
import { unstable_cache } from "next/cache";
import { ACADEMIC_CATALOGUE_VERSION } from "@/lib/academic-catalogue-version";
import { createPublicSupabase } from "@/lib/supabase-server";
import type { Metadata } from "next";
import Breadcrumbs from "@/components/Breadcrumbs";
import JsonLd from "@/components/JsonLd";
import UniversityFactSource from "@/components/UniversityFactSource";
import { universityEvidence, hasUniversityEvidenceRecord, type UniversityEvidenceField } from "@/lib/university-evidence";
import PartnerShowcase from "./partner-showcase";
import UniversityCareerList, { type UniversityCareer } from "./career-list";
import type { PreviewThread } from "../../fomo/[slug]/public-preview";
import { UNIVERSITY_GALLERIES } from "@/lib/university-gallery";
import PartyCampusBanner from '@/components/social/PartyCampusBanner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem, Magnetic, ScrollProgress } from "@/components/motion";
import { cn } from "@/lib/utils";

export const revalidate = 3600;
const getUniversityPage = unstable_cache(async (slug: string) => {
  const supabase = createPublicSupabase();
  const { data: uni, error } = await supabase.from("universities").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error("No se pudo cargar la universidad");
  if (!uni) return null;
  const [careers, preview] = await Promise.all([
    supabase.from("careers").select("id, slug, name, branch, cut_off_score, cut_off_year, cut_off_score_prev, cut_off_year_prev, admission_without_cutoff, duration_years, campus").eq("university_id", uni.id).order("name"),
    supabase.rpc("get_fomo_public_preview", { p_university_slug: slug, p_limit: 3 }),
  ]);
  if (careers.error) throw new Error("No se pudieron cargar las titulaciones");
  return { uni, careers: (careers.data ?? []) as UniversityCareer[], threads: (preview.error ? [] : preview.data ?? []) as PreviewThread[], previewAvailable: !preview.error };
}, ["universidad-ficha-v5-curso-anterior", ACADEMIC_CATALOGUE_VERSION], { revalidate: 3600 });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = (await getUniversityPage(slug))?.uni;
  if (!data) return { title: "Universidad no encontrada" };
  const title = `${data.name}: grados, notas de corte y vida de campus | Franky`;
  const description = `Conoce ${data.name} en ${data.city}. Explora sus titulaciones y notas de corte y descubre la vida del campus en FOMO.`;
  const image = UNIVERSITY_GALLERIES[slug]?.images[0] ?? data.image_url;
  return { title: { absolute: title }, description, alternates: { canonical: `/universidades/${slug}` }, openGraph: { title, description, type: "website", url: `/universidades/${slug}`, images: image ? [image] : undefined } };
}

// Las pestañas se montan siempre (forceMount) y solo se ocultan con CSS: el
// texto de la descripción y el listado de carreras siguen en el HTML para el
// buscador, y el cambio de pestaña no vuelve a pintar nada.
const TAB_PANEL = "mt-8 data-[state=inactive]:hidden";

export default async function UniversityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getUniversityPage(slug);
  if (!page) notFound();
  const { uni, careers, threads, previewAvailable } = page;
  const website = typeof uni.website === "string" && /^https?:\/\//i.test(uni.website) ? uni.website : null;
  const generated = UNIVERSITY_GALLERIES[slug];
  const gallery = generated?.images ?? (Array.isArray(uni.gallery_urls) ? uni.gallery_urls : []).filter((url: unknown): url is string => typeof url === "string" && /^https:\/\//.test(url)).slice(0, 4);
  const heroImage = generated?.images[0] ?? uni.image_url;
  const heroIsLogo = !generated && !!heroImage && (heroImage === uni.logo_url || /\.svg(?:[/?#]|$)/i.test(heroImage));
  const imageAttribution = generated?.label ?? uni.image_attribution;
  const fomoHref = `/fomo/${uni.slug}`;
  const descriptionEvidence = universityEvidence(uni, 'description');
  const facts: { label: string; value: string | number | null; field?: UniversityEvidenceField }[] = [
    { label: 'Ofertas en Franky', value: careers.length },
    { label: 'Estudiantes', value: uni.student_count ? Number(uni.student_count).toLocaleString('es-ES') : null, field: 'student_count' },
    { label: 'Campus', value: uni.campus_count, field: 'campus_count' },
    { label: 'Fundación', value: uni.founded_year, field: 'founded_year' },
    { label: 'Modalidad', value: uni.modality },
  ];
  const visibleFacts = facts.filter(item => item.value != null);
  const curiosities = Array.isArray(uni.curiosities) ? uni.curiosities as string[] : [];
  const hasSummary = !!uni.description || curiosities.length > 0 || !!uni.is_partner;

  return (
    <div className="min-h-screen overflow-x-clip bg-bg-primary">
      <ScrollProgress /><AcademicConsultation kind="university" entityId={uni.id} />
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollegeOrUniversity", name: uni.name, url: `https://franky.es/universidades/${slug}`, ...(website ? { sameAs: [website] } : {}), address: { "@type": "PostalAddress", addressLocality: uni.city, addressRegion: uni.comunidad_autonoma, addressCountry: "ES" } }} />

      {/* ============ CABECERA ============ */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <Breadcrumbs
            items={[
              { name: "Inicio", href: "/" },
              { name: "Universidades", href: "/universidades" },
              { name: uni.name },
            ]}
          />

          <div className="mt-8 grid gap-10 pb-10 lg:grid-cols-12 lg:items-center lg:gap-12 lg:pb-14">
            <Reveal className="min-w-0 lg:col-span-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{uni.type === "publica" ? "Pública" : "Privada"}</Badge>
                {uni.is_partner && (
                  <Badge title="Universidad colaboradora de Franky">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {uni.partner_tier === "fundadora" ? "Fundadora" : "Colaboradora"}
                  </Badge>
                )}
                {uni.modality && uni.modality !== "presencial" && (
                  <Badge variant="outline">{uni.modality === "online" ? "Online" : "Semipresencial"}</Badge>
                )}
                {uni.founded_year && <Badge variant="outline">Desde {uni.founded_year}</Badge>}
              </div>

              <h1 className="mt-5 break-words text-fluid-h1 font-extrabold text-text-primary">
                {uni.name}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-text-muted">
                <span className="flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">{uni.city}, {uni.comunidad_autonoma}</span>
                </span>
                {uni.student_count && (
                  <span className="flex items-center gap-1.5 tabular">
                    <Users className="h-4 w-4 shrink-0" />
                    {uni.student_count.toLocaleString("es-ES")} estudiantes
                  </span>
                )}
              </div>

              {uni.motto && (
                <p className="mt-4 flex items-start gap-2 text-[15px] italic leading-relaxed text-text-secondary">
                  <Quote className="mt-1 h-3.5 w-3.5 shrink-0 text-violet" />
                  {uni.motto}
                </p>
              )}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Magnetic>
                  <Link
                    href={fomoHref}
                    className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine group h-auto min-h-12 whitespace-normal py-3 text-left")}
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" />
                    FOMO · Lo que pasa en {uni.name}
                    <ArrowRight className="h-4 w-4 shrink-0 arrow-nudge" />
                  </Link>
                </Magnetic>
                <Link
                  href={`/notas-corte?universidad=${uni.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group")}
                >
                  <TrendingUp className="h-4 w-4 text-violet" />
                  Ver notas de corte
                </Link>
              </div>
            </Reveal>

            {/* Foto en marco, nunca a sangre. */}
            <Reveal variant="scale" delay={120} className="lg:col-span-6">
              <figure className="img-zoom relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-bg-secondary shadow-card">
                {heroImage ? (
                  <Image
                    src={heroImage}
                    alt={heroIsLogo ? `Logotipo de ${uni.name}` : generated ? `Recreación con IA de ${uni.name}` : uni.name}
                    fill
                    className={heroIsLogo ? "object-contain p-10" : "object-cover"}
                    priority
                    sizes="(min-width: 1024px) 560px, 100vw"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Building2 className="h-16 w-16 text-text-muted/30" />
                  </div>
                )}
                {imageAttribution && (
                  <figcaption className="absolute bottom-3 right-3 max-w-[80%] truncate rounded-full bg-bg-dark/70 px-2.5 py-1 text-[10px] font-medium text-white">
                    {imageAttribution}
                  </figcaption>
                )}
              </figure>
            </Reveal>
          </div>

          {/* Cifras de la universidad, en una fila tipográfica. */}
          {visibleFacts.length > 0 && (
            <Reveal stagger className="grid grid-cols-2 gap-x-6 gap-y-8 border-t border-border-light py-8 sm:grid-cols-3 lg:grid-cols-5">
              {visibleFacts.map((item, i) => (
                <RevealItem key={item.label} index={i} className="min-w-0">
                  <p className="font-heading text-3xl font-extrabold capitalize tracking-tight text-text-primary tabular">{item.value}</p>
                  <p className="mt-1 text-xs text-text-muted">{item.label}</p>
                  {item.field && <UniversityFactSource evidence={universityEvidence(uni, item.field)} period={item.field === 'student_count'} />}
                </RevealItem>
              ))}
            </Reveal>
          )}
        </div>
      </section>

      {/* ============ CONTENIDO ============ */}
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <PartyCampusBanner universityId={uni.id} />
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <Tabs defaultValue={hasSummary ? "resumen" : "carreras"}>
              <TabsList className="max-w-full overflow-x-auto scrollbar-hide">
                <TabsTrigger value="resumen">Resumen</TabsTrigger>
                <TabsTrigger value="carreras">
                  Carreras <span className="text-text-muted tabular">({careers?.length || 0})</span>
                </TabsTrigger>
                {gallery.length > 0 && <TabsTrigger value="campus">Campus</TabsTrigger>}
              </TabsList>

              {/* ---- Resumen ---- */}
              <TabsContent value="resumen" forceMount className={cn(TAB_PANEL, "space-y-12")}>
                {uni.is_partner && (
                  <Reveal>
                    <PartnerShowcase uni={uni} careers={careers ?? []} />
                  </Reveal>
                )}

                {uni.description && (
                  <Reveal as="section">
                    <p className="eyebrow">Sobre la universidad</p>
                    <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-text-secondary">
                      {uni.description}
                    </p>
                    <UniversityFactSource evidence={descriptionEvidence} />
                    {!descriptionEvidence && hasUniversityEvidenceRecord(uni, "description") && <p className="mt-3 text-xs text-text-muted">Fuente de esta descripción pendiente de comprobar.</p>}
                    {/* Atribución del TEXTO, no solo de la foto. Estas descripciones
                        proceden de Wikipedia, cuya licencia CC BY-SA 4.0 exige citar
                        la fuente y decir bajo qué licencia se reutiliza. */}
                    {!descriptionEvidence && !hasUniversityEvidenceRecord(uni, "description") && uni.wiki_link && (
                      <p className="mt-5 max-w-3xl border-t border-border-light pt-3 text-xs text-text-muted">
                        Texto adaptado de{" "}
                        <a
                          href={uni.wiki_link}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="underline underline-offset-2 hover:text-violet"
                        >
                          Wikipedia
                        </a>
                        , bajo licencia{" "}
                        <a
                          href="https://creativecommons.org/licenses/by-sa/4.0/deed.es"
                          target="_blank"
                          rel="noopener noreferrer nofollow license"
                          className="underline underline-offset-2 hover:text-violet"
                        >
                          CC BY-SA 4.0
                        </a>
                        .
                      </p>
                    )}
                  </Reveal>
                )}

                {curiosities.length > 0 && (
                  <Reveal as="section">
                    <p className="eyebrow">¿Sabías que...?</p>
                    <ol className="mt-4 max-w-3xl divide-y divide-border-light border-y border-border-light">
                      {curiosities.map((c, i) => (
                        <li key={i} className="flex gap-5 py-4 text-[15px] leading-relaxed text-text-secondary">
                          <span className="mt-0.5 shrink-0 font-heading text-sm font-bold text-violet tabular">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ol>
                  </Reveal>
                )}

                {!hasSummary && (
                  <p className="text-sm text-text-muted">
                    Todavía no tenemos una descripción de esta universidad. Consulta sus carreras en la pestaña de al lado.
                  </p>
                )}
              </TabsContent>

              {/* ---- Carreras ---- */}
              <TabsContent value="carreras" forceMount className={TAB_PANEL}>
                <Reveal as="section">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="eyebrow">Oferta académica</p>
                      <h2 className="mt-2 font-heading text-2xl font-bold text-text-primary">
                        Carreras ({careers?.length || 0})
                      </h2>
                    </div>
                    {careers && careers.length > 0 && (
                      <Link
                        href={`/notas-corte?universidad=${uni.id}`}
                        className="group inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary"
                      >
                        <span className="link-underline">Ver todas</span>
                        <ArrowRight className="h-4 w-4 arrow-nudge" />
                      </Link>
                    )}
                  </div>
                  <div className="mt-6">
                    <UniversityCareerList careers={careers} />
                  </div>
                </Reveal>
              </TabsContent>

              {/* ---- Campus (galería) ---- */}
              {gallery.length > 0 && (
                <TabsContent value="campus" forceMount className={TAB_PANEL}>
                  <Reveal as="section" id="galeria" aria-label="Galería del campus" className="scroll-mt-36">
                    <p className="eyebrow">Galería</p>
                    <h2 className="mt-2 font-heading text-2xl font-bold text-text-primary">Un vistazo al campus</h2>
                    <p className="mt-2 text-sm text-text-muted">Abre cada imagen para verla completa.{generated ? ' Son recreaciones con IA basadas en una referencia real.' : ''}</p>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                      {gallery.map((src: string, index: number) => (
                        <a
                          key={src}
                          href={src}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir ${generated ? 'recreación con IA' : 'imagen'} ${index + 1} de ${uni.name}`}
                          className="img-zoom group relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet"
                        >
                          <Image src={src} alt={`${uni.name}, ${generated ? "recreación con IA" : "vista"} ${index + 1}`} fill sizes="(min-width: 1600px) 736px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                          <span className="absolute bottom-3 right-3 rounded-full bg-bg-dark/70 px-2.5 py-1 text-[11px] font-medium text-white">Ver imagen {index + 1}</span>
                        </a>
                      ))}
                    </div>
                    {generated && <p className="mt-5 text-xs leading-relaxed text-text-muted">Galería recreada con IA a partir de una referencia real. Los detalles pueden variar respecto al campus actual. <a href={generated.reference} target="_blank" rel="noopener noreferrer" className="font-semibold text-text-primary underline underline-offset-2 hover:text-violet">Referencia de {generated.author}</a> · <a href={generated.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline underline-offset-2 hover:text-violet">{generated.license}</a>.</p>}
                  </Reveal>
                </TabsContent>
              )}
            </Tabs>
          </div>

          {/* ---- Barra lateral pegajosa ---- */}
          <aside className="min-w-0 lg:col-span-4">
            <div className="space-y-6 lg:sticky lg:top-24">
              <Reveal variant="fade" delay={150} as="section" className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
                    <Flame className="h-5 w-5 text-violet" />
                    FOMO
                  </h3>
                  <span className="text-xs text-text-muted">La conversación de tu uni</span>
                </div>

                {threads.length > 0 ? (
                  <div className="mt-3 divide-y divide-border-light">
                    {threads.map((thread, index) => (
                      <Link key={index} href={fomoHref} className="group block py-3">
                        <p className="line-clamp-3 text-sm leading-snug text-text-primary transition-colors group-hover:text-violet">
                          {thread.body}{thread.is_truncated ? "…" : ""}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-[11px] text-text-muted tabular">
                          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{thread.reaction_count}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{thread.reply_count}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-bg-secondary p-4 text-center text-sm text-text-muted">
                    {previewAvailable ? "Aún no hay publicaciones. Cuéntanos qué pasa en tu uni." : "Entra en el tablón para consultar las conversaciones del campus."}
                  </p>
                )}

                <Link href={fomoHref} className={cn(buttonVariants({ variant: "dark" }), "group mt-5 w-full")}>
                  Ir a FOMO
                  <ArrowRight className="h-4 w-4 arrow-nudge" />
                </Link>
              </Reveal>

              {(website || uni.wiki_link) && (
                <Reveal variant="fade" delay={220} as="section" className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
                  <h3 className="font-heading text-lg font-bold text-text-primary">Enlaces</h3>
                  <ul className="mt-2 divide-y divide-border-light">
                    {website && (
                      <li>
                        <a
                          href={website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-3 py-2.5 text-sm text-text-primary transition-colors hover:text-violet"
                        >
                          <Globe className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-violet" />
                          <span className="link-underline truncate">Web oficial</span>
                          <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-text-muted" />
                        </a>
                      </li>
                    )}
                    {uni.wiki_link && (
                      <li>
                        <a
                          href={uni.wiki_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-3 py-2.5 text-sm text-text-primary transition-colors hover:text-violet"
                        >
                          <Link2 className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-violet" />
                          <span className="link-underline truncate">Wikipedia</span>
                          <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-text-muted" />
                        </a>
                      </li>
                    )}
                  </ul>
                </Reveal>
              )}

              {uni.address && (
                <Reveal variant="fade" delay={290} as="section" className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
                  <h3 className="font-heading text-lg font-bold text-text-primary">Dirección</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {uni.address}
                  </p>
                  <UniversityFactSource evidence={universityEvidence(uni, "address")} />
                </Reveal>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
