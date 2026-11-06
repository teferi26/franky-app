/**
 * Renovación anual del registro de asociaciones y traspaso de junta.
 *
 * Cada septiembre las asociaciones confirman su junta y su número de socios.
 * Cuando cambia la junta, la nueva hereda documentos, actividades y créditos:
 * nada se pierde porque cuelga de la asociación, no de las personas.
 */

import type {
  ProUniBoardMember,
  ProUniBoardRole,
  ProUniCreditRequest,
  ProUniAssocActivity,
  UniAssociation,
} from "./university-types";
import { localDate } from "./format";
import { docsOf } from "./university";

export const BOARD_ROLE_LABEL: Record<ProUniBoardRole, string> = {
  presidencia: "Presidencia",
  secretaria: "Secretaría",
  tesoreria: "Tesorería",
  vocal: "Vocalía",
};

export const BOARD_ROLES: ProUniBoardRole[] = ["presidencia", "secretaria", "tesoreria", "vocal"];

/** Curso académico de una fecha: de septiembre a agosto ("2026-27"). */
export function courseOf(now: Date): string {
  const today = localDate(now);
  const year = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 9 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Texto del curso para pantalla: "2026-27" pasa a "curso 2026/27". */
export function courseLabel(course: string): string {
  return `curso ${course.replace("-", "/")}`;
}

export type RenewalState = "done" | "partial" | "requested" | "pending";

/**
 * En qué punto está la renovación de este curso. Solo tiene sentido para las
 * asociaciones registradas; las que piden entrar siguen su propio camino.
 */
export function renewalState(a: UniAssociation, course: string): RenewalState {
  const r = a.renewal;
  if (!r || r.course !== course) return "pending";
  if (r.boardConfirmed && r.membersConfirmed) return "done";
  if (r.boardConfirmed || r.membersConfirmed) return "partial";
  return r.requestedAt ? "requested" : "pending";
}

export const RENEWAL_LABEL: Record<RenewalState, string> = {
  done: "Renovada",
  partial: "A medias",
  requested: "Pedida",
  pending: "Sin renovar",
};

export type RenewalSummary = {
  course: string;
  total: number;
  done: number;
  missing: UniAssociation[];
  /** Sin renovar a las que aún no se les ha pedido este curso. */
  notAsked: UniAssociation[];
};

export function renewalSummary(associations: UniAssociation[], now: Date): RenewalSummary {
  const course = courseOf(now);
  const registered = associations.filter((a) => a.registered);
  const missing = registered.filter((a) => renewalState(a, course) !== "done");
  return {
    course,
    total: registered.length,
    done: registered.length - missing.length,
    missing,
    notAsked: missing.filter((a) => a.renewal?.course !== course || !a.renewal.requestedAt),
  };
}

/** Pide la renovación a todas las que faltan (o a las indicadas) de una vez. */
export function requestRenewals(
  associations: UniAssociation[],
  now: Date,
  ids?: string[],
): UniAssociation[] {
  const course = courseOf(now);
  const at = now.toISOString();
  return associations.map((a) => {
    if (!a.registered || renewalState(a, course) === "done") return a;
    if (ids && !ids.includes(a.id)) return a;
    const same = a.renewal?.course === course ? a.renewal : null;
    return {
      ...a,
      renewal: {
        course,
        boardConfirmed: same?.boardConfirmed ?? false,
        membersConfirmed: same?.membersConfirmed ?? false,
        requestedAt: at,
      },
    };
  });
}

/** Marca como confirmada la junta, los socios o las dos cosas. */
export function confirmRenewal(
  a: UniAssociation,
  now: Date,
  part: { board?: boolean; members?: boolean },
  members?: number,
): UniAssociation {
  const course = courseOf(now);
  const same = a.renewal?.course === course ? a.renewal : null;
  const boardConfirmed = part.board ?? same?.boardConfirmed ?? false;
  const membersConfirmed = part.members ?? same?.membersConfirmed ?? false;
  return {
    ...a,
    members: typeof members === "number" && members >= 0 ? members : a.members,
    renewal: {
      course,
      boardConfirmed,
      membersConfirmed,
      requestedAt: same?.requestedAt,
      completedAt: boardConfirmed && membersConfirmed ? now.toISOString() : undefined,
    },
  };
}

export function presidentOf(a: Pick<UniAssociation, "board">): string | null {
  return a.board?.find((m) => m.role === "presidencia")?.name ?? null;
}

/** Lo que la junta nueva hereda al hacer el traspaso. */
export type Inheritance = {
  docs: number;
  activities: number;
  creditsValidated: number;
  creditsPending: number;
};

export function inheritanceOf(
  a: UniAssociation,
  activities: ProUniAssocActivity[],
  credits: ProUniCreditRequest[],
): Inheritance {
  const own = credits.filter((c) => c.associationId === a.id);
  return {
    docs: docsOf(a).filter((d) => d.ok).length,
    activities: Math.max(a.activities, activities.filter((x) => x.associationId === a.id).length),
    creditsValidated: own.filter((c) => c.status === "validated").length,
    creditsPending: own.filter((c) => c.status === "pending").length,
  };
}

/** Motivo por el que la junta nueva no vale, o null. */
export function boardProblem(board: ProUniBoardMember[]): string | null {
  const named = board.filter((m) => m.name.trim());
  if (!named.some((m) => m.role === "presidencia")) return "Falta quién ocupa la presidencia.";
  if (!named.some((m) => m.role === "secretaria")) return "Falta quién ocupa la secretaría.";
  return null;
}

/**
 * Traspaso de junta: queda la nueva, se guarda el cambio en el historial y la
 * junta cuenta como confirmada para este curso.
 */
export function handoverBoard(
  a: UniAssociation,
  board: ProUniBoardMember[],
  now: Date,
): UniAssociation {
  const course = courseOf(now);
  const clean = board
    .map((m) => ({ role: m.role, name: m.name.trim() }))
    .filter((m) => m.name);
  const from = presidentOf(a) ?? "Junta anterior";
  const to = clean.find((m) => m.role === "presidencia")?.name ?? "";
  const confirmed = confirmRenewal({ ...a, board: clean }, now, { board: true });
  return {
    ...confirmed,
    handovers: [...(a.handovers ?? []), { at: now.toISOString(), course, from, to }],
  };
}
