"use client";

import * as React from "react";
import { ArrowUpRight, Check, ChevronDown, Home, Landmark, MessageCircle, Plus, Wallet, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProIncident, ProTenant } from "@/lib/pro/types";
import { addDays, localDate, money, pct, relative } from "@/lib/pro/format";
import {
  CONTRACT_LABEL,
  GVA_URL,
  addMonths,
  currentTenants,
  daysBetween,
  findRoom,
  formerTenants,
  rentSummary,
  shortDate,
} from "@/lib/pro/housing";
import { UNIVERSITIES } from "@/lib/pro/demo/common";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, Empty, FormField, Kpi, KpiRow, Meter, PageHeader, Panel, Pill, Row, RowList, SearchInput, Segmented, Tip, inputClass } from "../../kit";
import { DepositPill, INCIDENT_STATUS, IncidentDrawer, IncidentPill, PRIORITY_LABEL, PriorityDot, RentPill, TenantDrawer } from "./drawers";
import { UniBadge, euros, selectClass } from "./shared";
import { DepositLateNote, ProvidersPanel, RentReminderDrawer } from "./desk-tools";
import { markReminded, remindedToday } from "@/lib/pro/housing-desk";
import { rentReminderText, whatsappHref } from "@/lib/pro/housing-ops";

type Tab = "tenants" | "rent" | "deposits" | "incidents";

