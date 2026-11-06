import React from "react";
import { Text, View } from "react-native";
import { ArrowRight, Check } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import { checklistState } from "../../../../../shared/pro/checklist";
import { usePro } from "../../store";
import { useGoSection } from "../../shell";
import { Meter, PText } from "../../kit";

const REAL_STEP_COMMANDS: Record<string, string> = {
  services: "service.create",
  tables: "table.add",
  classes: "class.session.create",
  courts: "resource.create",
};

/**
 * Lista de arranque. En Hoy solo aparece mientras falta algo; en la Guía se
 * ve siempre, para repasar qué hace cada paso.
 */
export function SetupChecklist({ always = false }: { always?: boolean }) {
  const { vertical, data, demo, canView, can } = usePro();
  const go = useGoSection();
  const configured = checklistState(vertical, data);
  const steps = demo
    ? configured.steps
    : configured.steps
        .filter((step) => canView(step.section) && REAL_STEP_COMMANDS[step.id] && can(REAL_STEP_COMMANDS[step.id]))
        .map((step) => {
          if (step.id === "classes")
            return { ...step, title: "Programa una clase", detail: "Elige fecha, plazas y quién la da.", done: data.sessions.some((s) => s.status !== "cancelled") };
          if (step.id === "services") return { ...step, done: data.services.length > 0 };
          if (step.id === "tables") return { ...step, done: data.tables.some((t) => t.active !== false) };
          if (step.id === "courts") return { ...step, done: data.resources.length > 0 };
          return step;
        });
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  if (!total) return null;
  if (!always && done === total) return null;
  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, marginBottom: S.lg, gap: S.md, ...SHADOW.card }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: S.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <PText v="label">Puesta en marcha</PText>
          <PText v="h2">{done === total ? "Todo listo para recibir estudiantes" : `Te quedan ${total - done} pasos para estar al 100 %`}</PText>
        </View>
        <PText v="small">{`${done} de ${total}`}</PText>
      </View>
      <Meter value={done} max={total} tone={done === total ? "success" : "violet"} />
      <View style={{ gap: S.sm }}>
        {steps.map((s) => (
          <Tap
            key={s.id}
            onPress={() => go(s.section)}
            accessibilityRole="button"
            accessibilityLabel={`${s.title}${s.done ? ", hecho" : ""}`}
            style={{ flexDirection: "row", gap: S.md, padding: S.md, borderRadius: R.md, borderWidth: 1, borderColor: s.done ? C.borderLight : C.border, backgroundColor: s.done ? C.input : C.surface }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: s.done ? C.success : C.border, backgroundColor: s.done ? C.success : "transparent", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
              {s.done ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3" color={s.done ? C.muted : C.text}>{s.title}</PText>
              <PText v="tiny">{s.detail}</PText>
              {!s.done ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.blue }} maxFontSizeMultiplier={1.3}>Hacerlo ahora</Text>
                  <ArrowRight size={13} color={C.blue} />
                </View>
              ) : null}
            </View>
          </Tap>
        ))}
      </View>
    </View>
  );
}
