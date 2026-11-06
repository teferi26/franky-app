"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SpotlightCard } from "@/components/motion";

interface UniOption {
  id: string;
  name: string;
  slug: string;
  city: string | null;
}

/** Normaliza para buscar sin acentos ni mayúsculas. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function FomoUniversityPicker({ universities }: { universities: UniOption[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return universities;
    return universities.filter(
      (u) => norm(u.name).includes(q) || (u.city ? norm(u.city).includes(q) : false)
    );
  }, [query, universities]);

  return (
    <div>
      {/* Buscador: campo del sistema con el icono suelto a la izquierda. */}
      <div className="relative mb-8 max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca tu universidad o ciudad"
          aria-label="Buscar universidad o ciudad"
          autoFocus
          className="pl-11"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-muted">
          No encontramos ninguna universidad con “{query}”.
        </p>
      ) : (
        <>
          <p className="mb-4 text-xs text-text-muted tabular" role="status">
            {filtered.length} {filtered.length === 1 ? "universidad" : "universidades"}
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((uni, i) => (
              <li
                key={uni.id}
                className="animate-list-in"
                style={{ ["--i" as string]: i } as React.CSSProperties}
              >
                <SpotlightCard asChild>
                  <Link
                    href={`/fomo/${uni.slug}`}
                    className="group hover-lift flex items-center gap-4 rounded-2xl border border-border bg-bg-primary p-4 shadow-card hover:border-text-primary/15"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-heading text-[15px] font-bold text-text-primary">
                        {uni.name}
                      </span>
                      {uni.city && (
                        <span className="truncate text-xs text-text-muted">{uni.city}</span>
                      )}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge transition-colors group-hover:text-violet" aria-hidden="true" />
                  </Link>
                </SpotlightCard>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
