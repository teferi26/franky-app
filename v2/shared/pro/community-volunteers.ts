import type { CommunityActivity, CommunityMember } from "./community-types";
import { memberHistory } from "./community";
import { proCsvCell } from "./csv";
import { localDate } from "./format";

/**
 * Registro de voluntariado de la asociación.
 *
 * La Ley 45/2015 pide a la entidad un acuerdo de incorporación firmado, un
 * registro de altas y bajas y un certificado cuando la persona lo pida o se
 * vaya. Aquí vive el registro; los documentos están en community-docs.ts.
 */

export type VolunteerState = "none" | "pending_agreement" | "active" | "left";

export function volunteerState(m: CommunityMember): VolunteerState {
  if (!m.volunteer) return "none";
  if (m.volunteer.leftAt) return "left";
  return m.volunteer.agreementAt ? "active" : "pending_agreement";
}

/** Alta en el registro. Si ya estuvo, se reabre con la fecha nueva. */
export function startVolunteer(m: CommunityMember, today: string): CommunityMember {
  return {
    ...m,
    role: m.role === "junta" ? m.role : "voluntario",
    volunteer: { since: today },
  };
}

export function signVolunteerAgreement(m: CommunityMember, today: string): CommunityMember {
  if (!m.volunteer) return m;
  return { ...m, volunteer: { ...m.volunteer, agreementAt: today } };
}

/** Baja del voluntariado: sigue siendo socio y queda en el registro con su fecha. */
export function endVolunteer(m: CommunityMember, today: string): CommunityMember {
  if (!m.volunteer) return m;
  return {
    ...m,
    role: m.role === "voluntario" ? "socio" : m.role,
    volunteer: { ...m.volunteer, leftAt: today },
  };
}

/** Personas en el registro, de la alta más antigua a la más reciente. */
export function volunteerRegistry(members: CommunityMember[]): CommunityMember[] {
  return members
    .filter((m) => m.volunteer)
    .sort((a, b) => (a.volunteer?.since ?? "").localeCompare(b.volunteer?.since ?? ""));
}

/** Horas de turnos de una persona desde su alta como voluntaria. */
export function volunteerHoursSince(
  m: CommunityMember,
  activities: CommunityActivity[],
  members: CommunityMember[],
  now: Date,
): number {
  const history = memberHistory(m.id, activities, members, now, m.volunteer?.since);
  const until = m.volunteer?.leftAt;
  const minutes = history.shifts
    .filter((s) => !until || localDate(s.activity.date) <= until)
    .reduce((acc, s) => acc + Math.max(0, s.shift.to - s.shift.from), 0);
  return Math.round((minutes / 60) * 10) / 10;
}

/** El registro en CSV, separado por punto y coma para Excel. */
export function volunteerRegistryCsv(
  members: CommunityMember[],
  activities: CommunityActivity[],
  now: Date,
): string {
  const header = [
    "Nombre",
    "Estudios",
    "Universidad",
    "Alta como voluntario",
    "Acuerdo de incorporación firmado",
    "Baja",
    "Horas de voluntariado",
    "Teléfono",
  ];
  const rows = volunteerRegistry(members).map((m) => [
    m.name,
    m.studies,
    m.university,
    m.volunteer?.since ?? "",
    m.volunteer?.agreementAt ?? "No",
    m.volunteer?.leftAt ?? "",
    String(volunteerHoursSince(m, activities, members, now)).replace(".", ","),
    m.phone ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(proCsvCell).join(";")).join("\n");
}
