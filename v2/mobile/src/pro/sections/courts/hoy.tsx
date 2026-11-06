import React from "react";
import { ScrollView, Text, View, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { BadgeCheck, CalendarCheck2, Gauge, Plus, Send, Sparkles, Sun, Users, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, S } from "@/theme";
import { usePro } from "../../store";
import { ProPage, sectionHref, useGoSection } from "../../shell";
import type { ProResource } from "../../../../../shared/pro/types";
import { addDays, dayLabel, durationLabel, greeting, localDate, localMinutes, minutesToLabel, money, plural, time } from "../../../../../shared/pro/format";
import {
  MATCH_MINUTES,
  SLOT_MINUTES,
  dayOccupancy,
  hoursFor,
  isBusy,
  isShared,
  isValley,
  matchesOn,
  occupancyAt,
  priceFor,
  resourceBookings,
  valleyGaps,
  type OpenMatchX,
  type ValleyGap,
} from "../../../../../shared/pro/courts";
import { Empty, Kpi, KpiRow, ListRow, LiveDot, Meter, PButton, PageHeader, Panel, PText, Pill, TONE_HEX, Tip, PAvatar, tone } from "../../kit";
import { SetupChecklist } from "../common/checklist";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { RealCourtsHoy } from "./real-hoy";
import { BookingStatusPill, CourtBookingDrawer, CourtsFrankyCard, MatchDrawer, NewCourtBookingDrawer, courtsCopy, fromFranky, type NewCourtPreset } from "./parts";
import { AvatarStack, PanelLink } from "./ui";
import { TodayAttention } from "./hoy-attention";

export default function CourtsHoy() {
  const { demo } = usePro();
  return demo ? <DemoCourtsHoy /> : <RealCourtsHoy />;
}

function DemoCourtsHoy() {
  const { data, now, spaceId, vertical } = usePro();
  const router = useRouter();
  const go = useGoSection();
  const copy = courtsCopy(vertical.id);
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [openMatch, setOpenMatch] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewCourtPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const todays = resourceBookings(data, today).filter((b) => b.status !== "no_show");
  const occToday = dayOccupancy(data, today);
  const hours = hoursFor(data, today);
  const upcoming = todays.filter((b) => new Date(b.end).getTime() > now.getTime()).slice(0, 6);
  const requested = data.bookings.filter((b) => b.resourceId && b.status === "requested").sort((a, b) => a.start.localeCompare(b.start));
  const matches = (data.openMatches as OpenMatchX[])
    .filter((m) => new Date(m.start).getTime() + MATCH_MINUTES * 60000 > now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));

  // Franjas valle vacías de hoy; si ya han pasado, las de mañana.
  const tomorrow = addDays(today, 1);
  const gapsToday = valleyGaps(data, today, nowMin);
  const gaps = gapsToday.length ? gapsToday : valleyGaps(data, tomorrow, 0);
  const gapsDay = gapsToday.length ? today : tomorrow;
  const valleyHours = gaps.filter((g) => !isShared(res(data.resources, g.resourceId))).reduce((a, g) => a + (g.to - g.from), 0);

  const people = data.resources.filter(isShared).reduce((a, r) => a + occupancyAt(data, r, today, nowMin), 0);
  const seats = data.resources.filter(isShared).reduce((a, r) => a + r.capacity, 0);
  const roomsBooked = todays.filter((b) => !isShared(res(data.resources, b.resourceId))).length;
  const charged = data.payments.filter((p) => localDate(p.at) === today).reduce((a, p) => a + p.amountCents, 0);
  const expected = todays.reduce((a, b) => a + b.priceCents, 0);
  const last4 = data.history.slice(-4).reduce((a, w) => a + w.franky, 0);
  const matchesToday = matches.filter((m) => localDate(m.start) === today).length;

  const offerGap = (g: ValleyGap) => {
    const r = res(data.resources, g.resourceId);
    const price =
      r.kind === "court"
        ? priceFor({ ...r, valleyPricePerHourCents: undefined }, g.date, g.from, MATCH_MINUTES)
        : r.pricePerHourCents === null
          ? null
          : r.pricePerHourCents * (isShared(r) ? 4 : 2);
    if (price === null) return;
    setOffer({
      what: copy.what(r),
      date: g.date,
      from: g.from,
      to: g.to,
      priceCents: price,
      slots: isShared(r) ? g.free : Math.max(1, Math.floor((g.to - g.from) / (r.kind === "court" ? MATCH_MINUTES : 120))),
    });
  };

  const description = coworking
    ? `Ahora hay ${people} de ${seats} puestos ocupados, ${plural(todays.length, "reserva", "reservas")} hoy y ${plural(roomsBooked, "sala de grupo", "salas de grupo")} reservadas.`
    : `Hoy tienes ${plural(todays.length, "reserva", "reservas")} y las pistas al ${occToday} %${matchesToday ? `, con ${plural(matchesToday, "partido abierto", "partidos abiertos")} por completar` : ""}${valleyHours && gapsDay === today ? `. Quedan ${durationLabel(valleyHours)} de pista en hora valle sin vender.` : "."}`;

  return (
    <ProPage>
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={description}
        actions={<PButton label={copy.newBooking} icon={Plus} onPress={() => setPreset({ date: today })} />}
      />

      <SetupChecklist />

      <TodayAttention />

      <KpiRow>
        {coworking ? (
          <Kpi icon={Gauge} label="Ocupación ahora" value={`${seats ? Math.round((people / seats) * 100) : 0} %`} hint={`${people} de ${seats} puestos`} />
        ) : (
          <Kpi icon={Gauge} label="Ocupación hoy" value={`${occToday} %`} hint={hours ? `de ${minutesToLabel(hours.open)} a ${minutesToLabel(hours.close)}` : "Cerrado"} />
        )}
        <Kpi icon={CalendarCheck2} label="Reservas hoy" value={todays.length} hint={`${money(charged, { round: true })} cobrados de ${money(expected, { round: true })}`} />
        <Kpi
          icon={Zap}
          label={coworking ? "Franjas valle con sitio" : "Horas valle libres"}
          value={coworking ? gaps.length : durationLabel(valleyHours)}
          hint={gaps.length ? `${gapsDay === today ? "Hoy" : "Mañana"}: ofrécelas a estudiantes` : "Todo vendido"}
          emphasis={gaps.length > 0}
          onPress={gaps.length ? () => offerGap(gaps[0]) : undefined}
        />
        <Kpi icon={Sparkles} label="Por Franky, 4 semanas" value={last4} hint="reservas sin comisión" />
      </KpiRow>

      {requested.length ? (
        <Panel title="Esperan tu respuesta" description="Reservas pedidas online que necesitan tu visto bueno." flush>
          {requested.slice(0, 4).map((b, i, list) => {
            const r = data.resources.find((x) => x.id === b.resourceId);
            return (
              <ListRow key={b.id} onPress={() => setOpenBooking(b.id)} accessibilityLabel={`${b.clientName}, ${r?.name ?? ""}, ${dayLabel(b.start)} a las ${time(b.start)}`} last={i === list.length - 1}>
                <PAvatar name={b.clientName} size={32} />
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>{b.clientName}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${r?.name ?? ""} · ${dayLabel(b.start)} a las ${time(b.start)}`}</PText>
                </View>
                <BookingStatusPill status={b.status} playing={copy.playing} />
              </ListRow>
            );
          })}
        </Panel>
      ) : null}

      <Panel
        title={coworking ? "Ocupación de hoy por franja" : "Pistas de hoy"}
        description={coworking ? "Cuanto más oscuro, más lleno. Toca una franja para reservar." : "Cada casilla es media hora. Toca una libre para reservar."}
        action={<PanelLink label={copy.section} onPress={() => go("pistas")} />}
        flush
      >
        {hours ? (
          <MiniGrid date={today} onNew={(resourceId, minute) => setPreset({ date: today, resourceId, minute })} />
        ) : (
          <Empty icon={CalendarCheck2} title="Hoy está cerrado" body="Cambia tu horario en Ajustes si abres de forma excepcional." />
        )}
      </Panel>

      <Panel title="Próximas reservas" description={upcoming.length ? "Lo que viene en las próximas horas." : undefined} flush>
        {upcoming.length ? (
          upcoming.map((b, i) => {
            const r = data.resources.find((x) => x.id === b.resourceId);
            return (
              <ListRow key={b.id} onPress={() => setOpenBooking(b.id)} accessibilityLabel={`${b.clientName}, ${r?.name ?? ""}, ${time(b.start)} a ${time(b.end)}`} last={i === upcoming.length - 1}>
                <View style={{ width: 48 }}>
                  <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: C.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.3}>{time(b.start)}</Text>
                  <PText v="tiny" style={{ fontVariant: ["tabular-nums"] }}>{time(b.end)}</PText>
                </View>
                <View style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: tone(r?.tone).bar }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{b.clientName}</PText>
                    {b.student ? <BadgeCheck size={14} color={C.blue} accessibilityLabel="Estudiante verificado" /> : null}
                    {fromFranky(b.source) ? <Sparkles size={12} color={C.blue} accessibilityLabel="Vino por Franky" /> : null}
                  </View>
                  <PText v="tiny" numberOfLines={1}>
                    {`${r?.name ?? ""}${b.priceCents ? ` · ${money(b.priceCents)}${b.paidCents !== null && b.paidCents >= b.priceCents ? ", pagada" : ""}` : b.note ? ` · ${b.note}` : ""}`}
                  </PText>
                </View>
                <BookingStatusPill status={b.status} playing={copy.playing} />
              </ListRow>
            );
          })
        ) : (
          <Empty icon={CalendarCheck2} title="Nada más por hoy" body="Las reservas de mañana aparecerán aquí a primera hora." />
        )}
      </Panel>

      {coworking ? (
        <Panel title="En directo" description="Lo mismo que ven los estudiantes en el mapa de estudio de Franky." action={<View style={{ paddingTop: 6 }}><LiveDot /></View>}>
          <View style={{ gap: 14 }}>
            {data.resources.map((r) => {
              const occ = occupancyAt(data, r, today, nowMin);
              const cap = isShared(r) ? r.capacity : 1;
              return (
                <View key={r.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, flexShrink: 1 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone(r.tone).bar }} />
                      <PText v="h3" numberOfLines={1}>{r.name}</PText>
                    </View>
                    <PText v="small">{isShared(r) ? `${occ} de ${r.capacity}` : occ ? "Ocupada" : "Libre"}</PText>
                  </View>
                  <Meter value={Math.min(cap, occ)} max={cap} tone={occ >= cap ? "danger" : occ / cap > 0.75 ? "warning" : "success"} />
                </View>
              );
            })}
          </View>
        </Panel>
      ) : (
        <Panel
          title="Partidos abiertos por completar"
          description="Se llenan con estudiantes de nivel parecido."
          action={<PanelLink label="Todos" onPress={() => router.replace(`${sectionHref(spaceId, "pistas")}?vista=partidos` as never)} />}
          flush
        >
          {matches.length ? (
            matches.slice(0, 4).map((m, i, list) => {
              const r = data.resources.find((x) => x.id === m.resourceId);
              return (
                <ListRow
                  key={m.id}
                  onPress={() => setOpenMatch(m.id)}
                  accessibilityLabel={`Partido nivel ${m.level}, ${time(m.start)}, faltan ${m.needed}`}
                  last={i === list.length - 1}
                >
                  <AvatarStack names={m.players.slice(0, 3)} size={26} />
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>{`Nivel ${m.level} · ${localDate(m.start) === today ? "hoy" : "mañana"} ${time(m.start)}`}</PText>
                    <PText v="tiny" numberOfLines={1}>{`${r?.name ?? ""} · ${m.publishedAt ? `visto por ${m.reach ?? 0} estudiantes` : "sin publicar"}`}</PText>
                  </View>
                  <Pill tone={m.needed === 1 ? "warning" : "violet"} label={`Faltan ${m.needed}`} />
                </ListRow>
              );
            })
          ) : (
            <Empty icon={Users} title="Ningún partido abierto" body="Cuando alguien quiera jugar y le falte gente, créalo desde Pistas y se completa con estudiantes." />
          )}
        </Panel>
      )}

      <Panel title={`Franjas valle vacías ${gapsDay === today ? "hoy" : "mañana"}`} description="De 10 a 14 h. Ofrécelas a estudiantes antes de bajar precios a todos." flush>
        {gaps.length ? (
          gaps.slice(0, 5).map((g, i, list) => {
            const r = res(data.resources, g.resourceId);
            return (
              <View
                key={`${g.resourceId}-${g.from}`}
                style={{ gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                  <View style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: tone(r.tone).bar }} />
                  <View style={{ flex: 1 }}>
                    <PText v="h3" style={{ fontVariant: ["tabular-nums"] }}>{`${minutesToLabel(g.from)} a ${minutesToLabel(g.to)}`}</PText>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Sun size={12} color={C.muted} />
                      <PText v="tiny" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {`${r.name}${isShared(r) ? ` · ${g.free} puestos libres` : r.pricePerHourCents === null ? " · Precio según servicio" : ` · ${money(r.valleyPricePerHourCents ?? r.pricePerHourCents)} la hora`}`}
                      </PText>
                    </View>
                  </View>
                </View>
                <PButton label="Ofrecer a estudiantes" icon={Send} small variant="secondary" disabled={r.pricePerHourCents === null} onPress={() => offerGap(g)} style={{ marginLeft: 16 }} />
              </View>
            );
          })
        ) : (
          <Empty icon={Sun} title="Mañanas vendidas" body="No queda ninguna franja valle libre. Buen trabajo." />
        )}
      </Panel>

      <CourtsFrankyCard />

      <Tip title={coworking ? "Época de exámenes" : "Mañanas universitarias"}>
        {coworking
          ? "Desde mediados de diciembre la demanda se triplica. Programa ya el bono exámenes y el horario nocturno: Franky lo enseña a las carreras que tienen examen esa semana."
          : "Entre semana de 10 a 14 h hay miles de estudiantes con hueco entre clases. Un precio valle solo para ellos llena las pistas sin tocar el precio de la tarde."}
      </Tip>

      <CourtBookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <MatchDrawer matchId={openMatch} onClose={() => setOpenMatch(null)} />
      <NewCourtBookingDrawer preset={preset} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </ProPage>
  );
}

function res(list: ProResource[], id?: string): ProResource {
  return list.find((r) => r.id === id) ?? list[0];
}

/* Medidas de la rejilla compacta: casillas cómodas para el dedo. */
const CELL_W = 32;
const CELL_H = 40;
const CELL_GAP = 4;
const NAME_W = 76;

/** Rejilla compacta del día: una fila por pista o zona, una casilla por media hora. */
function MiniGrid({ date, onNew }: { date: string; onNew: (resourceId: string, minute: number) => void }) {
  const { data, now } = usePro();
  const hours = hoursFor(data, date)!;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const scrollRef = React.useRef<ScrollView>(null);
  const slots = Array.from({ length: (hours.close - hours.open) / SLOT_MINUTES }, (_, i) => hours.open + i * SLOT_MINUTES);
  const matchSlots = (r: ProResource, m: number) => matchesOn(data, date, r.id).some((x) => localMinutes(x.start) <= m && localMinutes(x.start) + MATCH_MINUTES > m);
  const green = TONE_HEX.emerald;
  const rose = TONE_HEX.rose;
  const shared = data.resources.some(isShared);

  // Arranca en la hora actual, con una hora de margen a la izquierda.
  const nowIndex = date === today ? Math.max(0, Math.floor((nowMin - hours.open) / SLOT_MINUTES) - 2) : 0;
  const scrollToNow = () => scrollRef.current?.scrollTo({ x: nowIndex * (CELL_W + CELL_GAP), animated: false });

  const legend: { label: string; swatch: ViewStyle }[] = [
    { label: shared ? "Lleno" : "Reservada", swatch: { backgroundColor: C.blue } },
    { label: "Valle libre", swatch: { backgroundColor: `${green}1F`, borderWidth: 1, borderColor: `${green}80` } },
    { label: "Libre", swatch: { backgroundColor: C.input, borderWidth: 1, borderColor: C.border } },
    ...(data.openMatches.length ? [{ label: "Partido abierto", swatch: { backgroundColor: C.accentSoft, borderWidth: 1, borderStyle: "dashed" as const, borderColor: C.blue } }] : []),
    { label: "Ahora", swatch: { borderWidth: 2, borderColor: rose } },
  ];

  return (
    <View style={{ padding: S.lg, gap: S.md }}>
      <View style={{ flexDirection: "row" }}>
        {/* Nombres fijos a la izquierda */}
        <View style={{ width: NAME_W, paddingTop: 18, gap: 6 }}>
          {data.resources.map((r) => (
            <View key={r.id} style={{ height: CELL_H, justifyContent: "center", paddingRight: 6 }}>
              <PText v="tiny" color={C.text} numberOfLines={2} style={{ fontFamily: FONT.semibold }}>{r.name}</PText>
            </View>
          ))}
        </View>
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={scrollToNow}>
          <View>
            <View style={{ flexDirection: "row", gap: CELL_GAP, height: 18 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {slots.map((m) => (
                <View key={m} style={{ width: CELL_W }}>
                  {m % 120 === 0 ? (
                    <Text style={{ position: "absolute", left: 0, top: 0, width: 60, fontSize: 10.5, fontFamily: FONT.medium, color: C.muted, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.2}>
                      {minutesToLabel(m)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={{ gap: 6 }}>
              {data.resources.map((r) => (
                <View key={r.id} style={{ flexDirection: "row", gap: CELL_GAP }}>
                  {slots.map((m) => {
                    const past = date === today && m + SLOT_MINUTES <= nowMin;
                    const valley = isValley(date, m);
                    const isSharedRes = isShared(r);
                    const occ = occupancyAt(data, r, date, m);
                    const busy = isBusy(data, r, date, m);
                    const match = !isSharedRes && matchSlots(r, m);
                    const ratio = isSharedRes ? occ / r.capacity : busy ? 1 : 0;
                    const isNow = date === today && m <= nowMin && m + SLOT_MINUTES > nowMin;
                    const label = `${r.name} a las ${minutesToLabel(m)}: ${isSharedRes ? `${occ} de ${r.capacity}` : match ? "partido abierto" : busy ? "reservada" : "libre"}`;
                    const free = { backgroundColor: valley ? `${green}1F` : C.input, borderWidth: valley ? 1 : 0, borderColor: `${green}80` };
                    const fill = match
                      ? { backgroundColor: C.accentSoft, borderWidth: 1, borderStyle: "dashed" as const, borderColor: C.blue }
                      : isSharedRes
                        ? ratio === 0
                          ? free
                          : { backgroundColor: ratio < 0.4 ? `${C.blue}40` : ratio < 0.75 ? `${C.blue}8C` : ratio < 1 ? `${C.blue}CC` : C.blue }
                        : busy
                          ? { backgroundColor: tone(r.tone).bar }
                          : free;
                    return (
                      <Tap
                        key={m}
                        onPress={() => onNew(r.id, m)}
                        disabled={past || busy}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        style={[
                          { width: CELL_W, height: CELL_H, borderRadius: 6, opacity: past ? 0.4 : 1 },
                          fill,
                          isNow ? { borderWidth: 2, borderColor: rose, borderStyle: "solid" } : null,
                        ]}
                      >
                        {null}
                      </Tap>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: S.lg, rowGap: 6 }}>
        {legend.map((l) => (
          <View key={l.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[{ width: 12, height: 12, borderRadius: 3 }, l.swatch]} />
            <PText v="tiny">{l.label}</PText>
          </View>
        ))}
      </View>
    </View>
  );
}
