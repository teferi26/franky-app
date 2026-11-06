import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  ClipboardList,
  Copy,
  EyeOff,
  Flag,
  GraduationCap,
  Home,
  Megaphone,
  MessageCircleQuestion,
  Plus,
  RefreshCcw,
  Sprout,
  Stamp,
  TriangleAlert,
  Users,
} from "lucide-react-native";
import { C, FONT, R, S } from "@/theme";
import type { ProUniMetric } from "../../../../../shared/pro/types";
import { dayLabel, greeting, localDate, minutesToLabel, pct, relative } from "../../../../../shared/pro/format";
import {
  FIRST_YEAR_ALERT_SHARE,
  PRIVACY_MIN_GROUP,
  caseState,
  creditEligible,
  firstYearAlerts,
  octoberCheckpoint,
  publicationForDeadline,
  sortModerationQueue,
  uniExtrasOf,
  upcomingDeadlines,
} from "../../../../../shared/pro/university";
import type { UniAssociation, UniHousing, UniModeration, UniPublication, UniWelcomeStop } from "../../../../../shared/pro/university-types";
import { suspectedCopies } from "../../../../../shared/pro/university-listings";
import { mentorsOf } from "../../../../../shared/pro/university-mentors";
import { dayAgenda, daySummary, officeOf } from "../../../../../shared/pro/university-office";
import { renewalSummary } from "../../../../../shared/pro/university-renewal";
import { faqsOf, uncoveredTopics } from "../../../../../shared/pro/university-faq";
import { usePro } from "../../store";
import { ProPage, sectionHref, useGoSection } from "../../shell";
import { DarkBlock, DarkText, Kpi, KpiRow, ListRow, Meter, PButton, PText, PageHeader, Panel, Pill, Tip } from "../../kit";
import { SetupChecklist } from "../common/checklist";
import { OfficialBadge, PanelLink, UrgentBanner } from "./ui";

function metricValue(m: ProUniMetric) {
  return m.unit === "%" ? `${m.value} %` : m.value.toLocaleString("es-ES");
}

function Delta({ m }: { m: ProUniMetric }) {
  if (m.delta === undefined) return null;
  const up = m.delta >= 0;
  const label = m.unit === "%" ? `${up ? "+" : ""}${m.delta} pts` : `${up ? "+" : ""}${m.delta.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
  const color = up ? C.success : C.errorText;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Icon size={14} color={color} />
      <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color }} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

function daysUntil(date: string, now: Date): number {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${localDate(now)}T12:00:00Z`)) / 86_400_000);
}

const shortMonth = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" }).replace(".", "");

/** Una fila de "Te esperan": icono, qué pasa, detalle y la pastilla de la acción. */
type Waiting = {
  key: string;
  icon: typeof Flag;
  title: string;
  detail: string;
  pill: string;
  tone: "danger" | "warning" | "info" | "violet" | "neutral";
  onPress: () => void;
};

