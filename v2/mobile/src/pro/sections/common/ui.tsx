import React from "react";
import { Share, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ToneKey } from "../../../../../shared/pro/types";
import { proCsvCell } from "../../../../../shared/pro/csv";
import { PText } from "../../kit";

/**
 * Piezas pequeñas que comparten las secciones comunes y que no están en el
 * kit: cifras mini, interruptor con estado deshabilitado, tarjeta y
 * exportación a CSV.
 */

/** Mismo orden de tonos que web/src/components/pro/tones.ts. */
export const TONE_ORDER: ToneKey[] = ["violet", "sky", "emerald", "amber", "rose", "teal", "slate"];

/** Cifra pequeña sobre fondo gris (ficha de cliente, ofertas, ajustes). */
export function MiniStat({ label, value, center }: { label: string; value: string; center?: boolean }) {
  return (
    <View style={{ flex: 1, borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.md, paddingVertical: 10, gap: 2, alignItems: center ? "center" : "flex-start" }}>
      {center ? (
        <>
          <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <PText v="tiny">{label}</PText>
        </>
      ) : (
        <>
          <PText v="tiny">{label}</PText>
          <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
        </>
      )}
    </View>
  );
}

/** Tarjeta con borde y sombra suave (ofertas, campañas, capítulos). */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, gap: S.sm, ...SHADOW.card }, style]}>
      {children}
    </View>
  );
}

/** Interruptor con título y detalle; a diferencia de Toggle, admite disabled. */
export function SwitchRow({ title, detail, on, onChange, disabled, last }: {
  title: string;
  detail?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <Tap
      onPress={() => onChange(!on)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={title}
      style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md, minHeight: 48, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.borderLight, opacity: disabled ? 0.55 : 1 }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <PText v="h3">{title}</PText>
        {detail ? <PText v="small">{detail}</PText> : null}
      </View>
      <Knob on={on} />
    </Tap>
  );
}

/** El dibujo del interruptor, sin toque propio. */
export function Knob({ on }: { on: boolean }) {
  return (
    <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: on ? C.blue : C.border, padding: 3, alignItems: on ? "flex-end" : "flex-start" }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" }} />
    </View>
  );
}

/**
 * Exporta filas a CSV (separado por punto y coma, como en la web) y abre la
 * hoja de compartir del sistema para guardarlo o enviarlo.
 */
export async function shareCsv(rows: string[][], filename: string, done: { title: string; body?: string }) {
  const csv = rows.map((r) => r.map(proCsvCell).join(";")).join("\n");
  try {
    const result = await Share.share({ title: filename, message: csv });
    if (result.action === Share.sharedAction) toast(done.title, { kind: "success", body: done.body });
  } catch {
    toast("No se ha podido exportar", { kind: "error", body: "Inténtalo de nuevo en un momento." });
  }
}
