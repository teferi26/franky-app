import React from "react";
import { ScrollView, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, Contact, Globe2, Megaphone, Plus, ShieldCheck, Users, type LucideIcon } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { LeadStage, ProLead } from "../../../../../shared/pro/types";
import { money, relative } from "../../../../../shared/pro/format";
import { STAGE_LABEL, findRoom, intakes, isFebMoveIn, shortDate, waitingLabel, waitingMinutes, waitingTone } from "../../../../../shared/pro/housing";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Chips, Empty, PAvatar, PButton, PText, PageHeader, Pill, SearchInput, Segmented, Tip } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { LeadDrawer, NewLeadDrawer } from "./drawers";
import { LeadInbox } from "./inbox";
import { AgentDot, ErasmusBadge, RoomieBadge, UniBadge } from "./shared";

const BOARD: LeadStage[] = ["new", "contacted", "visit", "reserved", "signed"];

/** Tarjetas que se pintan de golpe; el resto, con "Ver más". */
const PAGE = 40;

type Entry = "all" | "soon" | "feb";

export default function HousingInteresados() {
  const { data, now, update } = usePro();
  const [q, setQ] = React.useState("");
  const [entry, setEntry] = React.useState<Entry>("all");
  const [erasmus, setErasmus] = React.useState(false);
  const [groups, setGroups] = React.useState(false);
  const [verifiedOnly, setVerifiedOnly] = React.useState(false);
  const [agent, setAgent] = React.useState("");
  const [stage, setStage] = React.useState<LeadStage>("new");
  const [limit, setLimit] = React.useState(PAGE);
  const [open, setOpen] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  // La bandeja es la vista de cada día; el tablero por fases, para repasar.
  const [view, setView] = React.useState<"inbox" | "board">("inbox");

  const isAgency = data.staff.length > 1;
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
  const filtersOn = Boolean(needle || entry !== "all" || erasmus || groups || verifiedOnly || agent);
  const list = byStage(stage);
  const monthly =
    stage === "signed" || stage === "reserved"
      ? money(list.reduce((a, l) => a + (findRoom(data, l.propertyId, l.roomId).room?.priceCents ?? l.budgetCents), 0), { round: true })
      : null;

  React.useEffect(() => setLimit(PAGE), [stage, needle, entry, erasmus, groups, verifiedOnly, agent]);

  const move = async (lead: ProLead, next: LeadStage) => {
    if (lead.stage === next) return;
    const ok = await update("lead.stage", (d) => ({
      ...d,
      leads: d.leads.map((l) => (l.id === lead.id ? { ...l, stage: next, lastContactAt: new Date().toISOString() } : l)),
    }));
    if (!ok) return;
    toast(`${lead.name.split(" ")[0]} pasa a ${STAGE_LABEL[next].toLowerCase()}`, { kind: "success" });
  };

  const step = (lead: ProLead, dir: 1 | -1) => {
    const i = BOARD.indexOf(lead.stage);
    const next = BOARD[i + dir];
    if (next) void move(lead, next);
  };

  const clearFilters = () => {
    setQ("");
    setEntry("all");
    setErasmus(false);
    setGroups(false);
    setVerifiedOnly(false);
    setAgent("");
  };

  return (
    <>
      <ProPage>
        <PageHeader
          eyebrow="Interesados"
          title={`${active.length} estudiantes buscando`}
          description={`${newCount} nuevos${late ? `, ${late} sin contestar desde ayer` : ""}. El ${verifiedPct} % llegan verificados por su universidad, con fecha de entrada, meses y presupuesto.`}
          actions={
            <>
              <PButton
                label="Lanzar oferta"
                variant="outline"
                icon={Megaphone}
                onPress={() => setOffer({ what: "Primer mes sin honorarios para grupos de Roomie", priceCents: 34000, slots: 4 })}
              />
              <PButton label="Añadir interesado" icon={Plus} onPress={() => setAdding(true)} />
            </>
          }
        />

        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre o estudios" />
        <Segmented<Entry>
          value={entry}
          onChange={setEntry}
          options={[
            { value: "all", label: "Todas las entradas" },
            { value: "soon", label: win.soon.label === "ahora" ? "Entran ya" : "Septiembre" },
            { value: "feb", label: "Febrero" },
          ]}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }} style={{ flexGrow: 0, marginBottom: S.md }}>
          <FilterChip on={erasmus} onPress={() => setErasmus((v) => !v)} icon={Globe2} label="Erasmus" />
          <FilterChip on={groups} onPress={() => setGroups((v) => !v)} icon={Users} label="Grupos Roomie" />
          <FilterChip on={verifiedOnly} onPress={() => setVerifiedOnly((v) => !v)} icon={ShieldCheck} label="Verificados" />
        </ScrollView>
        {isAgency ? (
          <Chips
            value={agent}
            onChange={setAgent}
            options={[
              { value: "", label: "Todos los agentes" },
              { value: "none", label: "Sin asignar" },
              ...data.staff.map((s) => ({ value: s.id, label: s.name.split(" ")[0] })),
            ]}
          />
        ) : null}

        <Segmented<"inbox" | "board">
          value={view}
          onChange={setView}
          options={[
            { value: "inbox", label: "Bandeja", count: filtered.filter((l) => l.stage === "new" || l.stage === "contacted").length },
            { value: "board", label: "Por fases" },
          ]}
        />

        {view === "inbox" ? (
          <LeadInbox visible={new Set(filtered.map((l) => l.id))} onOpen={setOpen} />
        ) : (
          <>
            {/* Una fase cada vez: las columnas del tablero de la web, en pestañas. */}
            <PText v="label" style={{ marginTop: S.xs, marginBottom: 6 }}>Fase</PText>
            <Segmented<LeadStage>
              value={stage}
              onChange={setStage}
              options={[...BOARD, "lost" as LeadStage].map((s) => ({ value: s, label: STAGE_LABEL[s], count: byStage(s).length }))}
            />
            {monthly && list.length ? <PText v="small" style={{ marginBottom: S.sm }}>{`${list.length} · ${monthly}/mes`}</PText> : null}

            <View style={{ gap: S.sm, marginBottom: S.lg }}>
              {list.slice(0, limit).map((l) => (
                <LeadCard key={l.id} lead={l} onOpen={() => setOpen(l.id)} onStep={(dir) => step(l, dir)} />
              ))}
              {list.length > limit ? <PButton label={`Ver más (${list.length - limit})`} variant="outline" full onPress={() => setLimit((n) => n + PAGE)} /> : null}
              {!list.length ? <EmptyColumn stage={stage} filtersOn={filtersOn} /> : null}
            </View>
          </>
        )}

        {!filtered.length && filtersOn ? (
          <Empty
            icon={Contact}
            title="Nadie con esos filtros"
            body="Prueba a quitar algún filtro o a buscar por otro nombre."
            action={<PButton label="Quitar filtros" variant="outline" onPress={clearFilters} />}
          />
        ) : null}

        <Tip title="Contesta el mismo día">
          Los interesados que reciben respuesta en menos de una hora piden visita el doble de veces. Los nuevos se ordenan por el tiempo que llevan esperando.
        </Tip>
        <Tip title="Grupos de Roomie">
          Son estudiantes que ya se conocen y son compatibles en horarios, limpieza y ruido. Un grupo llena un piso entero con un solo contrato.
        </Tip>
      </ProPage>

      <LeadDrawer leadId={open} onClose={() => setOpen(null)} />
      <NewLeadDrawer open={adding} onClose={() => setAdding(false)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </>
  );
}

