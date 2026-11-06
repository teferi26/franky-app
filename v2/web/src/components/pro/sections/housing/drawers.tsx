"use client";

import * as React from "react";
import {
  ArrowUpRight,
  CalendarPlus,
  Check,
  Copy,
  FileSignature,
  FileText,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  UserMinus,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { LeadStage, ProIncident, ProLead, ProOffer, ProProperty, ProRoom, ProTenant, ProVisit } from "@/lib/pro/types";
import { addDays, atLocal, dayLabel, localDate, minutesToLabel, money, relative, time } from "@/lib/pro/format";
import {
  CONTRACT_LABEL,
  GVA_URL,
  LOST_REASONS,
  ROOM_STATUS,
  STAGES,
  VISIT_MINUTES,
  VISIT_STATUS,
  ZONES,
  addMonths,
  currentTenants,
  findRoom,
  nextVisitDays,
  roomieSuggestions,
  shortDate,
  uniShort,
  visitLink,
  visitSlots,
} from "@/lib/pro/housing";
import { UNIVERSITIES } from "@/lib/pro/demo/common";
import type { ProEnergyLetter } from "@/lib/pro/housing-types";
import {
  DEPOSIT_FORMS,
  ENERGY_LETTERS,
  TRADE_LABEL,
  canPublish,
  closeMoveOut,
  complianceGaps,
  depositCountdown,
  depositDeadline,
  depositMonths,
  housingOpsOf,
  incidentOpenMinutes,
  patchTenant,
  providerText,
  renewalState,
  reserveWholeFlat,
  settlement,
  temporalityReason,
  signGroup,
  visitConfirmText,
  whatsappHref as waHref,
  withOps,
} from "@/lib/pro/housing-ops";
import { contractHtml } from "@/lib/pro/housing-docs";
import { waitingLabel } from "@/lib/pro/housing";
import { DocsChecklist, FitBox, FlatCompat, QuickReplies } from "./lead-tools";
import { KeysLine, MoveOutFlow, RenewalBox, RentLedgerBox, moveOutDraft, type MoveOutDraft } from "./tenant-tools";
import { ComplianceBox, EnergyBadge, KeysBox, OwnerField, RulesBox } from "./property-tools";
import { openPrintable, slugFile } from "./output";
import { DepositLateNote, IncidentPhotos, SuggestedProvider, TemporalityProofLine } from "./desk-tools";
import { PropertyHistoryBox, RoomsVsWholeBox, SharePropertyBox } from "./property-extras";
import { hasStoredDocs, purgeTenantDocs, tenantContractInput } from "@/lib/pro/housing-desk";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Detail, Drawer, FormField, Pill, Segmented, inputClass, textareaClass } from "../../kit";
import { BudgetFit, ErasmusBadge, PropertyCover, RoomChip, RoomTraits, RoomieBadge, UniBadge, dayChip, euros, selectClass, staffName } from "./shared";

const closed = (onClose: () => void) => (
  <Drawer open={false} onOpenChange={onClose} title="">
    {null}
  </Drawer>
);

/* ------------------------------------------------------------------ */
/* Elegir día y franja de visita                                       */
/* ------------------------------------------------------------------ */

export function SlotPicker({
  day,
  slot,
  onDay,
  onSlot,
}: {
  day: string;
  slot: number | null;
  onDay: (d: string) => void;
  onSlot: (m: number) => void;
}) {
  const { data, now } = usePro();
  const today = localDate(now);
  const days = nextVisitDays(data, now, 6);
  const slots = day ? visitSlots(data, day, now) : [];
  return (
    <div className="flex flex-col gap-3">
      <FormField label="Día">
        <div className="flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === day}
              onClick={() => onDay(d)}
              className={cn(
                "h-10 rounded-xl border px-3 text-sm font-semibold capitalize transition-colors",
                d === day ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
              )}
            >
              {dayChip(d, today)}
            </button>
          ))}
          {!days.length ? <p className="text-sm text-text-muted">No hay franjas libres en las próximas dos semanas. Amplía tu horario de visitas.</p> : null}
        </div>
      </FormField>
      {day ? (
        <FormField label="Hora" hint={`Visitas de ${VISIT_MINUTES} minutos dentro de tus franjas.`}>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === slot}
                onClick={() => onSlot(m)}
                className={cn(
                  "h-9 rounded-lg border px-2.5 text-sm font-semibold tabular transition-colors",
                  m === slot ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-text-secondary hover:border-text-primary/25",
                )}
              >
                {minutesToLabel(m)}
              </button>
            ))}
            {!slots.length ? <p className="text-sm text-text-muted">Ese día ya no quedan franjas.</p> : null}
          </div>
        </FormField>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interesado                                                          */
/* ------------------------------------------------------------------ */

