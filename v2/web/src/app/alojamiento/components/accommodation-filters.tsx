"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { Search, SlidersHorizontal, X, ChevronDown, Check } from "lucide-react";
import { recordHousingSearch } from "@/components/HousingSearchAlert";
import { useSession } from "@/components/SessionProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  cities: string[];
}

const AMENITY_FILTERS = [
  { key: "wifi", label: "WiFi" },
  { key: "ac", label: "Aire acondicionado" },
  { key: "calefaccion", label: "Calefacción" },
  { key: "ascensor", label: "Ascensor" },
  { key: "parking", label: "Parking" },
  { key: "terraza", label: "Terraza" },
  { key: "lavadora", label: "Lavadora" },
  { key: "lavavajillas", label: "Lavavajillas" },
  { key: "piscina", label: "Piscina" },
  { key: "gym", label: "Gimnasio" },
] as const;

const EXTRA_FILTERS = [
  { key: "agua", label: "Agua incluida" },
  { key: "luz", label: "Luz incluida" },
  { key: "amueblado", label: "Amueblado" },
  { key: "mascotas", label: "Se admiten mascotas" },
] as const;

const STAY_OPTIONS = [
  { value: "", label: "Cualquiera" },
  { value: "1", label: "1 mes" },
  { value: "3", label: "3 meses" },
  { value: "6", label: "6 meses" },
  { value: "9", label: "Curso completo (9 meses)" },
];

// Mismo aspecto que ui/Input para selects y números nativos (el sistema no
// tiene un Select propio y aquí no hace falta uno).
const controlClass =
  "h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15";
const labelClass = "mb-1.5 block text-xs font-semibold text-text-secondary";

