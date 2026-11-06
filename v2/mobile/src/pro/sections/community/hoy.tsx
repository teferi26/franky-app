import React from "react";
import { Text, View } from "react-native";
import { BadgeCheck, BellRing, CalendarDays, FileCheck2, GraduationCap, Handshake, MapPin, Megaphone, Plus, QrCode, Users, Wallet } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import { addDays, capitalize, dayLabel, greeting, localDate, money, pct, relative, time } from "../../../../../shared/pro/format";
import {
  communityCash,
  daysBetween,
  windowLabel,
  MEMBER_FEE_CENTS,
  type CommunityActivity,
  type CommunityMember,
} from "../../../../../shared/pro/demo/community";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { DarkBlock, DarkText, Empty, Kpi, KpiRow, ListRow, Meter, PageHeader, Panel, PButton, Pill, PText, Tip } from "../../kit";
import { SetupChecklist } from "../common/checklist";
import { CashLine, DateBadge, Figure, PanelLink, useGoTo } from "./ui";

export default function CommunityHoy() {
  const { data, now, update } = usePro();
  const go = useGoTo();
  const today = localDate(now);
  const members = data.communityMembers as CommunityMember[];
  const activities = data.activities as CommunityActivity[];
  const cash = communityCash(data);

  const upcoming = activities
    .filter((a) => a.status === "published" && a.date >= now.toISOString())
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const newThisMonth = members.filter((m) => localDate(m.joinedAt) >= addDays(today, -30));
  const proposed = data.sponsors.filter((s) => s.status === "proposed");
  const subsidy = data.subsidies.find((s) => s.status === "preparing");
  const subsidyMissing = subsidy ? subsidy.checklist.filter((c) => !c.done) : [];
  const subsidyDays = subsidy ? daysBetween(today, subsidy.window) : 0;
  const lastAnnouncement = [...data.announcements].sort((a, b) => b.at.localeCompare(a.at))[0];
  const [reminded, setReminded] = React.useState(false);

  const remind = async () => {
    setReminded(true);
    const ok = await update("community.remindFees", (d) => ({
      ...d,
      announcements: [
        {
          id: `an-${Date.now()}`,
          title: "Recordatorio: cuota del curso",
          body: `Te queda por pagar la cuota de ${money(MEMBER_FEE_CENTS)}. Pagarla desde Franky es un momento.`,
          at: new Date().toISOString(),
          audience: "socios",
          reads: 0,
        },
        ...d.announcements,
      ],
    }));
    if (!ok) {
      setReminded(false);
      return;
    }
    toast("Recordatorio enviado", { kind: "success", body: `${cash.pending} socios reciben el enlace de pago en Franky.` });
  };

  const summary = next
    ? `${data.space.name} tiene ${members.length} socios. ${capitalize(relative(next.date, now.getTime()))}, ${next.title.replace("Cinefórum: ", "cinefórum de ")} con ${next.registered} inscritos${cash.pending ? ` y ${cash.pending} cuotas por cobrar` : ""}.`
    : `${data.space.name} tiene ${members.length} socios y ninguna actividad publicada. Publica la próxima y llegará a toda la universidad.`;

  const nothingToDo = !cash.pending && !subsidyMissing.length && !proposed.length;

  return (
    <ProPage>
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={summary}
        actions={<PButton label="Nueva actividad" icon={Plus} onPress={() => go("actividades", { nueva: "1" })} />}
      />

      <SetupChecklist />

      <KpiRow>
        <Kpi icon={Users} label="Socios" value={members.length} hint={`+${newThisMonth.length} en los últimos 30 días`} />
        <Kpi icon={Wallet} label="Cuotas por cobrar" value={cash.pending} hint={`${money(cash.pendingCents, { round: true })} pendientes`} emphasis={cash.pending > 0} />
        <Kpi icon={CalendarDays} label="Próximas actividades" value={upcoming.length} hint={next ? `La siguiente ${relative(next.date, now.getTime())}` : "Ninguna publicada"} />
        <Kpi icon={Handshake} label="Caja del curso" value={money(cash.totalCents, { round: true })} hint="Entradas, cuotas y patrocinios" />
      </KpiRow>

      {next ? (
        <NextActivity activity={next} />
      ) : (
        <Panel>
          <Empty
            icon={CalendarDays}
            title="No hay ninguna actividad a la vista"
            body="Publica la próxima: la ven los estudiantes de toda la universidad, no solo quien ya te sigue."
            action={<PButton label="Nueva actividad" onPress={() => go("actividades", { nueva: "1" })} />}
          />
        </Panel>
      )}

      <Panel title="Para hoy" description="Lo que conviene resolver antes de que se te olvide." flush>
        {cash.pending ? (
          <ListRow last={!(subsidy && subsidyMissing.length) && !proposed.length}>
            <Wallet size={17} color={C.muted} strokeWidth={1.9} />
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3">{`${cash.pending} socios no han pagado la cuota`}</PText>
              <PText v="tiny">{`${money(cash.pendingCents, { round: true })} sin perseguir transferencias ni Excel. Les llega el enlace de pago.`}</PText>
              <PButton
                small
                label={reminded ? "Enviado" : "Recordar cuota"}
                icon={BellRing}
                variant={reminded ? "ghost" : "secondary"}
                onPress={() => void remind()}
                disabled={reminded}
                style={{ marginTop: S.sm }}
              />
            </View>
          </ListRow>
        ) : null}
        {subsidy && subsidyMissing.length ? (
          <ListRow onPress={() => go("subvenciones")} accessibilityLabel="Ir a subvenciones" last={!proposed.length}>
            <FileCheck2 size={17} color={C.muted} strokeWidth={1.9} />
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3">{`Te faltan ${subsidyMissing.length} requisitos para la subvención`}</PText>
              <PText v="tiny" numberOfLines={1}>{subsidyMissing.map((m) => m.label).join(", ")}</PText>
            </View>
            <Pill label={`${subsidyDays} días`} tone={subsidyDays <= 14 ? "warning" : "neutral"} />
          </ListRow>
        ) : null}
        {proposed.map((s, i) => (
          <ListRow key={s.id} onPress={() => go("patrocinios")} accessibilityLabel={`${s.business} tiene tu propuesta`} last={i === proposed.length - 1}>
            <Handshake size={17} color={C.muted} strokeWidth={1.9} />
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3" numberOfLines={1}>{`${s.business} tiene tu propuesta`}</PText>
              <PText v="tiny" numberOfLines={1}>{`${s.packageName}, ${money(s.amountCents, { round: true })}`}</PText>
            </View>
            <Pill label="Propuesta" tone="violet" />
          </ListRow>
        ))}
        {nothingToDo ? (
          <View style={{ paddingHorizontal: S.lg, paddingVertical: S.lg }}>
            <PText v="small">Todo al día. Buen momento para preparar la próxima actividad.</PText>
          </View>
        ) : null}
      </Panel>

      <Tip title="Asistencia que vale">
        El check-in con QR y cuenta universitaria deja la asistencia verificada: sirve para los créditos de tus socios y para justificar la subvención sin hojas de firmas.
      </Tip>

      {upcoming.length > 1 ? (
        <Panel title="Lo que viene" action={<PanelLink label="Actividades" onPress={() => go("actividades")} />} flush>
          {upcoming.slice(1, 5).map((a, i, list) => (
            <ListRow key={a.id} onPress={() => go("actividades", { a: a.id })} accessibilityLabel={a.title} last={i === list.length - 1}>
              <DateBadge iso={a.date} />
              <View style={{ flex: 1, gap: 4 }}>
                <PText v="h3" numberOfLines={1}>{a.title}</PText>
                <PText v="tiny" numberOfLines={1}>
                  {`${a.registered} de ${a.capacity} plazas · ${a.priceCents ? money(a.priceCents) : "Gratis"}${a.ectsHours ? ` · ${a.ectsHours} h para créditos` : ""}`}
                </PText>
                <Meter value={a.registered} max={a.capacity} />
              </View>
            </ListRow>
          ))}
        </Panel>
      ) : null}

      {subsidy ? (
        <Panel title="Próxima ventana de subvención" description="Convocatoria del Consejo de Estudiantes.">
          <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.6, color: C.text }} maxFontSizeMultiplier={1.2}>
            {`${subsidyDays} días`}
          </Text>
          <PText v="small">{`hasta el ${windowLabel(subsidy.window)}, pides ${money(subsidy.requestedCents, { round: true })}`}</PText>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: S.lg, marginBottom: 6 }}>
            <PText v="tiny">Requisitos listos</PText>
            <PText v="tiny">{`${subsidy.checklist.length - subsidyMissing.length} de ${subsidy.checklist.length}`}</PText>
          </View>
          <Meter value={subsidy.checklist.length - subsidyMissing.length} max={subsidy.checklist.length} tone={subsidyMissing.length ? "violet" : "success"} />
          <PButton label="Preparar la solicitud" variant="outline" small full onPress={() => go("subvenciones")} style={{ marginTop: S.lg }} />
        </Panel>
      ) : null}

      <Panel title="Caja" description="Todo lo cobrado este curso desde Franky.">
        <CashLine label="Entradas de actividades" value={money(cash.ticketsCents, { round: true })} />
        <CashLine label={`Cuotas (${cash.paid} pagadas)`} value={money(cash.feesCents, { round: true })} />
        <CashLine label="Patrocinios activos" value={money(cash.sponsorsCents, { round: true })} />
        <CashLine label="Total" value={money(cash.totalCents, { round: true })} strong />
        <PText v="tiny" style={{ marginTop: S.md }}>Franky se queda el 5 % de lo cobrado en entradas y cuotas. Los patrocinios, íntegros para ti.</PText>
      </Panel>

      {lastAnnouncement ? (
        <Panel title="Último aviso" action={<PanelLink label="Avisos" onPress={() => go("avisos")} />}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Megaphone size={16} color={C.blue} strokeWidth={1.9} />
            <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>{lastAnnouncement.title}</PText>
          </View>
          <PText v="tiny" style={{ marginTop: 4 }}>{relative(lastAnnouncement.at, now.getTime())}</PText>
          <Text style={{ fontFamily: FONT.heading, fontSize: 24, color: C.text, marginTop: S.md }} maxFontSizeMultiplier={1.2}>
            {lastAnnouncement.reads.toLocaleString("es-ES")}
          </Text>
          <PText v="tiny">
            {lastAnnouncement.audience === "junta" ? "lecturas de la junta" : lastAnnouncement.audience === "socios" ? "socios lo han leído" : "estudiantes lo han leído"}
          </PText>
        </Panel>
      ) : null}

      <FrankyCard />
    </ProPage>
  );
}

