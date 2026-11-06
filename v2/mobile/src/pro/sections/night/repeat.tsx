import React from "react";
import { View } from "react-native";
import { CalendarDays, Plus, Repeat2 } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProEvent } from "../../../../../shared/pro/types";
import { atLocal, shortDay } from "../../../../../shared/pro/format";
import { applyRepeatWeekly, nightCalendar, repeatPreview } from "../../../../../shared/pro/night-ops";
import { localId, usePro } from "../../store";
import { ChoiceGrid, ListRow, PButton, PText, Panel, Pill } from "../../kit";

/**
 * Noches que se repiten solas y calendario de la noche: versión nativa de
 * RepeatWeekly (night-ui.tsx) y NightCalendar (eventos.tsx) de la web.
 */

const REPEAT_WEEKS = [
  { value: "4", label: "4 semanas" },
  { value: "8", label: "8 semanas" },
  { value: "12", label: "12 semanas", hint: "El cuatrimestre" },
];

function dayName(date: string): string {
  const label = shortDay(atLocal(date, 12 * 60));
  return label ? label[0].toUpperCase() + label.slice(1) : label;
}

/** Crea las próximas noches iguales con un toque, avisando de festivos y vísperas. */
export function RepeatWeekly({ event }: { event: ProEvent }) {
  const { data, update } = usePro();
  const [weeks, setWeeks] = React.useState("4");
  const preview = repeatPreview(data, event, Number(weeks));
  const fresh = preview.filter((p) => !p.exists);
  const weekday = new Date(`${event.date}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", timeZone: "UTC" });

  const repeat = async () => {
    if (!fresh.length) return;
    // Se calcula sobre los datos del momento del cambio, no sobre los pintados.
    const ok = await update("event.repeat", (d) => applyRepeatWeekly(d, event, Number(weeks), (prefix) => localId(prefix)).data);
    if (!ok) return;
    const last = fresh[fresh.length - 1].date;
    toast(`${fresh.length} ${fresh.length === 1 ? "noche creada" : "noches creadas"}`, {
      kind: "success",
      body: `${event.name} cada ${weekday} hasta el ${shortDay(atLocal(last, 12 * 60))}, con los mismos tramos y reservados.`,
    });
  };

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, gap: S.md }}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Repeat2 size={16} color={C.blue} strokeWidth={1.9} />
          <PText v="h3">{`Repetir cada ${weekday}`}</PText>
        </View>
        <PText v="tiny">Mismos tramos, lista, aforo y reservados. Las ventas empiezan de cero.</PText>
      </View>
      <ChoiceGrid value={weeks} onChange={setWeeks} options={REPEAT_WEEKS} />
      <View style={{ gap: 6 }}>
        {preview.map((p) => (
          <View key={p.date} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <CalendarDays size={14} color={C.muted} strokeWidth={1.9} />
            <PText
              v="small"
              color={p.exists ? C.muted : C.text}
              style={[{ flex: 1 }, p.exists ? { textDecorationLine: "line-through" } : null]}
              numberOfLines={1}
            >
              {dayName(p.date)}
            </PText>
            {p.exists ? <Pill label="Ya creada" /> : p.notes.length ? <Pill label={p.notes[0]} tone="warning" /> : null}
          </View>
        ))}
      </View>
      <PButton
        label={fresh.length ? `Crear ${fresh.length} ${fresh.length === 1 ? "noche" : "noches"}` : "Ya están todas creadas"}
        icon={Repeat2}
        variant="outline"
        full
        disabled={!fresh.length}
        onPress={() => void repeat()}
      />
    </View>
  );
}

/** Festivos, vísperas y noches señaladas de las próximas ocho semanas. */
export function NightCalendarPanel({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: (date: string) => void }) {
  const { data, now } = usePro();
  const days = nightCalendar(data, now, 56);
  const [more, setMore] = React.useState(false);
  if (!days.length) return null;
  const missing = days.filter((d) => !d.event).length;
  const shown = more ? days : days.slice(0, 6);
  return (
    <Panel
      title="Calendario de la noche"
      description={
        missing
          ? `${missing} ${missing === 1 ? "fecha fuerte" : "fechas fuertes"} en las próximas ocho semanas sin evento todavía.`
          : "Tienes evento en todas las fechas fuertes de las próximas ocho semanas."
      }
      flush
    >
      {shown.map((d, i) => (
        <ListRow key={d.date} last={i === shown.length - 1 && days.length <= 6}>
          <CalendarDays size={16} color={C.muted} strokeWidth={1.9} />
          <View style={{ flex: 1, gap: 2 }}>
            <PText v="h3" numberOfLines={1}>{dayName(d.date)}</PText>
            <PText v="tiny" numberOfLines={2}>{d.notes.join(" · ")}</PText>
          </View>
          {d.event ? (
            <Tap
              onPress={() => onOpen(d.event?.id ?? "")}
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${d.event.name}`}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Pill label={d.event.name} tone="success" />
            </Tap>
          ) : (
            <PButton label="Crear" icon={Plus} variant="outline" small onPress={() => onCreate(d.date)} accessibilityLabel={`Crear evento el ${dayName(d.date)}`} />
          )}
        </ListRow>
      ))}
      {days.length > 6 ? (
        <Tap
          onPress={() => setMore((v) => !v)}
          accessibilityRole="button"
          style={{ minHeight: 44, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: C.borderLight }}
        >
          <PText v="small" color={C.blueDeep} style={{ fontFamily: FONT.semibold }}>
            {more ? "Ver menos" : `Ver las ${days.length} fechas`}
          </PText>
        </Tap>
      ) : null}
    </Panel>
  );
}
