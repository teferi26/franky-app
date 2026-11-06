import type { ProData, ProSectionId } from "./types";
import type { CommunityActivity } from "./community-types";
import {
  ASSEMBLY_KIND_LABEL,
  activityAttendees,
  communityLedger,
  communityOps,
  openShiftSlots,
  openTasks,
  prepAlerts,
} from "./community";
import { registryPack } from "./community-registry";
import { ratingAskAt, ratingLabel, ratingSummary } from "./community-feedback";
import { handoverProgress, handoverStage } from "./community-handover";
import { overdueLoans } from "./community-inventory";
import { lineUnits, merchSummary } from "./community-merch";
import { tripSummary } from "./community-trips";
import type { CommunityMember } from "./community-types";
import { addDays, localDate, money } from "./format";

/**
 * Lo que la junta tiene que resolver pronto, para el Resumen: tareas de las
 * reuniones, dinero que se debe a quien adelantó, papeles del registro,
 * asambleas a la vista, preparación atrasada, turnos sin cubrir, el relevo
 * a medias, actividades que salieron peor valoradas, material sin devolver,
 * plazos de viajes atrasados y pedidos de merchandising por cerrar.
 */

export type CommunityTodayKind =
  | "task"
  | "reimburse"
  | "registry"
  | "assembly"
  | "prep"
  | "volunteers"
  | "handover"
  | "feedback"
  | "loans"
  | "trip"
  | "merch";

export type CommunityTodayItem = {
  id: string;
  kind: CommunityTodayKind;
  title: string;
  detail: string;
  section: ProSectionId;
  /** Parámetros para abrir la pantalla en el sitio justo ("a=a1"). */
  query?: string;
  /** Etiqueta corta a la derecha ("En 3 días", "Tarde"). */
  badge?: string;
  urgent: boolean;
};

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

function inDays(n: number): string {
  if (n < 0) return n === -1 ? "Ayer" : `Hace ${-n} días`;
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  return `En ${n} días`;
}

