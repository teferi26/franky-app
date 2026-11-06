import { checkBirthDate, birthDateMessage } from "@/lib/legal-age";

/** Campos del onboarding que deciden si ya se puede entrar. */
export type EssentialsInput = {
  full_name: string;
  birth_date: string;
  gender: string;
  is_student: boolean;
  student_type: string;
  university_id: string;
  university_course: number | null;
  bachillerato_course: number | null;
  bachillerato_modality: string;
  fp_study: string;
  master_study: string;
};

/**
 * Lo imprescindible para entrar: nombre, edad válida (14 años o más) y la
 * etapa de estudios. Para universitarios, universidad y curso. Con esto ya se
 * les lleva al FOMO de su universidad; el resto (dónde vives, planes, roomie)
 * se puede dejar con "Completar después".
 */
export function onboardingEssentialsDone(d: EssentialsInput, answered: ReadonlySet<string>): boolean {
  if (d.full_name.trim().length < 2) return false;
  if (!checkBirthDate(d.birth_date).ok || !d.gender) return false;
  if (!answered.has("is_student")) return false;
  if (!d.is_student) return true;
  switch (d.student_type) {
    case "universidad":
      return !!d.university_id && d.university_course != null;
    case "bachillerato":
      return d.bachillerato_course != null && !!d.bachillerato_modality;
    case "fp":
      return !!d.fp_study.trim();
    case "master":
      return !!d.master_study.trim();
    case "otro":
      return true;
    default:
      return false;
  }
}

/**
 * Destino al terminar (o al dejarlo para después). Un `next` explícito manda;
 * si no lo hay y el perfil tiene universidad con FOMO, se entra al FOMO de
 * esa universidad (/fomo/[slug]); si no, a la home.
 */
export function onboardingDestination(opts: {
  editMode: boolean;
  next: string;
  universitySlug?: string | null;
}): string {
  if (opts.editMode) return "/perfil";
  if (opts.next && opts.next !== "/") return opts.next;
  const slug = opts.universitySlug?.trim();
  if (slug && /^[a-z0-9][a-z0-9-]*$/i.test(slug)) return `/fomo/${encodeURIComponent(slug)}`;
  return "/";
}

/**
 * Traduce los errores de guardado del perfil a un mensaje comprensible. El
 * trigger de edad de la base de datos (migración 20260924201000_age_gate)
 * rechaza fechas de menores de 14 con `birth_date_under_min_age`.
 */
export function friendlyProfileError(message: string): string {
  if (/birth_date_under_min_age/.test(message)) {
    return birthDateMessage({ ok: false, reason: "under_min_age" }) ?? message;
  }
  if (/birth_date_invalid/.test(message)) {
    return "Revisa tu fecha de nacimiento: no parece correcta.";
  }
  return message;
}
