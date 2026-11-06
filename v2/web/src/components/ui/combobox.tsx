"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Desplegable con buscador.
 *
 * Sustituye a los `<select>` nativos con muchisimas opciones. El filtro de
 * universidades tenia 97 en un select nativo: en movil eso es una rueda
 * infinita en la que encontrar "Universidad de Alicante" cuesta mas que
 * teclearla, y en escritorio hay que recordar el nombre exacto.
 *
 * Accesible con teclado: flechas para moverse, Enter para elegir, Escape para
 * cerrar, y el patron combobox de ARIA para que un lector de pantalla lo
 * anuncie como lo que es.
 */
export type ComboOption = { value: string; label: string; hint?: string | null };

/** Normaliza para buscar sin acentos ni mayusculas ("alacant" encuentra "Alacant"). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function Combobox({
  options,
  value,
  onChange,
  placeholder = "Selecciona…",
  searchPlaceholder = "Buscar…",
  allLabel = "Todas",
  className = "",
  id,
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Etiqueta de la opción "sin filtro" (valor ""). Pasa null para ocultarla. */
  allLabel?: string | null;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    const base = q
      ? options.filter(
          (o) => norm(o.label).includes(q) || (o.hint ? norm(o.hint).includes(q) : false)
        )
      : options;
    return allLabel !== null ? [{ value: "", label: allLabel }, ...base] : base;
  }, [options, query, allLabel]);

  const selected = options.find((o) => o.value === value);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Al abrir, el foco va al buscador y la lista arranca arriba.
  useEffect(() => {
    if (!open) return;
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) choose(opt.value);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        // Mismo trazo que ui/input: hairline, borde violeta y anillo suave al
        // enfocar, borde que se oscurece al pasar el ratón.
        className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-border bg-bg-primary px-3.5 text-left text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 ease-[var(--ease-out-quart)] hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15 aria-expanded:border-violet aria-expanded:ring-[3px] aria-expanded:ring-violet/15"
      >
        <span className={cn("truncate", !selected && "text-text-muted")}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Quitar filtro"
              onClick={(e) => {
                e.stopPropagation();
                choose("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  choose("");
                }
              }}
              className="rounded-full p-0.5 text-text-muted transition-colors duration-200 hover:bg-bg-secondary hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn("h-4 w-4 text-text-muted transition-transform duration-200 ease-[var(--ease-out-quart)]", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-bg-primary shadow-float animate-dropdown">
          <div className="relative border-b border-border-light">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet/40"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-text-muted">
                Nada coincide con «{query}»
              </li>
            )}
            {filtered.map((o, i) => (
              <li key={o.value || "__all"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors duration-150",
                    i === active && "bg-bg-secondary"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && (
                      <span className="block truncate text-xs text-text-muted">{o.hint}</span>
                    )}
                  </span>
                  {o.value === value && <Check className="h-4 w-4 shrink-0 text-violet" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
