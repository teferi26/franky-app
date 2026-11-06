"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft, Calendar, MapPin, Users, Heart, X, PartyPopper,
  RefreshCw, Loader2, Star, Check, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence, MotionConfig, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { createClient } from "@/lib/supabase-client";
import { MADRID_TZ } from "@/lib/event-time";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EVENT_CATEGORIES, EVENT_CATEGORY_ORDER, eventCategory } from "../components/event-category";

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  city: string;
  venue: string | null;
  start_date: string;
  category: string;
  price: number | null;
  max_capacity: number | null;
  image_url: string | null;
  is_featured: boolean | null;
}

function EventSwipeCard({
  event,
  onLike,
  onPass,
}: {
  event: EventItem;
  onLike: () => void;
  onPass: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const passOpacity = useTransform(x, [-100, 0], [1, 0]);
  const cat = eventCategory(event.category);
  const CatIcon = cat.icon;
  const isFree = !event.price || event.price === 0;
  const start = new Date(event.start_date);
  const dateStr = start.toLocaleDateString("es-ES", {
    timeZone: MADRID_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeStr = start.toLocaleTimeString("es-ES", {
    timeZone: MADRID_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <motion.div
      className="absolute w-full cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={(_, info: PanInfo) => {
        if (info.offset.x > 120) onLike();
        else if (info.offset.x < -120) onPass();
      }}
    >
      <div className="relative overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-card-hover">
        {/* Overlays */}
        {/* Sellos del gesto: rótulos tipográficos, sin emoji */}
        <motion.div
          className="absolute right-6 top-6 z-10 rotate-12 rounded-xl border-2 border-rose-500 px-4 py-1.5 font-heading text-lg font-extrabold uppercase tracking-[0.08em] text-rose-500"
          style={{ opacity: likeOpacity }}
        >
          Guardar
        </motion.div>
        <motion.div
          className="absolute left-6 top-6 z-10 -rotate-12 rounded-xl border-2 border-text-muted px-4 py-1.5 font-heading text-lg font-extrabold uppercase tracking-[0.08em] text-text-muted"
          style={{ opacity: passOpacity }}
        >
          Pasar
        </motion.div>

        {/* Photo */}
        <div className="relative h-64 overflow-hidden bg-bg-secondary">
          {event.image_url ? (
            <Image
              src={event.image_url}
              alt={event.title}
              fill
              className="object-cover"
              sizes="400px"
              unoptimized
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <CatIcon className="h-10 w-10 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {/* Category + featured */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-primary/95 px-2.5 py-1 text-xs font-semibold text-text-primary">
              <CatIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> {cat.label}
            </span>
            {event.is_featured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-primary/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-primary">
                <Star className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" /> Destacado
              </span>
            )}
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <span className="rounded-full bg-bg-primary/95 px-2.5 py-1 text-sm font-semibold tabular text-text-primary shadow-card">
              {isFree ? "Gratis" : `${event.price}€`}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          <h3 className="font-heading text-xl font-bold leading-tight tracking-tight text-text-primary">{event.title}</h3>
          <div className="space-y-1.5 text-sm text-text-secondary">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
              <span className="capitalize">
                {dateStr} · {timeStr}h
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">
                {event.venue ? `${event.venue}, ${event.city}` : event.city}
              </span>
            </div>
            {event.max_capacity && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                <span>Aforo: {event.max_capacity}</span>
              </div>
            )}
          </div>
          {event.description && (
            <p className="text-sm text-text-muted line-clamp-3">{event.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-5 border-t border-border-light p-4">
          <button
            onClick={onPass}
            className="rounded-full border border-border bg-bg-primary p-4 text-text-muted shadow-card transition-[transform,color,box-shadow] duration-200 hover:text-text-primary hover:shadow-card-hover active:scale-95 motion-reduce:active:scale-100"
            aria-label="Pasar"
          >
            <X className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <Link
            href={`/eventos/${event.id}`}
            className="rounded-full border border-border bg-bg-primary p-4 text-text-primary shadow-card transition-[transform,box-shadow] duration-200 hover:shadow-card-hover active:scale-95 motion-reduce:active:scale-100"
            aria-label="Ver detalle"
          >
            <ChevronRight className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <button
            onClick={onLike}
            className="rounded-full border border-border bg-bg-primary p-4 text-rose-500 shadow-card transition-[transform,box-shadow] duration-200 hover:shadow-card-hover active:scale-95 motion-reduce:active:scale-100"
            aria-label="Guardar en favoritos"
          >
            <Heart className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function EventosSwipePageInner() {
  const { user, loading: authLoading } = useAuth();
  const { toggleFavorite, isFavorite } = useFavorites();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [liked, setLiked] = useState<EventItem[]>([]);

  // Filtros básicos en swipe: ciudad + categoría
  const [cities, setCities] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState("");
  const [filterCat, setFilterCat] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id, title, description, city, venue, start_date, category, price, max_capacity, image_url, is_featured")
        .gte("end_date", new Date().toISOString())
        .order("start_date", { ascending: true })
        .limit(200);
      const list = (data as EventItem[]) || [];
      setEvents(list);
      setCities([...new Set(list.map((e) => e.city))].sort());
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filterCity && e.city !== filterCity) return false;
      if (filterCat && e.category !== filterCat) return false;
      return true;
    });
  }, [events, filterCity, filterCat]);

  // Resetear índice al cambiar filtros
  useEffect(() => {
    setCurrent(0);
  }, [filterCity, filterCat]);

  const handleLike = () => {
    const ev = filtered[current];
    if (!ev) return;
    if (user && !isFavorite(ev.id, "event")) {
      toggleFavorite(ev.id, "event");
    }
    setLiked((prev) => [...prev, ev]);
    setCurrent((p) => p + 1);
  };

  const handlePass = () => {
    setCurrent((p) => p + 1);
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-2xl px-4 pt-8 pb-10 sm:px-6">
          <Link
            href="/eventos"
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
            Volver a todos los eventos
          </Link>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-violet">Uno a uno</p>
              <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary">
                Swipe de eventos
              </h1>
              <p className="mt-3 text-text-muted">
                Desliza a la izquierda para pasar y a la derecha para guardarlo en favoritos.
              </p>
            </div>
            <Link href="/favoritos" className={buttonVariants({ variant: "outline" })}>
              <Heart className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Mis favoritos
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 pt-8 pb-20 sm:px-6">
        {/* Filtros: chips hairline en una fila */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <select
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            aria-label="Filtrar eventos por ciudad"
            className="h-9 rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary transition-colors duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15"
          >
            <option value="">Todas las ciudades</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={() => setFilterCat("")}
            aria-pressed={!filterCat}
            className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors duration-200 ${
              !filterCat
                ? "border-violet bg-violet-50/70 text-violet-deep"
                : "border-border text-text-secondary hover:border-text-primary/25"
            }`}
          >
            Todo
          </button>
          {EVENT_CATEGORY_ORDER.map((k) => {
            const c = EVENT_CATEGORIES[k];
            const Icon = c.icon;
            return (
              <button
                key={k}
                onClick={() => setFilterCat(filterCat === k ? "" : k)}
                aria-pressed={filterCat === k}
                title={c.label}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-200 ${
                  filterCat === k
                    ? "border-violet bg-violet-50/70 text-violet-deep"
                    : "border-border text-text-secondary hover:border-text-primary/25"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{c.label}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="Sin eventos que coincidan"
            description="Cambia los filtros o explora la agenda completa de tu ciudad."
            action={{ href: "/eventos", label: "Ver todos los eventos" }}
          />
        ) : current < filtered.length ? (
          <div>
            <p className="mb-4 text-center text-xs text-text-muted tabular">
              {liked.length} guardado{liked.length !== 1 ? "s" : ""} · {current + 1}/{filtered.length}
            </p>
            <div className="relative min-h-[580px]">
              <AnimatePresence>
                <EventSwipeCard
                  key={filtered[current].id}
                  event={filtered[current]}
                  onLike={handleLike}
                  onPass={handlePass}
                />
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <PartyPopper className="mx-auto h-7 w-7 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
            <h3 className="mt-4 font-heading text-lg font-bold text-text-primary">Has visto todos</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
              {liked.length > 0
                ? `Has guardado ${liked.length} evento${liked.length !== 1 ? "s" : ""} en favoritos.`
                : "No has guardado ninguno esta ronda."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => { setCurrent(0); setLiked([]); }}>
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Empezar de nuevo
              </Button>
              {user && liked.length > 0 && (
                <Button asChild variant="dark">
                  <Link href="/favoritos"><Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Ver favoritos</Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// reducedMotion vivía en el MotionConfig global de AppProviders; al sacar
// framer-motion del árbol raíz, cada pantalla que lo usa lo declara en local.
export default function EventosSwipePage() {
  return (
    <MotionConfig reducedMotion="user">
      <EventosSwipePageInner />
    </MotionConfig>
  );
}
