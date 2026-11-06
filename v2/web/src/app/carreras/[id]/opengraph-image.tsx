import { formatAcademicDuration } from '@/lib/academic-duration';
import { createPublicSupabase } from "@/lib/supabase-server";
import { renderOgCard, OG_SIZE } from "@/lib/og-template";
import { careerMatch } from "@/lib/career-lookup";
import { CURRENT_CUT_OFF_YEAR, cutOffCourse, cutOffForView } from "@/lib/academic-year";

// La nota de corte es EL dato por el que se comparte una carrera: tiene que
// verse en la tarjeta sin abrir el enlace.
export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "Ficha de carrera en Franky";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  const supabase = createPublicSupabase();
  const { data: career } = await supabase
    .from("careers")
    .select("name, cut_off_score, cut_off_year, cut_off_score_prev, cut_off_year_prev, admission_without_cutoff, duration_years, credits, universities(name, city)")
    .eq(careerMatch(params.id).column, careerMatch(params.id).value)
    .maybeSingle();

  if (!career) {
    return renderOgCard({ eyebrow: "Carrera", title: "Carreras universitarias" });
  }

  const uni = career.universities as unknown as { name?: string; city?: string } | null;

  const stats = [] as { value: string; label: string }[];
  // Solo la nota del curso vigente: una de otro curso no se comparte como actual.
  const current = career.admission_without_cutoff ? null : cutOffForView(career, "current");
  if (current) {
    stats.push({
      value: current.score.toFixed(3),
      label: `nota de corte ${cutOffCourse(CURRENT_CUT_OFF_YEAR)}`,
    });
  }
  if (career.duration_years) {
    stats.push({ value: formatAcademicDuration(career.duration_years), label: "duración" });
  }
  if (career.credits) {
    stats.push({ value: `${career.credits}`, label: "créditos ECTS" });
  }

  return renderOgCard({
    eyebrow: "Nota de corte",
    title: career.name,
    subtitle: uni?.name ? `${uni.name}${uni.city ? ` · ${uni.city}` : ""}` : null,
    stats,
  });
}
