"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { useState, useCallback, useEffect, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Chips de tipo (Todas / Públicas / Privadas): el filtro más usado va a la
// vista, en botones outline; los desplegables largos siguen siendo selects.
const TIPOS = [
  { value: "", label: "Todas" },
  { value: "publica", label: "Públicas" },
  { value: "privada", label: "Privadas" },
];

const selectClass =
  "h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-sm text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15 sm:w-auto sm:min-w-44";

export default function UniversityFilters({
  comunidades,
  ciudades,
}: {
  comunidades: string[];
  ciudades: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(currentQuery);
  const [pending, startTransition] = useTransition();
  useEffect(() => setQuery(currentQuery), [currentQuery]);

  const updateFilters = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("pagina");
      params.delete("page");
      if (key === "comunidad") params.delete("ciudad");
      startTransition(() => router.push(`/universidades?${params.toString()}`, { scroll: false }));
    },
    [router, searchParams]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters("q", query.trim());
  };

  const clearFilters = () => {
    setQuery("");
    startTransition(() => router.push("/universidades", { scroll: false }));
  };

  const hasFilters =
    searchParams.has("tipo") ||
    searchParams.has("comunidad") ||
    searchParams.has("ciudad") ||
    searchParams.has("q");
  const tipo = searchParams.get("tipo") || "";

  return (
    <div aria-busy={pending} className="mt-8 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Buscador */}
        <form onSubmit={handleSearch} role="search" className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar universidad…"
            aria-label="Buscar universidad"
            className="pl-10 pr-24"
          />
          <button
            type="submit"
            disabled={pending}
            className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-text-primary px-3 text-xs font-semibold text-bg-primary transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Buscar
          </button>
        </form>

        {/* Comunidad */}
        <select
          value={searchParams.get("comunidad") || ""}
          onChange={(e) => updateFilters("comunidad", e.target.value)}
          aria-label="Filtrar por comunidad autónoma"
          className={selectClass}
        >
          <option value="">Toda España</option>
          {comunidades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Ciudad */}
        <select
          value={searchParams.get("ciudad") || ""}
          onChange={(e) => updateFilters("ciudad", e.target.value)}
          aria-label="Filtrar por ciudad"
          className={selectClass}
        >
          <option value="">Todas las ciudades</option>
          {ciudades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar por tipo de universidad" className="flex flex-wrap gap-2">
          {TIPOS.map((t) => {
            const active = tipo === t.value;
            return (
              <button
                key={t.value || "todas"}
                type="button"
                aria-pressed={active}
                onClick={() => updateFilters("tipo", t.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-[background-color,border-color,color] duration-200",
                  active
                    ? "border-text-primary bg-text-primary text-bg-primary"
                    : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/40 hover:text-text-primary"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}

        {pending && (
          <p role="status" className="inline-flex items-center gap-1.5 text-sm text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Buscando universidades…
          </p>
        )}
      </div>
    </div>
  );
}
