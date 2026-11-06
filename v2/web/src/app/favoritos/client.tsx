"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, BookOpen, Ticket, MapPin, Building2, Home, Trash2, MessageCircle, ArrowUpRight } from "lucide-react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { createClient } from "@/lib/supabase-client";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites, type FavoriteType } from "@/hooks/useFavorites";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/motion";
import { Skeleton } from "@/components/ui/skeleton";

interface FavoriteDetails {
  name?: string;
  title?: string;
  short_name?: string;
  slug?: string;
  city?: string;
  start_date?: string;
}

interface FavoriteItem {
  id: string;
  target_id: string;
  target_type: string;
  created_at: string;
  details?: FavoriteDetails;
}

// Tablas y columnas a consultar por cada tipo de favorito.
const ENRICH_SOURCES: Record<FavoriteType, { table: string; columns: string }> = {
  career: { table: "careers", columns: "id, name" },
  university: { table: "universities", columns: "id, name, short_name, slug" },
  accommodation: { table: "accommodations", columns: "id, title, city" },
  event: { table: "events", columns: "id, title, city, start_date" },
  leisure_spot: { table: "leisure_spots", columns: "id, name, city" },
};

function isFavoriteType(type: string): type is FavoriteType {
  return type in ENRICH_SOURCES;
}

// Publicación del FOMO guardada (favorites.target_type 'fomo_thread',
// migración 129), con el slug de su uni resuelto para enlazar al hilo.
interface SavedThreadItem {
  id: string;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  is_anonymous: boolean;
  created_at: string;
  saved_at: string;
  slug: string | null;
  uniName: string | null;
}

// Fila cruda de fomo_threads (o del JSON de get_fomo_thread, mismo shape).
interface SavedThreadRow {
  id: string;
  university_id: string | null;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  is_anonymous: boolean;
  created_at: string;
}

// Título legible de una publicación guardada: su texto o, si es solo media,
// una etiqueta por tipo.
function savedThreadTitle(t: SavedThreadItem): string {
  const body = t.body?.trim();
  if (body) return body;
  if (t.media_type === "image") return "Foto";
  if (t.media_type === "video") return "Vídeo";
  if (t.media_type === "audio") return "Nota de voz";
  return "Publicación";
}

