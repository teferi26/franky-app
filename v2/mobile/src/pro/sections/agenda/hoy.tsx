import React from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, BadgeCheck, CalendarCheck2, Clock3, Plus, Sparkles, Star, Users, Wallet, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import { bookingsOn, daySummary, freeGaps, type Gap } from "../../../../../shared/pro/agenda";
import { dayLabel, durationLabel, greeting, localDate, localMinutes, minutesToLabel, money, relative, time } from "../../../../../shared/pro/format";
import { frankyResults } from "../../../../../shared/pro/results";
import { usePro } from "../../store";
import { PRO_BAR_HEIGHT, ProPage, useGoSection } from "../../shell";
import { DarkBlock, DarkText, Empty, Kpi, KpiRow, ListRow, LiveDot, PAvatar, PButton, PText, PageHeader, Panel, Pill, StatusPill, TONE_HEX, tone } from "../../kit";
import { SetupChecklist } from "../common/checklist";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { BookingDrawer, NewBookingDrawer, isFromFranky, type NewBookingPreset } from "./booking-drawers";

export default function AgendaHoy() {
  const { data, now, vertical, demo, can, pending, loadDate } = usePro();
  const go = useGoSection();
  const insets = useSafeAreaInsets();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewBookingPreset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const summary = daySummary(data, today, nowMin);
  const gaps = freeGaps(data, today, nowMin, 30);
  const results = frankyResults(data, now, 30);
  const requested = data.bookings.filter((b) => b.status === "requested").sort((a, b) => a.start.localeCompare(b.start));
  const newGroups = data.groupRequests.filter((g) => g.status === "new");
  const liveOffers = data.offers.filter((o) => o.status === "live" && o.kind === "flash");
  const freeMinutes = gaps.reduce((a, g) => a + (g.to - g.from), 0);
  const showFinance = demo || can("finance.read");
  const canOffer = can("offer.launch");
  const chargedToday = demo
    ? summary.chargedCents
    : data.payments.filter((payment) => localDate(payment.at) === today).reduce((total, payment) => total + payment.amountCents, 0);

  React.useEffect(() => {
    if (!demo) void loadDate(today);
  }, [demo, loadDate, today]);

  const agendaLink = (
    <Tap onPress={() => go("agenda")} accessibilityRole="link" accessibilityLabel="Abrir la agenda" style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36 }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>Agenda</Text>
      <ArrowRight size={14} color={C.blue} />
    </Tap>
  );

  return (
    <View style={{ flex: 1 }}>
      <ProPage>
        <PageHeader
          eyebrow={dayLabel(now.toISOString())}
          title={data.space.owner.firstName ? `${greeting(now)}, ${data.space.owner.firstName}` : greeting(now)}
          description={
            summary.total
              ? `Hoy tienes ${summary.total} citas, ${summary.pending} por delante${gaps.length ? ` y ${durationLabel(freeMinutes)} libres que puedes ofrecer a estudiantes` : ""}.`
              : "Hoy no hay citas todavía."
          }
        />

        {demo ? <SetupChecklist /> : null}

        <KpiRow>
          <Kpi
            icon={CalendarCheck2}
            label="Citas de hoy"
            value={`${summary.done}/${summary.total}`}
            hint={summary.requested ? `${summary.requested} por confirmar` : "atendidas / total"}
          />
          {showFinance ? (
            <Kpi
              icon={Wallet}
              label={demo ? "Cobrado hoy" : "Registrado en caja"}
              value={money(chargedToday, { round: true })}
              hint={`${money(summary.expectedCents, { round: true })} previstos`}
            />
          ) : null}
          <Kpi
            icon={Zap}
            label="Huecos libres"
            value={durationLabel(freeMinutes)}
            hint={gaps.length ? (canOffer ? "Ofrécelos a estudiantes" : "Disponibles en tu agenda") : "Sin huecos disponibles"}
            emphasis={gaps.length > 0}
            onPress={gaps.length && canOffer ? () => setOffer({ gap: gaps[0] }) : undefined}
          />
          {demo ? (
            <Kpi icon={Sparkles} label="Por Franky, 30 días" value={results.people} hint={`${money(results.revenueCents, { round: true })} sin comisión`} />
          ) : null}
        </KpiRow>

        {requested.length ? (
          <Panel title="Esperan tu respuesta" description="Citas pedidas online que necesitan confirmación." flush>
            {requested.slice(0, 4).map((b, i, list) => {
              const service = data.services.find((s) => s.id === b.serviceId);
              return (
                <ListRow key={b.id} onPress={() => setOpenBooking(b.id)} accessibilityLabel={`${b.clientName}, por confirmar`} last={i === list.length - 1}>
                  <PAvatar name={b.clientName} size={34} />
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>{b.clientName}</PText>
                    <PText v="tiny" numberOfLines={1}>{`${service?.name ?? ""} · ${dayLabel(b.start, { weekday: true })} a las ${time(b.start)}`}</PText>
                  </View>
                  <StatusPill status="requested" />
                </ListRow>
              );
            })}
          </Panel>
        ) : null}

        <Panel title="Ahora y a continuación" description="Lo que tiene cada profesional en las próximas horas." action={agendaLink} flush>
          {data.staff
            .filter((s) => data.services.some((sv) => sv.staffIds.includes(s.id)))
            .map((s, index) => {
              const list = bookingsOn(data, today, s.id).filter((b) => b.status !== "no_show" && Date.parse(b.end) > now.getTime());
              const current = list.find(
                (b) => b.status === "in_service" || (Date.parse(b.start) <= now.getTime() && Date.parse(b.end) > now.getTime()),
              );
              const next = list.filter((b) => b !== current).slice(0, 3);
              const t = tone(s.tone);
              return (
                <View key={s.id} style={{ padding: S.lg, gap: S.md, borderTopWidth: index ? 1 : 0, borderTopColor: C.borderLight }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                    <PAvatar name={s.name} toneKey={s.tone} size={34} />
                    <View style={{ flex: 1 }}>
                      <PText v="h3" numberOfLines={1}>{s.name.split(" ")[0]}</PText>
                      <PText v="tiny" numberOfLines={1}>{s.title}</PText>
                    </View>
                    {s.clockedInAt ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <LiveDot />
                        <PText v="tiny">{`Desde ${time(s.clockedInAt)}`}</PText>
                      </View>
                    ) : demo ? (
                      <Pill label="Sin fichar" />
                    ) : null}
                  </View>
                  {current ? (
                    <Tap
                      onPress={() => setOpenBooking(current.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Ahora: ${current.clientName}, hasta las ${time(current.end)}`}
                      style={{ borderRadius: R.lg, padding: S.md, backgroundColor: t.block, gap: 2 }}
                    >
                      <Text style={{ fontFamily: FONT.semibold, fontSize: 11.5, letterSpacing: 0.6, textTransform: "uppercase", color: t.strong }} maxFontSizeMultiplier={1.3}>
                        Ahora
                      </Text>
                      <PText v="h3" numberOfLines={1}>{current.clientName}</PText>
                      <PText v="tiny" numberOfLines={1}>
                        {`${data.services.find((x) => x.id === current.serviceId)?.name ?? ""} · hasta las ${time(current.end)}`}
                      </PText>
                    </Tap>
                  ) : (
                    <View style={{ borderRadius: R.lg, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, padding: S.md }}>
                      <PText v="small">Libre ahora</PText>
                    </View>
                  )}
                  <View>
                    {next.map((b) => (
                      <Tap
                        key={b.id}
                        onPress={() => setOpenBooking(b.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${time(b.start)}, ${b.clientName}`}
                        style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 40 }}
                      >
                        <Text style={{ width: 46, fontFamily: FONT.semibold, fontSize: 12.5, color: C.muted, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.3}>
                          {time(b.start)}
                        </Text>
                        <PText v="body" numberOfLines={1} style={{ flex: 1 }}>{b.clientName}</PText>
                        {b.student ? <BadgeCheck size={15} color={C.blue} /> : null}
                        {b.status === "arrived" ? <Pill tone="info" label="Llegó" /> : null}
                      </Tap>
                    ))}
                    {!next.length && !current ? <PText v="small">Nada más hoy.</PText> : null}
                  </View>
                </View>
              );
            })}
        </Panel>

        {newGroups.length ? (
          <Panel title="Grupos que quieren venir" description="Peticiones de delegaciones, clubes y asociaciones." flush>
            {newGroups.map((g, i) => (
              <ListRow
                key={g.id}
                onPress={() => go(vertical.nav.some((n) => n.id === "grupos") ? "grupos" : "estudiantes")}
                accessibilityLabel={`${g.organization}, ${g.people} personas`}
                last={i === newGroups.length - 1}
              >
                <View style={{ width: 40, height: 40, borderRadius: R.md, backgroundColor: C.input, alignItems: "center", justifyContent: "center" }}>
                  <Users size={17} color={C.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>{g.organization}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${g.kind} · ${g.people} personas · ${dayLabel(g.date)}`}</PText>
                </View>
                <Pill tone="violet" label="Nueva" />
              </ListRow>
            ))}
          </Panel>
        ) : null}

        <Panel
          title="Huecos para llenar hoy"
          description={demo ? "Ofrécelos a estudiantes cerca de tu negocio." : "Disponibilidad según los horarios y las citas de tu agenda."}
          flush
        >
          {gaps.length ? (
            gaps.slice(0, 5).map((g, i, list) => <GapRow key={`${g.staffId}-${g.from}`} gap={g} last={i === list.length - 1} onOffer={() => setOffer({ gap: g })} />)
          ) : (
            <Empty icon={CalendarCheck2} title="Sin huecos disponibles hoy" body="Consulta otro día en la agenda para ver los próximos huecos." />
          )}
          {liveOffers.length ? (
            <View style={{ borderTopWidth: 1, borderTopColor: C.borderLight, paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm }}>
              {liveOffers.map((o) => (
                <View key={o.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <LiveDot />
                  <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{o.detail}</PText>
                  <PText v="tiny" style={{ fontVariant: ["tabular-nums"] }}>{`${o.claimed}/${o.slots}`}</PText>
                </View>
              ))}
            </View>
          ) : null}
        </Panel>

        {demo ? <FrankyCard /> : null}

        <Panel
          title="Últimas reseñas"
          action={
            data.space.rating !== null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Star size={16} color={TONE_HEX.amber} fill={TONE_HEX.amber} />
                <PText v="h3">{data.space.rating.toFixed(1)}</PText>
              </View>
            ) : undefined
          }
          flush
        >
          {data.reviews.slice(0, 2).map((r, i) => (
            <View key={r.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: 4, borderTopWidth: i ? 1 : 0, borderTopColor: C.borderLight }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
                <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>{r.clientName}</PText>
                <PText v="tiny">{relative(r.at, now.getTime())}</PText>
              </View>
              <PText v="small" numberOfLines={2}>{r.text}</PText>
            </View>
          ))}
        </Panel>

        <BookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
        <NewBookingDrawer preset={preset} onClose={() => setPreset(null)} />
        <OfferComposer preset={offer} onClose={() => setOffer(null)} />
      </ProPage>

      {/* Botón flotante para citar sin pasar por la agenda. */}
      <Tap
        onPress={() => setPreset({ date: today })}
        disabled={pending || !can("booking.create")}
        haptic
        accessibilityRole="button"
        accessibilityLabel="Nueva cita"
        style={{
          position: "absolute",
          right: S.lg,
          bottom: PRO_BAR_HEIGHT + insets.bottom + S.md,
          minHeight: 52,
          paddingHorizontal: S.xl,
          borderRadius: R.full,
          backgroundColor: C.text,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          opacity: pending || !can("booking.create") ? 0.45 : 1,
          ...SHADOW.float,
        }}
      >
        <Plus size={18} color={C.bg} strokeWidth={2.2} />
        <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.bg }} maxFontSizeMultiplier={1.3}>Cita</Text>
      </Tap>
    </View>
  );
}

function GapRow({ gap, onOffer, last }: { gap: Gap; onOffer: () => void; last?: boolean }) {
  const { data, pending, can } = usePro();
  const s = data.staff.find((x) => x.id === gap.staffId);
  return (
    <ListRow last={last}>
      <View style={{ width: 4, height: 36, borderRadius: 2, backgroundColor: tone(s?.tone).bar }} />
      <View style={{ flex: 1 }}>
        <PText v="h3" style={{ fontVariant: ["tabular-nums"] }}>{`${minutesToLabel(gap.from)} a ${minutesToLabel(gap.to)}`}</PText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Clock3 size={12} color={C.muted} />
          <PText v="tiny">{`${durationLabel(gap.to - gap.from)} con ${s?.name.split(" ")[0] ?? ""}`}</PText>
        </View>
      </View>
      <PButton
        label="Ofrecer"
        icon={Zap}
        small
        variant="secondary"
        disabled={pending || !can("offer.launch")}
        onPress={onOffer}
        accessibilityLabel={`Ofrecer el hueco de ${minutesToLabel(gap.from)} a ${minutesToLabel(gap.to)}`}
      />
    </ListRow>
  );
}

/** Lo que Franky ha traído: la cifra que justifica la cuota. */
function FrankyCard() {
  const { data, now } = usePro();
  const go = useGoSection();
  const results = frankyResults(data, now, 30);
  const fromFrankyToday = bookingsOn(data, localDate(now)).filter((b) => isFromFranky(b.source)).length;
  return (
    <DarkBlock>
      <DarkText v="label" dim>Franky, últimos 30 días</DarkText>
      <View>
        <DarkText v="display" style={{ fontVariant: ["tabular-nums"] }}>{results.people}</DarkText>
        <DarkText v="small" dim>clientes han llegado por Franky</DarkText>
      </View>
      <View style={{ flexDirection: "row", gap: S.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: S.md, marginTop: S.xs }}>
        <View style={{ flex: 1 }}>
          <DarkText v="h2" style={{ fontVariant: ["tabular-nums"] }}>{money(results.revenueCents, { round: true })}</DarkText>
          <DarkText v="small" dim>facturado con ellos</DarkText>
        </View>
        <View style={{ flex: 1 }}>
          <DarkText v="h2" style={{ fontVariant: ["tabular-nums"] }}>{money(results.savedCents, { round: true })}</DarkText>
          <DarkText v="small" dim>que no pagas en comisiones</DarkText>
        </View>
      </View>
      <DarkText v="small" dim>{`${fromFrankyToday} de las citas de hoy vienen de Franky.`}</DarkText>
      <Tap onPress={() => go("estudiantes")} accessibilityRole="link" accessibilityLabel="Ver resultados" style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40, alignSelf: "flex-start" }}>
        <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: "#FFFFFF" }} maxFontSizeMultiplier={1.3}>Ver resultados</Text>
        <ArrowRight size={14} color="#FFFFFF" />
      </Tap>
    </DarkBlock>
  );
}
