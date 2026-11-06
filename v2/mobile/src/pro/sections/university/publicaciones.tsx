import React from "react";
import { Linking, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  BadgeCheck,
  BellRing,
  CheckCheck,
  Eye,
  HeartHandshake,
  Heart,
  Info,
  Languages,
  Megaphone,
  MessageCircle,
  Send,
  Siren,
  Sparkles,
} from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import type { ProUniPublication } from "../../../../../shared/pro/types";
import { addDays, atLocal, dayLabel, localDate, pct, relative, time } from "../../../../../shared/pro/format";
import {
  AUDIENCE_LABEL,
  AUDIENCE_ORDER,
  FACULTY_SCOPED,
  PRIVACY_MIN_GROUP,
  PUBLICATION_TEMPLATES,
  URGENT_DURATION_LABEL,
  URGENT_KIND_LABEL,
  accessibilityHints,
  audienceText,
  endUrgent,
  estimateReach,
  initialReads,
  isUrgentActive,
  readSummary,
  readsByFaculty,
  remindUnread,
  templateForDeadline,
  uniExtrasOf,
  urgentUntil,
  whatsappShareUrl,
  type PublicationTemplate,
  type UrgentDuration,
} from "../../../../../shared/pro/university";
import type { ProUniAudience, ProUniUrgentKind, UniPublication } from "../../../../../shared/pro/university-types";
import { localId, usePro } from "../../store";
import { ProPage, sectionHref } from "../../shell";
import {
  ChoiceGrid,
  Chips,
  DayChips,
  Detail,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  Meter,
  MultiChips,
  PButton,
  PText,
  PageHeader,
  Pill,
  Segmented,
  Sheet,
  Tip,
  TimeStepper,
  Toggle,
} from "../../kit";
import { Card, CardList, EmptyBox, HiddenGroup, OfficialBadge, UrgentBanner, facultyOptions, useUniAction } from "./ui";

type Tab = ProUniPublication["status"];

export const CHANNEL: Record<ProUniPublication["channel"], { label: string; hint: string }> = {
  fomo: { label: "FOMO", hint: "En el muro del campus" },
  aviso: { label: "Aviso", hint: "Notificación a cada estudiante" },
  evento: { label: "Evento", hint: "Con inscripción y recordatorio" },
};

/** Lo que llega por la ruta para abrir el editor ya preparado (igual que en la web). */
type ComposerPreset = {
  template?: string;
  deadlineId?: string;
  audience?: ProUniAudience;
  faculty?: string;
};

type Params = {
  nueva?: string;
  ver?: string;
  plantilla?: string;
  plazo?: string;
  publico?: string;
  facultad?: string;
};

function presetFrom(params: Params): ComposerPreset {
  const audience = params.publico as ProUniAudience | undefined;
  return {
    template: params.plantilla,
    deadlineId: params.plazo,
    audience: audience && AUDIENCE_ORDER.includes(audience) ? audience : undefined,
    faculty: params.facultad,
  };
}

