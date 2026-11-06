import React from "react";
import { Text, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import type { ProResource } from "../../../../../shared/pro/types";
import { minutesToLabel } from "../../../../../shared/pro/format";
import { PAvatar, PText, TONE_HEX, tone } from "../../kit";

/**
 * Piezas propias del motor de pistas que no están en el kit: enlaces de
 * panel, rejilla de horas, selector de pista y avatares apilados.
 */

/** Enlace en la cabecera de un panel ("Pistas", "Todos"). */
export function PanelLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <ArrowRight size={14} color={C.blue} />
    </Tap>
  );
}

/** Enlace de texto dentro de una hoja (WhatsApp, abrir ficha, gestionar servicios). */
export function TextLink({ label, onPress, icon: Icon }: { label: string; onPress: () => void; icon?: React.ComponentType<{ size?: number; color?: string }> }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
    >
      {Icon ? <Icon size={16} color={C.blue} /> : null}
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Tap>
  );
}

/**
 * Horas de inicio en botones. `solid` pinta la elegida en violeta lleno (demo);
 * `soft` en violeta suave (negocio real). `valley` marca en verde las horas
 * con precio valle.
 */
export function HourGrid({ minutes, value, onChange, variant = "solid", valley }: {
  minutes: number[];
  value: number | null;
  onChange: (minute: number) => void;
  variant?: "solid" | "soft";
  valley?: (minute: number) => boolean;
}) {
  const green = TONE_HEX.emerald;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {minutes.map((m) => {
        const on = value === m;
        const isValley = !on && Boolean(valley?.(m));
        const bg = on ? (variant === "solid" ? C.blue : C.accentSoft) : isValley ? `${green}1A` : C.surface;
        const border = on ? C.blue : isValley ? `${green}80` : C.border;
        const fg = on ? (variant === "solid" ? C.onAccent : C.blueDeep) : isValley ? green : C.text;
        return (
          <Tap
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${minutesToLabel(m)}${isValley ? ", precio valle" : ""}`}
            style={{ minWidth: 68, height: 44, paddingHorizontal: S.sm, borderRadius: R.md, borderWidth: 1, borderColor: border, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: fg, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.3}>
              {minutesToLabel(m)}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** Pistas o espacios en tarjetas de dos columnas, con su color y su nota. */
export function ResourcePicker({ resources, value, onChange, disabled, suffix }: {
  resources: ProResource[];
  value: string;
  onChange: (id: string) => void;
  disabled?: (r: ProResource) => boolean;
  suffix?: (r: ProResource) => string | undefined;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
      {resources.map((r) => {
        const on = value === r.id;
        const off = Boolean(disabled?.(r));
        const extra = suffix?.(r);
        return (
          <Tap
            key={r.id}
            onPress={() => onChange(r.id)}
            disabled={off}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${r.name}${extra ?? ""}`}
            style={{
              width: "48.5%",
              minHeight: 52,
              flexDirection: "row",
              alignItems: "center",
              gap: S.sm,
              paddingHorizontal: S.md,
              paddingVertical: S.sm,
              borderRadius: R.md,
              borderWidth: 1,
              borderColor: on ? C.blue : C.border,
              backgroundColor: on ? C.accentSoft : C.surface,
              opacity: off ? 0.45 : 1,
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tone(r.tone).bar }} />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1} color={on ? C.blueDeep : C.text}>
                {`${r.name}${extra ?? ""}`}
              </PText>
              {r.note ? <PText v="tiny" numberOfLines={1}>{r.note}</PText> : null}
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

/** Avatares solapados con un borde del color del fondo. */
export function AvatarStack({ names, size = 26, ring }: { names: string[]; size?: number; ring?: string }) {
  return (
    <View style={{ flexDirection: "row" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {names.map((n, i) => (
        <View key={`${n}-${i}`} style={{ marginLeft: i ? -size * 0.3 : 0, borderRadius: size, borderWidth: 2, borderColor: ring ?? C.surface }}>
          <PAvatar name={n} size={size} toneKey="violet" />
        </View>
      ))}
    </View>
  );
}

/** Muestra 40 filas y un botón "Ver más" en listas que pueden ser largas. */
export function useMore<T>(list: T[], step = 40) {
  const [limit, setLimit] = React.useState(step);
  const visible = list.slice(0, limit);
  const more = list.length > limit ? () => setLimit((l) => l + step) : null;
  return { visible, more };
}

export function MoreButton({ onPress }: { onPress: (() => void) | null }) {
  if (!onPress) return null;
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel="Ver más" style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>
        Ver más
      </Text>
    </Tap>
  );
}
