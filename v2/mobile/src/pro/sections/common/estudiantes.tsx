import React from "react";
import { Text, View } from "react-native";
import { BadgeCheck, CalendarRange, Eye, MapPin, MessageSquareReply, Pause, Play, Sparkles, Star, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProCampaign, ProEngine, ProOffer } from "../../../../../shared/pro/types";
import { money, relative } from "../../../../../shared/pro/format";
import { frankyResults, weeklyFranky } from "../../../../../shared/pro/results";
import { hasSection } from "../../../../../shared/pro/verticals";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Bars, DarkBlock, DarkText, Empty, Input, Kpi, KpiRow, LiveDot, Meter, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, TONE_HEX, Tip } from "../../kit";
import { OfferComposer, type OfferPreset } from "./offer-composer";
import { GroupRequests } from "./grupos";
import { Card, MiniStat, SwitchRow } from "./ui";

type Tab = "resultados" | "ofertas" | "calendario" | "grupos" | "resenas" | "ficha";

/** Con qué comparar lo que trae Franky, según el sector. Cifras públicas de cada competidor. */
const COMPETITOR: Record<ProEngine, { name: string; rule: string; rate: number }> = {
  agenda: { name: "Booksy", rule: "cobra el 30 % de la primera visita de cada cliente nuevo", rate: 0.3 },
  tables: { name: "TheFork", rule: "cobra de 1,5 a 4 € por cada comensal que reserva", rate: 0.08 },
  night: { name: "Fever", rule: "se queda entre el 15 y el 30 % de cada entrada", rate: 0.15 },
  classes: { name: "las apps de reservas", rule: "cobran hasta un 4 % por reserva y se quedan con tu cliente", rate: 0.04 },
  courts: { name: "Playtomic", rule: "cobra un 4 % por reserva y el jugador paga 0,99 € por partido", rate: 0.04 },
  housing: { name: "HousingAnywhere", rule: "cobra al propietario el 8 % del contrato", rate: 0.08 },
  community: { name: "Eventbrite", rule: "cobra un 6 % por entrada vendida", rate: 0.06 },
  university: { name: "otras plataformas", rule: "cobran por estudiante y año", rate: 0 },
};

