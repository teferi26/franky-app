import React from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { CalendarClock, CalendarPlus, Megaphone, Stamp, Trash2, Users, type LucideIcon } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import { addDays, capitalize, dayLabel, localDate, time } from "../../../../../shared/pro/format";
import {
  AUDIENCE_LABEL,
  DEADLINE_KIND_LABEL,
  calendarEntries,
  monthGrid,
  publicationForDeadline,
  shiftMonth,
  uniExtrasOf,
  upcomingDeadlines,
  withUniExtras,
  type CalendarEntry,
  type CalendarEntryKind,
} from "../../../../../shared/pro/university";
import type { ProUniAudience, ProUniDeadline, ProUniDeadlineKind, UniPublication } from "../../../../../shared/pro/university-types";
import { localId, usePro } from "../../store";
import { ProPage, sectionHref, useGoSection } from "../../shell";
import { ChoiceGrid, DayChips, Empty, Field, Input, ListRow, PButton, PText, PageHeader, Panel, Pill, Sheet, StepNav, Tip } from "../../kit";
import { PanelLink, useUniAction } from "./ui";

const KIND: Record<CalendarEntryKind, { label: string; icon: LucideIcon }> = {
  deadline: { label: "Plazos", icon: CalendarClock },
  publication: { label: "Publicaciones", icon: Megaphone },
  stop: { label: "Bienvenida", icon: Stamp },
  activity: { label: "Asociaciones", icon: Users },
};

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

/** Color de cada tipo. Se lee de C en cada pintado: cambia con el tema. */
function kindColor(kind: CalendarEntryKind): string {
  if (kind === "deadline") return C.blue;
  if (kind === "stop") return C.success;
  if (kind === "activity") return C.warning;
  return C.text;
}

const monthName = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });

const shortMonth = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" }).replace(".", "");