export function communityTodayItems(data: ProData, now: Date): CommunityTodayItem[] {
  const today = localDate(now);
  const ops = communityOps(data);
  const items: CommunityTodayItem[] = [];

  // Tareas que vencen esta semana o que ya van tarde.
  const tasks = openTasks(ops.tasks).filter((t) => t.due <= addDays(today, 7));
  for (const t of tasks.slice(0, 3)) {
    const d = daysBetween(today, t.due);
    items.push({
      id: `task-${t.id}`,
      kind: "task",
      title: t.title,
      detail: `${t.owner}${t.assemblyId ? ", acordado en reunión" : ""}`,
      section: "asamblea",
      badge: d < 0 ? "Tarde" : inDays(d),
      urgent: d <= 1,
    });
  }

  // Dinero adelantado por socios que aún no se ha devuelto.
  const ledger = communityLedger(data, now);
  if (ledger.pendingReimburse.length) {
    const people = new Set(ledger.pendingReimburse.map((m) => m.paidBy));
    items.push({
      id: "reimburse",
      kind: "reimburse",
      title: `Debes ${money(ledger.pendingReimburseCents)} a ${people.size} ${people.size === 1 ? "persona" : "personas"}`,
      detail: [...people].join(", "),
      section: "caja",
      urgent: false,
    });
  }

  // Papeles del registro en el primer trimestre, si aún no están preparados.
  const pack = registryPack(data, now);
  if (pack.inSeason && !pack.prepared && data.board.length) {
    items.push({
      id: "registry",
      kind: "registry",
      title: "Papeles del registro universitario",
      detail: pack.ready
        ? "Certificado de junta, lista de socios y memoria: listos para preparar."
        : pack.items.filter((i) => !i.ready).map((i) => i.detail).join(" "),
      section: "junta",
      badge: `${pack.daysLeft} días`,
      urgent: pack.daysLeft <= 21,
    });
  }

  // La próxima asamblea o reunión en las tres semanas siguientes.
  const next = ops.assemblies
    .filter((a) => a.status !== "cerrada" && localDate(a.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next && localDate(next.date) <= addDays(today, 21)) {
    const d = daysBetween(today, localDate(next.date));
    items.push({
      id: `assembly-${next.id}`,
      kind: "assembly",
      title: next.kind === "junta" ? next.title : ASSEMBLY_KIND_LABEL[next.kind],
      detail: `${next.agenda.length} puntos en el orden del día, en ${next.place}`,
      section: "asamblea",
      badge: inDays(d),
      urgent: d <= 2,
    });
  }

  // Actividades publicadas con preparación atrasada o turnos sin cubrir.
  const upcoming = (data.activities as CommunityActivity[])
    .filter((a) => a.status === "published" && localDate(a.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const a of upcoming) {
    const late = prepAlerts(a, today);
    if (late.length) {
      items.push({
        id: `prep-${a.id}`,
        kind: "prep",
        title: `${a.title}: ${late.length === 1 ? "1 cosa por preparar" : `${late.length} cosas por preparar`}`,
        detail: late.map((p) => p.label).join(", "),
        section: "actividades",
        query: `a=${a.id}`,
        badge: inDays(daysBetween(today, localDate(a.date))),
        urgent: true,
      });
    }
  }
  for (const a of upcoming.filter((x) => localDate(x.date) <= addDays(today, 7))) {
    const open = openShiftSlots(a);
    if (open) {
      items.push({
        id: `shifts-${a.id}`,
        kind: "volunteers",
        title: `Faltan ${open} ${open === 1 ? "voluntario" : "voluntarios"} para ${a.title}`,
        detail: "Pide ayuda en el grupo con un toque.",
        section: "actividades",
        query: `a=${a.id}`,
        badge: inDays(daysBetween(today, localDate(a.date))),
        urgent: false,
      });
    }
  }

  // El relevo: cuando el mandato acaba pronto o si el último quedó a medias.
  const stage = handoverStage(data, now);
  if (stage === "soon" || stage === "open") {
    const progress = handoverProgress(ops.handover);
    items.push({
      id: "handover",
      kind: "handover",
      title: stage === "soon" ? "Prepara el relevo de junta" : "Relevo a medias",
      detail:
        stage === "soon"
          ? "Banco, registro, redes y llaves: reparte quién hace cada cosa."
          : `Falta: ${progress.pending.map((i) => i.label.toLowerCase()).join(", ")}.`,
      section: "junta",
      badge: progress.total ? `${progress.done} de ${progress.total}` : undefined,
      urgent: false,
    });
  }

  // Actividades recientes que salieron flojas: conviene leer los comentarios.
  const nowIso = now.toISOString();
  const weak = (data.activities as CommunityActivity[])
    .filter((a) => {
      const asked = ratingAskAt(a);
      return asked <= nowIso && localDate(asked) >= addDays(today, -21);
    })
    .map((a) => ({ a, r: ratingSummary(a) }))
    .filter((x) => x.r.count >= 5 && x.r.avg < 4)
    .sort((x, y) => y.a.date.localeCompare(x.a.date));
  for (const { a, r } of weak.slice(0, 1)) {
    items.push({
      id: `feedback-${a.id}`,
      kind: "feedback",
      title: `${a.title} se quedó en ${ratingLabel(r.avg)} de 5`,
      detail: r.comments.length
        ? `${r.comments.length} ${r.comments.length === 1 ? "comentario" : "comentarios"} para mejorar la próxima.`
        : `${r.count} notas. Mira qué falló antes de la próxima.`,
      section: "actividades",
      query: `a=${a.id}&pestana=valoracion`,
      urgent: false,
    });
  }

  // Viajes a plazos con gente atrasada, en el mes antes de salir.
  const members = data.communityMembers as CommunityMember[];
  for (const a of upcoming.filter((x) => x.trip && localDate(x.date) <= addDays(today, 30))) {
    const ids = activityAttendees(a, members).map((p) => p.id);
    const sum = tripSummary(a.trip!, ids, today);
    if (!sum.late) continue;
    const d = daysBetween(today, localDate(a.date));
    items.push({
      id: `trip-${a.id}`,
      kind: "trip",
      title: `${a.title}: ${sum.late} ${sum.late === 1 ? "viajero atrasado" : "viajeros atrasados"}`,
      detail: `${money(sum.overdueCents)} de plazos vencidos. El recordatorio sale por WhatsApp con el importe.`,
      section: "actividades",
      query: `a=${a.id}&pestana=viaje`,
      badge: inDays(d),
      urgent: d <= 10,
    });
  }

  // Material que tenía que haber vuelto.
  const late = overdueLoans(ops.inventory ?? [], today);
  if (late.length) {
    const firstLate = late[0];
    items.push({
      id: "loans",
      kind: "loans",
      title:
        late.length === 1
          ? `${firstLate.item.name}: lo tiene ${firstLate.loan.holder}`
          : `${late.length} cosas del material sin devolver`,
      detail:
        late.length === 1
          ? "Tenía que haber vuelto ya. Pídeselo con un toque."
          : late.map((x) => `${x.item.name} (${x.loan.holder})`).join(", "),
      section: "material",
      badge: firstLate.loan.due ? inDays(daysBetween(today, firstLate.loan.due)) : undefined,
      urgent: false,
    });
  }

  // Pedidos de merchandising: tallas por cerrar o dinero por cobrar.
  for (const o of ops.merch ?? []) {
    if (o.status === "abierto" && o.closesOn <= addDays(today, 3)) {
      const d = daysBetween(today, o.closesOn);
      items.push({
        id: `merch-${o.id}`,
        kind: "merch",
        title: d < 0 ? `Pasa el pedido de ${o.title.toLowerCase()} al proveedor` : `Las tallas de ${o.title.toLowerCase()} cierran pronto`,
        detail: `${lineUnits(o)} unidades apuntadas.`,
        section: "caja",
        query: "vista=pedidos",
        badge: inDays(d),
        urgent: d < 0,
      });
    } else if (o.status !== "abierto") {
      const sum = merchSummary(o);
      if (!sum.unpaid.length) continue;
      items.push({
        id: `merch-${o.id}`,
        kind: "merch",
        title: `${o.title}: ${sum.unpaid.length} sin pagar`,
        detail: `${money(sum.pendingCents)} por cobrar. Recuérdaselo por WhatsApp.`,
        section: "caja",
        query: "vista=pedidos",
        urgent: false,
      });
    }
  }

  // Lo urgente primero, sin perder el orden de cada bloque.
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => Number(b.item.urgent) - Number(a.item.urgent) || a.i - b.i)
    .map((x) => x.item);
}
