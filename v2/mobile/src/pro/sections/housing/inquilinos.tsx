import React from "react";
import { Text, View } from "react-native";
import { ArrowUpRight, Check, ChevronDown, ChevronUp, Home, Landmark, Plus, Wallet, Wrench } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, S } from "@/theme";
import type { ProIncident, ProTenant } from "../../../../../shared/pro/types";
import { addDays, localDate, money, pct, relative } from "../../../../../shared/pro/format";
import { CONTRACT_LABEL, GVA_URL, addMonths, currentTenants, daysBetween, findRoom, formerTenants, rentSummary, shortDate } from "../../../../../shared/pro/housing";
import { UNIVERSITIES } from "../../../../../shared/pro/demo/common";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Empty, Field, Input, Kpi, KpiRow, ListRow, Meter, PAvatar, PButton, PText, PageHeader, Panel, Pill, SearchInput, Segmented, Sheet, Stepper, Tip, Toggle } from "../../kit";
import { DepositPill, INCIDENT_STATUS, IncidentDrawer, IncidentPill, PRIORITY_LABEL, PriorityDot, RentPill, TenantDrawer } from "./drawers";
import { openExternal } from "./drawer-common";
import { UniBadge, euros } from "./shared";
import { DateField, MiniStat, SelectField } from "./ui";

type Tab = "tenants" | "rent" | "deposits" | "incidents";

