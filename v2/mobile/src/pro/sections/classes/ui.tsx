import React from "react";
import { Text, View } from "react-native";
import { Check, type LucideIcon } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import type { ToneKey } from "../../../../../shared/pro/types";
import { PAvatar, PText, TONE_HEX } from "../../kit";

/**
 * Piezas pequeñas del motor de clases que no están en el kit: la pastilla de
 * filtro con icono, la casilla con estado bloqueado y los selectores de tipo,
 * responsable y color del formulario de nueva sesión.
 */

export function FilterChip({ active, onPress, label, icon: Icon, dot }: {
  active: boolean;
  onPress: () => void;
  label: string;
  icon?: LucideIcon;
  dot?: string;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        minHeight: 40,
        paddingHorizontal: S.md,
        borderRadius: R.full,
        borderWidth: 1,
        borderColor: active ? C.text : C.border,
        backgroundColor: active ? C.text : C.surface,
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
      }}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      {Icon ? <Icon size={14} color={active ? C.bg : C.muted} strokeWidth={2} /> : null}
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: active ? C.bg : C.text }} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Tap>
  );
}

/** Casilla con texto. Si está bloqueada, se ve marcada pero no se puede tocar. */
export function CheckRow({ label, detail, checked, disabled, onChange }: {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Tap
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 44, opacity: disabled ? 0.55 : 1 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: checked ? C.blue : C.border,
          backgroundColor: checked ? C.blue : C.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <PText v="body">{label}</PText>
        {detail ? <PText v="tiny">{detail}</PText> : null}
      </View>
    </Tap>
  );
}

/** Opción con punto de color (tipo de clase) o avatar (responsable). */
export function PickChip({ active, onPress, label, detail, dot, person }: {
  active: boolean;
  onPress: () => void;
  label: string;
  detail?: string;
  dot?: ToneKey;
  person?: { name: string; tone?: ToneKey };
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: S.sm,
        paddingHorizontal: S.md,
        paddingVertical: 6,
        borderRadius: R.md,
        borderWidth: 1,
        borderColor: active ? C.blue : C.border,
        backgroundColor: active ? C.accentSoft : C.surface,
      }}
    >
      {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TONE_HEX[dot] }} /> : null}
      {person ? <PAvatar name={person.name} toneKey={person.tone} size={24} /> : null}
      <View>
        <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: active ? C.blueDeep : C.text }} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        {detail ? (
          <Text style={{ fontSize: 12, color: active ? C.blueDeep : C.muted }} maxFontSizeMultiplier={1.3}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Tap>
  );
}

/** Círculos de color para elegir el tono de una clase en el horario. */
export function ToneSwatches({ value, onChange, options }: { value: ToneKey; onChange: (t: ToneKey) => void; options: ToneKey[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
      {options.map((t) => (
        <Tap
          key={t}
          onPress={() => onChange(t)}
          accessibilityRole="button"
          accessibilityLabel={`Color ${t}`}
          accessibilityState={{ selected: value === t }}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: TONE_HEX[t],
              borderWidth: 2,
              borderColor: value === t ? C.text : "transparent",
            }}
          />
        </Tap>
      ))}
    </View>
  );
}

/** Texto en violeta que se toca como un enlace ("Horario ->"). */
export function LinkText({ label, onPress, icon: Icon }: { label: string; onPress: () => void; icon?: LucideIcon }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 }}
    >
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      {Icon ? <Icon size={14} color={C.blue} /> : null}
    </Tap>
  );
}

/** Botón "Ver más" para listas largas dentro de ProPage. */
export function MoreButton({ shown, total, onPress }: { shown: number; total: number; onPress: () => void }) {
  if (shown >= total) return null;
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ver más"
      style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: C.borderLight }}
    >
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>
        {`Ver más (${total - shown})`}
      </Text>
    </Tap>
  );
}
