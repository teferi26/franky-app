import React from "react";
import { Text, View } from "react-native";
import { CalendarPlus, Heart, PartyPopper, Plus, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { FadeIn } from "@/components/motion";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProEvent } from "../../../../../shared/pro/types";
import { money, pct } from "../../../../../shared/pro/format";
import { FRANKY_TICKET_FEE, eventPhase, eventStats, pastEvents, sortedEvents, upcomingEvents } from "../../../../../shared/pro/night";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Empty, Kpi, KpiRow, Meter, PButton, PText, PageHeader, Panel, Pill, Segmented, Tip } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { EventDrawer, NewEventDrawer, PhasePill, Poster, eventWhen, priceNowLabel } from "./night-ui";
import { NightCalendarPanel } from "./repeat";

type EventsView = "upcoming" | "past" | "draft";

export default function NightEventos() {
  const { data, now } = usePro();
  const [view, setView] = React.useState<EventsView>("upcoming");
  const [openEvent, setOpenEvent] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [createDate, setCreateDate] = React.useState<string | undefined>(undefined);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const upcoming = upcomingEvents(data, now);
  const past = pastEvents(data, now);
  const drafts = sortedEvents(data).filter((e) => e.status === "draft");
  const list = view === "upcoming" ? upcoming : view === "past" ? past : drafts;

  const upcomingSold = upcoming.reduce((a, e) => a + eventStats(data, e).sold, 0);
  const upcomingRevenue = upcoming.reduce((a, e) => a + eventStats(data, e).revenueCents, 0);
  const lastPast = past[0];
  const lastStats = lastPast ? eventStats(data, lastPast) : null;
  const pastAvgFill = past.length ? Math.round(past.reduce((a, e) => a + pct(e.checkedIn, e.capacity), 0) / past.length) : 0;
  const pastFee = past.reduce((a, e) => a + eventStats(data, e).frankyFeeCents, 0);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Tus noches"
        title="Eventos"
        description={
          upcoming.length
            ? `${upcoming.length} ${upcoming.length === 1 ? "noche" : "noches"} a la venta con ${upcomingSold} entradas vendidas (${money(upcomingRevenue, { round: true })}). Los precios suben solos al agotarse cada tramo.`
            : "Crea tu próxima noche: tramos de precio, lista con hora de corte y Crush Live."
        }
        actions={
          <PButton
            label="Nuevo evento"
            icon={Plus}
            onPress={() => {
              setCreateDate(undefined);
              setCreating(true);
            }}
          />
        }
      />

      <KpiRow>
        <Kpi label="A la venta" value={upcoming.length} hint={`${drafts.length} en borrador`} />
        <Kpi label="Entradas vendidas" value={upcomingSold} hint="En las próximas noches" />
        <Kpi
          label="Última noche"
          value={lastStats ? lastStats.inside : "0"}
          hint={lastPast ? `${lastPast.name}, ${pct(lastPast.checkedIn, lastPast.capacity)} % de aforo` : "Aún sin noches"}
        />
        <Kpi label="Aforo medio" value={`${pastAvgFill} %`} hint={`${past.length} noches terminadas`} />
      </KpiRow>

      <Segmented<EventsView>
        value={view}
        onChange={setView}
        options={[
          { value: "upcoming", label: "Próximos", count: upcoming.length },
          { value: "past", label: "Pasados", count: past.length },
          { value: "draft", label: "Borradores", count: drafts.length },
        ]}
      />

      {list.length ? (
        <View style={{ gap: S.md, marginBottom: S.lg }}>
          {list.map((e, i) => (
            <FadeIn key={e.id} index={Math.min(i, 8)}>
              <EventCard
                event={e}
                onOpen={() => setOpenEvent(e.id)}
                onOffer={() =>
                  setOffer({
                    what: `${e.name}: entrada con copa`,
                    date: e.date,
                    from: 23 * 60,
                    to: 23 * 60 + 59,
                    priceCents: e.tiers.find((t) => t.sold < t.quantity)?.priceCents ?? 1000,
                    slots: 50,
                  })
                }
              />
            </FadeIn>
          ))}
        </View>
      ) : (
        <Panel>
          <Empty
            icon={view === "past" ? PartyPopper : CalendarPlus}
            title={view === "past" ? "Todavía no hay noches terminadas" : view === "draft" ? "No tienes borradores" : "No tienes noches a la venta"}
            body={
              view === "past"
                ? "Cuando cierres tu primera noche verás aquí vendidas, escaneadas, no presentados e ingresos."
                : "Crea el evento con una semana de margen: la anticipada se vende sola entre quienes ya dijeron que salen."
            }
            action={view !== "past" ? <PButton label="Nuevo evento" icon={Plus} onPress={() => setCreating(true)} /> : undefined}
          />
        </Panel>
      )}

      {view === "upcoming" ? (
        <NightCalendarPanel
          onOpen={setOpenEvent}
          onCreate={(date) => {
            setCreateDate(date);
            setCreating(true);
          }}
        />
      ) : null}

      <Tip title="Precio que sube solo">
        Pon la anticipada barata y con pocas plazas. Cuando se agota, se abre la segunda sin que toques nada, y la taquilla queda para la puerta. Así la gente compra antes y sabes con días de margen cómo va la noche.
      </Tip>
      <Tip title="Cuentas claras">
        {`Franky cobra un ${Math.round(FRANKY_TICKET_FEE * 1000) / 10} % por entrada y lo paga el comprador. En tus noches terminadas han sido ${money(pastFee, { round: true })}, y a ti no se te ha descontado nada.`}
      </Tip>

      <EventDrawer eventId={openEvent} onClose={() => setOpenEvent(null)} />
      <NewEventDrawer
        open={creating}
        initialDate={createDate}
        onClose={() => setCreating(false)}
        onCreated={(_, draft) => setView(draft ? "draft" : "upcoming")}
      />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </ProPage>
  );
}

