import React from "react";
import { Text, View } from "react-native";
import { ArrowRight, BadgeCheck, CalendarCheck2, CheckCheck, Repeat, Sparkles, UserCheck, Users, Wallet } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProClassSession } from "../../../../../shared/pro/types";
import { addDays, dayLabel, greeting, localDate, money, pct, plural, time } from "../../../../../shared/pro/format";
import {
  classCopy,
  freeSpots,
  isRoomMode,
  isTrial,
  recurringCents,
  sessionRoster,
  sessionState,
  sessionsOn,
  shortUni,
  weekStart,
} from "../../../../../shared/pro/classes";
import { usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import { Empty, Kpi, KpiRow, ListRow, LiveDot, Meter, PAvatar, PButton, PageHeader, Panel, Pill, PText, Tip, tone as toneOf } from "../../kit";
import { SetupChecklist } from "../common/checklist";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { ClassesFrankyCard, SessionDrawer, capitalize, fillTone, isFromFranky } from "./parts";
import { LinkText } from "./ui";
import { CareList, OwedCharges } from "./care";
import {
  BirthdaysPanel,
  ContinuityPanel,
  LeadsTodayPanel,
  MaterialPanel,
  ReinforcementPanel,
  ReviewAskPanel,
  TomorrowRemindersPanel,
} from "./today";
import {
  atRiskMembers,
  chargeSummary,
  extrasOf,
  isLate,
  monthOf,
  wasContactedRecently,
} from "../../../../../shared/pro/classes-care";

export default function ClassesHoy() {
  const { data, now, vertical, demo } = usePro();
  const go = useGoSection();
  const copy = classCopy(vertical.id);
  const today = localDate(now);
  const [open, setOpen] = React.useState<string | null>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  const todays = sessionsOn(data, today);
  const live = todays.find((s) => sessionState(s, now) === "live");
  const next = todays.find((s) => sessionState(s, now) === "next");
  const focus = live ?? next;
  const started = todays.filter((s) => sessionState(s, now) !== "next");
  const attended = started.some((s) => s.checkedIn === null) ? null : started.reduce((a, s) => a + (s.checkedIn ?? 0), 0);
  const expected = started.reduce((a, s) => a + s.booked, 0);
  const bookedToday = todays.reduce((a, s) => a + s.booked, 0);
  const waitingToday = todays.reduce((a, s) => a + s.waitlist, 0);

  const monday = weekStart(today);
  const week = data.sessions.filter((s) => s.status !== "cancelled" && localDate(s.start) >= monday && localDate(s.start) < addDays(monday, 7));
  const weekPct = pct(
    week.reduce((a, s) => a + s.booked, 0),
    week.reduce((a, s) => a + s.capacity, 0),
  );

  const active = data.members.filter((m) => m.status === "active" || m.status === "overdue");
  const monthStart = `${today.slice(0, 8)}01`;
  const newThisMonth = data.members.filter((m) => localDate(m.since) >= monthStart && m.status !== "cancelled").length;
  const overdue = data.members.filter((m) => m.status === "overdue");
  const trialsToday = todays.flatMap((s) => sessionRoster(data, s, now).booked.filter(isTrial).map((b) => ({ b, s })));
  const newGroups = data.groupRequests.filter((g) => g.status === "new");
  const mrr = recurringCents(data);
  const hasMembers = data.members.length > 0;
  const weekRevenue = data.history.at(-1)?.revenueCents ?? 0;
  const horarioLabel = vertical.nav.find((n) => n.id === "horario")?.label ?? "Horario";

  // Estado del centro en una frase: cuotas y socios en riesgo, solo si los hay.
  const risks = atRiskMembers(data, now).filter((r) => !wasContactedRecently(r, now));
  const monthCharges = chargeSummary(data, monthOf(today), now);
  const owedCount = extrasOf(data).charges.filter(
    (c) => c.period === monthOf(today) && (c.status === "returned" || isLate(c, today)),
  ).length;
  const owedCents = monthCharges.returnedCents + monthCharges.lateCents;
  const care = [
    owedCount ? `${money(owedCents, { round: true })} de cuotas por cobrar` : "",
    risks.length ? plural(risks.length, `${copy.member} que se te puede ir`, `${copy.members} que se te pueden ir`) : "",
  ].filter(Boolean);

  const agenda = todays.length
    ? `Hoy tienes ${plural(todays.length, copy.sessionOne, copy.sessionMany)} con ${bookedToday} ${copy.groups ? "personas" : "reservas"}${waitingToday ? `, ${waitingToday} en lista de espera` : ""}${trialsToday.length ? ` y ${plural(trialsToday.length, trialsLabel(vertical.id, false), trialsLabel(vertical.id, true))}` : ""}.`
    : `Hoy no hay ${copy.sessionMany}. Aprovecha para preparar la semana.`;
  const summary = hasMembers && care.length ? `${agenda} Tienes ${care.join(" y ")}.` : agenda;

  return (
    <ProPage>
      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={data.space.owner.firstName ? `${greeting(now)}, ${data.space.owner.firstName}` : `Hoy en ${data.space.name}`}
        description={summary}
        actions={
          focus ? <PButton label={`Pasar lista${live ? "" : ` de las ${time(focus.start)}`}`} icon={CheckCheck} onPress={() => setOpen(focus.id)} /> : undefined
        }
      />

      <SetupChecklist />

      <KpiRow>
        <Kpi
          icon={UserCheck}
          label="Asistencia hoy"
          value={attended === null ? "No disponible" : expected ? `${pct(attended, expected)} %` : "Sin empezar"}
          hint={attended === null ? "Asistencia no visible con este acceso" : expected ? `${attended} de ${expected} han venido` : `${bookedToday} reservas para hoy`}
        />
        <Kpi icon={CalendarCheck2} label="Ocupación de la semana" value={`${weekPct} %`} hint={`${week.length} ${copy.sessionMany}`} />
        {demo && hasMembers ? (
          <Kpi
            icon={Users}
            label={`${copy.Members} activos`}
            value={active.length}
            hint={newThisMonth ? `+${newThisMonth} este mes` : "sin altas este mes"}
            onPress={() => go("socios")}
          />
        ) : null}
        {demo && hasMembers ? (
          <Kpi
            icon={Wallet}
            label="Recurrente al mes"
            value={money(mrr, { round: true })}
            hint={overdue.length ? `${overdue.length} cuotas por cobrar` : "todas cobradas"}
            emphasis={overdue.length > 0}
          />
        ) : null}
        {demo && !hasMembers ? (
          <Kpi icon={Users} label="Grupos por responder" value={newGroups.length} hint="asociaciones, Erasmus y cumpleaños" emphasis={newGroups.length > 0} />
        ) : null}
        {demo && !hasMembers ? <Kpi icon={Wallet} label="Facturado esta semana" value={money(weekRevenue, { round: true })} hint="salas, talleres y grupos" /> : null}
      </KpiRow>

      {focus ? <FocusCard session={focus} live={Boolean(live)} onOpen={() => setOpen(focus.id)} /> : null}

      <Panel
        title={`${capitalize(copy.sessionMany)} de hoy`}
        description={
          todays.length
            ? `${todays.filter((s) => sessionState(s, now) === "past").length} terminadas, ${todays.filter((s) => sessionState(s, now) === "next").length} por delante.`
            : undefined
        }
        action={<LinkText label={horarioLabel} icon={ArrowRight} onPress={() => go("horario")} />}
        flush
      >
        {todays.length ? (
          todays.map((s, i) => <TimelineRow key={s.id} session={s} last={i === todays.length - 1} onOpen={() => setOpen(s.id)} />)
        ) : (
          <Empty
            icon={CalendarCheck2}
            title={`Hoy no hay ${copy.sessionMany}`}
            body={`Crea tus ${copy.sessionMany} en ${horarioLabel} y tus ${copy.members} las reservarán desde Franky.`}
            action={<PButton label="Ir al horario" variant="outline" onPress={() => go("horario")} />}
          />
        )}
      </Panel>

      {hasMembers ? <CareList /> : null}

      {vertical.id === "academy" ? <ReinforcementPanel /> : null}
      {vertical.id === "academy" ? <ContinuityPanel /> : null}
      {vertical.id === "culture" ? <TomorrowRemindersPanel /> : null}
      {vertical.id === "culture" ? <ReviewAskPanel /> : null}
      {vertical.id === "culture" ? <BirthdaysPanel /> : null}
      {vertical.id === "culture" ? <MaterialPanel /> : null}
      {vertical.id !== "culture" ? <LeadsTodayPanel /> : null}

      {demo && hasMembers ? <OwedCharges /> : null}

      {demo && !hasMembers ? (
        <Panel title="Grupos que quieren venir" description="Asociaciones, Erasmus y cumpleaños que te han pedido presupuesto." flush>
          {newGroups.length ? (
            newGroups.map((g, i) => (
              <ListRow
                key={g.id}
                last={i === newGroups.length - 1}
                accessibilityLabel={`${g.organization}, ${g.people} personas`}
                onPress={() => go(vertical.nav.some((n) => n.id === "grupos") ? "grupos" : "estudiantes")}
              >
                <PAvatar name={g.organization} size={32} toneKey="violet" />
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>{g.organization}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${g.kind} · ${g.people} personas · ${dayLabel(g.date, { weekday: false })}`}</PText>
                </View>
                <Pill label="Nueva" tone="violet" />
              </ListRow>
            ))
          ) : (
            <Empty icon={Users} title="Sin peticiones nuevas" body="Cuando una asociación o un grupo te pida presupuesto, aparecerá aquí." />
          )}
        </Panel>
      ) : null}

      {demo || data.classOperations?.rosterVisible ? (
        <Panel
          title={vertical.id === "culture" ? "Primeras visitas de hoy" : "Clases de prueba de hoy"}
          description={trialsToday.length ? "Llegan sin conocerte: el trato de hoy decide si se quedan." : undefined}
          flush
        >
          {trialsToday.length ? (
            trialsToday.map(({ b, s }, i) => {
              const ct = data.classTypes.find((c) => c.id === s.classTypeId);
              const client = data.clients.find((c) => c.id === b.clientId);
              return (
                <ListRow key={b.id} last={i === trialsToday.length - 1} accessibilityLabel={`${b.clientName}, ${ct?.name ?? ""} a las ${time(s.start)}`} onPress={() => setOpen(s.id)}>
                  <PAvatar name={b.clientName} size={32} toneKey="violet" />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{b.clientName}</PText>
                      {client?.student?.verified ? <BadgeCheck size={14} color={C.blue} accessibilityLabel="Estudiante verificado" /> : null}
                    </View>
                    <PText v="tiny" numberOfLines={1}>
                      {`${ct?.name ?? ""} a las ${time(s.start)}${client?.student ? ` · ${shortUni(client.student.university)}` : ""}`}
                    </PText>
                  </View>
                  {b.status === "arrived" ? (
                    <Pill label="Ha venido" tone="success" />
                  ) : isFromFranky(b.source) ? (
                    <Pill label="Franky" tone="violet" icon={Sparkles} />
                  ) : null}
                </ListRow>
              );
            })
          ) : (
            <Empty
              icon={Sparkles}
              title="Hoy no hay pruebas"
              body={
                demo
                  ? vertical.id === "culture"
                    ? "Las primeras visitas llegan desde tu ficha de Franky."
                    : "La clase de prueba para quien llega a la ciudad trae unas 10 personas al mes a un centro como el tuyo."
                  : "Las reservas marcadas como prueba aparecerán aquí."
              }
            />
          )}
        </Panel>
      ) : null}

      {demo ? <ClassesFrankyCard /> : null}

      {demo ? (
        <Tip title={vertical.id === "academy" ? "Tu mejor momento" : "Horas valle"}>
          {vertical.id === "academy"
            ? "Las tres semanas antes de los exámenes de enero y junio llenan los intensivos. Prográmalos ya en Estudiantes y Franky los enseña a quien tiene esa asignatura."
            : vertical.id === "culture"
              ? "Las sesiones de 16:00 entre semana son las que más cuesta llenar. Un precio de estudiante solo en esa franja no rebaja tus sábados."
              : "Las clases de 10 a 14 h van a media ocupación. La tarifa universitaria solo en esa franja llena huecos sin bajar la cuota de la tarde."}
        </Tip>
      ) : null}

      <SessionDrawer sessionId={open} onClose={() => setOpen(null)} onOffer={setOffer} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </ProPage>
  );
}

function trialsLabel(v: string, many: boolean) {
  if (v === "culture") return many ? "primeras visitas" : "primera visita";
  return many ? "clases de prueba" : "clase de prueba";
}

/** La clase en curso (o la siguiente), bien grande para pasar lista en un toque. */
function FocusCard({ session: s, live, onOpen }: { session: ProClassSession; live: boolean; onOpen: () => void }) {
  const { data, now, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const ct = data.classTypes.find((c) => c.id === s.classTypeId);
  const coach = data.staff.find((x) => x.id === s.coachId);
  const t = toneOf(ct?.tone);
  const { booked } = sessionRoster(data, s, now);
  const minutesLeft = Math.round((new Date(live ? s.end : s.start).getTime() - now.getTime()) / 60000);
  const perGroup = isRoomMode(data, ct);

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: t.block, padding: S.lg, marginBottom: S.lg, gap: S.sm, ...SHADOW.card }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
        {live ? <LiveDot /> : null}
        <Text style={{ fontFamily: FONT.semibold, fontSize: 11.5, letterSpacing: 1, textTransform: "uppercase", color: t.strong, flexShrink: 1 }} maxFontSizeMultiplier={1.3}>
          {live ? `En curso, quedan ${minutesLeft} min` : `Siguiente, empieza ${minutesLeft < 60 ? `en ${minutesLeft} min` : `a las ${time(s.start)}`}`}
        </Text>
      </View>
      <Text style={{ fontFamily: FONT.display, fontSize: 24, letterSpacing: -0.5, color: C.text }} maxFontSizeMultiplier={1.3}>
        {ct?.name}
      </Text>
      <PText v="small">
        {`${time(s.start)} a ${time(s.end)} · ${s.room} · ${coach?.name ?? ""}${vertical.id === "academy" && ct ? ` · ${ct.category}` : ""}`}
      </PText>
      <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: S.md, marginTop: S.sm }}>
        <Text style={{ fontFamily: FONT.display, fontSize: 30, color: C.text }} maxFontSizeMultiplier={1.2}>
          {live ? s.checkedIn ?? "No disponible" : s.booked}
          <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.muted }}>{`/${live ? s.booked : s.capacity}`}</Text>
        </Text>
        <PText v="small" style={{ flexShrink: 1 }}>
          {`${live ? "han llegado" : perGroup ? "personas en la sala" : "plazas reservadas"}${s.waitlist ? ` · ${s.waitlist} en espera` : ""}${!live && freeSpots(s) && !perGroup ? ` · ${freeSpots(s)} libres` : ""}`}
        </PText>
      </View>
      {!live || s.checkedIn !== null ? (
        <Meter value={live ? s.checkedIn ?? 0 : s.booked} max={live ? Math.max(1, s.booked) : s.capacity} tone={live ? "success" : "violet"} />
      ) : null}
      <View style={{ flexDirection: "row", marginTop: S.sm }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {booked.slice(0, 9).map((b, i) => (
          <View key={b.id} style={{ marginLeft: i ? -8 : 0, borderRadius: 18, borderWidth: 2, borderColor: C.bg }}>
            <PAvatar name={b.clientName} size={32} toneKey={b.status === "arrived" ? "emerald" : "slate"} />
          </View>
        ))}
        {booked.length > 9 ? (
          <View style={{ marginLeft: -8, width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: C.bg, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 11, color: C.text }} maxFontSizeMultiplier={1.1}>{`+${booked.length - 9}`}</Text>
          </View>
        ) : null}
      </View>
      <PButton label="Pasar lista" icon={CheckCheck} onPress={onOpen} full style={{ marginTop: S.sm }} />
    </View>
  );
}

function TimelineRow({ session: s, last, onOpen }: { session: ProClassSession; last: boolean; onOpen: () => void }) {
  const { data, now, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const ct = data.classTypes.find((c) => c.id === s.classTypeId);
  const coach = data.staff.find((x) => x.id === s.coachId);
  const state = sessionState(s, now);
  const t = toneOf(ct?.tone);
  const perGroup = isRoomMode(data, ct);
  const trials = sessionRoster(data, s, now).booked.filter(isTrial).length;
  const fill = fillTone(s);

  return (
    <Tap
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${ct?.name ?? ""}, ${time(s.start)} a ${time(s.end)}, ${s.booked} de ${s.capacity} plazas`}
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        gap: S.md,
        paddingHorizontal: S.lg,
        paddingVertical: S.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.borderLight,
        opacity: state === "past" ? 0.6 : 1,
        backgroundColor: state === "live" ? C.accentSoft : "transparent",
      }}
    >
      <View style={{ width: 48, paddingTop: 1 }}>
        <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.2}>{time(s.start)}</Text>
        <Text style={{ fontSize: 12, color: C.muted }} maxFontSizeMultiplier={1.2}>{time(s.end)}</Text>
      </View>
      <View style={{ width: 4, borderRadius: 2, backgroundColor: t.bar }} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{ct?.name}</PText>
          {state === "live" ? <Pill label="Ahora" tone="success" /> : null}
          {s.booked >= s.capacity && !perGroup ? <Pill label="Completa" tone="danger" /> : null}
          {trials ? <Pill label={plural(trials, "prueba", "pruebas")} tone="violet" /> : null}
        </View>
        <PText v="tiny" numberOfLines={1}>
          {`${vertical.id === "academy" ? `${ct?.category} · ` : ""}${coach?.name.split(" ")[0] ?? ""} · ${s.room}`}
        </PText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: 4 }}>
          {state === "next" || s.checkedIn !== null ? (
            <View style={{ flex: 1, maxWidth: 220 }}>
              <Meter
                value={state === "next" ? s.booked : s.checkedIn ?? 0}
                max={state === "next" ? s.capacity : Math.max(1, s.booked)}
                tone={state === "next" ? (fill === "danger" ? "danger" : fill === "warning" ? "warning" : "violet") : "success"}
              />
            </View>
          ) : null}
          <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.text }} maxFontSizeMultiplier={1.2}>
            {perGroup
              ? s.booked
                ? `Grupo de ${s.booked}`
                : "Sala libre"
              : state === "next"
                ? `${s.booked}/${s.capacity}`
                : s.checkedIn === null
                  ? "Asistencia no disponible"
                  : `${s.checkedIn} de ${s.booked} vinieron`}
          </Text>
          {s.waitlist ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Repeat size={12} color={C.errorText} />
              <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.errorText }} maxFontSizeMultiplier={1.2}>{s.waitlist}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Tap>
  );
}
