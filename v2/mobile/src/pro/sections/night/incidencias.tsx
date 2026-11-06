import React from "react";
import { Alert, View } from "react-native";
import { Ban, Download, MessageCircle, NotebookPen, Plus, ShieldCheck, X } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, S } from "@/theme";
import type { ProBan, ProIncidentKind } from "../../../../../shared/pro/night-types";
import { addDays, atLocal, localMinutes, minutesToLabel, shortDay } from "../../../../../shared/pro/format";
import { focusEvent, nightOf } from "../../../../../shared/pro/night";
import {
  INCIDENT_KINDS,
  activeBans,
  banActive,
  eventOfNight,
  incidentReport,
  incidentsOfNight,
  nightTitle,
} from "../../../../../shared/pro/night-ops";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Chips, Empty, Field, Input, Kpi, KpiRow, ListRow, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, Tip, Toggle } from "../../kit";
import { IncidentSheet, SignerChips, defaultSigner, openWhatsApp, shareCsv, useNightOps } from "./ops-ui";
import { accessConditionsOf, addBan, bansByCondition, setAccessConditions } from "../../../../../shared/pro/night-guests";

/**
 * Libro de incidencias y vetados: versión nativa de web/.../night/incidencias.tsx.
 * Pensada para apuntar algo en el momento, con el móvil en la mano.
 */

type Tab = "libro" | "vetados";
type KindFilter = "all" | ProIncidentKind;

