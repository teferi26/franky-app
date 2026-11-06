"use client";

import { useState, useMemo, useEffect } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { MapPin, Star, Map, LayoutGrid, Search, SlidersHorizontal, ChevronDown, ChevronUp, ArrowUpRight, GraduationCap, BadgeCheck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Reveal, RevealItem, SpotlightCard } from "@/components/motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { foldSearch, leisureQuery, readLeisureFilters } from "@/lib/discovery-filters";
import LeisureImage, { leisureCategoryIcon } from "@/app/ocio/leisure-image";
import { LEISURE_FEATURE_LABELS, LEISURE_FILTER_KEYS } from "@/app/ocio/leisure-features";

const LeisureMap = dynamic(() => import("@/components/LeisureMap"), {
  ssr: false,
  loading: () => (
    <div className="skeleton-shimmer flex h-[400px] w-full items-center justify-center rounded-3xl border border-border bg-bg-secondary lg:h-[500px]">
      <Map className="h-8 w-8 text-text-muted/50" strokeWidth={1.5} aria-hidden="true" />
    </div>
  ),
});

interface LeisureSpot {
  id: string;
  name: string;
  city: string;
  category: string;
  description?: string | null;
  tagline: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  price_range: number | null;
  rating: number | null;
  image_url: string | null;
  tags: string[] | null;
  university_ids: string[] | null;
  /** Local dado de alta (y pagado) por su dueño, no del catálogo curado. */
  sponsored?: boolean;
  /** Solo las características que el sitio TIENE (ver leisure-features.ts). */
  features?: string[];
}

interface UniOption {
  id: string;
  name: string;
  city: string;
}

const categoryLabels: Record<string, string> = {
  bar: "Bares y Tapas",
  restaurante: "Restaurantes",
  cafeteria: "Cafeterías",
  discoteca: "Discotecas",
  parque: "Parques y Aire Libre",
  cultural: "Cultura y Museos",
  deportivo: "Deportes",
  coworking: "Coworking y Estudio",
  pub: "Pubs",
};

/** Chip de filtro (v3): contorno hairline en reposo, casi negro cuando está activo. */
function Chip({
  active,
  onClick,
  children,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children">) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium",
        "transition-[color,background-color,border-color] duration-200 ease-[var(--ease-out-quart)] cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/30",
        active
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:text-text-primary"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const selectClass =
  "h-10 w-full min-w-0 rounded-xl border border-border bg-bg-primary px-3 text-sm text-text-primary transition-colors hover:border-text-primary/30 focus:outline-none focus:ring-2 focus:ring-violet/30";

const priceLabels = ["Gratis", "€", "€€", "€€€", "€€€€"];

type SortOption = "destacados" | "rating" | "price-asc" | "price-desc" | "name";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "destacados", label: "Destacados" },
  { value: "rating", label: "Mejor valoración" },
  { value: "price-asc", label: "Precio: menor a mayor" },
  { value: "price-desc", label: "Precio: mayor a menor" },
  { value: "name", label: "Nombre A-Z" },
];

const DEFAULT_SORT: SortOption = "destacados";