/** Filas que se pintan de golpe en listas largas; el resto, con "Ver más". */
const PAGE = 40;

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
  const firstDue = [...pendingDeposits].sort((a, b) => a.deposit.dueAt.localeCompare(b.deposit.dueAt))[0];

  return (
    <>
      <ProPage>
        <PageHeader
          eyebrow="Inquilinos"
          title={`${current.length} inquilinos en ${flats} ${flats === 1 ? "piso" : "pisos"}`}
          description={`En ${monthName} llevas ${money(rent.paidCents, { round: true })} cobrados de ${money(rent.totalCents, { round: true })}. ${pendingDeposits.length ? `${pendingDeposits.length} fianzas por depositar` : "Todas las fianzas depositadas"} y ${openIncidents.length} incidencias abiertas.`}
          actions={
            <>
              <PButton label="Incidencia" variant="outline" icon={Wrench} onPress={() => setIncidentId("new")} accessibilityLabel="Nueva incidencia" />
              <PButton label="Añadir inquilino" icon={Plus} onPress={() => setAdding(true)} />
            </>
          }
        />

        <KpiRow>
          <Kpi icon={Home} label="Inquilinos" value={current.length} hint={`${current.filter((t) => t.leavingAt).length} se van pronto`} onPress={() => setTab("tenants")} />
          <Kpi icon={Wallet} label="Cobrado del mes" value={`${pct(rent.paidCents, rent.totalCents)} %`} hint={`${rent.late} con retraso`} onPress={() => setTab("rent")} emphasis={rent.late > 0} />
          <Kpi
            icon={Landmark}
            label="Fianzas por depositar"
            value={pendingDeposits.length}
            hint={firstDue ? `La primera vence el ${shortDate(firstDue.deposit.dueAt)}` : "Todo en orden"}
            onPress={() => setTab("deposits")}
          />
          <Kpi icon={Wrench} label="Incidencias abiertas" value={openIncidents.length} hint={`${openIncidents.filter((i) => i.priority === "urgent").length} urgentes`} onPress={() => setTab("incidents")} />
        </KpiRow>

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
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
      </ProPage>

      <TenantDrawer tenantId={tenantId} onClose={() => setTenantId(null)} />
      <IncidentDrawer incidentId={incidentId} onClose={() => setIncidentId(null)} />
      <NewTenantDrawer key={adding ? "open" : "closed"} open={adding} onClose={() => setAdding(false)} />
    </>
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
        action={<PButton label="Añadir inquilino" onPress={onAdd} />}
      />
    );

  return (
    <View>
      {data.tenants.length > 6 ? <SearchInput value={q} onChange={setQ} placeholder="Buscar inquilino" /> : null}
      {data.properties
        .map((p) => ({ p, list: current.filter((t) => t.propertyId === p.id).sort((a, b) => a.roomId.localeCompare(b.roomId)) }))
        .filter((x) => x.list.length)
        .map(({ p, list }) => (
          <Panel key={p.id} title={p.title} description={`${list.length} de ${p.rooms.length} habitaciones · ${p.address}`} flush>
            {list.map((t, i) => {
              const { room } = findRoom(data, t.propertyId, t.roomId);
              const endsSoon = daysBetween(today, t.contractEnd) <= 60;
              return (
                <ListRow key={t.id} onPress={() => onOpen(t.id)} accessibilityLabel={`Abrir ${t.name}`} last={i === list.length - 1}>
                  <PAvatar name={t.name} size={34} toneKey={t.leavingAt ? "amber" : "slate"} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.sm }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{t.name}</PText>
                      <UniBadge university={t.university} verified />
                    </View>
                    <PText v="tiny" numberOfLines={1}>{`${room?.name ?? ""} · ${CONTRACT_LABEL[t.contractKind]} hasta el ${shortDate(t.contractEnd)}`}</PText>
                    <PText v="tiny" color={C.text}>{money(t.rentCents)}</PText>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <RentPill status={t.rentStatus} />
                    {t.leavingAt ? <Pill tone="warning" label={`Se va el ${shortDate(t.leavingAt)}`} /> : endsSoon ? <Pill tone="info" label="Renovar" /> : null}
                  </View>
                </ListRow>
              );
            })}
          </Panel>
        ))}
      {!current.length && needle ? <Empty title="Nadie con ese nombre" body="Revisa cómo lo has escrito." /> : null}

      {former.length ? (
        <View style={{ marginBottom: S.lg }}>
          <Tap
            onPress={() => setShowFormer((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showFormer }}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" }}
          >
            {showFormer ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.3}>{`Antiguos inquilinos (${former.length})`}</Text>
          </Tap>
          {showFormer ? (
            <Panel flush style={{ marginTop: S.sm, marginBottom: 0 }}>
              {former.map((t, i) => (
                <ListRow key={t.id} onPress={() => onOpen(t.id)} accessibilityLabel={`Abrir ${t.name}`} last={i === former.length - 1}>
                  <PAvatar name={t.name} size={34} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{t.name}</PText>
                    <PText v="tiny" numberOfLines={1}>{`${data.properties.find((p) => p.id === t.propertyId)?.title ?? ""} · salió el ${shortDate(t.contractEnd)}`}</PText>
                  </View>
                  <DepositPill status={t.deposit.status} />
                </ListRow>
              ))}
            </Panel>
          ) : null}
        </View>
      ) : null}

      <Tip title="Renovaciones">
        Los contratos que acaban en los próximos dos meses llevan la etiqueta Renovar. Avisar en mayo evita la rotación de septiembre y te ahorra buscar inquilino en plena temporada.
      </Tip>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function RentTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, now, update, pending } = usePro();
  const [limit, setLimit] = React.useState(PAGE);
  const rent = rentSummary(data, now);
  const order = { late: 0, pending: 1, paid: 2 } as const;
  const list = [...rent.tenants].sort((a, b) => order[a.rentStatus] - order[b.rentStatus] || a.name.localeCompare(b.name));
  const monthName = new Date(now).toLocaleDateString("es-ES", { month: "long", timeZone: "Europe/Madrid" });

  const charge = async (t: ProTenant) => {
    const ok = await update("tenant.paid", (d) => ({
      ...d,
      tenants: d.tenants.map((x) => (x.id === t.id ? { ...x, rentStatus: "paid", paidThisMonthAt: new Date().toISOString() } : x)),
    }));
    if (!ok) return;
    toast("Renta cobrada", { kind: "success", body: `${money(t.rentCents)} de ${t.name.split(" ")[0]}.` });
  };
  const remind = async (t: ProTenant) => {
    const ok = await update("tenant.remind", (d) => ({ ...d, tenants: d.tenants.map((x) => (x.id === t.id ? { ...x, remindedAt: new Date().toISOString() } : x)) }));
    if (!ok) return;
    toast("Recordatorio enviado", { kind: "success", body: `${t.name.split(" ")[0]} lo recibe en Franky con el enlace de pago.` });
  };
  const remindAll = async () => {
    const ids = new Set(list.filter((t) => t.rentStatus !== "paid").map((t) => t.id));
    const ok = await update("tenant.remind.all", (d) => ({ ...d, tenants: d.tenants.map((x) => (ids.has(x.id) ? { ...x, remindedAt: new Date().toISOString() } : x)) }));
    if (!ok) return;
    toast("Recordatorios enviados", { kind: "success", body: `${ids.size} inquilinos lo reciben en Franky.` });
  };

  if (!list.length) return <Empty icon={Wallet} title="Aún no hay rentas este mes" body="Cuando añadas inquilinos, aquí verás quién ha pagado y quién no." />;

  return (
    <View>
      <Panel>
        <PText v="label">{`Renta de ${monthName}`}</PText>
        <Text style={{ marginTop: 4 }} maxFontSizeMultiplier={1.2}>
          <Text style={{ fontFamily: FONT.display, fontSize: 28, color: C.text }}>{money(rent.paidCents, { round: true })}</Text>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.muted }}>{` de ${money(rent.totalCents, { round: true })}`}</Text>
        </Text>
        {rent.pending + rent.late ? (
          <PButton small label={`Recordar a los ${rent.pending + rent.late} que faltan`} variant="outline" onPress={() => void remindAll()} disabled={pending} style={{ marginTop: S.sm }} />
        ) : null}
        <View style={{ marginTop: S.md }}>
          <Meter value={rent.paidCents} max={rent.totalCents} tone="success" />
        </View>
        <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
          <MiniStat boxed label={`Cobrado (${rent.paid})`} value={money(rent.paidCents, { round: true })} />
          <MiniStat boxed label={`Pendiente (${rent.pending})`} value={money(rent.pendingCents, { round: true })} />
          <MiniStat boxed label={`Con retraso (${rent.late})`} value={money(rent.lateCents, { round: true })} danger={rent.late > 0} />
        </View>
      </Panel>

      <Panel flush>
        {list.slice(0, limit).map((t, i, arr) => {
          const { property, room } = findRoom(data, t.propertyId, t.roomId);
          const reminded = t.remindedAt;
          return (
            <View key={t.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
              <Tap onPress={() => onOpen(t.id)} accessibilityRole="button" accessibilityLabel={`Abrir ${t.name}`} style={{ flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 44 }}>
                <PAvatar name={t.name} size={34} />
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{t.name}</PText>
                  <PText v="tiny" numberOfLines={1}>
                    {`${property?.title ?? ""}, ${room?.name.toLowerCase() ?? ""}${
                      t.rentStatus === "paid" && t.paidThisMonthAt ? ` · pagó ${relative(t.paidThisMonthAt, now.getTime())}` : reminded ? ` · recordado ${relative(reminded, now.getTime())}` : ""
                    }`}
                  </PText>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <PText v="h3">{money(t.rentCents)}</PText>
                  <RentPill status={t.rentStatus} />
                </View>
              </Tap>
              {t.rentStatus !== "paid" ? (
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: S.sm }}>
                  <PButton small label={reminded ? "Recordado" : "Recordar"} variant="ghost" onPress={() => void remind(t)} disabled={pending || Boolean(reminded)} accessibilityLabel={`Recordar el pago a ${t.name}`} />
                  <PButton small label="Cobrado" variant="secondary" icon={Check} onPress={() => void charge(t)} disabled={pending} accessibilityLabel={`Marcar cobrada la renta de ${t.name}`} />
                </View>
              ) : null}
            </View>
          );
        })}
        {list.length > limit ? (
          <View style={{ padding: S.md }}>
            <PButton label={`Ver más (${list.length - limit})`} variant="outline" full onPress={() => setLimit((n) => n + PAGE)} />
          </View>
        ) : null}
      </Panel>
      <Tip title="Cobros sin perseguir a nadie">
        El recordatorio llega a su Franky con el importe y el enlace de pago. Los pagos por Franky se marcan solos; los que cobras por transferencia, márcalos aquí.
      </Tip>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function DepositsTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, now, update, pending: busy } = usePro();
  const today = localDate(now);
  const pending = data.tenants.filter((t) => t.deposit.status === "pending").sort((a, b) => a.deposit.dueAt.localeCompare(b.deposit.dueAt));
  const toReturn = data.tenants.filter((t) => t.deposit.status === "lodged" && t.contractEnd < today);
  const lodged = data.tenants.filter((t) => t.deposit.status === "lodged" && t.contractEnd >= today);
  const returned = data.tenants.filter((t) => t.deposit.status === "returned");
  const lodgedTotal = lodged.reduce((a, t) => a + t.deposit.amountCents, 0);

  const setStatus = async (t: ProTenant, status: ProTenant["deposit"]["status"]) => {
    const ok = await update(`deposit.${status}`, (d) => ({
      ...d,
      tenants: d.tenants.map((x) => (x.id === t.id ? { ...x, deposit: { ...x.deposit, status }, ...(status === "lodged" ? { lodgedAt: today } : { returnedAt: today }) } : x)),
    }));
    if (!ok) return;
    toast(status === "lodged" ? "Fianza depositada" : "Fianza devuelta", {
      kind: "success",
      body: status === "lodged" ? "Guarda el justificante junto al contrato." : `${money(t.deposit.amountCents)} a ${t.name.split(" ")[0]}.`,
    });
  };

  return (
    <View>
      <Panel
        title="Por depositar en la Generalitat"
        description="Cada fianza, con su plazo. Te avisamos antes de que venza."
        flush
      >
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
          <PButton small label="Ir a la sede de la Generalitat" variant="outline" icon={ArrowUpRight} onPress={() => openExternal(GVA_URL)} />
        </View>
        {pending.length ? (
          pending.map((t, i) => {
            const days = daysBetween(today, t.deposit.dueAt);
            return (
              <View key={t.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === pending.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
                <Tap onPress={() => onOpen(t.id)} accessibilityRole="button" accessibilityLabel={`Abrir ${t.name}`} style={{ flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 44 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{t.name}</PText>
                    <PText v="tiny" numberOfLines={1}>{`${data.properties.find((p) => p.id === t.propertyId)?.title ?? ""} · contrato desde el ${shortDate(t.contractStart)}`}</PText>
                  </View>
                  <PText v="h3">{money(t.deposit.amountCents)}</PText>
                </Tap>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
                  <Pill tone={days <= 7 ? "danger" : "warning"} label={days < 0 ? "Plazo vencido" : days === 0 ? "Vence hoy" : `Plazo: ${days} días`} />
                  <PButton small label="Depositada" variant="secondary" icon={Check} onPress={() => void setStatus(t, "lodged")} disabled={busy} accessibilityLabel={`Marcar depositada la fianza de ${t.name}`} />
                </View>
              </View>
            );
          })
        ) : (
          <Empty icon={Landmark} title="Todas depositadas" body="Cuando firmes un contrato nuevo, su fianza aparecerá aquí con el plazo." />
        )}
      </Panel>

      {toReturn.length ? (
        <Panel title="Por devolver" description="Inquilinos que ya se han ido. Revisa la habitación y devuelve la fianza." flush>
          {toReturn.map((t, i) => (
            <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: i === toReturn.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
              <Tap onPress={() => onOpen(t.id)} accessibilityRole="button" accessibilityLabel={`Abrir ${t.name}`} style={{ flex: 1, minHeight: 44, justifyContent: "center", gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{t.name}</PText>
                <PText v="tiny">{`Salió el ${shortDate(t.contractEnd)} · ${money(t.deposit.amountCents)}`}</PText>
              </Tap>
              <PButton small label="Marcar devuelta" variant="secondary" onPress={() => void setStatus(t, "returned")} disabled={busy} accessibilityLabel={`Marcar devuelta la fianza de ${t.name}`} />
            </View>
          ))}
        </Panel>
      ) : null}

      <Panel title="Depositadas" description={`${lodged.length} fianzas, ${money(lodgedTotal, { round: true })} en total.`} flush>
        {lodged.length ? (
          lodged.map((t, i) => (
            <ListRow key={t.id} onPress={() => onOpen(t.id)} accessibilityLabel={`Abrir ${t.name}`} last={i === lodged.length - 1}>
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{t.name}</PText>
                <PText v="tiny" numberOfLines={1}>{`${t.lodgedAt ? `Depositada el ${shortDate(t.lodgedAt)}` : "Depositada"} · hasta el ${shortDate(t.contractEnd)}`}</PText>
              </View>
              <PText v="small" color={C.text}>{money(t.deposit.amountCents)}</PText>
            </ListRow>
          ))
        ) : (
          <PText v="small" style={{ paddingHorizontal: S.lg, paddingVertical: S.md }}>Ninguna todavía.</PText>
        )}
      </Panel>

      {returned.length ? (
        <PText v="small" style={{ marginBottom: S.lg }}>
          {`${returned.length} ${returned.length === 1 ? "fianza devuelta" : "fianzas devueltas"} en los últimos meses.`}
        </PText>
      ) : null}

      <Tip title="La fianza en la Comunitat Valenciana">
        Se deposita en la Generalitat dentro del plazo legal y se recupera al acabar el contrato. Franky guarda la fecha de cada una y te avisa antes de que venza.
      </Tip>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function IncidentsTab({ onOpen }: { onOpen: (id: string | "new") => void }) {
  const { data, now, update, pending } = usePro();
  const [status, setStatus] = React.useState<ProIncident["status"] | "active">("active");
  const [limit, setLimit] = React.useState(PAGE);
  const rank = { urgent: 0, normal: 1, low: 2 } as const;
  const list = data.incidents
    .filter((i) => (status === "active" ? i.status !== "resolved" : i.status === status))
    .sort((a, b) => rank[a.priority] - rank[b.priority] || a.createdAt.localeCompare(b.createdAt));

  const resolve = async (i: ProIncident) => {
    const ok = await update("incident.resolve", (d) => ({ ...d, incidents: d.incidents.map((x) => (x.id === i.id ? { ...x, status: "resolved" } : x)) }));
    if (!ok) return;
    toast("Incidencia resuelta", { kind: "success", body: `Avisamos a ${i.tenantName.split(" ")[0]}.` });
  };

  return (
    <View>
      <Segmented
        value={status}
        onChange={(s) => {
          setStatus(s);
          setLimit(PAGE);
        }}
        options={[
          { value: "active", label: "Pendientes", count: data.incidents.filter((i) => i.status !== "resolved").length },
          { value: "open", label: INCIDENT_STATUS.open.label, count: data.incidents.filter((i) => i.status === "open").length },
          { value: "in_progress", label: INCIDENT_STATUS.in_progress.label, count: data.incidents.filter((i) => i.status === "in_progress").length },
          { value: "resolved", label: INCIDENT_STATUS.resolved.label, count: data.incidents.filter((i) => i.status === "resolved").length },
        ]}
      />
      <PButton small label="Nueva incidencia" variant="outline" icon={Plus} onPress={() => onOpen("new")} style={{ marginBottom: S.md }} />
      <Panel flush>
        {list.length ? (
          <>
            {list.slice(0, limit).map((inc, idx, arr) => {
              const { property, room } = findRoom(data, inc.propertyId, inc.roomId);
              return (
                <View key={inc.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: idx === arr.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
                  <Tap onPress={() => onOpen(inc.id)} accessibilityRole="button" accessibilityLabel={`Abrir ${inc.title}`} style={{ flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 44 }}>
                    <PriorityDot priority={inc.priority} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <PText v="h3" numberOfLines={1}>{inc.title}</PText>
                      <PText v="tiny" numberOfLines={2}>
                        {`${property?.title ?? ""}${room ? `, ${room.name.toLowerCase()}` : ""} · ${inc.tenantName} · ${relative(inc.createdAt, now.getTime())}`}
                      </PText>
                    </View>
                  </Tap>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginLeft: 21 }}>
                    {inc.priority === "urgent" ? <Pill tone="danger" label={PRIORITY_LABEL.urgent} /> : null}
                    <IncidentPill status={inc.status} />
                    <PText v="tiny" numberOfLines={1} style={{ flex: 1 }}>{inc.assignee ?? "Sin asignar"}</PText>
                    {inc.status !== "resolved" ? (
                      <PButton small label="Resolver" variant="ghost" onPress={() => void resolve(inc)} disabled={pending} accessibilityLabel={`Resolver ${inc.title}`} />
                    ) : null}
                  </View>
                </View>
              );
            })}
            {list.length > limit ? (
              <View style={{ padding: S.md }}>
                <PButton label={`Ver más (${list.length - limit})`} variant="outline" full onPress={() => setLimit((n) => n + PAGE)} />
              </View>
            ) : null}
          </>
        ) : (
          <Empty icon={Wrench} title="Nada por aquí" body="Tus inquilinos abren incidencias desde su Franky con fotos, y te llegan aquí en vez de por WhatsApp." />
        )}
      </Panel>
      <Tip title="Adiós al WhatsApp de medianoche">
        Cada incidencia llega con piso, habitación y fotos. Asígnala a tu técnico y el inquilino ve el estado sin tener que preguntarte.
      </Tip>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function NewTenantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now, pending } = usePro();
  const today = localDate(now);
  const freeRooms = data.properties.flatMap((p) => p.rooms.filter((r) => r.status === "free" || r.status === "reserved").map((r) => ({ p, r })));
  const [name, setName] = React.useState("");
  const [uni, setUni] = React.useState(UNIVERSITIES[0]);
  const [roomKey, setRoomKey] = React.useState(freeRooms[0] ? `${freeRooms[0].p.id}|${freeRooms[0].r.id}` : "");
  const [kind, setKind] = React.useState<ProTenant["contractKind"]>("temporada");
  const [start, setStart] = React.useState(today);
  const [months, setMonths] = React.useState(10);
  const selected = freeRooms.find((x) => `${x.p.id}|${x.r.id}` === roomKey);
  const [rent, setRent] = React.useState(selected ? String(selected.r.priceCents / 100) : "320");
  const [depositDone, setDepositDone] = React.useState(false);
  const valid = name.trim().length > 2 && Boolean(selected) && euros(rent) > 0 && Boolean(start);

  const create = async () => {
    if (!selected) return;
    const rentCents = euros(rent);
    const end = addDays(addMonths(start, Math.max(1, months || 1)), -1);
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
    const ok = await update("tenant.create", (d) => ({
      ...d,
      tenants: [...d.tenants, tenant],
      properties: d.properties.map((p) =>
        p.id === selected.p.id ? { ...p, rooms: p.rooms.map((r) => (r.id === selected.r.id ? { ...r, status: "occupied", tenantId: tenant.id, availableFrom: addDays(end, 1) } : r)) } : p,
      ),
    }));
    if (!ok) return;
    toast("Inquilino añadido", { kind: "success", body: `Invitamos a ${tenant.name.split(" ")[0]} a Franky para pagar y abrir incidencias desde el móvil.` });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Añadir inquilino"
      description="Para quien ya vive en tu piso. Los que firman por Franky entran solos."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Añadir" onPress={() => void create()} disabled={pending || !valid} />
        </>
      }
    >
      <Field label="Nombre y apellido">
        <Input value={name} onChangeText={setName} placeholder="Lucía Pastor" label="Nombre y apellido" autoCapitalize="words" />
      </Field>
      <SelectField label="Universidad" value={uni} onChange={setUni} options={UNIVERSITIES.map((u) => ({ value: u, label: u }))} />
      <SelectField
        label="Habitación"
        value={roomKey}
        placeholder="No hay habitaciones libres"
        onChange={(v) => {
          setRoomKey(v);
          const x = freeRooms.find((y) => `${y.p.id}|${y.r.id}` === v);
          if (x) setRent(String(x.r.priceCents / 100));
        }}
        options={freeRooms.map(({ p, r }) => ({ value: `${p.id}|${r.id}`, label: `${p.title}, ${r.name.toLowerCase()}` }))}
      />
      <Field label="Contrato">
        <ChoiceGrid
          value={kind}
          onChange={setKind}
          options={[
            { value: "temporada", label: "Temporada", hint: "Curso o cuatrimestre" },
            { value: "habitacion", label: "Habitación", hint: "Un año" },
          ]}
        />
      </Field>
      <DateField label="Desde" value={start} onChange={setStart} today={today} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
        <Field label="Meses">
          <Stepper value={months} onChange={setMonths} min={1} max={24} label="meses" />
        </Field>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Field label="Renta (€)">
            <Input value={rent} onChangeText={setRent} keyboardType="decimal-pad" label="Renta en euros" />
          </Field>
        </View>
      </View>
      <Toggle
        label={`La fianza (${money(euros(rent) * (kind === "temporada" ? 2 : 1))}) ya está depositada en la Generalitat`}
        value={depositDone}
        onChange={setDepositDone}
      />
    </Sheet>
  );
}
