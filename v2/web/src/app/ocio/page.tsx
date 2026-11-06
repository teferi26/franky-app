import { createPublicSupabase } from "@/lib/supabase-server";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import LeisureExplorer from "@/components/LeisureExplorer";
import CityContentLink from '@/components/CityContentLink';
import { NowNearby } from "@/components/pro-public/now-nearby";
import { listingMetadata } from "@/lib/listing-seo";
import { FEATURE_COLUMNS, UNRELIABLE_WITHOUT_OWNER } from "./leisure-features";

export const revalidate = 900

// Each cache entry stays below Next's 2 MB limit. UUID cursors avoid offset
// shifts between independently revalidated pages. Failed reads never cache an
// empty or partial page; all filters still operate on the complete catalogue.
const PAGE = 500;
const getOcioChunk = unstable_cache(async (cursor: string | null) => {
  let query = createPublicSupabase().from("leisure_spots").select(
    "id, name, city, category, tagline, description, address, latitude, longitude, price_range, rating, image_url, tags, university_ids, owner_id, has_wifi, has_terrace, has_outdoor_seating, has_food, has_live_music, has_billiards, has_air_conditioning, has_parking, accepts_groups, accepts_pets, student_discount, reservations, card_payment"
  ).eq("is_verified", true).eq("is_paid", true).order("id").limit(PAGE);
  if (cursor) query = query.gt("id", cursor);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron cargar las zonas de ocio: ${error.message}`);
  const rows = data ?? [];
  return {
    complete: rows.length < PAGE,
    spots: rows.map(s => {
      const row = s as unknown as Record<string, unknown>;
      return {
        id: s.id, name: s.name, city: s.city, category: s.category,
        tagline: s.tagline,
        description: typeof s.description === "string" ? s.description.slice(0, 240) : null,
        address: s.address, latitude: s.latitude, longitude: s.longitude,
        price_range: s.price_range, rating: s.rating, image_url: s.image_url,
        tags: s.tags, university_ids: s.university_ids, sponsored: !!s.owner_id,
        features: FEATURE_COLUMNS.filter(c => row[c] === true && (s.owner_id || !UNRELIABLE_WITHOUT_OWNER.has(c))),
      };
    }),
  };
}, ["ocio-spots-chunk-v2"], { revalidate: 900, tags: ["ocio-catalogue"] });

const getOcioUniversities = unstable_cache(async () => {
  const { data, error } = await createPublicSupabase().from("universities").select("id, name, short_name, city").order("name");
  if (error) throw new Error(`No se pudieron cargar las universidades: ${error.message}`);
  return data ?? [];
}, ["ocio-universities-v2"], { revalidate: 900, tags: ["ocio-catalogue"] });

async function getOcioCatalog() {
  const allSpots = async () => {
    const spots: Awaited<ReturnType<typeof getOcioChunk>>["spots"] = [];
    let cursor: string | null = null;
    while (true) {
      const page = await getOcioChunk(cursor);
      spots.push(...page.spots);
      if (page.complete || !page.spots.length) return spots;
      cursor = page.spots[page.spots.length - 1].id;
    }
  };
  const [lightSpots, universities] = await Promise.all([allSpots(), getOcioUniversities()]);
  const uniqueCities = [...new Set(lightSpots.map(s => s.city))].sort() as string[];
  const uniIdsWithSpots = new Set<string>();
  for (const s of lightSpots) for (const uid of s.university_ids ?? []) uniIdsWithSpots.add(uid);
  const uniOptions = universities.filter(u => uniIdsWithSpots.has(u.id)).map(u => ({ id: u.id, name: u.short_name || u.name, city: u.city }));
  return { lightSpots, uniqueCities, uniOptions };
}

// Metadatos por variante: las combinaciones de filtros van a noindex y la
// paginación lleva su propia canonical, para no generar casi-duplicados de la
// misma página. Ver lib/listing-seo.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  return listingMetadata({
    path: "/ocio",
    title: "Zonas de Ocio Universitario",
    description: "Los mejores bares, restaurantes, parques, discotecas, pubs y espacios culturales de cada ciudad universitaria de España. Filtros, mapa interactivo y más de 1000 sitios.",
    params: await searchParams,
  });
}

export default async function OcioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { lightSpots, uniqueCities, uniOptions } = await getOcioCatalog();

  const initialQuery = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <Reveal>
            <p className="eyebrow text-violet">Ciudades universitarias</p>
            <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary">
              Zonas de ocio
            </h1>
            <p className="mt-3 max-w-xl text-text-muted">
              Bares, parques, museos, discotecas, pubs, coworkings y más. Filtra por categoría, busca o explora en el mapa.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-20">
        <NowNearby />
        <LeisureExplorer spots={lightSpots} cities={uniqueCities} universities={uniOptions} initialQuery={initialQuery} />
        <CityContentLink/>

        {/* Para negocios: la única sección oscura de la página */}
        <Reveal className="mt-16 rounded-[2rem] bg-bg-dark px-6 py-10 text-white sm:px-10 lg:px-14 lg:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow text-white/60">Locales</p>
              <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
                ¿Tienes un local?
              </h2>
              <p className="mt-3 text-white/70">
                Franky Pro es la app de tu negocio: agenda, reservas y clientes, y los estudiantes de tu zona llegando sin que pagues comisión por cada uno.
              </p>
            </div>
            <Link href="/pro" className={buttonVariants({ variant: "onBrand", size: "lg", className: "group shrink-0" })}>
              Ver Franky Pro <ArrowUpRight className="arrow-nudge h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