export default function NightIncidencias() {
  const { data, now } = usePro();
  const { ops } = useNightOps();
  const [tab, setTab] = React.useState<Tab>("libro");
  const [adding, setAdding] = React.useState(false);
  const [banning, setBanning] = React.useState(false);

  const today = nightOf(now);
  const monthAgo = addDays(today, -30);
  const month = ops.incidents.filter((i) => i.night >= monthAgo);
  const serious = month.filter((i) => i.kind === "pelea" || i.kind === "expulsion" || i.kind === "sanitaria").length;
  const bans = activeBans(ops, now);
  const last = [...ops.incidents].sort((a, b) => b.at.localeCompare(a.at))[0];
  const ev = focusEvent(data, now);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Libro de incidencias"
        title="Incidencias"
        description={
          last
            ? `${month.length} en los últimos 30 días. La última, ${INCIDENT_KINDS[last.kind].label.toLowerCase()} el ${nightTitle(last.night).toLowerCase()}. Todo con hora y quién lo apuntó.`
            : "Apunta en el momento lo que pase cada noche. Con hora y autor, sirve para aprender y para enseñarlo si hay una inspección."
        }
        actions={
          tab === "libro" ? (
            <PButton label="Apuntar incidencia" icon={NotebookPen} onPress={() => setAdding(true)} />
          ) : (
            <PButton label="Añadir vetado" icon={Ban} onPress={() => setBanning(true)} />
          )
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "libro", label: "Libro", count: ops.incidents.length },
            { value: "vetados", label: "Vetados", count: bans.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={NotebookPen} label="Últimos 30 días" value={month.length} hint={`${serious} de seguridad o salud`} />
        <Kpi label="Esta noche" value={incidentsOfNight(ops, today).length} hint={ev ? ev.name : "Sin evento"} />
        <Kpi icon={Ban} label="Vetados" value={bans.length} hint="Salen en rojo en puerta" onPress={() => setTab("vetados")} />
        <Kpi
          label="Quejas de vecinos"
          value={month.filter((i) => i.kind === "vecinos").length}
          hint="En 30 días"
          emphasis={month.some((i) => i.kind === "vecinos")}
        />
      </KpiRow>

      {tab === "libro" ? <BookView onAdd={() => setAdding(true)} /> : <BansView onAdd={() => setBanning(true)} />}

      <IncidentSheet open={adding} onClose={() => setAdding(false)} event={ev && ev.date === today ? ev : null} />
      <BanSheet open={banning} onClose={() => setBanning(false)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Libro                                                               */
/* ------------------------------------------------------------------ */

function BookView({ onAdd }: { onAdd: () => void }) {
  const { data } = usePro();
  const { ops } = useNightOps();
  const [kind, setKind] = React.useState<KindFilter>("all");
  const list = ops.incidents.filter((i) => kind === "all" || i.kind === kind);
  const nights = [...new Set(list.map((i) => i.night))].sort((a, b) => b.localeCompare(a));
  const kinds = (Object.keys(INCIDENT_KINDS) as ProIncidentKind[]).filter((k) => ops.incidents.some((i) => i.kind === k));

  const exportCsv = () =>
    shareCsv(`Incidencias de ${data.space.name}`, [
      ["Noche", "Hora", "Tipo", "Detalle", "Apuntó"],
      ...[...ops.incidents]
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((i) => [i.night, minutesToLabel(localMinutes(i.at)), INCIDENT_KINDS[i.kind].label, i.description, i.by]),
    ]);

  if (!ops.incidents.length) {
    return (
      <Panel>
        <Empty
          icon={ShieldCheck}
          title="Ninguna incidencia apuntada"
          body="Cuando pase algo (una pelea, un aviso de los vecinos, un objeto perdido) apúntalo en el momento desde aquí o desde Puerta."
          action={<PButton label="Apuntar incidencia" icon={Plus} onPress={onAdd} />}
        />
      </Panel>
    );
  }

  return (
    <>
      <Chips<KindFilter>
        value={kind}
        onChange={setKind}
        options={[{ value: "all", label: "Todas" }, ...kinds.map((k) => ({ value: k, label: INCIDENT_KINDS[k].label }))]}
      />
      {nights.map((night) => {
        const items = incidentsOfNight(ops, night).filter((i) => kind === "all" || i.kind === kind);
        const ev = eventOfNight(data, night);
        const report = incidentReport(data.space, night, incidentsOfNight(ops, night));
        return (
          <Panel
            key={night}
            title={nightTitle(night)}
            description={ev ? ev.name : undefined}
            action={
              <PButton
                label="Informe"
                icon={MessageCircle}
                variant="ghost"
                small
                accessibilityLabel={`Enviar el informe del ${nightTitle(night)}`}
                onPress={() => openWhatsApp(report)}
              />
            }
            flush
          >
            {items.map((i, idx) => (
              <ListRow key={i.id} last={idx === items.length - 1}>
                <PText v="tiny" style={{ width: 42, alignSelf: "flex-start", marginTop: 2 }}>
                  {minutesToLabel(localMinutes(i.at))}
                </PText>
                <View style={{ flex: 1, gap: 4 }}>
                  <Pill label={INCIDENT_KINDS[i.kind].label} tone={INCIDENT_KINDS[i.kind].tone} />
                  <PText v="small" color={C.text}>{i.description}</PText>
                  <PText v="tiny">{`Apuntó ${i.by}`}</PText>
                </View>
              </ListRow>
            ))}
          </Panel>
        );
      })}
      <PButton label="Exportar el libro" icon={Download} variant="outline" full onPress={exportCsv} style={{ marginBottom: S.lg }} />
      <Tip title="Apunta en el momento">
        Hora, qué pasó y qué hicisteis, sin opiniones. Si llega una inspección o una queja, el libro de cada noche se envía en un toque.
      </Tip>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Vetados                                                             */
/* ------------------------------------------------------------------ */

function BansView({ onAdd }: { onAdd: () => void }) {
  const { now } = usePro();
  const { ops, setOps } = useNightOps();
  const active = activeBans(ops, now).sort((a, b) => b.since.localeCompare(a.since));
  const expired = ops.bans.filter((b) => !banActive(b, now));

  const lift = (ban: ProBan) =>
    Alert.alert(`¿Quitar el veto a ${ban.name}?`, "Podrá volver a entrar desde esta noche.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar veto",
        style: "destructive",
        onPress: async () => {
          const ok = await setOps("ban.lift", (o) => ({
            ...o,
            bans: o.bans.map((b) => (b.id === ban.id ? { ...b, until: addDays(nightOf(new Date()), -1) } : b)),
          }));
          if (ok) toast(`${ban.name} puede volver a entrar`, { kind: "success" });
        },
      },
    ]);

  return (
    <>
      <Panel title="Con el acceso denegado" description="Al buscarlos o escanearlos en Puerta salen en rojo con el motivo." flush>
        {active.length ? (
          active.map((b, i) => (
            <ListRow key={b.id} last={i === active.length - 1 && !expired.length}>
              <Ban size={16} color={C.errorText} strokeWidth={1.9} style={{ alignSelf: "flex-start", marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{b.name}</PText>
                {b.condition ? <PText v="tiny" color={C.errorText}>{b.condition}</PText> : null}
                <PText v="small" color={C.text}>{b.reason}</PText>
                <PText v="tiny">
                  {`Desde ${shortDay(atLocal(b.since, 12 * 60))} · ${b.until ? `hasta ${shortDay(atLocal(b.until, 12 * 60))}` : "sin fecha de fin"} · lo añadió ${b.by.split(" ")[0]}`}
                </PText>
              </View>
              <PButton label="Quitar" variant="ghost" small onPress={() => lift(b)} accessibilityLabel={`Quitar el veto a ${b.name}`} />
            </ListRow>
          ))
        ) : (
          <Empty
            icon={ShieldCheck}
            title="Nadie vetado"
            body="Si alguien no puede volver a entrar, añádelo con el motivo. La puerta lo verá al momento, aunque venga con otro RRPP."
            action={<PButton label="Añadir vetado" icon={Plus} onPress={onAdd} />}
          />
        )}
        {expired.length ? (
          <View style={{ paddingHorizontal: S.lg, paddingVertical: S.sm, borderTopWidth: 1, borderTopColor: C.borderLight }}>
            <PText v="tiny">
              {`${expired.length} ${expired.length === 1 ? "veto terminado" : "vetos terminados"}: ${expired.map((b) => b.name).join(", ")}.`}
            </PText>
          </View>
        ) : null}
      </Panel>
      <ConditionsPanel />
      <Tip title="Motivos concretos">
        Escribe lo que pasó, no una opinión: agredió a un portero, intentó entrar con otro DNI. Así el portero sabe por qué y nadie discute en la puerta.
      </Tip>
    </>
  );
}

type Duration = "1m" | "6m" | "1y" | "none";

function BanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
  const [name, setName] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [condition, setCondition] = React.useState("");
  const [log, setLog] = React.useState(true);
  const [duration, setDuration] = React.useState<Duration>("6m");
  const [by, setBy] = React.useState("");
  const conditions = accessConditionsOf(ops);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setReason("");
    setCondition("");
    setLog(true);
    setDuration("6m");
    setBy(defaultSigner(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const today = nightOf(now);
  const until = duration === "none" ? null : addDays(today, duration === "1m" ? 30 : duration === "6m" ? 182 : 365);
  const exists = ops.bans.some((b) => banActive(b, now) && b.name.trim().toLowerCase() === name.trim().toLowerCase());
  const valid = name.trim().split(/\s+/).length >= 2 && reason.trim().length > 5 && !exists && Boolean(by.trim());

  const save = async () => {
    const ban: ProBan = {
      id: localId("ban"),
      name: name.trim(),
      condition: condition || undefined,
      reason: reason.trim(),
      since: today,
      until,
      by: by.trim(),
    };
    const at = new Date().toISOString();
    const ev = eventOfNight(data, nightOf(new Date(at)));
    const ok = await setOps("ban.create", (o) => addBan(o, ban, log ? { incidentId: localId("in"), at, eventId: ev?.id } : null));
    if (!ok) return;
    toast(`${ban.name} vetado`, {
      kind: "success",
      body: log ? "Queda en el libro de esta noche y la puerta lo verá en rojo." : "Si aparece en una lista o con una entrada, la puerta lo verá en rojo.",
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Añadir vetado"
      description="Nombre y apellido tal y como aparecería en una lista o una entrada."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Vetar" icon={Ban} variant="danger" onPress={() => void save()} disabled={!valid} />
        </>
      }
    >
      <Field label="Nombre y apellido" hint={exists ? "Ya está vetado" : undefined}>
        <Input value={name} onChangeText={setName} placeholder="Nombre y apellido" label="Nombre y apellido" autoCapitalize="words" />
      </Field>
      <Field label="Condición de acceso que no cumple" hint="Las de tu local. Así el veto se apoya en algo que está a la vista en la puerta.">
        <ChoiceGrid value={condition} onChange={(v) => setCondition(v === condition ? "" : v)} options={conditions.map((c) => ({ value: c, label: c }))} />
      </Field>
      <Field label="Qué pasó" hint="Lo que hizo, en una frase. Lo verá el portero.">
        <Input value={reason} onChangeText={setReason} multiline placeholder="Pelea en la barra el jueves 17." label="Motivo del veto" />
      </Field>
      <Field label="Durante">
        <ChoiceGrid
          value={duration}
          onChange={setDuration}
          options={[
            { value: "1m", label: "1 mes" },
            { value: "6m", label: "6 meses" },
            { value: "1y", label: "1 año" },
            { value: "none", label: "Sin fin" },
          ]}
        />
      </Field>
      <Field label="Lo decide">
        <SignerChips value={by} onChange={setBy} />
      </Field>
      <Toggle label="Apuntarlo en el libro de esta noche" detail="Con la hora, la condición y quién lo decide." value={log} onChange={setLog} />
      <PText v="small">
        {until ? `Podrá volver a entrar a partir del ${shortDay(atLocal(addDays(until, 1), 12 * 60))}.` : "No tiene fecha de fin: tendrás que quitarlo tú."}
      </PText>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Condiciones de acceso del local                                     */
/* ------------------------------------------------------------------ */

/** Las condiciones que el local tiene a la vista en la puerta. Se eligen al vetar. */
function ConditionsPanel() {
  const { ops, setOps } = useNightOps();
  const [draft, setDraft] = React.useState("");
  const list = accessConditionsOf(ops);
  const used = bansByCondition(ops);

  const save = async (next: string[], message: string) => {
    if (await setOps("access.conditions", (o) => setAccessConditions(o, next))) toast(message, { kind: "success" });
  };

  const add = () => {
    const value = draft.trim();
    if (value.length < 4) return;
    void save([...list, value], "Condición añadida");
    setDraft("");
  };

  return (
    <Panel title="Condiciones de acceso" description="Las que tienes a la vista en la puerta. El portero elige una al vetar.">
      <View style={{ gap: S.xs }}>
        {list.map((c) => {
          const count = used.find((u) => u.condition === c)?.count ?? 0;
          return (
            <View key={c} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <PText v="small" color={C.text} style={{ flex: 1 }}>{c}</PText>
              {count ? <Pill label={String(count)} /> : null}
              <Tap
                onPress={() => void save(list.filter((x) => x !== c), "Condición quitada")}
                disabled={list.length <= 1}
                accessibilityRole="button"
                accessibilityLabel={`Quitar la condición ${c}`}
                style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: list.length <= 1 ? 0.4 : 1 }}
              >
                <X size={15} color={C.muted} strokeWidth={1.9} />
              </Tap>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: S.md }}>
        <View style={{ flex: 1 }}>
          <Input value={draft} onChangeText={setDraft} placeholder="Otra condición de tu local" label="Nueva condición de acceso" onSubmitEditing={add} />
        </View>
        <PButton label="Añadir" variant="outline" small disabled={draft.trim().length < 4} onPress={add} />
      </View>
    </Panel>
  );
}