function FilterChip({ on, onPress, icon: Icon, label }: { on: boolean; onPress: () => void; icon: LucideIcon; label: string }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{ minHeight: 40, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: on ? C.text : C.border, backgroundColor: on ? C.text : C.surface, flexDirection: "row", alignItems: "center", gap: 6 }}
    >
      <Icon size={14} color={on ? C.bg : C.muted} strokeWidth={1.9} />
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: on ? C.bg : C.text }} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Tap>
  );
}

function EmptyColumn({ stage, filtersOn }: { stage: LeadStage; filtersOn: boolean }) {
  const text: Record<LeadStage, string> = {
    new: "Nadie esperando respuesta. Los estudiantes que escriben por Franky entran aquí.",
    contacted: "Cuando contestes a un nuevo, pásalo aquí.",
    visit: "Propón visita desde la ficha: eligen hora en tus franjas.",
    reserved: "Envía el contrato desde la ficha y la habitación queda reservada.",
    signed: "Los contratos firmados aparecen aquí y pasan a Inquilinos.",
    lost: "Ninguno perdido. Así se hace.",
  };
  return (
    <View style={{ borderRadius: R.md, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, paddingHorizontal: S.md, paddingVertical: S.xl }}>
      <PText v="tiny" style={{ textAlign: "center" }}>{filtersOn ? "Nadie en esta fase con estos filtros." : text[stage]}</PText>
    </View>
  );
}

