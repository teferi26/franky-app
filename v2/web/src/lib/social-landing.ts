/**
 * ¿La visita a la home llega desde redes sociales o desde una campaña?
 *
 * El tráfico de Instagram/TikTok (bio, stories, reels) es universitario y viene
 * a por el campus, no a por notas de corte. A esas visitas la home les enseña
 * un hero distinto (FOMO + eventos + registro). El resto mantiene el hero de
 * catálogo, que es el que mejor funciona en búsqueda orgánica.
 */
const SOCIAL_SOURCES = /^(ig|instagram|insta|tiktok|tt|facebook|fb|whatsapp|wa|twitter|x|linktree|linkinbio|threads|snapchat|qr|cartel)$/i;
const SOCIAL_MEDIUMS = /^(social|paid_social|story|stories|reel|bio|influencer|ambassador|qr|cartel)$/i;

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function isSocialCampaignVisit(params: Params | null | undefined): boolean {
  if (!params) return false;
  const source = first(params.utm_source);
  const medium = first(params.utm_medium);
  if (source && SOCIAL_SOURCES.test(source)) return true;
  if (medium && SOCIAL_MEDIUMS.test(medium)) return true;
  // Parámetro de campaña propio (carteles, links de embajador con ?c=...).
  if (first(params.utm_campaign) || first(params.c) || first(params.ref) === "qr") return true;
  return false;
}
