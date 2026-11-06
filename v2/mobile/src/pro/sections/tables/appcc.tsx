import React from "react";
import { ScrollView, Text, View } from "react-native";
import { AlertTriangle, Check, Recycle, Share2, Thermometer, Trash2 } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProData } from "../../../../../shared/pro/types";
import type {
  ProColdUnit,
  ProHaccpEntry,
  ProHaccpMoment,
  ProHaccpTask,
  ProTablesOps,
  ProWasteEntry,
  ProWasteFate,
} from "../../../../../shared/pro/tables-types";
import { WASTE_FATES, haccpMoment, haccpMonth, tempInRange, wasteSummary } from "../../../../../shared/pro/tables-ops";
import { capitalize, dayLabel, localDate, localMinutes, money, plural, relative, time } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  ChoiceGrid,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  Meter,
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Sheet,
  Tip,
} from "../../kit";
import { MoneyField, OpsMissing, parseEuros, shareCsv, shareText, staffFirstName, useTablesOps } from "./ops";
import { statusTone } from "./ui";

/**
 * APPCC diario, versión nativa de web/.../tables/appcc.tsx: temperaturas con
 * su rango, limpiezas de apertura y cierre, sobras del día y el registro del
 * mes para compartir con la gestoría o una inspección.
 */

type Tab = "hoy" | "sobras" | "historial";

const QUICK_ACTIONS = [
  "Cerrar bien la puerta y volver a medir en 30 minutos",
  "Pasar el producto a otra nevera",
  "Retirar el producto afectado",
  "Avisar al técnico de frío",
];

export default function TablesAppcc() {
  const { data, now } = usePro();
  const { ops } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("hoy");
  if (!ops) {
    return (
      <ProPage>
        <PageHeader eyebrow="APPCC" title="Temperaturas, limpieza y sobras" />
        <OpsMissing icon={Thermometer} title="Sin registros todavía" />
      </ProPage>
    );
  }

  const today = localDate(now);
  const open = haccpMoment(ops, today, "apertura");
  const close = haccpMoment(ops, today, "cierre");
  const month = wasteSummary(ops, today.slice(0, 7));
  const days = haccpMonth(ops, today.slice(0, 7), today);
  const complete = days.filter((d) => d.complete).length;
  const alerts = days.reduce((a, d) => a + d.alerts, 0);
  const openDone = open.temps.length + open.tasks.length - open.pending;

  const summary =
    open.pending === 0 && close.pending === 0
      ? "Hoy lo tienes todo apuntado. Listo para cualquier inspección."
      : open.pending > 0
        ? `Apertura: ${openDone} de ${open.temps.length + open.tasks.length} hechos. Te faltan ${plural(open.pending, "registro", "registros")}.`
        : `Apertura hecha. Al cerrar te quedan ${plural(close.pending, "registro", "registros")}.`;

  return (
    <ProPage>
      <PageHeader eyebrow="APPCC" title="Temperaturas, limpieza y sobras" description={summary}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "hoy", label: "Hoy", count: open.pending + close.pending },
            { value: "sobras", label: "Desperdicio" },
            { value: "historial", label: "Historial" },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Thermometer} label="Días completos" value={`${complete}/${days.length}`} hint="este mes" />
        <Kpi
          icon={AlertTriangle}
          label="Fuera de rango"
          value={alerts}
          hint={alerts ? "todas con acción apuntada" : "ninguna este mes"}
        />
        <Kpi
          icon={Recycle}
          label="Sobras aprovechadas"
          value={`${month.savedPct} %`}
          hint={`${money(month.savedCents, { round: true })} que no fueron a la basura`}
          emphasis
        />
        <Kpi
          icon={Trash2}
          label="Tirado este mes"
          value={money(month.byFate.tirado.valueCents, { round: true })}
          hint={plural(month.byFate.tirado.count, "registro", "registros")}
        />
      </KpiRow>

      {tab === "hoy" ? <TodayTab /> : tab === "sobras" ? <WasteTab /> : <HistoryTab />}
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Hoy                                                                  */
/* ------------------------------------------------------------------ */

