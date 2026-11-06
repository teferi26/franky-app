import type { CommunityActivity, CommunityRating } from "./community-types";
import { localDate } from "./format";

/**
 * Valoración tras la actividad (motor "community").
 *
 * Franky pide una nota de 1 a 5 y un comentario opcional a quienes hicieron
 * check-in, 24 horas después de que acabe la actividad: da tiempo a volver a
 * casa y todavía se acuerdan. La media sale en la actividad, en la memoria de
 * la subvención y en la memoria del curso.
 */

/** Horas que se esperan tras acabar la actividad antes de pedir la nota. */
export const RATING_DELAY_HOURS = 24;

/** Duración por defecto si la actividad no la tiene apuntada. */
const DEFAULT_MINUTES = 120;

export type RatingSummary = {
  count: number;
  /** Media con un decimal (0 si nadie ha valorado). */
  avg: number;
  /** Cuántas notas de 1, 2, 3, 4 y 5 estrellas, en ese orden. */
  distribution: [number, number, number, number, number];
  /** Parte de los asistentes con check-in que ha valorado (0 a 100). */
  responsePct: number;
  /** Comentarios con texto, del más reciente al más antiguo. */
  comments: CommunityRating[];
};

/** Nota válida: entero entre 1 y 5. */
export function clampStars(stars: number): number {
  return Math.min(5, Math.max(1, Math.round(stars)));
}

export function ratingSummary(a: CommunityActivity): RatingSummary {
  const ratings = a.ratings ?? [];
  const distribution: RatingSummary["distribution"] = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of ratings) {
    const s = clampStars(r.stars);
    distribution[s - 1] += 1;
    sum += s;
  }
  const count = ratings.length;
  return {
    count,
    avg: count ? Math.round((sum / count) * 10) / 10 : 0,
    distribution,
    responsePct: a.checkedIn ? Math.min(100, Math.round((count * 100) / a.checkedIn)) : 0,
    comments: ratings
      .filter((r) => r.comment?.trim())
      .sort((x, y) => y.at.localeCompare(x.at)),
  };
}

/** Cuándo acaba la actividad (ISO). */
export function activityEnd(a: CommunityActivity): string {
  const start = new Date(a.date).getTime();
  return new Date(start + (a.durationMinutes ?? DEFAULT_MINUTES) * 60_000).toISOString();
}

/** Cuándo pide Franky la valoración: 24 horas después de acabar, o antes si la junta la pidió. */
export function ratingAskAt(a: CommunityActivity): string {
  const auto = new Date(
    new Date(activityEnd(a)).getTime() + RATING_DELAY_HOURS * 3_600_000,
  ).toISOString();
  return a.ratingAskedAt && a.ratingAskedAt < auto ? a.ratingAskedAt : auto;
}

/**
 * En qué punto está la valoración:
 * - "before": la actividad no ha acabado.
 * - "scheduled": ya acabó y Franky la pedirá en unas horas.
 * - "asked": ya se ha pedido (se reciben notas).
 * - "none": borrador o actividad sin nadie dentro.
 */
export type RatingState = "none" | "before" | "scheduled" | "asked";

export function ratingState(a: CommunityActivity, now: Date): RatingState {
  if (a.status === "draft") return "none";
  const iso = now.toISOString();
  if (a.status !== "done" && activityEnd(a) > iso) return "before";
  if (!a.checkedIn && !(a.ratings ?? []).length) return "none";
  return ratingAskAt(a) <= iso ? "asked" : "scheduled";
}

/** La junta adelanta la petición: se manda ahora en vez de esperar las 24 horas. */
export function askRatingsNow(a: CommunityActivity, nowIso: string): CommunityActivity {
  if (a.ratingAskedAt) return a;
  return { ...a, ratingAskedAt: nowIso };
}

/** Añade una nota (la que llega desde la app del estudiante). */
export function addRating(a: CommunityActivity, rating: CommunityRating): CommunityActivity {
  const clean: CommunityRating = {
    ...rating,
    stars: clampStars(rating.stars),
    comment: rating.comment?.trim() || undefined,
  };
  return { ...a, ratings: [...(a.ratings ?? []), clean] };
}

/** Media de todas las notas de un conjunto de actividades, ponderada por respuestas. */
export function averageRating(activities: CommunityActivity[]): { avg: number; count: number } {
  let sum = 0;
  let count = 0;
  for (const a of activities) {
    for (const r of a.ratings ?? []) {
      sum += clampStars(r.stars);
      count += 1;
    }
  }
  return { avg: count ? Math.round((sum / count) * 10) / 10 : 0, count };
}

/** "4,6" con coma decimal. */
export function ratingLabel(avg: number): string {
  return avg.toFixed(1).replace(".", ",");
}

/** Actividades hechas entre dos días (YYYY-MM-DD, incluidos) con al menos una nota. */
export function ratedActivities(
  activities: CommunityActivity[],
  from: string,
  to: string,
): CommunityActivity[] {
  return activities.filter((a) => {
    const day = localDate(a.date);
    return a.status !== "draft" && day >= from && day <= to && (a.ratings ?? []).length > 0;
  });
}
