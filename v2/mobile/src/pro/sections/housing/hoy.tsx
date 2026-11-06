import React from "react";
import { Text, View } from "react-native";
import { ArrowRight, ArrowUpRight, BedDouble, Building2, CalendarCheck2, CalendarClock, Inbox, KeyRound, MapPin, MessageCircle, Plus, Sparkles, Users, Video, Wallet, Wrench } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import { dayLabel, greeting, localDate, money, pct, plural, relative, time } from "../../../../../shared/pro/format";
import {
  GVA_URL,
  PORTAL_FEE,
  VISIT_STATUS,
  currentTenants,
  daysBetween,
  findRoom,
  freeBy,
  housingResults,
  intakes,
  occupancy,
  rentSummary,
  roomieSuggestions,
  shortDate,
  uniShort,
  waitingLabel,
  waitingMinutes,
  waitingTone,
} from "../../../../../shared/pro/housing";
import { housingDeadlines, rentReminderText, tomorrowVisits, whatsappHref } from "../../../../../shared/pro/housing-ops";
import type { ProTenant } from "../../../../../shared/pro/types";
import { usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import { DarkBlock, DarkText, Empty, Kpi, KpiRow, ListRow, Meter, PAvatar, PButton, PText, PageHeader, Panel, Pill, Tip, tone } from "../../kit";
import { SetupChecklist } from "../common/checklist";
import { IncidentDrawer, LeadDrawer, NewPropertyDrawer, PriorityDot, TenantDrawer, VisitDrawer } from "./drawers";
import { openExternal } from "./drawer-common";
import { RoomieBadge, UniBadge } from "./shared";
import { MeterKpi, MiniStat, PanelLink, TextLink } from "./ui";

export default function HousingHoy() {
  const { data, now, update, pending } = usePro();
  const go = useGoSection();
  const today = localDate(now);
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const [visitId, setVisitId] = React.useState<string | null>(null);
  const [tenantId, setTenantId] = React.useState<string | null>(null);
  const [tenantLeaving, setTenantLeaving] = React.useState(false);
  const [incidentId, setIncidentId] = React.useState<string | null>(null);
  const [newProperty, setNewProperty] = React.useState(false);

  const occ = occupancy(data);
  const win = intakes(now);
  const freeSoon = freeBy(data, win.soon.by);
  const freeFeb = freeBy(data, win.feb.by);
  const rent = rentSummary(data, now);
  const newLeads = data.leads.filter((l) => l.stage === "new").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const unanswered = newLeads.filter((l) => waitingMinutes(l, now) >= 60);
  const visitsToday = data.visits.filter((v) => localDate(v.start) === today && v.status !== "cancelled").sort((a, b) => a.start.localeCompare(b.start));
  const nextVisit = visitsToday.find((v) => v.status === "scheduled");
  const deposits = data.tenants.filter((t) => t.deposit.status === "pending").sort((a, b) => a.deposit.dueAt.localeCompare(b.deposit.dueAt));
  const openIncidents = data.incidents.filter((i) => i.status !== "resolved");
  const urgentIncidents = openIncidents.filter((i) => i.priority === "urgent");
  const leaving = currentTenants(data, now)
    .filter((t) => t.leavingAt)
    .sort((a, b) => (a.leavingAt ?? "").localeCompare(b.leavingAt ?? ""));
  const lateTenants = rent.tenants.filter((t) => t.rentStatus === "late");
  const monthName = new Date(now).toLocaleDateString("es-ES", { month: "long", timeZone: "Europe/Madrid" });

  const summary = [
    newLeads.length ? plural(newLeads.length, "interesado nuevo", "interesados nuevos") : null,
    visitsToday.length ? plural(visitsToday.length, "visita hoy", "visitas hoy") : null,
    freeSoon.length ? `${plural(freeSoon.length, "habitación libre", "habitaciones libres")} para ${win.soon.label}` : null,
  ].filter(Boolean);

  // El recordatorio sale por WhatsApp con el importe y los meses que debe.
  const remind = async (tenant: ProTenant) => {
    openExternal(whatsappHref(rentReminderText(data, tenant, now)));
    const ok = await update("tenant.remind", (d) => ({ ...d, tenants: d.tenants.map((t) => (t.id === tenant.id ? { ...t, remindedAt: new Date().toISOString() } : t)) }));
    if (!ok) return;
    toast("Recordatorio listo en WhatsApp", { kind: "success", body: `Con el importe que debe ${tenant.name.split(" ")[0]}. Solo tienes que enviarlo.` });
  };
  const tomorrow = tomorrowVisits(data, now);
  const deadlines = housingDeadlines(data, now, 45);
  // El que se va antes y ya tiene sustitutos: lo primero que hay que mirar.
  const firstLeaving = leaving.map((t) => ({ t, sug: roomieSuggestions(data, t, now, 3) })).find((x) => x.sug.length);

  const waitColor = (t: ReturnType<typeof waitingTone>) => (t === "danger" ? C.errorText : t === "warning" ? C.warning : C.muted);

  return (
    <View style={{ flex: 1 }}>
      <ProPage>
        <PageHeader
          eyebrow={dayLabel(now.toISOString())}
          title={`${greeting(now)}, ${data.space.owner.firstName}`}
          description={summary.length ? `Hoy tienes ${summary.join(", ").replace(/, ([^,]*)$/, " y $1")}.` : "Todo al día. Buen momento para revisar precios."}
          actions={<PButton label="Añadir piso" icon={Plus} onPress={() => setNewProperty(true)} />}
        />

        <SetupChecklist />

        {firstLeaving ? (
          <Tap
            onPress={() => {
              setTenantLeaving(true);
              setTenantId(firstLeaving.t.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${firstLeaving.t.name} se va y Roomie tiene sustitutos`}
            style={{ flexDirection: "row", alignItems: "center", gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: `${C.blue}40`, backgroundColor: C.accentSoft, padding: S.md, marginBottom: S.sm }}
          >
            <Users size={20} color={C.blue} strokeWidth={1.9} />
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3" color={C.blueDeep}>{`${firstLeaving.t.name.split(" ")[0]} se va el ${shortDate(firstLeaving.t.leavingAt ?? firstLeaving.t.contractEnd)}`}</PText>
              <PText v="tiny">
                {`Roomie tiene ${firstLeaving.sug.length === 1 ? "1 sustituto compatible" : `${firstLeaving.sug.length} sustitutos compatibles`} con los que se quedan.`}
              </PText>
            </View>
            <ArrowRight size={16} color={C.blue} />
          </Tap>
        ) : null}
        {tomorrow.list.length ? (
          <Tap
            onPress={() => go("visitas")}
            accessibilityRole="button"
            accessibilityLabel={`Mañana, ${plural(tomorrow.list.length, "visita", "visitas")}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: S.md,
              borderRadius: R.lg,
              borderWidth: 1,
              borderColor: tomorrow.unconfirmed.length ? `${C.warning}66` : C.border,
              backgroundColor: tomorrow.unconfirmed.length ? `${C.warning}14` : C.surface,
              padding: S.md,
              marginBottom: S.lg,
            }}
          >
            <CalendarCheck2 size={20} color={tomorrow.unconfirmed.length ? C.warning : C.muted} strokeWidth={1.9} />
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3">
                {`Mañana: ${plural(tomorrow.list.length, "visita", "visitas")}${tomorrow.unconfirmed.length ? `, ${tomorrow.unconfirmed.length} sin confirmar` : ", todas confirmadas"}`}
              </PText>
              <PText v="tiny">{tomorrow.unconfirmed.length ? "Pide confirmación por WhatsApp y evita plantones." : "Nadie debería fallarte."}</PText>
            </View>
            <ArrowRight size={16} color={C.muted} />
          </Tap>
        ) : firstLeaving ? (
          <View style={{ height: S.sm }} />
        ) : null}

        <KpiRow>
          <MeterKpi
            icon={BedDouble}
            label="Ocupación"
            value={`${pct(occ.occupied, occ.total)} %`}
            hint={`${occ.occupied} de ${occ.total} habitaciones${occ.reserved ? `, ${occ.reserved} reservadas` : ""}`}
            meter={{ value: occ.occupied + occ.reserved, max: occ.total, tone: pct(occ.occupied, occ.total) >= 90 ? "success" : "violet" }}
          />
          <Kpi icon={KeyRound} label={`Libres para ${win.soon.label}`} value={freeSoon.length} hint={`${freeFeb.length} para febrero`} emphasis={freeSoon.length > 0} />
          <Kpi icon={Wallet} label={`Cobrado en ${monthName}`} value={money(rent.paidCents, { round: true })} hint={`${money(rent.pendingCents + rent.lateCents, { round: true })} por cobrar`} />
          <Kpi icon={Inbox} label="Interesados nuevos" value={newLeads.length} hint={unanswered.length ? `${unanswered.length} esperan más de 1 h` : "Todos al día"} />
        </KpiRow>

        <Panel
          title="Esperan tu respuesta"
          description="Estudiantes verificados que han escrito. Contestar el mismo día duplica las visitas."
          action={<PanelLink label="Interesados" onPress={() => go("interesados")} />}
          flush
        >
          {newLeads.length ? (
            newLeads.slice(0, 5).map((l, i, arr) => {
              const wait = waitingMinutes(l, now);
              const wt = waitingTone(wait);
              const { property } = findRoom(data, l.propertyId, l.roomId);
              return (
                <ListRow key={l.id} onPress={() => setLeadId(l.id)} accessibilityLabel={`${l.name}, espera ${waitingLabel(wait)}`} last={i === arr.length - 1}>
                  <PAvatar name={l.name} size={34} toneKey={l.roomieGroup ? "violet" : "slate"} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.sm, rowGap: 2 }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{l.name}</PText>
                      <UniBadge university={l.university} verified={l.verified} />
                      {l.roomieGroup ? <RoomieBadge group={l.roomieGroup} /> : null}
                    </View>
                    <PText v="tiny" numberOfLines={1}>
                      {`Entrada ${shortDate(l.moveIn)} · ${l.months} meses · hasta ${money(l.budgetCents)}${property ? ` · ${property.title}` : ""}`}
                    </PText>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: waitColor(wt) }} maxFontSizeMultiplier={1.3}>{waitingLabel(wait)}</Text>
                    <PText v="tiny">esperando</PText>
                  </View>
                </ListRow>
              );
            })
          ) : (
            <Empty icon={Inbox} title="Nadie esperando" body="Has contestado a todos. Los nuevos interesados aparecen aquí en cuanto escriben." />
          )}
        </Panel>

        <Panel
          title="Visitas de hoy"
          description={nextVisit ? `La próxima, a las ${time(nextVisit.start)}.` : visitsToday.length ? "Ya no quedan más por hoy." : undefined}
          action={<PanelLink label="Agenda" onPress={() => go("visitas")} />}
          flush
        >
          {visitsToday.length ? (
            visitsToday.map((v, i) => {
              const lead = data.leads.find((l) => l.id === v.leadId);
              const property = data.properties.find((p) => p.id === v.propertyId);
              const agent = data.staff.find((s) => s.id === v.agentId);
              const past = v.status !== "scheduled";
              return (
                <ListRow key={v.id} onPress={() => setVisitId(v.id)} accessibilityLabel={`Visita a las ${time(v.start)} con ${lead?.name ?? "interesado"}`} last={i === visitsToday.length - 1}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: S.md, flex: 1, opacity: past ? 0.7 : 1 }}>
                    <Text style={{ width: 46, fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.2}>{time(v.start)}</Text>
                    <View style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: tone(agent?.tone ?? "slate").bar }} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <PText v="h3" numberOfLines={1}>{lead?.name ?? "Interesado"}</PText>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        {v.mode === "video" ? <Video size={12} color={C.muted} /> : <MapPin size={12} color={C.muted} />}
                        <PText v="tiny" numberOfLines={1} style={{ flex: 1 }}>
                          {`${property?.title ?? ""}${agent && data.staff.length > 1 ? ` · ${agent.name.split(" ")[0]}` : ""}`}
                        </PText>
                      </View>
                    </View>
                    <Pill tone={VISIT_STATUS[v.status].tone} label={VISIT_STATUS[v.status].label} />
                  </View>
                </ListRow>
              );
            })
          ) : (
            <Empty icon={KeyRound} title="Hoy no hay visitas" body="Propón visitas a tus interesados desde su ficha. Eligen hora dentro de tus franjas." />
          )}
        </Panel>

        <Panel title="Se van y Roomie ya tiene sustitutos" description="Inquilinos que dejan la habitación y estudiantes compatibles con los que se quedan." flush>
          {leaving.length ? (
            leaving.map((t, i) => {
              const { property, room } = findRoom(data, t.propertyId, t.roomId);
              const sug = roomieSuggestions(data, t, now, 2);
              return (
                <View key={t.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === leaving.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
                  <Tap
                    onPress={() => {
                      setTenantLeaving(false);
                      setTenantId(t.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.name}, libre el ${shortDate(t.leavingAt ?? t.contractEnd)}`}
                    style={{ flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 44 }}
                  >
                    <PAvatar name={t.name} size={34} toneKey="amber" />
                    <View style={{ flex: 1, gap: 2 }}>
                      <PText v="h3" numberOfLines={1}>{t.name}</PText>
                      <PText v="tiny" numberOfLines={1}>{`${property?.title ?? ""}, ${room?.name.toLowerCase() ?? ""} · libre el ${shortDate(t.leavingAt ?? t.contractEnd)}`}</PText>
                    </View>
                    <PText v="h3">{money(t.rentCents)}</PText>
                  </Tap>
                  {sug.length ? (
                    <View style={{ marginLeft: 46, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                      {sug.map((s) => (
                        <View key={s.lead.id} style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: R.full, borderWidth: 1, borderColor: `${C.blue}40`, backgroundColor: C.accentSoft, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Users size={12} color={C.blueDeep} strokeWidth={1.9} />
                          <Text style={{ fontSize: 12, color: C.blueDeep }} maxFontSizeMultiplier={1.3}>{`${s.lead.name.split(" ")[0]} (${uniShort(s.lead.university)}), ${s.score} %`}</Text>
                        </View>
                      ))}
                      <PButton
                        small
                        label="Proponer"
                        variant="ghost"
                        accessibilityLabel={`Proponer sustitutos para ${t.name}`}
                        onPress={() => {
                          setTenantLeaving(true);
                          setTenantId(t.id);
                        }}
                      />
                    </View>
                  ) : (
                    <PText v="tiny" style={{ marginLeft: 46 }}>Roomie te avisa en cuanto entre un interesado compatible.</PText>
                  )}
                </View>
              );
            })
          ) : (
            <Empty icon={Users} title="Nadie se va por ahora" body="Cuando registres una salida, Roomie te propone sustitutos compatibles." />
          )}
        </Panel>

        <Panel title="Tus pisos" description="Habitaciones ocupadas sobre el total de cada piso." flush>
          {data.properties.map((p, i) => {
            const taken = p.rooms.filter((r) => r.status !== "free").length;
            const free = p.rooms.filter((r) => r.status === "free").length;
            return (
              <ListRow key={p.id} onPress={() => go("cartera")} accessibilityLabel={`${p.title}, ${taken} de ${p.rooms.length} ocupadas`} last={i === data.properties.length - 1}>
                <Building2 size={17} color={C.muted} strokeWidth={1.75} />
                <View style={{ flex: 1, gap: 6 }}>
                  <PText v="h3" numberOfLines={1}>{p.title}</PText>
                  <Meter value={taken} max={p.rooms.length} tone={free ? "violet" : "success"} />
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <PText v="tiny">{`${taken}/${p.rooms.length}`}</PText>
                  {free ? <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.success }} maxFontSizeMultiplier={1.3}>{`${free} libre${free > 1 ? "s" : ""}`}</Text> : null}
                </View>
              </ListRow>
            );
          })}
        </Panel>

        <Panel title={`Cobros de ${monthName}`} action={<PanelLink label="Ver" accessibilityLabel="Ver inquilinos" onPress={() => go("inquilinos")} />}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: S.sm }}>
            <Text style={{ fontFamily: FONT.display, fontSize: 24, color: C.text }} maxFontSizeMultiplier={1.2}>{money(rent.paidCents, { round: true })}</Text>
            <PText v="small">{`de ${money(rent.totalCents, { round: true })}`}</PText>
          </View>
          <View style={{ marginTop: S.sm }}>
            <Meter value={rent.paidCents} max={rent.totalCents} tone="success" />
          </View>
          <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
            <MiniStat label="Cobrado" value={rent.paid} />
            <MiniStat label="Pendiente" value={rent.pending} />
            <MiniStat label="Con retraso" value={rent.late} danger={rent.late > 0} />
          </View>
          {lateTenants.length ? (
            <View style={{ marginTop: S.md, paddingTop: S.sm, borderTopWidth: 1, borderTopColor: C.borderLight, gap: 4 }}>
              {lateTenants.map((t) => (
                <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 44 }}>
                  <Tap onPress={() => setTenantId(t.id)} accessibilityRole="button" accessibilityLabel={`Abrir ${t.name}`} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
                    <PText v="body" numberOfLines={1}>{t.name}</PText>
                  </Tap>
                  <PText v="tiny">{money(t.rentCents)}</PText>
                  {t.remindedAt ? (
                    <Pill label="Recordado" />
                  ) : (
                    <PButton small label="Recordar" variant="ghost" icon={MessageCircle} accessibilityLabel={`Recordar el pago a ${t.name} por WhatsApp`} onPress={() => void remind(t)} disabled={pending} />
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </Panel>

        {deadlines.length ? (
          <Panel title="Próximos plazos" description="Fianzas, contratos que acaban, certificado, seguro e IBI." flush>
            {deadlines.slice(0, 6).map((dl) => {
              const days = daysBetween(today, dl.date);
              const when = days < 0 ? "Vencido" : days === 0 ? "Hoy" : days === 1 ? "Mañana" : `${days} días`;
              return (
                <ListRow
                  key={dl.id}
                  onPress={() => (dl.tenantId ? setTenantId(dl.tenantId) : go("cartera"))}
                  accessibilityLabel={`${dl.title}, ${when}`}
                >
                  <CalendarClock size={17} color={C.muted} strokeWidth={1.75} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{dl.title}</PText>
                    <PText v="tiny" numberOfLines={1}>{`${shortDate(dl.date)} · ${dl.detail}`}</PText>
                  </View>
                  <Pill tone={dl.tone === "neutral" ? "neutral" : dl.tone} label={when} />
                </ListRow>
              );
            })}
            {deposits.length ? (
              <View style={{ paddingHorizontal: S.lg, paddingVertical: S.sm }}>
                <TextLink label="Depositar fianzas en la sede de la Generalitat" icon={ArrowUpRight} onPress={() => openExternal(GVA_URL)} />
              </View>
            ) : null}
          </Panel>
        ) : null}

        <Panel
          title="Incidencias"
          description={openIncidents.length ? `${openIncidents.length} abiertas, ${urgentIncidents.length} urgentes.` : undefined}
          action={<PanelLink label="Todas" accessibilityLabel="Ver todas las incidencias" onPress={() => go("inquilinos")} />}
          flush
        >
          {openIncidents.length ? (
            [...openIncidents]
              .sort((a, b) => (a.priority === "urgent" ? -1 : 0) - (b.priority === "urgent" ? -1 : 0) || a.createdAt.localeCompare(b.createdAt))
              .slice(0, 4)
              .map((inc, i, arr) => (
                <ListRow key={inc.id} onPress={() => setIncidentId(inc.id)} accessibilityLabel={inc.title} last={i === arr.length - 1}>
                  <PriorityDot priority={inc.priority} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{inc.title}</PText>
                    <PText v="tiny" numberOfLines={1}>
                      {`${data.properties.find((p) => p.id === inc.propertyId)?.title ?? ""} · ${relative(inc.createdAt, now.getTime())}${inc.assignee ? ` · ${inc.assignee}` : " · sin asignar"}`}
                    </PText>
                  </View>
                  <Wrench size={16} color={C.muted} strokeWidth={1.75} />
                </ListRow>
              ))
          ) : (
            <Empty icon={Wrench} title="Sin incidencias" body="Tus inquilinos las abren desde su Franky, con fotos." />
          )}
        </Panel>

        <FrankyCard />

        <Tip title="Septiembre y febrero">
          En julio Franky ve a los admitidos que buscarán piso y en noviembre a los Erasmus de febrero, semanas antes que los portales. Deja tus habitaciones de febrero publicadas ya.
        </Tip>
        {/* Hueco para que el botón flotante no tape el último bloque. */}
        <View style={{ height: 56 }} />
      </ProPage>


      <LeadDrawer leadId={leadId} onClose={() => setLeadId(null)} />
      <VisitDrawer
        visitId={visitId}
        onClose={() => setVisitId(null)}
        onOpenLead={(id) => {
          setVisitId(null);
          setLeadId(id);
        }}
      />
      <TenantDrawer
        tenantId={tenantId}
        startLeaving={tenantLeaving}
        onClose={() => {
          setTenantId(null);
          setTenantLeaving(false);
        }}
      />
      <IncidentDrawer incidentId={incidentId} onClose={() => setIncidentId(null)} />
      <NewPropertyDrawer open={newProperty} onClose={() => setNewProperty(false)} />
    </View>
  );
}

/** Lo que Franky ha traído: la cifra que justifica la cuota. */
function FrankyCard() {
  const { data, now } = usePro();
  const go = useGoSection();
  const res = housingResults(data, now, 30);
  const week = data.history[data.history.length - 1];
  return (
    <DarkBlock>
      <DarkText v="label" dim>Franky, últimos 30 días</DarkText>
      <DarkText v="display">{String(res.verified)}</DarkText>
      <DarkText v="small" dim>interesados verificados por su universidad</DarkText>
      <View style={{ flexDirection: "row", gap: S.md, marginTop: S.sm, paddingTop: S.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" }}>
        <View style={{ flex: 1 }}>
          <DarkText v="h2">{String(res.groups)}</DarkText>
          <DarkText v="small" dim>grupos de Roomie</DarkText>
        </View>
        <View style={{ flex: 1 }}>
          <DarkText v="h2">{String(res.signed)}</DarkText>
          <DarkText v="small" dim>contratos firmados</DarkText>
        </View>
        <View style={{ flex: 1 }}>
          <DarkText v="h2">{money(res.savedCents, { round: true })}</DarkText>
          <DarkText v="small" dim>sin comisiones</DarkText>
        </View>
      </View>
      <DarkText v="small" dim style={{ lineHeight: 18 }}>
        {`Con la comisión del ${Math.round(PORTAL_FEE * 100)} % por contrato de los portales para estudiantes habrías pagado ${money(res.savedCents, { round: true })} por ${money(res.contractCents, { round: true })} en contratos. En Franky pagas cuota fija.${week ? ` Esta semana, ${week.franky} interesados nuevos.` : ""}`}
      </DarkText>
      <Tap onPress={() => go("interesados")} accessibilityRole="link" accessibilityLabel="Ver interesados" style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 40, alignSelf: "flex-start" }}>
        <Sparkles size={14} color="#FFFFFF" />
        <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: "#FFFFFF" }} maxFontSizeMultiplier={1.3}>Ver interesados</Text>
        <ArrowRight size={14} color="#FFFFFF" />
      </Tap>
    </DarkBlock>
  );
}
