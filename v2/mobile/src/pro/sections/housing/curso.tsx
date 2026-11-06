import React from "react";
import { ScrollView, Text, View } from "react-native";
import { BedDouble, CalendarRange, CheckCircle2, Megaphone, MessageCircle, Repeat, Sun, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProProperty, ProRoom, ProTenant } from "../../../../../shared/pro/types";
import { localDate, money, plural } from "../../../../../shared/pro/format";
import { PORTAL_FEE, findRoom, shortDate, uniShort } from "../../../../../shared/pro/housing";
import {
  RENEWAL_LABEL,
  courseRange,
  courseResults,
  courseStartYear,
  leadsForGap,
  monthLabel,
  occupancyGrid,
  proposedRent,
  renewalState,
  renewalText,
  seasonMoment,
  segmentDays,
  whatsappHref,
  type OccupancySegment,
  type RenewalState,
} from "../../../../../shared/pro/housing-ops";
import {
  answerRenewal,
  courseLabel,
  courseSummary,
  freedRoomText,
  launchSeason,
  markWaitlistNotified,
  monthlyOccupancy,
  offerGapToLead,
  renewalBoard,
  renewalRentCents,
  seasonPlan,
  segmentBox,
  sendRenewalOffers,
  setSummer,
  waitlist,
} from "../../../../../shared/pro/housing-plan";
import { usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import {
  ChoiceGrid,
  DarkBlock,
  DarkText,
  Empty,
  Kpi,
  KpiRow,
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Sheet,
  StepNav,
  TONE_HEX,
  Tip,
  Toggle,
} from "../../kit";
import { LeadDrawer, TenantDrawer } from "./drawers";
import { openExternal } from "./drawer-common";
import { RoomChip, UniBadge } from "./shared";
import { Box, PanelLink, SoftBox } from "./ui";

type Tab = "calendar" | "season" | "renewals";
type GapPick = { property: ProProperty; room: ProRoom; segment: OccupancySegment };

/** Ancho de cada mes en la rejilla: doce meses caben en un desplazamiento lateral. */
const MONTH_W = 54;
const LABEL_W = 96;
const ROW_H = 46;
const GROUP_H = 30;

/**
 * El curso de un vistazo en el móvil: la misma rejilla de la web, con la
 * columna de habitaciones fija a la izquierda y los meses que se desplazan.
 */
export default function HousingCurso() {
  const { data, now } = usePro();
  const [startYear, setStartYear] = React.useState(() => courseStartYear(now));
  const [tab, setTab] = React.useState<Tab>("calendar");
  const [gap, setGap] = React.useState<GapPick | null>(null);
  const [tenantId, setTenantId] = React.useState<string | null>(null);
  const [leadId, setLeadId] = React.useState<string | null>(null);

  const summary = courseSummary(data, startYear);
  const moment = seasonMoment(now);
  const plan = seasonPlan(data, moment);
  const board = renewalBoard(data, now);
  const pendingRenewals = board.not_asked.length + board.waiting.length;
  const intake = moment.id === "february" ? "febrero" : "septiembre";

  const openSegment = (property: ProProperty, room: ProRoom, segment: OccupancySegment) => {
    if (segment.kind === "tenant" && segment.tenantId) setTenantId(segment.tenantId);
    else if (segment.kind === "reserved" && segment.leadId) setLeadId(segment.leadId);
    else setGap({ property, room, segment });
  };

  return (
    <>
      <ProPage>
        <PageHeader
          eyebrow={`Curso ${courseLabel(startYear)}`}
          title="El curso de un vistazo"
          description={
            summary.rooms
              ? `${summary.occupancyPct} % ocupado. ${
                  summary.roomsWithGaps
                    ? `${plural(summary.roomsWithGaps, "habitación tiene", "habitaciones tienen")} huecos por llenar.`
                    : "Ninguna habitación con huecos."
                }`
              : "Añade tus pisos y verás aquí cada habitación mes a mes."
          }
          actions={<PButton label={plan.launched ? "Campaña en marcha" : `Llenar ${intake}`} icon={Megaphone} onPress={() => setTab("season")} />}
        />

        <KpiRow>
          <Kpi icon={BedDouble} label="Ocupación del curso" value={`${summary.occupancyPct} %`} hint={`${summary.rooms} habitaciones`} />
          <Kpi
            icon={CalendarRange}
            label="Meses vacíos"
            value={summary.emptyRoomMonths}
            hint={summary.lostCents ? `${money(summary.lostCents, { round: true })} que no entran` : "Todo el curso lleno"}
            emphasis={summary.emptyRoomMonths > 0}
            onPress={() => setTab("calendar")}
          />
          <Kpi icon={Repeat} label="Renovaciones" value={pendingRenewals} hint={`${plural(board.staying.length, "sigue", "siguen")}, ${plural(board.leaving.length, "se va", "se van")}`} onPress={() => setTab("renewals")} />
          <Kpi icon={Sun} label="Abiertas en verano" value={summary.summerRooms} hint="Julio y agosto" />
        </KpiRow>

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "calendar", label: "Calendario" },
            { value: "season", label: intake === "febrero" ? "Febrero" : "Septiembre", count: plan.rooms.length },
            { value: "renewals", label: "Renovaciones", count: pendingRenewals },
          ]}
        />

        {tab === "calendar" ? (
          <>
            <StepNav
              label={`Curso ${courseLabel(startYear)}`}
              onPrev={() => setStartYear((y) => y - 1)}
              onNext={() => setStartYear((y) => y + 1)}
              onToday={() => setStartYear(courseStartYear(now))}
              isToday={startYear === courseStartYear(now)}
            />
            <CourseGrid startYear={startYear} onOpen={openSegment} />
            <CourseResultsBlock startYear={startYear} />
          </>
        ) : null}
        {tab === "season" ? <SeasonTab /> : null}
        {tab === "renewals" ? <RenewalsTab onOpenTenant={setTenantId} /> : null}
      </ProPage>

      <GapSheet
        pick={gap}
        onClose={() => setGap(null)}
        onOpenLead={(id) => {
          setGap(null);
          setLeadId(id);
        }}
      />
      <TenantDrawer tenantId={tenantId} onClose={() => setTenantId(null)} />
      <LeadDrawer leadId={leadId} onClose={() => setLeadId(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Rejilla                                                             */
/* ------------------------------------------------------------------ */

function segmentColors(kind: OccupancySegment["kind"]) {
  switch (kind) {
    case "tenant":
      return { bg: C.input, border: C.border, fg: C.muted, dashed: false };
    case "reserved":
      return { bg: C.accentSoft, border: `${C.blue}66`, fg: C.blueDeep, dashed: false };
    case "summer":
      return { bg: `${TONE_HEX.sky}1F`, border: `${TONE_HEX.sky}88`, fg: C.text, dashed: false };
    default:
      return { bg: `${C.success}14`, border: C.success, fg: C.success, dashed: true };
  }
}

const SEGMENT_LABEL: Record<OccupancySegment["kind"], string> = { tenant: "Inquilino", reserved: "Reserva", summer: "Verano", gap: "Libre" };

function CourseGrid({ startYear, onOpen }: { startYear: number; onOpen: (p: ProProperty, r: ProRoom, s: OccupancySegment) => void }) {
  const { data, now } = usePro();
  const range = courseRange(startYear);
  const grid = occupancyGrid(data, startYear);
  const months = monthlyOccupancy(data, startYear);
  const today = localDate(now);
  const width = MONTH_W * 12;
  const todayLeft = today >= range.from && today <= range.to ? (segmentBox({ from: today, to: today }, range).left / 100) * width : null;

  if (!grid.length)
    return (
      <Panel>
        <Empty icon={CalendarRange} title="Aún no hay habitaciones" body="Sube tus pisos por habitaciones y aquí verás el curso entero: quién vive, quién entra y qué meses quedan vacíos." />
      </Panel>
    );

  const groups = data.properties
    .map((property) => ({ property, rows: grid.filter((row) => row.property.id === property.id) }))
    .filter((x) => x.rows.length);

  return (
    <Panel flush>
      <View style={{ flexDirection: "row" }}>
        {/* Columna fija con las habitaciones. */}
        <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: C.borderLight }}>
          <View style={{ height: 40, justifyContent: "center", paddingHorizontal: S.md }}>
            <PText v="tiny">Habitación</PText>
          </View>
          {groups.map(({ property, rows }) => (
            <View key={property.id}>
              <View style={{ height: GROUP_H, justifyContent: "center", paddingHorizontal: S.md, backgroundColor: C.input }}>
                <PText v="tiny" color={C.text} numberOfLines={1}>{property.title}</PText>
              </View>
              {rows.map((row) => (
                <View key={row.room.id} style={{ height: ROW_H, justifyContent: "center", paddingHorizontal: S.md }}>
                  <PText v="small" color={C.text} numberOfLines={1}>{row.room.name.replace("Habitación ", "Hab. ")}</PText>
                  <PText v="tiny">{money(row.room.priceCents)}</PText>
                </View>
              ))}
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ width: width + S.md }}>
            <View style={{ height: 40, flexDirection: "row" }}>
              {months.map((m) => (
                <View key={m.month} style={{ width: MONTH_W, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 11.5, color: C.text, textTransform: "capitalize" }} maxFontSizeMultiplier={1.2}>
                    {monthLabel(m.month)}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: m.pct >= 90 ? C.success : m.pct >= 60 ? C.muted : C.warning }} maxFontSizeMultiplier={1.2}>
                    {`${m.pct} %`}
                  </Text>
                </View>
              ))}
            </View>
            {groups.map(({ property, rows }) => (
              <View key={property.id}>
                <View style={{ height: GROUP_H, backgroundColor: C.input }} />
                {rows.map((row) => (
                  <View key={row.room.id} style={{ height: ROW_H, width }}>
                    {months.map((m, i) => (
                      <View key={m.month} style={{ position: "absolute", left: i * MONTH_W, top: 0, bottom: 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.borderLight }} />
                    ))}
                    {todayLeft !== null ? <View style={{ position: "absolute", left: todayLeft, top: 0, bottom: 0, width: 1.5, backgroundColor: C.blue, zIndex: 2 }} /> : null}
                    {row.segments.map((s) => {
                      const box = segmentBox(s, range);
                      const c = segmentColors(s.kind);
                      const w = (box.width / 100) * width;
                      const text = s.kind === "tenant" || s.kind === "reserved" ? s.label.split(" ")[0] : SEGMENT_LABEL[s.kind];
                      return (
                        <Tap
                          key={`${s.kind}-${s.from}`}
                          onPress={() => onOpen(row.property, row.room, s)}
                          accessibilityRole="button"
                          accessibilityLabel={`${SEGMENT_LABEL[s.kind]}${s.kind === "tenant" || s.kind === "reserved" ? `: ${s.label}` : ""}, del ${shortDate(s.from)} al ${shortDate(s.to)}`}
                          hitSlop={4}
                          style={{
                            position: "absolute",
                            left: (box.left / 100) * width,
                            width: w,
                            top: 6,
                            bottom: 6,
                            borderRadius: R.sm,
                            borderWidth: 1,
                            borderStyle: c.dashed ? "dashed" : "solid",
                            borderColor: c.border,
                            backgroundColor: c.bg,
                            justifyContent: "center",
                            paddingHorizontal: 5,
                            overflow: "hidden",
                          }}
                        >
                          {w >= 34 ? (
                            <Text style={{ fontFamily: FONT.semibold, fontSize: 11, color: c.fg }} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                              {text}
                            </Text>
                          ) : null}
                        </Tap>
                      );
                    })}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: S.md, rowGap: 4, paddingHorizontal: S.lg, paddingVertical: S.md, borderTopWidth: 1, borderTopColor: C.borderLight }}>
        {(Object.keys(SEGMENT_LABEL) as OccupancySegment["kind"][]).map((k) => {
          const c = segmentColors(k);
          return (
            <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 16, height: 10, borderRadius: 3, borderWidth: 1, borderStyle: c.dashed ? "dashed" : "solid", borderColor: c.border, backgroundColor: c.bg }} />
              <PText v="tiny">{SEGMENT_LABEL[k]}</PText>
            </View>
          );
        })}
        <PText v="tiny">Toca un hueco para ver quién puede entrar.</PText>
      </View>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Hueco                                                               */
/* ------------------------------------------------------------------ */

function GapSheet({ pick, onClose, onOpenLead }: { pick: GapPick | null; onClose: () => void; onOpenLead: (id: string) => void }) {
  const { data, now, update, pending } = usePro();
  if (!pick) return null;
  const { property, room, segment } = pick;
  const current = data.properties.find((p) => p.id === property.id)?.rooms.find((r) => r.id === room.id) ?? room;
  const days = segmentDays(segment);
  const waiting = waitlist(data, current);
  const waitingIds = new Set(waiting.map((l) => l.id));
  const leads = leadsForGap(data, current, segment, 5).filter((l) => !waitingIds.has(l.id));
  // El aviso dice desde cuándo está libre de verdad: nunca una fecha pasada.
  const gapFrom = segment.from > localDate(now) ? segment.from : localDate(now);
  const month = segment.to.slice(5, 7);
  const touchesSummer = segment.kind === "summer" || month === "07" || month === "08";

  const propose = async (leadId: string) => {
    if (!(await update("lead.assign", (d) => offerGapToLead(d, leadId, property.id, room.id)))) return;
    onOpenLead(leadId);
  };
  const notify = (leadId: string, text: string) => {
    openExternal(whatsappHref(text));
    void update("lead.waitlist.notify", (d) => markWaitlistNotified(d, leadId, new Date().toISOString()));
  };
  const toggleSummer = async (next: boolean) => {
    if (!(await update("room.summer", (d) => setSummer(d, property.id, room.id, next)))) return;
    toast(next ? "Abierta para el verano" : "Cerrada en verano", {
      kind: "success",
      body: next ? "Julio y agosto salen para estancias cortas." : "Julio y agosto vuelven a contar como libres.",
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${room.name}, ${property.title}`}
      description={`${segment.kind === "summer" ? "Verano" : "Libre"} del ${shortDate(segment.from)} al ${shortDate(segment.to)}, ${plural(days, "día", "días")}`}
    >
      <View style={{ flexDirection: "row", gap: S.sm }}>
        <SoftBox style={{ flex: 1 }}>
          <PText v="tiny">Precio</PText>
          <PText v="h3">{`${money(current.priceCents)} al mes`}</PText>
        </SoftBox>
        <SoftBox style={{ flex: 1, backgroundColor: `${C.warning}1F` }}>
          <PText v="tiny">Sin alquilar</PText>
          <PText v="h3">{money(Math.round((current.priceCents * days) / 30), { round: true })}</PText>
        </SoftBox>
      </View>

      {waiting.length ? (
        <>
          <View style={{ gap: 4 }}>
            <PText v="h3">Te pidieron aviso</PText>
            <PText v="tiny">Les dijiste que no había hueco y llegan a este precio.</PText>
          </View>
          {waiting.map((l) => (
            <Box key={l.id} accent style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
              <PAvatar name={l.name} size={34} toneKey="violet" />
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{l.name}</PText>
                <PText v="tiny" numberOfLines={1}>{`Entraba el ${shortDate(l.moveIn)}, hasta ${money(l.budgetCents)}`}</PText>
              </View>
              <PButton
                small
                variant="secondary"
                icon={MessageCircle}
                label="Avisar"
                accessibilityLabel={`Avisar a ${l.name} por WhatsApp`}
                onPress={() => notify(l.id, freedRoomText(data, l, property, current, gapFrom))}
              />
            </Box>
          ))}
        </>
      ) : null}

      <View style={{ gap: 4 }}>
        <PText v="h3">Pueden entrar en esas fechas</PText>
        <PText v="tiny">Interesados activos con entrada cercana y presupuesto suficiente.</PText>
      </View>
      {leads.length ? (
        leads.map((l) => (
          <Box key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
            <PAvatar name={l.name} size={34} />
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3" numberOfLines={1}>{l.name}</PText>
              <UniBadge university={l.university} verified={l.verified} />
              <PText v="tiny" numberOfLines={1}>{`Entra el ${shortDate(l.moveIn)}, ${l.months} meses, hasta ${money(l.budgetCents)}`}</PText>
            </View>
            <PButton small label="Proponer" variant="secondary" onPress={() => void propose(l.id)} disabled={pending} accessibilityLabel={`Proponer la habitación a ${l.name}`} />
          </Box>
        ))
      ) : (
        <Empty icon={Users} title="Nadie busca para esas fechas todavía" body="Lanza la campaña de la próxima entrada y los estudiantes que buscan en esas fechas verán la habitación." />
      )}

      {touchesSummer ? (
        <Box>
          <Toggle
            label="Estancias cortas en verano"
            detail="Cursos de verano, prácticas y estudiantes que llegan en julio."
            value={Boolean(current.summer)}
            onChange={(v) => void toggleSummer(v)}
          />
        </Box>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Resultados                                                          */
/* ------------------------------------------------------------------ */

function CourseResultsBlock({ startYear }: { startYear: number }) {
  const { data } = usePro();
  const res = courseResults(data, startYear);
  const stat = (value: string, label: string) => (
    <View style={{ width: "50%", paddingVertical: 6 }}>
      <DarkText v="h2">{value}</DarkText>
      <DarkText v="small" dim>{label}</DarkText>
    </View>
  );
  return (
    <DarkBlock>
      <DarkText v="label" dim>{`Resultados del curso ${courseLabel(startYear)}`}</DarkText>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {stat(`${res.occupancyPct} %`, "ocupación media")}
        {stat(String(res.emptyRoomMonths), "meses de habitación vacíos")}
        {stat(res.avgDaysToRent === null ? "Sin datos" : String(res.avgDaysToRent), "días de media en alquilar")}
        {stat(money(res.avgRentCents, { round: true }), "renta media")}
      </View>
      {res.frankyContracts ? (
        <DarkText v="small" dim>
          {[
            `${plural(res.frankyContracts, "contrato ha llegado", "contratos han llegado")} por Franky,`,
            `${money(res.frankyContractCents, { round: true })} en total.`,
            `Con la comisión del ${Math.round(PORTAL_FEE * 100)} % de los portales para estudiantes`,
            `habrías pagado ${money(res.savedCents, { round: true })}.`,
          ].join(" ")}
        </DarkText>
      ) : null}
    </DarkBlock>
  );
}

/* ------------------------------------------------------------------ */
/* Temporada                                                           */
/* ------------------------------------------------------------------ */

function SeasonTab() {
  const { data, now, update, pending } = usePro();
  const go = useGoSection();
  const moment = seasonMoment(now);
  const plan = seasonPlan(data, moment);
  const readyIds = new Set(plan.ready.map((p) => p.id));
  const readyRooms = plan.rooms.filter((o) => readyIds.has(o.property.id));
  const groups = [...new Set(plan.rooms.map((o) => o.property.id))].map((id) => ({
    property: plan.rooms.find((o) => o.property.id === id)!.property,
    rooms: plan.rooms.filter((o) => o.property.id === id),
  }));

  const launch = async () => {
    if (!(await update("season.launch", (d) => launchSeason(d, moment, now)))) return;
    toast("Campaña en marcha", {
      kind: "success",
      body: `${plural(readyRooms.length, "habitación publicada", "habitaciones publicadas")} para la entrada del ${shortDate(moment.start)}.`,
    });
  };

  return (
    <>
      <Panel title={moment.title} description={`Entrada el ${shortDate(moment.start)}. ${moment.audience}.`} action={plan.launched ? <Pill tone="success" label="En marcha" /> : undefined}>
        {plan.rooms.length ? (
          <View style={{ gap: S.md }}>
            {groups.map(({ property, rooms }) => {
              const blocked = plan.blocked.find((b) => b.property.id === property.id);
              return (
                <View key={property.id} style={{ gap: S.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
                    <View style={{ flex: 1 }}>
                      <PText v="h3" numberOfLines={1}>{property.title}</PText>
                      <PText v="tiny">{`${property.zone}, a ${property.minutesToCampus} min del campus`}</PText>
                    </View>
                    {blocked ? (
                      <Pill tone="warning" label={`Falta ${blocked.gaps.join(" y ")}`} />
                    ) : (
                      <Pill tone={property.published ? "success" : "neutral"} label={property.published ? "Publicado" : "Se publicará"} />
                    )}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {rooms.map((o) => (
                      <RoomChip key={o.room.id} room={o.room} />
                    ))}
                  </View>
                </View>
              );
            })}
            {plan.blocked.length ? (
              <PText v="tiny">Los pisos sin NRUA o sin letra energética no se anuncian. Complétalos en tus pisos y entrarán en la campaña.</PText>
            ) : null}
            {plan.launched ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <CheckCircle2 size={16} color={C.success} strokeWidth={1.9} />
                <PText v="small" color={C.success} style={{ flex: 1 }}>{plan.launched.idea}</PText>
              </View>
            ) : (
              <PButton
                full
                label={`Publicar ${plural(readyRooms.length, "habitación", "habitaciones")} y lanzar la oferta`}
                icon={Megaphone}
                onPress={() => void launch()}
                disabled={pending || !readyRooms.length}
              />
            )}
          </View>
        ) : (
          <Empty
            icon={BedDouble}
            title={`Nada libre para el ${shortDate(moment.start)}`}
            body="Cuando alguien avise de que se va o una renovación diga que no, su habitación aparecerá aquí para anunciarla."
          />
        )}
      </Panel>

      <Panel title="Ya buscan para esa fecha" description="Interesados activos con entrada cerca de ese día." action={plan.demand.length ? <PanelLink label="Ver" onPress={() => go("interesados")} /> : undefined}>
        <Text style={{ fontFamily: FONT.display, fontSize: 30, color: C.text }} maxFontSizeMultiplier={1.2}>{plan.demand.length}</Text>
        {waitlist(data).length ? (
          <PText v="small">{`${plural(waitlist(data).length, "persona espera", "personas esperan")} tu aviso: les dijiste que no había hueco.`}</PText>
        ) : null}
        <PText v="small">
          {`${plan.demand.filter((l) => l.verified).length} verificados, ${plan.demand.filter((l) => l.erasmus).length} Erasmus, ${plural(plan.demand.filter((l) => l.roomieGroup).length, "grupo de Roomie", "grupos de Roomie")}`}
        </PText>
      </Panel>

      <Tip title="Cuándo lanzarla">
        De marzo a agosto Franky enseña tus habitaciones a los admitidos de septiembre. De septiembre a enero, a los Erasmus y a quien llega en febrero.
      </Tip>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Renovaciones                                                        */
/* ------------------------------------------------------------------ */

const RENEWAL_TONE: Record<RenewalState, "success" | "warning" | "info" | "neutral"> = {
  staying: "success",
  leaving: "warning",
  waiting: "info",
  not_asked: "neutral",
};

function RenewalsTab({ onOpenTenant }: { onOpenTenant: (id: string) => void }) {
  const { data, now, update, pending } = usePro();
  const board = renewalBoard(data, now);
  const [pctUp, setPctUp] = React.useState("0");
  const [filter, setFilter] = React.useState<RenewalState | "all">("all");
  const pct = Number(pctUp);
  const list = filter === "all" ? board.all : board[filter];

  const sendAll = async () => {
    const ids = board.not_asked.map((t) => t.id);
    if (!(await update("tenant.renewal.bulk", (d) => sendRenewalOffers(d, ids, pct, now)))) return;
    toast(`Oferta apuntada a ${plural(ids.length, "inquilino", "inquilinos")}`, {
      kind: "success",
      body: "Mándasela a cada uno por WhatsApp desde su fila y marca lo que conteste.",
    });
  };
  const answer = async (t: ProTenant, value: "yes" | "no") => {
    if (!(await update(`tenant.renewal.${value}`, (d) => answerRenewal(d, t.id, value, now)))) return;
    const name = t.name.split(" ")[0];
    toast(value === "yes" ? `${name} sigue el curso que viene` : `${name} no renueva`, {
      kind: "success",
      body: value === "yes" ? "Su habitación ya no sale como libre." : "Su habitación sale en la campaña de la próxima entrada.",
    });
  };

  if (!board.all.length)
    return (
      <Panel>
        <Empty icon={Repeat} title="Ningún contrato acaba pronto" body="Los inquilinos cuyo contrato acaba en los próximos meses aparecen aquí para ofrecerles seguir." />
      </Panel>
    );

  return (
    <>
      <KpiRow>
        {(["not_asked", "waiting", "staying", "leaving"] as RenewalState[]).map((s) => (
          <Kpi
            key={s}
            label={RENEWAL_LABEL[s]}
            value={board[s].length}
            hint={s === "staying" ? `${money(renewalRentCents(board.staying), { round: true })} al mes` : undefined}
            emphasis={filter === s}
            onPress={() => setFilter(filter === s ? "all" : s)}
          />
        ))}
      </KpiRow>

      {board.not_asked.length ? (
        <Panel title="Oferta de renovación" description="La misma subida para todos los que aún no saben nada. Luego se la mandas a cada uno por WhatsApp.">
          <View style={{ gap: S.md }}>
            <ChoiceGrid
              value={pctUp}
              onChange={setPctUp}
              options={[
                { value: "0", label: "Misma renta" },
                { value: "2", label: "+2 %" },
                { value: "3", label: "+3 %" },
                { value: "5", label: "+5 %" },
              ]}
            />
            <PButton full label={`Ofrecer a ${plural(board.not_asked.length, "inquilino", "inquilinos")}`} icon={Repeat} onPress={() => void sendAll()} disabled={pending} />
          </View>
        </Panel>
      ) : null}

      <Panel flush title={filter === "all" ? "Contratos que acaban" : RENEWAL_LABEL[filter]} description="Del que acaba antes al que acaba después.">
        {list.length ? (
          list.map((t, i) => {
            const state = renewalState(t);
            const { property, room } = findRoom(data, t.propertyId, t.roomId);
            const offer = t.renewal?.newRentCents ?? proposedRent(t.rentCents, pct);
            return (
              <View key={t.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
                <Tap onPress={() => onOpenTenant(t.id)} accessibilityRole="button" accessibilityLabel={`Ficha de ${t.name}`} style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                  <PAvatar name={t.name} size={34} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{`${t.name} · ${uniShort(t.university)}`}</PText>
                    <PText v="tiny" numberOfLines={1}>{`${room?.name ?? ""} de ${property?.title ?? ""}, acaba el ${shortDate(t.contractEnd)}`}</PText>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <PText v="h3">{money(offer)}</PText>
                    <PText v="tiny">{offer !== t.rentCents ? `ahora ${money(t.rentCents)}` : "misma renta"}</PText>
                  </View>
                </Tap>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
                  <Pill tone={RENEWAL_TONE[state]} label={RENEWAL_LABEL[state]} />
                  {state === "waiting" || state === "not_asked" ? (
                    <PButton small label="WhatsApp" variant="ghost" icon={MessageCircle} onPress={() => openExternal(whatsappHref(renewalText(data, t, offer)))} accessibilityLabel={`Escribir a ${t.name} por WhatsApp`} />
                  ) : null}
                  {state === "waiting" ? (
                    <>
                      <PButton small label="Sigue" variant="outline" onPress={() => void answer(t, "yes")} disabled={pending} />
                      <PButton small label="Se va" variant="outline" onPress={() => void answer(t, "no")} disabled={pending} />
                    </>
                  ) : null}
                </View>
              </View>
            );
          })
        ) : (
          <Empty icon={Repeat} title="Nadie en este grupo" body="Toca otra cifra de arriba para ver el resto." />
        )}
      </Panel>
    </>
  );
}
