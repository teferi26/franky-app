import type { ProData } from "./types";
import type { ProVertical } from "./verticals";

/**
 * Cuándo se da por hecho cada paso de la lista de arranque. Se calcula con los
 * datos reales del espacio: no hay casillas que marcar a mano.
 */
const DONE: Record<string, (d: ProData) => boolean> = {
  hours: (d) => d.space.hours.some(Boolean),
  services: (d) => d.services.length >= 3,
  team: (d) => d.staff.length >= 2,
  profile: (d) => d.space.publicProfile.photos >= 5 && d.space.publicProfile.description.length > 20,
  offer: (d) => d.offers.length > 0 || d.groupRequests.some((g) => g.status !== "new"),
  menu: (d) => d.menu.length >= 5,
  loyalty: (d) => Boolean(d.loyalty),
  tables: (d) => d.tables.length >= 4 || d.zones.length >= 2,
  zones: (d) => d.zones.length >= 2,
  event: (d) => d.events.length > 0,
  rrpp: (d) => d.promoters.length > 0,
  agenda_rhythm: (d) => d.services.filter((s) => s.agenda?.returnWeeks).length >= 2,
  agenda_cabins: (d) => (d.agendaOps?.cabins.length ?? 0) >= 1,
  stock: (d) => (d.nightOps?.stockCounts.length ?? 0) > 0,
  close: (d) => (d.nightOps?.closes.length ?? 0) > 0,
  classes: (d) => d.classTypes.length >= 2,
  plans: (d) => d.plans.length >= 1,
  courts: (d) => d.resources.length >= 1,
  courts_rules: (d) => Boolean(d.courts?.policy?.punctualityNote?.trim()),
  courts_passes: (d) => (d.courts?.passes.length ?? 0) >= 1,
  seats: (d) => (d.courts?.seats.length ?? 0) >= 1,
  properties: (d) => d.properties.length >= 1,
  visits: (d) => d.visits.length >= 1,
  tenants: (d) => d.tenants.length >= 1,
  roomie: (d) => d.leads.some((l) => l.roomieGroup),
  members: (d) => d.communityMembers.length >= 5,
  activity: (d) => d.activities.some((a) => a.status !== "draft"),
  board: (d) => d.board.length >= 2,
  announcement: (d) => d.announcements.length >= 1,
  sponsor: (d) => d.sponsors.length >= 1,
  community_cash: (d) => (d.communityOps?.movements.length ?? 0) >= 1,
  publication: (d) => d.uniPublications.length >= 1,
  welcome: (d) => d.uniWelcome.length >= 1,
  housing: (d) => d.uniHousing.some((h) => h.status === "verified"),
  associations: (d) => d.uniAssociations.length >= 1,
  calendar: (d) => (d.uniExtras?.deadlines.length ?? 0) >= 3,
  office: (d) => (d.uniExtras?.officeSlots?.length ?? 0) >= 1,
};

export function checklistState(vertical: ProVertical, data: ProData) {
  const steps = vertical.checklist.map((s) => ({ ...s, done: (DONE[s.id] ?? (() => false))(data) }));
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length };
}
