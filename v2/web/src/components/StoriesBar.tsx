"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase-client";
import { useSocialModerationRefresh } from '@/lib/social-moderation-client';

// Rendimiento (sep-2026): el visor a pantalla completa (vídeo, audio, gestos,
// temporizador) solo se monta cuando alguien pulsa una historia. Con
// next/dynamic su chunk no entra en el bundle del feed FOMO ni de la home con
// sesión, que es donde vive esta barra: se descarga en el primer toque.
const StoriesViewer = dynamic(() => import("@/components/StoriesViewer"), {
  ssr: false,
  loading: () => null,
});

// ─── Tipos compartidos del visor de stories web ─────────────────────────────

export type WebStory = {
  id: string;
  author_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  /** Ya registrada como vista por el usuario actual (tabla story_views). */
  seen: boolean;
};

export type WebStoryGroup = {
  authorId: string;
  name: string | null;
  avatarUrl: string | null;
  isMine: boolean;
  stories: WebStory[];
};

/** Un grupo cuenta como "visto" cuando todas sus stories lo están. */
export function groupSeen(g: WebStoryGroup): boolean {
  return g.stories.every((s) => s.seen);
}

// ─── Barra de stories del feed FOMO (solo visor; se crea desde el móvil) ────
//
// Mismo modelo que la barra del móvil (StoriesBar.tsx de mobile): stories de
// menos de 24 h agrupadas por autor, la mía primero. En la web filtramos a la
// gente del campus (public_profiles.university_id) porque el feed es por uni.
// Aro violeta sólido si queda alguna sin ver; hairline gris si ya viste
// todas (v3: sin degradados). Fail-soft total: sin sesión o sin stories la
// barra no se pinta.
export default function StoriesBar({ universityId }: { universityId: string }) {
  const supabase = createClient();
  const [groups, setGroups] = useState<WebStoryGroup[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  useSocialModerationRefresh(() => { setOpenIndex(null); void load(); });

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setGroups([]);
        return;
      }

      // Stories vivas (RLS ya limita a autenticados y no caducadas)
      const { data: stories, error } = await supabase
        .from("stories")
        .select("id, author_id, media_url, media_type, caption, created_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .limit(200);
      if (error || !stories?.length) {
        setGroups([]);
        return;
      }

      // Perfiles de los autores (la vista pública ya excluye descartados)
      const authorIds = [...new Set(stories.map((s) => s.author_id as string))];
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, full_name, avatar_url, university_id")
        .in("id", authorIds);
      const byId = new Map(
        (profiles ?? []).map((p) => [p.id as string, p])
      );

      // Vistas mías, para pintar el aro gris en lo ya visto
      const { data: views } = await supabase
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", user.id)
        .in(
          "story_id",
          stories.map((s) => s.id as string)
        )
        .limit(500);
      const seenIds = new Set((views ?? []).map((v) => v.story_id as string));

      const map = new Map<string, WebStoryGroup>();
      for (const s of stories) {
        const p = byId.get(s.author_id as string);
        // Solo gente del campus (o mi propia story, se muestre donde se muestre)
        const isMine = s.author_id === user.id;
        if (!p) continue;
        if (!isMine && p.university_id !== universityId) continue;
        let g = map.get(s.author_id as string);
        if (!g) {
          g = {
            authorId: s.author_id as string,
            name: (p.full_name as string | null) ?? null,
            avatarUrl: (p.avatar_url as string | null) ?? null,
            isMine,
            stories: [],
          };
          map.set(s.author_id as string, g);
        }
        g.stories.push({
          id: s.id as string,
          author_id: s.author_id as string,
          media_url: s.media_url as string,
          media_type: s.media_type as "image" | "video",
          caption: (s.caption as string | null) ?? null,
          created_at: s.created_at as string,
          seen: isMine || seenIds.has(s.id as string),
        });
      }

      // La mía primero; el resto, sin ver antes que vistas y por más recientes
      const sorted = [...map.values()].sort((a, b) => {
        if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
        const sa = groupSeen(a) ? 1 : 0;
        const sb = groupSeen(b) ? 1 : 0;
        if (sa !== sb) return sa - sb;
        return (b.stories.at(-1)?.created_at ?? "").localeCompare(
          a.stories.at(-1)?.created_at ?? ""
        );
      });
      setGroups(sorted);
    } catch {
      // Fail-soft: cualquier fallo deja la barra sin pintar
      setGroups([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universityId]);

  useEffect(() => {
    load();
  }, [load]);

  // Marca una story como vista en el estado local (el visor ya la registró en
  // story_views); así el aro pasa a gris sin recargar nada.
  const markSeen = useCallback((storyId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.stories.some((s) => s.id === storyId)
          ? {
              ...g,
              stories: g.stories.map((s) =>
                s.id === storyId ? { ...s, seen: true } : s
              ),
            }
          : g
      )
    );
  }, []);

  if (groups.length === 0) return null;

  return (
    <>
      <div className="mb-4 rounded-2xl border border-border bg-bg-primary p-3 shadow-card animate-fade-in">
        <ul
          className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide"
          aria-label="Stories del campus"
        >
          {groups.map((g, i) => {
            const seen = groupSeen(g);
            const label = g.isMine
              ? "Ver tu historia"
              : `Ver las stories de ${g.name ?? "Estudiante"}${
                  seen ? " (ya vistas)" : ""
                }`;
            return (
              <li
                key={g.authorId}
                className="shrink-0 animate-list-in"
                style={{ ["--i" as string]: i }}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(i)}
                  aria-label={label}
                  className="group flex w-[72px] flex-col items-center gap-1 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-violet"
                >
                  {/* Aro: violeta sólido si hay stories sin ver, hairline si no.
                      El avatar sube 2 px al pasar el ratón. */}
                  <span
                    className={`rounded-full p-[2px] transition-transform duration-200 ease-[var(--ease-out-quart)] group-hover:-translate-y-0.5 ${
                      seen ? "bg-border" : "bg-violet"
                    }`}
                  >
                    <span className="block rounded-full bg-bg-primary p-[2px]">
                      {g.avatarUrl ? (
                        <Image
                          src={g.avatarUrl}
                          alt=""
                          width={56}
                          height={56}
                          className="h-14 w-14 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-50 font-heading text-lg font-bold text-violet-deep"
                        >
                          {(g.name ?? "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={`max-w-[70px] truncate text-[11px] ${seen ? "text-text-muted" : "font-medium text-text-primary"}`}>
                    {g.isMine
                      ? "Tu historia"
                      : (g.name ?? "Estudiante").split(" ")[0]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {openIndex !== null && groups[openIndex] && (
        <StoriesViewer
          groups={groups}
          startIndex={openIndex}
          onSeen={markSeen}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}