function NextActivity({ activity: a }: { activity: CommunityActivity }) {
  const { data, now } = usePro();
  const go = useGoTo();
  const sponsor = data.sponsors.find((s) => s.id === a.sponsorId);
  const free = a.capacity - a.registered;
  const isToday = localDate(a.date) === localDate(now);
  const d = new Date(a.date);
  const day = d.toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" });
  const weekday = capitalize(d.toLocaleDateString("es-ES", { weekday: "short", timeZone: "Europe/Madrid" }));
  const month = d.toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" });

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, marginBottom: S.lg, gap: S.lg, ...SHADOW.card }}>
      {/* Fecha grande a la izquierda y hora a la derecha */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: S.md }}>
        <View style={{ flex: 1 }}>
          <PText v="label">{isToday ? "Hoy" : "Próxima"}</PText>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: S.sm, marginTop: 4 }}>
            <Text style={{ fontFamily: FONT.display, fontSize: 38, lineHeight: 40, letterSpacing: -1, color: C.text }} maxFontSizeMultiplier={1.2}>
              {day}
            </Text>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.3}>
              {`${weekday}, ${month}`}
            </Text>
          </View>
        </View>
        <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.3}>
          {time(a.date)}
        </Text>
      </View>

      <View style={{ gap: S.sm }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Pill label={a.priceCents ? money(a.priceCents) : "Gratis"} tone={a.priceCents ? "neutral" : "success"} />
          {a.ectsHours ? <Pill label={`${a.ectsHours} h para créditos`} tone="info" icon={GraduationCap} /> : null}
          {sponsor ? <Pill label={`Con ${sponsor.business}`} tone="violet" /> : null}
        </View>
        <Text style={{ fontFamily: FONT.heading, fontSize: 21, letterSpacing: -0.2, color: C.text }} maxFontSizeMultiplier={1.3}>
          {a.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MapPin size={14} color={C.muted} />
          <PText v="small" numberOfLines={1} style={{ flex: 1 }}>{a.place}</PText>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: S.md }}>
        <Figure label="Inscritos" value={a.registered} />
        <Figure label="Plazas libres" value={Math.max(0, free)} />
        <Figure label="Ya la han visto" value={(a.reachOutside ?? 0).toLocaleString("es-ES")} />
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <PText v="tiny">Ocupación</PText>
          <PText v="tiny">{`${pct(a.registered, a.capacity)} %`}</PText>
        </View>
        <Meter value={a.registered} max={a.capacity} tone={free <= 3 ? "warning" : "violet"} />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        <PButton small label="Abrir check-in" icon={QrCode} onPress={() => go("actividades", { a: a.id })} />
        <PButton small label="Avisar a los socios" icon={Megaphone} variant="outline" onPress={() => go("avisos")} />
      </View>
    </View>
  );
}