function FavoritosClientInner() {
  const { user, loading: authLoading } = useAuth();
  const { favorites, loading, toggleFavorite } = useFavorites();
  const [enriched, setEnriched] = useState<FavoriteItem[]>([]);
  // Publicaciones del FOMO guardadas (paridad con la pestaña Guardado móvil).
  const [savedThreads, setSavedThreads] = useState<SavedThreadItem[]>([]);

  useEffect(() => {
    if (!user) {
      setSavedThreads([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();

    // Mismo patrón que getSavedFomoThreads en la app móvil: dos consultas
    // (favorites → fomo_threads) porque target_id es polimórfico y no hay FK
    // para el embed de PostgREST. Fail-soft en cada paso: lista vacía.
    async function loadSaved() {
      const { data: favs, error } = await supabase
        .from("favorites")
        .select("target_id, created_at")
        .eq("user_id", user!.id)
        .eq("target_type", "fomo_thread")
        .order("created_at", { ascending: false });
      if (error || !favs?.length) {
        if (!cancelled) setSavedThreads([]);
        return;
      }
      const ids = favs.map((f) => f.target_id as string);
      const savedAt = new Map(favs.map((f) => [f.target_id as string, f.created_at as string]));

      // Contenido de los hilos. La lectura directa solo devuelve los propios
      // (RLS de fomo_threads); los que falten se piden uno a uno por
      // get_fomo_thread (SECURITY DEFINER), que respeta anonimato y borrados.
      const { data: rows } = await supabase
        .from("fomo_threads")
        .select("id, university_id, body, media_url, media_type, is_anonymous, created_at")
        .in("id", ids);
      const byId = new Map<string, SavedThreadRow>(
        ((rows as SavedThreadRow[]) ?? []).map((t) => [t.id, t])
      );
      // Tope defensivo de RPCs por carga: los guardados suelen ser pocos.
      const missing = ids.filter((id) => !byId.has(id)).slice(0, 30);
      await Promise.all(
        missing.map(async (id) => {
          const { data } = await supabase.rpc("get_fomo_thread", { p_thread_id: id });
          if (data) byId.set(id, data as SavedThreadRow);
        })
      );

      // Slug y nombre de la uni para el enlace /fomo/{slug}/{id}.
      const uniIds = [
        ...new Set(
          [...byId.values()]
            .map((t) => t.university_id)
            .filter((u): u is string => !!u)
        ),
      ];
      const uniById = new Map<string, { slug: string; short_name: string | null; name: string }>();
      if (uniIds.length > 0) {
        const { data: unis } = await supabase
          .from("universities")
          .select("id, slug, short_name, name")
          .in("id", uniIds);
        for (const u of (unis as { id: string; slug: string; short_name: string | null; name: string }[]) ?? []) {
          uniById.set(u.id, u);
        }
      }

      if (cancelled) return;
      // Respetamos el orden de guardado (reciente primero) y descartamos los
      // hilos borrados o inaccesibles.
      setSavedThreads(
        ids.flatMap((id) => {
          const t = byId.get(id);
          if (!t) return [];
          const uni = t.university_id ? uniById.get(t.university_id) : undefined;
          return [
            {
              id: t.id,
              body: t.body,
              media_url: t.media_url,
              media_type: t.media_type,
              is_anonymous: t.is_anonymous,
              created_at: t.created_at,
              saved_at: savedAt.get(id) ?? t.created_at,
              slug: uni?.slug ?? null,
              uniName: uni?.short_name || uni?.name || null,
            },
          ];
        })
      );
    }

    loadSaved();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Quitar una publicación guardada: optimista con reversión si falla.
  const removeSavedThread = async (threadId: string) => {
    if (!user) return;
    const prev = savedThreads;
    setSavedThreads((s) => s.filter((t) => t.id !== threadId));
    const supabase = createClient();
    const { error } = await supabase
      .from("favorites")
      .delete()
      .match({ user_id: user.id, target_type: "fomo_thread", target_id: threadId });
    if (error) setSavedThreads(prev);
  };

  useEffect(() => {
    if (favorites.length === 0) {
      setEnriched([]);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    async function enrich() {
      // Agrupamos los ids por tipo para hacer como mucho una consulta por
      // tipo (con .in) en lugar de una por favorito (N+1 secuencial).
      const idsByType = new Map<FavoriteType, string[]>();
      for (const fav of favorites) {
        if (!isFavoriteType(fav.target_type)) continue;
        const list = idsByType.get(fav.target_type) ?? [];
        list.push(fav.target_id);
        idsByType.set(fav.target_type, list);
      }

      // detailsByKey: "tipo:id" -> detalles del recurso.
      const detailsByKey = new Map<string, FavoriteDetails>();
      await Promise.all(
        [...idsByType.entries()].map(async ([type, ids]) => {
          const source = ENRICH_SOURCES[type];
          const { data } = await supabase
            .from(source.table)
            .select(source.columns)
            .in("id", ids);
          for (const row of (data as unknown as (FavoriteDetails & { id: string })[]) ?? []) {
            detailsByKey.set(`${type}:${row.id}`, row);
          }
        })
      );

      if (cancelled) return;

      // Filtramos los favoritos huerfanos (recurso borrado): sin detalles el
      // enlace quedaria roto (por ejemplo /universidades/ con slug vacio).
      const items: FavoriteItem[] = [];
      for (const fav of favorites) {
        if (!isFavoriteType(fav.target_type)) continue;
        const details = detailsByKey.get(`${fav.target_type}:${fav.target_id}`);
        if (!details) continue;
        items.push({ ...fav, details });
      }
      setEnriched(items);
    }

    enrich();
    return () => {
      cancelled = true;
    };
  }, [favorites]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <div className="mx-auto max-w-4xl space-y-3 px-4 py-20">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <EmptyState
          icon={Heart}
          title="Inicia sesión para ver tus favoritos"
          description="Guarda carreras, becas y universidades para acceder a ellas siempre."
          action={{ href: "/login?next=/favoritos", label: "Iniciar sesión" }}
        />
      </div>
    );
  }

  const typeIcon: Record<string, React.ReactNode> = {
    career: <BookOpen className="h-4 w-4" />,
    university: <Building2 className="h-4 w-4" />,
    accommodation: <Home className="h-4 w-4" />,
    event: <Ticket className="h-4 w-4" />,
    leisure_spot: <MapPin className="h-4 w-4" />,
  };

  const typeLabel: Record<string, string> = {
    career: "Carreras",
    university: "Universidades",
    accommodation: "Alojamiento",
    event: "Eventos",
    leisure_spot: "Ocio",
  };

  const typeHref: Record<string, (id: string, details?: FavoriteDetails) => string> = {
    career: (id) => `/carreras/${id}`,
    university: (_, d) => `/universidades/${d?.slug || ""}`,
    accommodation: (id) => `/alojamiento/${id}`,
    event: (id) => `/eventos/${id}`,
    leisure_spot: (id) => `/ocio/${id}`,
  };

  const grouped = Object.entries(
    enriched.reduce<Record<string, FavoriteItem[]>>((acc, f) => {
      const key = f.target_type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(f);
      return acc;
    }, {})
  );

  return (
    <div className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal>
            <p className="eyebrow text-violet">Guardado</p>
            <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary">
              Mis favoritos
            </h1>
            <p className="mt-3 max-w-xl text-text-muted tabular">
              {enriched.length + savedThreads.length}{" "}
              {enriched.length + savedThreads.length === 1 ? "elemento guardado" : "elementos guardados"}. Carreras,
              universidades, pisos, planes y publicaciones, todo en un sitio.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-8 pb-20 sm:px-6 lg:px-8 lg:py-10">
        <Tabs defaultValue="all">
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="all">
              Todos ({enriched.length + savedThreads.length})
            </TabsTrigger>
            {grouped.map(([type, items]) => (
              <TabsTrigger key={type} value={type}>
                {typeLabel[type] || type} ({items.length})
              </TabsTrigger>
            ))}
            {savedThreads.length > 0 && (
              <TabsTrigger value="fomo_thread">
                Publicaciones ({savedThreads.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="all">
            <FavList
              items={enriched}
              typeIcon={typeIcon}
              typeLabel={typeLabel}
              typeHref={typeHref}
              onRemove={(itemId, type) => {
                if (isFavoriteType(type)) toggleFavorite(itemId, type);
              }}
            />
            {savedThreads.length > 0 && (
              <div className="mt-10">
                <p className="eyebrow mb-4 text-text-muted">Publicaciones guardadas</p>
                <SavedThreadsList items={savedThreads} onRemove={removeSavedThread} />
              </div>
            )}
          </TabsContent>

          {grouped.map(([type, items]) => (
            <TabsContent key={type} value={type}>
              <FavList
                items={items}
                typeIcon={typeIcon}
                typeLabel={typeLabel}
                typeHref={typeHref}
                onRemove={(itemId, t) => {
                  if (isFavoriteType(t)) toggleFavorite(itemId, t);
                }}
              />
            </TabsContent>
          ))}

          {savedThreads.length > 0 && (
            <TabsContent value="fomo_thread">
              <SavedThreadsList items={savedThreads} onRemove={removeSavedThread} />
            </TabsContent>
          )}
        </Tabs>

        {enriched.length === 0 && savedThreads.length === 0 && !loading && (
          <EmptyState
            icon={Heart}
            title="No tienes favoritos aún"
            description="Explora carreras, becas y universidades y guárdalas con el corazón."
            action={{ href: "/becas", label: "Ver becas" }}
            secondaryAction={{ href: "/notas-corte", label: "Ver carreras" }}
            className="mt-6 rounded-3xl border border-dashed border-border"
          />
        )}
      </div>
    </div>
  );
}

function FavList({
  items,
  typeIcon,
  typeLabel,
  typeHref,
  onRemove,
}: {
  items: FavoriteItem[];
  typeIcon: Record<string, React.ReactNode>;
  typeLabel: Record<string, string>;
  typeHref: Record<string, (id: string, details?: FavoriteDetails) => string>;
  onRemove: (itemId: string, type: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.25 }}
          >
            <div className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-bg-secondary">
              <span className="shrink-0 text-text-muted transition-colors group-hover:text-text-primary" aria-hidden="true">
                {typeIcon[item.target_type] || <Heart className="h-4 w-4" />}
              </span>
              <Link
                href={typeHref[item.target_type]?.(item.target_id, item.details) || "#"}
                className="min-w-0 flex-1"
              >
                <h3 className="truncate font-heading text-[15px] font-semibold text-text-primary">
                  {item.details?.name || item.details?.title || `Elemento ${item.target_id.slice(0, 8)}`}
                </h3>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                  <span className="font-medium">{typeLabel[item.target_type] || item.target_type}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular">{new Date(item.created_at).toLocaleDateString("es-ES")}</span>
                </div>
              </Link>
              <ArrowUpRight className="arrow-nudge hidden h-4 w-4 shrink-0 text-text-muted sm:block" aria-hidden="true" />
              <button
                onClick={() => onRemove(item.target_id, item.target_type)}
                aria-label="Quitar de favoritos"
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// Lista de publicaciones del FOMO guardadas, con enlace al hilo
// (/fomo/{slug}/{id}; sin slug resoluble, a la portada del FOMO).
function SavedThreadsList({
  items,
  onRemove,
}: {
  items: SavedThreadItem[];
  onRemove: (threadId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="divide-y divide-border-light overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.25 }}
          >
            <div className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-bg-secondary">
              <span className="shrink-0 text-text-muted transition-colors group-hover:text-text-primary" aria-hidden="true">
                <MessageCircle className="h-4 w-4" />
              </span>
              <Link
                href={item.slug ? `/fomo/${item.slug}/${item.id}` : "/fomo"}
                className="min-w-0 flex-1"
              >
                <h3 className="truncate font-heading text-[15px] font-semibold text-text-primary">
                  {savedThreadTitle(item)}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                  <span className="font-medium">Publicación</span>
                  {item.uniName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{item.uniName}</span>
                    </>
                  )}
                  {item.is_anonymous && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Anónimo</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="tabular">{new Date(item.saved_at).toLocaleDateString("es-ES")}</span>
                </div>
              </Link>
              <ArrowUpRight className="arrow-nudge hidden h-4 w-4 shrink-0 text-text-muted sm:block" aria-hidden="true" />
              <button
                onClick={() => onRemove(item.id)}
                aria-label="Quitar de guardados"
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// reducedMotion vivía en el MotionConfig global de AppProviders; al sacar
// framer-motion del árbol raíz, cada pantalla que lo usa lo declara en local.
export default function FavoritosClient() {
  return (
    <MotionConfig reducedMotion="user">
      <FavoritosClientInner />
    </MotionConfig>
  );
}
