import React from "react";
import { View } from "react-native";
import { BadgeCheck, Download, ShieldAlert } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, S } from "@/theme";
import { durationLabel, time } from "../../../../../shared/pro/format";
import { nightTitle } from "../../../../../shared/pro/night-ops";
import {
  SHIFT_CHECK_LABEL,
  doorLicenseOf,
  doorStaff,
  setDoorLicense,
  timesheetRows,
  timesheetSummary,
  timesheetVsRota,
  type ShiftCheckStatus,
} from "../../../../../shared/pro/night-staff";
import { usePro } from "../../store";
import { Empty, Input, ListRow, PAvatar, PButton, PText, Panel, Pill, Toggle } from "../../kit";
import { shareCsv, useNightOps } from "./ops-ui";

/**
 * Fichado frente al cuadrante y controladores de acceso habilitados:
 * versión nativa de web/.../night/timesheet.tsx.
 */

const STATUS_TONE: Record<ShiftCheckStatus, "success" | "warning" | "danger" | "info"> = {
  ok: "success",
  late: "warning",
  open: "warning",
  missing: "danger",
  unplanned: "info",
};

export function TimesheetPanel({ nights, weekLabel }: { nights: string[]; weekLabel: string }) {
  const { data, now } = usePro();
  const [all, setAll] = React.useState(false);
  const checks = timesheetVsRota(data, nights, now);
  const sum = timesheetSummary(checks);
  const issues = checks.filter((c) => c.status !== "ok");
  const shown = all ? checks : issues;

  const exportCsv = () => {
    const rows = timesheetRows(data, nights, now);
    if (rows.length <= 1) {
      toast("Aún no hay fichajes esta semana", { kind: "info", body: "Cuando alguien fiche, saldrá en el registro." });
      return;
    }
    shareCsv(`Registro de jornada de ${data.space.name}`, rows);
  };

  const parts = [
    sum.late ? `${sum.late} ${sum.late === 1 ? "llegada tarde" : "llegadas tarde"}` : null,
    sum.missing ? `${sum.missing} sin fichar` : null,
    sum.unplanned ? `${sum.unplanned} sin turno` : null,
    sum.open ? `${sum.open} sin salida` : null,
  ].filter(Boolean);

  return (
    <Panel
      title="Fichado frente al cuadrante"
      description={
        checks.length
          ? `${weekLabel}: ${durationLabel(sum.workedMinutes)} fichadas de ${durationLabel(sum.plannedMinutes)} planificadas. ${parts.length ? `${parts.join(", ")}.` : "Todo cuadra."}`
          : "Cuando pasen las noches de esta semana, verás aquí cada fichaje junto a su turno."
      }
      flush
    >
      {shown.map((c, i) => {
        const person = data.staff.find((s) => s.id === c.staffId);
        const first = c.shifts[0];
        const last = c.shifts[c.shifts.length - 1];
        const detail =
          c.status === "missing"
            ? `Tenía turno de ${durationLabel(c.plannedMinutes)} y no fichó`
            : c.status === "unplanned"
              ? `Fichó ${first ? time(first.inAt) : ""}${last?.outAt ? ` a ${time(last.outAt)}` : ""} sin turno`
              : c.status === "open"
                ? `Entró a las ${first ? time(first.inAt) : ""} y no fichó la salida`
                : `${first ? time(first.inAt) : ""}${last?.outAt ? ` a ${time(last.outAt)}` : ""}, ${durationLabel(c.workedMinutes)}${c.status === "late" ? `, ${c.lateMinutes} min tarde` : ""}`;
        return (
          <ListRow key={`${c.night}-${c.staffId}`} last={i === shown.length - 1}>
            <PAvatar name={person?.name ?? "?"} size={32} toneKey={person?.tone} />
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3" numberOfLines={1}>{`${person?.name.split(" ")[0] ?? "Alguien"} · ${nightTitle(c.night)}`}</PText>
              <PText v="tiny" numberOfLines={2}>{detail}</PText>
            </View>
            <Pill label={SHIFT_CHECK_LABEL[c.status]} tone={STATUS_TONE[c.status]} />
          </ListRow>
        );
      })}
      {!shown.length && checks.length ? (
        <Empty icon={BadgeCheck} title="Todo cuadra" body="Cada persona fichó a su hora en las noches de esta semana." />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.md, borderTopWidth: 1, borderTopColor: C.borderLight }}>
        <PButton label="Registro por noche" icon={Download} variant="outline" small onPress={exportCsv} />
        {checks.length > issues.length && issues.length ? (
          <PButton label={all ? "Solo lo que no cuadra" : "Ver todos"} variant="ghost" small onPress={() => setAll((v) => !v)} />
        ) : null}
      </View>
    </Panel>
  );
}

export function LicensesPanel() {
  const { data } = usePro();
  const { ops, setOps } = useNightOps();
  const people = doorStaff(data.staff, ops);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  const save = async (staffId: string) => {
    const value = drafts[staffId] ?? "";
    if (!(await setOps("door.license", (o) => setDoorLicense(o, staffId, value)))) return;
    const name = data.staff.find((s) => s.id === staffId)?.name.split(" ")[0] ?? "";
    toast(value.trim() ? `Habilitación de ${name} guardada` : `${name} sin habilitación`, { kind: "success" });
    setDrafts((d) => {
      const next = { ...d };
      delete next[staffId];
      return next;
    });
  };

  return (
    <Panel title="Controladores de acceso" description="El número de habilitación de quien hace la puerta.">
      <Toggle
        label="Mi local necesita un controlador habilitado"
        detail="Te avisamos de las noches sin ninguno en puerta."
        value={Boolean(ops.settings.licenseRequired)}
        onChange={(v) => void setOps("door.license_required", (o) => ({ ...o, settings: { ...o.settings, licenseRequired: v } }))}
      />
      {people.length ? (
        <View style={{ gap: S.md, marginTop: S.md }}>
          {people.map((s) => {
            const saved = doorLicenseOf(ops, s.id);
            const value = drafts[s.id] ?? saved ?? "";
            const dirty = drafts[s.id] !== undefined && drafts[s.id].trim() !== (saved ?? "");
            return (
              <View key={s.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <PAvatar name={s.name} size={28} toneKey={s.tone} />
                  <PText v="h3" style={{ flex: 1 }}>{s.name}</PText>
                  {saved && !dirty ? (
                    <BadgeCheck size={16} color={C.success} strokeWidth={1.9} accessibilityLabel="Habilitado" />
                  ) : (
                    <ShieldAlert size={16} color={C.muted} strokeWidth={1.9} accessibilityLabel="Sin habilitación" />
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={value}
                      onChangeText={(v) => setDrafts((d) => ({ ...d, [s.id]: v }))}
                      placeholder="Sin habilitación"
                      label={`Número de habilitación de ${s.name}`}
                      autoCapitalize="characters"
                    />
                  </View>
                  {dirty ? (
                    <Tap
                      onPress={() => void save(s.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Guardar la habilitación de ${s.name}`}
                      style={{ minHeight: 44, paddingHorizontal: S.md, justifyContent: "center" }}
                    >
                      <PText v="small" color={C.blueDeep} style={{ fontFamily: FONT.semibold }}>Guardar</PText>
                    </Tap>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <PText v="small" style={{ marginTop: S.md }}>Da un turno de puerta a alguien y aparecerá aquí.</PText>
      )}
    </Panel>
  );
}
