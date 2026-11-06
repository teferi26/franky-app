import { unstable_cache } from "next/cache";
import { createPublicSupabase } from "@/lib/supabase-server";
import type { Metadata } from "next";
import { Reveal } from "@/components/motion";
import NewsExplorer, { type NewsSummary } from "./news-explorer";

export const revalidate = 300;
const getNoticias = unstable_cache(async () => {
  const db = createPublicSupabase();
  const rows: NewsSummary[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from("news").select("id, slug, title, excerpt, image_url, category, created_at, is_featured")
      .eq("is_published", true).order("created_at", { ascending: false }).order("id").range(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return rows;
}, ["noticias-portada-v2"], { revalidate: 300 });
export const metadata: Metadata = { title: "Novedades", description: "Becas, planes, convocatorias y novedades de Franky: lo que necesitas saber para vivir tu etapa universitaria." };
export default async function NoticiasPage() {
  // Un fallo de lectura no se cachea como catálogo vacío: getNoticias lanza y
  // la página cae en el error boundary en vez de mostrar "sin noticias".
  const items = await getNoticias();
  // Cabecera editorial (v3): rótulo, título grande y una frase; el listado
  // tipo revista va debajo, dentro de NewsExplorer.
  return <div className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Novedades</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Noticias universitarias
            </h1>
            <p className="mt-3 max-w-xl text-lg text-text-muted">
              Lo último sobre becas, convocatorias, carreras y vida universitaria.
            </p>
          </Reveal>
        </div>
      </section>

    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14 pb-20"><NewsExplorer items={items} /></div>
  </div>;
}