export default function UniversityPublicaciones() {
  const { data, now, spaceId } = usePro();
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("published");
  const [creating, setCreating] = React.useState(params.nueva === "1");
  const [preset, setPreset] = React.useState<ComposerPreset>(() => presetFrom(params));
  const [open, setOpen] = React.useState<string | null>(params.ver ?? null);

  const pubs = data.uniPublications as UniPublication[];
  const active = data.uniMetrics.find((m) => m.key === "active")?.value ?? 0;
  const published = pubs.filter((p) => p.status === "published");
  const monthAgo = addDays(localDate(now), -30);
  const month = published.filter((p) => localDate(p.at) >= monthAgo);
  const monthReach = month.reduce((a, p) => a + p.reach, 0);
  const avgReach = month.length ? Math.round(monthReach / month.length) : 0;
  const reactions = month.reduce((a, p) => a + p.reactions, 0);
  const withReads = month.filter((p) => p.readReceipt && p.reads?.length);
  const readTotals = withReads.reduce(
    (acc, p) => {
      const s = readSummary(p);
      return { audience: acc.audience + s.audience, read: acc.read + s.read };
    },
    { audience: 0, read: 0 },
  );
  const list = pubs
    .filter((p) => p.status === tab)
    .sort((a, b) => (tab === "published" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));

  const startNew = (next: ComposerPreset = {}) => {
    setPreset(next);
    setCreating(true);
  };
  const closeComposer = () => {
    setCreating(false);
    // Quita ?nueva=1 y compañía para que al volver no se abra otra vez.
    if (params.nueva) router.replace(sectionHref(spaceId, "publicaciones") as never);
  };

  return (
    <ProPage>
      <UrgentBanner />

      <PageHeader
        eyebrow="Publicaciones"
        title="Publicaciones oficiales"
        description={
          month.length
            ? `Tus ${month.length} publicaciones de los últimos 30 días las vieron ${monthReach.toLocaleString("es-ES")} veces. De media, cada una llega a ${avgReach.toLocaleString("es-ES")} estudiantes.`
            : "Publica con distintivo oficial en el campus de Franky y mide quién lo ve de verdad."
        }
        actions={
          <>
            <PButton label="Nueva publicación" icon={Megaphone} onPress={() => startNew()} />
            <PButton label="Aviso urgente" icon={Siren} variant="outline" onPress={() => startNew({ template: "urgente" })} />
          </>
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "published", label: "Publicadas", count: published.length },
            { value: "scheduled", label: "Programadas", count: pubs.filter((p) => p.status === "scheduled").length },
            { value: "draft", label: "Borradores", count: pubs.filter((p) => p.status === "draft").length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Eye} label="Alcance, 30 días" value={monthReach.toLocaleString("es-ES")} hint="Visualizaciones reales" emphasis />
        <Kpi icon={Sparkles} label="Alcance medio" value={avgReach.toLocaleString("es-ES")} hint={active ? `${pct(avgReach, active)} % del campus activo` : undefined} />
        <Kpi
          icon={CheckCheck}
          label="Confirmaron lectura"
          value={readTotals.audience ? `${pct(readTotals.read, readTotals.audience)} %` : "Sin datos"}
          hint={withReads.length ? `En ${withReads.length} avisos con “Lo he leído”` : "Actívalo en tus avisos"}
        />
        <Kpi icon={Heart} label="Reacciones" value={reactions.toLocaleString("es-ES")} hint="Me gusta, guardados y compartidos" />
      </KpiRow>

      {list.length ? (
        <CardList>
          {list.map((p) => {
            const reads = p.readReceipt && p.reads?.length ? readSummary(p) : null;
            const urgent = isUrgentActive(p, now);
            return (
              <Card key={p.id} onPress={() => setOpen(p.id)} accessibilityLabel={p.title}>
                <View style={{ gap: S.sm }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                    <OfficialBadge />
                    {urgent ? <Pill tone="danger" label="Urgente, fijado arriba" /> : null}
                    <Pill label={CHANNEL[p.channel].label} />
                    {p.titleEn ? <Pill label="ES · EN" /> : null}
                  </View>
                  <PText v="tiny">
                    {`${p.audience} · ${p.status === "published" ? relative(p.at, now.getTime()) : `${dayLabel(p.at)} a las ${time(p.at)}`}`}
                  </PText>
                  <PText v="h2">{p.title}</PText>
                </View>
                {p.status === "published" ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: S.lg }}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        {reads ? <CheckCheck size={14} color={C.muted} /> : <Eye size={14} color={C.muted} />}
                        <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.3}>
                          {reads ? `${reads.pct} % lo ha leído` : p.reach.toLocaleString("es-ES")}
                        </Text>
                      </View>
                      {reads ? (
                        <Meter value={reads.read} max={reads.audience} tone={reads.pct < 50 ? "warning" : "violet"} />
                      ) : (
                        <Meter value={p.reach} max={Math.max(active, p.reach)} />
                      )}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Heart size={14} color={C.muted} />
                      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.3}>
                        {p.reactions.toLocaleString("es-ES")}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Pill tone={p.status === "scheduled" ? "info" : "warning"} label={p.status === "scheduled" ? "Programada" : "Borrador"} />
                )}
              </Card>
            );
          })}
        </CardList>
      ) : (
        <EmptyBox>
          <Empty
            icon={Megaphone}
            title={tab === "published" ? "Aún no has publicado nada" : tab === "scheduled" ? "Nada programado" : "Sin borradores"}
            body="Escribe un aviso oficial: llega al móvil de tus estudiantes con el distintivo de la universidad. Empieza con una plantilla de becas, matrícula o exámenes."
            action={<PButton label="Nueva publicación" onPress={() => startNew()} />}
          />
        </EmptyBox>
      )}

      <Tip title="Cuándo funciona mejor">
        Para plazos (becas, matrícula, exámenes), usa Aviso con “Lo he leído”: a los dos días ves qué facultades no lo han abierto y se lo recuerdas solo a ellas. Las publicaciones de FOMO llegan a más gente entre semana a primera hora de la tarde.
      </Tip>

      <Composer open={creating} onClose={closeComposer} preset={preset} />
      <PublicationSheet id={open} onClose={() => setOpen(null)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha de la publicación                                             */
/* ------------------------------------------------------------------ */

function PublicationSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now, pending } = usePro();
  const run = useUniAction();
  const [lang, setLang] = React.useState<"es" | "en">("es");
  React.useEffect(() => setLang("es"), [id]);

  const p = (data.uniPublications as UniPublication[]).find((x) => x.id === id);
  if (!p) return null;

  const active = data.uniMetrics.find((m) => m.key === "active")?.value ?? 0;
  const reads = p.readReceipt && p.reads?.length ? readSummary(p) : null;
  const urgent = isUrgentActive(p, now);
  const lastReminder = p.reminders?.[p.reminders.length - 1];

  const patch = async (label: string, next: UniPublication, title: string, detail?: string, close = true) => {
    const ok = await run(
      label,
      (d) => ({ ...d, uniPublications: d.uniPublications.map((x) => (x.id === p.id ? next : x)) }),
      title,
      detail,
    );
    if (ok && close) onClose();
  };
  const setStatus = (status: ProUniPublication["status"], title: string, detail?: string) =>
    void patch("publication.status", { ...p, status, at: status === "published" ? now.toISOString() : p.at }, title, detail);

  const share = () => void Linking.openURL(whatsappShareUrl(p, data.space.slug)).catch(() => undefined);

  return (
    <Sheet
      open={Boolean(id)}
      onClose={onClose}
      title={lang === "en" && p.titleEn ? p.titleEn : p.title}
      description={`${CHANNEL[p.channel].label} · ${p.audience}`}
      footer={
        p.status === "published" ? (
          <>
            <PButton label="WhatsApp" icon={MessageCircle} variant="outline" onPress={share} />
            {urgent ? (
              <PButton
                label="Ya no aplica"
                disabled={pending}
                onPress={() => void patch("publication.urgent.end", endUrgent(p, now), "Aviso retirado de arriba", "Sigue en el muro como publicación normal.")}
              />
            ) : reads && reads.unread ? (
              <PButton
                label="Recordar a quien falta"
                icon={BellRing}
                disabled={pending}
                onPress={() =>
                  void patch(
                    "publication.remind",
                    remindUnread(p, now),
                    "Recordatorio enviado",
                    `Solo a los ${reads.unread.toLocaleString("es-ES")} estudiantes que aún no lo han leído.`,
                    false,
                  )
                }
              />
            ) : null}
          </>
        ) : (
          <>
            {p.status === "scheduled" ? (
              <PButton label="Cancelar programación" variant="outline" disabled={pending} onPress={() => setStatus("draft", "Programación cancelada", "Queda como borrador.")} />
            ) : null}
            <PButton label="Publicar ahora" icon={Send} disabled={pending} onPress={() => setStatus("published", "Publicada", "Ya está en el campus con el distintivo oficial.")} />
          </>
        )
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <OfficialBadge />
        {urgent && p.urgent ? <Pill tone="danger" label={`${URGENT_KIND_LABEL[p.urgent.kind]} hasta las ${time(p.urgent.until)}`} /> : null}
        <Pill label={CHANNEL[p.channel].label} />
        {p.titleEn ? (
          <Tap
            onPress={() => setLang(lang === "es" ? "en" : "es")}
            accessibilityRole="button"
            accessibilityLabel={lang === "es" ? "Ver en inglés" : "Ver en español"}
            style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.border }}
          >
            <Languages size={14} color={C.text} strokeWidth={1.9} />
            <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.text }} maxFontSizeMultiplier={1.3}>
              {lang === "es" ? "Ver en inglés" : "Ver en español"}
            </Text>
          </Tap>
        ) : null}
      </View>

      {p.body ? <PText v="body" color={C.muted}>{lang === "en" && p.bodyEn ? p.bodyEn : p.body}</PText> : null}

      {reads ? (
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.md }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: S.md }}>
            <View>
              <PText v="small">Han confirmado “Lo he leído”</PText>
              <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.8, color: C.text }} maxFontSizeMultiplier={1.2}>
                {`${reads.pct} %`}
              </Text>
            </View>
            <PText v="tiny" style={{ textAlign: "right" }}>
              {`${reads.read.toLocaleString("es-ES")} de ${reads.audience.toLocaleString("es-ES")}\n${reads.unread.toLocaleString("es-ES")} sin leer`}
            </PText>
          </View>
          {readsByFaculty(p).map((r) => (
            <View key={r.faculty} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
                <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{r.faculty}</PText>
                {r.hidden ? <HiddenGroup /> : <PText v="h3">{`${r.pct} %`}</PText>}
              </View>
              {r.hidden ? null : <Meter value={r.read} max={r.audience} tone={r.pct < 50 ? "warning" : "violet"} />}
            </View>
          ))}
          {lastReminder ? (
            <PText v="tiny">
              {`Último recordatorio: ${relative(lastReminder.at, now.getTime())}, a ${lastReminder.sentTo.toLocaleString("es-ES")} estudiantes.`}
            </PText>
          ) : null}
        </View>
      ) : null}

      <View>
        <Detail label={p.status === "published" ? "Publicada" : "Sale"} value={`${dayLabel(p.at)} a las ${time(p.at)}`} />
        <Detail label="Público" value={p.audience} last={p.status !== "published" && !p.help} />
        {p.status === "published" ? (
          <>
            <Detail label="Estudiantes que la vieron" value={p.reach.toLocaleString("es-ES")} />
            <Detail label="Del campus activo" value={active ? `${pct(p.reach, active)} %` : "Sin datos"} />
            <Detail label="Reacciones" value={p.reactions.toLocaleString("es-ES")} last={!p.help} />
          </>
        ) : null}
        {p.help ? <Detail label="Botón fijo" value="Pedir ayuda" last /> : null}
      </View>
      {p.status === "published" && !reads ? <Meter value={p.reach} max={Math.max(active, p.reach)} /> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Nueva publicación (misma lógica que composer.tsx de la web)          */
/* ------------------------------------------------------------------ */

function Composer({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: ComposerPreset }) {
  const { data, now, pending } = usePro();
  const run = useUniAction();
  const extras = uniExtrasOf(data);
  const hasAudiences = extras.audiences.campus > 0;
  const faculties = facultyOptions(data);
  const today = localDate(now);

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [channel, setChannel] = React.useState<ProUniPublication["channel"]>("fomo");
  const [audience, setAudience] = React.useState<ProUniAudience>("campus");
  const [facs, setFacs] = React.useState<string[]>([]);
  const [when, setWhen] = React.useState<"now" | "later">("now");
  const [date, setDate] = React.useState(addDays(today, 1));
  const [hour, setHour] = React.useState(13 * 60 + 30);
  const [readReceipt, setReadReceipt] = React.useState(false);
  const [urgent, setUrgent] = React.useState(false);
  const [urgentKind, setUrgentKind] = React.useState<ProUniUrgentKind>("closure");
  const [duration, setDuration] = React.useState<UrgentDuration>("3h");
  const [english, setEnglish] = React.useState(false);
  const [titleEn, setTitleEn] = React.useState("");
  const [bodyEn, setBodyEn] = React.useState("");
  const [help, setHelp] = React.useState(false);
  const [templateId, setTemplateId] = React.useState("");
  const [deadlineId, setDeadlineId] = React.useState<string | undefined>();
  const [lang, setLang] = React.useState<"es" | "en">("es");

  const apply = React.useCallback((t: PublicationTemplate) => {
    setTemplateId(t.id);
    setTitle(t.title);
    setBody(t.body);
    setChannel(t.channel);
    setAudience(t.audience);
    setReadReceipt(Boolean(t.readReceipt));
    setUrgent(Boolean(t.urgent));
    if (t.urgent) setUrgentKind(t.urgent);
    setHelp(Boolean(t.help));
    setEnglish(Boolean(t.titleEn) || t.audience === "erasmus");
    setTitleEn(t.titleEn ?? "");
    setBodyEn(t.bodyEn ?? "");
    if (t.urgent) setWhen("now");
  }, []);

  // Al abrir: vacío, o preparado desde un plazo, una plantilla o una alerta.
  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setChannel("fomo");
    setAudience("campus");
    setFacs([]);
    setWhen("now");
    setDate(addDays(localDate(now), 1));
    setHour(13 * 60 + 30);
    setReadReceipt(false);
    setUrgent(false);
    setDuration("3h");
    setEnglish(false);
    setTitleEn("");
    setBodyEn("");
    setHelp(false);
    setTemplateId("");
    setDeadlineId(undefined);
    setLang("es");
    const deadline = preset?.deadlineId ? extras.deadlines.find((d) => d.id === preset.deadlineId) : undefined;
    if (deadline) {
      apply(templateForDeadline(deadline));
      setDeadlineId(deadline.id);
      // Se programa para la mañana de dos días antes del plazo (o mañana si ya no da tiempo).
      const target = addDays(deadline.date, -2);
      setWhen("later");
      setDate(target > localDate(now) ? target : addDays(localDate(now), 1));
      setHour(9 * 60);
    } else {
      const t = PUBLICATION_TEMPLATES.find((x) => x.id === preset?.template);
      if (t) apply(t);
    }
    if (preset?.audience) setAudience(preset.audience);
    if (preset?.faculty) setFacs([preset.faculty]);
    // Desde la alerta de primero: un aviso cercano para quien aún no ha venido a nada.
    if (preset?.audience === "welcome_absent" && preset.faculty && !deadline && !preset.template) {
      setChannel("aviso");
      setTitle(`Primero de ${preset.faculty}: aún estás a tiempo`);
      setBody("Esta semana hay actividades de tu facultad y de las asociaciones del campus. Pásate por la siguiente parada del pasaporte: conocerás a gente de tu curso y te llevas las ventajas de los comercios del campus.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Aviso urgente: siempre sale ya y con confirmación de lectura.
  React.useEffect(() => {
    if (!urgent) return;
    setWhen("now");
    setChannel("aviso");
    setReadReceipt(true);
  }, [urgent]);

  const scoped = FACULTY_SCOPED.includes(audience);
  const chosenFaculties = scoped ? facs : [];
  const estimate = estimateReach(extras, channel, audience, chosenFaculties);
  const hints = accessibilityHints(title, body);
  const needsFaculty = audience === "faculties" && facs.length === 0;
  const blocked = hasAudiences && estimate.tooSmall && !needsFaculty;
  const valid =
    title.trim().length > 4 &&
    body.trim().length > 4 &&
    !needsFaculty &&
    !blocked &&
    (!english || titleEn.trim().length > 4);

  const save = async (status: ProUniPublication["status"]) => {
    const at = status === "scheduled" ? atLocal(date, hour) : now.toISOString();
    const p: UniPublication = {
      id: localId("p"),
      title: title.trim(),
      body: body.trim(),
      channel,
      at,
      reach: 0,
      reactions: 0,
      status,
      audience: audienceText(audience, chosenFaculties),
      audienceKey: audience,
      faculties: chosenFaculties.length ? chosenFaculties : undefined,
      official: true,
      readReceipt: readReceipt || undefined,
      reads: readReceipt ? initialReads(extras, audience, chosenFaculties) : undefined,
      urgent: urgent && status === "published" ? { kind: urgentKind, until: urgentUntil(duration, now) } : undefined,
      titleEn: english && titleEn.trim() ? titleEn.trim() : undefined,
      bodyEn: english && bodyEn.trim() ? bodyEn.trim() : undefined,
      help: help || undefined,
      deadlineId,
    };
    const ok = await run(
      "publication.create",
      (d) => ({ ...d, uniPublications: [p, ...d.uniPublications] }),
      status === "published"
        ? urgent
          ? "Aviso urgente publicado"
          : "Publicada con distintivo oficial"
        : status === "scheduled"
          ? "Publicación programada"
          : "Borrador guardado",
      status === "draft" || !hasAudiences ? undefined : `Llegará a unos ${estimate.reach.toLocaleString("es-ES")} estudiantes.`,
    );
    if (ok) onClose();
  };

  const previewTitle = lang === "en" && titleEn ? titleEn : title;
  const previewBody = lang === "en" && bodyEn ? bodyEn : body;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={urgent ? "Aviso urgente" : "Nueva publicación oficial"}
      description="Sale con el distintivo verificado de la universidad."
      footer={
        <>
          {urgent ? null : (
            <PButton label="Guardar borrador" variant="ghost" onPress={() => void save("draft")} disabled={pending || !title.trim()} />
          )}
          <PButton
            label={when === "now" ? "Publicar" : "Programar"}
            icon={Send}
            onPress={() => void save(when === "now" ? "published" : "scheduled")}
            disabled={pending || !valid}
          />
        </>
      }
    >
      <Field label="Empieza con una plantilla" hint="Rellena el texto; cambia lo que va entre corchetes.">
        <Chips<string>
          value={templateId}
          onChange={(id) => {
            const t = PUBLICATION_TEMPLATES.find((x) => x.id === id);
            if (t) apply(t);
          }}
          options={PUBLICATION_TEMPLATES.map((t) => ({ value: t.id, label: t.label }))}
        />
      </Field>

      <Field label="Canal">
        <ChoiceGrid
          value={channel}
          onChange={setChannel}
          options={(Object.keys(CHANNEL) as ProUniPublication["channel"][]).map((c) => ({ value: c, label: CHANNEL[c].label, hint: CHANNEL[c].hint }))}
        />
      </Field>
      <Field label="Título">
        <Input value={title} onChangeText={setTitle} placeholder="Horario de las bibliotecas en exámenes" label="Título" />
      </Field>
      <Field label="Texto">
        <Input value={body} onChangeText={setBody} multiline placeholder="Lo esencial primero: qué, cuándo y qué tienen que hacer." label="Texto" style={{ minHeight: 120 }} />
      </Field>

      {hints.length ? (
        <View style={{ borderRadius: R.md, backgroundColor: C.input, padding: S.md, gap: 6 }}>
          {hints.map((h) => (
            <View key={h} style={{ flexDirection: "row", gap: S.sm }}>
              <Info size={15} color={C.muted} strokeWidth={1.9} style={{ marginTop: 2 }} />
              <PText v="small" style={{ flex: 1 }}>{h}</PText>
            </View>
          ))}
        </View>
      ) : null}

      <Field label="Para quién">
        <ChoiceGrid
          value={audience}
          onChange={(a) => {
            setAudience(a);
            if (a === "erasmus") setEnglish(true);
          }}
          options={AUDIENCE_ORDER.map((a) => ({ value: a, label: AUDIENCE_LABEL[a] }))}
        />
        {scoped && faculties.length ? (
          <View style={{ gap: S.sm, marginTop: S.xs, borderRadius: R.md, backgroundColor: C.input, padding: S.sm }}>
            {audience === "faculties" ? null : <PText v="tiny">Todas las facultades, o elige solo algunas.</PText>}
            <MultiChips value={facs} onChange={setFacs} options={faculties.map((f) => ({ value: f, label: f }))} />
          </View>
        ) : null}
      </Field>

      <View>
        <Toggle
          label="Pedir que confirmen con “Lo he leído”"
          detail="Verás el porcentaje por facultad y podrás recordarlo solo a quien no lo vio."
          value={readReceipt}
          onChange={setReadReceipt}
        />
        <Toggle
          label="Aviso urgente de campus"
          detail="Sale ya y queda fijado arriba del campus hasta que lo retires."
          value={urgent}
          onChange={setUrgent}
        />
        {urgent ? (
          <View style={{ gap: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, marginVertical: S.xs }}>
            <Field label="Qué pasa">
              <ChoiceGrid
                value={urgentKind}
                onChange={setUrgentKind}
                options={(Object.keys(URGENT_KIND_LABEL) as ProUniUrgentKind[]).map((k) => ({ value: k, label: URGENT_KIND_LABEL[k] }))}
              />
            </Field>
            <Field label="Fijado arriba">
              <ChoiceGrid
                value={duration}
                onChange={setDuration}
                options={(Object.keys(URGENT_DURATION_LABEL) as UrgentDuration[]).map((k) => ({ value: k, label: URGENT_DURATION_LABEL[k] }))}
              />
            </Field>
          </View>
        ) : null}
        <Toggle
          label="Versión en inglés"
          detail="Erasmus e internacionales la ven en inglés si tienen Franky en ese idioma."
          value={english}
          onChange={setEnglish}
        />
        {english ? (
          <View style={{ gap: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, marginVertical: S.xs }}>
            <Field label="Title">
              <Input value={titleEn} onChangeText={setTitleEn} placeholder="Library opening hours during exams" label="Title" />
            </Field>
            <Field label="Text">
              <Input value={bodyEn} onChangeText={setBodyEn} multiline label="Text" />
            </Field>
          </View>
        ) : null}
        <Toggle
          label="Botón fijo “Pedir ayuda”"
          detail={extras.help.length ? `Enlaza con ${extras.help.map((h) => h.label).join(", ")}.` : "Para la semana de bienestar y avisos delicados."}
          value={help}
          onChange={setHelp}
        />
      </View>

      {urgent ? null : (
        <Field label="Cuándo">
          <ChoiceGrid
            value={when}
            onChange={setWhen}
            options={[
              { value: "now", label: "Ahora" },
              { value: "later", label: "Programar" },
            ]}
          />
          {when === "later" ? (
            <View style={{ gap: S.sm, marginTop: S.xs }}>
              <DayChips value={date} onChange={setDate} today={today} days={60} />
              <TimeStepper value={hour} onChange={setHour} label="hora" />
            </View>
          ) : null}
        </Field>
      )}

      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, padding: S.md, gap: S.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
          <PText v="label">Así lo verán</PText>
          {english ? (
            <Segmented<"es" | "en">
              value={lang}
              onChange={setLang}
              options={[
                { value: "es", label: "ES" },
                { value: "en", label: "EN" },
              ]}
            />
          ) : null}
        </View>
        <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: urgent ? `${C.error}66` : C.border, backgroundColor: C.surface, padding: S.md, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <PText v="h3">{data.space.name}</PText>
            <BadgeCheck size={16} color={C.blue} accessibilityLabel="Oficial" />
          </View>
          {urgent ? (
            <PText v="tiny" color={C.errorText} style={{ fontFamily: FONT.semibold, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {URGENT_KIND_LABEL[urgentKind]}
            </PText>
          ) : null}
          <PText v="h2">{previewTitle || "Tu título"}</PText>
          <PText v="small" numberOfLines={4}>{previewBody || "El texto de la publicación."}</PText>
          {readReceipt || help ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.sm }}>
              {readReceipt ? (
                <View style={{ minHeight: 36, justifyContent: "center", borderRadius: R.md, backgroundColor: C.text, paddingHorizontal: S.md }}>
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.bg }} maxFontSizeMultiplier={1.3}>
                    {lang === "en" ? "I've read it" : "Lo he leído"}
                  </Text>
                </View>
              ) : null}
              {help ? (
                <View style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}>
                  <HeartHandshake size={14} color={C.text} />
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.text }} maxFontSizeMultiplier={1.3}>
                    {lang === "en" ? "Get help" : "Pedir ayuda"}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        {hasAudiences ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <Eye size={16} color={C.blue} style={{ marginTop: 2 }} />
            <Text style={{ fontSize: 14, color: C.text, flex: 1 }} maxFontSizeMultiplier={1.4}>
              {needsFaculty ? (
                "Elige al menos una facultad."
              ) : estimate.tooSmall ? (
                `Este público tiene menos de ${PRIVACY_MIN_GROUP} personas. Elige uno más amplio.`
              ) : (
                <>
                  {`${estimate.people.toLocaleString("es-ES")} estudiantes en el público. Lo verán unos `}
                  <Text style={{ fontFamily: FONT.semibold }}>{estimate.reach.toLocaleString("es-ES")}</Text>.
                </>
              )}
            </Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
