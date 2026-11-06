import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { createPublicSupabase } from "@/lib/supabase-server";
import { fomoIsIndexable, type FomoStats } from "@/lib/fomo-indexing";
import {
  isSectorSubdomainEnabled,
  sectorCanonicalUrl,
  sectorMetadataHost,
  SECTOR_SITE_SLUGS,
} from "@/lib/sector-sites/routing";

// Sitemap dinámico: además de las rutas estáticas públicas, incluye todas las
// fichas de catálogo (universidades, carreras, noticias, ocio). Usa el cliente
// anon sin cookies para que la generación no dependa de la sesión y pueda
// cachearse. Solo se cachean los datos del catálogo, nunca la respuesta por host.
export const dynamic = "force-dynamic";

type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

const baseUrl = "https://franky.es";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // .xml queda fuera del middleware. No usar sus cabeceras internas como prueba
  // de dominio ni una caché de ruta que pueda mezclar dos subdominios.
  const site = sectorMetadataHost((await headers()).get("host"));
  if (!site.indexable) return [];
  if (site.slug) {
    return [{ url: site.origin, changeFrequency: "monthly", priority: 1 }];
  }
  const entries = await studentSitemap();
  return [
    ...entries,
    { url: `${baseUrl}/sectores`, changeFrequency: "monthly", priority: 0.8 },
    ...SECTOR_SITE_SLUGS.filter((slug) => !isSectorSubdomainEnabled(slug)).map((slug) => ({
      url: sectorCanonicalUrl(slug),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}

const studentSitemap = unstable_cache(async (): Promise<MetadataRoute.Sitemap> => {
  const now = new Date();

  // Listados y páginas públicas estáticas. Los listados de catálogo llevan
  // priority alta (0.8) por ser puntos de entrada de tráfico orgánico.
  const staticPages: { path: string; priority: number; changeFreq: ChangeFreq }[] = [
    { path: "", priority: 1.0, changeFreq: "daily" },
    { path: "/universidades", priority: 0.8, changeFreq: "weekly" },
    // /carreras (listado) ya no existe: se fusionó en /notas-corte y redirige
    // ahí. Las fichas /carreras/[slug] sí siguen en el sitemap, más abajo.
    { path: "/becas", priority: 0.8, changeFreq: "weekly" },
    { path: "/notas-corte", priority: 0.8, changeFreq: "weekly" },
    { path: "/ocio", priority: 0.8, changeFreq: "weekly" },
    { path: "/noticias", priority: 0.8, changeFreq: "daily" },
    { path: "/alojamiento", priority: 0.8, changeFreq: "weekly" },
    { path: "/eventos", priority: 0.8, changeFreq: "daily" },
    // Landing pública de FOMO: entrada de tráfico orgánico y el mejor anzuelo
    // de registro que tenemos (ver migración 144).
    { path: "/fomo", priority: 0.8, changeFreq: "daily" },
    { path: "/test-vocacional", priority: 0.7, changeFreq: "monthly" },
    { path: "/nota-media", priority: 0.7, changeFreq: "monthly" },
    { path: "/universidades/comparar", priority: 0.7, changeFreq: "monthly" },
    { path: "/colaboradores", priority: 0.7, changeFreq: "monthly" },
    // /pricing NO entra en el sitemap (agosto 2026). Está tras el muro de
    // auth, así que Googlebot solo recibía la redirección a /login: un
    // soft-404 anunciado por nosotros mismos. Además vende planes Pro y
    // Premium que hoy no desbloquean ninguna función y cuyo checkout falla
    // porque los price IDs de Stripe no están configurados. Mientras siga así,
    // ni se indexa ni se enlaza. Ver también robots.ts.
    { path: "/registro", priority: 0.6, changeFreq: "monthly" },
    { path: "/ayuda", priority: 0.6, changeFreq: "monthly" },
    { path: "/en", priority: 0.7, changeFreq: "monthly" },
    { path: "/simulador", priority: 0.8, changeFreq: "weekly" },
    // Embudo B2B: la landing de inmobiliarias también capta por búsqueda.
    { path: "/negocio", priority: 0.6, changeFreq: "monthly" },
    { path: "/negocio/propietario", priority: 0.6, changeFreq: "monthly" },
    { path: "/contacto", priority: 0.4, changeFreq: "monthly" },
    { path: "/privacidad", priority: 0.3, changeFreq: "monthly" },
    { path: "/terminos", priority: 0.3, changeFreq: "monthly" },
    { path: "/cookies", priority: 0.3, changeFreq: "monthly" },
  ];

  const entries: MetadataRoute.Sitemap = staticPages.map(({ path, priority, changeFreq }) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency: changeFreq,
    priority,
  }));

  // Fichas de catálogo: una entrada por registro. Si alguna consulta falla
  // (BD caída en el momento de regenerar), devolvemos al menos las estáticas.
  try {
    const supabase = createPublicSupabase();

    // PostgREST corta cada respuesta en 1000 filas (max-rows) aunque se pida
    // .limit(20000): el sitemap anunciaba solo 1000 de ~4400 carreras y de
    // ~4500 fichas de ocio. Se pagina con .range() hasta agotar.
    type Rows<T> = { data: T[] | null; error: unknown };
    async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Rows<T>>): Promise<{ data: T[] }> {
      const PAGE = 1000;
      const out: T[] = [];
      for (let from = 0; from < 50000; from += PAGE) {
        const { data, error } = await page(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      return { data: out };
    }

    const [universities, careers, news, leisure, scholarships, listings, events] = await Promise.all([
      fetchAll<{ id: string; slug: string | null }>((a, b) =>
        supabase.from("universities").select("id, slug").order("name").range(a, b)),
      fetchAll<{ id: string; slug: string | null }>((a, b) =>
        supabase.from("careers").select("id, slug").order("id").range(a, b)),
      fetchAll<{ slug: string | null; updated_at?: string | null; created_at?: string | null }>((a, b) =>
        supabase
          .from("news")
          .select("slug, updated_at, created_at")
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .range(a, b)),
      fetchAll<{ id: string }>((a, b) =>
        supabase
          .from("leisure_spots")
          .select("id")
          .eq("is_verified", true)
          .eq("is_paid", true)
          .order("id")
          .range(a, b)),
      // Fichas de beca: faltaban en el sitemap pese a existir /becas/[id] con
      // su propio generateMetadata. Es la keyword más valiosa del catálogo.
      fetchAll<{ id: string }>((a, b) =>
        supabase.from("scholarships").select("id").eq("is_active", true).order("id").range(a, b)),
      // Fichas de alojamiento publicadas (mismos filtros que /alojamiento).
      fetchAll<{ id: string }>((a, b) =>
        supabase
          .from("accommodations")
          .select("id")
          .eq("status", "active")
          .eq("is_paid", true)
          .order("id")
          .range(a, b)),
      // Fichas de evento que aún no han pasado. Un evento caducado no aporta
      // nada en búsqueda y solo ensucia el sitemap, así que se corta por fecha.
      fetchAll<{ id: string; updated_at?: string | null }>((a, b) =>
        supabase
          .from("events")
          .select("id, updated_at")
          .gte("start_date", new Date().toISOString())
          .order("start_date")
          .range(a, b)),
    ]);

    // Landings FOMO: solo las universidades con actividad reciente (ver
    // lib/fomo-indexing.ts). Las demás llevan noindex y no se anuncian.
    const activeFomo = new Set<string>();
    const unis = (universities.data ?? []).filter((u) => !!u.slug) as { id: string; slug: string }[];
    for (let i = 0; i < unis.length; i += 16) {
      const chunk = unis.slice(i, i + 16);
      const stats = await Promise.all(
        chunk.map((u) => supabase.rpc("get_fomo_public_stats", { p_university_slug: u.slug })),
      );
      stats.forEach((res, j) => {
        if (!res.error && fomoIsIndexable(res.data as FomoStats)) activeFomo.add(chunk[j].slug);
      });
    }

    for (const u of universities.data ?? []) {
      if (!u.slug) continue;
      entries.push({
        url: `${baseUrl}/universidades/${u.slug}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.6,
      });
      // Landing pública del muro FOMO de esa universidad (solo si tiene vida).
      if (activeFomo.has(u.slug)) entries.push({
        url: `${baseUrl}/fomo/${u.slug}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }

    for (const s of (scholarships.data ?? []) as { id: string }[]) {
      if (!s.id) continue;
      entries.push({
        url: `${baseUrl}/becas/${s.id}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    for (const l of (listings.data ?? []) as { id: string }[]) {
      if (!l.id) continue;
      entries.push({
        url: `${baseUrl}/alojamiento/${l.id}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }

    for (const e of (events.data ?? []) as { id: string; updated_at?: string | null }[]) {
      if (!e.id) continue;
      entries.push({
        url: `${baseUrl}/eventos/${e.id}`,
        lastModified: e.updated_at ? new Date(e.updated_at) : now,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }

    for (const c of (careers.data ?? []) as { id: string; slug: string | null }[]) {
      if (!c.id) continue;
      entries.push({
        url: `${baseUrl}/carreras/${c.slug || c.id}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }

    for (const n of (news.data ?? []) as { slug: string | null; updated_at?: string | null; created_at?: string | null }[]) {
      if (!n.slug) continue;
      const last = n.updated_at || n.created_at;
      entries.push({
        url: `${baseUrl}/noticias/${n.slug}`,
        lastModified: last ? new Date(last) : now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }

    for (const s of leisure.data) {
      if (!s.id) continue;
      entries.push({
        url: `${baseUrl}/ocio/${s.id}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  } catch {
    // Mantén las rutas estáticas si la BD no responde al regenerar el sitemap.
  }

  return entries;
}, ["franky-student-sitemap-v2"], { revalidate: 3600 });
