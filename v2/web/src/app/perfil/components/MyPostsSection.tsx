"use client";

// Mis publicaciones en el perfil web: paridad con el perfil de la app móvil
// (v2/mobile/app/(tabs)/perfil.tsx). Cuatro pestañas:
//   Actividad: línea de tiempo estilo Twitter de las publicaciones firmadas
//   Fotos:     rejilla 3xN solo de posts con media (no anónimos)
//   Vídeos:    rejilla solo de vídeos (no anónimos)
//   Privado:   las publicaciones anónimas, visibles solo para su dueño
// Todo fail-soft: cualquier error de red o de esquema deja la sección vacía
// sin romper el resto del perfil.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AlignLeft, Camera, Film, Heart, Loader2, Lock, MessageCircle,
  MoreHorizontal, PenSquare, Play, Send, Trash2, EyeOff,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fomoTimeAgo } from "../../fomo/types";

const PAGE = 20;

type MyPost = {
  id: string;
  body: string | null;
  media_url: string | null;
  media_type: "image" | "audio" | "video" | null;
  is_anonymous: boolean;
  created_at: string;
  // Contadores reales del hilo (columnas mantenidas por trigger desde la
  // migración 078): comentarios y me gusta sin consultas extra.
  reply_count: number;
  reaction_count: number;
};

type PostsTab = "actividad" | "fotos" | "videos" | "privado";

const TABS: { key: PostsTab; label: string; icon: typeof AlignLeft }[] = [
  { key: "actividad", label: "Actividad", icon: AlignLeft },
  { key: "fotos", label: "Fotos", icon: Camera },
  { key: "videos", label: "Vídeos", icon: Film },
  { key: "privado", label: "Privado", icon: Lock },
];