/** Lo que Franky le da a la asociación: alcance, socios nuevos y comisiones que no pagas. */
function FrankyCard() {
  const { data, now } = usePro();
  const today = localDate(now);
  const members = data.communityMembers as CommunityMember[];
  const activities = data.activities as CommunityActivity[];
  const cash = communityCash(data);
  const reach = activities.filter((a) => a.status !== "draft").reduce((acc, a) => acc + (a.reachOutside ?? 0), 0);
  const newViaFranky = members.filter((m) => m.viaFranky && localDate(m.joinedAt) >= addDays(today, -30)).length;
  const verified = members.filter((m) => m.verified !== false).length;
  const line = { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" };

  return (
    <DarkBlock>
      <DarkText v="label" dim>Lo que Franky te da</DarkText>
      <DarkText v="display">{reach.toLocaleString("es-ES")}</DarkText>
      <DarkText v="small" dim>estudiantes que no te seguían vieron tus actividades este curso</DarkText>
      <View style={{ flexDirection: "row", gap: S.md, marginTop: S.sm, paddingTop: S.md, ...line }}>
        <View style={{ flex: 1, gap: 2 }}>
          <DarkText v="h2">{String(newViaFranky)}</DarkText>
          <DarkText v="small" dim>socios nuevos llegados por Franky en 30 días</DarkText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <DarkText v="h2">{money(cash.savedCents, { round: true })}</DarkText>
          <DarkText v="small" dim>menos en comisiones que con el 6 % de Eventbrite</DarkText>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: S.sm }}>
        <BadgeCheck size={14} color="#A78BFA" style={{ marginTop: 2 }} />
        <DarkText v="small" dim style={{ flex: 1 }}>{`${verified} de tus socios tienen la cuenta universitaria verificada.`}</DarkText>
      </View>
      <View style={{ paddingTop: S.md, marginTop: S.xs, ...line }}>
        <DarkText v="small" dim>Y las cuotas de socio, que Eventbrite ni siquiera cobra, entran por el mismo sitio y sin Excel.</DarkText>
      </View>
    </DarkBlock>
  );
}
