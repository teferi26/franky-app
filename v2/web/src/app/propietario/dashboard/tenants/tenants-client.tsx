"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, Loader2, Home, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";
import { Panel, PanelBody, PanelHeader, PisoChips, SectionTitle, controlClass } from "../panel-ui";

interface Accommodation {
  id: string;
  title: string;
  city: string | null;
  images: string[] | null;
}

interface Tenant {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  career: string | null;
  university_course: string | null;
}

interface Tenancy {
  id: string;
  tenant_id: string;
  room_label: string | null;
  status: "pending_confirmation" | "active";
  is_public: boolean;
  start_date: string | null;
  confirmed_at: string | null;
  created_at: string;
  tenant: Tenant | null;
}

export default function TenantsClient({ accommodations }: { accommodations: Accommodation[] }) {
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(accommodations[0]?.id ?? null);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Tenant[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);

  const loadTenancies = useCallback(async (accId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenancies?accommodation_id=${accId}`);
      const json = await res.json();
      setTenancies(json.tenancies ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadTenancies(selected);
    else setTenancies([]);
  }, [selected, loadTenancies]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        setResults(json.results ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const invite = async (tenantId: string) => {
    if (!selected) return;
    setInviting(tenantId);
    try {
      const res = await fetch("/api/tenancies/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accommodation_id: selected, tenant_id: tenantId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error("No se pudo invitar", json.error);
        return;
      }
      toast.success("Invitación enviada", "El estudiante debe aceptar para aparecer en el piso.");
      setQuery("");
      setResults([]);
      loadTenancies(selected);
    } finally {
      setInviting(null);
    }
  };

  const endTenancy = async (tenancyId: string) => {
    const res = await fetch(`/api/tenancies?tenancy_id=${tenancyId}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      toast.error("No se pudo finalizar", json.error);
      return;
    }
    toast.success("Tenencia finalizada");
    if (selected) loadTenancies(selected);
  };

  const selectedAcc = accommodations.find((a) => a.id === selected);
  const alreadyLinked = new Set(tenancies.map((t) => t.tenant_id));

  return (
    <div className="min-h-screen bg-bg-primary">
      <PanelHeader
        title="Inquilinos"
        description="Marca qué estudiantes viven en cada piso. Aparecerán como compañeros para quien busca piso compartido."
      />

      <PanelBody className="space-y-10">
        {accommodations.length === 0 ? (
          <Reveal className="rounded-3xl border border-dashed border-border px-6 py-16 text-center">
            <Home className="mx-auto h-8 w-8 text-text-muted" strokeWidth={1.5} />
            <p className="mt-4 font-heading text-lg font-bold text-text-primary">
              Aún no tienes pisos publicados
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
              Publica un piso para gestionar sus inquilinos.
            </p>
            <Button asChild variant="dark" className="mt-6">
              <Link href="/propietario/dashboard">
                Publicar un piso
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
            </Button>
          </Reveal>
        ) : (
          <>
            <Reveal>
              <PisoChips items={accommodations} selected={selected} onSelect={setSelected} />
            </Reveal>

            {/* Buscar e invitar */}
            <Reveal delay={60} className="space-y-5">
              <SectionTitle
                title="Añadir inquilino"
                description={selectedAcc ? `A ${selectedAcc.title}` : undefined}
              />
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                  strokeWidth={1.75}
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Busca al estudiante por nombre…"
                  aria-label="Buscar estudiante"
                  className={cn(controlClass, "pl-10")}
                />
              </div>

              {searching && (
                <p className="flex items-center gap-2 text-sm text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                </p>
              )}

              {results.length > 0 && (
                <ul className="space-y-2">
                  {results.map((r, i) => {
                    const linked = alreadyLinked.has(r.id);
                    return (
                      <li
                        key={r.id}
                        style={{ "--i": i } as CSSProperties}
                        className="animate-list-in flex items-center gap-3 rounded-2xl border border-border bg-bg-primary p-3 shadow-card transition-colors hover:bg-bg-secondary"
                      >
                        <ResidentAvatar name={r.full_name} url={r.avatar_url} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-text-primary">
                            {r.full_name ?? "Estudiante"}
                          </p>
                          <p className="truncate text-xs text-text-muted">
                            {[r.career, r.university_course].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={linked ? "outline" : "dark"}
                          disabled={linked}
                          loading={inviting === r.id}
                          onClick={() => invite(r.id)}
                        >
                          {linked ? "Ya añadido" : "Invitar"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Reveal>

            {/* Inquilinos del piso */}
            <Reveal delay={120} className="space-y-5">
              <SectionTitle
                title="Inquilinos de este piso"
                aside={
                  !loading && tenancies.length > 0 ? (
                    <span className="text-sm text-text-muted tabular">
                      {tenancies.length} {tenancies.length === 1 ? "persona" : "personas"}
                    </span>
                  ) : undefined
                }
              />
              {loading ? (
                <p className="flex items-center gap-2 text-sm text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                </p>
              ) : tenancies.length === 0 ? (
                <Panel className="px-6 py-10 text-center">
                  <p className="text-sm text-text-muted">
                    Todavía no has añadido inquilinos a este piso.
                  </p>
                </Panel>
              ) : (
                <ul className="space-y-2">
                  {tenancies.map((t, i) => {
                    const active = t.status === "active";
                    return (
                      <li
                        key={t.id}
                        style={{ "--i": i } as CSSProperties}
                        className="animate-list-in hover-lift flex items-center gap-3 rounded-2xl border border-border bg-bg-primary p-3 shadow-card"
                      >
                        <ResidentAvatar name={t.tenant?.full_name} url={t.tenant?.avatar_url} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-text-primary">
                            {t.tenant?.full_name ?? "Estudiante"}
                          </p>
                          <p className="truncate text-xs text-text-muted">
                            {[t.tenant?.career, t.tenant?.university_course]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              active ? "bg-success" : "bg-warning"
                            )}
                          />
                          {active ? "Activo" : "Pendiente"}
                        </span>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => endTenancy(t.id)}
                          title="Finalizar tenencia"
                          aria-label="Finalizar tenencia"
                        >
                          <X className="h-4 w-4" strokeWidth={1.75} />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Reveal>
          </>
        )}
      </PanelBody>
    </div>
  );
}

function ResidentAvatar({ name, url }: { name?: string | null; url?: string | null }) {
  if (url) {
    return (
      <Image
        src={url}
        alt={name ?? "Estudiante"}
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-tertiary font-heading font-semibold text-text-secondary">
      {(name ?? "?").charAt(0).toUpperCase()}
    </div>
  );
}