function EventCard({ event, onOpen, onOffer }: { event: ProEvent; onOpen: () => void; onOffer: () => void }) {
  const { data, now } = usePro();
  const phase = eventPhase(event, now);
  const stats = eventStats(data, event);
  const sellable = event.tiers.reduce((a, t) => a + t.quantity, 0);
  const priceNow = priceNowLabel(event, now);

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: "hidden", ...SHADOW.card }}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${event.name}, ${eventWhen(event)}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: S.lg, padding: S.lg }}>
        <Poster event={event} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
            <PhasePill phase={phase} />
            {event.crushLive ? <Pill label="Crush Live" tone="violet" icon={Heart} /> : null}
          </View>
          <Text style={{ fontFamily: FONT.heading, fontSize: 18, letterSpacing: -0.2, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {event.name}
          </Text>
          <PText v="small" numberOfLines={1}>{eventWhen(event)}</PText>
        </View>
      </Tap>

      <View style={{ gap: S.md, borderTopWidth: 1, borderTopColor: C.borderLight, paddingHorizontal: S.lg, paddingVertical: S.md }}>
        {phase === "past" ? (
          <View style={{ flexDirection: "row", gap: S.sm }}>
            <Figure label="Vendidas" value={stats.sold} />
            <Figure label="Entraron" value={stats.inside} />
            <Figure label="No vinieron" value={stats.noShows} />
            <Figure label="Ingresos" value={money(stats.revenueCents, { round: true })} />
          </View>
        ) : sellable ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: S.sm }}>
              <Text style={{ fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.3}>
                <Text style={{ fontFamily: FONT.display, fontSize: 20, color: C.text }}>{stats.sold}</Text>
                {` de ${sellable} entradas`}
              </Text>
              <PText v="tiny">{`${stats.list} en lista`}</PText>
            </View>
            <View style={{ flexDirection: "row", gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {event.tiers.map((t) => (
                <View key={t.id} style={{ flex: t.quantity, minWidth: 0, gap: 4 }}>
                  <Meter value={t.sold} max={t.quantity} tone={t.sold >= t.quantity ? "success" : "violet"} />
                  <PText v="tiny" numberOfLines={1}>{`${t.name} · ${money(t.priceCents)}`}</PText>
                </View>
              ))}
            </View>
            {priceNow ? (
              <PText v="tiny" color={C.blueDeep} style={{ fontFamily: FONT.semibold }}>
                {priceNow}
              </PText>
            ) : null}
          </>
        ) : (
          <PText v="small">{`Entrada libre${stats.list ? ` · ${stats.list} en lista` : ""}. Aforo de ${event.capacity}, se cuenta en puerta.`}</PText>
        )}
      </View>

      {phase !== "past" && phase !== "draft" ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, borderTopWidth: 1, borderTopColor: C.borderLight, paddingHorizontal: S.lg, paddingVertical: S.sm }}>
          <PText v="tiny" style={{ flex: 1 }}>{`${pct(stats.students, Math.max(1, stats.sold))} % estudiantes verificados`}</PText>
          <PButton label="Lanzar a estudiantes" icon={Zap} variant="secondary" small onPress={onOffer} />
        </View>
      ) : null}
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
      <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
        {String(value)}
      </Text>
      <PText v="tiny" numberOfLines={1}>{label}</PText>
    </View>
  );
}
