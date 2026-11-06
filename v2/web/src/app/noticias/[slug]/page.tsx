import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Calendar, Tag } from "lucide-react";
import { createPublicSupabase } from "@/lib/supabase-server";
import { renderSafeMarkdown } from "@/lib/sanitize";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { Reveal, RevealItem, ScrollProgress } from "@/components/motion";

// Ficha pública cacheable con ISR: la noticia no depende del visitante.
// Revalidación corta porque las noticias se publican/editan a menudo.
export const revalidate = 900;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createPublicSupabase();
  const { data } = await supabase
    .from("news")
    .select("title, excerpt, image_url, created_at, updated_at")
    .eq("slug", slug)
    .single();
  if (!data) return { title: "Noticia no encontrada" };

  const title = `${data.title} | Franky`;
  const description = data.excerpt || `${data.title}. Noticia universitaria en Franky.`;

  return {
    // `absolute`: el titulo ya incluye "| Franky", el template del layout lo
    // duplicaba ("… | Franky | Franky").
    title: { absolute: title },
    description,
    alternates: { canonical: `/noticias/${slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      url: `/noticias/${slug}`,
      ...(data.created_at ? { publishedTime: data.created_at } : {}),
      ...(data.updated_at ? { modifiedTime: data.updated_at } : {}),
      images: data.image_url ? [data.image_url] : undefined,
    },
  };
}

export default async function NoticiaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createPublicSupabase();
  const { data: article } = await supabase.from("news").select("*, profiles(full_name)").eq("slug", slug).single();

  if (!article) notFound();

  // Datos estructurados NewsArticle para rich results de Google News.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    url: `https://franky.es/noticias/${article.slug}`,
    ...(article.excerpt ? { description: article.excerpt as string } : {}),
    ...(article.image_url ? { image: [article.image_url as string] } : {}),
    ...(article.created_at ? { datePublished: article.created_at as string } : {}),
    ...(article.updated_at ? { dateModified: article.updated_at as string } : {}),
    ...(article.profiles?.full_name
      ? { author: { "@type": "Person", name: article.profiles.full_name as string } }
      : {}),
    publisher: {
      "@type": "Organization",
      name: "Franky",
      url: "https://franky.es",
    },
  };

  // Related articles
  const { data: related } = await supabase
    .from("news")
    .select("id, title, slug, image_url, created_at, category")
    .eq("is_published", true)
    .neq("id", article.id)
    .order("created_at", { ascending: false })
    .limit(3);

  return (
    <div className="min-h-screen bg-bg-primary">
      <JsonLd data={jsonLd} />
      {/* Artículo (v3): barra de progreso de lectura, cabecera tipográfica
          con la foto en marco redondeado y cuerpo a ancho de lectura. */}
      <ScrollProgress />
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <Reveal>
          <Link
            href="/noticias"
            className="group mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
            Noticias
          </Link>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
            {article.category && (
              <span className="eyebrow text-violet">{article.category}</span>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              {new Date(article.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>

          <h1 className="mt-4 text-fluid-h1 font-extrabold text-text-primary">
            {article.title}
          </h1>
        </Reveal>

        {article.image_url && (
          <Reveal variant="scale" delay={120} className="img-zoom relative mt-8 aspect-[16/9] overflow-hidden rounded-3xl border border-border bg-bg-secondary">
            <Image
              src={article.image_url}
              alt={article.title}
              fill
              className="object-cover"
              priority
              // Es la LCP del articulo y el contenedor mide 768 px como mucho:
              // sin `sizes` se descargaba la variante mas grande del srcset.
              sizes="(max-width: 768px) 100vw, 768px"
            />
          </Reveal>
        )}

        {/* News articles come from an admin-managed table but we still run
            them through the sanitiser: defense in depth, and it handles
            the markdown rendering uniformly. */}
        <div
          className="prose prose-lg prose-comfy mt-10 text-text-secondary"
          dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(article.content ?? "") }}
        />

        {article.tags && article.tags.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2 border-t border-border-light pt-6">
            {article.tags.map((tag: string) => (
              <span key={tag} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary">
                <Tag className="h-3 w-3" aria-hidden="true" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {article.profiles?.full_name && (
          <p className="mt-4 text-sm text-text-muted">
            Por <span className="font-semibold text-text-primary">{article.profiles.full_name}</span>
          </p>
        )}

        {/* Related articles */}
        {related && related.length > 0 && (
          <div className="mt-14 border-t border-border-light pt-8">
            <Reveal>
              <p className="eyebrow">Seguir leyendo</p>
              <h2 className="mt-2 text-fluid-h2 font-extrabold text-text-primary">Más noticias</h2>
            </Reveal>
            <Reveal stagger className="mt-6 grid gap-4 sm:grid-cols-3">
              {related.map((r, i) => (
                <RevealItem key={r.id} index={i} asChild>
                  <Link
                    href={`/noticias/${r.slug}`}
                    className="group hover-lift overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15"
                  >
                    {r.image_url && (
                      <div className="img-zoom relative aspect-[16/10] bg-bg-secondary">
                        <Image src={r.image_url} alt={r.title} fill className="object-cover" sizes="33vw" />
                      </div>
                    )}
                    <div className="p-4">
                      <p className="mb-1 text-xs text-text-muted">
                        {new Date(r.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                      </p>
                      <h3 className="line-clamp-2 font-heading text-sm font-bold text-text-primary">{r.title}</h3>
                    </div>
                  </Link>
                </RevealItem>
              ))}
            </Reveal>
          </div>
        )}
      </article>
    </div>
  );
}
