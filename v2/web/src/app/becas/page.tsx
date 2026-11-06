import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { createPublicSupabase } from "@/lib/supabase-server";
import type { ScholarshipPreview } from "@/lib/scholarship-eligibility";
import ScholarshipExplorer from "./explorer";
import { SCHOLARSHIP_ALIASES } from "@/lib/scholarship-aliases";

export const revalidate = 3600;
export const metadata: Metadata = { title: "Becas y ayudas para estudiar", description: "Explora becas y ayudas, compara sus plazos y revisa los requisitos de las convocatorias. Encuentra por dónde empezar con nuestro orientador.", alternates: { canonical: "/becas" } };
const getScholarships = unstable_cache(async () => {
  const supabase = createPublicSupabase();
  const rows: ScholarshipPreview[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("scholarships")
      .select("id,name,provider,type,description,amount_min,amount_max,opens_at,closes_at,deadline,deadline_note,url,target_audience,coverage,income_threshold,gpa_requirement,comunidad_autonoma,convocatoria,url_verified_at")
      .eq("is_active", true).order("id").range(offset, offset + 499);
    if (error) throw new Error("No se pudieron cargar las becas");
    rows.push(...(data as ScholarshipPreview[] ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  return rows.filter(row => !SCHOLARSHIP_ALIASES[row.id]).map(row => ({
    ...row,
    // Only the card excerpt crosses the client boundary. The detail page still
    // fetches the original description and every requirement from the database.
    description: row.description && row.description.length > 240
      ? `${row.description.slice(0, 240).trimEnd()}…` : row.description,
  }));
}, ["becas-catalogo-v5"], { revalidate: 3600 });

export default async function BecasPage() {
  return <ScholarshipExplorer scholarships={await getScholarships()} />;
}
