import React from "react";
import { Alert, Text, View } from "react-native";
import { AlertTriangle, Plus, Repeat } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import { localId, usePro } from "../../store";
import type { ProCourtSeries, ProSeriesClash } from "../../../../../shared/pro/courts-types";
import { dayLabel, localDate, money, plural } from "../../../../../shared/pro/format";
import { clockLabel, courtsOps } from "../../../../../shared/pro/courts-base";
import { clashAlternatives, createSeries, endOfCourse, endSeries, planSeries, resolveClash } from "../../../../../shared/pro/courts-ops";
import { ChoiceGrid, DayChips, Empty, Field, Input, KpiRow, Kpi, PButton, PText, Panel, Pill, Sheet, Tip, tone } from "../../kit";
import { WhatsAppButton, firstName } from "./booking-ops";
import { HourGrid } from "./ui";

/**
 * Turnos fijos (versión nativa de web courts/turnos.tsx): el mismo grupo, la
 * misma pista, el mismo día y hora cada semana hasta fin de curso. Las
 * semanas que chocan se resuelven una a una.
 */

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAYS_PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

const CLASH_LABEL: Record<ProSeriesClash["reason"], string> = {
  booked: "Ocupada",
  blocked: "Bloqueada",
  closed: "Cerrado",
};

function dateLabel(date: string) {
  return dayLabel(`${date}T12:00:00Z`);
}

export function SeriesView({ onNew }: { onNew: () => void }) {
  const { data, now } = usePro();
  const today = localDate(now);
  const all = courtsOps(data).series;
  const series = all.filter((s) => s.active);
  const ended = all.filter((s) => !s.active);
  const openClashes = series.reduce((a, s) => a + s.clashes.filter((c) => c.status === "open" && c.date >= today).length, 0);
  const upcoming = series.reduce(
    (a, s) => a + data.bookings.filter((b) => s.bookingIds.includes(b.id) && b.status !== "cancelled" && localDate(b.start) >= today).length,
    0,
  );

  if (!series.length)
    return (
      <Panel>
        <Empty
          icon={Repeat}
          title="Ningún turno fijo todavía"
          body="El grupo que juega cada martes a las 19:30 no tiene que llamarte cada semana. Créale su turno hasta fin de curso y la pista queda reservada."
          action={<PButton label="Nuevo turno fijo" icon={Plus} onPress={onNew} />}
        />
      </Panel>
    );

  return (
    <>
      <KpiRow>
        <Kpi label="Turnos fijos" value={series.length} hint="vuelven cada semana" />
        <Kpi label="Por resolver" value={openClashes} hint={openClashes ? "semanas que chocan" : "todo encaja"} emphasis={openClashes > 0} />
      </KpiRow>
      <PText v="small" style={{ marginBottom: S.md }}>{`${plural(upcoming, "reserva hecha", "reservas hechas")} de aquí a fin de curso.`}</PText>
      {series.map((s) => (
        <SeriesCard key={s.id} series={s} />
      ))}
      {ended.length ? (
        <PText v="small" style={{ marginBottom: S.md }}>
          {`${plural(ended.length, "turno dado de baja", "turnos dados de baja")}: ${ended.map((s) => s.clientName).join(", ")}.`}
        </PText>
      ) : null}
      <Tip title="Por qué conviene">
        Un turno fijo es una pista vendida cada semana sin llamadas. Si una semana choca con un torneo o un festivo, lo ves aquí y le propones otra pista u hora con un toque.
      </Tip>
    </>
  );
}

