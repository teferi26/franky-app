// Tipos del muro de ligar. Reflejan el JSON que devuelve get_ligar_feed
// (SECURITY DEFINER), que ya anula la identidad del autor en posts anónimos.

export type LigarAudience = "todos" | "hombre" | "mujer";
export type LigarMediaType = "image" | "audio" | "video";

export interface LigarAuthor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  age: number | null;
  opted_in: boolean;
}

export interface LigarPost {
  id: string;
  university_id: string;
  body: string | null;
  offer: string | null;
  media_url: string | null;
  media_type: LigarMediaType | null;
  audience: LigarAudience;
  is_anonymous: boolean;
  reaction_count: number;
  created_at: string;
  is_mine: boolean;
  my_reaction: boolean;
  author: LigarAuthor | null; // null cuando is_anonymous
}

export const AUDIENCE_LABEL: Record<LigarAudience, string> = {
  todos: "Para todos",
  mujer: "Para chicas",
  hombre: "Para chicos",
};

/**
 * Día y hora exactos en español. Si es hoy → "Hoy 14:32", si fue ayer →
 * "Ayer 09:05", y en otro caso "28 may 18:00" (con año si no es el actual).
 */
export function ligarTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (dayDiff === 0) return `Hoy ${time}`;
  if (dayDiff === 1) return `Ayer ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${datePart} ${time}`;
}