export default function MyPostsSection({
  userId,
  fullName,
  avatarUrl,
}: {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
}) {
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState<PostsTab>("actividad");
  // Slug de la universidad del usuario: se resuelve UNA vez (no por fila)
  // para montar los enlaces /fomo/{slug}/{threadId}. Sin slug, las filas no
  // navegan pero todo lo demás sigue funcionando.
  const [uniSlug, setUniSlug] = useState<string | null>(null);
  // Menú ⋯ abierto (id de la fila) y confirmación de borrado pendiente.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const sectionRef = useRef<HTMLDivElement>(null);

  // Cerrar el menú ⋯ al hacer clic fuera de la sección o en otra fila.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuFor]);

  const fetchPage = useCallback(
    async (offset: number): Promise<MyPost[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("fomo_threads")
        .select("id, body, media_url, media_type, is_anonymous, created_at, reply_count, reaction_count")
        .eq("author_id", userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      return (data as MyPost[]) ?? [];
    },
    [userId]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      // 1) Slug de la uni: profiles.university_id → universities.slug.
      //    Dos consultas pequeñas, fail-soft por separado.
      try {
        const supabase = createClient();
        const { data: prof } = await supabase
          .from("profiles")
          .select("university_id")
          .eq("id", userId)
          .maybeSingle();
        if (prof?.university_id) {
          const { data: uni } = await supabase
            .from("universities")
            .select("slug")
            .eq("id", prof.university_id)
            .maybeSingle();
          if (active && uni?.slug) setUniSlug(uni.slug as string);
        }
      } catch { /* sin slug: filas sin enlace */ }

      // 2) Primera página de mis publicaciones.
      try {
        const rows = await fetchPage(0);
        if (!active) return;
        setPosts(rows);
        setHasMore(rows.length === PAGE);
      } catch { /* fail-soft: sección vacía */ }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [userId, fetchPage]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(posts.length);
      setPosts((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE);
    } catch { /* conservar lo cargado */ }
    setLoadingMore(false);
  };

  // Borrado lógico vía RPC delete_fomo_thread (migración 080, ya en prod)
  // con quitado optimista de la lista y vuelta atrás si el servidor falla.
  const deletePost = async (id: string) => {
    setDeleting(true);
    setDeleteError("");
    const prev = posts;
    setPosts((p) => p.filter((x) => x.id !== id));
    setConfirmFor(null);
    setMenuFor(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("delete_fomo_thread", { p_thread_id: id });
      if (error) throw error;
    } catch {
      setPosts(prev);
      setDeleteError("No se pudo eliminar la publicación. Inténtalo de nuevo.");
    }
    setDeleting(false);
  };

  // Compartir una publicación: hoja nativa si existe, portapapeles si no.
  const sharePost = async (p: MyPost) => {
    const url = uniSlug
      ? `https://franky.es/fomo/${uniSlug}/${p.id}`
      : "https://franky.es";
    const text = p.body?.trim() || "Mira lo que se cuece en Franky";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text, url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch { /* el usuario canceló o no hay hoja de compartir */ }
  };

  const threadHref = (id: string) => (uniSlug ? `/fomo/${uniSlug}/${id}` : null);
  const publishHref = uniSlug ? `/fomo/${uniSlug}` : "/fomo";

  // Listas derivadas, mismas reglas que el perfil móvil.
  const publicPosts = posts.filter((p) => !p.is_anonymous);
  const mediaPosts = posts.filter((p) => !p.is_anonymous && !!p.media_url);
  const videoPosts = posts.filter((p) => !p.is_anonymous && p.media_type === "video");
  const privatePosts = posts.filter((p) => p.is_anonymous);

  const initial = (fullName ?? "?").trim().charAt(0).toUpperCase() || "?";

  // ── Menú ⋯ por fila: Ver hilo + Eliminar con confirmación ──────────────────
  const RowMenu = ({ post }: { post: MyPost }) => (
    <div className="relative z-10 shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmFor(null);
          setMenuFor(menuFor === post.id ? null : post.id);
        }}
        aria-label="Opciones de la publicación"
        aria-expanded={menuFor === post.id}
        className="h-8 w-8 flex items-center justify-center rounded-full text-text-muted hover:bg-bg-secondary hover:text-text-primary transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menuFor === post.id && (
        <div
          className="animate-dropdown absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-border bg-bg-primary shadow-float"
          onClick={(e) => e.stopPropagation()}
        >
          {threadHref(post.id) && (
            <Link
              href={threadHref(post.id)!}
              className="block px-4 py-2.5 text-sm text-text-primary hover:bg-bg-secondary/60 transition-colors"
            >
              Ver hilo
            </Link>
          )}
          {confirmFor === post.id ? (
            <div className="px-4 py-2.5 border-t border-border-light">
              <p className="text-xs text-text-muted mb-2">¿Eliminar para siempre?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => deletePost(post.id)}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Eliminando…" : "Sí, eliminar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmFor(null)}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-bg-secondary text-text-secondary text-xs font-semibold hover:bg-border-light transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmFor(post.id)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left border-t border-border-light"
            >
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );

  // ── Fila de la línea de tiempo (Actividad): avatar + nombre + contadores ────
  const TimelineRow = ({ post }: { post: MyPost }) => {
    const href = threadHref(post.id);
    return (
      <div className="relative flex gap-3 px-1 py-4 border-b border-border-light last:border-b-0">
        {/* Toda la fila abre el hilo: enlace superpuesto; los controles
            interactivos van por encima con z-10. */}
        {href && (
          <Link href={href} aria-label="Ver hilo de la publicación" className="absolute inset-0 rounded-xl" />
        )}
        <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-violet/10 border border-violet/20 flex items-center justify-center">
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" width={40} height={40} className="h-full w-full object-cover" unoptimized />
          ) : (
            <span className="text-sm font-bold text-violet">{initial}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 pr-8">
            <span className="text-sm font-bold text-text-primary truncate">
              {fullName || "Estudiante"}
            </span>
            <span className="text-xs text-text-muted shrink-0">· {fomoTimeAgo(post.created_at)}</span>
          </div>
          {post.body && (
            <p className="mt-0.5 text-sm text-text-primary whitespace-pre-wrap break-words">{post.body}</p>
          )}
          {post.media_url && (
            <div className="mt-2 overflow-hidden rounded-xl border border-border-light bg-bg-secondary/40">
              {post.media_type === "video" ? (
                <video
                  src={post.media_url}
                  preload="metadata"
                  muted
                  playsInline
                  className="w-full max-h-72 object-cover"
                />
              ) : post.media_type === "audio" ? (
                <audio controls preload="none" src={post.media_url} className="w-full relative z-10">
                  Tu navegador no soporta audio.
                </audio>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.media_url}
                  alt="Imagen de la publicación"
                  loading="lazy"
                  decoding="async"
                  className="w-full max-h-72 object-cover"
                />
              )}
            </div>
          )}
          {/* Barra de interacciones estilo Twitter: contadores reales del hilo. */}
          <div className="mt-2.5 flex items-center gap-6 text-text-muted">
            <span className="flex items-center gap-1.5 text-xs" aria-label={`${post.reply_count ?? 0} comentarios`}>
              <MessageCircle className="h-4 w-4" /> {post.reply_count ?? 0}
            </span>
            <span className="flex items-center gap-1.5 text-xs" aria-label={`${post.reaction_count ?? 0} me gusta`}>
              <Heart className="h-4 w-4" /> {post.reaction_count ?? 0}
            </span>
            <button
              type="button"
              onClick={() => sharePost(post)}
              aria-label="Compartir publicación"
              className="relative z-10 flex items-center hover:text-violet transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
        <RowMenu post={post} />
      </div>
    );
  };

  // ── Celda de rejilla 3xN (Fotos, Vídeos, Privado) ───────────────────────────
  const GridTile = ({ post }: { post: MyPost }) => {
    const href = threadHref(post.id);
    return (
      <div className="relative aspect-square rounded-lg overflow-hidden border border-border-light bg-bg-secondary/40 group">
        {href && (
          <Link href={href} aria-label="Ver hilo de la publicación" className="absolute inset-0 z-[1]" />
        )}
        {post.media_url ? (
          post.media_type === "video" ? (
            <video src={post.media_url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.media_url}
              alt="Publicación"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <div className="h-full w-full p-2 flex items-center">
            <p className="text-[11px] leading-4 text-text-primary line-clamp-5 break-words">
              {post.body || "Publicación"}
            </p>
          </div>
        )}
        {post.media_type === "video" && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-black/55 p-1">
            <Play className="h-3 w-3 text-white fill-white" />
          </span>
        )}
        {post.is_anonymous && (
          <span className="absolute top-1.5 right-1.5 rounded-md bg-black/55 p-1" title="Publicación anónima">
            <EyeOff className="h-3 w-3 text-white" />
          </span>
        )}
        {/* Menú ⋯ de la celda: aparece al pasar el ratón o con teclado. */}
        <div className="absolute bottom-1 right-1 z-[2] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <RowMenu post={post} />
        </div>
      </div>
    );
  };

  const EmptyState = ({ icon: Icon, title, sub }: { icon: typeof Camera; title: string; sub: string }) => (
    <div className="py-10 text-center">
      <Icon className="h-9 w-9 mx-auto text-text-muted" strokeWidth={1.3} />
      <p className="mt-2 text-sm font-semibold text-text-primary">{title}</p>
      <p className="mt-1 text-sm text-text-muted max-w-xs mx-auto">{sub}</p>
      <Link href={publishHref} className={cn(buttonVariants({ variant: "outline" }), "mt-5")}>
        <PenSquare className="h-4 w-4" /> Publicar en FOMO
      </Link>
    </div>
  );

  const renderGrid = (items: MyPost[], empty: { icon: typeof Camera; title: string; sub: string }) =>
    items.length === 0 ? (
      <EmptyState icon={empty.icon} title={empty.title} sub={empty.sub} />
    ) : (
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((p) => <GridTile key={p.id} post={p} />)}
      </div>
    );

  return (
    <div ref={sectionRef} className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
      <p className="eyebrow">Tu contenido</p>
      <h2 className="mt-2 font-heading text-xl font-extrabold leading-tight text-text-primary">Mis publicaciones</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        Todo lo que has publicado en FOMO, como en la app.
      </p>

      {deleteError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-error/20 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {deleteError}
        </div>
      )}

      {/* Pestañas: mismas cuatro secciones que el perfil de la app móvil. */}
      <div className="mt-6 flex border-b border-border-light" role="tablist" aria-label="Secciones de mis publicaciones">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => { setTab(key); setMenuFor(null); setConfirmFor(null); }}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2.5 border-b-2 -mb-px transition-colors",
                active
                  ? "border-violet text-violet"
                  : "border-transparent text-text-muted hover:text-text-primary"
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.7} />
              <span className={cn("text-[11px]", active ? "font-bold" : "font-medium")}>{label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-10 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-violet mx-auto" />
        </div>
      ) : (
        <div className="pt-2">
          {tab === "actividad" && (
            publicPosts.length === 0 ? (
              <EmptyState
                icon={AlignLeft}
                title="Todavía no has publicado nada"
                sub="Cuando publiques con tu nombre en FOMO, tu actividad aparecerá aquí."
              />
            ) : (
              <div>
                {publicPosts.map((p) => <TimelineRow key={p.id} post={p} />)}
              </div>
            )
          )}
          {tab === "fotos" && renderGrid(mediaPosts, {
            icon: Camera,
            title: "Sin fotos todavía",
            sub: "Tus publicaciones con foto o vídeo se verán aquí en rejilla.",
          })}
          {tab === "videos" && renderGrid(videoPosts, {
            icon: Film,
            title: "Sin vídeos todavía",
            sub: "Sube un vídeo a FOMO y aparecerá en esta pestaña.",
          })}
          {tab === "privado" && (
            <div>
              {/* Aviso de privacidad: las anónimas solo las ve su dueño. */}
              <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                Solo tú ves esto: son tus publicaciones anónimas.
              </div>
              {renderGrid(privatePosts, {
                icon: Lock,
                title: "Nada en privado",
                sub: "Lo que publiques en anónimo se guarda aquí, visible solo para ti.",
              })}
            </div>
          )}

          {/* Paginación: 20 en 20 con botón "Ver más". */}
          {hasMore && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-light text-sm font-semibold text-text-secondary hover:border-violet/40 hover:text-violet disabled:opacity-50 transition-colors"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                {loadingMore ? "Cargando…" : "Ver más"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
