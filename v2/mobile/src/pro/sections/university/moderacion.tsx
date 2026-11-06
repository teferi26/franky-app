import React from "react";
import { Alert, Share, View } from "react-native";
import { AlertTriangle, CheckCircle2, Download, EyeOff, Flag, History, Scale, ShieldCheck, Timer, type LucideIcon } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { ProUniModeration } from "../../../../../shared/pro/types";
import { dayLabel, durationLabel, relative, time } from "../../../../../shared/pro/format";
import { filterHistory, fraudSignals, medianResponseMinutes, moderationCsv, sortModerationQueue } from "../../../../../shared/pro/university";
import type { UniModeration } from "../../../../../shared/pro/university-types";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Chips, Detail, Empty, Field, Input, Kpi, KpiRow, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, Tip } from "../../kit";
import { Card, CardList, EmptyBox, Quote } from "./ui";

type Tab = "pending" | "history";
type Decision = "hidden" | "kept";

const STATUS: Record<ProUniModeration["status"], { label: string; tone: "warning" | "danger" | "success" }> = {
  pending: { label: "Pendiente", tone: "warning" },
  hidden: { label: "Ocultado", tone: "danger" },
  kept: { label: "Se mantiene", tone: "success" },
};

const SCOPE: { icon: LucideIcon; text: string }[] = [
  { icon: ShieldCheck, text: "Solo ves y decides sobre lo publicado en tu campus." },
  { icon: Scale, text: "Quien publicó puede apelar a Franky, que revisa tu decisión." },
  { icon: EyeOff, text: "Ocultar no borra: el contenido deja de verse en tu campus mientras se resuelve." },
];

/** Ocultar retira el contenido del campus: se pide confirmación antes. */
function confirmHide(onConfirm: () => void) {
  Alert.alert("Ocultar este contenido", "Deja de verse en tu campus. Quien lo publicó puede apelar a Franky.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Ocultar", style: "destructive", onPress: onConfirm },
  ]);
}

export default function UniversityModeracion() {
  const { data, now, update, pending: busy } = usePro();
  const [tab, setTab] = React.useState<Tab>("pending");
  const [open, setOpen] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const all = data.uniModeration as UniModeration[];
  // Lo que más daño puede hacer (estafas, acoso) va arriba, no lo más reportado.
  const pending = sortModerationQueue(all.filter((m) => m.status === "pending"));
  const reasons = [...new Set(all.filter((m) => m.status !== "pending").map((m) => m.reason))].sort();
  const history = filterHistory(all, { reason: reason || undefined }).sort((a, b) => (b.decidedAt ?? b.at).localeCompare(a.decidedAt ?? a.at));
  const resolved = data.uniMetrics.find((m) => m.key === "reports");
  const response = medianResponseMinutes(all, now);
  const list = tab === "pending" ? pending : history;

  const exportHistory = () =>
    void Share.share({ title: "Registro de decisiones", message: moderationCsv(history) }).catch(() => undefined);

  const decide = async (m: UniModeration, status: Decision, note?: string) => {
    const who = data.space.owner.firstName;
    const ok = await update("moderation.decide", (d) => ({
      ...d,
      uniModeration: (d.uniModeration as UniModeration[]).map((x) =>
        x.id === m.id ? { ...x, status, decidedAt: now.toISOString(), decidedBy: who, note: note?.trim() || x.note } : x,
      ),
    }));
    if (!ok) return false;
    toast(status === "hidden" ? "Contenido ocultado" : "Contenido mantenido", {
      kind: "success",
      body: status === "hidden" ? "Deja de verse en tu campus. Quien lo publicó puede apelar a Franky." : "Se archivan los reportes y no vuelve a la cola por el mismo motivo.",
    });
    return true;
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow="Moderación"
        title="Moderación del campus"
        description={
          pending.length
            ? `${pending.length} contenidos reportados esperan revisión en tu campus.${resolved ? ` Resuelves el ${resolved.value} % (${resolved.hint?.toLowerCase()}).` : ""}`
            : "No hay nada pendiente. Todo lo reportado en tu campus está revisado."
        }
        actions={pending.length ? <PButton label="Revisar el siguiente" icon={Flag} onPress={() => setOpen(pending[0].id)} /> : null}
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "pending", label: "Pendientes", count: pending.length },
            { value: "history", label: "Historial", count: history.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Flag} label="Pendientes" value={pending.length} hint={pending[0] ? `El más reportado: ${pending[0].reports}` : "Nada en cola"} emphasis={pending.length > 0} />
        <Kpi icon={EyeOff} label="Ocultados" value={all.filter((m) => m.status === "hidden").length} hint="Este mes" />
        <Kpi icon={CheckCircle2} label="Mantenidos" value={all.filter((m) => m.status === "kept").length} hint="Reportes sin fundamento" />
        <Kpi icon={Timer} label="Tiempo de respuesta" value={response === null ? "Sin datos" : durationLabel(response)} hint="Mediana de los últimos 30 días" />
      </KpiRow>

      {tab === "history" && reasons.length ? (
        <>
          <Chips<string> value={reason} onChange={setReason} options={[{ value: "", label: "Todos los motivos" }, ...reasons.map((r) => ({ value: r, label: r }))]} />
          <PButton label="Compartir el registro" icon={Download} variant="outline" small onPress={exportHistory} style={{ marginBottom: S.md }} />
        </>
      ) : null}

      {list.length ? (
        <CardList>
          {list.map((m) => (
            <View key={m.id} style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: "hidden" }}>
              <Card onPress={() => setOpen(m.id)} accessibilityLabel={`${m.reason}, ${m.reports} reportes`} style={{ borderWidth: 0, borderRadius: 0, shadowOpacity: 0, elevation: 0, gap: S.sm }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <Pill tone={m.reports >= 5 ? "danger" : "neutral"} icon={Flag} label={`${m.reports} reportes`} />
                  {m.where ? <Pill label={m.where} /> : null}
                  {m.status !== "pending" ? <Pill tone={STATUS[m.status].tone} label={STATUS[m.status].label} /> : null}
                  <PText v="tiny">{relative(m.at, now.getTime())}</PText>
                </View>
                <PText v="h3">{m.reason}</PText>
                <Quote>{m.content}</Quote>
                {fraudSignals(m.content).length ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                    {fraudSignals(m.content).map((f) => (
                      <Pill key={f.key} tone="danger" icon={AlertTriangle} label={f.label} />
                    ))}
                  </View>
                ) : null}
                {m.status !== "pending" && m.note ? <PText v="tiny">{`Nota: ${m.note}`}</PText> : null}
              </Card>
              {m.status === "pending" ? (
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: S.sm, borderTopWidth: 1, borderTopColor: C.borderLight, paddingHorizontal: S.lg, paddingVertical: S.md }}>
                  <PButton label="Mantener" variant="outline" small disabled={busy} onPress={() => void decide(m, "kept")} />
                  <PButton label="Ocultar" icon={EyeOff} small disabled={busy} onPress={() => confirmHide(() => void decide(m, "hidden"))} />
                </View>
              ) : null}
            </View>
          ))}
        </CardList>
      ) : (
        <EmptyBox>
          <Empty
            icon={tab === "pending" ? ShieldCheck : History}
            title={tab === "pending" ? "Cola vacía" : "Sin historial todavía"}
            body={tab === "pending" ? "Cuando alguien reporte algo publicado en tu campus, aparecerá aquí para que decidas." : "Aquí quedará cada decisión de tu equipo."}
          />
        </EmptyBox>
      )}

      <Panel title="Hasta dónde llega tu moderación">
        <View style={{ gap: S.md }}>
          {SCOPE.map(({ icon: Icon, text }) => (
            <View key={text} style={{ flexDirection: "row", gap: S.sm }}>
              <Icon size={16} color={C.blue} strokeWidth={1.9} style={{ marginTop: 2 }} />
              <PText v="body" color={C.muted} style={{ flex: 1 }}>{text}</PText>
            </View>
          ))}
        </View>
      </Panel>
      <Tip title="Primero lo que más daña">
        La cola se ordena por daño: lo grave y lo que tiene señales de fraude va arriba. Las estafas de pisos y de trabajo que piden el DNI conviene ocultarlas en cuanto las veas: suelen ir a por los de primero y los Erasmus.
      </Tip>

      <ModerationSheet id={open} onClose={() => setOpen(null)} onDecide={decide} />
    </ProPage>
  );
}