export default function UniversityHoy() {
  const { data, now, spaceId } = usePro();
  const go = useGoSection();
  const router = useRouter();
  const extras = uniExtrasOf(data);
  const metric = (key: string) => data.uniMetrics.find((m) => m.key === key);
  const active = metric("active");
  const welcome = metric("welcome");

  const housing = data.uniHousing as UniHousing[];
  const pendingHousing = housing.filter((h) => h.status === "pending");
  const overdueCases = housing.filter((h) => h.case && caseState(h.case, now) === "overdue");
  const pendingReports = sortModerationQueue((data.uniModeration as UniModeration[]).filter((m) => m.status === "pending"));
  const associations = data.uniAssociations as UniAssociation[];
  const withEcts = associations.filter((a) => a.ectsRequests > 0);
  const ectsTotal = withEcts.reduce((a, x) => a + x.ectsRequests, 0);
  const eligibleCredits = extras.credits.filter((r) => r.status === "pending" && creditEligible(r)).length;
  const registrations = associations.filter((a) => a.pendingRegistration && !a.registered);
  const pubs = data.uniPublications as UniPublication[];
  const published = pubs.filter((p) => p.status === "published");
  const top = [...published].sort((a, b) => b.reach - a.reach)[0];
  const stops = data.uniWelcome as UniWelcomeStop[];
  const nextStop = stops.filter((s) => s.date >= now.toISOString()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const checkins = stops.reduce((a, s) => a + s.checkins, 0);
  const alerts = firstYearAlerts(extras.faculties);
  const deadlines = upcomingDeadlines(extras.deadlines, now, 30);
  const unprepared = deadlines.filter((d) => daysUntil(d.date, now) <= 10 && !publicationForDeadline(pubs, d.id));
  const copies = suspectedCopies(housing);
  const mentorWaiting = mentorsOf(data).requests.filter((r) => r.status === "waiting");
  // La renovación de asociaciones solo se recuerda en septiembre y octubre.
  const month = Number(localDate(now).slice(5, 7));
  const renewals = renewalSummary(associations, now);
  const renewalDue = month === 9 || month === 10 ? renewals.missing : [];
  const office = officeOf(data);
  const officeToday = daySummary(dayAgenda(office, localDate(now), now));
  const unanswered = uncoveredTopics(office.appointments, faqsOf(data), now);

  const summary = [
    active ? `${active.value.toLocaleString("es-ES")} estudiantes del campus activos en Franky este mes.` : null,
    pendingHousing.length || pendingReports.length
      ? `Te esperan ${pendingHousing.length} pisos por verificar y ${pendingReports.length} reportes.`
      : "No hay nada pendiente de revisar.",
  ]
    .filter(Boolean)
    .join(" ");

  // En la web es un enlace con ?nueva=1: abre directamente el formulario.
  const publish = (query = "") => router.replace(`${sectionHref(spaceId, "publicaciones")}?nueva=1${query}` as never);
  const openPublication = (id: string) => router.replace(`${sectionHref(spaceId, "publicaciones")}?ver=${id}` as never);

  const waiting: Waiting[] = [
    ...(pendingReports.length
      ? [{
          key: "reports",
          icon: Flag,
          title: `${pendingReports.length} contenidos reportados en tu campus`,
          detail: `Arriba del todo: ${pendingReports[0].reason.toLowerCase()} (${pendingReports[0].reports} reportes)`,
          pill: "Revisar",
          tone: "danger" as const,
          onPress: () => go("moderacion"),
        }]
      : []),
    ...(copies.length
      ? [{
          key: "copies",
          icon: Copy,
          title: copies.length === 1 ? "1 anuncio se parece al de otro propietario" : `${copies.length} anuncios se parecen a los de otros propietarios`,
          detail: copies.map((h) => `${h.owner}, ${h.title}`).join(" · "),
          pill: "Posible copia",
          tone: "danger" as const,
          onPress: () => go("alojamiento"),
        }]
      : []),
    ...(overdueCases.length
      ? [{
          key: "cases",
          icon: TriangleAlert,
          title: overdueCases.length === 1 ? "1 propietario no ha respondido a tiempo" : `${overdueCases.length} propietarios no han respondido a tiempo`,
          detail: overdueCases.map((h) => `${h.owner}, ${h.title}`).join(" · "),
          pill: "Plazo vencido",
          tone: "danger" as const,
          onPress: () => go("alojamiento"),
        }]
      : []),
    ...(pendingHousing.length
      ? [{
          key: "housing",
          icon: Home,
          title: `${pendingHousing.length} pisos esperan verificación`,
          detail: "Hasta que los verifiques no los ve nadie que llegue al campus",
          pill: String(pendingHousing.length),
          tone: "warning" as const,
          onPress: () => go("alojamiento"),
        }]
      : []),
    ...unprepared.map((d) => ({
      key: `deadline-${d.id}`,
      icon: CalendarClock,
      title: d.title,
      detail: `${relative(`${d.date}T10:00:00Z`, now.getTime())} y aún no hay aviso preparado`,
      pill: "Preparar aviso",
      tone: "info" as const,
      onPress: () => publish(`&plazo=${d.id}`),
    })),
    ...(withEcts.length
      ? [{
          key: "ects",
          icon: Stamp,
          title: `${ectsTotal} solicitudes de créditos de ${withEcts.length} asociaciones`,
          detail: eligibleCredits ? `${eligibleCredits} cumplen la asistencia y se validan de una vez` : "Con asistencia verificada por check-in",
          pill: "Validar",
          tone: "info" as const,
          onPress: () => go("asociaciones"),
        }]
      : []),
    ...(mentorWaiting.length
      ? [{
          key: "mentors",
          icon: Sprout,
          title: mentorWaiting.length === 1 ? "1 persona de primero espera mentor" : `${mentorWaiting.length} personas de primero esperan mentor`,
          detail: [...new Set(mentorWaiting.map((r) => r.faculty))].join(", "),
          pill: "Emparejar",
          tone: "info" as const,
          onPress: () => go("mentores"),
        }]
      : []),
    ...(unanswered.length
      ? [{
          key: "faq",
          icon: MessageCircleQuestion,
          title: unanswered.length === 1 ? "1 tema de la cita previa sin respuesta escrita" : `${unanswered.length} temas de la cita previa sin respuesta escrita`,
          detail: `El que más se repite: ${unanswered[0].topic.toLowerCase()} (${unanswered[0].count} citas)`,
          pill: "Responder",
          tone: "neutral" as const,
          onPress: () => go("preguntas"),
        }]
      : []),
    ...(renewalDue.length
      ? [{
          key: "renewal",
          icon: RefreshCcw,
          title: renewalDue.length === 1 ? "1 asociación sin renovar este curso" : `${renewalDue.length} asociaciones sin renovar este curso`,
          detail: `${renewals.done} de ${renewals.total} ya han confirmado junta y socios`,
          pill: "Renovación",
          tone: "neutral" as const,
          onPress: () => go("asociaciones"),
        }]
      : []),
    ...(registrations.length
      ? [{
          key: "registrations",
          icon: Building2,
          title: `${registrations.length} asociaciones piden entrar en el registro`,
          detail: registrations.map((r) => r.name).join(", "),
          pill: "Nuevas",
          tone: "violet" as const,
          onPress: () => go("asociaciones"),
        }]
      : []),
  ];

  return (
    <ProPage>
      <UrgentBanner />

      <PageHeader
        eyebrow={dayLabel(now.toISOString())}
        title={`${greeting(now)}, ${data.space.owner.firstName}`}
        description={summary}
        actions={<PButton label="Nueva publicación" icon={Plus} onPress={() => publish()} />}
      />

      <SetupChecklist />

      <KpiRow>
        <Kpi icon={Users} label="Activos en Franky" value={active ? metricValue(active) : "0"} hint={active?.hint} />
        <Kpi icon={GraduationCap} label="Primero en la bienvenida" value={welcome ? metricValue(welcome) : "0 %"} hint="Han ido a alguna actividad" emphasis />
        <Kpi
          icon={Home}
          label="Pisos por verificar"
          value={pendingHousing.length}
          hint={overdueCases.length ? `${overdueCases.length} casos fuera de plazo` : "Sin casos fuera de plazo"}
          onPress={() => go("alojamiento")}
        />
        <Kpi icon={Flag} label="Reportes pendientes" value={pendingReports.length} hint="Lo grave, arriba" onPress={() => go("moderacion")} />
      </KpiRow>

      <Panel title="Te esperan" description="Lo que necesita una decisión de tu equipo." flush>
        {waiting.length ? (
          waiting.map((w, i) => {
            const Icon = w.icon;
            return (
              <ListRow key={w.key} onPress={w.onPress} accessibilityLabel={w.title} last={i === waiting.length - 1}>
                <Icon size={16} color={C.muted} strokeWidth={1.9} />
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3">{w.title}</PText>
                  <PText v="tiny" numberOfLines={1}>{w.detail}</PText>
                </View>
                <Pill tone={w.tone} label={w.pill} />
              </ListRow>
            );
          })
        ) : (
          <PText v="small" style={{ paddingHorizontal: S.lg, paddingVertical: S.lg }}>
            Todo revisado. Buen momento para preparar la próxima publicación.
          </PText>
        )}
      </Panel>

      {extras.faculties.length ? (
        <Panel
          title="Alerta temprana de primero"
          description={`Facultades donde el ${FIRST_YEAR_ALERT_SHARE} % o más de primero no ha ido a ninguna actividad. Corte de revisión: ${dayLabel(
            `${octoberCheckpoint(extras.courseStart || localDate(now))}T12:00:00Z`,
            { weekday: false },
          )}.`}
          flush
        >
          {alerts.length ? (
            alerts.map((f, i) => (
              <ListRow
                key={f.faculty}
                onPress={() => publish(`&publico=welcome_absent&facultad=${encodeURIComponent(f.faculty)}`)}
                accessibilityLabel={`Escribir a primero de ${f.faculty}`}
                last={i === alerts.length - 1}
              >
                <TriangleAlert size={16} color={C.warning} strokeWidth={1.9} />
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3">{`${f.faculty}: ${f.inactivePct} % sin actividad`}</PText>
                  <PText v="tiny" numberOfLines={2}>
                    {`${f.inactive.toLocaleString("es-ES")} de ${f.firstYear.toLocaleString("es-ES")} estudiantes de primero. Escríbeles antes de que se desenganchen.`}
                  </PText>
                </View>
                <Pill tone="warning" label="Escribirles" />
              </ListRow>
            ))
          ) : (
            <PText v="small" style={{ padding: S.lg }}>Ninguna facultad por encima del umbral. Buen trabajo con la bienvenida.</PText>
          )}
        </Panel>
      ) : null}

      {deadlines.length ? (
        <Panel title="Próximos plazos" action={<PanelLink label="Calendario" onPress={() => go("calendario")} />} flush>
          {deadlines.slice(0, 4).map((d, i, list) => {
            const pub = publicationForDeadline(pubs, d.id);
            return (
              <ListRow
                key={d.id}
                onPress={() => (pub ? openPublication(pub.id) : publish(`&plazo=${d.id}`))}
                accessibilityLabel={d.title}
                last={i === list.length - 1}
              >
                <View style={{ width: 44, alignItems: "center" }}>
                  <Text style={{ fontFamily: FONT.display, fontSize: 20, color: C.text }} maxFontSizeMultiplier={1.2}>{Number(d.date.slice(8, 10))}</Text>
                  <PText v="tiny">{shortMonth(d.date).toUpperCase()}</PText>
                </View>
                <PText v="h3" numberOfLines={2} style={{ flex: 1 }}>{d.title}</PText>
                {pub ? <Pill tone="success" label="Aviso listo" /> : <Pill tone="info" label="Preparar" />}
              </ListRow>
            );
          })}
        </Panel>
      ) : null}

      {office.slots.length && officeToday.capacity ? (
        <Panel title="Atención hoy" action={<PanelLink label="Agenda" onPress={() => go("atencion")} />}>
          <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.8, color: C.text }} maxFontSizeMultiplier={1.2}>
            {officeToday.booked}
          </Text>
          <PText v="small">
            {`citas pendientes y ${officeToday.free} huecos libres${officeToday.next ? `. La siguiente, a las ${minutesToLabel(officeToday.next.start)}` : ""}`}
          </PText>
        </Panel>
      ) : null}

      <Panel title="El campus este mes" description="Cifras agregadas y comparadas con el mes anterior.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: S.lg }}>
          {data.uniMetrics.map((m) => (
            <View key={m.key} style={{ width: "50%", paddingRight: S.md, gap: 2 }}>
              <PText v="tiny" numberOfLines={1}>{m.label}</PText>
              <Text style={{ fontFamily: FONT.display, fontSize: 24, letterSpacing: -0.5, color: C.text }} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
                {metricValue(m)}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.sm }}>
                <Delta m={m} />
                {m.hint ? <PText v="tiny" numberOfLines={1}>{m.hint}</PText> : null}
              </View>
            </View>
          ))}
        </View>
      </Panel>

      {extras.faculties.length ? (
        <Panel title="Embudo de integración de primero" description="Por facultad: bienvenida, asociación y activos a 30 días." flush>
          {extras.faculties.map((f, i) => {
            const hidden = f.firstYear < PRIVACY_MIN_GROUP;
            const last = i === extras.faculties.length - 1;
            const steps: [string, number][] = [
              ["Bienvenida", f.participated],
              ["Asociación", f.joinedAssociation],
              ["Activos 30 días", f.active30],
            ];
            return (
              <View key={f.faculty} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: 6, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.borderLight }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
                  <PText v="h3" style={{ flex: 1 }}>{f.faculty}</PText>
                  {!hidden ? <PText v="small">{`${f.firstYear.toLocaleString("es-ES")} en primero`}</PText> : null}
                </View>
                {hidden ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <EyeOff size={14} color={C.muted} />
                    <PText v="tiny">{`Grupo de menos de ${PRIVACY_MIN_GROUP} personas, oculto`}</PText>
                  </View>
                ) : (
                  steps.map(([label, value], s) => {
                    const p = pct(value, f.firstYear);
                    return (
                      <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                        <PText v="tiny" style={{ width: 96 }}>{label}</PText>
                        <View style={{ flex: 1 }}>
                          <Meter value={value} max={f.firstYear} tone={s === 0 && p < 100 - FIRST_YEAR_ALERT_SHARE ? "warning" : "violet"} />
                        </View>
                        <Text style={{ minWidth: 44, textAlign: "right", fontFamily: FONT.semibold, fontSize: 13, color: C.text }} maxFontSizeMultiplier={1.3}>
                          {`${p} %`}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            );
          })}
        </Panel>
      ) : null}

      {top ? (
        <Panel title="Tu publicación con más alcance" action={<PanelLink label="Todas" onPress={() => go("publicaciones")} />}>
          <OfficialBadge />
          <PText v="h2" style={{ marginTop: S.sm }}>{top.title}</PText>
          <PText v="tiny" style={{ marginTop: 2 }}>{`${top.audience} · ${relative(top.at, now.getTime())}`}</PText>
          <View style={{ flexDirection: "row", gap: S.md, marginTop: S.lg }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONT.display, fontSize: 24, color: C.text }} maxFontSizeMultiplier={1.2}>{top.reach.toLocaleString("es-ES")}</Text>
              <PText v="tiny">estudiantes la vieron</PText>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONT.display, fontSize: 24, color: C.text }} maxFontSizeMultiplier={1.2}>{top.reactions.toLocaleString("es-ES")}</Text>
              <PText v="tiny">reacciones</PText>
            </View>
          </View>
        </Panel>
      ) : null}

      <Panel title="Bienvenida en curso" action={<PanelLink label="Pasaporte" onPress={() => go("bienvenida")} />}>
        <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.8, color: C.text }} maxFontSizeMultiplier={1.2}>{checkins.toLocaleString("es-ES")}</Text>
        <PText v="small">
          {`check-ins en ${stops.length} paradas${extras.passport.completed ? `, ${extras.passport.completed.toLocaleString("es-ES")} pasaportes completos` : ""}`}
        </PText>
        {welcome ? (
          <View style={{ marginTop: S.lg, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <PText v="tiny">Primero que ha participado</PText>
              <PText v="tiny">{`${welcome.value} %`}</PText>
            </View>
            <Meter value={welcome.value} max={100} />
          </View>
        ) : null}
        {nextStop ? (
          <View style={{ marginTop: S.lg, borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.md, paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.4}>
              <Text style={{ fontFamily: FONT.semibold }}>Siguiente:</Text>
              {` ${nextStop.title}, ${relative(nextStop.date, now.getTime())}`}
            </Text>
          </View>
        ) : null}
      </Panel>

      <DarkBlock>
        <DarkText v="label" dim>El canal que sí se lee</DarkText>
        <DarkText v="display">{published.reduce((a, p) => a + p.reach, 0).toLocaleString("es-ES")}</DarkText>
        <DarkText v="small" dim>{`visualizaciones reales de tus ${published.length} publicaciones oficiales`}</DarkText>
        <View style={{ flexDirection: "row", gap: S.md, marginTop: S.sm, paddingTop: S.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" }}>
          <View style={{ flex: 1, gap: 2 }}>
            <DarkText v="h2">{String(housing.filter((h) => h.status === "verified").length)}</DarkText>
            <DarkText v="small" dim>pisos verificados para quien llega</DarkText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <DarkText v="h2">{String(associations.filter((a) => a.registered).length)}</DarkText>
            <DarkText v="small" dim>asociaciones registradas con actividad</DarkText>
          </View>
        </View>
        <DarkText v="small" dim style={{ marginTop: S.xs }}>Medimos quién lo vio de verdad, no cuántos correos salieron.</DarkText>
      </DarkBlock>

      <Panel title="Informe de temporada" description="Alcance, bienvenida, pisos, créditos y convivencia en un documento.">
        <PButton label="Ver el informe" icon={ClipboardList} variant="outline" full onPress={() => go("memoria")} />
      </Panel>

      <Tip title="Privacidad">
        {`Todas las cifras son agregadas. Cualquier grupo de menos de ${PRIVACY_MIN_GROUP} personas se oculta y nunca verás el recorrido de un estudiante concreto.`}
      </Tip>

      <Panel title="Publicar ahora" description="Un aviso oficial llega hoy mismo al campus.">
        <PButton label="Escribir publicación" icon={Megaphone} variant="outline" full onPress={() => publish()} />
      </Panel>
    </ProPage>
  );
}