export default function LeisureExplorer({
  spots,
  cities,
  universities = [],
  initialQuery = "",
}: {
  spots: LeisureSpot[];
  cities: string[];
  universities?: UniOption[];
  initialQuery?: string;
}) {
  const router = useRouter();
  const initial = readLeisureFilters(new URLSearchParams(initialQuery));
  const [selectedCity, setSelectedCity] = useState(initial.city);
  const [selectedCategory, setSelectedCategory] = useState(initial.category);
  const [selectedUni, setSelectedUni] = useState(initial.university);
  const [searchQuery, setSearchQuery] = useState(initial.query);
  const [viewMode, setViewMode] = useState<"grid" | "map">(initial.view as "grid" | "map");
  const [visibleCount, setVisibleCount] = useState(30);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [priceFilter, setPriceFilter] = useState<number[]>(initial.prices);
  const [minRating, setMinRating] = useState<number>(initial.rating);
  const [featureFilter, setFeatureFilter] = useState<string[]>(initial.features);
  const [sortBy, setSortBy] = useState<SortOption>(initial.sort as SortOption);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(30);
  }, [selectedCity, selectedCategory, selectedUni, searchQuery, priceFilter, minRating, featureFilter, sortBy]);

  const filteredSpots = useMemo(() => {
    const result = spots.filter((spot) => {
      if (selectedUni && !(spot.university_ids || []).includes(selectedUni)) return false;
      if (selectedCity && spot.city !== selectedCity) return false;
      if (selectedCategory && spot.category !== selectedCategory) return false;
      if (priceFilter.length > 0 && (spot.price_range == null || !priceFilter.includes(spot.price_range))) return false;
      if (minRating > 0 && (!spot.rating || spot.rating < minRating)) return false;
      // Todas las características marcadas tienen que cumplirse (Y, no O).
      if (featureFilter.length > 0) {
        const has = spot.features || [];
        if (!featureFilter.every((f) => has.includes(f))) return false;
      }
      if (searchQuery) {
        return foldSearch([spot.name, spot.city, spot.address, spot.tagline, spot.description, ...(spot.tags ?? [])].join(" ")).includes(foldSearch(searchQuery));
      }
      return true;
    });

    // Orden. "Destacados" (por defecto) pone delante los locales que pagan su
    // ficha: acaban de darse de alta, su valoración es 0 y ordenando solo por
    // rating quedaban SIEMPRE los últimos, es decir, invisibles.
    result.sort((a, b) => {
      switch (sortBy) {
        case "destacados": {
          const sa = a.sponsored ? 1 : 0;
          const sb = b.sponsored ? 1 : 0;
          if (sa !== sb) return sb - sa;
          const ra = a.rating || 0;
          const rb = b.rating || 0;
          if (ra !== rb) return rb - ra;
          return a.name.localeCompare(b.name, "es");
        }
        case "rating":
          return (b.rating || 0) - (a.rating || 0);
        case "price-asc":
          return (a.price_range ?? 99) - (b.price_range ?? 99);
        case "price-desc":
          return (b.price_range ?? -1) - (a.price_range ?? -1);
        case "name":
          return a.name.localeCompare(b.name, "es");
        default:
          return 0;
      }
    });

    return result;
  }, [spots, selectedUni, selectedCity, selectedCategory, searchQuery, priceFilter, minRating, featureFilter, sortBy]);

  const visibleSpots = useMemo(
    () => filteredSpots.slice(0, visibleCount),
    [filteredSpots, visibleCount]
  );

  const categoryCounts = useMemo(() => {
    const scoped = spots.filter((s) => {
      if (selectedUni && !(s.university_ids || []).includes(selectedUni)) return false;
      if (selectedCity && s.city !== selectedCity) return false;
      return true;
    });
    const counts: Record<string, number> = {};
    for (const s of scoped) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, [spots, selectedUni, selectedCity]);

  const totalScoped = useMemo(() => {
    if (!selectedUni && !selectedCity) return spots.length;
    return spots.filter((s) => {
      if (selectedUni && !(s.university_ids || []).includes(selectedUni)) return false;
      if (selectedCity && s.city !== selectedCity) return false;
      return true;
    }).length;
  }, [spots, selectedUni, selectedCity]);

  const selectedUniName = useMemo(
    () => universities.find((u) => u.id === selectedUni)?.name || "",
    [universities, selectedUni]
  );

  const queryString = leisureQuery({ city: selectedCity, category: selectedCategory, university: selectedUni, query: searchQuery, prices: priceFilter, rating: minRating, features: featureFilter, sort: sortBy, view: viewMode });
  const detailUrl = (id: string) => `/ocio/${id}?desde=${encodeURIComponent(`/ocio${queryString ? `?${queryString}` : ""}`)}`;
  const handleSpotClick = (id: string) => router.push(detailUrl(id));
  useEffect(() => {
    const timer = setTimeout(() => window.history.replaceState(window.history.state, "", `/ocio${queryString ? `?${queryString}` : ""}`), 200);
    return () => clearTimeout(timer);
  }, [queryString]);
  useEffect(() => {
    const restore = () => {
      const f = readLeisureFilters(new URLSearchParams(window.location.search));
      setSelectedCity(f.city); setSelectedCategory(f.category); setSelectedUni(f.university); setSearchQuery(f.query);
      setPriceFilter(f.prices); setMinRating(f.rating); setFeatureFilter(f.features); setSortBy(f.sort as SortOption); setViewMode(f.view as "grid" | "map");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const togglePrice = (p: number) => {
    setPriceFilter((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const toggleFeature = (key: string) => {
    setFeatureFilter((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  // Solo se ofrecen los filtros de características que algún sitio cumple:
  // una casilla que siempre deja la lista vacía es peor que no tenerla.
  const availableFeatures = useMemo(() => {
    const present = new Set<string>();
    for (const s of spots) for (const f of s.features || []) present.add(f);
    return LEISURE_FILTER_KEYS.filter((k) => present.has(k));
  }, [spots]);

  const advancedCount =
    priceFilter.length + featureFilter.length + (minRating > 0 ? 1 : 0) + (sortBy !== DEFAULT_SORT ? 1 : 0);

  const clearAll = () => {
    setSelectedCity("");
    setSelectedCategory("");
    setSelectedUni("");
    setSearchQuery("");
    setPriceFilter([]);
    setMinRating(0);
    setFeatureFilter([]);
    setSortBy(DEFAULT_SORT);
  };

  const hasFilters = !!(selectedCity || selectedCategory || selectedUni || searchQuery || priceFilter.length || minRating || featureFilter.length || sortBy !== DEFAULT_SORT);

  return (
    <>
      {/* Filtros: buscador y selectores en una fila, categorías en chips */}
      <div className="mb-8 flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.4fr)_minmax(180px,1fr)_minmax(160px,1fr)_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
            <Input
              aria-label="Buscar un sitio, una zona o un plan"
              maxLength={120}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, zona o etiqueta"
              className="pl-10"
            />
          </div>
          {universities.length > 0 && (
            <div className="relative min-w-0">
              <GraduationCap className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
              <select
                aria-label="Universidad"
                value={selectedUni}
                onChange={(e) => setSelectedUni(e.target.value)}
                className={cn(selectClass, "pl-10", selectedUni && "border-text-primary font-semibold")}
                title="Filtra los sitios más cercanos a una universidad"
              >
                <option value="">Cerca de mi universidad</option>
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.city}
                  </option>
                ))}
              </select>
            </div>
          )}
          <select
            aria-label="Ciudad"
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className={selectClass}
          >
            <option value="">Todas las ciudades</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {/* Lista / Mapa: segmento neutro, la activa en blanco */}
          <div className="inline-flex h-10 shrink-0 items-center gap-1 self-start rounded-xl bg-bg-secondary p-1">
            {([
              { key: "grid", label: "Lista", Icon: LayoutGrid },
              { key: "map", label: "Mapa", Icon: Map },
            ] as const).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={viewMode === key}
                onClick={() => setViewMode(key)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 cursor-pointer",
                  viewMode === key
                    ? "bg-bg-primary font-semibold text-text-primary shadow-[0_1px_2px_rgba(18,16,25,0.08),0_0_0_1px_rgba(18,16,25,0.04)]"
                    : "text-text-muted hover:text-text-primary"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Categorías */}
        <div className="flex flex-wrap gap-2">
          <Chip active={!selectedCategory} onClick={() => setSelectedCategory("")}>
            Todos <span className="text-text-muted tabular">{totalScoped}</span>
          </Chip>
          {Object.entries(categoryLabels).map(([key, label]) => {
            const count = categoryCounts[key] || 0;
            if (count === 0) return null;
            const Icon = leisureCategoryIcon(key);
            const active = selectedCategory === key;
            return (
              <Chip key={key} active={active} onClick={() => setSelectedCategory(active ? "" : key)}>
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                {label}
                <span className={cn("tabular", active ? "text-bg-primary/70" : "text-text-muted")}>{count}</span>
              </Chip>
            );
          })}
        </div>

        {/* Más filtros */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Más filtros
            {advancedCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-text-primary px-1.5 text-[11px] font-semibold text-bg-primary tabular">
                {advancedCount}
              </span>
            )}
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> Limpiar filtros
            </button>
          )}
        </div>

        {showAdvanced && (
          <div className="space-y-5 border-t border-border-light pt-5 animate-fade-in">
            <div>
              <p className="eyebrow mb-2.5 text-text-muted">Precio</p>
              <div className="flex flex-wrap gap-2">
                {priceLabels.map((label, i) => (
                  <Chip key={i} active={priceFilter.includes(i)} onClick={() => togglePrice(i)}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Características (lo que marca cada local en su alta) */}
            {availableFeatures.length > 0 && (
              <div>
                <p className="eyebrow mb-2.5 text-text-muted">Características</p>
                <div className="flex flex-wrap gap-2">
                  {availableFeatures.map((key) => (
                    <Chip key={key} active={featureFilter.includes(key)} onClick={() => toggleFeature(key)}>
                      {LEISURE_FEATURE_LABELS[key] ?? key}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="eyebrow mb-2.5 text-text-muted">Valoración mínima</p>
              <div className="flex flex-wrap gap-2">
                {[0, 3, 3.5, 4, 4.5].map((r) => (
                  <Chip key={r} active={minRating === r} onClick={() => setMinRating(r)}>
                    {r === 0 ? "Todos" : (
                      <>
                        <Star className="h-3 w-3 fill-current" strokeWidth={1.75} aria-hidden="true" />
                        <span className="tabular">{r}+</span>
                      </>
                    )}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <p className="eyebrow mb-2.5 text-text-muted">Ordenar por</p>
              <div className="flex flex-wrap gap-2">
                {SORT_OPTIONS.map((opt) => (
                  <Chip key={opt.value} active={sortBy === opt.value} onClick={() => setSortBy(opt.value)}>
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Universidad seleccionada */}
      {selectedUni && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-bg-secondary/60 px-4 py-2.5 text-sm">
          <GraduationCap className="h-4 w-4 shrink-0 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
          <span className="text-text-secondary">
            Mostrando los sitios más cercanos a{" "}
            <span className="font-semibold text-text-primary">{selectedUniName}</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedUni("")}
            className="ml-auto text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            Quitar
          </button>
        </div>
      )}

      {/* Recuento */}
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-t border-border-light pt-5">
        <p role="status" className="text-sm text-text-muted tabular">
          <span className="font-semibold text-text-primary">{filteredSpots.length}</span> sitios encontrados
          {!selectedUni && selectedCity && ` en ${selectedCity}`}
          {selectedCategory && ` · ${categoryLabels[selectedCategory]}`}
        </p>
        {sortBy === "destacados" && (
          <p className="text-xs text-text-muted">Los locales colaboradores aparecen primero y se identifican como publicidad.</p>
        )}
      </div>

      {/* Mapa */}
      {viewMode === "map" && (
        <div className="mb-8">
          <LeisureMap spots={filteredSpots} onSpotClick={handleSpotClick} />
        </div>
      )}

      {/* Rejilla de tarjetas compactas con foto */}
      {viewMode === "grid" && (filteredSpots.length > 0 ? (
        <Reveal stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleSpots.map((spot, i) => {
            const CatIcon = leisureCategoryIcon(spot.category);
            return (
              <RevealItem key={spot.id} index={i} asChild>
                <SpotlightCard asChild>
                  <Link
                    id={`spot-${spot.id}`}
                    href={detailUrl(spot.id)}
                    className="group hover-lift flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2"
                  >
                    <div className="img-zoom relative aspect-[16/10] bg-bg-secondary">
                      <LeisureImage
                        src={spot.image_url}
                        alt={spot.name}
                        category={spot.category}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="absolute inset-0 h-full w-full"
                      />
                      <div className="absolute right-3 top-3 flex items-center gap-1.5">
                        {spot.rating ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-bg-primary/95 px-2 py-1 text-[11px] font-semibold text-text-primary shadow-card tabular">
                            <Star className="h-3 w-3 fill-current text-warning" strokeWidth={1.75} aria-hidden="true" />
                            {spot.rating}
                          </span>
                        ) : spot.sponsored ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-text-primary px-2 py-1 text-[10px] font-semibold text-bg-primary">
                            <BadgeCheck className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            Local colaborador
                          </span>
                        ) : null}
                      </div>
                      {/* Tramo de precio: solo si hay uno real */}
                      {typeof spot.price_range === "number" && (
                        <span className={cn(
                          "absolute bottom-3 left-3 rounded-full px-2 py-1 text-[11px] font-semibold shadow-card tabular",
                          spot.price_range === 0 ? "bg-bg-primary/95 text-success" : "bg-bg-primary/95 text-text-primary"
                        )}>
                          {priceLabels[spot.price_range]}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-violet">
                        <CatIcon className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                        {categoryLabels[spot.category] || spot.category}
                      </p>
                      <h3 className="mt-1.5 line-clamp-1 font-heading text-[15px] font-bold text-text-primary transition-colors duration-200 group-hover:text-violet">
                        {spot.name}
                      </h3>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                        <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                        <span className="truncate">{spot.city}</span>
                      </p>
                      {(spot.tagline || spot.description) && (
                        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-text-secondary">
                          {spot.tagline || spot.description}
                        </p>
                      )}
                      {/* Etiquetas y lo que el local ofrece de verdad: sin esto, un
                          bar con wifi, terraza y descuento de estudiantes se veía
                          igual que uno vacío. */}
                      {((spot.tags && spot.tags.length > 0) || (spot.features && spot.features.length > 0)) && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {(spot.tags ?? []).slice(0, 2).map((tag: string) => (
                            <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                              {tag}
                            </span>
                          ))}
                          {(spot.features ?? []).slice(0, 3).map((f) => (
                            <span key={f} className="rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                              {LEISURE_FEATURE_LABELS[f] ?? f}
                            </span>
                          ))}
                          {(spot.features?.length ?? 0) > 3 && (
                            <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] font-medium text-text-muted tabular">
                              +{(spot.features?.length ?? 0) - 3}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-light pt-3 text-[13px]">
                        {spot.sponsored ? (
                          <span className="text-xs font-medium text-text-muted">Publicidad · Local colaborador</span>
                        ) : (
                          <span className="text-xs text-text-muted">Descubrir el sitio</span>
                        )}
                        <ArrowUpRight className="arrow-nudge h-4 w-4 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                      </div>
                    </div>
                  </Link>
                </SpotlightCard>
              </RevealItem>
            );
          })}
        </Reveal>
      ) : (
        /* Vacío del sistema (misma ilustración que el resto de listados), con
           el botón de quitar filtros como acción principal. */
        <EmptyState
          icon={MapPin}
          title="Ningún sitio coincide"
          description="Nada encaja con los filtros que tienes puestos. Quítalos y verás todas las zonas de ocio de la ciudad."
          action={{ onClick: clearAll, label: "Quitar los filtros" }}
        />
      ))}

      {/* Cargar más */}
      {viewMode === "grid" && visibleCount < filteredSpots.length && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((v) => v + 30)}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Cargar más <span className="text-text-muted tabular">({filteredSpots.length - visibleCount} restantes)</span>
          </button>
        </div>
      )}
    </>
  );
}
