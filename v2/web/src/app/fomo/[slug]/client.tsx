"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, MessagesSquare, PenSquare, Flame, EyeOff, Flag, Search, X, MessageCircle, CalendarDays, CircleHelp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Reveal } from "@/components/motion";
import { createClient } from "@/lib/supabase-client";
import { withAccountScope, useAccountGuard } from "@/components/AccountScope";
import { usePagedFeed } from "@/hooks/usePagedFeed";
import StoriesBar from "@/components/StoriesBar";
import PartyCampusBanner from '@/components/social/PartyCampusBanner';
import FomoThreadCard from "../FomoThreadCard";
import FomoComposer from "../FomoComposer";
import type { FomoThread } from "../types";
import { useSocialModerationRefresh } from '@/lib/social-moderation-client';

const PAGE = 20;
type FomoSort = "recent" | "oldest" | "top";
const SORT_OPTIONS: { value: FomoSort; label: string }[] = [{value:"recent",label:"Recientes"},{value:"oldest",label:"Antiguos"},{value:"top",label:"Top"}];
const prompts = [
  { label: "Algo que contar", text: "Hoy en el campus… ", Icon: MessageCircle },
  { label: "Busco plan", text: "¿Quién se apunta a…? ", Icon: CalendarDays },
  { label: "Una pregunta", text: "Gente de la uni, ¿alguien sabe…? ", Icon: CircleHelp },
];