export default function EstudiantesSection() {
  const { data, vertical } = usePro();
  const showGroups = !hasSection(vertical.id, "grupos") && data.groupRequests.length > 0;
  const [tab, setTab] = React.useState<Tab>("resultados");
  const liveCount = data.offers.filter((o) => o.status === "live").length;

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "resultados", label: "Resultados" },
    { value: "ofertas", label: "Ofertas", count: liveCount },
    { value: "calendario", label: "Calendario académico" },
    ...(showGroups ? [{ value: "grupos" as const, label: "Grupos", count: data.groupRequests.filter((g) => g.status === "new").length }] : []),
    { value: "resenas", label: "Reseñas" },
    { value: "ficha", label: "Cómo te ven" },
  ];

  return (
    <ProPage>
      <PageHeader
        eyebrow="Estudiantes"
        title="Lo que Franky hace por ti"
        description={`Tu ficha, tus ofertas y tus resultados con los estudiantes de ${data.space.campus}. Sin comisión por cliente.`}
      >
        <Segmented<Tab> value={tab} onChange={setTab} options={tabs} />
      </PageHeader>
      {tab === "resultados" ? <Results /> : null}
      {tab === "ofertas" ? <Offers /> : null}
      {tab === "calendario" ? <Calendar /> : null}
      {tab === "grupos" ? <GroupRequests compact /> : null}
      {tab === "resenas" ? <Reviews /> : null}
      {tab === "ficha" ? <Profile /> : null}
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */

const SOURCE_LABEL: Record<string, string> = { franky: "Tu ficha en Franky", hueco: "Huecos relámpago", card: "Franky Card", grupo: "Grupos" };

function Results() {
  const { data, now, vertical } = usePro();
  const results = frankyResults(data, now, 30);
  const weeks = weeklyFranky(data, now, 8);
  const comp = COMPETITOR[vertical.engine];
  const lastWeek = weeks[weeks.length - 1];
  const frankyShare = lastWeek && lastWeek.total ? Math.round((lastWeek.value / lastWeek.total) * 100) : 0;
  const monthFranky = weeks.slice(-4).reduce((a, w) => a + w.value, 0);
  const monthRevenue = weeks.slice(-4).reduce((a, w) => a + (w.total ? (w.revenueCents * w.value) / w.total : 0), 0);
  const people = Math.max(results.people, monthFranky);
  const revenue = Math.max(results.revenueCents, Math.round(monthRevenue));
  const saved = vertical.engine === "agenda" ? Math.max(results.savedCents, Math.round(revenue * 0.3 * 0.4)) : Math.round(revenue * comp.rate);
  const sources = Object.entries(results.bySource).sort((a, b) => b[1] - a[1]);
  const totalSources = sources.reduce((a, [, n]) => a + n, 0);

  return (
    <>
      <DarkBlock style={{ gap: S.md }}>
        <DarkText v="label" dim>Últimos 30 días</DarkText>
        <DarkText v="display" style={{ fontSize: 52, letterSpacing: -1.6 }}>{people}</DarkText>
        <DarkText v="body" dim>{`personas han llegado a ${data.space.name} por Franky`}</DarkText>
        <View style={{ flexDirection: "row", gap: S.lg, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: S.lg, marginTop: S.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <DarkText v="h2">{money(revenue, { round: true })}</DarkText>
            <DarkText v="small" dim>facturado con ellas</DarkText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <DarkText v="h2">{money(saved, { round: true })}</DarkText>
            <DarkText v="small" dim>que te ahorras en comisiones (aprox.)</DarkText>
          </View>
        </View>
        <DarkText v="small" dim>
          {`Con ${comp.name}, que ${comp.rule}, esos clientes te habrían costado dinero. Con Franky pagas tu cuota fija y ya.`}
        </DarkText>
        <View style={{ marginTop: S.md, gap: S.sm }}>
          <DarkText v="small" dim>Por Franky cada semana</DarkText>
          <Bars dark height={150} values={weeks.map((w) => w.value)} labels={weeks.map((w) => w.label)} />
          <DarkText v="small" dim>
            {`La última semana, ${frankyShare} de cada 100 ${vertical.engine === "housing" ? "interesados" : "clientes"} llegaron por Franky.`}
          </DarkText>
        </View>
      </DarkBlock>

      <Panel title="De dónde vienen" description="Reservas y visitas con origen Franky, últimos 30 días.">
        {sources.length ? (
          <View style={{ gap: S.md }}>
            {sources.map(([k, n]) => (
              <View key={k} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <PText v="small" color={C.text}>{SOURCE_LABEL[k] ?? k}</PText>
                  <PText v="h3">{String(n)}</PText>
                </View>
                <Meter value={n} max={totalSources} />
              </View>
            ))}
          </View>
        ) : (
          <Bars values={weeks.map((w) => w.value)} labels={weeks.map((w) => w.label)} />
        )}
      </Panel>
      <Panel title="Tus ofertas en marcha" description="Lo que están viendo los estudiantes ahora.">
        <LiveOffersList />
      </Panel>
      <Tip title="Cómo lo medimos">
        Solo contamos reservas, validaciones de Franky Card y entradas que se hicieron desde Franky. Si alguien te encontró por otro sitio, no te lo atribuimos.
      </Tip>
    </>
  );
}

function LiveOffersList() {
  const { data } = usePro();
  const live = data.offers.filter((o) => o.status === "live");
  if (!live.length) return <PText v="small">No tienes ofertas activas. Crea una en Ofertas.</PText>;
  return (
    <View>
      {live.map((o, i) => (
        <View
          key={o.id}
          style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: 10, borderBottomWidth: i === live.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
        >
          <LiveDot />
          <View style={{ flex: 1, gap: 2 }}>
            <PText v="h3" numberOfLines={1}>{o.title}</PText>
            <PText v="tiny" numberOfLines={1}>{o.detail}</PText>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <PText v="h3">{String(o.bookings)}</PText>
            <PText v="tiny">reservas</PText>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<ProOffer["kind"], string> = {
  flash: "Relámpago",
  valley: "Hora valle",
  card: "Franky Card",
  first_visit: "Primera visita",
  group: "Grupos",
  exam: "Exámenes",
};

function Offers() {
  const { data, update } = usePro();
  const [composer, setComposer] = React.useState<OfferPreset>(null);
  const live = data.offers.filter((o) => o.status === "live" || o.status === "scheduled");
  const ended = data.offers.filter((o) => o.status === "ended" || o.status === "draft");
  const totals = data.offers.reduce((a, o) => ({ reach: a.reach + o.reach, bookings: a.bookings + o.bookings, revenue: a.revenue + o.revenueCents }), { reach: 0, bookings: 0, revenue: 0 });

  const toggle = async (o: ProOffer) => {
    if (
      !(await update("offer.toggle", (d) => ({
        ...d,
        offers: d.offers.map((x) => (x.id === o.id ? { ...x, status: x.status === "live" ? "ended" : "live" } : x)),
      })))
    )
      return;
    toast(o.status === "live" ? "Oferta pausada" : "Oferta activa de nuevo", { kind: "success" });
  };

  return (
    <>
      <KpiRow>
        <Kpi label="Activas" value={live.length} />
        <Kpi label="Estudiantes alcanzados" value={totals.reach.toLocaleString("es-ES")} />
        <Kpi label="Reservas conseguidas" value={totals.bookings} />
        <Kpi label="Facturado con ofertas" value={money(totals.revenue, { round: true })} emphasis />
      </KpiRow>
      <View style={{ gap: S.md, marginBottom: S.lg }}>
        <PText v="small">Las ofertas solo las ven estudiantes verificados cerca de ti. Tú decides cuándo y cuánto.</PText>
        <PButton label="Nueva oferta relámpago" icon={Zap} full onPress={() => setComposer({})} />
      </View>
      <View style={{ gap: S.md, marginBottom: S.lg }}>
        {live.map((o) => (
          <OfferCard key={o.id} offer={o} onToggle={() => toggle(o)} />
        ))}
      </View>
      {ended.length ? (
        <Panel title="Terminadas" flush>
          {ended.map((o, i) => (
            <View
              key={o.id}
              style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: i === ended.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={2}>{o.detail}</PText>
                <PText v="tiny">{`${KIND_LABEL[o.kind]} · ${o.reach.toLocaleString("es-ES")} alcanzados`}</PText>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <PText v="h3">{`${o.claimed}/${o.slots || o.claimed}`}</PText>
                <PText v="tiny">plazas</PText>
              </View>
            </View>
          ))}
        </Panel>
      ) : null}
      <OfferComposer preset={composer} onClose={() => setComposer(null)} />
    </>
  );
}

function OfferCard({ offer: o, onToggle }: { offer: ProOffer; onToggle: () => Promise<void> }) {
  const { pending, can } = usePro();
  const conversion = o.views ? Math.round((o.bookings / o.views) * 100) : 0;
  const disabled = pending || !can("offer.toggle");
  return (
    <Card style={{ gap: S.md }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            {o.status === "live" ? <LiveDot /> : null}
            <Pill label={KIND_LABEL[o.kind]} tone={o.kind === "flash" ? "violet" : "neutral"} />
          </View>
          <PText v="h2" style={{ marginTop: 4 }}>{o.title}</PText>
          <PText v="small">{o.detail}</PText>
        </View>
        <Tap
          onPress={() => void onToggle()}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={o.status === "live" ? "Pausar oferta" : "Reactivar oferta"}
          style={{ width: 44, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.45 : 1 }}
        >
          {o.status === "live" ? <Pause size={17} color={C.text} /> : <Play size={17} color={C.text} />}
        </Tap>
      </View>
      <View style={{ flexDirection: "row", gap: S.sm }}>
        <MiniStat center label="Lo vieron" value={o.views.toLocaleString("es-ES")} />
        <MiniStat center label="Reservas" value={String(o.bookings)} />
        <MiniStat center label="Facturado" value={money(o.revenueCents, { round: true })} />
      </View>
      {o.slots ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <PText v="tiny">Plazas ocupadas</PText>
            <PText v="tiny">{`${o.claimed} de ${o.slots}`}</PText>
          </View>
          <Meter value={o.claimed} max={o.slots} />
        </View>
      ) : (
        <PText v="tiny">{`Convierte el ${conversion} % de quien la ve.`}</PText>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

const CAMPAIGN_STATUS: Record<ProCampaign["status"], { label: string; tone: "violet" | "success" | "warning" | "neutral" }> = {
  suggested: { label: "Sugerida", tone: "violet" },
  scheduled: { label: "Programada", tone: "warning" },
  live: { label: "En marcha", tone: "success" },
  done: { label: "Hecha", tone: "neutral" },
};

function Calendar() {
  const { data, update, pending, can } = usePro();
  const campaigns = data.campaigns;
  if (!campaigns.length) {
    return <Empty icon={CalendarRange} title="Sin campañas todavía" body="Te propondremos campañas para cada momento del curso." />;
  }
  const schedule = async (c: ProCampaign) => {
    if (!(await update("campaign.schedule", (d) => ({ ...d, campaigns: d.campaigns.map((x) => (x.id === c.id ? { ...x, status: "scheduled" } : x)) })))) return;
    toast("Programación guardada", { kind: "success" });
  };
  return (
    <>
      <Tip title="Por qué funciona">
        Franky conoce el calendario de cada universidad: cuándo empiezan las clases, los exámenes, las fiestas de facultad y la llegada de Erasmus. Las campañas salen justo cuando los estudiantes lo necesitan.
      </Tip>
      <View style={{ borderLeftWidth: 1, borderLeftColor: C.border, marginLeft: 5, paddingLeft: S.lg, gap: S.md, marginBottom: S.lg }}>
        {campaigns.map((c) => (
          <View key={c.id}>
            <View
              style={{
                position: "absolute",
                left: -S.lg - 6,
                top: 20,
                width: 11,
                height: 11,
                borderRadius: 6,
                borderWidth: 3,
                borderColor: C.bg,
                backgroundColor: c.status === "done" ? C.border : c.status === "suggested" ? C.blue : C.success,
              }}
            />
            <Card>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
                <PText v="label" style={{ flexShrink: 1 }}>{`${c.moment} · ${c.when}`}</PText>
                <Pill label={CAMPAIGN_STATUS[c.status].label} tone={CAMPAIGN_STATUS[c.status].tone} />
              </View>
              <PText v="h2">{c.title}</PText>
              <PText v="small" color={C.text}>{c.idea}</PText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: S.sm, marginTop: 4 }}>
                <PText v="tiny" style={{ flexShrink: 1 }}>{`Para: ${c.audience}`}</PText>
                {c.status === "suggested" ? (
                  <PButton small label="Programar" variant="secondary" disabled={pending || !can("campaign.schedule")} onPress={() => void schedule(c)} />
                ) : null}
              </View>
            </Card>
          </View>
        ))}
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Stars({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: "row" }} accessible accessibilityLabel={`${rating} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={13} color={i < rating ? TONE_HEX.amber : C.border} fill={i < rating ? TONE_HEX.amber : "transparent"} />
      ))}
    </View>
  );
}

function Reviews() {
  const { data, update, now, pending, can } = usePro();
  const [replying, setReplying] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const avg = data.reviews.length ? data.reviews.reduce((a, r) => a + r.rating, 0) / data.reviews.length : data.space.rating;
  const reviewing = data.reviews.find((r) => r.id === replying);

  const reply = async () => {
    if (!(await update("review.reply", (d) => ({ ...d, reviews: d.reviews.map((x) => (x.id === replying ? { ...x, reply: text.trim() } : x)) })))) return;
    toast("Respuesta publicada", { kind: "success" });
    setReplying(null);
  };

  return (
    <>
      <KpiRow>
        <Kpi icon={Star} label="Nota media" value={avg === null ? "Sin reseñas" : avg.toFixed(1)} hint={`${data.space.reviewsCount} reseñas en total`} />
        <Kpi label="De estudiantes" value={`${Math.round((data.reviews.filter((r) => r.university).length / Math.max(1, data.reviews.length)) * 100)} %`} />
        <Kpi label="Sin responder" value={data.reviews.filter((r) => !r.reply).length} />
        <Kpi label="Visitas verificadas" value="100 %" hint="solo opina quien ha venido" />
      </KpiRow>
      <Panel flush>
        {data.reviews.map((r, i) => (
          <View key={r.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.lg, gap: 6, borderBottomWidth: i === data.reviews.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
              <PText v="h3">{r.clientName}</PText>
              {r.university ? <Pill label={r.university.replace("Universidad de ", "").replace("Universidad ", "")} tone="violet" icon={BadgeCheck} /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <Stars rating={r.rating} />
              <PText v="tiny">{relative(r.at, now.getTime())}</PText>
            </View>
            <PText v="small" color={C.text}>{r.text}</PText>
            {r.reply ? (
              <View style={{ borderLeftWidth: 2, borderLeftColor: C.border, paddingLeft: S.md, marginTop: 2 }}>
                <PText v="small">{`Tu respuesta: ${r.reply}`}</PText>
              </View>
            ) : (
              <Tap
                onPress={() => {
                  setReplying(r.id);
                  setText("");
                }}
                accessibilityRole="button"
                accessibilityLabel={`Responder a ${r.clientName}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44 }}
              >
                <MessageSquareReply size={16} color={C.blue} />
                <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>Responder</Text>
              </Tap>
            )}
          </View>
        ))}
      </Panel>
      <Sheet
        open={Boolean(reviewing)}
        onClose={() => setReplying(null)}
        title="Responder reseña"
        description={reviewing ? `A ${reviewing.clientName}` : undefined}
        footer={
          <>
            <PButton label="Cancelar" variant="ghost" onPress={() => setReplying(null)} />
            <PButton label="Publicar respuesta" disabled={pending || !can("review.reply") || text.trim().length < 3} onPress={() => void reply()} />
          </>
        }
      >
        <View style={{ borderRadius: R.md, backgroundColor: C.input, padding: S.md }}>
          <PText v="small" color={C.text}>{reviewing?.text ?? ""}</PText>
        </View>
        <Input value={text} onChangeText={setText} multiline placeholder="Gracias por venir..." label="Tu respuesta" />
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Profile() {
  const { data, update, vertical, pending, can } = usePro();
  const p = data.space.publicProfile;
  const highlights = data.services.filter((s) => s.online).slice(0, 4);
  const disabled = pending || !can("profile.update");
  const set = async (patch: Partial<typeof p>, message: string) => {
    if (!(await update("profile.update", (d) => ({ ...d, space: { ...d.space, publicProfile: { ...d.space.publicProfile, ...patch } } })))) return;
    toast(message, { kind: "success" });
  };

  return (
    <>
      <Panel title="Tu ficha en Franky" description="Aparece en Ocio, en el mapa y en las búsquedas de los estudiantes de tu zona.">
        <SwitchRow
          title="Reservas desde Franky"
          detail="Los estudiantes reservan desde tu ficha y entra directo en tu agenda."
          on={p.bookingEnabled}
          disabled={disabled}
          onChange={(v) => void set({ bookingEnabled: v }, v ? "Reservas activadas" : "Reservas desactivadas")}
        />
        <SwitchRow
          title="Franky Card"
          detail={`Descuento del ${p.cardDiscountPct} % a titulares de Franky Card. Apareces en el mapa de ventajas.`}
          on={p.cardEnabled}
          disabled={disabled}
          onChange={(v) => void set({ cardEnabled: v }, v ? "Ya eres parte de Franky Card" : "Franky Card desactivada")}
          last
        />
        {p.cardEnabled ? (
          <View style={{ marginTop: S.md, gap: S.sm }}>
            <PText v="h3">Descuento Franky Card</PText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {[5, 10, 15, 20].map((pct) => {
                const active = p.cardDiscountPct === pct;
                return (
                  <Tap
                    key={pct}
                    disabled={disabled}
                    onPress={() => void set({ cardDiscountPct: pct }, `Descuento del ${pct} %`)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Descuento del ${pct} %`}
                    style={{ minWidth: 64, minHeight: 44, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 1, borderColor: active ? C.blue : C.border, backgroundColor: active ? C.accentSoft : C.surface, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.55 : 1 }}
                  >
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: active ? C.blueDeep : C.muted }} maxFontSizeMultiplier={1.3}>{`${pct} %`}</Text>
                  </Tap>
                );
              })}
            </View>
            <PText v="tiny">Desde el 5 %. Lo asume tu negocio; Franky no cobra comisión por cada uso.</PText>
          </View>
        ) : null}
      </Panel>
      <Tip title="Lo que más reservas trae">
        Cinco fotos o más, precios visibles y un precio estudiante en horas valle. Una ficha completa inspira confianza a quien no te conoce todavía.
      </Tip>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: S.sm }}>
        <Eye size={13} color={C.muted} />
        <PText v="label">Así te ve un estudiante</PText>
      </View>
      <View style={{ borderRadius: 30, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, padding: 10, marginBottom: S.lg }}>
        <View style={{ borderRadius: 22, backgroundColor: C.surface, overflow: "hidden", ...SHADOW.card }}>
          <View style={{ height: 140, backgroundColor: C.input, justifyContent: "flex-end", padding: S.lg }}>
            <View style={{ alignSelf: "flex-start", backgroundColor: C.surface, borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.text }} maxFontSizeMultiplier={1.2}>{`${p.photos} fotos`}</Text>
            </View>
          </View>
          <View style={{ padding: S.lg, gap: S.sm }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.3}>{data.space.name}</Text>
                <PText v="tiny">{vertical.label}</PText>
              </View>
              {data.space.rating !== null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Star size={15} color={TONE_HEX.amber} fill={TONE_HEX.amber} />
                  <PText v="h3">{data.space.rating.toFixed(1)}</PText>
                </View>
              ) : null}
            </View>
            {data.space.walkMinutesToCampus !== null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MapPin size={13} color={C.muted} />
                <PText v="tiny" color={C.text}>{`A ${data.space.walkMinutesToCampus} min andando de tu facultad`}</PText>
              </View>
            ) : null}
            {p.cardEnabled ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: C.text, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Sparkles size={11} color={C.bg} />
                <Text style={{ fontFamily: FONT.semibold, fontSize: 11, color: C.bg }} maxFontSizeMultiplier={1.2}>{`Franky Card -${p.cardDiscountPct} %`}</Text>
              </View>
            ) : null}
            <PText v="small" color={C.text} numberOfLines={2}>{p.description}</PText>
            {highlights.length ? (
              <View>
                {highlights.map((s, i) => (
                  <View
                    key={s.id}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, paddingVertical: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.borderLight }}
                  >
                    <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{s.name}</PText>
                    {s.studentPriceCents ? (
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                        <Text style={{ fontSize: 11.5, color: C.muted, textDecorationLine: "line-through" }} maxFontSizeMultiplier={1.2}>{money(s.priceCents)}</Text>
                        <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: C.blueDeep }} maxFontSizeMultiplier={1.2}>{money(s.studentPriceCents)}</Text>
                      </View>
                    ) : (
                      <PText v="small" color={C.text}>{money(s.priceCents)}</PText>
                    )}
                  </View>
                ))}
              </View>
            ) : null}
            {p.bookingEnabled ? (
              <View style={{ marginTop: S.sm, height: 40, borderRadius: R.md, backgroundColor: C.text, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.bg }} maxFontSizeMultiplier={1.2}>Reservar</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </>
  );
}
