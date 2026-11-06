import React from "react";
import { Text, View } from "react-native";
import { ArrowRight, BadgeCheck, CalendarClock, Clock3, DoorOpen, Heart, ListChecks, Megaphone, Sofa, Sparkles, Ticket, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProEvent } from "../../../../../shared/pro/types";
import { dayLabel, greeting, money, pct, relative, time } from "../../../../../shared/pro/format";
import {
  MARKETPLACE_TICKET_FEE,
  countdown,
  crushStats,
  entryCurve,
  entryRate,
  eventPhase,
  eventStats,
  focusEvent,
  listClosed,
  nightFranky,
  promoterTotals,
  shortUni,
  upcomingEvents,
  zoneTotals,
} from "../../../../../shared/pro/night";
import { usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import { Bars, DarkBlock, DarkText, Empty, Kpi, KpiRow, ListRow, LiveDot, Meter, PAvatar, PButton, PText, PageHeader, Panel, Pill } from "../../kit";
import { SetupChecklist } from "../common/checklist";
import { EventDrawer, EventRow, PhasePill, Poster, TierList, priceNowLabel } from "./night-ui";
import { ForecastPanel, KaraokePanel, OfferClock, ReviewAskPanel } from "./ops-ui";
import { InvitesTonightCard } from "./invites";
import { isKaraokeNight, nightDateNotes, nightForecast } from "../../../../../shared/pro/night-ops";

export default function NightHoy() {
  const { data, now, vertical } = usePro();
  const go = useGoSection();
  const [openEvent, setOpenEvent] = React.useState<string | null>(null);

  const ev = focusEvent(data, now);
  const phase = ev ? eventPhase(ev, now) : null;
  const tonight = phase === "today" || phase === "live";
  const stats = ev ? eventStats(data, ev) : null;
  const zones = ev ? data.zones.filter((z) => !z.eventId || z.eventId === ev.id) : data.zones;
  const zt = zoneTotals(zones);
  const franky = nightFranky(data, now, 30);
  const requests = data.groupRequests.filter((g) => g.status === "new");
  const held = zones.filter((z) => z.status === "held");
  const upcoming = upcomingEvents(data, now)
    .filter((e) => e.id !== ev?.id)
    .slice(0, 4);

  const summary = (() => {
    if (!ev || !stats) return "No tienes ninguna noche a la venta. Crea la próxima y la verán los estudiantes de tu zona.";
    const extras = `${stats.sold ? `${stats.sold} entradas vendidas` : "entrada libre"}${stats.list ? `, ${stats.list} en lista` : ""} y ${zt.taken} reservados`;
    if (phase === "live") return `${ev.name} en marcha: ${stats.inside} personas dentro de ${ev.capacity}. ${extras}.`;
    if (phase === "today") return `Esta noche, ${ev.name}: ${extras}. Puertas a las ${time(ev.doorsOpen)}.`;
    return `Hoy no abres. La próxima es ${ev.name}, ${dayLabel(ev.doorsOpen)}: ${extras}.`;
  })();

  return (
    <ProPage>
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={summary}
        actions={
          <PButton
            label={vertical.primary.label}
            icon={vertical.primary.section === "puerta" ? DoorOpen : Sofa}
            onPress={() => go(vertical.primary.section)}
          />
        }
      />

      <SetupChecklist />

      <KpiRow>
        <Kpi
          icon={Users}
          label={phase === "live" ? "Dentro ahora" : "Aforo"}
          value={ev ? `${ev.checkedIn}/${ev.capacity}` : "0"}
          hint={
            phase === "live" && ev
              ? `${entryRate(data, ev, now).toLocaleString("es-ES")} entradas por minuto`
              : tonight
                ? `Abres a las ${ev ? time(ev.doorsOpen) : ""}`
                : "Se llena en la puerta"
          }
          emphasis={phase === "live"}
        />
        <Kpi
          icon={Ticket}
          label={tonight ? "Vendidas esta noche" : "Vendidas próxima"}
          value={stats?.sold ?? 0}
          hint={stats?.revenueCents ? `${money(stats.revenueCents, { round: true })} en entradas` : "Entrada libre"}
        />
        <Kpi icon={ListChecks} label="En lista" value={stats ? `${stats.listIn}/${stats.list}` : "0"} hint={ev?.listCutoff ? `Hasta las ${time(ev.listCutoff)}` : "Sin hora de corte"} />
        <Kpi icon={Sparkles} label="A estudiantes, 30 días" value={franky.studentTickets.toLocaleString("es-ES")} hint="En Franky, sin comisión para ti" />
      </KpiRow>

      {ev ? <TonightHero event={ev} onOpen={() => setOpenEvent(ev.id)} /> : <NoEvent />}

      {requests.length || held.length ? (
        <Panel title="Esperan tu respuesta" description="Reservados pedidos por estudiantes y señales sin pagar." flush>
          {requests.map((g, i) => (
            <ListRow key={g.id} onPress={() => go("reservados")} accessibilityLabel={`${g.kind}, ${g.people} personas`} last={i === requests.length - 1 && !held.length}>
              <PAvatar name={g.organizer} size={32} toneKey="violet" />
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{`${g.kind} · ${g.people} personas`}</PText>
                <PText v="tiny" numberOfLines={1}>{`${g.organizer} · ${dayLabel(g.date)} · pedido ${relative(g.createdAt, now.getTime())}`}</PText>
              </View>
              <Pill label="Nueva" tone="violet" />
            </ListRow>
          ))}
          {held.map((z, i) => (
            <ListRow key={z.id} onPress={() => go("reservados")} accessibilityLabel={`${z.name} apartado para ${z.bookedBy}`} last={i === held.length - 1}>
              <View style={{ width: 32, alignItems: "center" }}>
                <Sofa size={17} color={C.muted} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{`${z.name} apartado para ${z.bookedBy}`}</PText>
                <PText v="tiny" numberOfLines={1}>{`Falta la señal de ${money(z.depositCents)} para confirmarlo`}</PText>
              </View>
              <Pill label="Señal" tone="warning" />
            </ListRow>
          ))}
        </Panel>
      ) : null}

      <Panel title="Próximas noches" description="Ventas de cada evento y lo que falta para llenarlo." action={<LinkAction label="Eventos" onPress={() => go("eventos")} />} flush>
        {upcoming.length ? (
          upcoming.map((e, i) => <EventRow key={e.id} event={e} onPress={() => setOpenEvent(e.id)} last={i === upcoming.length - 1} />)
        ) : (
          <Empty icon={CalendarClock} title="No hay más noches a la venta" body="Crea la siguiente con tiempo: la anticipada se vende mejor con una semana de margen." />
        )}
      </Panel>

      <OfferClock />
      {ev && phase === "live" ? <InvitesTonightCard /> : null}
      {ev && tonight && isKaraokeNight(data, ev) ? <KaraokePanel event={ev} /> : null}
      {ev && phase !== "past" ? <ForecastPanel event={ev} /> : null}
      {ev?.listCutoff && stats && stats.list ? <ListCutoffCard event={ev} /> : null}
      {ev && data.promoters.length ? <TopPromoters event={ev} /> : null}
      {ev ? <CrushCard event={ev} /> : null}
      <ReviewAskPanel />
      <FrankyCard />

      <EventDrawer eventId={openEvent} onClose={() => setOpenEvent(null)} />
    </ProPage>
  );
}

/** Enlace de texto en la cabecera de un panel ("Eventos →"). */
function LinkAction({ label, onPress, light }: { label: string; onPress: () => void; light?: boolean }) {
  const color = light ? "#FFFFFF" : C.blue;
  return (
    <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color }} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <ArrowRight size={14} color={color} />
    </Tap>
  );
}