export default function HousingInquilinos() {
  const { data, now } = usePro();
  const [tab, setTab] = React.useState<Tab>("tenants");
  const [tenantId, setTenantId] = React.useState<string | null>(null);
  const [incidentId, setIncidentId] = React.useState<string | "new" | null>(null);
  const [adding, setAdding] = React.useState(false);

  const current = currentTenants(data, now);
  const rent = rentSummary(data, now);
  const pendingDeposits = data.tenants.filter((t) => t.deposit.status === "pending");
  const openIncidents = data.incidents.filter((i) => i.status !== "resolved");
  const flats = new Set(current.map((t) => t.propertyId)).size;
  const monthName = new Date(now).toLocaleDateString("es-ES", { month: "long", timeZone: "Europe/Madrid" });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Inquilinos"
        title={`${current.length} inquilinos en ${flats} ${flats === 1 ? "piso" : "pisos"}`}
        description={`En ${monthName} llevas ${money(rent.paidCents, { round: true })} cobrados de ${money(rent.totalCents, { round: true })}. ${pendingDeposits.length ? `${pendingDeposits.length} fianzas por depositar` : "Todas las fianzas depositadas"} y ${openIncidents.length} incidencias abiertas.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setIncidentId("new")}>
              <Wrench className="h-4 w-4" /> Incidencia
            </Button>
            <Button variant="dark" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Añadir inquilino
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi icon={Home} label="Inquilinos" value={current.length} hint={`${current.filter((t) => t.leavingAt).length} se van pronto`} onClick={() => setTab("tenants")} />
        <Kpi icon={Wallet} label="Cobrado del mes" value={`${pct(rent.paidCents, rent.totalCents)} %`} hint={`${rent.late} con retraso`} onClick={() => setTab("rent")} emphasis={rent.late > 0} />
        <Kpi icon={Landmark} label="Fianzas por depositar" value={pendingDeposits.length} hint={pendingDeposits.length ? `La primera vence el ${shortDate([...pendingDeposits].sort((a, b) => a.deposit.dueAt.localeCompare(b.deposit.dueAt))[0].deposit.dueAt)}` : "Todo en orden"} onClick={() => setTab("deposits")} />
        <Kpi icon={Wrench} label="Incidencias abiertas" value={openIncidents.length} hint={`${openIncidents.filter((i) => i.priority === "urgent").length} urgentes`} onClick={() => setTab("incidents")} />
      </KpiRow>

      <Segmented<Tab>
        label="Apartado"
        value={tab}
        onChange={setTab}
        className="w-full sm:w-auto"
        options={[
          { value: "tenants", label: "Inquilinos", count: current.length },
          { value: "rent", label: "Cobros", count: rent.pending + rent.late },
          { value: "deposits", label: "Fianzas", count: pendingDeposits.length },
          { value: "incidents", label: "Incidencias", count: openIncidents.length },
        ]}
      />

      {tab === "tenants" ? <TenantsTab onOpen={setTenantId} onAdd={() => setAdding(true)} /> : null}
      {tab === "rent" ? <RentTab onOpen={setTenantId} /> : null}
      {tab === "deposits" ? <DepositsTab onOpen={setTenantId} /> : null}
      {tab === "incidents" ? <IncidentsTab onOpen={setIncidentId} /> : null}

      <TenantDrawer tenantId={tenantId} onClose={() => setTenantId(null)} />
      <IncidentDrawer incidentId={incidentId} onClose={() => setIncidentId(null)} />
      <NewTenantDrawer key={adding ? "open" : "closed"} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TenantsTab({ onOpen, onAdd }: { onOpen: (id: string) => void; onAdd: () => void }) {
  const { data, now } = usePro();
  const [q, setQ] = React.useState("");
  const [showFormer, setShowFormer] = React.useState(false);
  const needle = q.trim().toLowerCase();
  const current = currentTenants(data, now).filter((t) => !needle || t.name.toLowerCase().includes(needle));
  const former = formerTenants(data, now);
  const today = localDate(now);

  if (!data.tenants.length)
    return (
      <Empty
        icon={Home}
        title="Pasa aquí a tus inquilinos"
        body="Con su contrato, su fianza y su renta de cada mes. Ellos abren incidencias y pagan desde su Franky."
        action={<Button variant="dark" onClick={onAdd}>Añadir inquilino</Button>}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      {data.tenants.length > 6 ? <SearchInput value={q} onChange={setQ} placeholder="Buscar inquilino" className="sm:w-72" /> : null}
      {data.properties
        .map((p) => ({ p, list: current.filter((t) => t.propertyId === p.id).sort((a, b) => a.roomId.localeCompare(b.roomId)) }))
        .filter((x) => x.list.length)
        .map(({ p, list }) => (
          <Panel key={p.id} title={p.title} description={`${list.length} de ${p.rooms.length} habitaciones · ${p.address}`} flush>
            <RowList>
              {list.map((t) => {
                const { room } = findRoom(data, t.propertyId, t.roomId);
                const endsSoon = daysBetween(today, t.contractEnd) <= 60;
                return (
                  <Row key={t.id} onClick={() => onOpen(t.id)}>
                    <Avatar name={t.name} size="sm" tone={t.leavingAt ? "amber" : "slate"} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="truncate text-sm font-semibold">{t.name}</span>
                        <UniBadge university={t.university} verified />
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {room?.name} · {CONTRACT_LABEL[t.contractKind]} hasta el {shortDate(t.contractEnd)}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-sm font-semibold tabular sm:block">{money(t.rentCents)}</span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <RentPill status={t.rentStatus} />
                      {t.leavingAt ? <Pill tone="warning">Se va el {shortDate(t.leavingAt)}</Pill> : endsSoon ? <Pill tone="info">Renovar</Pill> : null}
                    </span>
                  </Row>
                );
              })}
            </RowList>
          </Panel>
        ))}
      {!current.length && needle ? <Empty title="Nadie con ese nombre" body="Revisa cómo lo has escrito." /> : null}

      {former.length ? (
        <div>
          <button
            type="button"
            aria-expanded={showFormer}
            onClick={() => setShowFormer((v) => !v)}
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-primary"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showFormer && "rotate-180")} /> Antiguos inquilinos ({former.length})
          </button>
          {showFormer ? (
            <Panel flush className="mt-2">
              <RowList>
                {former.map((t) => (
                  <Row key={t.id} onClick={() => onOpen(t.id)}>
                    <Avatar name={t.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{t.name}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {data.properties.find((p) => p.id === t.propertyId)?.title} · salió el {shortDate(t.contractEnd)}
                      </span>
                    </span>
                    <DepositPill status={t.deposit.status} />
                  </Row>
                ))}
              </RowList>
            </Panel>
          ) : null}
        </div>
      ) : null}

      <Tip title="Renovaciones">
        Los contratos que acaban en los próximos dos meses llevan la etiqueta Renovar. Avisar en mayo evita la rotación de septiembre y te ahorra buscar inquilino en plena temporada.
      </Tip>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RentTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const rent = rentSummary(data, now);
  const order = { late: 0, pending: 1, paid: 2 } as const;
  const list = [...rent.tenants].sort((a, b) => order[a.rentStatus] - order[b.rentStatus] || a.name.localeCompare(b.name));
  const monthName = new Date(now).toLocaleDateString("es-ES", { month: "long", timeZone: "Europe/Madrid" });
  const [queueOpen, setQueueOpen] = React.useState(false);

  const charge = (t: ProTenant) => {
    update("tenant.paid", (d) => ({ ...d, tenants: d.tenants.map((x) => (x.id === t.id ? { ...x, rentStatus: "paid", paidThisMonthAt: new Date().toISOString() } : x)) }));
    toast.success("Renta cobrada", `${money(t.rentCents)} de ${t.name.split(" ")[0]}.`);
  };
  // El recordatorio sale por WhatsApp con lo que debe; aquí solo se apunta la fecha.
  const remind = (t: ProTenant) => {
    update("tenant.remind", (d) => markReminded(d, [t.id], new Date().toISOString()));
    toast.success("Recordatorio listo en WhatsApp", `Con lo que debe ${t.name.split(" ")[0]}. Solo tienes que enviarlo.`);
  };

  if (!list.length) return <Empty icon={Wallet} title="Aún no hay rentas este mes" body="Cuando añadas inquilinos, aquí verás quién ha pagado y quién no." />;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Renta de {monthName}</p>
            <p className="mt-1 font-heading text-3xl font-extrabold tabular">
              {money(rent.paidCents, { round: true })} <span className="text-base font-semibold text-text-muted">de {money(rent.totalCents, { round: true })}</span>
            </p>
          </div>
          {rent.pending + rent.late ? (
            <Button variant="outline" size="sm" onClick={() => setQueueOpen(true)}>
              <MessageCircle className="h-3.5 w-3.5" /> Recordar a los {rent.pending + rent.late} que faltan
            </Button>
          ) : null}
        </div>
        <Meter value={rent.paidCents} max={rent.totalCents} tone="success" className="mt-3" />
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <Stat label="Cobrado" value={money(rent.paidCents, { round: true })} n={rent.paid} />
          <Stat label="Pendiente" value={money(rent.pendingCents, { round: true })} n={rent.pending} />
          <Stat label="Con retraso" value={money(rent.lateCents, { round: true })} n={rent.late} danger={rent.late > 0} />
        </div>
      </Panel>

      <Panel flush>
        <RowList>
          {list.map((t) => {
            const { property, room } = findRoom(data, t.propertyId, t.roomId);
            const reminded = t.remindedAt;
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
                <button type="button" onClick={() => onOpen(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={t.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold hover:underline">{t.name}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {property?.title}, {room?.name.toLowerCase()}
                      {t.rentStatus === "paid" && t.paidThisMonthAt ? ` · pagó ${relative(t.paidThisMonthAt, now.getTime())}` : reminded ? ` · recordado ${relative(reminded, now.getTime())}` : ""}
                    </span>
                  </span>
                </button>
                <span className="text-sm font-semibold tabular">{money(t.rentCents)}</span>
                <RentPill status={t.rentStatus} />
                {t.rentStatus !== "paid" ? (
                  <span className="flex gap-1.5">
                    {remindedToday(t, now) ? (
                      <Button size="sm" variant="ghost" disabled>
                        Recordado hoy
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={whatsappHref(rentReminderText(data, t, now))} target="_blank" rel="noreferrer" onClick={() => remind(t)}>
                          <MessageCircle className="h-3.5 w-3.5" /> Recordar
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => charge(t)}>
                      <Check className="h-3.5 w-3.5" /> Cobrado
                    </Button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </RowList>
      </Panel>
      <Tip title="Cobros sin perseguir a nadie">
        Recordar abre WhatsApp con su nombre y lo que debe, listo para enviar. Cuando te llegue la transferencia, márcalo como cobrado y tienes su recibo en su ficha.
      </Tip>
      <RentReminderDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  );
}

function Stat({ label, value, n, danger }: { label: string; value: string; n: number; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-bg-secondary px-3 py-2">
      <p className="text-xs text-text-muted">
        {label} <span className="tabular">({n})</span>
      </p>
      <p className={cn("font-semibold tabular", danger && "text-rose-700 dark:text-rose-300")}>{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DepositsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const pending = data.tenants.filter((t) => t.deposit.status === "pending").sort((a, b) => a.deposit.dueAt.localeCompare(b.deposit.dueAt));
  const toReturn = data.tenants.filter((t) => t.deposit.status === "lodged" && t.contractEnd < today);
  const lodged = data.tenants.filter((t) => t.deposit.status === "lodged" && t.contractEnd >= today);
  const returned = data.tenants.filter((t) => t.deposit.status === "returned");
  const lodgedTotal = lodged.reduce((a, t) => a + t.deposit.amountCents, 0);

  const setStatus = (t: ProTenant, status: ProTenant["deposit"]["status"]) => {
    update(`deposit.${status}`, (d) => ({
      ...d,
      tenants: d.tenants.map((x) =>
        x.id === t.id ? { ...x, deposit: { ...x.deposit, status }, ...(status === "lodged" ? { lodgedAt: today } : { returnedAt: today }) } : x,
      ),
    }));
    toast.success(status === "lodged" ? "Fianza depositada" : "Fianza devuelta", status === "lodged" ? "Guarda el justificante junto al contrato." : `${money(t.deposit.amountCents)} a ${t.name.split(" ")[0]}.`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Por depositar en la Generalitat"
        description="Cada fianza, con su plazo. Te avisamos antes de que venza."
        action={
          <Button size="sm" variant="outline" asChild>
            <a href={GVA_URL} target="_blank" rel="noreferrer">
              Ir a la sede de la Generalitat <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        }
        flush
      >
        {pending.length ? (
          <RowList>
            {pending.map((t) => {
              const days = daysBetween(today, t.deposit.dueAt);
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
                  <button type="button" onClick={() => onOpen(t.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold hover:underline">{t.name}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {data.properties.find((p) => p.id === t.propertyId)?.title} · contrato desde el {shortDate(t.contractStart)}
                    </span>
                  </button>
                  <span className="text-sm font-semibold tabular">{money(t.deposit.amountCents)}</span>
                  <Pill tone={days <= 7 ? "danger" : "warning"}>
                    {days < 0 ? "Plazo vencido" : days === 0 ? "Vence hoy" : `Plazo: ${days} días`}
                  </Pill>
                  <Button size="sm" variant="secondary" onClick={() => setStatus(t, "lodged")}>
                    <Check className="h-3.5 w-3.5" /> Depositada
                  </Button>
                  <DepositLateNote tenant={t} today={today} className="basis-full" />
                </div>
              );
            })}
          </RowList>
        ) : (
          <Empty icon={Landmark} title="Todas depositadas" body="Cuando firmes un contrato nuevo, su fianza aparecerá aquí con el plazo." />
        )}
      </Panel>

      {toReturn.length ? (
        <Panel title="Por devolver" description="Inquilinos que ya se han ido. Revisa la habitación y devuelve la fianza." flush>
          <RowList>
            {toReturn.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
                <button type="button" onClick={() => onOpen(t.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold hover:underline">{t.name}</span>
                  <span className="block text-xs text-text-muted">Salió el {shortDate(t.contractEnd)}</span>
                </button>
                <span className="text-sm font-semibold tabular">{money(t.deposit.amountCents)}</span>
                <Button size="sm" variant="secondary" onClick={() => setStatus(t, "returned")}>
                  Marcar devuelta
                </Button>
              </div>
            ))}
          </RowList>
        </Panel>
      ) : null}

      <Panel title="Depositadas" description={`${lodged.length} fianzas, ${money(lodgedTotal, { round: true })} en total.`} flush>
        {lodged.length ? (
          <RowList>
            {lodged.map((t) => (
              <Row key={t.id} onClick={() => onOpen(t.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {t.lodgedAt ? `Depositada el ${shortDate(t.lodgedAt)}` : "Depositada"} · hasta el {shortDate(t.contractEnd)}
                  </span>
                </span>
                <span className="text-sm tabular text-text-secondary">{money(t.deposit.amountCents)}</span>
              </Row>
            ))}
          </RowList>
        ) : (
          <p className="px-5 py-4 text-sm text-text-muted">Ninguna todavía.</p>
        )}
      </Panel>

      {returned.length ? (
        <p className="text-sm text-text-muted">
          {returned.length} {returned.length === 1 ? "fianza devuelta" : "fianzas devueltas"} en los últimos meses.
        </p>
      ) : null}

      <Tip title="La fianza en la Comunitat Valenciana">
        Se deposita en la Generalitat dentro del plazo legal y se recupera al acabar el contrato. Franky guarda la fecha de cada una y te avisa antes de que venza.
      </Tip>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function IncidentsTab({ onOpen }: { onOpen: (id: string | "new") => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [status, setStatus] = React.useState<ProIncident["status"] | "active">("active");
  const rank = { urgent: 0, normal: 1, low: 2 } as const;
  const list = data.incidents
    .filter((i) => (status === "active" ? i.status !== "resolved" : i.status === status))
    .sort((a, b) => rank[a.priority] - rank[b.priority] || a.createdAt.localeCompare(b.createdAt));

  const resolve = (i: ProIncident) => {
    update("incident.resolve", (d) => ({ ...d, incidents: d.incidents.map((x) => (x.id === i.id ? { ...x, status: "resolved" } : x)) }));
    toast.success("Incidencia resuelta", `Avisamos a ${i.tenantName.split(" ")[0]}.`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          size="sm"
          label="Estado"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Pendientes", count: data.incidents.filter((i) => i.status !== "resolved").length },
            { value: "open", label: INCIDENT_STATUS.open.label, count: data.incidents.filter((i) => i.status === "open").length },
            { value: "in_progress", label: INCIDENT_STATUS.in_progress.label, count: data.incidents.filter((i) => i.status === "in_progress").length },
            { value: "resolved", label: INCIDENT_STATUS.resolved.label, count: data.incidents.filter((i) => i.status === "resolved").length },
          ]}
        />
        <Button size="sm" variant="outline" onClick={() => onOpen("new")}>
          <Plus className="h-3.5 w-3.5" /> Nueva incidencia
        </Button>
      </div>
      <Panel flush>
        {list.length ? (
          <RowList>
            {list.map((i) => {
              const { property, room } = findRoom(data, i.propertyId, i.roomId);
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
                  <button type="button" onClick={() => onOpen(i.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <PriorityDot priority={i.priority} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold hover:underline">{i.title}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {property?.title}
                        {room ? `, ${room.name.toLowerCase()}` : ""} · {i.tenantName} · {relative(i.createdAt, now.getTime())}
                      </span>
                    </span>
                  </button>
                  <span className="flex items-center gap-1.5">
                    {i.priority === "urgent" ? <Pill tone="danger">{PRIORITY_LABEL.urgent}</Pill> : null}
                    <IncidentPill status={i.status} />
                    <span className="max-w-[9rem] truncate text-xs text-text-muted">{i.assignee ?? "Sin asignar"}</span>
                  </span>
                  {i.status !== "resolved" ? (
                    <Button size="sm" variant="ghost" onClick={() => resolve(i)}>
                      Resolver
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </RowList>
        ) : (
          <Empty icon={Wrench} title="Nada por aquí" body="Tus inquilinos abren incidencias desde su Franky con fotos, y te llegan aquí en vez de por WhatsApp." />
        )}
      </Panel>
      <ProvidersPanel />
      <Tip title="Adiós al WhatsApp de medianoche">
        Cada incidencia llega con piso, habitación y fotos. Asígnala a tu técnico y el inquilino ve el estado sin tener que preguntarte.
      </Tip>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewTenantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const freeRooms = data.properties.flatMap((p) => p.rooms.filter((r) => r.status === "free" || r.status === "reserved").map((r) => ({ p, r })));
  const [name, setName] = React.useState("");
  const [uni, setUni] = React.useState(UNIVERSITIES[0]);
  const [roomKey, setRoomKey] = React.useState(freeRooms[0] ? `${freeRooms[0].p.id}|${freeRooms[0].r.id}` : "");
  const [kind, setKind] = React.useState<ProTenant["contractKind"]>("temporada");
  const [start, setStart] = React.useState(today);
  const [months, setMonths] = React.useState("10");
  const selected = freeRooms.find((x) => `${x.p.id}|${x.r.id}` === roomKey);
  const [rent, setRent] = React.useState(selected ? String(selected.r.priceCents / 100) : "320");
  const [depositDone, setDepositDone] = React.useState(false);
  const valid = name.trim().length > 2 && selected && euros(rent) > 0 && start;

  const create = () => {
    if (!selected) return;
    const rentCents = euros(rent);
    const end = addDays(addMonths(start, Math.max(1, Number(months) || 1)), -1);
    const tenant: ProTenant = {
      id: localId("t"),
      name: name.trim(),
      university: uni,
      propertyId: selected.p.id,
      roomId: selected.r.id,
      rentCents,
      contractStart: start,
      contractEnd: end,
      contractKind: kind,
      deposit: { amountCents: rentCents * (kind === "temporada" ? 2 : 1), status: depositDone ? "lodged" : "pending", dueAt: addDays(start, 30) },
      rentStatus: start > today ? "paid" : "pending",
      lodgedAt: depositDone ? today : undefined,
    };
    update("tenant.create", (d) => ({
      ...d,
      tenants: [...d.tenants, tenant],
      properties: d.properties.map((p) =>
        p.id === selected.p.id ? { ...p, rooms: p.rooms.map((r) => (r.id === selected.r.id ? { ...r, status: "occupied", tenantId: tenant.id, availableFrom: addDays(end, 1) } : r)) } : p,
      ),
    }));
    toast.success("Inquilino añadido", `Invitamos a ${tenant.name.split(" ")[0]} a Franky para pagar y abrir incidencias desde el móvil.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Añadir inquilino"
      description="Para quien ya vive en tu piso. Los que firman por Franky entran solos."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={create} disabled={!valid}>Añadir</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre y apellido" htmlFor="nt-name">
          <input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Lucía Pastor" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Universidad" htmlFor="nt-uni">
            <select id="nt-uni" value={uni} onChange={(e) => setUni(e.target.value)} className={selectClass}>
              {UNIVERSITIES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Habitación" htmlFor="nt-room">
            <select
              id="nt-room"
              value={roomKey}
              onChange={(e) => {
                setRoomKey(e.target.value);
                const x = freeRooms.find((y) => `${y.p.id}|${y.r.id}` === e.target.value);
                if (x) setRent(String(x.r.priceCents / 100));
              }}
              className={selectClass}
            >
              {freeRooms.map(({ p, r }) => (
                <option key={`${p.id}|${r.id}`} value={`${p.id}|${r.id}`}>
                  {p.title}, {r.name.toLowerCase()}
                </option>
              ))}
              {!freeRooms.length ? <option value="">No hay habitaciones libres</option> : null}
            </select>
          </FormField>
        </div>
        <FormField label="Contrato">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={[
              { value: "temporada", label: "Temporada", hint: "Curso o cuatrimestre" },
              { value: "habitacion", label: "Habitación", hint: "Un año" },
            ]}
          />
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Desde" htmlFor="nt-start">
            <input id="nt-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Meses" htmlFor="nt-months">
            <input id="nt-months" type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Renta (€)" htmlFor="nt-rent">
            <input id="nt-rent" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <label className="flex min-h-10 items-center gap-2.5 text-sm">
          <input type="checkbox" checked={depositDone} onChange={(e) => setDepositDone(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
          La fianza ({money(euros(rent) * (kind === "temporada" ? 2 : 1))}) ya está depositada en la Generalitat
        </label>
      </div>
    </Drawer>
  );
}
