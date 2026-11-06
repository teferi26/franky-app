// Shared types for the FOMO feature. These mirror the JSON shape returned by
// the SECURITY DEFINER RPCs (get_fomo_feed / get_fomo_thread), which already
// strip author identity when a post is anonymous.

export interface FomoAuthor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  age: number | null;
  university_id: string | null;
  is_organization?: boolean;
  organization_id?: string;
  verified?: boolean;
  kind?: string;
}

export interface FomoPollOption {
  id: string;
  position: number;
  label: string;
  vote_count: number;
}

export interface FomoPoll {
  id: string;
  question: string;
  options: FomoPollOption[];
  total_votes: number;
  my_option_id: string | null;
}

export interface FomoThread {
  id: string;
  university_id: string;
  body: string | null;
  media_url: string | null;
  media_type: "image" | "audio" | "video" | null;
  is_anonymous: boolean;
  reply_count: number;
  reaction_count: number;
  created_at: string;
  author: FomoAuthor | null; // null when is_anonymous
  poll: FomoPoll | null;
  my_reaction: boolean;
  is_mine: boolean;
  is_hidden?: boolean;
}

export interface FomoReply {
  id: string;
  body: string | null;
  media_url: string | null;
  media_type: "image" | "audio" | "video" | null;
  is_anonymous: boolean;
  created_at: string;
  author: FomoAuthor | null;
  is_mine: boolean;
}

export interface FomoThreadDetail extends FomoThread {
  replies: FomoReply[];
}

/**
 * Día y hora exactos en español. Si es hoy → "Hoy 14:32", si fue ayer →
 * "Ayer 09:05", y en otro caso "28 may 18:00" (con año si no es el actual).
 */
export function fomoTimeAgo(iso: string): string {
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
