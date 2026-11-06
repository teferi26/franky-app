import React from "react";
import { ScrollView, Text, View } from "react-native";
import { BadgeCheck, FileText, Image as ImageIcon, Landmark, Megaphone, Plus, Users } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProSubsidy } from "../../../../../shared/pro/types";
import { localDate, money, shortDay } from "../../../../../shared/pro/format";
import {
  COUNCIL_MAX_CENTS,
  COUNCIL_TOTAL_CENTS,
  councilWindows,
  daysBetween,
  windowLabel,
  type CommunityActivity,
} from "../../../../../shared/pro/demo/community";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Detail, Empty, Field, Input, Kpi, KpiRow, Meter, PButton, PText, PageHeader, Panel, Pill, Sheet, Tip } from "../../kit";
import { Card, CheckRow, StatRow, StatTile } from "./ui";

const STEPS: { id: ProSubsidy["status"]; label: string }[] = [
  { id: "preparing", label: "Preparando" },
  { id: "submitted", label: "Presentada" },
  { id: "granted", label: "Concedida" },
  { id: "justified", label: "Justificada" },
];

const DEFAULT_CHECKLIST = [
  "Inscrita en el Registro de Asociaciones Universitarias",
  "Proyecto y presupuesto de las actividades",
  "Certificado de estar al corriente con Hacienda",
  "Certificado de estar al corriente con la Seguridad Social",
  "Memoria de actividades con asistentes verificados",
  "Publicidad con el logo del Consejo de Estudiantes",
];

