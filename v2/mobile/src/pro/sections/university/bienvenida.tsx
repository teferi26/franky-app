import React from "react";
import { Modal, ScrollView, Share, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Check, GraduationCap, MapPin, MonitorUp, Plus, Share2, Stamp, Store, Users, X } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import { addDays, atLocal, dayLabel, localDate, pct, relative, time } from "../../../../../shared/pro/format";
import {
  QR_ROTATION_MS,
  checkinUrl,
  newSurvey,
  rotatingCode,
  surveyResults,
  uniExtrasOf,
  withUniExtras,
} from "../../../../../shared/pro/university";
import type { UniWelcomeStop } from "../../../../../shared/pro/university-types";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  ChoiceGrid,
  DayChips,
  Detail,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  Meter,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Sheet,
  Stepper,
  Tip,
  TimeStepper,
  Toggle,
} from "../../kit";
import { Card, CardList, EmptyBox, HiddenGroup, useUniAction } from "./ui";

type Kind = "bienvenida" | "erasmus";

/**
 * El QR se proyecta o se comparte sobre fondo claro: lleva colores fijos de
 * papel, no los del tema (en modo oscuro no se leería).
 */
const PAPER = "#FFFFFF";
const INK = "#121019";
const PAPER_TRACK = "#EDEBF3";

