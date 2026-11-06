"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Contact, Globe2, Megaphone, Plus, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { LeadStage, ProLead } from "@/lib/pro/types";
import { money, relative } from "@/lib/pro/format";
import {
  STAGES,
  STAGE_LABEL,
  findRoom,
  intakes,
  isFebMoveIn,
  shortDate,
  waitingLabel,
  waitingMinutes,
  waitingTone,
} from "@/lib/pro/housing";
import { cn } from "@/lib/utils";
import { Avatar, Empty, PageHeader, Pill, SearchInput, Segmented, Tip } from "../../kit";
import { TONES } from "../../tones";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { LeadDrawer, NewLeadDrawer } from "./drawers";
import { ErasmusBadge, RoomieBadge, UniBadge, selectClass } from "./shared";
import { AgentBoard, LeadInbox } from "./inbox";
import { inboxBuckets, leadsCsv } from "@/lib/pro/housing-ops";
import { downloadCsv, slugFile } from "./output";

const BOARD: LeadStage[] = ["new", "contacted", "visit", "reserved", "signed"];

type Entry = "all" | "soon" | "feb";
type View = "inbox" | "board" | "team";

export default function HousingInteresados() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [entry, setEntry] = React.useState<Entry>("all");
  const [erasmus, setErasmus] = React.useState(false);
  const [groups, setGroups] = React.useState(false);
  const [verifiedOnly, setVerifiedOnly] = React.useState(false);
  const [agent, setAgent] = React.useState("");
  const [mobileStage, setMobileStage] = React.useState<LeadStage>("new");
  const [showLost, setShowLost] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<LeadStage | null>(null);
  const [view, setView] = React.useState<View>("inbox");

  const isAgency = data.staff.length > 1;
  const buckets = inboxBuckets(data);
  const win = intakes(now);
  const needle = q.trim().toLowerCase();
  const filtered = data.leads.filter((l) => {
    if (needle && !`${l.name} ${l.studies} ${l.university}`.toLowerCase().includes(needle)) return false;
    if (entry === "feb" && !isFebMoveIn(l.moveIn)) return false;
    if (entry === "soon" && isFebMoveIn(l.moveIn)) return false;
    if (erasmus && !l.erasmus) return false;
    if (groups && !l.roomieGroup) return false;
    if (verifiedOnly && !l.verified) return false;
    if (agent === "none" && l.agentId) return false;
    if (agent && agent !== "none" && l.agentId !== agent) return false;
    return true;
  });
  const byStage = (s: LeadStage) =>
    filtered
      .filter((l) => l.stage === s)
      .sort((a, b) => (s === "new" ? a.createdAt.localeCompare(b.createdAt) : (b.lastContactAt ?? b.createdAt).localeCompare(a.lastContactAt ?? a.createdAt)));

  const active = data.leads.filter((l) => l.stage !== "lost" && l.stage !== "signed");
  const newCount = data.leads.filter((l) => l.stage === "new").length;
  const late = data.leads.filter((l) => l.stage === "new" && waitingMinutes(l, now) >= 24 * 60).length;
  const verifiedPct = data.leads.length ? Math.round((data.leads.filter((l) => l.verified).length / data.leads.length) * 100) : 0;
  const lost = byStage("lost");
  const filtersOn = Boolean(needle || entry !== "all" || erasmus || groups || verifiedOnly || agent);

  const move = (lead: ProLead, stage: LeadStage) => {
    if (lead.stage === stage) return;
    update("lead.stage", (d) => ({
      ...d,
      leads: d.leads.map((l) => (l.id === lead.id ? { ...l, stage, lastContactAt: new Date().toISOString() } : l)),
    }));
    toast.success(`${lead.name.split(" ")[0]} pasa a ${STAGE_LABEL[stage].toLowerCase()}`);
  };

  const step = (lead: ProLead, dir: 1 | -1) => {
    const i = BOARD.indexOf(lead.stage);
    const next = BOARD[i + dir];
    if (next) move(lead, next);
  };

  const onDrop = (stage: LeadStage) => {
    const lead = data.leads.find((l) => l.id === dragId);
    setDragId(null);
    setOverStage(null);
    if (lead) move(lead, stage);
  };

  const card = (l: ProLead) => (
    <LeadCard
      key={l.id}
      lead={l}
      dragging={dragId === l.id}
      onOpen={() => setOpen(l.id)}
      onStep={(dir) => step(l, dir)}
      onDragStart={() => setDragId(l.id)}
      onDragEnd={() => {
        setDragId(null);
        setOverStage(null);
      }}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Interesados"
        title={`${active.length} estudiantes buscando`}
        description={`${newCount} nuevos${late ? `, ${late} sin contestar desde ayer` : ""}. ${buckets.fit.length} encajan ya con algún piso. El ${verifiedPct} % llegan verificados por su universidad.`}
        actions={
          <>
            <Button variant="ghost" onClick={() => downloadCsv(leadsCsv(data), slugFile("interesados", data.space.name))}>
              Exportar
            </Button>
            <Button
              variant="outline"
              onClick={() => setOffer({ what: "Primer mes sin honorarios para grupos de Roomie", priceCents: 34000, slots: 4 })}
            >
              <Megaphone className="h-4 w-4" /> Lanzar oferta
            </Button>
            <Button variant="dark" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Añadir interesado
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre o estudios" className="lg:w-72" />
          <Segmented<Entry>
            size="sm"
            label="Fecha de entrada"
            value={entry}
            onChange={setEntry}
            options={[
              { value: "all", label: "Todas las entradas" },
              { value: "soon", label: win.soon.label === "ahora" ? "Entran ya" : "Septiembre" },
              { value: "feb", label: "Febrero" },
            ]}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip on={erasmus} onClick={() => setErasmus((v) => !v)} icon={Globe2}>
              Erasmus
            </FilterChip>
            <FilterChip on={groups} onClick={() => setGroups((v) => !v)} icon={Users}>
              Grupos Roomie
            </FilterChip>
            <FilterChip on={verifiedOnly} onClick={() => setVerifiedOnly((v) => !v)} icon={ShieldCheck}>
              Verificados
            </FilterChip>
            {isAgency ? (
              <>
                <label htmlFor="int-agent" className="sr-only">Agente</label>
                <select id="int-agent" value={agent} onChange={(e) => setAgent(e.target.value)} className={cn(selectClass, "h-9 w-auto rounded-full text-xs font-semibold")}>
                  <option value="">Todos los agentes</option>
                  <option value="none">Sin asignar</option>
                  {data.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name.split(" ")[0]}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>
        </div>
      </PageHeader>

      <Segmented<View>
        label="Vista"
        value={view}
        onChange={setView}
        className="w-full sm:w-auto"
        options={[
          { value: "inbox", label: "Bandeja", count: buckets.fit.length + buckets.out.length },
          { value: "board", label: "Por fases" },
          ...(isAgency ? [{ value: "team" as View, label: "Equipo" }] : []),
        ]}
      />

      {view === "inbox" ? <LeadInbox visible={new Set(filtered.map((l) => l.id))} onOpen={setOpen} /> : null}
      {view === "team" ? <AgentBoard /> : null}

      {view === "board" ? (
        <>
      {/* Móvil: una columna por fase */}
      <div className="flex flex-col gap-3 md:hidden">
        <Segmented<LeadStage>
          label="Fase"
          value={mobileStage}
          onChange={setMobileStage}
          className="w-full"
          options={[...BOARD, "lost" as LeadStage].map((s) => ({ value: s, label: STAGE_LABEL[s], count: byStage(s).length }))}
        />
        <div className="flex flex-col gap-2.5">
          {byStage(mobileStage).map(card)}
          {!byStage(mobileStage).length ? <EmptyColumn stage={mobileStage} filtersOn={filtersOn} /> : null}
        </div>
      </div>

      {/* Escritorio: tablero */}
      <div className="hidden md:block">
        <div className="-mx-1 overflow-x-auto px-1 pb-2 pro-scroll">
          <div className="flex min-w-max gap-3">
            {BOARD.map((s) => {
              const list = byStage(s);
              const meta = STAGES.find((x) => x.id === s)!;
              return (
                <section
                  key={s}
                  aria-label={`${meta.label}, ${list.length}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(s);
                  }}
                  onDragLeave={() => setOverStage((cur) => (cur === s ? null : cur))}
                  onDrop={() => onDrop(s)}
                  className={cn(
                    "flex w-[272px] shrink-0 flex-col rounded-2xl border bg-bg-secondary/60 p-2 transition-colors",
                    overStage === s && dragId ? "border-violet/50 bg-violet-50/70" : "border-border-light",
                  )}
                >
                  <header className="flex items-baseline justify-between px-2 pb-2 pt-1">
                    <h2 className="font-heading text-sm font-bold">{meta.label}</h2>
                    <span className="text-xs text-text-muted tabular">
                      {list.length}
                      {s === "signed" || s === "reserved"
                        ? ` · ${money(list.reduce((a, l) => a + (findRoom(data, l.propertyId, l.roomId).room?.priceCents ?? l.budgetCents), 0), { round: true })}/mes`
                        : ""}
                    </span>
                  </header>
                  <div className="flex min-h-24 flex-col gap-2">
                    {list.map(card)}
                    {!list.length ? <EmptyColumn stage={s} filtersOn={filtersOn} compact /> : null}
                  </div>
                </section>
              );
            })}
            {/* Perdidos, plegado */}
            <section
              aria-label={`Perdidos, ${lost.length}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage("lost");
              }}
              onDrop={() => onDrop("lost")}
              className={cn(
                "flex shrink-0 flex-col rounded-2xl border border-dashed p-2 transition-[width,background-color]",
                showLost ? "w-[272px]" : "w-14",
                overStage === "lost" && dragId ? "border-rose-400 bg-rose-50/60 dark:bg-rose-950/20" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => setShowLost((v) => !v)}
                aria-expanded={showLost}
                className={cn("flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-bold text-text-muted hover:text-text-primary", !showLost && "flex-col")}
              >
                {showLost ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className={cn(!showLost && "[writing-mode:vertical-rl]")}>Perdidos</span>
                <span className="text-xs font-semibold tabular">{lost.length}</span>
              </button>
              {showLost ? (
                <div className="mt-1 flex flex-col gap-2">
                  {lost.map(card)}
                  {!lost.length ? <p className="px-2 py-4 text-center text-xs text-text-muted">Ninguno.</p> : null}
                </div>
              ) : null}
            </section>
          </div>
        </div>
        <p className="mt-1 text-xs text-text-muted">Arrastra una tarjeta a otra fase o usa las flechas de cada tarjeta.</p>
      </div>
        </>
      ) : null}

      {!filtered.length && filtersOn ? (
        <Empty
          icon={Contact}
          title="Nadie con esos filtros"
          body="Prueba a quitar algún filtro o a buscar por otro nombre."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setEntry("all");
                setErasmus(false);
                setGroups(false);
                setVerifiedOnly(false);
                setAgent("");
              }}
            >
              Quitar filtros
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Tip title="Contesta el mismo día">
          Los interesados que reciben respuesta en menos de una hora piden visita el doble de veces. Los nuevos se ordenan por el tiempo que llevan esperando.
        </Tip>
        <Tip title="Grupos de Roomie">
          Son estudiantes que ya se conocen y son compatibles en horarios, limpieza y ruido. Un grupo llena un piso entero con un solo contrato.
        </Tip>
      </div>

      <LeadDrawer leadId={open} onClose={() => setOpen(null)} />
      <NewLeadDrawer open={adding} onClose={() => setAdding(false)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </div>
  );
}

function FilterChip({ on, onClick, icon: Icon, children }: { on: boolean; onClick: () => void; icon: typeof Users; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
        on ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-text-secondary hover:border-text-primary/25 hover:text-text-primary",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
      {children}
    </button>
  );
}

function EmptyColumn({ stage, filtersOn, compact }: { stage: LeadStage; filtersOn: boolean; compact?: boolean }) {
  const text: Record<LeadStage, string> = {
    new: "Nadie esperando respuesta. Los estudiantes que escriben por Franky entran aquí.",
    contacted: "Cuando contestes a un nuevo, pásalo aquí.",
    visit: "Propón visita desde la ficha: eligen hora en tus franjas.",
    reserved: "Envía el contrato desde la ficha y la habitación queda reservada.",
    signed: "Los contratos firmados aparecen aquí y pasan a Inquilinos.",
    lost: "Ninguno perdido. Así se hace.",
  };
  return (
    <p className={cn("rounded-xl border border-dashed border-border px-3 text-center text-xs text-text-muted", compact ? "py-5" : "py-8")}>
      {filtersOn ? "Nadie en esta fase con estos filtros." : text[stage]}
    </p>
  );
}

function LeadCard({
  lead,
  dragging,
  onOpen,
  onStep,
  onDragStart,
  onDragEnd,
}: {
  lead: ProLead;
  dragging: boolean;
  onOpen: () => void;
  onStep: (dir: 1 | -1) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { data, now } = usePro();
  const { property, room } = findRoom(data, lead.propertyId, lead.roomId);
  const agent = data.staff.find((s) => s.id === lead.agentId);
  const i = BOARD.indexOf(lead.stage);
  const wait = waitingMinutes(lead, now);
  const tone = waitingTone(wait);
  const lostReason = lead.lostReason;
  const overBudget = room && room.priceCents > lead.budgetCents;

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lead.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative rounded-xl border border-border bg-bg-primary shadow-card transition-[box-shadow,opacity,transform] hover:shadow-card-hover",
        dragging && "opacity-50",
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/40">
        <span className="flex items-start gap-2.5">
          <Avatar name={lead.name} size="sm" tone={lead.roomieGroup ? "violet" : lead.erasmus ? "sky" : "slate"} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{lead.name}</span>
            <span className="flex items-center gap-1.5 text-xs">
              <UniBadge university={lead.university} verified={lead.verified} />
              <span className="truncate text-text-muted">{lead.studies}</span>
            </span>
          </span>
        </span>
        <span className="mt-2.5 grid grid-cols-3 gap-1 text-center">
          <Fact label="Entrada" value={shortDate(lead.moveIn)} />
          <Fact label="Meses" value={String(lead.months)} />
          <Fact label="Hasta" value={`${Math.round(lead.budgetCents / 100)} €`} warn={Boolean(overBudget)} />
        </span>
        {property ? (
          <span className="mt-2 block truncate text-xs text-text-secondary">
            {property.title}
            {room ? `, ${room.name.toLowerCase()} (${Math.round(room.priceCents / 100)} €)` : lead.roomieGroup ? ", piso entero" : ""}
          </span>
        ) : (
          <span className="mt-2 block text-xs text-text-muted">Aún sin piso elegido</span>
        )}
        {lead.roomieGroup || lead.erasmus ? (
          <span className="mt-2 flex flex-wrap gap-1">
            {lead.roomieGroup ? <RoomieBadge group={lead.roomieGroup} /> : null}
            {lead.erasmus ? <ErasmusBadge /> : null}
          </span>
        ) : null}
        {lead.stage === "lost" && lostReason ? <span className="mt-2 block text-xs text-rose-700 dark:text-rose-300">{lostReason}</span> : null}
      </button>
      <div className="flex items-center gap-1.5 border-t border-border-light px-2 py-1.5">
        {agent ? (
          <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-[0.6rem] font-semibold", TONES[agent.tone].soft)} title={agent.name}>
            {agent.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
          </span>
        ) : data.staff.length > 1 ? (
          <Pill tone="warning">Sin agente</Pill>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[0.72rem]",
            lead.stage === "new" && tone === "danger" ? "font-semibold text-rose-700 dark:text-rose-300" : lead.stage === "new" && tone === "warning" ? "font-semibold text-amber-800 dark:text-amber-300" : "text-text-muted",
          )}
        >
          {lead.stage === "new" ? `Espera ${waitingLabel(wait)}` : relative(lead.lastContactAt ?? lead.createdAt, now.getTime())}
        </span>
        {lead.stage !== "lost" ? (
          <>
            <button
              type="button"
              aria-label={`Mover a ${i > 0 ? STAGE_LABEL[BOARD[i - 1]].toLowerCase() : "la fase anterior"}`}
              onClick={() => onStep(-1)}
              disabled={i <= 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Mover a ${i < BOARD.length - 1 ? STAGE_LABEL[BOARD[i + 1]].toLowerCase() : "la fase siguiente"}`}
              onClick={() => onStep(1)}
              disabled={i >= BOARD.length - 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span className="rounded-lg bg-bg-secondary px-1 py-1">
      <span className="block text-[0.62rem] uppercase tracking-wide text-text-muted">{label}</span>
      <span className={cn("block text-xs font-semibold tabular", warn && "text-amber-800 dark:text-amber-300")}>{value}</span>
    </span>
  );
}
