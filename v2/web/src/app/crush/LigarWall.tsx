"use client";

import { useCallback, useEffect, useRef, useState, useMemo, type CSSProperties } from "react";
import { usePagedFeed } from "@/hooks/usePagedFeed";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, Heart, PenSquare, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase-client";
import { useAccountGuard } from "@/components/AccountScope";
import LigarComposer from "./LigarComposer";
import LigarPostCard from "./LigarPostCard";
import type { LigarPost } from "./types";
import { useSocialModerationRefresh } from '@/lib/social-moderation-client';

const PAGE = 20;

type LigarSort = "recent" | "oldest" | "top";
const SORT_OPTIONS: { value: LigarSort; label: string }[] = [
  { value: "recent", label: "Recientes" },
  { value: "oldest", label: "Antiguos" },
  { value: "top", label: "Top" },
];

export default function LigarWall() {
  const supabase = useMemo(() => createClient(), []);
  const { owner, isCurrent } = useAccountGuard();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced
  const [sort, setSort] = useState<LigarSort>("recent");
  const [universityName, setUniversityName] = useState("tu universidad");
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Nombre de la universidad del usuario (para la tarjeta de Instagram)
  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active || !isCurrent() || user?.id !== owner) return;
      const { data } = await supabase
        .from("profiles")
        .select("universities(name)")
        .eq("id", user.id)
        .maybeSingle();
      const rel = (data as { universities?: { name?: string | null } | { name?: string | null }[] } | null)
        ?.universities;
      const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
      if (active && isCurrent() && name) setUniversityName(name);
    })();
    return () => {
      active = false;
    };
  }, [supabase, owner, isCurrent]);

  // Debounce de la búsqueda
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const fetchPage = useCallback(
    async (offset: number) => {
      if (!isCurrent()) return [];
      const { data, error: e } = await supabase.rpc("get_ligar_feed", {
        p_limit: PAGE,
        p_offset: offset,
        p_search: search || null,
        p_sort: sort,
      });
      if (!isCurrent()) return [];
      if (e) throw e;
      return (data as LigarPost[]) ?? [];
    },
    [supabase, search, sort, isCurrent]
  );

  const { items: posts, loading, loadingMore, hasMore, error, moreError: loadMoreError, loadMore, reload: refresh } = usePagedFeed(fetchPage, PAGE);
  const reload = useCallback(() => { setComposing(false); refresh(); }, [refresh]);
  useSocialModerationRefresh(refresh);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || loading || loadingMore || loadMoreError || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, loading, loadingMore, loadMoreError, hasMore]);

  const onDeleted = useCallback(() => refresh(), [refresh]);

  return (
    <div>
      {composing ? (
        <div className="mb-4 animate-scale-in">
          <LigarComposer onCreated={reload} onCancel={() => setComposing(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="hover-lift mb-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-bg-primary px-5 py-4 text-left text-[15px] text-text-muted shadow-card hover:border-text-primary/15"
        >
          <PenSquare className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
          ¿Quién te ha gustado hoy?
        </button>
      )}

      {/* Buscar + ordenar */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar en el muro"
            aria-label="Buscar en el muro"
            className="pl-10 pr-10"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-primary"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Tabs value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <TabsList aria-label="Ordenar" className="w-full sm:w-auto">
            {SORT_OPTIONS.map((o) => (
              <TabsTrigger key={o.value} value={o.value} className="flex-1 px-3 text-xs sm:flex-none">
                {o.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading && (
        <div
          role="status"
          className="flex justify-center py-16 text-text-muted"
        >
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="sr-only">Cargando el muro</span>
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          No se pudo cargar el tablón. Tus publicaciones siguen guardadas.
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            Reintentar
          </Button>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        /* Vacío del sistema, en magenta porque Crush es magenta en toda la
           app. Un muro vacío es la mejor ocasión para pedir la primera
           publicación, así que el CTA lleva al compositor. */
        <div aria-live="polite">
          <EmptyState
            icon={Heart}
            tone="fuchsia"
            compact
            title={search ? `Sin resultados para “${search}”` : "Alguien tiene que romper el hielo"}
            description={
              search
                ? "Ninguna publicación menciona eso. Prueba con otras palabras o borra la búsqueda."
                : "Preséntate, cuenta tu plan perfecto o deja ese hola que te faltó decir entre clases."
            }
            action={
              search
                ? { onClick: () => setSearchInput(""), label: "Borrar la búsqueda" }
                : { onClick: () => { setDraft(""); setComposing(true); }, label: "Escribir mi primer hola" }
            }
          />
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <ul className="space-y-3">
          {posts.map((p, i) => (
            <li key={p.id} className="animate-list-in" style={{ ["--i" as string]: i % 20 } as CSSProperties}>
              <LigarPostCard
                post={p}
                onDeleted={onDeleted}
                universityName={universityName}
              />
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && hasMore && !loadMoreError && <Button type="button" variant="outline" disabled={loadingMore} onClick={loadMore} className="my-5 w-full">{loadingMore ? "Cargando…" : "Ver más publicaciones"}</Button>}
      <div ref={sentinel} className="h-px" />
      {loadingMore && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando más publicaciones
        </div>
      )}
      {!loadingMore && loadMoreError && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm text-text-muted" role="alert">
            No se pudieron cargar más publicaciones.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={loadMore}>
            Reintentar
          </Button>
        </div>
      )}
    </div>
  );
}