export default function UniversityBienvenida() {
  const { data, now } = usePro();
  const [kind, setKind] = React.useState<Kind>("bienvenida");
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [projecting, setProjecting] = React.useState<string | null>(null);

  const extras = uniExtrasOf(data);
  const stops = (data.uniWelcome as UniWelcomeStop[]).slice().sort((a, b) => a.date.localeCompare(b.date));
  const shown = stops.filter((s) => (s.kind ?? "bienvenida") === kind);
  const welcome = data.uniMetrics.find((m) => m.key === "welcome");
  const checkins = stops.reduce((a, s) => a + s.checkins, 0);
  const nowIso = now.toISOString();
  const next = stops.find((s) => s.date >= nowIso);
  const done = stops.filter((s) => s.date < nowIso);
  const avgFill = done.length ? Math.round(done.reduce((a, s) => a + pct(s.checkins, s.capacity), 0) / done.length) : 0;

  return (
    <ProPage>
      <PageHeader
        eyebrow="Bienvenida"
        title="Pasaporte de bienvenida"
        description={`${welcome ? `El ${welcome.value} % de primero ya ha ido a alguna actividad. ` : ""}${checkins.toLocaleString("es-ES")} check-ins en ${stops.length} paradas.${next ? ` La siguiente, ${relative(next.date, now.getTime())}.` : ""}`}
        actions={<PButton label="Nueva parada" icon={Plus} onPress={() => setCreating(true)} />}
      >
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: "bienvenida", label: "Primer curso", count: stops.filter((s) => (s.kind ?? "bienvenida") === "bienvenida").length },
            { value: "erasmus", label: "Erasmus", count: stops.filter((s) => s.kind === "erasmus").length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={GraduationCap} label="Primero que ha participado" value={welcome ? `${welcome.value} %` : "0 %"} hint="Al menos una parada" emphasis />
        <Kpi icon={Stamp} label="Check-ins" value={checkins.toLocaleString("es-ES")} hint="Uno por persona y parada" />
        <Kpi icon={Users} label="Pasaportes completos" value={extras.passport.completed.toLocaleString("es-ES")} hint={`Con ${extras.passport.goal} paradas o más`} />
        <Kpi icon={MapPin} label="Próxima parada" value={next ? relative(next.date, now.getTime()) : "Ninguna"} hint={next?.title ?? `Ocupación media ${avgFill} %`} />
      </KpiRow>

      {welcome ? (
        <Panel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: S.md }}>
            <View>
              <PText v="small">Primero que ha pasado por alguna parada</PText>
              <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.8, color: C.text }} maxFontSizeMultiplier={1.2}>{`${welcome.value} %`}</Text>
            </View>
            <Text style={{ fontSize: 13, color: C.muted }} maxFontSizeMultiplier={1.3}>
              Objetivo del curso: <Text style={{ fontFamily: FONT.semibold, color: C.text }}>70 %</Text>
            </Text>
          </View>
          <View style={{ marginTop: S.md, justifyContent: "center" }}>
            <Meter value={welcome.value} max={100} />
            {/* Marca del objetivo del 70 % */}
            <View accessibilityElementsHidden importantForAccessibility="no" style={{ position: "absolute", left: "70%", top: -5, width: 2, height: 16, borderRadius: 1, backgroundColor: C.text }} />
          </View>
        </Panel>
      ) : null}

      {shown.length ? (
        <CardList>
          {shown.map((s, i) => {
            const past = s.date < nowIso;
            const today = localDate(s.date) === localDate(now);
            const survey = s.survey ? surveyResults(s.survey) : null;
            return (
              <Card key={s.id} onPress={() => setOpen(s.id)} accessibilityLabel={s.title}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md }}>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderStyle: "dashed", borderColor: past ? C.blue : C.border, alignItems: "center", justifyContent: "center" }}
                  >
                    {past ? (
                      <Check size={20} color={C.blue} strokeWidth={2.4} />
                    ) : (
                      <Text style={{ fontFamily: FONT.heading, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.2}>{i + 1}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {today ? <Pill tone="success" label="Hoy" /> : past ? <Pill label="Hecha" /> : <Pill tone="info" label={relative(s.date, now.getTime())} />}
                      {s.titleEn ? <Pill label="ES · EN" /> : null}
                    </View>
                    <PText v="h2">{s.title}</PText>
                    {s.titleEn ? <PText v="tiny" numberOfLines={1}>{s.titleEn}</PText> : null}
                    <PText v="tiny" numberOfLines={1}>{`${dayLabel(s.date, { weekday: true })}, ${time(s.date)} · ${s.place}`}</PText>
                  </View>
                </View>
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <PText v="tiny">{past || today ? `${s.checkins.toLocaleString("es-ES")} check-ins` : `${s.capacity.toLocaleString("es-ES")} plazas`}</PText>
                    <PText v="tiny">{past || today ? `${pct(s.checkins, s.capacity)} %` : "Abierta"}</PText>
                  </View>
                  <Meter value={s.checkins} max={s.capacity} tone={past ? "success" : "violet"} />
                  {survey && !survey.hidden ? (
                    <PText v="tiny">{`Al ${survey.rows[0].pct} % le ha servido mucho`}</PText>
                  ) : null}
                </View>
              </Card>
            );
          })}
        </CardList>
      ) : (
        <EmptyBox>
          <Empty
            icon={Stamp}
            title={kind === "erasmus" ? "Aún no hay paradas para Erasmus" : "Aún no hay paradas"}
            body="Crea la primera parada del pasaporte. Cada una tiene su QR: el estudiante lo escanea y suma el sello. Proyéctalo en la entrada desde el móvil o una tableta."
            action={<PButton label="Nueva parada" onPress={() => setCreating(true)} />}
          />
        </EmptyBox>
      )}

      <PerksPanel />

      <Tip title="Por qué funciona el pasaporte">
        {`Quien completa ${extras.passport.goal} paradas ha conocido su facultad, la biblioteca y alguna asociación antes de octubre, y se lleva las ventajas de los comercios del campus. Es lo que más ayuda a que no abandonen en primero.`}
      </Tip>

      <StopSheet
        id={open}
        onClose={() => setOpen(null)}
        onProject={(id) => {
          setOpen(null);
          setProjecting(id);
        }}
      />
      <NewStopSheet open={creating} onClose={() => setCreating(false)} defaultKind={kind} />
      <ProjectorScreen stopId={projecting} onClose={() => setProjecting(null)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Comercios del campus en el pasaporte                                */
/* ------------------------------------------------------------------ */

function PerksPanel() {
  const { data } = usePro();
  const run = useUniAction();
  const extras = uniExtrasOf(data);
  const perks = [...extras.perks].sort((a, b) => a.walkMinutes - b.walkMinutes);
  const enabled = perks.filter((p) => p.enabled);
  const redeemed = enabled.reduce((a, p) => a + p.redeemed, 0);

  const toggle = (id: string, on: boolean) =>
    void run(
      "welcome.perk",
      (d) => withUniExtras(d, (x) => ({ ...x, perks: x.perks.map((p) => (p.id === id ? { ...p, enabled: on } : p)) })),
      on ? "Añadido al pasaporte" : "Quitado del pasaporte",
      on ? "Quien complete el pasaporte verá esta ventaja." : undefined,
    );

  return (
    <Panel
      title="Comercios del campus en el pasaporte"
      description={
        perks.length
          ? `Negocios de Franky cerca del campus premian a quien completa el pasaporte. Tú eliges cuáles.${enabled.length ? ` Llevan ${redeemed.toLocaleString("es-ES")} ventajas canjeadas.` : ""}`
          : undefined
      }
      flush={!perks.length}
    >
      {perks.length ? (
        perks.map((p) => (
          <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Store size={16} color={C.muted} strokeWidth={1.9} />
            <View style={{ flex: 1 }}>
              <Toggle
                label={`${p.business} · ${p.perk}`}
                detail={`${p.sector}, a ${p.walkMinutes} min andando${p.enabled && p.redeemed ? ` · ${p.redeemed.toLocaleString("es-ES")} canjeadas` : ""}`}
                value={p.enabled}
                onChange={(on) => toggle(p.id, on)}
              />
            </View>
          </View>
        ))
      ) : (
        <Empty
          icon={Store}
          title="Aún no hay comercios cerca del campus"
          body="Cuando cafeterías, bares o gimnasios de Franky cerca de tu campus ofrezcan una ventaja para el pasaporte, aparecerán aquí para que elijas cuáles incluir."
        />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha de la parada                                                  */
/* ------------------------------------------------------------------ */

function StopSheet({ id, onClose, onProject }: { id: string | null; onClose: () => void; onProject: (id: string) => void }) {
  const { data, now } = usePro();
  const s = (data.uniWelcome as UniWelcomeStop[]).find((x) => x.id === id);
  if (!s) return null;
  const past = s.date < now.toISOString();
  const code = s.code ?? s.id.toUpperCase();
  const url = checkinUrl(data.space.slug, code);
  const survey = s.survey ? surveyResults(s.survey) : null;

  // En la web se imprime el cartel A4; en el móvil se comparte el enlace fijo del QR.
  const share = () => {
    void Share.share({ message: `${s.title}: escanea el QR o abre este enlace con Franky para sumar el sello del pasaporte. ${url}` }).catch(() => undefined);
  };

  return (
    <Sheet
      open={Boolean(id)}
      onClose={onClose}
      title={s.title}
      description={`${dayLabel(s.date)} a las ${time(s.date)} · ${s.place}`}
      footer={
        <>
          <PButton label="Compartir QR" icon={Share2} variant="outline" onPress={share} />
          <PButton label="Proyectar check-in" icon={MonitorUp} onPress={() => onProject(s.id)} />
        </>
      }
    >
      <View style={{ alignItems: "center", gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.xl }}>
        <View accessibilityRole="image" accessibilityLabel={`QR de check-in ${code}`} style={{ padding: S.md, borderRadius: R.lg, backgroundColor: PAPER }}>
          <QRCode value={url} size={150} color={INK} backgroundColor={PAPER} />
        </View>
        <Text style={{ fontFamily: FONT.semibold, fontSize: 14, letterSpacing: 1.5, color: C.text }} maxFontSizeMultiplier={1.3}>{code}</Text>
        <PText v="tiny" style={{ textAlign: "center", maxWidth: 280 }}>
          Este QR es fijo, para carteles y tablones. En la entrada, proyecta el check-in: el QR cambia cada 30 segundos y el contador sube solo.
        </PText>
      </View>
      <View>
        <Detail label="Check-ins" value={s.checkins.toLocaleString("es-ES")} />
        <Detail label="Plazas" value={s.capacity.toLocaleString("es-ES")} />
        <Detail label="Ocupación" value={`${pct(s.checkins, s.capacity)} %`} />
        <Detail label="Estado" value={past ? "Hecha" : "Por delante"} last={!s.titleEn} />
        {s.titleEn ? <Detail label="En inglés" value={s.titleEn} last /> : null}
      </View>
      <Meter value={s.checkins} max={s.capacity} tone={past ? "success" : "violet"} />

      {survey && s.survey ? (
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.sm }}>
          <PText v="h3">{s.survey.question}</PText>
          <PText v="tiny">{`Una pregunta al hacer check-in. ${survey.total.toLocaleString("es-ES")} respuestas.`}</PText>
          {survey.hidden ? (
            past ? <HiddenGroup /> : <PText v="small">Las respuestas aparecen aquí cuando empiece la parada.</PText>
          ) : (
            survey.rows.map((r, i) => (
              <View key={r.label} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
                  <PText v="small" color={C.text} style={{ flex: 1 }}>{r.label}</PText>
                  <PText v="h3">{`${r.pct} %`}</PText>
                </View>
                <Meter value={r.count} max={survey.total} tone={i === 2 ? "warning" : i === 0 ? "success" : "violet"} />
              </View>
            ))
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Pantalla de check-in para proyectar                                 */
/* ------------------------------------------------------------------ */

/**
 * El móvil o la tableta, conectado al proyector o apoyado en la mesa de la
 * entrada. El QR cambia cada 30 segundos para que nadie lo comparta y el
 * contador lee la parada del almacén: sube cuando llegan check-ins.
 */
function ProjectorScreen({ stopId, onClose }: { stopId: string | null; onClose: () => void }) {
  const { data, demo, refresh } = usePro();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const open = Boolean(stopId);
  const stop = (data.uniWelcome as UniWelcomeStop[]).find((s) => s.id === stopId);

  React.useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // En un espacio real se piden los check-in nuevos cada 20 segundos.
  React.useEffect(() => {
    if (!open || demo) return;
    const id = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(id);
  }, [open, demo, refresh]);

  // La pantalla no se apaga mientras se proyecta.
  React.useEffect(() => {
    if (!open) return;
    const tag = "franky-pro-proyector";
    void activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => void deactivateKeepAwake(tag).catch(() => undefined);
  }, [open]);

  if (!stop) return null;

  const code = stop.code ?? stop.id.toUpperCase();
  const { token, msLeft } = rotatingCode(code, nowMs);
  const secondsLeft = Math.ceil(msLeft / 1000);
  const landscape = width > height;
  const qrSize = Math.min(landscape ? height * 0.62 : width - S.xl * 2 - S.lg * 2, 520);

  return (
    <Modal visible={open} animationType="fade" presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + S.sm, paddingBottom: insets.bottom + S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md, paddingHorizontal: S.lg }}>
          <PText v="label" style={{ flex: 1 }}>{stop.kind === "erasmus" ? "Pasaporte Erasmus · Erasmus passport" : "Pasaporte de bienvenida"}</PText>
          <Tap
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar proyección"
            style={{ width: 44, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}
          >
            <X size={20} color={C.text} />
          </Tap>
        </View>

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            flexDirection: landscape ? "row" : "column",
            alignItems: "center",
            justifyContent: "center",
            gap: S.xl,
            padding: S.lg,
          }}
        >
          <View style={{ flex: landscape ? 1 : undefined, alignSelf: "stretch", gap: S.sm }}>
            <Text style={{ fontFamily: FONT.display, fontSize: landscape ? 40 : 30, lineHeight: landscape ? 44 : 34, letterSpacing: -1, color: C.text }} maxFontSizeMultiplier={1.2}>
              {stop.title}
            </Text>
            {stop.titleEn ? <PText v="body" color={C.muted}>{stop.titleEn}</PText> : null}
            <PText v="body" color={C.muted}>{`${dayLabel(stop.date)}, ${time(stop.date)} · ${stop.place}`}</PText>
            <Text
              accessibilityLiveRegion="polite"
              style={{ fontFamily: FONT.display, fontSize: landscape ? 96 : 72, letterSpacing: -3, color: C.text, marginTop: S.md }}
              maxFontSizeMultiplier={1.1}
            >
              {stop.checkins.toLocaleString("es-ES")}
            </Text>
            <PText v="body" color={C.muted}>sellos en esta parada</PText>
            <View style={{ maxWidth: 420, marginTop: S.sm, gap: 4 }}>
              <Meter value={stop.checkins} max={stop.capacity} />
              <PText v="tiny">{`${pct(stop.checkins, stop.capacity)} % de ${stop.capacity.toLocaleString("es-ES")} plazas`}</PText>
            </View>
          </View>

          <View style={{ alignItems: "center", gap: S.sm }}>
            <View style={{ borderRadius: R.xl, backgroundColor: PAPER, padding: S.lg, gap: S.md }}>
              <QRCode value={checkinUrl(data.space.slug, code, token)} size={qrSize} color={INK} backgroundColor={PAPER} />
              {/* Cuenta atrás hasta el siguiente código. */}
              <View style={{ height: 6, borderRadius: 3, backgroundColor: PAPER_TRACK, overflow: "hidden" }}>
                <View style={{ width: `${(msLeft / QR_ROTATION_MS) * 100}%`, height: "100%", borderRadius: 3, backgroundColor: C.blue }} />
              </View>
            </View>
            <Text style={{ fontFamily: FONT.heading, fontSize: 20, color: C.text, textAlign: "center" }} maxFontSizeMultiplier={1.2}>
              Escanea con Franky y suma el sello
            </Text>
            {stop.kind === "erasmus" ? <PText v="body" color={C.muted}>Scan with Franky to get your stamp</PText> : null}
            <PText v="tiny">{`El código cambia en ${secondsLeft} s para que nadie lo comparta`}</PText>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Nueva parada                                                        */
/* ------------------------------------------------------------------ */

function NewStopSheet({ open, onClose, defaultKind }: { open: boolean; onClose: () => void; defaultKind: Kind }) {
  const { data, now, pending } = usePro();
  const run = useUniAction();
  const today = localDate(now);
  const [title, setTitle] = React.useState("");
  const [titleEn, setTitleEn] = React.useState("");
  const [date, setDate] = React.useState(addDays(today, 3));
  const [hour, setHour] = React.useState(12 * 60);
  const [place, setPlace] = React.useState("");
  const [capacity, setCapacity] = React.useState(300);
  const [kind, setKind] = React.useState<Kind>(defaultKind);
  const [survey, setSurvey] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setTitleEn("");
    setDate(addDays(localDate(now), 3));
    setHour(12 * 60);
    setPlace("");
    setCapacity(300);
    setKind(defaultKind);
    setSurvey(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = title.trim().length > 3 && place.trim().length > 2 && capacity > 0;

  const save = async () => {
    const count = (data.uniWelcome as UniWelcomeStop[]).filter((s) => (s.kind ?? "bienvenida") === kind).length + 1;
    const stop: UniWelcomeStop = {
      id: localId("w"),
      title: title.trim(),
      titleEn: titleEn.trim() || undefined,
      date: atLocal(date, hour),
      place: place.trim(),
      checkins: 0,
      capacity,
      kind,
      code: `${kind === "erasmus" ? "ERAS" : "BIEN"}-${String(count).padStart(2, "0")}`,
      survey: survey ? newSurvey() : undefined,
    };
    const ok = await run(
      "welcome.create",
      (d) => ({ ...d, uniWelcome: [...d.uniWelcome, stop] }),
      "Parada creada",
      "Ya tiene su QR de check-in y aparece en el pasaporte de los estudiantes.",
    );
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nueva parada"
      description="Cada parada tiene su QR de check-in."
      footer={<PButton label="Crear parada" onPress={() => void save()} disabled={pending || !valid} />}
    >
      <Field label="Pasaporte">
        <ChoiceGrid
          value={kind}
          onChange={setKind}
          options={[
            { value: "bienvenida", label: "Primer curso" },
            { value: "erasmus", label: "Erasmus" },
          ]}
        />
      </Field>
      <Field label="Actividad">
        <Input value={title} onChangeText={setTitle} placeholder="Visita a la biblioteca general" label="Actividad" />
      </Field>
      <Field label={kind === "erasmus" ? "Nombre en inglés" : "Nombre en inglés (opcional)"} hint="Lo ven los internacionales que usan Franky en inglés.">
        <Input value={titleEn} onChangeText={setTitleEn} placeholder="Main library tour" label="Nombre en inglés" />
      </Field>
      <Field label="Fecha">
        <DayChips value={date} onChange={setDate} today={today} days={30} />
      </Field>
      <Field label="Hora">
        <TimeStepper value={hour} onChange={setHour} label="hora" />
      </Field>
      <Field label="Lugar">
        <Input value={place} onChangeText={setPlace} placeholder="Plaza central del campus" label="Lugar" />
      </Field>
      <Field label="Plazas">
        <Stepper value={capacity} onChange={setCapacity} min={1} max={5000} step={10} label="plazas" />
      </Field>
      <Toggle
        label="Encuesta de una pregunta"
        detail="“¿Qué te ha parecido?” con tres respuestas al hacer check-in."
        value={survey}
        onChange={setSurvey}
      />
    </Sheet>
  );
}
