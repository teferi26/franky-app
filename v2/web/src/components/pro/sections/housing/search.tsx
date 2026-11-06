"use client";

import * as React from "react";
import { BedDouble, Building2, UserRound, UserSearch } from "lucide-react";
import { usePro } from "@/lib/pro/store";
import { housingSearch, type HousingHit } from "@/lib/pro/housing-tools";
import { cn } from "@/lib/utils";
import { SearchInput } from "../../kit";
import { LeadDrawer, PropertyDrawer, TenantDrawer } from "./drawers";

/**
 * Buscador del Resumen: una persona, un piso o una habitación desde el mismo
 * sitio ("Lucía", "Castaños 3", "avalista Antonio"). Abre su ficha sin pasar
 * por la sección.
 */

const HIT_ICON: Record<HousingHit["kind"], typeof UserRound> = {
  tenant: UserRound,
  lead: UserSearch,
  property: Building2,
  room: BedDouble,
};

export function HousingSearchBox({ className }: { className?: string }) {
  const { data, now } = usePro();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<null | { kind: HousingHit["kind"]; id: string }>(null);
  const hits = q.trim().length >= 2 ? housingSearch(data, q, now, 8) : [];

  return (
    <div className={cn("relative", className)}>
      <SearchInput value={q} onChange={setQ} placeholder="Busca una persona, un piso o una habitación" />
      {q.trim().length >= 2 ? (
        <div className="mt-1.5 overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
          {hits.length ? (
            <ul className="divide-y divide-border-light">
              {hits.map((hit) => {
                const Icon = HIT_ICON[hit.kind];
                return (
                  <li key={`${hit.kind}-${hit.id}-${hit.roomId ?? ""}`}>
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: hit.kind, id: hit.id })}
                      className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-secondary"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{hit.title}</span>
                        <span className="block truncate text-xs text-text-muted">{hit.detail}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-text-muted">Nada con “{q.trim()}”. Prueba con el nombre, la calle o la zona.</p>
          )}
        </div>
      ) : null}

      <LeadDrawer leadId={open?.kind === "lead" ? open.id : null} onClose={() => setOpen(null)} />
      <TenantDrawer tenantId={open?.kind === "tenant" ? open.id : null} onClose={() => setOpen(null)} />
      <PropertyDrawer propertyId={open?.kind === "property" || open?.kind === "room" ? open.id : null} onClose={() => setOpen(null)} />
    </div>
  );
}
