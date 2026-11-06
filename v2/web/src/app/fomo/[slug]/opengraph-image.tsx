import { createPublicSupabase } from "@/lib/supabase-server";
import { renderOgCard, OG_SIZE } from "@/lib/og-template";

// La landing publica de FOMO es la pieza de captacion organica: cuando alguien
// la pega en un grupo de WhatsApp de su clase, la tarjeta tiene que decir de
// que universidad es y que hay movimiento.
export const runtime = "nodejs";
export const revalidate = 3600;
export const alt = "El muro de tu universidad en Franky";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: { slug: string } }) {
  const supabase = createPublicSupabase();
  const { data: uni } = await supabase
    .from("universities")
    .select("name, city")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!uni) {
    return renderOgCard({ eyebrow: "FOMO", title: "El muro de tu universidad" });
  }

  const { data: stats } = await supabase.rpc("get_fomo_public_stats", {
    p_university_slug: params.slug,
  });
  const s = stats as { threads_30d?: number; replies_30d?: number } | null;

  const cards = [] as { value: string; label: string }[];
  if (s?.threads_30d) {
    cards.push({ value: s.threads_30d.toLocaleString("es-ES"), label: "hilos este mes" });
  }
  if (s?.replies_30d) {
    cards.push({ value: s.replies_30d.toLocaleString("es-ES"), label: "respuestas" });
  }

  return renderOgCard({
    eyebrow: "FOMO",
    title: `Lo que se cuece en ${uni.name}`,
    subtitle: uni.city ? `${uni.city} · sin filtros, lo escribe la gente de dentro` : null,
    stats: cards,
  });
}