export default function CommunitySubvenciones() {
  const { data, now, update } = usePro();
  const today = localDate(now);
  const windows = councilWindows(now, 5);
  const [memoryFor, setMemoryFor] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const preparing = data.subsidies.find((s) => s.status === "preparing");
  const missing = preparing ? preparing.checklist.filter((c) => !c.done).length : 0;
  const nextWindow = windows[0];
  const daysLeft = nextWindow ? daysBetween(today, nextWindow) : 0;
  const granted = data.subsidies.filter((s) => s.status === "granted" || s.status === "justified").reduce((a, s) => a + s.requestedCents, 0);
  const pendingHalf = data.subsidies.filter((s) => s.status === "granted").reduce((a, s) => a + Math.round(s.requestedCents / 2), 0);
  const acts = (data.activities as CommunityActivity[]).filter((a) => a.status === "done");
  const verified = acts.reduce((a, x) => a + x.checkedIn, 0);

  const toggleItem = (s: ProSubsidy, idx: number) => {
    void update("subsidy.check", (d) => ({
      ...d,
      subsidies: d.subsidies.map((x) =>
        x.id === s.id ? { ...x, checklist: x.checklist.map((c, i) => (i === idx ? { ...c, done: !c.done } : c)) } : x,
      ),
    }));
  };

  const advance = async (s: ProSubsidy, status: ProSubsidy["status"], title: string, detail: string) => {
    const ok = await update("subsidy.status", (d) => ({ ...d, subsidies: d.subsidies.map((x) => (x.id === s.id ? { ...x, status } : x)) }));
    if (ok) toast(title, { kind: "success", body: detail });
  };

  const sorted = [...data.subsidies].sort((a, b) => STEPS.findIndex((x) => x.id === a.status) - STEPS.findIndex((x) => x.id === b.status));

  return (
    <ProPage>
      <PageHeader
        eyebrow="Subvenciones"
        title="Subvenciones"
        description={
          preparing
            ? `La próxima ventana del Consejo de Estudiantes es el ${windowLabel(preparing.window)}, dentro de ${daysBetween(today, preparing.window)} días. ${missing ? `Te faltan ${missing} requisitos.` : "Lo tienes todo listo para presentarla."}`
            : `La próxima ventana del Consejo de Estudiantes es el ${windowLabel(nextWindow)}. Prepara la solicitud con tiempo.`
        }
        actions={
          <>
            <PButton label="Nueva solicitud" icon={Plus} variant="outline" onPress={() => setCreating(true)} />
            <PButton label="Generar memoria" icon={FileText} onPress={() => setMemoryFor(preparing?.id ?? data.subsidies[0]?.id ?? "none")} />
          </>
        }
      />

      <KpiRow>
        <Kpi
          icon={Landmark}
          label="Concedido este curso"
          value={money(granted, { round: true })}
          hint={pendingHalf ? `${money(pendingHalf, { round: true })} llegan al justificar` : "Todo cobrado"}
          emphasis
        />
        <Kpi icon={FileText} label="Próxima ventana" value={`${daysLeft} días`} hint={`Hasta el ${windowLabel(nextWindow)}`} />
        <Kpi icon={Users} label="Asistentes verificados" value={verified} hint="Listos para la memoria" />
        <Kpi icon={ImageIcon} label="Fotos de actividades" value={acts.reduce((a, x) => a + (x.photos ?? 0), 0)} hint={`De ${acts.length} actividades hechas`} />
      </KpiRow>

      {/* Ventanas de solicitud: tira horizontal */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Ventanas de solicitud"
        contentContainerStyle={{ gap: S.sm }}
        style={{ flexGrow: 0, marginBottom: S.lg, marginHorizontal: -S.lg }}
      >
        <View style={{ width: S.lg - S.sm }} />
        {windows.map((w, i) => (
          <View
            key={w}
            style={{
              width: 144,
              borderRadius: R.lg,
              borderWidth: 1,
              borderColor: i === 0 ? `${C.blue}55` : C.border,
              backgroundColor: i === 0 ? C.accentSoft : C.surface,
              paddingHorizontal: 14,
              paddingVertical: S.md,
              gap: 2,
            }}
          >
            <PText v="label" color={i === 0 ? C.blueDeep : C.muted}>{i === 0 ? "Siguiente" : `Ventana ${i + 1}`}</PText>
            <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text, marginTop: 2 }} maxFontSizeMultiplier={1.3}>
              {windowLabel(w)}
            </Text>
            <PText v="tiny">{`en ${daysBetween(today, w)} días`}</PText>
          </View>
        ))}
        <View style={{ width: S.lg - S.sm }} />
      </ScrollView>

      {sorted.length ? (
        sorted.map((s) => {
          const done = s.checklist.filter((c) => c.done).length;
          const stepIdx = STEPS.findIndex((x) => x.id === s.status);
          const ready = done === s.checklist.length;
          return (
            <View key={s.id} style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginBottom: S.lg, overflow: "hidden", ...SHADOW.card }}>
              <View style={{ gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.lg, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md }}>
                  <PText v="h2" style={{ flex: 1 }}>{s.call}</PText>
                  <Pill
                    label={STEPS[stepIdx]?.label ?? ""}
                    tone={s.status === "granted" || s.status === "justified" ? "success" : s.status === "submitted" ? "info" : "warning"}
                  />
                </View>
                <Text style={{ fontSize: 13, color: C.muted, lineHeight: 18 }} maxFontSizeMultiplier={1.4}>
                  {`${s.status === "preparing" ? `Ventana del ${windowLabel(s.window)}` : `Presentada en la ventana del ${shortDay(`${s.window}T12:00:00Z`)}`} · pides `}
                  <Text style={{ fontFamily: FONT.semibold, color: C.text }}>{money(s.requestedCents, { round: true })}</Text>
                </Text>
              </View>

              {/* Estado en cuatro pasos */}
              <View accessibilityLabel={`Estado: ${STEPS[stepIdx]?.label ?? ""}`} style={{ flexDirection: "row", gap: 4, paddingHorizontal: S.lg, paddingTop: S.lg }}>
                {STEPS.map((st, i) => (
                  <View key={st.id} style={{ flex: 1, gap: 6 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= stepIdx ? C.blue : C.input }} />
                    <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: i <= stepIdx ? C.text : C.muted }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                      {st.label}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={{ padding: S.lg, gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <PText v="tiny">{s.status === "granted" ? "Para justificar" : "Requisitos"}</PText>
                  <PText v="tiny">{`${done} de ${s.checklist.length}`}</PText>
                </View>
                <Meter value={done} max={s.checklist.length} tone={ready ? "success" : "violet"} />
                <View style={{ marginTop: S.sm }}>
                  {s.checklist.map((c, i) => (
                    <CheckRow key={c.label} label={c.label} checked={c.done} onPress={() => toggleItem(s, i)} />
                  ))}
                </View>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.md, borderTopWidth: 1, borderTopColor: C.borderLight }}>
                {s.status === "preparing" || s.status === "granted" ? (
                  <PButton
                    small
                    variant="outline"
                    icon={FileText}
                    label={s.status === "granted" ? "Memoria de justificación" : "Generar memoria"}
                    onPress={() => setMemoryFor(s.id)}
                  />
                ) : null}
                {s.status === "preparing" ? (
                  <PButton
                    small
                    disabled={!ready}
                    label={ready ? "Marcar como presentada" : `Faltan ${s.checklist.length - done}`}
                    onPress={() => void advance(s, "submitted", "Solicitud presentada", `Pides ${money(s.requestedCents, { round: true })}. Te avisamos cuando haya resolución.`)}
                  />
                ) : null}
                {s.status === "submitted" ? (
                  <PButton
                    small
                    label="Marcar como concedida"
                    onPress={() => void advance(s, "granted", "Subvención concedida", `Llega el 50 % por adelantado: ${money(Math.round(s.requestedCents / 2), { round: true })}.`)}
                  />
                ) : null}
                {s.status === "granted" ? (
                  <PButton
                    small
                    disabled={!ready}
                    label={ready ? "Marcar como justificada" : `Faltan ${s.checklist.length - done} para justificar`}
                    onPress={() => void advance(s, "justified", "Subvención justificada", `Llega el otro 50 %: ${money(Math.round(s.requestedCents / 2), { round: true })}.`)}
                  />
                ) : null}
              </View>
            </View>
          );
        })
      ) : (
        <Card>
          <Empty
            icon={Landmark}
            title="Aún no has pedido ninguna subvención"
            body="Empieza una solicitud y Franky te dice qué falta. La memoria se prepara sola con tus actividades y asistentes."
            action={<PButton label="Nueva solicitud" onPress={() => setCreating(true)} />}
          />
        </Card>
      )}

      <Panel title="Ayudas del Consejo de Estudiantes" description="Lo que conviene tener presente.">
        <Detail label="Fondo total" value={money(COUNCIL_TOTAL_CENTS, { round: true })} />
        <Detail label="Máximo por asociación y año" value={money(COUNCIL_MAX_CENTS, { round: true })} />
        <Detail label="Cobro" value="50 % al conceder, 50 % al justificar" />
        <Detail label="Ventanas al año" value={windows.length} last />
      </Panel>
      <Tip title="Para no perder el segundo pago">
        Pide las facturas a nombre del CIF de la asociación, pon el logo del Consejo en la publicidad y ten los certificados de Hacienda y Seguridad Social dentro de los 30 días. Franky te avisa antes de cada plazo.
      </Tip>

      <MemorySheet subsidyId={memoryFor} onClose={() => setMemoryFor(null)} />
      <NewSubsidySheet open={creating} onClose={() => setCreating(false)} windows={windows} />
    </ProPage>
  );
}