export default function AccommodationFilters({ cities }: Props) {
  const router = useRouter();
  const { user } = useSession();
  const searchParams = useSearchParams();
  const [showAdvanced, setShowAdvanced] = useState(() => {
    // Auto-open if any advanced filter is active
    const advancedKeys = ["banos", "agua", "luz", "wifi", "ac", "calefaccion", "ascensor", "parking", "terraza", "lavadora", "lavavajillas", "piscina", "gym", "amueblado", "mascotas", "estancia_min"];
    return advancedKeys.some((k) => searchParams.get(k));
  });

  const get = (key: string) => searchParams.get(key) || "";

  const advancedActiveCount = [
    "banos", "agua", "luz", "wifi", "ac", "calefaccion", "ascensor",
    "parking", "terraza", "lavadora", "lavavajillas", "piscina", "gym",
    "amueblado", "mascotas", "estancia_min",
  ].filter((k) => searchParams.get(k)).length;

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const params = new URLSearchParams();
      fd.forEach((val, key) => {
        const v = val.toString().trim();
        if (v) params.set(key, v);
      });
      const city = params.get("ciudad");
      if (city && user) {
        const rawBudget = Number(params.get("precio_max"));
        try { await recordHousingSearch(user.id, city, rawBudget > 0 && rawBudget <= 100000 ? rawBudget : null); }
        catch { /* Search still works; the alert panel offers an explicit retry. */ }
      }
      router.push(`/alojamiento?${params.toString()}`);
    },
    [router, user]
  );

  const clearFilters = () => router.push("/alojamiento");

  const hasFilters = searchParams.toString().length > 0;

  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
      <form key={searchParams.toString()} onSubmit={handleSubmit}>
        {/* Fila principal: ciudad, tipo, precio, habitaciones y buscar. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto] lg:items-end">
          <div>
            <label htmlFor="f-ciudad" className={labelClass}>Ciudad</label>
            <select id="f-ciudad" name="ciudad" defaultValue={get("ciudad")} className={controlClass}>
              <option value="">Todas las ciudades</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-tipo" className={labelClass}>Tipo</label>
            <select id="f-tipo" name="tipo" defaultValue={get("tipo")} className={controlClass}>
              <option value="">Todos</option>
              <option value="piso_completo">Piso completo</option>
              <option value="habitacion">Habitación</option>
              <option value="estudio">Estudio</option>
              <option value="residencia">Residencia</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-precio" className={labelClass}>Precio máx.</label>
            <input
              id="f-precio"
              name="precio_max"
              type="number"
              defaultValue={get("precio_max")}
              placeholder="€/mes"
              className={cn(controlClass, "tabular placeholder:text-text-muted")}
            />
          </div>
          <div>
            <label htmlFor="f-hab" className={labelClass}>Habitaciones</label>
            <input
              id="f-hab"
              name="habitaciones"
              type="number"
              min={1}
              defaultValue={get("habitaciones")}
              placeholder="Mín."
              className={cn(controlClass, "tabular placeholder:text-text-muted")}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit" variant="dark" size="lg" className="h-11 flex-1 lg:flex-none">
              <Search className="h-4 w-4" />
              Buscar
            </Button>
            {hasFilters && (
              <Button type="button" variant="outline" size="lg" className="h-11" onClick={clearFilters}>
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {user && (
          <p className="mt-3 text-xs text-text-muted">
            Al buscar guardamos tu última zona para avisarte de nuevos pisos durante 30 días. Puedes desactivar estos avisos debajo del buscador; respetamos esa elección al volver a buscar.
          </p>
        )}

        {/* Más filtros: enlace discreto con contador. */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-text-primary transition-colors hover:text-violet"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Más filtros
          {advancedActiveCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-text-primary px-1.5 text-[11px] font-bold text-bg-primary tabular">
              {advancedActiveCount}
            </span>
          )}
          <ChevronDown
            className={cn("h-4 w-4 text-text-muted transition-transform duration-300 ease-[var(--ease-out-quart)]", showAdvanced && "rotate-180")}
          />
        </button>

        {/* Panel de filtros avanzados */}
        {showAdvanced && (
          <div className="animate-dropdown mt-4 space-y-6 border-t border-border-light pt-5">
            {/* Baños y estancia */}
            <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
              <div>
                <label htmlFor="f-banos" className={labelClass}>Baños mín.</label>
                <input
                  id="f-banos"
                  name="banos"
                  type="number"
                  min={1}
                  defaultValue={get("banos")}
                  placeholder="Mín."
                  className={cn(controlClass, "tabular placeholder:text-text-muted")}
                />
              </div>
              <div>
                <label htmlFor="f-estancia" className={labelClass}>Estancia mínima</label>
                <select id="f-estancia" name="estancia_min" defaultValue={get("estancia_min")} className={controlClass}>
                  {STAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Suministros incluidos */}
            <div>
              <p className="eyebrow mb-3">Suministros incluidos</p>
              <div className="flex flex-wrap gap-2">
                {EXTRA_FILTERS.slice(0, 2).map((f) => (
                  <ToggleChip key={f.key} name={f.key} label={f.label} defaultChecked={get(f.key) === "1"} />
                ))}
              </div>
            </div>

            {/* Confort y servicios */}
            <div>
              <p className="eyebrow mb-3">Confort y servicios</p>
              <div className="flex flex-wrap gap-2">
                {AMENITY_FILTERS.map((f) => (
                  <ToggleChip key={f.key} name={f.key} label={f.label} defaultChecked={get(f.key) === "1"} />
                ))}
              </div>
            </div>

            {/* Otros */}
            <div>
              <p className="eyebrow mb-3">Otros</p>
              <div className="flex flex-wrap gap-2">
                {EXTRA_FILTERS.slice(2).map((f) => (
                  <ToggleChip key={f.key} name={f.key} label={f.label} defaultChecked={get(f.key) === "1"} />
                ))}
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function ToggleChip({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-[background-color,color,border-color] duration-200",
        checked
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/40 hover:text-text-primary"
      )}
    >
      <input
        type="hidden"
        name={name}
        value={checked ? "1" : ""}
      />
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={() => setChecked((v) => !v)}
      />
      {checked ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <X className="h-3 w-3 opacity-0" aria-hidden="true" />}
      {label}
    </label>
  );
}
