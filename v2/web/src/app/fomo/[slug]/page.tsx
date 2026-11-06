import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { createServerSupabase, createPublicSupabase } from "@/lib/supabase-server";
import JsonLd from "@/components/JsonLd";
import { fomoIsIndexable, type FomoStats } from "@/lib/fomo-indexing";
import FomoFeedClient from "./client";
import FomoPublicPreview, {
  type PreviewThread,
  type PreviewStats,
} from "./public-preview";

export const dynamic = "force-dynamic";

// Rendimiento (sep-2026): generateMetadata y la página llamaban a esta función
// cada una por su lado, dos consultas por visita para cuatro columnas que
// cambian casi nunca (nombre, slug y ciudad de la universidad). Se cachean una
// hora en la caché de datos: la ruta sigue siendo dinámica (el feed depende de
// la sesión), pero se ahorra dos viajes a la BD en cada apertura del FOMO.
const fetchUniversity = unstable_cache(
  async (slug: string) => {
    // Cliente anon sin cookies: la ficha de universidad es publica, asi que la
    // consulta funciona igual con sesion que sin ella.
    const supabase = createPublicSupabase();
    const { data, error } = await supabase
      .from("universities")
      .select("id, name, slug, city")
      .eq("slug", slug)
      .maybeSingle();
    // Un fallo de BD se relanza a propósito: devolver null lo cachearía como
    // "no existe" (404) durante una hora.
    if (error) throw new Error(`No se pudo cargar la universidad: ${error.message}`);
    return data;
  },
  ["fomo-universidad-v1"],
  { revalidate: 3600 }
);

// Actividad de los últimos 30 días, para decidir si la landing se indexa.
// Cacheada una hora como la universidad: solo alimenta la etiqueta robots.
const fetchFomoStats = unstable_cache(
  async (slug: string): Promise<FomoStats> => {
    const { data, error } = await createPublicSupabase().rpc("get_fomo_public_stats", {
      p_university_slug: slug,
    });
    return error ? null : (data as FomoStats);
  },
  ["fomo-stats-v1"],
  { revalidate: 3600 }
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const uni = await fetchUniversity(slug);
  if (!uni) return { title: "FOMO", robots: { index: false, follow: false } };
  // Muro sin hilos recientes: accesible, pero sin indexar (contenido fino).
  const indexable = fomoIsIndexable(await fetchFomoStats(slug));

  const title = `FOMO ${uni.name}: lo que se cuece hoy en el campus`;
  const description = `El muro de ${uni.name}${
    uni.city ? ` (${uni.city})` : ""
  }: fiestas, exámenes, avisos y cotilleos publicados por estudiantes de la propia universidad. Lee los últimos hilos.`;

  return {
    // `absolute` para no arrastrar el sufijo del template del layout raiz.
    title: { absolute: `${title} | Franky` },
    description,
    // La landing publica SI se indexa: es la pieza de captacion organica. El
    // feed completo sigue siendo privado (lo sirve FomoFeedClient tras login).
    alternates: { canonical: `/fomo/${slug}` },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title,
      description,
      type: "website",
      url: `/fomo/${slug}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function FomoFeedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const uni = await fetchUniversity(slug);
  if (!uni) notFound();

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin sesion: landing publica con una muestra recortada y anonimizada.
  // Antes esta ruta rebotaba a /login, asi que ni Google ni el visitante que
  // llegaba de un cartel veian nunca el producto.
  if (!user) {
    const anon = createPublicSupabase();
    const [previewRes, statsRes] = await Promise.all([
      anon.rpc("get_fomo_public_preview", {
        p_university_slug: slug,
        p_limit: 6,
      }),
      anon.rpc("get_fomo_public_stats", { p_university_slug: slug }),
    ]);

    // Si la migracion 144 aun no esta aplicada en este entorno, la RPC no
    // existe: la landing se sirve igual, solo que sin hilos de muestra.
    const threads = (previewRes.error ? [] : (previewRes.data ?? [])) as PreviewThread[];
    const stats = (statsRes.error ? null : (statsRes.data ?? null)) as PreviewStats | null;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: "https://franky.es/" },
        {
          "@type": "ListItem",
          position: 2,
          name: uni.name,
          item: `https://franky.es/universidades/${uni.slug}`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: `FOMO ${uni.name}`,
          item: `https://franky.es/fomo/${uni.slug}`,
        },
      ],
    };

    return (
      <>
        <JsonLd data={jsonLd} />
        <FomoPublicPreview
          universityId={uni.id}
          universityName={uni.name}
          universityCity={uni.city}
          universitySlug={uni.slug}
          threads={threads}
          stats={stats}
        />
      </>
    );
  }

  return (
    <FomoFeedClient
      universityId={uni.id}
      universityName={uni.name}
      universitySlug={uni.slug}
    />
  );
}