export function LeadDrawer({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { data } = usePro();
  const lead = data.leads.find((l) => l.id === leadId);
  if (!lead) return closed(onClose);
  return <LeadDrawerBody key={lead.id} lead={lead} onClose={onClose} />;
}

function LeadDrawerBody({ lead, onClose }: { lead: ProLead; onClose: () => void }) {
  const { data, update, now, vertical } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const isAgency = data.staff.length > 1;
  const { property, room } = findRoom(data, lead.propertyId, lead.roomId);
  const [mode, setMode] = React.useState<"view" | "visit" | "contract" | "lost">("view");
  const [day, setDay] = React.useState("");
  const [slot, setSlot] = React.useState<number | null>(null);
  const [visitMode, setVisitMode] = React.useState<ProVisit["mode"]>(lead.erasmus ? "video" : "in_person");
  const [kind, setKind] = React.useState<ProTenant["contractKind"]>(lead.months >= 11 ? "habitacion" : "temporada");
  const [start, setStart] = React.useState(lead.moveIn.slice(0, 10) < today ? today : lead.moveIn.slice(0, 10));
  const [months, setMonths] = React.useState(String(lead.months));
  const [rent, setRent] = React.useState(String((room?.priceCents ?? lead.budgetCents) / 100));
  const [reason, setReason] = React.useState(LOST_REASONS[0]);
  const [why, setWhy] = React.useState(lead.contract?.reason ?? temporalityReason(lead.university, lead.moveIn.slice(0, 10) < today ? today : lead.moveIn.slice(0, 10)));
  const [utilities, setUtilities] = React.useState<NonNullable<ProLead["contract"]>["utilities"]>(
    lead.contract?.utilities ?? (property?.utilitiesCapCents ? "cap" : "split"),
  );
  const [cap, setCap] = React.useState(String((lead.contract?.utilitiesCapCents ?? property?.utilitiesCapCents ?? 4000) / 100));

  const visits = data.visits.filter((v) => v.leadId === lead.id).sort((a, b) => b.start.localeCompare(a.start));
  const firstName = lead.name.split(" ")[0];

  const patch = (label: string, fields: Partial<ProLead>) =>
    update(label, (d) => ({ ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, ...fields } : l)) }));

  const setRoomStatus = (d: typeof data, propertyId: string | undefined, roomId: string | undefined, fields: Partial<ProRoom>) => ({
    ...d,
    properties: d.properties.map((p) =>
      p.id === propertyId ? { ...p, rooms: p.rooms.map((r) => (r.id === roomId ? { ...r, ...fields } : r)) } : p,
    ),
  });

  const moveStage = (stage: LeadStage) => {
    patch("lead.stage", { stage, lastContactAt: stage === "new" ? lead.lastContactAt : new Date().toISOString() });
    toast.success(`${firstName} pasa a ${STAGES.find((s) => s.id === stage)?.label.toLowerCase()}`);
  };

  const proposeVisit = () => {
    if (!day || slot === null) return;
    const visit: ProVisit = {
      id: localId("v"),
      leadId: lead.id,
      propertyId: lead.propertyId ?? data.properties[0]?.id ?? "",
      start: atLocal(day, slot),
      mode: visitMode,
      status: "scheduled",
      agentId: lead.agentId ?? property?.agentId,
    };
    update("visit.propose", (d) => ({
      ...d,
      visits: [...d.visits, visit],
      leads: d.leads.map((l) =>
        l.id === lead.id ? { ...l, stage: l.stage === "new" || l.stage === "contacted" ? "visit" : l.stage, lastContactAt: new Date().toISOString() } : l,
      ),
    }));
    toast.success("Visita propuesta", `${firstName} la confirma desde Franky. ${dayChip(day, today)} a las ${minutesToLabel(slot)}.`);
    setMode("view");
  };

  const sendContract = () => {
    const rentCents = euros(rent);
    const extras = {
      reason: kind === "temporada" ? why.trim() || undefined : undefined,
      utilities,
      utilitiesCapCents: utilities === "cap" ? euros(cap) : undefined,
    };
    const contract = { kind, start, months: Math.max(1, Number(months) || 1), rentCents, ...extras };
    if (lead.roomieGroup && lead.propertyId) {
      // Un grupo reserva todas las habitaciones del piso a la vez.
      const at = new Date().toISOString();
      const propertyId = lead.propertyId;
      update("lead.group.reserve", (d) => {
        const next = reserveWholeFlat(d, lead.id, propertyId, start, at);
        return {
          ...next,
          leads: next.leads.map((l) => (l.id === lead.id && l.contract ? { ...l, contract: { ...l.contract, ...extras, kind, months: contract.months } } : l)),
        };
      });
      toast.success("Piso entero reservado", `${lead.roomieGroup.size} habitaciones apartadas para el grupo de ${firstName}.`);
      setMode("view");
      return;
    }
    update("lead.contract", (d) => {
      const next = {
        ...d,
        leads: d.leads.map((l) =>
          l.id === lead.id ? { ...l, stage: "reserved" as LeadStage, contractSentAt: new Date().toISOString(), contract, lastContactAt: new Date().toISOString() } : l,
        ),
      };
      return room && room.status === "free" ? setRoomStatus(next, lead.propertyId, lead.roomId, { status: "reserved", availableFrom: start }) : next;
    });
    toast.success("Contrato enviado", `${firstName} lo firma desde el móvil. La habitación queda reservada.`);
    setMode("view");
  };

  const markSigned = () => {
    if (lead.roomieGroup && lead.contract && property) {
      update("lead.group.signed", (d) => signGroup(d, lead.id, new Date()));
      toast.success("Contrato firmado", `El grupo de ${firstName} ya son inquilinos. Te avisamos del plazo de cada fianza.`);
      onClose();
      return;
    }
    if (!property || !room) return;
    const c = lead.contract ?? { kind, start, months: lead.months, rentCents: room.priceCents };
    const end = addDays(addMonths(c.start, c.months), -1);
    const tenant: ProTenant = {
      id: localId("t"),
      name: lead.name,
      university: lead.university,
      propertyId: property.id,
      roomId: room.id,
      rentCents: c.rentCents,
      contractStart: c.start,
      contractEnd: end,
      contractKind: c.kind,
      deposit: { amountCents: c.rentCents * depositMonths(c.kind), status: "pending", dueAt: depositDeadline(c.start) },
      rentStatus: c.start <= today ? "pending" : "paid",
      docs: lead.docs,
    };
    update("lead.signed", (d) => {
      const next = {
        ...d,
        tenants: [...d.tenants, tenant],
        leads: d.leads.map((l) => (l.id === lead.id ? { ...l, stage: "signed" as LeadStage, lastContactAt: new Date().toISOString() } : l)),
      };
      return setRoomStatus(next, property.id, room.id, { status: "occupied", tenantId: tenant.id, availableFrom: addDays(end, 1) });
    });
    toast.success("Contrato firmado", `${firstName} ya es inquilino. Te avisaremos del plazo para depositar la fianza.`);
    onClose();
  };

  const markLost = () => {
    update("lead.lost", (d) => {
      const next = { ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, stage: "lost" as LeadStage, lostReason: reason } : l)) };
      return room?.status === "reserved" && lead.stage === "reserved" ? setRoomStatus(next, lead.propertyId, lead.roomId, { status: "free", availableFrom: today }) : next;
    });
    toast.success("Marcado como perdido", reason);
    onClose();
  };

  const printContract = () => {
    if (!lead.contract || !property) return;
    const html = contractHtml(data, {
      tenantName: lead.name,
      university: lead.university,
      property,
      room,
      contract: lead.contract,
      docs: lead.docs,
      group: lead.roomieGroup?.names.map((n, i) => (i === 0 ? lead.name : n)),
    });
    openPrintable(html, slugFile("contrato", lead.name));
  };

  const footer = (() => {
    if (mode === "visit")
      return (
        <>
          <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
          <Button variant="dark" onClick={proposeVisit} disabled={!day || slot === null}>
            <CalendarPlus className="h-4 w-4" /> Proponer visita
          </Button>
        </>
      );
    if (mode === "contract")
      return (
        <>
          <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
          <Button variant="dark" onClick={sendContract} disabled={(!room && !(lead.roomieGroup && property)) || !start || euros(rent) <= 0}>
            <FileSignature className="h-4 w-4" /> {lead.roomieGroup ? "Reservar el piso entero" : "Enviar para firmar"}
          </Button>
        </>
      );
    if (mode === "lost")
      return (
        <>
          <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
          <Button variant="destructive" onClick={markLost}>Marcar como perdido</Button>
        </>
      );
    return (
      <>
        {lead.stage !== "lost" && lead.stage !== "signed" ? (
          <Button variant="ghost" onClick={() => setMode("lost")}>Perdido</Button>
        ) : null}
        {lead.stage !== "signed" && lead.stage !== "lost" && lead.stage !== "reserved" ? (
          <Button variant="secondary" onClick={() => setMode("visit")}>
            <CalendarPlus className="h-4 w-4" /> Proponer visita
          </Button>
        ) : null}
        {lead.stage === "reserved" && lead.contractSentAt ? (
          <Button variant="dark" onClick={markSigned} disabled={!room && !(lead.roomieGroup && property)}>
            <Check className="h-4 w-4" /> Marcar firmado
          </Button>
        ) : lead.stage !== "signed" && lead.stage !== "lost" ? (
          <Button variant="dark" onClick={() => setMode("contract")}>
            <FileSignature className="h-4 w-4" /> Enviar contrato
          </Button>
        ) : null}
      </>
    );
  })();

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      wide
      title={lead.name}
      description={`${lead.studies} · llegó ${relative(lead.createdAt, now.getTime())}`}
      footer={footer}
    >
      {mode === "visit" ? (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-text-secondary">
            {firstName} recibe la propuesta en Franky y la confirma con un toque. {property ? `Piso: ${property.title}.` : ""}
          </p>
          <SlotPicker day={day} slot={slot} onDay={(d) => { setDay(d); setSlot(null); }} onSlot={setSlot} />
          <FormField label="Cómo">
            <ChoiceChips
              value={visitMode}
              onChange={setVisitMode}
              options={[
                { value: "in_person", label: "En el piso", hint: "Presencial" },
                { value: "video", label: "Por vídeo", hint: lead.erasmus ? "Ideal si aún no ha llegado" : "Videollamada" },
              ]}
            />
          </FormField>
        </div>
      ) : mode === "contract" ? (
        <div className="flex flex-col gap-5">
          {room && property ? (
            <div className="rounded-xl border border-border p-3 text-sm">
              <p className="font-semibold">{property.title}, {room.name.toLowerCase()}</p>
              <RoomTraits room={room} />
            </div>
          ) : lead.roomieGroup && property ? (
            <div className="rounded-xl border border-violet/25 bg-violet-50/60 p-3 text-sm dark:bg-violet-950/20">
              <p className="font-semibold">{property.title} entero</p>
              <p className="text-xs text-text-secondary">
                {lead.roomieGroup.size} habitaciones para el grupo. La renta es por persona y cada uno firma su parte.
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Elige antes el piso y la habitación en la ficha del interesado.
            </p>
          )}
          <FormField label="Tipo de contrato">
            <ChoiceChips
              value={kind}
              onChange={setKind}
              options={[
                { value: "temporada", label: "Temporada", hint: "El curso o un cuatrimestre" },
                { value: "habitacion", label: "Habitación", hint: "Un año, renovable" },
              ]}
            />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Entrada" htmlFor="lc-start">
              <input id="lc-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="Meses" htmlFor="lc-months">
              <input id="lc-months" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="Renta (€)" htmlFor="lc-rent">
              <input id="lc-rent" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} className={inputClass} />
            </FormField>
          </div>
          {kind === "temporada" ? (
            <FormField label="Motivo de la temporada" htmlFor="lc-why" hint="Lo que hace que el contrato sea de temporada y no de vivienda habitual.">
              <input id="lc-why" value={why} onChange={(e) => setWhy(e.target.value)} className={inputClass} />
            </FormField>
          ) : null}
          <TemporalityProofLine kind={kind} docs={lead.docs} personName={lead.name} onRequested={(docs) => patch("lead.docs", { docs })} />
          <FormField label="Suministros">
            <ChoiceChips
              value={utilities ?? "split"}
              onChange={setUtilities}
              options={[
                { value: "split", label: "Aparte", hint: "Por días de estancia" },
                { value: "cap", label: "Con tope", hint: "Incluidos hasta un límite" },
                { value: "included", label: "Incluidos", hint: "En la renta" },
              ]}
            />
          </FormField>
          {utilities === "cap" ? (
            <FormField label="Tope al mes por persona (€)" htmlFor="lc-cap">
              <input id="lc-cap" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className={cn(inputClass, "w-32")} />
            </FormField>
          ) : null}
          <div className="rounded-xl bg-bg-secondary px-3 py-2.5 text-sm">
            <Detail label="Fianza">{money(euros(rent) * depositMonths(kind))}</Detail>
            <Detail label="Fin del contrato">{start ? shortDate(addDays(addMonths(start, Number(months) || 1), -1)) : "Sin fecha"}</Detail>
            <Detail label="Depositar la fianza">{start ? `antes del ${shortDate(depositDeadline(start))}` : "Sin fecha"}</Detail>
          </div>
        </div>
      ) : mode === "lost" ? (
        <FormField label={`¿Por qué no sigue ${firstName}?`} hint="Te sirve para ver dónde pierdes interesados.">
          <div className="flex flex-col gap-1.5">
            {LOST_REASONS.map((r) => (
              <label key={r} className={cn("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm", reason === r ? "border-violet bg-violet-50" : "border-border")}>
                <input type="radio" name="lost" checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--color-violet)]" />
                {r}
              </label>
            ))}
          </div>
        </FormField>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <UniBadge university={lead.university} verified={lead.verified} long />
            {lead.source === "manual" ? <Pill>Añadido a mano</Pill> : <Pill tone="violet">Vino por Franky</Pill>}
            {lead.erasmus ? <ErasmusBadge /> : null}
            {lead.roomieGroup ? <RoomieBadge group={lead.roomieGroup} /> : null}
            {lead.guarantor ? <Pill tone="success">Con avalista</Pill> : null}
            {lead.stage === "lost" ? <Pill tone="danger">Perdido{lead.lostReason ? `: ${lead.lostReason.toLowerCase()}` : ""}</Pill> : null}
          </div>

          <blockquote className="rounded-2xl bg-bg-secondary px-4 py-3 text-sm leading-relaxed text-text-secondary">“{lead.message}”</blockquote>

          {lead.stage === "new" || lead.stage === "contacted" || lead.stage === "visit" ? <FitBox lead={lead} /> : null}
          {lead.stage !== "signed" && lead.stage !== "lost" ? <QuickReplies lead={lead} /> : null}

          {lead.stage !== "lost" ? (
            <FormField label="Fase">
              <Segmented
                size="sm"
                label="Fase del interesado"
                value={lead.stage}
                onChange={moveStage}
                options={STAGES.filter((s) => s.id !== "lost").map((s) => ({ value: s.id, label: s.label }))}
              />
            </FormField>
          ) : (
            <Button variant="outline" size="sm" className="w-fit" onClick={() => moveStage("contacted")}>
              Recuperar interesado
            </Button>
          )}

          <div className="divide-y divide-border-light">
            <Detail label="Universidad">{lead.university}</Detail>
            <Detail label="Entrada">{dayLabel(`${lead.moveIn.slice(0, 10)}T12:00:00Z`, { weekday: false })}</Detail>
            <Detail label="Estancia">{lead.months} meses</Detail>
            <Detail label="Presupuesto">
              <span className="tabular">hasta {money(lead.budgetCents)}/mes</span>
            </Detail>
            <Detail label="Avalista">{lead.guarantor ? "Sí, sus padres" : "No lo ha indicado"}</Detail>
            {lead.contractSentAt ? <Detail label="Contrato">Enviado {relative(lead.contractSentAt, now.getTime())}, pendiente de firma</Detail> : null}
          </div>

          {lead.contract && property ? (
            <TemporalityProofLine kind={lead.contract.kind} docs={lead.docs} personName={lead.name} onRequested={(docs) => patch("lead.docs", { docs })} />
          ) : null}
          {lead.contract && property ? (
            <Button variant="outline" className="w-fit" onClick={printContract}>
              <FileText className="h-4 w-4" /> Abrir el contrato para imprimir
            </Button>
          ) : null}

          {lead.stage === "visit" || lead.stage === "reserved" || lead.docs ? (
            <DocsChecklist
              personName={lead.name}
              docs={lead.docs}
              onChange={(docs) => patch("lead.docs", { docs, guarantor: Boolean(docs.guarantor?.name) || lead.guarantor })}
            />
          ) : null}

          <LeadRoomPicker lead={lead} />

          {lead.roomieGroup ? <GroupBox lead={lead} /> : null}

          {isAgency ? (
            <FormField label="Agente" htmlFor="ld-agent">
              <select
                id="ld-agent"
                value={lead.agentId ?? ""}
                onChange={(e) => {
                  patch("lead.agent", { agentId: e.target.value || undefined });
                  toast.success("Asignado", `${staffName(data, e.target.value) ?? "Sin agente"} se encarga de ${firstName}.`);
                }}
                className={selectClass}
              >
                <option value="">Sin asignar</option>
                {data.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}

          {visits.length ? (
            <div>
              <p className="eyebrow mb-1.5">Visitas</p>
              <ul className="flex flex-col gap-1.5">
                {visits.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 text-sm">
                    {v.mode === "video" ? <Video className="h-3.5 w-3.5 text-text-muted" /> : <MapPin className="h-3.5 w-3.5 text-text-muted" />}
                    <span className="min-w-0 flex-1 truncate">
                      {dayLabel(v.start, { weekday: true })}, {time(v.start)}
                    </span>
                    <Pill tone={VISIT_STATUS[v.status].tone}>{VISIT_STATUS[v.status].label}</Pill>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-text-muted">
            {vertical.id === "landlord" ? "Tú decides" : "Tu equipo decide"} a quién enseñar el piso. Su teléfono se comparte cuando acepta la visita.
          </p>
        </div>
      )}
    </Drawer>
  );
}

function LeadRoomPicker({ lead }: { lead: ProLead }) {
  const { data, update } = usePro();
  const toast = useToast();
  const { property, room } = findRoom(data, lead.propertyId, lead.roomId);
  const set = (propertyId?: string, roomId?: string) =>
    update("lead.room", (d) => ({ ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, propertyId, roomId } : l)) }));
  return (
    <div className="rounded-2xl border border-border p-3.5">
      <p className="eyebrow">Piso y habitación</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="sr-only" htmlFor="ld-prop">Piso</label>
        <select
          id="ld-prop"
          value={lead.propertyId ?? ""}
          onChange={(e) => {
            const p = data.properties.find((x) => x.id === e.target.value);
            const firstFree = p?.rooms.find((r) => r.status === "free" || r.status === "leaving");
            set(p?.id, lead.roomieGroup ? undefined : firstFree?.id);
          }}
          className={selectClass}
        >
          <option value="">Sin piso todavía</option>
          {data.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {property && !lead.roomieGroup ? (
          <>
            <label className="sr-only" htmlFor="ld-room">Habitación</label>
            <select
              id="ld-room"
              value={lead.roomId ?? ""}
              onChange={(e) => {
                set(property.id, e.target.value || undefined);
                toast.success("Habitación asignada");
              }}
              className={selectClass}
            >
              <option value="">Cualquier habitación</option>
              {property.rooms.map((r) => (
                <option key={r.id} value={r.id} disabled={r.status === "occupied"}>
                  {r.name}, {Math.round(r.priceCents / 100)} € ({ROOM_STATUS[r.status].label.toLowerCase()})
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>
      {property ? (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {property.rooms.map((r) => (
              <RoomChip key={r.id} room={r} onClick={r.status !== "occupied" && !lead.roomieGroup ? () => set(property.id, r.id) : undefined} />
            ))}
          </div>
          {room ? <BudgetFit budgetCents={lead.budgetCents} priceCents={room.priceCents} /> : null}
        </div>
      ) : null}
      {property && !lead.roomieGroup ? (
        <p className="mt-2">
          <FlatCompat personId={lead.id} propertyId={property.id} />
        </p>
      ) : null}
    </div>
  );
}

function GroupBox({ lead }: { lead: ProLead }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const group = lead.roomieGroup!;
  const fits = data.properties.filter((p) => p.rooms.filter((r) => r.status === "free").length >= group.size);
  return (
    <div className="rounded-2xl border border-violet/25 bg-violet-50/60 p-3.5 dark:bg-violet-950/20">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-deep">
        <Users className="h-4 w-4" strokeWidth={1.9} /> Grupo formado por Roomie
      </p>
      <p className="mt-0.5 text-xs text-text-secondary">
        {group.size} estudiantes, {group.compatibility} % compatibles en horarios, limpieza y ruido. Buscan piso entero, presupuesto por persona.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {group.names.map((n) => (
          <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-bg-primary px-2 py-1 text-xs font-semibold">
            <Avatar name={n} size="xs" tone="violet" /> {n}
          </span>
        ))}
      </div>
      {fits.length ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {fits.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-xl bg-bg-primary px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.title}</span>
                <span className="text-xs text-text-muted tabular">
                  {p.rooms.length} habitaciones · {money(p.wholeFlatPriceCents ?? p.rooms.reduce((a, r) => a + r.priceCents, 0))}/mes entero
                </span>
              </span>
              {lead.propertyId === p.id && lead.stage !== "reserved" && lead.stage !== "signed" ? (
                <Button
                  size="sm"
                  variant="dark"
                  onClick={() => {
                    const start = lead.moveIn.slice(0, 10) < today ? today : lead.moveIn.slice(0, 10);
                    update("lead.group.reserve", (d) => reserveWholeFlat(d, lead.id, p.id, start, new Date().toISOString()));
                    toast.success("Piso entero reservado", `Todas las habitaciones de ${p.title} quedan para el grupo de ${group.names[0]}.`);
                  }}
                >
                  Reservar entero
                </Button>
              ) : null}
              <Button
                size="sm"
                variant={lead.propertyId === p.id ? "outline" : "secondary"}
                onClick={() => {
                  update("lead.group.offer", (d) => ({
                    ...d,
                    leads: d.leads.map((l) =>
                      l.id === lead.id ? { ...l, propertyId: p.id, roomId: undefined, stage: l.stage === "new" ? "contacted" : l.stage, lastContactAt: new Date().toISOString() } : l,
                    ),
                  }));
                  toast.success("Piso entero propuesto", `El grupo de ${group.names[0]} lo recibe en Franky.`);
                }}
              >
                {lead.propertyId === p.id ? "Propuesto" : "Ofrecer entero"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-text-muted">Ahora no tienes pisos con {group.size} habitaciones libres a la vez.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo interesado (el que llama o escribe por fuera de Franky)       */
/* ------------------------------------------------------------------ */

export function NewLeadDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [uni, setUni] = React.useState(UNIVERSITIES[0]);
  const [studies, setStudies] = React.useState("");
  const [moveIn, setMoveIn] = React.useState(addDays(localDate(now), 14));
  const [months, setMonths] = React.useState("10");
  const [budget, setBudget] = React.useState("350");
  const [propertyId, setPropertyId] = React.useState("");
  const [message, setMessage] = React.useState("");

  const valid = name.trim().length > 2 && euros(budget) > 0 && moveIn;
  const create = () => {
    const lead: ProLead = {
      id: localId("l"),
      name: name.trim(),
      university: uni,
      studies: studies.trim() || "Sin indicar",
      verified: false,
      erasmus: false,
      budgetCents: euros(budget),
      moveIn,
      months: Math.max(1, Number(months) || 1),
      propertyId: propertyId || undefined,
      stage: "contacted",
      message: message.trim() || "Añadido a mano por teléfono o en la oficina.",
      createdAt: new Date().toISOString(),
      lastContactAt: new Date().toISOString(),
      guarantor: false,
      source: "manual",
    };
    update("lead.create", (d) => ({ ...d, leads: [lead, ...d.leads] }));
    toast.success("Interesado añadido", "Cuando se registre en Franky verás su universidad verificada.");
    setName("");
    setStudies("");
    setMessage("");
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Añadir interesado"
      description="Para quien te llama o pasa por la oficina. Los que llegan por Franky entran solos."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={create} disabled={!valid}>Añadir</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre y apellido" htmlFor="nl-name">
          <input id="nl-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Marta López" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Universidad" htmlFor="nl-uni">
            <select id="nl-uni" value={uni} onChange={(e) => setUni(e.target.value)} className={selectClass}>
              {UNIVERSITIES.map((u) => (
                <option key={u} value={u}>
                  {uniShort(u)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Estudios" htmlFor="nl-studies">
            <input id="nl-studies" value={studies} onChange={(e) => setStudies(e.target.value)} className={inputClass} placeholder="Enfermería" />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Entrada" htmlFor="nl-in">
            <input id="nl-in" type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Meses" htmlFor="nl-months">
            <input id="nl-months" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Hasta (€)" htmlFor="nl-budget">
            <input id="nl-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="Piso que le interesa" htmlFor="nl-prop">
          <select id="nl-prop" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectClass}>
            <option value="">Aún no lo sabe</option>
            {data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Nota" htmlFor="nl-msg">
          <textarea id="nl-msg" value={message} onChange={(e) => setMessage(e.target.value)} className={textareaClass} placeholder="Qué busca, cuándo puede ver el piso..." />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Visita                                                              */
/* ------------------------------------------------------------------ */

export function VisitDrawer({ visitId, onClose, onOpenLead }: { visitId: string | null; onClose: () => void; onOpenLead?: (leadId: string) => void }) {
  const { data } = usePro();
  const visit = data.visits.find((v) => v.id === visitId);
  if (!visit) return closed(onClose);
  return <VisitDrawerBody key={visit.id} visit={visit} onClose={onClose} onOpenLead={onOpenLead} />;
}

function VisitDrawerBody({ visit, onClose, onOpenLead }: { visit: ProVisit; onClose: () => void; onOpenLead?: (leadId: string) => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const [mode, setMode] = React.useState<"view" | "move">("view");
  const [day, setDay] = React.useState("");
  const [slot, setSlot] = React.useState<number | null>(null);
  const lead = data.leads.find((l) => l.id === visit.leadId);
  const property = data.properties.find((p) => p.id === visit.propertyId);
  const isAgency = data.staff.length > 1;
  const link = visitLink(visit.id);
  const firstName = lead?.name.split(" ")[0] ?? "El interesado";

  const patch = (label: string, fields: Partial<ProVisit>) =>
    update(label, (d) => ({ ...d, visits: d.visits.map((v) => (v.id === visit.id ? { ...v, ...fields } : v)) }));

  const setStatus = (status: ProVisit["status"]) => {
    patch(`visit.${status}`, { status });
    if (status === "done") toast.success("Visita hecha", `Si a ${firstName} le ha gustado, envíale el contrato desde su ficha.`);
    else if (status === "no_show") toast.success("Marcada como no vino", "Cuenta en su historial para la próxima vez.");
    else if (status === "cancelled") {
      toast.success("Visita cancelada", `Avisamos a ${firstName} en Franky.`);
      onClose();
    }
  };

  const move = () => {
    if (!day || slot === null) return;
    patch("visit.move", { start: atLocal(day, slot), status: "scheduled", confirmedAt: undefined });
    toast.success("Visita movida", `${dayLabel(atLocal(day, slot))} a las ${minutesToLabel(slot)}. ${firstName} recibe el cambio.`);
    setMode("view");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Enlace copiado");
    } catch {
      toast.info("Copia el enlace", link);
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Visita de ${lead?.name ?? "interesado"}`}
      description={`${dayLabel(visit.start)} a las ${time(visit.start)}`}
      footer={
        mode === "move" ? (
          <>
            <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
            <Button variant="dark" onClick={move} disabled={!day || slot === null}>Mover visita</Button>
          </>
        ) : visit.status === "scheduled" ? (
          <>
            <Button variant="ghost" onClick={() => setStatus("cancelled")}>Cancelar</Button>
            <Button variant="outline" onClick={() => setMode("move")}>Reprogramar</Button>
            <Button variant="outline" onClick={() => setStatus("no_show")}>No vino</Button>
            <Button variant="dark" onClick={() => setStatus("done")}>
              <Check className="h-4 w-4" /> Hecha
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setMode("move")}>Nueva fecha</Button>
            {lead && onOpenLead ? (
              <Button variant="dark" onClick={() => onOpenLead(lead.id)}>Abrir interesado</Button>
            ) : null}
          </>
        )
      }
    >
      {mode === "move" ? (
        <SlotPicker day={day} slot={slot} onDay={(d) => { setDay(d); setSlot(null); }} onSlot={setSlot} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={VISIT_STATUS[visit.status].tone}>{VISIT_STATUS[visit.status].label}</Pill>
            {visit.mode === "video" ? (
              <Pill tone="info">
                <Video className="h-3 w-3" /> Por vídeo
              </Pill>
            ) : (
              <Pill>
                <MapPin className="h-3 w-3" /> En el piso
              </Pill>
            )}
            {lead ? <UniBadge university={lead.university} verified={lead.verified} /> : null}
            {lead?.roomieGroup ? <RoomieBadge group={lead.roomieGroup} /> : null}
            {visit.source === "public" ? <Pill tone="violet">La pidió desde la ficha del piso</Pill> : null}
          </div>
          {visit.status === "scheduled" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-3">
              <span className="text-sm">
                {visit.confirmedAt ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                    <Check className="h-4 w-4" /> Confirmada {relative(visit.confirmedAt, now.getTime())}
                  </span>
                ) : (
                  <>
                    <span className="block font-semibold">Sin confirmar</span>
                    <span className="text-xs text-text-muted">Pídele que confirme la víspera y evita plantones.</span>
                  </>
                )}
              </span>
              {!visit.confirmedAt ? (
                <span className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" asChild>
                    <a href={waHref(visitConfirmText(data, visit))} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-3.5 w-3.5" /> Pedir confirmación
                    </a>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => patch("visit.confirm", { confirmedAt: new Date().toISOString() })}>
                    Ha confirmado
                  </Button>
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="divide-y divide-border-light">
            <Detail label="Piso">{property?.title ?? "Sin piso"}</Detail>
            <Detail label="Dirección">{property?.address ?? ""}</Detail>
            {lead ? <Detail label="Busca">entrada {shortDate(lead.moveIn)}, {lead.months} meses, hasta {money(lead.budgetCents)}</Detail> : null}
            {lead ? <Detail label="Estudia">{lead.studies}</Detail> : null}
          </div>
          {isAgency ? (
            <FormField label="Quién la hace" htmlFor="vd-agent">
              <select
                id="vd-agent"
                value={visit.agentId ?? ""}
                onChange={(e) => {
                  patch("visit.agent", { agentId: e.target.value || undefined });
                  toast.success("Visita reasignada", staffName(data, e.target.value) ?? "Sin agente");
                }}
                className={selectClass}
              >
                <option value="">Sin asignar</option>
                {data.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
          <FormField label="Formato">
            <ChoiceChips
              value={visit.mode}
              onChange={(m) => patch("visit.mode", { mode: m })}
              options={[
                { value: "in_person", label: "En el piso" },
                { value: "video", label: "Por vídeo" },
              ]}
            />
          </FormField>
          {visit.mode === "video" ? (
            <div className="rounded-2xl border border-border p-3.5">
              <p className="text-sm font-semibold">Enlace de la videollamada</p>
              <p className="mt-1 break-all text-xs text-text-muted">{link}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={copy}>
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <a href={link} target="_blank" rel="noreferrer">
                    <Video className="h-3.5 w-3.5" /> Entrar
                  </a>
                </Button>
              </div>
              <p className="mt-2 text-xs text-text-muted">{firstName} lo tiene en su Franky. Enseña cada habitación con la cámara trasera y la luz encendida.</p>
            </div>
          ) : null}
          {lead ? (
            <blockquote className="rounded-2xl bg-bg-secondary px-4 py-3 text-sm text-text-secondary">“{lead.message}”</blockquote>
          ) : null}
          <p className="text-xs text-text-muted">Creada {relative(visit.start, now.getTime())}.</p>
        </div>
      )}
    </Drawer>
  );
}

export function NewVisitDrawer({ open, leadId, onClose }: { open: boolean; leadId?: string; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const active = data.leads.filter((l) => l.stage !== "lost" && l.stage !== "signed");
  const [pick, setPick] = React.useState(leadId ?? "");
  const [propertyId, setPropertyId] = React.useState("");
  const [day, setDay] = React.useState("");
  const [slot, setSlot] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<ProVisit["mode"]>("in_person");
  const [agentId, setAgentId] = React.useState("");
  const lead = data.leads.find((l) => l.id === pick);
  const prop = propertyId || lead?.propertyId || "";

  const create = () => {
    if (!lead || !prop || !day || slot === null) return;
    const visit: ProVisit = {
      id: localId("v"),
      leadId: lead.id,
      propertyId: prop,
      start: atLocal(day, slot),
      mode,
      status: "scheduled",
      agentId: agentId || lead.agentId || data.properties.find((p) => p.id === prop)?.agentId,
    };
    update("visit.create", (d) => ({
      ...d,
      visits: [...d.visits, visit],
      leads: d.leads.map((l) => (l.id === lead.id && (l.stage === "new" || l.stage === "contacted") ? { ...l, stage: "visit", propertyId: prop, lastContactAt: new Date().toISOString() } : l)),
    }));
    toast.success("Visita creada", `${lead.name.split(" ")[0]} la recibe en Franky. ${dayChip(day, localDate(now))} a las ${minutesToLabel(slot)}.`);
    setDay("");
    setSlot(null);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nueva visita"
      description="Elige interesado, piso y una franja libre."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={create} disabled={!lead || !prop || !day || slot === null}>Crear visita</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Interesado" htmlFor="nv-lead">
          <select id="nv-lead" value={pick} onChange={(e) => setPick(e.target.value)} className={selectClass}>
            <option value="">Elige un interesado</option>
            {active.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({uniShort(l.university)}, entrada {shortDate(l.moveIn)})
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Piso" htmlFor="nv-prop">
          <select id="nv-prop" value={prop} onChange={(e) => setPropertyId(e.target.value)} className={selectClass}>
            <option value="">Elige un piso</option>
            {data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </FormField>
        <SlotPicker day={day} slot={slot} onDay={(d) => { setDay(d); setSlot(null); }} onSlot={setSlot} />
        <FormField label="Formato">
          <ChoiceChips
            value={mode}
            onChange={setMode}
            options={[
              { value: "in_person", label: "En el piso" },
              { value: "video", label: "Por vídeo" },
            ]}
          />
        </FormField>
        {data.staff.length > 1 ? (
          <FormField label="Quién la hace" htmlFor="nv-agent">
            <select id="nv-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} className={selectClass}>
              <option value="">El agente del piso</option>
              {data.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Inquilino                                                           */
/* ------------------------------------------------------------------ */

export function TenantDrawer({ tenantId, onClose, startLeaving }: { tenantId: string | null; onClose: () => void; startLeaving?: boolean }) {
  const { data } = usePro();
  const tenant = data.tenants.find((t) => t.id === tenantId);
  if (!tenant) return closed(onClose);
  return <TenantDrawerBody key={tenant.id} tenant={tenant} onClose={onClose} startLeaving={startLeaving} />;
}

function TenantDrawerBody({ tenant, onClose, startLeaving }: { tenant: ProTenant; onClose: () => void; startLeaving?: boolean }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const { property, room } = findRoom(data, tenant.propertyId, tenant.roomId);
  const ended = tenant.contractEnd < today || Boolean(tenant.moveOut?.closedAt);
  const [mode, setMode] = React.useState<"view" | "leave" | "suggest" | "moveout">(
    startLeaving ? (tenant.leavingAt ? "suggest" : "leave") : "view",
  );
  const [leaveDate, setLeaveDate] = React.useState(tenant.leavingAt ?? tenant.contractEnd);
  const [draft, setDraft] = React.useState<MoveOutDraft>(() => moveOutDraft(tenant, room));
  const firstName = tenant.name.split(" ")[0];
  const incidents = data.incidents.filter((i) => i.propertyId === tenant.propertyId && i.tenantName === tenant.name);
  const suggestions = roomieSuggestions(data, tenant, now, 4);
  const endsSoon = !ended && tenant.contractEnd.slice(0, 10) <= addDays(today, 150);

  const patch = (label: string, fields: Partial<ProTenant>) =>
    update(label, (d) => ({ ...d, tenants: d.tenants.map((t) => (t.id === tenant.id ? { ...t, ...fields } : t)) }));

  const lodge = () => {
    update("tenant.deposit.lodged", (d) => patchTenant(d, tenant.id, (t) => ({ ...t, deposit: { ...t.deposit, status: "lodged" }, lodgedAt: today })));
    toast.success("Fianza depositada", "Guarda el justificante de la Generalitat con el contrato.");
  };
  const registerLeave = () => {
    update("tenant.leave", (d) => ({
      ...d,
      tenants: d.tenants.map((t) =>
        t.id === tenant.id
          ? { ...t, leavingAt: leaveDate, renewal: t.renewal ? { ...t.renewal, answer: "no" as const, answeredAt: new Date().toISOString() } : t.renewal }
          : t,
      ),
      properties: d.properties.map((p) =>
        p.id === tenant.propertyId
          ? { ...p, rooms: p.rooms.map((r) => (r.id === tenant.roomId ? { ...r, status: "leaving", availableFrom: addDays(leaveDate, 1) } : r)) }
          : p,
      ),
    }));
    toast.success("Salida registrada", `La habitación se libera el ${shortDate(addDays(leaveDate, 1))}. Roomie ya busca sustitutos.`);
    setMode("suggest");
  };
  const propose = (lead: ProLead) => {
    update("tenant.substitute", (d) => ({
      ...d,
      leads: d.leads.map((l) =>
        l.id === lead.id
          ? { ...l, propertyId: tenant.propertyId, roomId: tenant.roomId, stage: l.stage === "new" ? "contacted" : l.stage, lastContactAt: new Date().toISOString() }
          : l,
      ),
    }));
    toast.success("Habitación propuesta", `${lead.name.split(" ")[0]} ya la tiene asignada. Escríbele desde su ficha.`);
  };
  const closeOut = () => {
    const { returnCents } = settlement(tenant, draft.moveOut);
    update("tenant.moveout", (d) =>
      closeMoveOut(
        patchTenant(d, tenant.id, (t) => ({ ...t, inventory: draft.inventory })),
        tenant.id,
        draft.moveOut,
        new Date(),
      ),
    );
    toast.success("Salida cerrada", `Devuelves ${money(returnCents)} a ${firstName}. La habitación queda libre desde el ${shortDate(addDays(draft.moveOut.date, 1))}.`);
    setMode("view");
  };

  const printTenantContract = () => {
    const input = tenantContractInput(data, tenant);
    if (!input) return;
    openPrintable(contractHtml(data, input), slugFile("contrato", tenant.name));
  };

  const s = settlement(tenant, draft.moveOut);
  const footer =
    mode === "leave" ? (
      <>
        <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
        <Button variant="dark" onClick={registerLeave} disabled={!leaveDate}>
          <UserMinus className="h-4 w-4" /> Registrar salida
        </Button>
      </>
    ) : mode === "suggest" ? (
      <Button variant="ghost" onClick={() => setMode("view")}>Volver a la ficha</Button>
    ) : mode === "moveout" ? (
      <>
        <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
        <Button variant="dark" onClick={closeOut} disabled={!draft.moveOut.date}>
          <Check className="h-4 w-4" /> Cerrar y devolver {money(s.returnCents)}
        </Button>
      </>
    ) : tenant.moveOut?.closedAt ? null : ended || tenant.leavingAt ? (
      <>
        {tenant.leavingAt && !ended ? (
          <Button variant="outline" onClick={() => setMode("suggest")}>
            <Users className="h-4 w-4" /> Sustitutos
          </Button>
        ) : null}
        {tenant.deposit.status !== "returned" ? (
          <Button variant="dark" onClick={() => setMode("moveout")}>
            Salida y fianza
          </Button>
        ) : null}
      </>
    ) : (
      <Button variant="dark" onClick={() => setMode("leave")}>
        <UserMinus className="h-4 w-4" /> Registrar salida
      </Button>
    );

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      wide
      title={mode === "moveout" ? `Salida de ${firstName}` : tenant.name}
      description={`${property?.title ?? ""} · ${room?.name ?? ""}`}
      footer={footer}
    >
      {mode === "leave" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            Cuando {firstName} se vaya, la habitación queda libre y Roomie propone estudiantes compatibles con quienes se quedan en el piso.
          </p>
          <FormField label="Último día en el piso" htmlFor="td-leave">
            <input id="td-leave" type="date" value={leaveDate} min={today} onChange={(e) => setLeaveDate(e.target.value)} className={inputClass} />
          </FormField>
          {room ? (
            <div className="rounded-xl bg-bg-secondary px-3 py-2.5 text-sm">
              <Detail label="Habitación">{room.name}, {money(room.priceCents)}</Detail>
              <Detail label="Fianza a devolver">{money(tenant.deposit.amountCents)}</Detail>
            </div>
          ) : null}
        </div>
      ) : mode === "suggest" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            Sustitutos para {room?.name.toLowerCase()} desde el {shortDate(addDays(tenant.leavingAt ?? leaveDate, 1))}, ordenados por compatibilidad con quienes se quedan.
          </p>
          {suggestions.length ? (
            suggestions.map(({ lead, score, with: w }) => (
              <div key={lead.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                <Avatar name={lead.name} size="sm" tone="violet" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{lead.name}</p>
                  <p className="truncate text-xs text-text-muted">
                    {uniShort(lead.university)} · entrada {shortDate(lead.moveIn)} · hasta {money(lead.budgetCents)}
                  </p>
                  <p className="text-xs text-violet-deep">{score} % compatible{w ? ` con ${w === 1 ? "quien se queda" : `los ${w} que se quedan`}` : ""}</p>
                </div>
                {lead.propertyId === tenant.propertyId && lead.roomId === tenant.roomId ? (
                  <Pill tone="success">Propuesta</Pill>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => propose(lead)}>
                    Proponer
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
              Aún no hay interesados compatibles para esas fechas. Roomie te avisa en cuanto entre uno.
            </p>
          )}
        </div>
      ) : mode === "moveout" ? (
        <MoveOutFlow tenant={tenant} draft={draft} onChange={setDraft} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <UniBadge university={tenant.university} verified long />
            <Pill>{CONTRACT_LABEL[tenant.contractKind]}</Pill>
            {tenant.leavingAt && !ended ? <Pill tone="warning">Se va el {shortDate(tenant.leavingAt)}</Pill> : null}
            {tenant.moveOut?.closedAt ? <Pill>Salida cerrada</Pill> : ended ? <Pill>Contrato terminado</Pill> : null}
          </div>

          <div className="divide-y divide-border-light">
            <Detail label="Contrato">
              {shortDate(tenant.contractStart)} a {shortDate(tenant.contractEnd)}
            </Detail>
            <Detail label="Renta">
              <span className="tabular">{money(tenant.rentCents)}/mes</span>
            </Detail>
            {room ? (
              <Detail label="Habitación">
                <RoomTraits room={room} />
              </Detail>
            ) : null}
            <Detail label="Llaves">
              <KeysLine tenant={tenant} />
            </Detail>
            {tenant.docs?.guarantor ? (
              <Detail label="Avalista">
                {tenant.docs.guarantor.name}
                {tenant.docs.guarantor.phone ? <span className="block text-xs text-text-muted">{tenant.docs.guarantor.phone}</span> : null}
              </Detail>
            ) : null}
            {tenant.moveOut?.closedAt ? (
              <Detail label="Fianza devuelta">
                <span className="tabular">{money(tenant.moveOut.returnCents ?? 0)}</span>
              </Detail>
            ) : null}
          </div>

          <RentLedgerBox tenant={tenant} />

          {!ended && (endsSoon || tenant.renewal || renewalState(tenant) !== "not_asked") && !tenant.leavingAt ? <RenewalBox tenant={tenant} /> : null}

          <DepositBox tenant={tenant} ended={ended} onLodge={lodge} onSettle={() => setMode("moveout")} />

          {tenant.moveOut?.closedAt && hasStoredDocs(tenant) ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-3.5">
              <span className="min-w-0 text-sm">
                <span className="block font-semibold">Sus papeles siguen guardados</span>
                <span className="text-xs text-text-muted">DNI, matrícula y avalista. Ya no los necesitas.</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!(await update("tenant.docs.purge", (d) => purgeTenantDocs(d, tenant.id)))) return;
                  toast.success("Papeles borrados", `Ya no guardas los documentos de ${firstName}.`);
                }}
              >
                Borrarlos
              </Button>
            </div>
          ) : null}

          <TemporalityProofLine kind={tenant.contractKind} docs={tenant.docs} personName={tenant.name} onRequested={(docs) => patch("tenant.docs", { docs })} />

          <DocsChecklist personName={tenant.name} docs={tenant.docs} onChange={(docs) => patch("tenant.docs", { docs })} />

          <Button variant="outline" className="w-fit" onClick={printTenantContract}>
            <FileText className="h-4 w-4" /> Abrir su contrato para imprimir
          </Button>

          <div>
            <p className="eyebrow mb-1.5">Incidencias</p>
            {incidents.length ? (
              <ul className="flex flex-col gap-1.5">
                {incidents.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <PriorityDot priority={i.priority} />
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <IncidentPill status={i.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">Ninguna. Las abre desde su Franky con fotos.</p>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

/** La fianza con su cuenta atrás en días hábiles y el enlace a la sede. */
function DepositBox({ tenant, ended, onLodge, onSettle }: { tenant: ProTenant; ended: boolean; onLodge: () => void; onSettle: () => void }) {
  const { now } = usePro();
  const today = localDate(now);
  const c = depositCountdown(tenant, today);
  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Fianza <span className="tabular text-text-muted">{money(tenant.deposit.amountCents)}</span>
        </p>
        <DepositPill status={tenant.deposit.status} />
      </div>
      {tenant.deposit.status === "pending" ? (
        <>
          <p className={cn("mt-1 text-sm", c.urgent ? "font-semibold text-rose-700 dark:text-rose-300" : "text-text-secondary")}>
            {c.overdue
              ? `El plazo acabó el ${shortDate(c.dueAt)}. Deposítala cuanto antes: fuera de plazo hay recargo.`
              : `Depositar antes del ${shortDate(c.dueAt)}: ${c.businessDays === 0 ? "vence hoy" : c.businessDays === 1 ? "queda 1 día hábil" : `quedan ${c.businessDays} días hábiles`}.`}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">En la sede de la Generalitat, con el {DEPOSIT_FORMS}.</p>
          <DepositLateNote tenant={tenant} today={today} className="mt-2" />
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={GVA_URL} target="_blank" rel="noreferrer">
                Ir a la sede <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </Button>
            <Button size="sm" variant="secondary" onClick={onLodge}>
              <Check className="h-3.5 w-3.5" /> Marcar depositada
            </Button>
          </div>
        </>
      ) : tenant.deposit.status === "lodged" ? (
        <>
          <p className="mt-1 text-xs text-text-muted">
            Depositada en la Generalitat{tenant.lodgedAt ? ` el ${shortDate(tenant.lodgedAt)}` : ""}.{" "}
            {ended ? "Revisa la habitación con el inventario y liquídala." : "Se recupera al acabar el contrato."}
          </p>
          {ended ? (
            <Button size="sm" variant="secondary" className="mt-2.5" onClick={onSettle}>
              Liquidar la fianza
            </Button>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-xs text-text-muted">
          Devuelta{tenant.returnedAt ? ` el ${shortDate(tenant.returnedAt)}` : ""}
          {tenant.moveOut?.returnCents !== undefined ? `: ${money(tenant.moveOut.returnCents)}` : ""}.
        </p>
      )}
    </div>
  );
}

export function RentPill({ status }: { status: ProTenant["rentStatus"] }) {
  if (status === "paid") return <Pill tone="success">Cobrada</Pill>;
  if (status === "late") return <Pill tone="danger">Con retraso</Pill>;
  return <Pill tone="warning">Pendiente</Pill>;
}

export function DepositPill({ status }: { status: ProTenant["deposit"]["status"] }) {
  if (status === "pending") return <Pill tone="warning">Por depositar</Pill>;
  if (status === "lodged") return <Pill tone="success">Depositada</Pill>;
  return <Pill>Devuelta</Pill>;
}

export const INCIDENT_STATUS: Record<ProIncident["status"], { label: string; tone: "danger" | "info" | "success" }> = {
  open: { label: "Abierta", tone: "danger" },
  in_progress: { label: "En curso", tone: "info" },
  resolved: { label: "Resuelta", tone: "success" },
};

export function IncidentPill({ status }: { status: ProIncident["status"] }) {
  return <Pill tone={INCIDENT_STATUS[status].tone}>{INCIDENT_STATUS[status].label}</Pill>;
}

export const PRIORITY_LABEL: Record<ProIncident["priority"], string> = { urgent: "Urgente", normal: "Normal", low: "Baja" };

export function PriorityDot({ priority }: { priority: ProIncident["priority"] }) {
  return (
    <span
      aria-label={`Prioridad ${PRIORITY_LABEL[priority].toLowerCase()}`}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", priority === "urgent" ? "bg-rose-500" : priority === "normal" ? "bg-amber-500" : "bg-slate-400")}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Incidencia                                                          */
/* ------------------------------------------------------------------ */

export function IncidentDrawer({ incidentId, onClose }: { incidentId: string | "new" | null; onClose: () => void }) {
  const { data } = usePro();
  const incident = data.incidents.find((i) => i.id === incidentId);
  if (incidentId === "new") return <IncidentBody key="new" onClose={onClose} />;
  if (!incident) return closed(onClose);
  return <IncidentBody key={incident.id} incident={incident} onClose={onClose} />;
}

function IncidentBody({ incident, onClose }: { incident?: ProIncident; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const tenants = currentTenants(data, now);
  const providers = housingOpsOf(data).providers;
  const [propertyId, setPropertyId] = React.useState(incident?.propertyId ?? data.properties[0]?.id ?? "");
  const [tenantId, setTenantId] = React.useState("");
  const [title, setTitle] = React.useState(incident?.title ?? "");
  const [priority, setPriority] = React.useState<ProIncident["priority"]>(incident?.priority ?? "normal");
  const [status, setStatus] = React.useState<ProIncident["status"]>(incident?.status ?? "open");
  const [providerId, setProviderId] = React.useState(incident?.providerId ?? "");
  const [assignee, setAssignee] = React.useState(incident?.providerId ? "" : (incident?.assignee ?? ""));
  const [cost, setCost] = React.useState(incident?.costCents ? String(incident.costCents / 100) : "");
  const property = data.properties.find((p) => p.id === (incident?.propertyId ?? propertyId));
  const inFlat = tenants.filter((t) => t.propertyId === propertyId);
  const provider = providers.find((p) => p.id === providerId);
  const who = provider?.name ?? (assignee.trim() || undefined);
  const openMin = incident ? incidentOpenMinutes(incident, now) : 0;
  // El mensaje al técnico se escribe también mientras se crea la incidencia.
  const forProvider: ProIncident = incident ?? {
    id: "",
    propertyId,
    tenantName: inFlat.find((t) => t.id === tenantId)?.name ?? "Zonas comunes",
    title: title.trim() || "una avería",
    priority,
    status: "open",
    createdAt: now.toISOString(),
  };

  const save = () => {
    const nowIso = new Date().toISOString();
    if (incident) {
      const costCents = euros(cost);
      const resolving = status === "resolved" && incident.status !== "resolved";
      update("incident.update", (d) => {
        const next = {
          ...d,
          incidents: d.incidents.map((i) =>
            i.id === incident.id
              ? {
                  ...i,
                  priority,
                  status,
                  assignee: who,
                  providerId: provider?.id,
                  costCents: costCents || undefined,
                  resolvedAt: status === "resolved" ? (i.resolvedAt ?? nowIso) : undefined,
                }
              : i,
          ),
        };
        // Lo que cuesta un arreglo pasa a los gastos del piso (y a la liquidación del propietario).
        if (!costCents || !resolving) return next;
        return withOps(next, (ops) => ({
          ...ops,
          expenses: [
            ...ops.expenses.filter((e) => e.incidentId !== incident.id),
            {
              id: localId("e"),
              propertyId: incident.propertyId,
              date: localDate(now),
              category: "reparacion",
              concept: incident.title,
              amountCents: costCents,
              incidentId: incident.id,
              providerId: provider?.id,
            },
          ],
        }));
      });
      toast.success(
        status === "resolved" ? "Incidencia resuelta" : "Incidencia actualizada",
        status === "resolved" ? `Avisa a ${incident.tenantName.split(" ")[0]} de que ya está.${costCents ? ` ${money(costCents)} apuntados en gastos.` : ""}` : undefined,
      );
    } else {
      const tenant = inFlat.find((t) => t.id === tenantId);
      const item: ProIncident = {
        id: localId("i"),
        propertyId,
        roomId: tenant?.roomId,
        tenantName: tenant?.name ?? "Zonas comunes",
        title: title.trim(),
        priority,
        status: "open",
        createdAt: nowIso,
        assignee: who,
        providerId: provider?.id,
        photos: 0,
      };
      update("incident.create", (d) => ({ ...d, incidents: [item, ...d.incidents] }));
      toast.success("Incidencia abierta", who ? `Asignada a ${who}.` : "Asígnala para que no se quede parada.");
    }
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={incident ? incident.title : "Nueva incidencia"}
      description={incident ? `${property?.title ?? ""} · ${incident.tenantName} · ${relative(incident.createdAt, now.getTime())}` : "Para lo que te llega por teléfono. Tus inquilinos las abren desde su Franky."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!incident && (!title.trim() || !propertyId)}>
            {incident ? "Guardar" : "Abrir incidencia"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {incident ? (
          <div className="flex flex-wrap items-center gap-2">
            <IncidentPill status={incident.status} />
            <Pill tone={incident.status === "resolved" ? "neutral" : openMin >= 48 * 60 ? "danger" : openMin >= 24 * 60 ? "warning" : "neutral"}>
              {incident.status === "resolved" ? `Resuelta en ${waitingLabel(openMin)}` : `Abierta hace ${waitingLabel(openMin)}`}
            </Pill>
          </div>
        ) : null}
        {incident ? <IncidentPhotos incident={incident} /> : null}
        {!incident ? (
          <>
            <FormField label="Qué pasa" htmlFor="in-title">
              <input id="in-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="No hay agua caliente" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Piso" htmlFor="in-prop">
                <select id="in-prop" value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setTenantId(""); }} className={selectClass}>
                  {data.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Quién avisa" htmlFor="in-tenant">
                <select id="in-tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={selectClass}>
                  <option value="">Zonas comunes</option>
                  {inFlat.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </>
        ) : (
          <FormField label="Estado">
            <ChoiceChips
              value={status}
              onChange={setStatus}
              options={[
                { value: "open", label: "Abierta" },
                { value: "in_progress", label: "En curso" },
                { value: "resolved", label: "Resuelta" },
              ]}
            />
          </FormField>
        )}
        <FormField label="Prioridad">
          <ChoiceChips
            value={priority}
            onChange={setPriority}
            options={[
              { value: "urgent", label: "Urgente", hint: "Hoy mismo" },
              { value: "normal", label: "Normal", hint: "Esta semana" },
              { value: "low", label: "Baja", hint: "Cuando se pueda" },
            ]}
          />
        </FormField>
        <FormField label="Quién lo arregla" htmlFor="in-provider">
          <select id="in-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)} className={selectClass}>
            <option value="">{providers.length ? "Alguien del equipo u otro" : "Escribe quién abajo"}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({TRADE_LABEL[p.trade].toLowerCase()})
              </option>
            ))}
          </select>
        </FormField>
        {status !== "resolved" ? <SuggestedProvider incident={{ title: incident?.title ?? title }} currentId={providerId} onPick={setProviderId} /> : null}
        {!provider ? (
          <FormField label="Nombre" htmlFor="in-assignee" hint="Alguien del equipo o un técnico que no está en tu lista.">
            <input id="in-assignee" list="in-people" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputClass} placeholder="Nombre o empresa" />
            <datalist id="in-people">
              {data.staff.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </FormField>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-3">
            <span className="min-w-0 text-sm">
              <span className="block font-semibold">{provider.name}</span>
              <span className="text-xs text-text-muted">
                {provider.phone}
                {provider.note ? ` · ${provider.note}` : ""}
              </span>
            </span>
            <Button size="sm" variant="secondary" asChild>
              <a href={waHref(providerText(data, forProvider), provider.phone)} target="_blank" rel="noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> Avisar por WhatsApp
              </a>
            </Button>
          </div>
        )}
        {incident && status === "resolved" ? (
          <FormField label="Lo que ha costado (€)" htmlFor="in-cost" hint="Se apunta en los gastos del piso.">
            <input id="in-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={cn(inputClass, "w-32")} placeholder="0" />
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Piso                                                                */
/* ------------------------------------------------------------------ */

export function PropertyDrawer({ propertyId, onClose }: { propertyId: string | null; onClose: () => void }) {
  const { data } = usePro();
  const property = data.properties.find((p) => p.id === propertyId);
  if (!property) return closed(onClose);
  return <PropertyBody key={property.id} property={property} onClose={onClose} />;
}

type RoomDraft = { id: string; price: string; status: ProRoom["status"]; availableFrom: string; summer: boolean };

type PropertyTab = "rooms" | "data" | "house" | "share" | "history";

function PropertyBody({ property, onClose }: { property: ProProperty; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const [tab, setTab] = React.useState<PropertyTab>("rooms");
  const [rooms, setRooms] = React.useState<RoomDraft[]>(
    property.rooms.map((r) => ({ id: r.id, price: String(r.priceCents / 100), status: r.status, availableFrom: r.availableFrom.slice(0, 10), summer: Boolean(r.summer) })),
  );
  const [whole, setWhole] = React.useState(String(Math.round((property.wholeFlatPriceCents ?? property.rooms.reduce((a, r) => a + r.priceCents, 0) * 0.93) / 100)));
  const [showWhole, setShowWhole] = React.useState(false);
  const month = today.slice(0, 7);
  const visitsMonth = data.visits.filter((v) => v.propertyId === property.id && v.start.slice(0, 7) === month && v.status !== "cancelled").length;
  const leads = data.leads.filter((l) => l.propertyId === property.id && l.stage !== "lost" && l.stage !== "signed").length;
  const groups = data.leads.filter((l) => l.roomieGroup && l.stage !== "lost" && l.roomieGroup.size <= property.rooms.length).length;
  const tenants = currentTenants(data, now).filter((t) => t.propertyId === property.id);
  const owners = housingOpsOf(data).owners;
  const gaps = complianceGaps(property);
  const dirty = rooms.some((d) => {
    const r = property.rooms.find((x) => x.id === d.id);
    return r && (euros(d.price) !== r.priceCents || d.status !== r.status || d.availableFrom !== r.availableFrom.slice(0, 10) || d.summer !== Boolean(r.summer));
  });
  const isAgency = data.staff.length > 1;

  const saveRooms = () => {
    update("property.rooms", (d) => ({
      ...d,
      properties: d.properties.map((p) =>
        p.id === property.id
          ? {
              ...p,
              rooms: p.rooms.map((r) => {
                const draft = rooms.find((x) => x.id === r.id);
                if (!draft) return r;
                return {
                  ...r,
                  priceCents: euros(draft.price) || r.priceCents,
                  status: draft.status,
                  availableFrom: draft.availableFrom || r.availableFrom,
                  summer: draft.summer || undefined,
                };
              }),
            }
          : p,
      ),
    }));
    toast.success("Habitaciones guardadas", "Los interesados ven los precios nuevos al momento.");
  };

  const togglePublish = () => {
    if (!property.published && !canPublish(property)) {
      setTab("data");
      toast.info("Antes de publicarlo", `Añade ${gaps.join(" y ")} del piso. Los portales y Franky los piden en cada anuncio.`);
      return;
    }
    update("property.publish", (d) => ({ ...d, properties: d.properties.map((p) => (p.id === property.id ? { ...p, published: !p.published } : p)) }));
    toast.success(property.published ? "Piso oculto" : "Piso publicado", property.published ? "Ya no aparece a los estudiantes." : "Ya aparece en el buscador de pisos de Franky.");
  };

  const offerWhole = () => {
    const cents = euros(whole);
    const offer: ProOffer = {
      id: localId("o"),
      kind: "group",
      title: `${property.title} entero para grupos de Roomie`,
      detail: `${property.rooms.length} habitaciones por ${money(cents)} al mes para un grupo compatible`,
      discountPct: 0,
      slots: 1,
      claimed: 0,
      audience: { studentsOnly: true, radiusKm: 10, universities: UNIVERSITIES.slice(0, 2) },
      status: "live",
      reach: 0,
      views: 0,
      bookings: 0,
      revenueCents: 0,
      createdAt: new Date().toISOString(),
    };
    update("property.whole", (d) => ({
      ...d,
      offers: [offer, ...d.offers],
      properties: d.properties.map((p) => (p.id === property.id ? { ...p, wholeFlatPriceCents: cents } : p)),
    }));
    toast.success("Ofrecido a grupos de Roomie", `${groups ? `${groups} grupos compatibles lo ven ya` : "Los grupos compatibles lo verán"} en su búsqueda.`);
    setShowWhole(false);
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      wide
      title={property.title}
      description={`${property.address} · ${property.minutesToCampus} min al campus`}
      footer={
        <>
          <Button variant="outline" onClick={togglePublish}>
            {property.published ? "Ocultar" : "Publicar"}
          </Button>
          {tab === "rooms" ? (
            <Button variant="dark" onClick={saveRooms} disabled={!dirty}>
              Guardar cambios
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <PropertyCover property={property} className="h-32 rounded-2xl">
          {property.compliance?.energyLetter ? <EnergyBadge letter={property.compliance.energyLetter} className="absolute right-3 top-3" /> : null}
        </PropertyCover>
        <Segmented<PropertyTab>
          label="Apartado del piso"
          value={tab}
          onChange={setTab}
          className="w-full"
          options={[
            { value: "rooms", label: "Habitaciones" },
            { value: "data", label: gaps.length ? `Datos (falta ${gaps.length})` : "Datos" },
            { value: "house", label: "Casa y llaves" },
            { value: "share", label: "Compartir" },
            { value: "history", label: "Historial" },
          ]}
        />

        {tab === "data" ? (
          <>
            {!property.published && gaps.length ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Está oculto porque le falta {gaps.join(" y ")}. Complétalo y publícalo desde aquí.
              </p>
            ) : null}
            <ComplianceBox property={property} />
            {isAgency ? <OwnerField property={property} /> : null}
          </>
        ) : tab === "house" ? (
          <>
            <RulesBox property={property} />
            <KeysBox property={property} />
          </>
        ) : tab === "share" ? (
          <SharePropertyBox property={property} />
        ) : tab === "history" ? (
          <PropertyHistoryBox property={property} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [visitsMonth, "visitas este mes"],
                [property.views30, "vistas en 30 días"],
                [leads, "interesados activos"],
              ].map(([v, l]) => (
                <div key={String(l)} className="rounded-xl bg-bg-secondary px-2 py-2.5">
                  <p className="font-heading text-xl font-extrabold tabular">{v}</p>
                  <p className="text-[0.72rem] text-text-muted">{l}</p>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="eyebrow">Habitaciones</p>
                {!property.published ? <Pill tone="warning">Oculto</Pill> : <Pill tone="success">Publicado</Pill>}
              </div>
              <ul className="flex flex-col gap-2">
                {property.rooms.map((r, i) => {
                  const draft = rooms[i];
                  const tenant = data.tenants.find((t) => t.id === r.tenantId);
                  const set = (fields: Partial<RoomDraft>) => setRooms((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...fields } : x)));
                  return (
                    <li key={r.id} className="rounded-2xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{r.name}</p>
                          <RoomTraits room={r} />
                        </div>
                        {tenant && (r.status === "occupied" || r.status === "leaving") ? (
                          <span className="truncate text-xs text-text-muted">{tenant.name}</span>
                        ) : null}
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2">
                        <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-text-muted">
                          Precio (€)
                          <input inputMode="decimal" value={draft.price} onChange={(e) => set({ price: e.target.value })} className={cn(inputClass, "h-9")} aria-label={`Precio de ${r.name}`} />
                        </label>
                        <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-text-muted">
                          Estado
                          <select value={draft.status} onChange={(e) => set({ status: e.target.value as ProRoom["status"] })} className={cn(selectClass, "h-9 px-2")} aria-label={`Estado de ${r.name}`}>
                            {(Object.keys(ROOM_STATUS) as ProRoom["status"][]).map((st) => (
                              <option key={st} value={st}>
                                {ROOM_STATUS[st].label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-text-muted">
                          Libre desde
                          <input type="date" value={draft.availableFrom} onChange={(e) => set({ availableFrom: e.target.value })} className={cn(inputClass, "h-9 px-2")} aria-label={`Disponible desde, ${r.name}`} />
                        </label>
                      </div>
                      <label className="mt-2 flex min-h-9 items-center gap-2 text-sm">
                        <input type="checkbox" checked={draft.summer} onChange={(e) => set({ summer: e.target.checked })} className="h-4 w-4 accent-[var(--color-violet)]" />
                        Libre en julio y agosto para estancias cortas
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            <RoomsVsWholeBox property={property} />

            <div className="rounded-2xl border border-violet/25 bg-violet-50/60 p-3.5 dark:bg-violet-950/20">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-deep">
                <Users className="h-4 w-4" strokeWidth={1.9} /> Piso entero para grupos de Roomie
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {groups
                  ? `${groups} grupos ya formados y compatibles buscan piso de ${property.rooms.length} o menos. Firmas un contrato y llenas todas las habitaciones de una vez.`
                  : "Roomie junta estudiantes compatibles para alquilar pisos enteros. Un contrato, todas las habitaciones llenas."}
              </p>
              {property.wholeFlatPriceCents && !showWhole ? (
                <p className="mt-2 text-sm">
                  Ofrecido por <span className="font-semibold tabular">{money(property.wholeFlatPriceCents)}</span> al mes.{" "}
                  <button type="button" onClick={() => setShowWhole(true)} className="font-semibold text-violet underline-offset-2 hover:underline">
                    Cambiar
                  </button>
                </p>
              ) : showWhole ? (
                <div className="mt-2.5 flex flex-wrap items-end gap-2">
                  <FormField label="Precio del piso entero (€/mes)" htmlFor="pd-whole" className="min-w-0 flex-1">
                    <input id="pd-whole" inputMode="decimal" value={whole} onChange={(e) => setWhole(e.target.value)} className={inputClass} />
                  </FormField>
                  <Button variant="dark" onClick={offerWhole} disabled={euros(whole) <= 0}>
                    Ofrecer
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="secondary" className="mt-2.5" onClick={() => setShowWhole(true)}>
                  Ofrecer piso entero a grupos Roomie
                </Button>
              )}
            </div>

            {isAgency ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Agente del piso" htmlFor="pd-agent">
                  <select
                    id="pd-agent"
                    value={property.agentId ?? ""}
                    onChange={(e) => {
                      update("property.agent", (d) => ({ ...d, properties: d.properties.map((p) => (p.id === property.id ? { ...p, agentId: e.target.value || undefined } : p)) }));
                      toast.success("Agente asignado", staffName(data, e.target.value) ?? "Sin agente");
                    }}
                    className={selectClass}
                  >
                    <option value="">Sin asignar</option>
                    {data.staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Propietario" htmlFor="pd-owner">
                  <select
                    id="pd-owner"
                    value={property.ownerId ?? ""}
                    onChange={(e) => {
                      update("property.owner", (d) => ({ ...d, properties: d.properties.map((p) => (p.id === property.id ? { ...p, ownerId: e.target.value || undefined } : p)) }));
                      toast.success("Propietario asignado", owners.find((o) => o.id === e.target.value)?.name ?? "Sin propietario");
                    }}
                    className={selectClass}
                  >
                    <option value="">Sin propietario</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            ) : null}

            <div>
              <p className="eyebrow mb-1.5">Viven aquí</p>
              {tenants.length ? (
                <ul className="flex flex-col gap-1.5">
                  {tenants.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <Avatar name={t.name} size="xs" />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="text-xs text-text-muted">hasta {shortDate(t.leavingAt ?? t.contractEnd)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">Nadie todavía.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo piso                                                          */
/* ------------------------------------------------------------------ */

type NewRoom = { size: string; price: string; exterior: boolean; bath: boolean };

export function NewPropertyDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const [address, setAddress] = React.useState("");
  const [zone, setZone] = React.useState(ZONES[0]);
  const [minutes, setMinutes] = React.useState("10");
  const [nrua, setNrua] = React.useState("");
  const [letter, setLetter] = React.useState<ProEnergyLetter | "">("");
  const [rooms, setRooms] = React.useState<NewRoom[]>([
    { size: "12", price: "330", exterior: true, bath: false },
    { size: "10", price: "310", exterior: false, bath: false },
    { size: "11", price: "320", exterior: true, bath: false },
  ]);
  const valid = address.trim().length > 4 && rooms.length > 0 && rooms.every((r) => euros(r.price) > 0);

  const create = () => {
    const id = localId("p");
    const property: ProProperty = {
      id,
      title: `Piso ${address.trim().split(",")[0]}`,
      address: address.trim(),
      zone,
      minutesToCampus: Math.max(1, Number(minutes) || 1),
      rooms: rooms.map((r, i) => ({
        id: `${id}-r${i + 1}`,
        name: `Habitación ${i + 1}`,
        sizeM2: Math.max(6, Number(r.size) || 10),
        priceCents: euros(r.price),
        status: "free",
        availableFrom: localDate(now),
        exterior: r.exterior,
        privateBath: r.bath,
      })),
      photos: 0,
      views30: 0,
      published: false,
      agentId: data.staff.find((s) => s.role === "agent")?.id,
      compliance: { nrua: nrua.trim() || undefined, energyLetter: letter || undefined },
    };
    // Sin NRUA ni letra energética se guarda oculto: no se puede anunciar.
    property.published = canPublish(property);
    update("property.create", (d) => ({ ...d, properties: [...d.properties, property] }));
    if (property.published) toast.success("Piso publicado", "Añade fotos desde la ficha: los pisos con fotos reciben muchas más visitas.");
    else toast.success("Piso guardado sin publicar", `Añade ${complianceGaps(property).join(" y ")} en su ficha y publícalo.`);
    setAddress("");
    setNrua("");
    setLetter("");
    onClose();
  };

  const setRoom = (i: number, fields: Partial<NewRoom>) => setRooms((prev) => prev.map((r, j) => (j === i ? { ...r, ...fields } : r)));

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      wide
      title="Añadir piso"
      description="Por habitaciones: cada una con su precio. Lo verán estudiantes verificados que buscan en tu zona."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={create} disabled={!valid}>{nrua.trim() && letter ? "Publicar piso" : "Guardar piso"}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Dirección" htmlFor="np-address">
          <input id="np-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="Calle Pintor Picasso 7, 2.º B" />
        </FormField>
        <FormField label="Zona">
          <ChoiceChips value={zone} onChange={setZone} options={ZONES.map((z) => ({ value: z, label: z }))} />
        </FormField>
        <FormField label="Minutos al campus" htmlFor="np-min" hint="Andando o en tranvía, lo que tarde de verdad un estudiante.">
          <input id="np-min" type="number" min={1} max={90} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={cn(inputClass, "w-28")} />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <FormField label="NRUA" htmlFor="np-nrua" hint="Sin él no se puede anunciar por habitaciones.">
            <input id="np-nrua" value={nrua} onChange={(e) => setNrua(e.target.value.toUpperCase())} className={inputClass} placeholder="ESFCTU..." />
          </FormField>
          <FormField label="Letra energética">
            <div className="flex flex-wrap gap-1">
              {ENERGY_LETTERS.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={letter === l}
                  onClick={() => setLetter(l)}
                  className={cn(
                    "h-10 w-9 rounded-lg border text-sm font-bold transition-colors",
                    letter === l ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </FormField>
        </div>
        <div>
          <p className="mb-2 text-[0.82rem] font-semibold">Habitaciones</p>
          <ul className="flex flex-col gap-2">
            {rooms.map((r, i) => (
              <li key={i} className="rounded-2xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Habitación {i + 1}</p>
                  <button
                    type="button"
                    aria-label={`Quitar habitación ${i + 1}`}
                    onClick={() => setRooms((prev) => prev.filter((_, j) => j !== i))}
                    disabled={rooms.length === 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-text-muted">
                    Metros
                    <input inputMode="numeric" value={r.size} onChange={(e) => setRoom(i, { size: e.target.value })} className={cn(inputClass, "h-9")} />
                  </label>
                  <label className="flex flex-col gap-1 text-[0.72rem] font-semibold text-text-muted">
                    Precio (€/mes)
                    <input inputMode="decimal" value={r.price} onChange={(e) => setRoom(i, { price: e.target.value })} className={cn(inputClass, "h-9")} />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <label className="flex min-h-9 items-center gap-2">
                    <input type="checkbox" checked={r.exterior} onChange={(e) => setRoom(i, { exterior: e.target.checked })} className="h-4 w-4 accent-[var(--color-violet)]" /> Exterior
                  </label>
                  <label className="flex min-h-9 items-center gap-2">
                    <input type="checkbox" checked={r.bath} onChange={(e) => setRoom(i, { bath: e.target.checked })} className="h-4 w-4 accent-[var(--color-violet)]" /> Baño propio
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setRooms((prev) => [...prev, { size: "10", price: prev[prev.length - 1]?.price ?? "320", exterior: false, bath: false }])}
            disabled={rooms.length >= 8}
          >
            <Plus className="h-3.5 w-3.5" /> Añadir habitación
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
