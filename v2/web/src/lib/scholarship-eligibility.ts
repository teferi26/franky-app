import { nivelMatchInfo, tipoAyudaMatches, condicionExcluye, COND_DISCAPACIDAD, COND_FAMILIA_NUMEROSA, type AyudaFiltro } from "./becas";
import type { MecDraft } from "./mec-requirements";
export interface ScholarshipProfile {
  nivel: string; comunidad: string; renta: string; nota_media: string;
  ayuda: AyudaFiltro; discapacidad: boolean; familia_numerosa: boolean;
  mec?: MecDraft;
}
export interface ScholarshipRecord {
  id: string; name: string; provider: string | null; type: string;
  description: string | null; amount_min: number | null; amount_max: number | null;
  opens_at?: string | null; closes_at?: string | null;
  deadline: string | null; deadline_note: string | null; url: string | null;
  target_audience: string[] | null; coverage: string[] | null;
  income_threshold: number | null; gpa_requirement: number | null;
  comunidad_autonoma: string | null; convocatoria: string | null;
  requirements: Record<string, unknown> | null; url_verified_at: string | null;
}
/** Requirements are read in full on the detail page; the shortlist uses only these fields. */
export type ScholarshipPreview = Omit<ScholarshipRecord, 'requirements'>;
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const aliases: Record<string, string> = { "comunidad de madrid": "madrid", "region de murcia": "murcia", "principado de asturias": "asturias", "illes balears": "baleares", "islas baleares": "baleares", "comunitat valenciana": "comunidad valenciana", "catalunya": "cataluna", "euskadi": "pais vasco", "comunidad foral de navarra": "navarra" };
const region = (value: string) => aliases[normalize(value)] ?? normalize(value);

/** Shortlist only. Unstructured requirements are never assumed satisfied. */
export function assessScholarship(s: Pick<ScholarshipRecord, 'target_audience' | 'coverage' | 'income_threshold' | 'gpa_requirement' | 'comunidad_autonoma'>, p: ScholarshipProfile) {
  const mismatches: string[] = [];
  const pending: string[] = [];
  const level = nivelMatchInfo(s.target_audience, p.nivel);
  if (level === "no_match") mismatches.push("El nivel de estudios no coincide");
  if (level === "sin_datos") pending.push("La ficha no precisa el nivel de estudios");
  if (s.comunidad_autonoma && p.comunidad && region(s.comunidad_autonoma) !== region(p.comunidad)) pending.push(`La ayuda está vinculada a ${s.comunidad_autonoma}; comprueba si exige residencia o estudiar allí`);
  if (!tipoAyudaMatches(s.coverage, s.target_audience, p.ayuda)) mismatches.push("El tipo de ayuda no coincide con tu búsqueda");
  if (condicionExcluye(s.target_audience, COND_DISCAPACIDAD, p.discapacidad)) pending.push("Exige una discapacidad reconocida; revisa el grado y la acreditación");
  if (condicionExcluye(s.target_audience, COND_FAMILIA_NUMEROSA, p.familia_numerosa)) pending.push("Exige acreditar familia numerosa");
  if (s.income_threshold != null) pending.push("Revisar renta, miembros computables, deducciones y patrimonio. Un tramo de ingresos no determina la elegibilidad");
  if (s.gpa_requirement != null) {
    const grade = p.nota_media.trim() === "" ? null : Number(p.nota_media.replace(",", "."));
    const required = Number(s.gpa_requirement);
    // The legacy field has no scale or academic-stage metadata. In particular,
    // an admission threshold over 10 cannot be compared with the form's GPA.
    if (!Number.isFinite(required) || required <= 0 || required > 10) {
      pending.push(`Comprobar el requisito académico (${s.gpa_requirement}) y su escala en las bases; no es comparable con la nota sobre 10 del formulario`);
    } else if (grade == null || !Number.isFinite(grade) || grade < 0 || grade > 10) {
      pending.push(`Comprobar el requisito académico indicado (${required}) y la modalidad a la que se aplica`);
    } else {
      pending.push(grade < required
        ? `Tu nota declarada es inferior al valor indicado (${required}); comprueba que corresponde a la misma escala, curso y modalidad`
        : "Tu nota alcanza el valor indicado si corresponde a la misma escala y modalidad; faltan matrícula, créditos y excepciones de la convocatoria");
    }
  }
  pending.push("Revisar todos los requisitos y posibles incompatibilidades en las bases oficiales");
  return { matches: mismatches.length === 0, mismatches, pending, levelKnown: level !== "sin_datos" };
}