function LeadCard({ lead, onOpen, onStep }: { lead: ProLead; onOpen: () => void; onStep: (dir: 1 | -1) => void }) {
  const { data, now, pending } = usePro();
  const { property, room } = findRoom(data, lead.propertyId, lead.roomId);
  const agent = data.staff.find((s) => s.id === lead.agentId);
  const i = BOARD.indexOf(lead.stage);
  const wait = waitingMinutes(lead, now);
  const wt = waitingTone(wait);
  const overBudget = Boolean(room && room.priceCents > lead.budgetCents);
  const waitColor = lead.stage === "new" && wt === "danger" ? C.errorText : lead.stage === "new" && wt === "warning" ? C.warning : C.muted;
  const arrow = { width: 44, height: 44, borderRadius: R.sm, alignItems: "center" as const, justifyContent: "center" as const };

  return (
    <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, ...SHADOW.card }}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Abrir ${lead.name}`} style={{ padding: S.md, gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
          <PAvatar name={lead.name} size={34} toneKey={lead.roomieGroup ? "violet" : lead.erasmus ? "sky" : "slate"} />
          <View style={{ flex: 1, gap: 2 }}>
            <PText v="h3" numberOfLines={1}>{lead.name}</PText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <UniBadge university={lead.university} verified={lead.verified} />
              <PText v="tiny" numberOfLines={1} style={{ flex: 1 }}>{lead.studies}</PText>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Fact label="Entrada" value={shortDate(lead.moveIn)} />
          <Fact label="Meses" value={String(lead.months)} />
          <Fact label="Hasta" value={`${Math.round(lead.budgetCents / 100)} €`} warn={overBudget} />
        </View>
        {property ? (
          <PText v="tiny" color={C.text} numberOfLines={1}>
            {`${property.title}${room ? `, ${room.name.toLowerCase()} (${Math.round(room.priceCents / 100)} €)` : lead.roomieGroup ? ", piso entero" : ""}`}
          </PText>
        ) : (
          <PText v="tiny">Aún sin piso elegido</PText>
        )}
        {lead.roomieGroup || lead.erasmus ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {lead.roomieGroup ? <RoomieBadge group={lead.roomieGroup} /> : null}
            {lead.erasmus ? <ErasmusBadge /> : null}
          </View>
        ) : null}
        {lead.stage === "lost" && lead.lostReason ? <PText v="tiny" color={C.errorText}>{lead.lostReason}</PText> : null}
      </Tap>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, borderTopColor: C.borderLight, paddingLeft: S.md, paddingRight: 4 }}>
        {agent ? <AgentDot name={agent.name} toneKey={agent.tone} /> : data.staff.length > 1 ? <Pill tone="warning" label="Sin agente" /> : null}
        <Text
          style={{ flex: 1, fontSize: 12, fontFamily: lead.stage === "new" && wt !== "neutral" ? FONT.semibold : undefined, color: waitColor, paddingVertical: lead.stage === "lost" ? 12 : 0 }}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {lead.stage === "new" ? `Espera ${waitingLabel(wait)}` : relative(lead.lastContactAt ?? lead.createdAt, now.getTime())}
        </Text>
        {lead.stage !== "lost" ? (
          <>
            <Tap
              onPress={() => onStep(-1)}
              disabled={pending || i <= 0}
              accessibilityRole="button"
              accessibilityLabel={`Mover a ${i > 0 ? STAGE_LABEL[BOARD[i - 1]].toLowerCase() : "la fase anterior"}`}
              style={[arrow, i <= 0 && { opacity: 0.3 }]}
            >
              <ChevronLeft size={18} color={C.muted} />
            </Tap>
            <Tap
              onPress={() => onStep(1)}
              disabled={pending || i >= BOARD.length - 1}
              accessibilityRole="button"
              accessibilityLabel={`Mover a ${i < BOARD.length - 1 ? STAGE_LABEL[BOARD[i + 1]].toLowerCase() : "la fase siguiente"}`}
              style={[arrow, i >= BOARD.length - 1 && { opacity: 0.3 }]}
            >
              <ChevronRight size={18} color={C.muted} />
            </Tap>
          </>
        ) : null}
      </View>
    </View>
  );
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ flex: 1, borderRadius: R.sm, backgroundColor: C.input, paddingVertical: 5, alignItems: "center" }}>
      <Text style={{ fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", color: C.muted }} maxFontSizeMultiplier={1.2}>{label}</Text>
      <Text style={{ fontSize: 12.5, fontFamily: FONT.semibold, color: warn ? C.warning : C.text }} maxFontSizeMultiplier={1.2}>{value}</Text>
    </View>
  );
}
