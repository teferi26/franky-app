import React from "react";
import { Linking, Text, View } from "react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProIncident, ProTenant } from "../../../../../shared/pro/types";
import { localDate, minutesToLabel } from "../../../../../shared/pro/format";
import { VISIT_MINUTES, nextVisitDays, visitSlots } from "../../../../../shared/pro/housing";
import { usePro } from "../../store";
import { Field, PText, Pill, TONE_HEX } from "../../kit";
import { dayChip } from "./shared";

/**
 * Piezas comunes de las hojas de vivienda: elegir franja de visita, píldoras
 * de renta, fianza e incidencia, y abrir enlaces externos.
 */

export function whatsappHref(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Abre un enlace externo (WhatsApp, sede de la Generalitat, videollamada). */
export function openExternal(url: string) {
  Linking.openURL(url).catch(() => toast("No se ha podido abrir el enlace", { kind: "error", body: url }));
}

/* ------------------------------------------------------------------ */
/* Elegir día y franja de visita                                       */
/* ------------------------------------------------------------------ */

export function SlotPicker({ day, slot, onDay, onSlot }: { day: string; slot: number | null; onDay: (d: string) => void; onSlot: (m: number) => void }) {
  const { data, now } = usePro();
  const today = localDate(now);
  const days = nextVisitDays(data, now, 6);
  const slots = day ? visitSlots(data, day, now) : [];
  return (
    <View style={{ gap: S.md }}>
      <Field label="Día">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {days.map((d) => {
            const on = d === day;
            return (
              <Tap
                key={d}
                onPress={() => onDay(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{ minHeight: 44, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 1, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.accentSoft : C.surface, justifyContent: "center" }}
              >
                <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: on ? C.blueDeep : C.text, textTransform: "capitalize" }} maxFontSizeMultiplier={1.3}>
                  {dayChip(d, today)}
                </Text>
              </Tap>
            );
          })}
          {!days.length ? <PText v="small">No hay franjas libres en las próximas dos semanas. Amplía tu horario de visitas.</PText> : null}
        </View>
      </Field>
      {day ? (
        <Field label="Hora" hint={`Visitas de ${VISIT_MINUTES} minutos dentro de tus franjas.`}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {slots.map((m) => {
              const on = m === slot;
              return (
                <Tap
                  key={m}
                  onPress={() => onSlot(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`A las ${minutesToLabel(m)}`}
                  style={{ minHeight: 44, minWidth: 66, paddingHorizontal: S.sm, borderRadius: R.sm, borderWidth: 1, borderColor: on ? C.text : C.border, backgroundColor: on ? C.text : C.surface, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: on ? C.bg : C.text }} maxFontSizeMultiplier={1.3}>{minutesToLabel(m)}</Text>
                </Tap>
              );
            })}
            {!slots.length ? <PText v="small">Ese día ya no quedan franjas.</PText> : null}
          </View>
        </Field>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Píldoras de estado                                                  */
/* ------------------------------------------------------------------ */

export function RentPill({ status }: { status: ProTenant["rentStatus"] }) {
  if (status === "paid") return <Pill tone="success" label="Cobrada" />;
  if (status === "late") return <Pill tone="danger" label="Con retraso" />;
  return <Pill tone="warning" label="Pendiente" />;
}

export function DepositPill({ status }: { status: ProTenant["deposit"]["status"] }) {
  if (status === "pending") return <Pill tone="warning" label="Por depositar" />;
  if (status === "lodged") return <Pill tone="success" label="Depositada" />;
  return <Pill label="Devuelta" />;
}

export const INCIDENT_STATUS: Record<ProIncident["status"], { label: string; tone: "danger" | "info" | "success" }> = {
  open: { label: "Abierta", tone: "danger" },
  in_progress: { label: "En curso", tone: "info" },
  resolved: { label: "Resuelta", tone: "success" },
};

export function IncidentPill({ status }: { status: ProIncident["status"] }) {
  return <Pill tone={INCIDENT_STATUS[status].tone} label={INCIDENT_STATUS[status].label} />;
}

export const PRIORITY_LABEL: Record<ProIncident["priority"], string> = { urgent: "Urgente", normal: "Normal", low: "Baja" };

export function PriorityDot({ priority }: { priority: ProIncident["priority"] }) {
  const color = priority === "urgent" ? TONE_HEX.rose : priority === "normal" ? TONE_HEX.amber : TONE_HEX.slate;
  return (
    <View
      accessible
      accessibilityLabel={`Prioridad ${PRIORITY_LABEL[priority].toLowerCase()}`}
      style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }}
    />
  );
}
