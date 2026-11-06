import { createPublicSupabase } from "@/lib/supabase-server";
import { universityEvidence } from "@/lib/university-evidence";
import { renderOgCard, OG_SIZE } from "@/lib/og-template";

// Imagen Open Graph propia de cada universidad. Antes todas las fichas
// compartian la tarjeta generica del sitio: compartir la UA por WhatsApp se
// veia exactamente igual que compartir la home.
export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "Ficha de universidad en Franky";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: { slug: string } }) {
  const supabase = createPublicSupabase();
  const { data: uni } = await supabase
    .from("universities")
    .select("id, name, city, comunidad_autonoma, type, student_count, institutional_sources")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!uni) {
    return renderOgCard({ eyebrow: "Universidad", title: "Universidades de España" });
  }

  const { count: careers } = await supabase
    .from("careers")
    .select("*", { count: "exact", head: true })
    .eq("university_id", uni.id);

  const stats = [] as { value: string; label: string }[];
  if (careers) stats.push({ value: String(careers), label: "ofertas en Franky" });
  const students = universityEvidence(uni, "student_count");
  if (uni.student_count && students?.period)
    stats.push({
      value: Number(uni.student_count).toLocaleString("es-ES"),
      label: `estudiantes · ${students.period}`,
    });
  stats.push({ value: uni.type === "publica" ? "Pública" : "Privada", label: "titularidad" });

  return renderOgCard({
    eyebrow: "Universidad",
    title: uni.name,
    subtitle: [uni.city, uni.comunidad_autonoma].filter(Boolean).join(", ") || null,
    stats,
  });
}
