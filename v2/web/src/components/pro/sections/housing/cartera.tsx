"use client";

import * as React from "react";
import { Building2, CalendarCheck2, Euro, Eye, EyeOff, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProProperty } from "@/lib/pro/types";
import { localDate, money, pct } from "@/lib/pro/format";
import { freeBy, intakes, occupancy, priceRange, propertyOccupancy } from "@/lib/pro/housing";
import { cn } from "@/lib/utils";
import { Empty, Kpi, KpiRow, Meter, PageHeader, Pill, SearchInput, Segmented, Tip } from "../../kit";
import { TONES } from "../../tones";
import { sectionLabel } from "../../sections";
import { NewPropertyDrawer, PropertyDrawer } from "./drawers";
import { PropertyCover, RoomChip, RoomLegend } from "./shared";
import { PortfolioMap } from "./property-extras";

type Filter = "all" | "free" | "full" | "hidden";
type View = "cards" | "map";

export default function HousingCartera() {
  const { data, now, vertical } = usePro();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [zone, setZone] = React.useState("");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [view, setView] = React.useState<View>("cards");

  const label = sectionLabel(vertical.id, "cartera");
  const occ = occupancy(data);
  const win = intakes(now);
  const freeFeb = freeBy(data, win.feb.by).length;
  const month = localDate(now).slice(0, 7);
  const zones = [...new Set(data.properties.map((p) => p.zone))];
  const allPrices = data.properties.flatMap((p) => p.rooms.map((r) => r.priceCents));
  const avg = allPrices.length ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : 0;
  const views = data.properties.reduce((a, p) => a + p.views30, 0);
  const groupsWaiting = data.leads.filter((l) => l.roomieGroup && l.stage !== "lost" && l.stage !== "signed").length;

  const needle = q.trim().toLowerCase();
  const list = data.properties.filter((p) => {
    if (needle && !`${p.title} ${p.address} ${p.zone}`.toLowerCase().includes(needle)) return false;
    if (zone && p.zone !== zone) return false;
    const free = p.rooms.some((r) => r.status === "free" || r.status === "leaving");
    if (filter === "free" && !free) return false;
    if (filter === "full" && free) return false;
    if (filter === "hidden" && p.published) return false;
    return true;
  });

  const counts = {
    all: data.properties.length,
    free: data.properties.filter((p) => p.rooms.some((r) => r.status === "free" || r.status === "leaving")).length,
    full: data.properties.filter((p) => !p.rooms.some((r) => r.status === "free" || r.status === "leaving")).length,
    hidden: data.properties.filter((p) => !p.published).length,
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={label}
        title={`${data.properties.length} ${data.properties.length === 1 ? "piso" : "pisos"}, ${occ.total} habitaciones`}
        description={`${occ.free} libres ahora y ${freeFeb} para febrero. Ocupación del ${pct(occ.occupied, occ.total)} %.`}
        actions={
          <Button variant="dark" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Añadir piso
          </Button>
        }
      />

      <KpiRow>
        <Kpi icon={Building2} label="Ocupación" value={`${pct(occ.occupied, occ.total)} %`} hint={`${occ.occupied} de ${occ.total} habitaciones`} />
        <Kpi icon={CalendarCheck2} label="Libres ahora" value={occ.free} hint={occ.reserved ? `${occ.reserved} reservadas` : "Sin reservas pendientes"} emphasis={occ.free > 0} />
        <Kpi icon={Euro} label="Precio medio" value={money(avg, { round: true })} hint="por habitación y mes" />
        <Kpi icon={Eye} label="Vistas en 30 días" value={views.toLocaleString("es-ES")} hint="de estudiantes verificados" />
      </KpiRow>

      {data.properties.length > 1 ? (
        <Segmented<View>
          label="Vista de la cartera"
          value={view}
          onChange={setView}
          className="self-start"
          options={[
            { value: "cards", label: "Pisos" },
            { value: "map", label: "Por minutos al campus" },
          ]}
        />
      ) : null}

      {view === "map" ? <PortfolioMap onOpen={setOpen} /> : null}

      <div className={cn("flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between", view === "map" && "hidden")}>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <Segmented<Filter>
            size="sm"
            label="Filtrar pisos"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Todos", count: counts.all },
              { value: "free", label: "Con libres", count: counts.free },
              { value: "full", label: "Llenos", count: counts.full },
              { value: "hidden", label: "Ocultos", count: counts.hidden },
            ]}
          />
          {zones.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {zones.map((z) => (
                <button
                  key={z}
                  type="button"
                  aria-pressed={zone === z}
                  onClick={() => setZone((cur) => (cur === z ? "" : z))}
                  className={cn(
                    "h-9 rounded-full border px-3 text-xs font-semibold transition-colors",
                    zone === z ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  {z}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {data.properties.length > 3 ? <SearchInput value={q} onChange={setQ} placeholder="Buscar calle o zona" className="md:w-60" /> : null}
      </div>

      {view === "cards" ? <RoomLegend /> : null}

      {view === "map" ? null : list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => (
            <PropertyCard key={p.id} property={p} index={i} month={month} onOpen={() => setOpen(p.id)} />
          ))}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-text-muted transition-colors hover:border-violet/40 hover:text-text-primary"
          >
            <Plus className="h-6 w-6" strokeWidth={1.6} />
            <span className="text-sm font-semibold">Añadir otro piso</span>
            <span className="max-w-[220px] text-center text-xs">Por habitaciones o entero, en dos minutos.</span>
          </button>
        </div>
      ) : data.properties.length ? (
        <Empty icon={Building2} title="Ningún piso con ese filtro" body="Cambia el filtro o la zona para ver el resto." action={<Button variant="outline" onClick={() => { setFilter("all"); setZone(""); setQ(""); }}>Ver todos</Button>} />
      ) : (
        <Empty
          icon={Building2}
          title="Sube tu primer piso"
          body="Por habitaciones, cada una con su precio y su fecha de disponibilidad. Lo verán estudiantes verificados de la UA y la UMH."
          action={<Button variant="dark" onClick={() => setAdding(true)}>Añadir piso</Button>}
        />
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Tip title="Piso entero para grupos">
          {groupsWaiting
            ? `Hay ${groupsWaiting} grupos de Roomie buscando piso ahora. Abre un piso con varias habitaciones libres y ofrécelo entero: un contrato y todo lleno.`
            : "Roomie junta estudiantes compatibles. Ofrece tus pisos con varias habitaciones libres enteros y llénalos con un solo contrato."}
        </Tip>
        <Tip title="Publica febrero ya">
          Las habitaciones que se liberan en enero se reservan antes si están publicadas con su fecha. Los Erasmus miran piso desde noviembre.
        </Tip>
      </div>

      <PropertyDrawer propertyId={open} onClose={() => setOpen(null)} />
      <NewPropertyDrawer open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function PropertyCard({ property, index, month, onOpen }: { property: ProProperty; index: number; month: string; onOpen: () => void }) {
  const { data } = usePro();
  const { occupied, total } = propertyOccupancy(property);
  const { min, max } = priceRange(property);
  const visits = data.visits.filter((v) => v.propertyId === property.id && v.start.slice(0, 7) === month && v.status !== "cancelled").length;
  const interested = data.leads.filter((l) => l.propertyId === property.id && l.stage !== "lost" && l.stage !== "signed").length;
  const agent = data.staff.find((s) => s.id === property.agentId);
  const free = property.rooms.filter((r) => r.status === "free").length;

  return (
    <article
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card transition-[box-shadow,transform] hover-lift hover:shadow-card-hover animate-list-in"
      style={{ "--i": index } as React.CSSProperties}
    >
      <button type="button" onClick={onOpen} className="block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet/40" aria-label={`Abrir ${property.title}`}>
        <PropertyCover property={property} className="h-32">
          <span className="absolute right-3 top-3 flex gap-1">
            {!property.published ? (
              <Pill tone="warning">
                <EyeOff className="h-3 w-3" /> Oculto
              </Pill>
            ) : null}
            {property.wholeFlatPriceCents ? (
              <Pill tone="violet">
                <Users className="h-3 w-3" /> Entero
              </Pill>
            ) : null}
          </span>
        </PropertyCover>
        <div className="px-4 pb-2 pt-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-heading text-[1.02rem] font-bold">{property.title}</h3>
            <span className="shrink-0 text-sm font-semibold tabular">
              {min === max ? `${Math.round(min / 100)} €` : `${Math.round(min / 100)} a ${Math.round(max / 100)} €`}
            </span>
          </div>
          <p className="truncate text-xs text-text-muted">{property.address}</p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-secondary">
            <span className="tabular">{property.minutesToCampus} min al campus</span>
            <span className="tabular">{visits} visitas este mes</span>
            {interested ? <span className="tabular">{interested} interesados</span> : null}
          </p>
        </div>
      </button>
      <div className="flex flex-wrap gap-1 px-4 pb-3">
        {property.rooms.map((r) => (
          <RoomChip key={r.id} room={r} onClick={onOpen} />
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2.5 border-t border-border-light px-4 py-2.5">
        <Meter value={occupied} max={total} tone={free ? "violet" : "success"} className="flex-1" />
        <span className="text-xs text-text-muted tabular">
          {occupied}/{total}
        </span>
        {agent && data.staff.length > 1 ? (
          <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-[0.6rem] font-semibold", TONES[agent.tone].soft)} title={`Agente: ${agent.name}`}>
            {agent.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}
          </span>
        ) : null}
      </div>
    </article>
  );
}