function TodayTab() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const [who, setWho] = React.useState(data.staff[0]?.id ?? "");
  const [reading, setReading] = React.useState<ProColdUnit | null>(null);
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const first: ProHaccpMoment = nowMin < 16 * 60 ? "apertura" : "cierre";
  const moments: ProHaccpMoment[] = first === "apertura" ? ["apertura", "cierre"] : ["cierre", "apertura"];
  const weekly = ops.haccpTasks.filter((t) => t.moment === "semanal");

  const markTask = async (task: ProHaccpTask, moment: ProHaccpMoment) => {
    const entry: ProHaccpEntry = {
      id: localId("hc"),
      at: now.toISOString(),
      date: today,
      moment,
      staffId: who,
      taskId: task.id,
      ok: true,
    };
    if (!(await save("haccp.task", (o) => ({ ...o, haccpLog: [...o.haccpLog, entry] })))) return;
    toast("Hecho", { kind: "success", body: `${task.name}, por ${staffFirstName(data, who)}.` });
  };

  return (
    <>
      <PText v="h3" style={{ marginBottom: S.sm }}>
        Quién lo apunta
      </PText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }} style={{ flexGrow: 0, marginBottom: S.lg }}>
        {data.staff.map((s) => {
          const active = who === s.id;
          return (
            <Tap
              key={s.id}
              onPress={() => setWho(s.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Apunta ${s.name}`}
              style={{
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingLeft: 4,
                paddingRight: S.md,
                borderRadius: R.full,
                borderWidth: 1,
                borderColor: active ? C.blue : C.border,
                backgroundColor: active ? C.accentSoft : C.surface,
              }}
            >
              <PAvatar name={s.name} toneKey={s.tone} size={32} />
              <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: active ? C.blueDeep : C.text }} maxFontSizeMultiplier={1.3}>
                {s.name.split(" ")[0]}
              </Text>
            </Tap>
          );
        })}
      </ScrollView>

      {moments.map((moment) => {
        const state = haccpMoment(ops, today, moment);
        const total = state.temps.length + state.tasks.length;
        return (
          <Panel
            key={moment}
            title={moment === "apertura" ? "Al abrir" : "Al cerrar"}
            description={state.pending ? `${total - state.pending} de ${total} apuntados` : "Todo apuntado"}
            action={state.pending === 0 ? <Pill tone="success" icon={Check} label="Completo" /> : null}
            flush
          >
            <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
              <Meter value={total - state.pending} max={total} tone={state.pending ? "violet" : "success"} />
            </View>
            <PText v="label" style={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: 4 }}>
              Temperaturas
            </PText>
            {state.temps.map(({ unit, entry }) => {
              const t = statusTone(entry && !entry.ok ? "rose" : "emerald");
              return (
                <ListRow key={unit.id}>
                  <Thermometer size={16} color={entry && !entry.ok ? C.error : C.muted} strokeWidth={1.9} />
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>
                      {unit.name}
                    </PText>
                    <PText v="tiny">
                      {`Entre ${unit.min} y ${unit.max} grados${entry ? `, ${staffFirstName(data, entry.staffId)} a las ${time(entry.at)}` : ""}`}
                    </PText>
                  </View>
                  {entry ? (
                    <Tap
                      onPress={() => setReading(unit)}
                      accessibilityRole="button"
                      accessibilityLabel={`Cambiar lectura de ${unit.name}`}
                      style={{ minWidth: 72, minHeight: 44, borderRadius: R.md, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: S.md }}
                    >
                      <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: t.fg }} maxFontSizeMultiplier={1.2}>
                        {`${entry.value} º`}
                      </Text>
                    </Tap>
                  ) : (
                    <PButton label="Apuntar" small onPress={() => setReading(unit)} />
                  )}
                </ListRow>
              );
            })}
            {state.tasks.length ? (
              <>
                <PText v="label" style={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: 4 }}>
                  Limpieza
                </PText>
                {state.tasks.map(({ task, entry }, i) => (
                  <ListRow key={task.id} last={i === state.tasks.length - 1}>
                    <View style={{ flex: 1 }}>
                      <PText
                        v="h3"
                        numberOfLines={1}
                        color={entry ? C.muted : C.text}
                        style={entry ? { textDecorationLine: "line-through" } : undefined}
                      >
                        {task.name}
                      </PText>
                      <PText v="tiny">
                        {`${task.zone}${entry ? `, ${staffFirstName(data, entry.staffId)} a las ${time(entry.at)}` : ""}`}
                      </PText>
                    </View>
                    {entry ? (
                      <Check size={20} color={C.success} strokeWidth={2.2} accessibilityLabel="Hecho" />
                    ) : (
                      <PButton label="Hecho" variant="outline" small onPress={() => void markTask(task, moment)} />
                    )}
                  </ListRow>
                ))}
              </>
            ) : null}
          </Panel>
        );
      })}

      {weekly.length ? (
        <Panel title="Cada semana" flush>
          {weekly.map((task, i) => {
            const last = ops.haccpLog.filter((e) => e.taskId === task.id).sort((a, b) => b.at.localeCompare(a.at))[0];
            const days = last ? Math.floor((now.getTime() - Date.parse(last.at)) / 86_400_000) : null;
            const due = days === null || days >= 7;
            return (
              <ListRow key={task.id} last={i === weekly.length - 1}>
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>
                    {task.name}
                  </PText>
                  <PText v="tiny" color={due ? C.warning : C.muted}>
                    {last ? `Última vez ${relative(last.at, now.getTime())}` : "Sin hacer todavía"}
                  </PText>
                </View>
                <PButton
                  label="Hecho"
                  variant={due ? "dark" : "outline"}
                  small
                  onPress={() => void markTask(task, nowMin < 16 * 60 ? "apertura" : "cierre")}
                />
              </ListRow>
            );
          })}
        </Panel>
      ) : null}

      <AlertsPanel />

      <Tip title="Si algo se sale de rango">
        Apunta la lectura igualmente y qué hiciste. Una alerta con su acción correctora es justo lo que quiere ver una inspección.
      </Tip>

      <ReadingSheet unit={reading} staffId={who} onClose={() => setReading(null)} />
    </>
  );
}

function AlertsPanel() {
  const { data, now } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const month = localDate(now).slice(0, 7);
  const list = ops.haccpLog.filter((e) => !e.ok && e.date.startsWith(month)).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Panel title="Alertas del mes" flush>
      {list.length ? (
        list.map((e, i) => {
          const unit = ops.coldUnits.find((u) => u.id === e.unitId);
          return (
            <View
              key={e.id}
              style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: 3, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={15} color={C.error} strokeWidth={1.9} />
                <PText v="h3">{`${unit?.name ?? "Registro"}: ${e.value} º`}</PText>
              </View>
              <PText v="tiny">{`${capitalize(dayLabel(e.at))}, ${time(e.at)}, ${staffFirstName(data, e.staffId)}`}</PText>
              {e.action ? <PText v="body">{e.action}</PText> : null}
            </View>
          );
        })
      ) : (
        <View style={{ padding: S.lg }}>
          <PText v="small">Ninguna lectura fuera de rango este mes.</PText>
        </View>
      )}
    </Panel>
  );
}

function ReadingSheet({ unit, staffId, onClose }: { unit: ProColdUnit | null; staffId: string; onClose: () => void }) {
  const { now } = usePro();
  const { save } = useTablesOps();
  const [text, setText] = React.useState("");
  const [action, setAction] = React.useState("");
  React.useEffect(() => {
    setText("");
    setAction("");
  }, [unit]);
  if (!unit) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const value = Number(text.replace(",", "."));
  const valid = text.trim() !== "" && text.trim() !== "-" && Number.isFinite(value) && value > -40 && value < 40;
  const ok = valid && tempInRange(unit, value);
  const moment: ProHaccpMoment = localMinutes(now) < 16 * 60 ? "apertura" : "cierre";
  const rose = statusTone("rose");

  const submit = async () => {
    const entry: ProHaccpEntry = {
      id: localId("hc"),
      at: now.toISOString(),
      date: localDate(now),
      moment,
      staffId,
      unitId: unit.id,
      value: Math.round(value * 10) / 10,
      ok,
      action: ok ? undefined : action.trim(),
    };
    if (!(await save("haccp.temp", (o) => ({ ...o, haccpLog: [...o.haccpLog, entry] })))) return;
    if (ok) toast("Temperatura apuntada", { kind: "success", body: `${unit.name}: ${entry.value} grados.` });
    else toast("Apuntada con acción correctora", { kind: "info", body: unit.name });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={unit.name}
      description={`Correcto entre ${unit.min} y ${unit.max} grados`}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar lectura" disabled={!valid || (!ok && action.trim().length < 5)} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Temperatura (grados)">
        <Input
          label="Temperatura en grados"
          autoFocus
          keyboardType="numbers-and-punctuation"
          value={text}
          onChangeText={(t) => setText(t.replace(/[^\d,.-]/g, ""))}
          placeholder={String((unit.min + unit.max) / 2)}
          style={{ minHeight: 60, textAlign: "center", fontSize: 28, fontFamily: FONT.heading }}
        />
      </Field>
      {valid && !ok ? (
        <View style={{ borderRadius: R.lg, backgroundColor: rose.bg, borderWidth: 1, borderColor: rose.border, padding: S.md, gap: S.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={15} color={rose.fg} strokeWidth={1.9} />
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: rose.fg }} maxFontSizeMultiplier={1.3}>
              Fuera de rango
            </Text>
          </View>
          <PText v="small" color={rose.fg}>
            Apunta qué has hecho para corregirlo.
          </PText>
          <View style={{ gap: S.xs }}>
            {QUICK_ACTIONS.map((q) => (
              <Tap
                key={q}
                onPress={() => setAction((prev) => (prev ? `${prev}. ${q}` : q))}
                accessibilityRole="button"
                style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 1, borderColor: rose.border, backgroundColor: C.surface }}
              >
                <PText v="small" color={C.text}>
                  {q}
                </PText>
              </Tap>
            ))}
          </View>
          <Input label="Acción correctora" multiline value={action} onChangeText={setAction} />
        </View>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Desperdicio                                                          */
/* ------------------------------------------------------------------ */

const FATE_TONE: Record<ProWasteFate, "success" | "info" | "violet" | "danger"> = {
  vendido: "violet",
  donado: "info",
  aprovechado: "success",
  tirado: "danger",
};

function fateColor(fate: ProWasteFate): string {
  return fate === "vendido" ? C.blue : fate === "donado" ? "#0EA5E9" : fate === "aprovechado" ? C.success : C.error;
}

function WasteTab() {
  const { data, now, vertical } = usePro();
  const { ops } = useTablesOps();
  const [open, setOpen] = React.useState(false);
  if (!ops) return null;
  const month = localDate(now).slice(0, 7);
  const summary = wasteSummary(ops, month);
  const list = ops.waste.filter((w) => w.date.startsWith(month)).sort((a, b) => b.at.localeCompare(a.at));
  const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", timeZone: "Europe/Madrid" });

  return (
    <>
      <Panel
        title={`Sobras de ${monthName}`}
        description={`${plural(summary.entries, "registro", "registros")} en ${plural(summary.days, "día", "días")}`}
        action={<PButton label="Apuntar" small onPress={() => setOpen(true)} />}
      >
        {summary.totalCents ? (
          <>
            <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: C.input }}>
              {WASTE_FATES.map((f) => (
                <View
                  key={f.id}
                  style={{ height: "100%", width: `${(summary.byFate[f.id].valueCents / summary.totalCents) * 100}%`, backgroundColor: fateColor(f.id) }}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: S.md, rowGap: S.md }}>
              {WASTE_FATES.map((f) => (
                <View key={f.id} style={{ width: "50%", gap: 4 }}>
                  <Pill tone={FATE_TONE[f.id]} label={f.label} />
                  <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.2}>
                    {money(summary.byFate[f.id].valueCents, { round: true })}
                  </Text>
                  <PText v="tiny">{plural(summary.byFate[f.id].count, "vez", "veces")}</PText>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Empty
            icon={Recycle}
            title="Sin sobras apuntadas este mes"
            body="Al cerrar, apunta lo que sobra y qué haces con ello. El resumen del mes se escribe solo."
          />
        )}
      </Panel>

      <Panel title="Tu plan contra el desperdicio">
        <PText v="body" color={C.muted}>
          Con lo que apuntas cada día, Franky prepara el resumen del mes: qué sobra, qué se vende, se dona o se aprovecha y qué acaba en la basura.
        </PText>
        {summary.topThrown.length ? (
          <View style={{ marginTop: S.md, borderRadius: R.md, backgroundColor: C.input, padding: S.md, gap: 4 }}>
            <PText v="h3">Lo que más tiras</PText>
            {summary.topThrown.map((t) => (
              <View key={t.item} style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
                <PText v="small" numberOfLines={1} style={{ flex: 1 }}>
                  {t.item}
                </PText>
                <PText v="small">{money(t.valueCents, { round: true })}</PText>
              </View>
            ))}
          </View>
        ) : null}
        <PButton
          label="Compartir el resumen del mes"
          icon={Share2}
          variant="outline"
          full
          style={{ marginTop: S.md }}
          onPress={() => shareText(`Desperdicio ${monthName}`, wasteText(data.space.name, monthName, summary, list))}
        />
      </Panel>

      <Panel title="Últimos registros" flush>
        {list.length ? (
          list.slice(0, 20).map((w, i, arr) => (
            <ListRow key={w.id} last={i === arr.length - 1}>
              <PText v="tiny" style={{ width: 40 }}>{`${w.date.slice(8)}/${w.date.slice(5, 7)}`}</PText>
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>
                  {`${w.qty} ${w.unit === "ud" ? "" : `${w.unit} de `}${w.item.toLowerCase()}`}
                </PText>
                {w.reason ? (
                  <PText v="tiny" numberOfLines={1}>
                    {w.reason}
                  </PText>
                ) : null}
              </View>
              <Pill tone={FATE_TONE[w.fate]} label={capitalize(w.fate)} />
            </ListRow>
          ))
        ) : (
          <View style={{ padding: S.lg }}>
            <PText v="small">Aún no hay registros.</PText>
          </View>
        )}
      </Panel>

      <Tip title="Antes de tirar">
        {vertical.id === "cafe"
          ? "Desde Hoy puedes lanzar lo que sobra por la tarde como pack de última hora para los estudiantes de al lado."
          : "Ofrece siempre llevarse lo que sobra del plato. Y lo que sobre en cocina, apúntalo aquí aunque sea para la comida del equipo."}
      </Tip>

      <WasteSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function WasteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { save } = useTablesOps();
  const [item, setItem] = React.useState("");
  const [qty, setQty] = React.useState("1");
  const [unit, setUnit] = React.useState<ProWasteEntry["unit"]>("ud");
  const [fate, setFate] = React.useState<ProWasteFate>("vendido");
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setItem("");
    setQty("1");
    setUnit("ud");
    setFate("vendido");
    setValue("");
    setReason("");
  }, [open]);
  const suggestions = data.menu.filter((m) => m.available).slice(0, 8).map((m) => m.name);
  const amount = Number(qty.replace(",", "."));
  const valid = item.trim().length > 1 && amount > 0;

  const submit = async () => {
    const entry: ProWasteEntry = {
      id: localId("ws"),
      date: localDate(now),
      at: now.toISOString(),
      item: item.trim(),
      qty: amount,
      unit,
      fate,
      valueCents: parseEuros(value) ?? 0,
      reason: reason.trim() || undefined,
    };
    if (!(await save("waste.add", (o) => ({ ...o, waste: [...o.waste, entry] })))) return;
    toast("Sobras apuntadas", { kind: "success", body: `${entry.qty} ${entry.item.toLowerCase()}: ${fate}.` });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Apuntar sobras"
      description="Lo que sobra hoy y qué haces con ello."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" disabled={!valid} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Qué ha sobrado">
        <Input label="Qué ha sobrado" value={item} onChangeText={setItem} placeholder="Croissants, raciones de arroz..." />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          {suggestions.map((s) => (
            <PButton key={s} label={s} variant="outline" small onPress={() => setItem(s)} />
          ))}
        </View>
      </Field>
      <Field label="Cantidad">
        <Input label="Cantidad" keyboardType="decimal-pad" value={qty} onChangeText={setQty} />
      </Field>
      <Field label="Unidad">
        <ChoiceGrid
          value={unit}
          onChange={setUnit}
          options={[
            { value: "ud", label: "ud" },
            { value: "raciones", label: "raciones" },
            { value: "kg", label: "kg" },
          ]}
        />
      </Field>
      <Field label="Qué has hecho con ello">
        <ChoiceGrid value={fate} onChange={setFate} options={WASTE_FATES.map((f) => ({ value: f.id, label: f.label }))} />
      </Field>
      <MoneyField label="Valor aproximado" value={value} onChange={setValue} hint="Lo que te costó. Sirve para ver cuánto dinero salvas." />
      <Field label="Nota">
        <Input label="Nota" value={reason} onChangeText={setReason} placeholder="Entregado a la parroquia, comida del equipo..." />
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Historial                                                            */
/* ------------------------------------------------------------------ */

function HistoryTab() {
  const { data, now } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const today = localDate(now);
  const days = haccpMonth(ops, today.slice(0, 7), today);
  const firstWeekday = (new Date(`${today.slice(0, 7)}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: ({ date: string; complete: boolean; alerts: number } | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...days,
  ];
  const green = statusTone("emerald");
  const amber = statusTone("amber");

  return (
    <>
      <Panel title="Este mes" description="Verde: apertura y cierre completos. Ámbar: falta algún registro.">
        <View style={{ flexDirection: "row", marginBottom: 6 }}>
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
            <PText key={d} v="tiny" style={{ flex: 1, textAlign: "center", fontFamily: FONT.semibold }}>
              {d}
            </PText>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {cells.map((d, i) => {
            const t = d?.complete ? green : amber;
            return (
              <View key={d?.date ?? `e${i}`} style={{ width: `${100 / 7}%`, padding: 2 }}>
                {d ? (
                  <View
                    accessible
                    accessibilityLabel={`Día ${Number(d.date.slice(8))}: ${d.complete ? "completo" : "falta algún registro"}${d.alerts ? `, ${plural(d.alerts, "alerta", "alertas")}` : ""}`}
                    style={{
                      height: 40,
                      borderRadius: R.sm,
                      backgroundColor: t.bg,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: d.date === today ? 2 : 0,
                      borderColor: C.blue,
                    }}
                  >
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: t.fg }} maxFontSizeMultiplier={1.2}>
                      {Number(d.date.slice(8))}
                    </Text>
                    {d.alerts ? (
                      <View style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: C.error }} />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </Panel>
      <Panel title="Para una inspección">
        <PText v="body" color={C.muted}>
          Comparte todas las lecturas y limpiezas del mes con quién las hizo y a qué hora, más las acciones correctoras. Para imprimirlo, ábrelo en el ordenador.
        </PText>
        <PButton
          label="Compartir registro del mes"
          icon={Share2}
          full
          style={{ marginTop: S.md }}
          onPress={() =>
            shareCsv(`APPCC ${today.slice(0, 7)}`, [
              ["Fecha", "Hora", "Momento", "Qué", "Lectura", "Rango", "Estado", "Acción correctora", "Quién"],
              ...monthRows(data, ops, today),
            ])
          }
        />
      </Panel>
      <AlertsPanel />
    </>
  );
}

function monthRows(data: ProData, ops: ProTablesOps, today: string): string[][] {
  const month = today.slice(0, 7);
  return ops.haccpLog
    .filter((e) => e.date.startsWith(month))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e) => {
      const unit = ops.coldUnits.find((u) => u.id === e.unitId);
      const task = ops.haccpTasks.find((t) => t.id === e.taskId);
      return [
        e.date,
        time(e.at),
        e.moment,
        unit ? unit.name : task?.name ?? "",
        unit ? `${e.value}` : "Hecho",
        unit ? `${unit.min} a ${unit.max}` : "",
        e.ok ? "Correcto" : "Fuera de rango",
        e.action ?? "",
        data.staff.find((s) => s.id === e.staffId)?.name ?? "",
      ];
    });
}

function wasteText(
  name: string,
  monthName: string,
  summary: ReturnType<typeof wasteSummary>,
  list: ProWasteEntry[],
): string {
  const fates = WASTE_FATES.map(
    (f) => `${f.label}: ${plural(summary.byFate[f.id].count, "vez", "veces")}, ${money(summary.byFate[f.id].valueCents)}`,
  );
  const rows = list.map((w) => `${w.date} ${w.item}, ${w.qty} ${w.unit}, ${w.fate}${w.reason ? ` (${w.reason})` : ""}`);
  return [
    `Prevención del desperdicio alimentario: ${name}, ${monthName}`,
    ...fates,
    `Valor que no acabó en la basura: ${summary.savedPct} %`,
    "",
    ...rows,
  ].join("\n");
}