function MemorySheet({ subsidyId, onClose }: { subsidyId: string | null; onClose: () => void }) {
  const { data, update } = usePro();
  const subsidy = data.subsidies.find((s) => s.id === subsidyId);
  const acts = (data.activities as CommunityActivity[]).filter((a) => a.status === "done").sort((a, b) => b.date.localeCompare(a.date));
  const verified = acts.reduce((a, x) => a + x.checkedIn, 0);
  const photos = acts.reduce((a, x) => a + (x.photos ?? 0), 0);
  const withLogo = acts.filter((a) => a.councilLogo).length;

  const generate = async () => {
    if (subsidy) {
      const ok = await update("subsidy.memory", (d) => ({
        ...d,
        subsidies: d.subsidies.map((x) =>
          x.id === subsidy.id ? { ...x, checklist: x.checklist.map((c) => (/memoria/i.test(c.label) ? { ...c, done: true } : c)) } : x,
        ),
      }));
      if (!ok) return;
    }
    toast("Memoria generada", { kind: "success", body: `${acts.length} actividades, ${verified} asistentes verificados y ${photos} fotos. Lista para adjuntar.` });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(subsidyId)}
      onClose={onClose}
      title="Memoria de actividades"
      description={subsidy ? subsidy.call : "Con tus actividades, asistentes verificados y fotos."}
      footer={<PButton label="Generar memoria en PDF" icon={FileText} onPress={() => void generate()} disabled={!acts.length} />}
    >
      {acts.length ? (
        <>
          <StatRow>
            <StatTile align="left" icon={FileText} label="Actividades" value={acts.length} />
            <StatTile align="left" icon={BadgeCheck} label="Asistentes verificados" value={verified} />
          </StatRow>
          <StatRow>
            <StatTile align="left" icon={ImageIcon} label="Fotos" value={photos} />
            <StatTile align="left" icon={Megaphone} label="Con logo del Consejo" value={`${withLogo}/${acts.length}`} />
          </StatRow>
          <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border }}>
            {acts.map((a, i) => (
              <View
                key={a.id}
                style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: i === acts.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{a.title}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${shortDay(a.date)} · ${a.checkedIn} asistentes con check-in · ${a.photos ?? 0} fotos`}</PText>
                </View>
                {a.councilLogo ? <Pill label="Logo" tone="success" /> : <Pill label="Sin logo" tone="warning" />}
              </View>
            ))}
          </View>
          {withLogo < acts.length ? (
            <PText v="small">
              {`${acts.length - withLogo} actividad no llevó el logo del Consejo en la publicidad. Puedes incluirla, pero quizá no cuente para la justificación.`}
            </PText>
          ) : null}
          <Tip title="Sin hojas de firmas">La lista de asistentes sale del check-in con cuenta universitaria. Nadie tiene que escanear papeles.</Tip>
        </>
      ) : (
        <Empty icon={FileText} title="Aún no hay actividades hechas" body="Cuando cierres tu primera actividad con check-in, aparecerá aquí con sus asistentes y fotos." />
      )}
    </Sheet>
  );
}

function NewSubsidySheet({ open, onClose, windows }: { open: boolean; onClose: () => void; windows: string[] }) {
  const { update } = usePro();
  const [call, setCall] = React.useState("");
  const [win, setWin] = React.useState(windows[0] ?? "");
  const [amount, setAmount] = React.useState("1500");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setCall("Ayudas del Consejo de Estudiantes a asociaciones");
    setWin(windows[0] ?? "");
    setAmount("1500");
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cents = Math.round(Number(amount.replace(",", ".")) * 100) || 0;
  const tooMuch = cents > COUNCIL_MAX_CENTS;

  const save = async () => {
    const s: ProSubsidy = {
      id: localId("sb"),
      call: call.trim(),
      window: win,
      requestedCents: cents,
      status: "preparing",
      checklist: DEFAULT_CHECKLIST.map((label) => ({ label, done: /Registro/.test(label) })),
    };
    if (!(await update("subsidy.create", (d) => ({ ...d, subsidies: [s, ...d.subsidies] })))) return;
    toast("Solicitud empezada", { kind: "success", body: `Tienes hasta el ${windowLabel(win)}. Te avisamos de lo que falte.` });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nueva solicitud"
      description="Franky te dice qué falta y prepara la memoria."
      footer={<PButton label="Empezar solicitud" onPress={() => void save()} disabled={!call.trim() || !cents || tooMuch} />}
    >
      <Field label="Convocatoria">
        <Input value={call} onChangeText={setCall} label="Convocatoria" />
      </Field>
      <Field label="Ventana">
        <ChoiceGrid value={win} onChange={setWin} options={windows.map((w) => ({ value: w, label: windowLabel(w) }))} />
      </Field>
      <Field
        label="Importe que pides"
        hint={tooMuch ? `El máximo es ${money(COUNCIL_MAX_CENTS, { round: true })} por asociación y año.` : "Lo que necesitas para las actividades del proyecto."}
      >
        <View style={{ justifyContent: "center" }}>
          <Input
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            label="Importe que pides en euros"
            style={[{ paddingRight: 32 }, tooMuch ? { borderColor: C.error } : null]}
          />
          <Text style={{ position: "absolute", right: S.md, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.3}>€</Text>
        </View>
      </Field>
      <Field label="Para qué es">
        <Input value={notes} onChangeText={setNotes} multiline placeholder="Festival de cortos, cinefórum semanal y taller de guion." label="Para qué es" />
      </Field>
    </Sheet>
  );
}