function SeriesCard({ series: s }: { series: ProCourtSeries }) {
  const { data, update, now } = usePro();
  const today = localDate(now);
  const [open, setOpen] = React.useState(false);
  const resource = data.resources.find((r) => r.id === s.resourceId);
  const bookings = data.bookings
    .filter((b) => s.bookingIds.includes(b.id) && b.status !== "cancelled")
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = bookings.find((b) => localDate(b.start) >= today);
  const left = bookings.filter((b) => localDate(b.start) >= today).length;
  const clashes = s.clashes.filter((c) => c.status === "open" && c.date >= today);

  const end = () =>
    Alert.alert("Dar de baja el turno", `Se liberan ${plural(left, "semana", "semanas")} de la ${resource?.name.toLowerCase() ?? "pista"}.`, [
      { text: "Volver", style: "cancel" },
      {
        text: "Dar de baja",
        style: "destructive",
        onPress: () => {
          void update("court.series.end", (d) => endSeries(d, s.id, today));
          toast("Turno dado de baja", { kind: "success", body: `Se liberan ${plural(left, "semana", "semanas")}.` });
        },
      },
    ]);

  return (
    <Panel>
      <View style={{ gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: tone(resource?.tone).bar }} />
              <PText v="h2" numberOfLines={1} style={{ flexShrink: 1 }}>{s.clientName}</PText>
            </View>
            <PText v="small">{`${resource?.name ?? ""}, los ${DAYS_PLURAL[s.weekday]} de ${clockLabel(s.from)} a ${clockLabel(s.from + s.duration)}`}</PText>
          </View>
          {clashes.length ? <Pill tone="warning" icon={AlertTriangle} label={`${clashes.length} por resolver`} /> : <Pill tone="success" label="Todo reservado" />}
        </View>
        <View style={{ flexDirection: "row", gap: S.md }}>
          <Figure label="Próxima" value={next ? (dateLabel(localDate(next.start)).split(",")[1]?.trim() ?? "") : "Ninguna"} />
          <Figure label="Quedan" value={plural(left, "semana", "semanas")} />
          <Figure label="Cada semana" value={money(s.priceCents)} />
        </View>
        {clashes.length ? (
          <>
            <PButton label={open ? "Ocultar" : "Resolver semanas que chocan"} small variant={open ? "secondary" : "outline"} onPress={() => setOpen(!open)} />
            {open ? clashes.map((c) => <ClashRow key={c.date} series={s} clash={c} />) : null}
          </>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: S.sm }}>
          <PText v="tiny">{`Hasta el ${dateLabel(s.until).split(",")[1]?.trim() ?? s.until}`}</PText>
          <Tap onPress={end} accessibilityRole="button" accessibilityLabel="Dar de baja" style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.errorText }} maxFontSizeMultiplier={1.3}>Dar de baja</Text>
          </Tap>
        </View>
      </View>
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <PText v="tiny">{label}</PText>
      <PText v="h3" numberOfLines={1}>{value}</PText>
    </View>
  );
}

