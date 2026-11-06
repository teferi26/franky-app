/**
 * Perfiles sociales oficiales de Franky.
 *
 * Toda la captacion pasa por Instagram y TikTok, pero no habia ni un enlace en
 * la web ni nada en `sameAs` del JSON-LD (Google no podia asociar la marca con
 * sus perfiles). Se configuran por variable de entorno para no cablear un
 * handle equivocado: lo que no este definido, sencillamente no se pinta.
 *
 * Variables (Vercel → Environment Variables, ambito Production + Preview):
 *   NEXT_PUBLIC_INSTAGRAM_URL = https://www.instagram.com/<handle>
 *   NEXT_PUBLIC_TIKTOK_URL    = https://www.tiktok.com/@<handle>
 *   NEXT_PUBLIC_YOUTUBE_URL   = https://www.youtube.com/@<handle>
 *   NEXT_PUBLIC_LINKEDIN_URL  = https://www.linkedin.com/company/<slug>
 */
export type SocialLink = { name: string; url: string };

function clean(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Solo https absolutas: evita que una variable mal puesta genere un enlace roto.
  if (!/^https:\/\//i.test(trimmed)) return null;
  return trimmed.replace(/\/+$/, "");
}

export const SOCIAL_LINKS: SocialLink[] = (
  [
    { name: "Instagram", url: clean(process.env.NEXT_PUBLIC_INSTAGRAM_URL) },
    { name: "TikTok", url: clean(process.env.NEXT_PUBLIC_TIKTOK_URL) },
    { name: "YouTube", url: clean(process.env.NEXT_PUBLIC_YOUTUBE_URL) },
    { name: "LinkedIn", url: clean(process.env.NEXT_PUBLIC_LINKEDIN_URL) },
  ] as { name: string; url: string | null }[]
).filter((s): s is SocialLink => s.url !== null);

/** URLs para el `sameAs` del JSON-LD de Organization. */
export const SOCIAL_SAME_AS: string[] = SOCIAL_LINKS.map((s) => s.url);