/** La noche en grande: aforo en directo, ritmo de entrada, tramos, lista y reservados. */
function TonightHero({ event, onOpen }: { event: ProEvent; onOpen: () => void }) {
  const { data, now } = usePro();
  const go = useGoSection();
  const phase = eventPhase(event, now);
  const stats = eventStats(data, event);
  const rate = entryRate(data, event, now);
  const curve = entryCurve(data, event, now, 24);
  const lastBucket = curve.reduce((last, v, i) => (v > 0 ? i : last), -1);
  const fill = pct(event.checkedIn, event.capacity);
  const zones = data.zones.filter((z) => !z.eventId || z.eventId === event.id);
  const zt = zoneTotals(zones);
  const priceNow = priceNowLabel(event, now);
  // Solo se pintan las últimas franjas: en un móvil no caben 24 barras legibles.
  const bars = curve.slice(Math.max(0, lastBucket - 7), lastBucket + 1);

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginBottom: S.lg, overflow: "hidden", ...SHADOW.card }}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${event.name}, ver detalle`} style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md, padding: S.lg, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
        <Poster event={event} size="md" />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
            <PhasePill phase={phase} />
            {phase === "today" ? <PText v="tiny">{`Abres en ${countdown(now.getTime(), event.doorsOpen)}`}</PText> : null}
            {phase === "upcoming" ? <PText v="tiny">{`Faltan ${countdown(now.getTime(), event.doorsOpen)}`}</PText> : null}
            {phase === "live" ? <PText v="tiny">{`Cierra a las ${time(event.closes)}`}</PText> : null}
          </View>
          <Text style={{ fontFamily: FONT.display, fontSize: 21, letterSpacing: -0.4, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {event.name}
          </Text>
          <PText v="small" numberOfLines={1}>{`${dayLabel(event.doorsOpen)} · puertas ${time(event.doorsOpen)}${event.lineup ? ` · ${event.lineup}` : ""}`}</PText>
          {nightDateNotes(event.date).length ? (
            <PText v="tiny" color={C.blueDeep} style={{ fontFamily: FONT.semibold }}>
              {nightDateNotes(event.date).join(" · ")}
            </PText>
          ) : null}
        </View>
      </Tap>

      <View style={{ padding: S.lg, gap: S.lg }}>
        <View>
          <PText v="small">{phase === "live" ? "Dentro ahora" : "Aforo de la noche"}</PText>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: S.sm, marginTop: 4 }}>
            <Text style={{ fontFamily: FONT.display, fontSize: 48, lineHeight: 52, letterSpacing: -1.4, color: C.text }} maxFontSizeMultiplier={1.1}>
              {event.checkedIn}
            </Text>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 18, color: C.muted }} maxFontSizeMultiplier={1.2}>{`/ ${event.capacity}`}</Text>
          </View>
          <View style={{ marginTop: S.md }}>
            <Meter value={event.checkedIn} max={event.capacity} tone={fill >= 95 ? "danger" : fill >= 80 ? "warning" : "violet"} />
          </View>
          <PText v="tiny" style={{ marginTop: S.sm }}>
            {phase === "live"
              ? `${fill} % del aforo · ${rate.toLocaleString("es-ES")} entradas por minuto · quedan ${Math.max(0, event.capacity - event.checkedIn)} plazas`
              : `${stats.sold + stats.list + stats.reserved} personas con entrada, lista o reservado`}
          </PText>
          {phase === "live" && lastBucket >= 0 ? (
            <View style={{ marginTop: S.lg }}>
              <Bars values={bars} height={72} />
              <PText v="tiny" style={{ marginTop: 4 }}>{`Entradas cada 15 minutos desde las ${time(event.doorsOpen)}`}</PText>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
            <MiniStat label="Entradas" value={`${stats.ticketsIn}/${stats.sold}`} />
            <MiniStat label="Lista" value={`${stats.listIn}/${stats.list}`} />
            <MiniStat label="Reservados" value={`${zt.arrived}/${zt.taken}`} onPress={() => go("reservados")} />
          </View>
        </View>

        <View>
          <PText v="small" style={{ marginBottom: S.md }}>Entradas por tramo</PText>
          <TierList event={event} now={now} compact />
          {priceNow ? (
            <PText v="small" color={C.blueDeep} style={{ marginTop: S.md, fontFamily: FONT.semibold }}>
              {priceNow}
            </PText>
          ) : null}
          <PButton label="Ver detalle y asistentes" variant="outline" small full onPress={onOpen} style={{ marginTop: S.lg }} />
        </View>
      </View>
    </View>
  );
}

function MiniStat({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const body = (
    <View style={{ borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.sm, paddingVertical: S.sm, alignItems: "center" }}>
      <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.2} numberOfLines={1}>
        {value}
      </Text>
      <PText v="tiny" numberOfLines={1}>{label}</PText>
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }}>{body}</View>;
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={{ flex: 1 }}>
      {body}
    </Tap>
  );
}

function NoEvent() {
  const go = useGoSection();
  return (
    <Panel>
      <Empty
        icon={CalendarClock}
        title="No hay ninguna noche a la venta"
        body="Crea tu próximo evento con tramos de precio y hora de corte de lista. Lo verán los estudiantes de Alicante en Franky."
        action={<PButton label="Crear evento" onPress={() => go("eventos")} />}
      />
    </Panel>
  );
}

function ListCutoffCard({ event }: { event: ProEvent }) {
  const { data, now } = usePro();
  const stats = eventStats(data, event);
  const closed = listClosed(event, now);
  const phase = eventPhase(event, now);
  const cutoff = event.listCutoff as string;
  // Lo que suele venir de la lista sale de las noches pasadas, no de una cifra fija.
  const forecast = nightForecast(data, event, now);
  return (
    <Panel title="Hora de corte de lista" description={`Gratis hasta las ${time(cutoff)}. Después, taquilla.`}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: S.md }}>
        <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.6, color: C.text }} maxFontSizeMultiplier={1.2}>
          {closed ? "Cerrada" : countdown(now.getTime(), cutoff)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Clock3 size={13} color={C.muted} />
          <PText v="tiny">{closed ? `desde las ${time(cutoff)}` : "para cerrar"}</PText>
        </View>
      </View>
      <View style={{ marginTop: S.md }}>
        <Meter value={stats.listIn} max={Math.max(1, stats.list)} tone="success" />
      </View>
      <PText v="tiny" style={{ marginTop: S.sm }}>
        {phase === "live" || phase === "past"
          ? `${stats.listIn} de ${stats.list} de la lista ya han entrado (${pct(stats.listIn, stats.list)} %).`
          : forecast
            ? `${stats.list} personas apuntadas. En tus últimas noches vino el ${forecast.showListPct} % de la lista: cuenta con unas ${Math.round((stats.list * forecast.showListPct) / 100)}.`
            : `${stats.list} personas apuntadas.`}
      </PText>
    </Panel>
  );
}

function TopPromoters({ event }: { event: ProEvent }) {
  const { data, now } = usePro();
  const go = useGoSection();
  const live = eventPhase(event, now) === "live";
  const rows = data.promoters
    .map((p) => ({ p, t: promoterTotals(data, p, event.id) }))
    .filter((x) => x.t.sold + x.t.list > 0)
    .sort((a, b) => (live ? b.t.scanned - a.t.scanned : b.t.sold + b.t.list - (a.t.sold + a.t.list)))
    .slice(0, 5);
  return (
    <Panel
      title="Top RRPP de la noche"
      description={live ? "Por entradas reales escaneadas en puerta." : "Por entradas vendidas y apuntados en lista."}
      action={<LinkAction label="RRPP" onPress={() => go("rrpp")} />}
      flush
    >
      {rows.length ? (
        rows.map(({ p, t }, i) => (
          <ListRow key={p.id} last={i === rows.length - 1}>
            <PText v="tiny" style={{ width: 14, textAlign: "center", fontFamily: FONT.heading }}>
              {String(i + 1)}
            </PText>
            <PAvatar name={p.name} size={32} toneKey={i === 0 ? "violet" : "slate"} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</PText>
                {p.university ? <BadgeCheck size={13} color={C.blue} accessibilityLabel="Estudiante verificado" /> : null}
              </View>
              <PText v="tiny" numberOfLines={1}>{`${shortUni(p.university)} · ${t.sold} vendidas · ${t.list} en lista`}</PText>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3}>
                {live ? t.scanned : t.sold + t.list}
              </Text>
              <PText v="tiny">{live ? "dentro" : "personas"}</PText>
            </View>
          </ListRow>
        ))
      ) : (
        <Empty icon={Megaphone} title="Sin ventas de RRPP todavía" body="Comparte el enlace de cada RRPP: todo lo que vendan queda a su nombre." />
      )}
    </Panel>
  );
}

function CrushCard({ event }: { event: ProEvent }) {
  const { data, now } = usePro();
  const go = useGoSection();
  const phase = eventPhase(event, now);
  const stats = eventStats(data, event);
  const crush = crushStats(event, stats.sold);
  return (
    <Panel>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md }}>
        <Heart size={20} color={event.crushLive ? C.blue : C.muted} strokeWidth={1.9} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <PText v="h3">Crush Live</PText>
            {event.crushLive && phase === "live" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <LiveDot />
                <PText v="tiny" color={C.success} style={{ fontFamily: FONT.semibold }}>
                  En pantallas
                </PText>
              </View>
            ) : null}
          </View>
          {event.crushLive ? (
            <>
              <PText v="small">
                {phase === "live"
                  ? `${crush.players} personas jugando y ${crush.matches} matches en las pantallas esta noche.`
                  : `Se enciende al abrir puertas. ${crush.players} de los que tienen entrada ya se han apuntado.`}
              </PText>
              {phase === "live" ? (
                <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm }}>
                  <MiniStat label="Jugando" value={String(crush.players)} />
                  <MiniStat label="Matches" value={String(crush.matches)} />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <PText v="small">Apagado para esta noche. Enciende las pantallas de matches: la fiesta que nadie más tiene en Alicante.</PText>
              <LinkAction label="Activarlo en el evento" onPress={() => go("eventos")} />
            </>
          )}
        </View>
      </View>
    </Panel>
  );
}

/** Lo que Franky ha traído: entradas a estudiantes sin comisión para la sala. */
function FrankyCard() {
  const { data, now } = usePro();
  const go = useGoSection();
  const f = nightFranky(data, now, 30);
  const unis = Object.entries(f.universities).sort((a, b) => b[1] - a[1]);
  const top = unis[0];
  return (
    <DarkBlock>
      <DarkText v="label" dim>
        Franky, últimos 30 días
      </DarkText>
      <DarkText v="display">{f.studentTickets.toLocaleString("es-ES")}</DarkText>
      <DarkText v="small" dim>
        entradas vendidas a estudiantes en Franky
      </DarkText>
      <View style={{ flexDirection: "row", gap: S.md, marginTop: S.sm, paddingTop: S.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <DarkText v="h2">{money(f.revenueCents, { round: true })}</DarkText>
          <DarkText v="small" dim>
            íntegros para ti, sin comisión
          </DarkText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <DarkText v="h2">{money(f.savedCents, { round: true })}</DarkText>
          <DarkText v="small" dim>
            {`que un marketplace al ${Math.round(MARKETPLACE_TICKET_FEE * 100)} % se habría quedado`}
          </DarkText>
        </View>
      </View>
      {top ? (
        <DarkText v="small" dim>
          {`${pct(top[1], f.studentTickets)} % de ${shortUni(top[0])}. El 2,5 % de cada entrada lo paga el comprador.`}
        </DarkText>
      ) : null}
      <LinkAction label="Ver resultados" onPress={() => go("estudiantes")} light />
    </DarkBlock>
  );
}