function ClashRow({ series: s, clash }: { series: ProCourtSeries; clash: ProSeriesClash }) {
  const { data, update } = usePro();
  const options = clashAlternatives(data, s, clash.date);
  const name = (id: string) => data.resources.find((r) => r.id === id)?.name ?? "";

  const move = (o: { resourceId: string; from: number }) => {
    void update("court.series.move", (d) => resolveClash(d, { seriesId: s.id, date: clash.date, action: { move: o }, bookingId: localId("b") }));
    toast("Semana resuelta", { kind: "success", body: `${name(o.resourceId)} a las ${clockLabel(o.from)} el ${dateLabel(clash.date)}.` });
  };
  const skip = () => {
    void update("court.series.skip", (d) => resolveClash(d, { seriesId: s.id, date: clash.date, action: "skip", bookingId: localId("b") }));
    toast("Semana sin reserva", { kind: "success", body: `El ${dateLabel(clash.date)} no juegan. Avísales si no lo saben.` });
  };

  return (
    <View style={{ borderRadius: R.md, backgroundColor: C.input, padding: S.md, gap: S.sm }}>
      <View>
        <PText v="h3">{dateLabel(clash.date)}</PText>
        <PText v="tiny">{`${CLASH_LABEL[clash.reason]}${clash.withName ? `: ${clash.withName}` : ""}`}</PText>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map((o) => (
          <PButton key={`${o.resourceId}-${o.from}`} label={`${name(o.resourceId)} · ${clockLabel(o.from)}`} small variant="outline" onPress={() => move(o)} />
        ))}
        <PButton label="Esa semana no juegan" small variant="ghost" onPress={skip} />
      </View>
      {!options.length ? <PText v="tiny">No hay otra pista libre cerca de esa hora.</PText> : null}
      <WhatsAppButton
        phone={s.phone}
        label={`Preguntar a ${firstName(s.clientName)}`}
        message={`Hola ${firstName(s.clientName)}, el ${dateLabel(clash.date)} tu pista de siempre no está disponible en ${data.space.name}.${options[0] ? ` Te podemos dar la ${name(options[0].resourceId).toLowerCase()} a las ${clockLabel(options[0].from)}.` : ""} ¿Os viene bien?`}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo turno fijo                                                    */
/* ------------------------------------------------------------------ */

export type SeriesPreset = { resourceId?: string; weekday?: number; from?: number; name?: string; clientId?: string; phone?: string } | null;

export function NewSeriesDrawer({ preset, onClose }: { preset: SeriesPreset; onClose: () => void }) {
  const { data, update, now } = usePro();
  const today = localDate(now);
  const courts = data.resources.filter((r) => r.kind === "court" || r.kind === "room");
  const [name, setName] = React.useState("");
  const [clientId, setClientId] = React.useState<string | undefined>();
  const [phone, setPhone] = React.useState("");
  const [resourceId, setResourceId] = React.useState("");
  const [weekday, setWeekday] = React.useState(1);
  const [from, setFrom] = React.useState(19 * 60 + 30);
  const [duration, setDuration] = React.useState(90);
  const [startDate, setStartDate] = React.useState(today);
  const until = endOfCourse(today);

  React.useEffect(() => {
    if (!preset) return;
    setName(preset.name ?? "");
    setClientId(preset.clientId);
    setPhone(preset.phone ?? "");
    setResourceId(preset.resourceId ?? courts[0]?.id ?? "");
    setWeekday(preset.weekday ?? 1);
    setFrom(preset.from ?? 19 * 60 + 30);
    setDuration(90);
    setStartDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const hours = data.space.hours[weekday];
  const times: number[] = [];
  if (hours) for (let m = hours.open; m + duration <= hours.close; m += 30) times.push(m);
  const spec = { resourceId, weekday, from, duration, startDate, until, clientId, clientName: name.trim(), phone: phone.trim() || undefined };
  const plan = preset && resourceId ? planSeries(data, spec) : { free: [], clashes: [] };
  const q = name.trim().toLowerCase();
  const suggestions = q.length >= 2 && !clientId ? data.clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4) : [];
  const valid = name.trim().length >= 2 && Boolean(resourceId) && plan.free.length > 0 && times.includes(from);

  const save = () => {
    if (!valid) return;
    void update("court.series.create", (d) => createSeries(d, spec, { id: localId("tf"), now: new Date().toISOString(), newId: localId }).data);
    toast("Turno fijo creado", {
      kind: "success",
      body: `${plural(plan.free.length, "semana reservada", "semanas reservadas")}${plan.clashes.length ? `; ${plural(plan.clashes.length, "choca", "chocan")} y las tienes para resolver` : ""}.`,
    });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title="Nuevo turno fijo"
      description="La misma pista cada semana hasta fin de curso."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={`Reservar ${plural(plan.free.length, "semana", "semanas")}`} onPress={save} disabled={!valid} />
        </>
      }
    >
      <Field label="Quién juega" hint="El que organiza el grupo.">
        <Input
          value={name}
          onChangeText={(v) => {
            setName(v);
            setClientId(undefined);
          }}
          placeholder="Nombre y apellido"
          autoComplete="off"
          label="Quién juega"
        />
        {suggestions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {suggestions.map((c) => (
              <PButton
                key={c.id}
                label={c.name}
                small
                variant="outline"
                onPress={() => {
                  setName(c.name);
                  setClientId(c.id);
                  setPhone(c.phone ?? "");
                }}
              />
            ))}
          </View>
        ) : null}
      </Field>
      <Field label="Móvil" hint="Para avisarle si una semana cambia.">
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" label="Móvil" />
      </Field>
      <Field label="Pista">
        <ChoiceGrid value={resourceId} onChange={setResourceId} options={courts.map((r) => ({ value: r.id, label: r.name }))} />
      </Field>
      <Field label="Día de la semana">
        <ChoiceGrid
          value={String(weekday)}
          onChange={(v) => setWeekday(Number(v))}
          options={DAYS.map((d, i) => ({ value: String(i), label: d.slice(0, 3) })).filter((o) => data.space.hours[Number(o.value)])}
        />
      </Field>
      <Field label="Duración">
        <ChoiceGrid value={String(duration)} onChange={(v) => setDuration(Number(v))} options={[60, 90, 120].map((d) => ({ value: String(d), label: `${d} min` }))} />
      </Field>
      <Field label="Hora">
        <HourGrid minutes={times} value={times.includes(from) ? from : null} onChange={setFrom} />
      </Field>
      <Field label="Empieza">
        <DayChips value={startDate} onChange={setStartDate} today={today} />
      </Field>
      {resourceId && times.includes(from) ? (
        <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.lg, gap: 4 }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 26, color: C.text }} maxFontSizeMultiplier={1.2}>{plural(plan.free.length, "semana", "semanas")}</Text>
          <PText v="small">
            {`libres los ${DAYS_PLURAL[weekday]} a las ${clockLabel(from)} hasta el ${dateLabel(until).split(",")[1]?.trim() ?? until}${plan.clashes.length ? `. ${plural(plan.clashes.length, "semana choca", "semanas chocan")}: se reservan las libres y las demás quedan para resolver.` : ", sin ningún choque."}`}
          </PText>
        </View>
      ) : null}
    </Sheet>
  );
}