function ModerationSheet({ id, onClose, onDecide }: { id: string | null; onClose: () => void; onDecide: (m: UniModeration, status: Decision, note?: string) => Promise<boolean> }) {
  const { data, now, pending } = usePro();
  const [note, setNote] = React.useState("");
  const m = (data.uniModeration as UniModeration[]).find((x) => x.id === id);

  React.useEffect(() => {
    setNote("");
  }, [id]);

  if (!m) return null;

  const act = async (status: Decision) => {
    if (await onDecide(m, status, note)) onClose();
  };
  const hide = () => confirmHide(() => void act("hidden"));

  return (
    <Sheet
      open={Boolean(id)}
      onClose={onClose}
      title={m.reason}
      description={`${m.where ?? "Contenido"} · ${dayLabel(m.at)} a las ${time(m.at)}`}
      footer={
        m.status === "pending" ? (
          <>
            <PButton label="Mantener" variant="outline" disabled={pending} onPress={() => void act("kept")} />
            <PButton label="Ocultar" icon={EyeOff} disabled={pending} onPress={hide} />
          </>
        ) : m.status === "hidden" ? (
          <PButton label="Volver a mostrar" variant="outline" disabled={pending} onPress={() => void act("kept")} />
        ) : (
          <PButton label="Ocultar ahora" variant="outline" disabled={pending} onPress={hide} />
        )
      }
    >
      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, padding: S.md }}>
        <PText v="body" color={m.status === "hidden" ? C.muted : C.text}>{m.content}</PText>
      </View>
      {fraudSignals(m.content).length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {fraudSignals(m.content).map((f) => (
            <Pill key={f.key} tone="danger" icon={AlertTriangle} label={f.label} />
          ))}
        </View>
      ) : null}
      <View>
        <Detail label="Reportes" value={m.reports} />
        <Detail label="Dónde" value={m.where ?? "Campus"} />
        {m.decidedAt ? <Detail label="Decidido" value={`${relative(m.decidedAt, now.getTime())}${m.decidedBy ? ` por ${m.decidedBy}` : ""}`} /> : null}
        <Detail label="Estado" value={<Pill tone={STATUS[m.status].tone} label={STATUS[m.status].label} />} last />
      </View>
      {m.note && m.status !== "pending" ? (
        <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md, gap: 2 }}>
          <PText v="tiny">Nota interna</PText>
          <PText v="small" color={C.text}>{m.note}</PText>
        </View>
      ) : null}
      {m.status === "pending" ? (
        <Field label="Nota interna (opcional)" hint="La ve tu equipo y Franky si hay apelación.">
          <Input value={note} onChangeText={setNote} multiline placeholder="Por qué lo ocultas o lo mantienes." label="Nota interna" />
        </Field>
      ) : null}
      <PText v="tiny">Si quien lo publicó no está de acuerdo, puede apelar a Franky. Te avisaremos del resultado.</PText>
    </Sheet>
  );
}