export default function UniversityCalendario() {
  const { data, now, spaceId } = usePro();
  const run = useUniAction();
  const router = useRouter();
  const go = useGoSection();
  const { width } = useWindowDimensions();
  const today = localDate(now);
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [selected, setSelected] = React.useState(today);
  const [hidden, setHidden] = React.useState<CalendarEntryKind[]>([]);
  const [creating, setCreating] = React.useState(false);

  const extras = uniExtrasOf(data);
  const pubs = data.uniPublications as UniPublication[];
  const entries = calendarEntries(data).filter((e) => !hidden.includes(e.kind));
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const weeks = monthGrid(month);
  const dayEntries = byDay.get(selected) ?? [];
  const upcoming = upcomingDeadlines(extras.deadlines, now, 60);
  const unprepared = upcoming.filter((d) => !publicationForDeadline(pubs, d.id));
  // Siete columnas en el ancho útil: la página y el panel dejan S.lg a cada lado.
  const cell = Math.floor((width - S.lg * 4 - 2) / 7);

  const toggleKind = (k: CalendarEntryKind) =>
    setHidden((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]));

  const openDeadline = (d: ProUniDeadline) => {
    const pub = publicationForDeadline(pubs, d.id);
    const base = sectionHref(spaceId, "publicaciones");
    router.replace((pub ? `${base}?ver=${pub.id}` : `${base}?nueva=1&plazo=${d.id}`) as never);
  };
  const openEntry = (e: CalendarEntry) => {
    if (e.kind === "publication") router.replace(`${sectionHref(spaceId, "publicaciones")}?ver=${e.id}` as never);
    else if (e.kind === "stop") go("bienvenida");
    else if (e.kind === "activity") go("asociaciones");
    else {
      const d = extras.deadlines.find((x) => x.id === e.id);
      if (d) openDeadline(d);
    }
  };
  const removeDeadline = (id: string) =>
    void run(
      "calendar.deadline.delete",
      (d) => withUniExtras(d, (x) => ({ ...x, deadlines: x.deadlines.filter((k) => k.id !== id) })),
      "Plazo quitado del calendario",
    );

  return (
    <ProPage>
      <PageHeader
        eyebrow="Calendario"
        title="Calendario del curso"
        description={
          upcoming.length
            ? `${upcoming.length} plazos en los próximos dos meses${unprepared.length ? `, ${unprepared.length} sin aviso preparado` : " y todos con su aviso preparado"}.`
            : "Apunta los plazos clave del curso y cada uno te propondrá su aviso a tiempo."
        }
        actions={<PButton label="Añadir plazo" icon={CalendarPlus} onPress={() => setCreating(true)} />}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          {(Object.keys(KIND) as CalendarEntryKind[]).map((k) => {
            const on = !hidden.includes(k);
            return (
              <Tap
                key={k}
                onPress={() => toggleKind(k)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={KIND[k].label}
                style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: on ? C.text : C.border }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: kindColor(k), opacity: on ? 1 : 0.35 }} />
                <Text
                  style={{ fontFamily: FONT.semibold, fontSize: 13, color: on ? C.text : C.muted, textDecorationLine: on ? "none" : "line-through" }}
                  maxFontSizeMultiplier={1.3}
                >
                  {KIND[k].label}
                </Text>
              </Tap>
            );
          })}
        </View>
      </PageHeader>

      <Panel>
        <StepNav
          label={monthName(month)}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))}
          onNext={() => setMonth((m) => shiftMonth(m, 1))}
          onToday={() => {
            setMonth(today.slice(0, 7));
            setSelected(today);
          }}
          isToday={month === today.slice(0, 7)}
        />
        <View style={{ flexDirection: "row" }}>
          {WEEKDAYS.map((w) => (
            <View key={w} style={{ width: cell, alignItems: "center", paddingVertical: 4 }}>
              <PText v="tiny">{w}</PText>
            </View>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0]} style={{ flexDirection: "row" }}>
            {week.map((day) => {
              const inMonth = day.slice(0, 7) === month;
              const list = byDay.get(day) ?? [];
              const isToday = day === today;
              const isSelected = day === selected;
              return (
                <Tap
                  key={day}
                  onPress={() => setSelected(day)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${dayLabel(`${day}T12:00:00Z`)}, ${list.length} cosas`}
                  style={{
                    width: cell,
                    minHeight: 48,
                    alignItems: "center",
                    paddingVertical: 4,
                    gap: 3,
                    borderRadius: R.sm,
                    borderWidth: isSelected ? 1.5 : 0,
                    borderColor: C.blue,
                    opacity: inMonth ? 1 : 0.4,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isToday ? C.text : "transparent",
                    }}
                  >
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: isToday ? C.bg : C.text }} maxFontSizeMultiplier={1.2}>
                      {Number(day.slice(8, 10))}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 2, maxWidth: cell - 8 }}>
                    {list.slice(0, 4).map((e) => (
                      <View key={`${e.kind}-${e.id}`} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: kindColor(e.kind) }} />
                    ))}
                  </View>
                </Tap>
              );
            })}
          </View>
        ))}
      </Panel>

      <Panel title={capitalize(dayLabel(`${selected}T12:00:00Z`))} flush>
        {dayEntries.length ? (
          dayEntries.map((e, i) => {
            const deadline = e.kind === "deadline" ? extras.deadlines.find((d) => d.id === e.id) : undefined;
            const Icon = KIND[e.kind].icon;
            return (
              <ListRow key={`${e.kind}-${e.id}`} onPress={() => openEntry(e)} accessibilityLabel={e.title} last={i === dayEntries.length - 1}>
                <Icon size={16} color={kindColor(e.kind)} strokeWidth={1.9} />
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={2}>{e.title}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${e.at ? `${time(e.at)} · ` : ""}${e.detail}`}</PText>
                </View>
                {deadline ? (
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    {publicationForDeadline(pubs, deadline.id) ? <Pill tone="success" label="Aviso listo" /> : <Pill tone="info" label="Preparar aviso" />}
                    <Tap
                      onPress={() => removeDeadline(deadline.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar el plazo ${deadline.title}`}
                      style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: R.md }}
                    >
                      <Trash2 size={16} color={C.muted} strokeWidth={1.9} />
                    </Tap>
                  </View>
                ) : null}
              </ListRow>
            );
          })
        ) : (
          <PText v="small" style={{ padding: S.lg }}>Nada este día. Toca otro día del calendario o añade un plazo.</PText>
        )}
      </Panel>

      <Panel title="Próximos plazos" description="Cada plazo te propone su aviso, programado dos días antes." flush>
        {upcoming.length ? (
          upcoming.map((d, i) => {
            const ready = publicationForDeadline(pubs, d.id);
            return (
              <ListRow key={d.id} onPress={() => openDeadline(d)} accessibilityLabel={d.title} last={i === upcoming.length - 1}>
                <View style={{ width: 44, alignItems: "center" }}>
                  <Text style={{ fontFamily: FONT.display, fontSize: 20, color: C.text }} maxFontSizeMultiplier={1.2}>
                    {Number(d.date.slice(8, 10))}
                  </Text>
                  <PText v="tiny">{shortMonth(d.date).toUpperCase()}</PText>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={2}>{d.title}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${DEADLINE_KIND_LABEL[d.kind]} · ${AUDIENCE_LABEL[d.audience]}`}</PText>
                </View>
                {ready ? <Pill tone="success" label="Listo" /> : <Pill tone="info" label="Preparar" />}
              </ListRow>
            );
          })
        ) : (
          <Empty icon={CalendarClock} title="Sin plazos a la vista" body="Añade becas, matrícula, exámenes o la llegada de Erasmus y tendrás el aviso listo a tiempo." />
        )}
      </Panel>

      <Tip title="Los momentos que mandan">
        Julio y agosto, pisos. Septiembre, bienvenida y asociaciones. Octubre, becas y las primeras bajas. Enero, exámenes. Febrero, Erasmus. Si los tienes aquí, ningún aviso llega tarde.
      </Tip>

      <Panel>
        <PanelLink label="Ver el informe de la temporada" onPress={() => go("memoria")} />
      </Panel>

      <NewDeadlineSheet
        open={creating}
        onClose={() => setCreating(false)}
        defaultDate={selected >= today ? selected : addDays(today, 7)}
        today={today}
      />
    </ProPage>
  );
}

function NewDeadlineSheet({ open, onClose, defaultDate, today }: { open: boolean; onClose: () => void; defaultDate: string; today: string }) {
  const { pending } = usePro();
  const run = useUniAction();
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(defaultDate);
  const [kind, setKind] = React.useState<ProUniDeadlineKind>("becas");
  const [audience, setAudience] = React.useState<ProUniAudience>("campus");

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(defaultDate);
    setKind("becas");
    setAudience("campus");
  }, [open, defaultDate]);

  const valid = title.trim().length > 3;

  const save = async () => {
    const deadline: ProUniDeadline = { id: localId("d"), title: title.trim(), date, kind, audience };
    const ok = await run(
      "calendar.deadline.create",
      (d) => withUniExtras(d, (x) => ({ ...x, deadlines: [...x.deadlines, deadline] })),
      "Plazo añadido",
      "Te propondremos su aviso para que salga a tiempo.",
    );
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo plazo"
      description="Becas, matrícula, exámenes, Erasmus o elecciones."
      footer={<PButton label="Añadir plazo" onPress={() => void save()} disabled={pending || !valid} />}
    >
      <Field label="Qué vence">
        <Input value={title} onChangeText={setTitle} placeholder="Fin del plazo de becas de la Generalitat" label="Qué vence" />
      </Field>
      <Field label="Fecha" hint="Para un día más lejano, tócalo antes en el calendario.">
        <DayChips value={date} onChange={setDate} today={today} days={90} />
      </Field>
      <Field label="Tipo">
        <ChoiceGrid
          value={kind}
          onChange={setKind}
          options={(Object.keys(DEADLINE_KIND_LABEL) as ProUniDeadlineKind[]).map((k) => ({ value: k, label: DEADLINE_KIND_LABEL[k] }))}
        />
      </Field>
      <Field label="A quién afecta">
        <ChoiceGrid
          value={audience}
          onChange={setAudience}
          options={(["campus", "first_year", "erasmus", "master", "residences"] as ProUniAudience[]).map((a) => ({ value: a, label: AUDIENCE_LABEL[a] }))}
        />
      </Field>
    </Sheet>
  );
}