function FomoFeedClient({ universityId, universityName, universitySlug, embedded = false }: {
  universityId: string; universityName: string; universitySlug: string; embedded?: boolean;
}) {
  const supabase = createClient();
  const { owner, isCurrent } = useAccountGuard();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<FomoSort>("recent");
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchPage = useCallback(async (offset: number) => {
    if (!isCurrent()) return [];
    const { data, error } = await supabase.rpc("get_fomo_feed", {
      p_university_id: universityId, p_limit: PAGE, p_offset: offset,
      p_search: search || null, p_sort: sort,
    });
    if (!isCurrent()) return [];
    if (error) throw error;
    return (data ?? []) as FomoThread[];
  }, [supabase, universityId, search, sort, isCurrent]);
  const { items: threads, loading, loadingMore, hasMore, error, moreError, loadMore, reload } = usePagedFeed(fetchPage, PAGE);
  useSocialModerationRefresh(reload);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || loading || moreError) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) void loadMore();
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loadMore, loading, moreError]);

  const startPost = (text = "") => { setDraft(text); setComposing(true); };
  return (
    <div className={embedded ? "" : "min-h-screen bg-bg-primary"}>
      {/* Cabecera propia: solo cuando el feed es la página entera. Incrustado
          en la home ya hay navegación arriba y el back no tendría sentido.
          Tipográfica (v3): rótulo, nombre de la universidad grande y una
          frase; sin barra pegajosa ni icono en cuadrado. */}
      {!embedded && (
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Reveal>
            <Link
              href={`/universidades/${universitySlug}`}
              className="group inline-flex items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
              Ficha de la universidad
            </Link>
            <p className="eyebrow mt-5 flex items-center gap-2">
              <Flame className="h-3.5 w-3.5 text-violet" aria-hidden="true" />
              FOMO
            </p>
            <h1 className="mt-2 text-fluid-h2 font-extrabold text-text-primary">
              {universityName}
            </h1>
            <p className="mt-2 text-text-muted">Lo que se cuece en tu uni, en directo.</p>
          </Reveal>
        </div>
      </section>
      )}

      <div className={embedded
        ? ""
        : "mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-10 lg:px-8"}>
        <div className={embedded ? "w-full min-w-0" : "mx-auto w-full max-w-2xl"}>
        {/* Stories del campus (24 h): solo aparece si hay stories vivas */}
        <PartyCampusBanner universityId={universityId} />
        <StoriesBar universityId={universityId} />

        {/* Composer */}
        {composing ? (
          <div className="mb-5 animate-scale-in">
            <FomoComposer
              mode="thread"
              universityId={universityId}
              autoFocus
              onCreated={() => { setComposing(false); reload(); }}
              onCancel={() => setComposing(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="hover-lift mb-5 flex w-full items-center gap-3 rounded-2xl border border-border bg-bg-primary px-5 py-4 text-left text-[15px] text-text-muted shadow-card hover:border-text-primary/15"
          >
            <PenSquare className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
            ¿Qué se cuece en {universityName}?
          </button>
        )}

        {/* Buscar + ordenar: SOLO en la página completa del FOMO.
            Incrustado en la home era una fila más de mandos encima del feed,
            en una página que ya tenía dos columnas de datos a los lados: quien
            entra en la portada viene a leer lo último, no a filtrar. Para
            buscar y ordenar está el enlace del final, que lleva al FOMO
            entero. */}
        {!embedded && (
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar en FOMO"
              aria-label="Buscar en FOMO"
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
          <Tabs value={sort} onValueChange={(v) => setSort(v as FomoSort)}>
            <TabsList aria-label="Ordenar" className="w-full sm:w-auto">
              {SORT_OPTIONS.map((o) => (
                <TabsTrigger key={o.value} value={o.value} className="flex-1 px-3 text-xs sm:flex-none">
                  {o.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        )}

        {loading && (
          <div className="flex justify-center py-20 text-text-muted">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <span className="flex-1">{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={reload}>Reintentar</Button>
          </div>
        )}

        {!loading && !error && threads.length === 0 && (
          /* Vacío del sistema. Con búsqueda la salida es limpiarla; sin
             ella, escribir el primer hilo, que es lo que arranca un campus. */
          <EmptyState
            icon={MessagesSquare}
            compact
            title={search ? `Sin resultados para “${search}”` : "Todavía no hay nada por aquí"}
            description={
              search
                ? "Ningún hilo menciona eso. Prueba con otras palabras o borra la búsqueda."
                : `Sé quien cuente primero lo que pasa en ${universityName}. Lo lee toda tu universidad.`
            }
            action={search ? { onClick: () => setSearchInput(""), label: "Borrar la búsqueda" } : { onClick: () => startPost(), label: "Escribir una publicación" }}
          />
        )}

        {!loading && !error && threads.length > 0 && (
          <div className="space-y-3">
            {threads.map((t, i) => (
              <div key={t.id} className="animate-list-in" style={{ ["--i" as string]: i % PAGE } as CSSProperties}>
                <FomoThreadCard thread={t} slug={universitySlug} />
              </div>
            ))}
          </div>
        )}

        <div ref={sentinel} className="h-px" />
        {loadingMore && (
          <div className="flex justify-center py-6 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!loadingMore && moreError && <div role="alert" className="py-4 text-center text-sm text-text-muted">No se ha podido cargar el resto. <button type="button" onClick={loadMore} className="link-underline font-semibold text-text-primary">Reintentar</button></div>}
        {!loading && !error && hasMore && !loadingMore && !moreError && (
          <Button type="button" variant="outline" onClick={loadMore} className="mt-5 w-full">Cargar más</Button>
        )}

        {/* Salida al FOMO completo (con su buscador y su orden), para no
            perderlos al haberlos quitado de la portada. */}
        {embedded && !loading && !error && threads.length > 0 && (
          <div className="pt-4 text-center">
            <Link
              href={`/fomo/${universitySlug}`}
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary"
            >
              <span className="link-underline">Ver todo el FOMO de {universityName}</span>
              <ArrowRight className="h-4 w-4 arrow-nudge text-violet" aria-hidden="true" />
            </Link>
          </div>
        )}
        </div>

        {/* Barra lateral (solo escritorio y solo como página completa: en la
            home ya hay columnas propias y esta se montaba encima). Texto
            suelto separado por líneas, sin tarjetas apiladas. */}
        <aside className={embedded ? "hidden" : "sticky top-24 mt-8 hidden lg:mt-0 lg:block"}>
          <Reveal delay={150} className="divide-y divide-border-light">
            <div className="pb-6">
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-text-primary">
                <Flame className="h-4 w-4 text-violet" aria-hidden="true" /> ¿Qué es FOMO?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                El muro anónimo y en directo de {universityName}. Cuenta lo que se
                cuece, comenta y vota. Tú decides si lo firmas o vas de incógnito.
              </p>
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-text-muted">
                <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Si publicas en anónimo, tu nombre no aparece en la publicación.
              </p>
            </div>

            <div className="pt-6">
              <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-text-primary">
                <Flag className="h-4 w-4 text-violet" aria-hidden="true" /> Buen rollo
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                Nada de odio ni acoso. Si algo se pasa de la raya, repórtalo: tras
                varios reportes se oculta solo.
              </p>
            </div>
          </Reveal>
        </aside>
      </div>
    </div>
  );
}

export default withAccountScope(FomoFeedClient);
