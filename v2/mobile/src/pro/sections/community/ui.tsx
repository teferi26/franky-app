import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, Check, type LucideIcon } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import type { ProSectionId, ToneKey } from "../../../../../shared/pro/types";
import { usePro } from "../../store";
import { sectionHref } from "../../shell";
import { PText } from "../../kit";

/**
 * Piezas pequeñas que comparten las pantallas de asociaciones y que no están
 * en el kit: la fecha en cajita, las cifras en bloque gris, las casillas
 * redondas y el enlace violeta de las cabeceras de panel.
 */

/** Mismo orden de tonos que web/src/components/pro/tones.ts. */
export const TONE_ORDER: ToneKey[] = ["violet", "sky", "emerald", "amber", "rose", "teal", "slate"];

/** Ir a otra sección pasando parámetros (?a=, ?nueva=1, ?filtro=). */
export function useGoTo() {
  const router = useRouter();
  const { spaceId } = usePro();
  return React.useCallback(
    (section: ProSectionId, params?: Record<string, string>) => {
      // A mano: el URLSearchParams de React Native no es fiable.
      const pairs = Object.entries(params ?? {}).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      const query = pairs.length ? `?${pairs.join("&")}` : "";
      router.replace(`${sectionHref(spaceId, section)}${query}` as never);
    },
    [router, spaceId],
  );
}

function dayNumber(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" });
}

function monthShort(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" }).replace(".", "");
}

/** Día y mes en una cajita con borde, como en el listado de la web. */
export function DateBadge({ iso, size = 44 }: { iso: string; size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontFamily: FONT.heading, fontSize: size >= 48 ? 18 : 16, lineHeight: size >= 48 ? 20 : 18, color: C.text }} maxFontSizeMultiplier={1.1}>
        {dayNumber(iso)}
      </Text>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 10, color: C.muted, textTransform: "uppercase" }} maxFontSizeMultiplier={1.1}>
        {monthShort(iso)}
      </Text>
    </View>
  );
}

/** Cifra con su rótulo debajo (sin fondo). */
export function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontFamily: FONT.heading, fontSize: 20, color: C.text }} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <PText v="tiny" numberOfLines={1}>{label}</PText>
    </View>
  );
}

/** Cifra en bloque gris centrado (detalle de actividad y de patrocinador). */
export function StatTile({ label, value, icon: Icon, align = "center" }: { label: string; value: React.ReactNode; icon?: LucideIcon; align?: "center" | "left" }) {
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.sm, paddingVertical: 10, alignItems: align === "center" ? "center" : "flex-start", gap: 2 }}>
      {Icon ? <Icon size={16} color={C.blue} strokeWidth={1.9} style={{ marginBottom: 4 }} /> : null}
      <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: C.muted, textAlign: align === "center" ? "center" : "left" }} maxFontSizeMultiplier={1.2} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Fila de cifras que ocupa el ancho. */
export function StatRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", gap: S.sm }, style]}>{children}</View>;
}

/** Enlace violeta con flecha para la esquina de un panel. */
export function PanelLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <ArrowRight size={14} color={C.blue} />
    </Tap>
  );
}

/** Casilla tocable: redonda y verde (requisitos) o en caja violeta (opciones). */
export function CheckRow({ label, detail, checked, onPress, variant = "round" }: {
  label: string;
  detail?: string;
  checked: boolean;
  onPress: () => void;
  variant?: "round" | "box";
}) {
  const box = variant === "box";
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: S.md,
        minHeight: 44,
        paddingVertical: 8,
        paddingHorizontal: box ? S.md : 2,
        borderRadius: R.md,
        borderWidth: box ? 1 : 0,
        borderColor: box && checked ? C.blue : C.border,
        backgroundColor: box && checked ? C.accentSoft : "transparent",
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: box ? 6 : 11,
          borderWidth: 1,
          borderColor: checked ? (box ? C.blue : C.success) : C.border,
          backgroundColor: checked ? (box ? C.blue : C.success) : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          style={{
            fontSize: 14.5,
            fontFamily: box && checked ? FONT.semibold : undefined,
            color: box && checked ? C.blueDeep : !box && checked ? C.muted : C.text,
            textDecorationLine: !box && checked ? "line-through" : "none",
          }}
          maxFontSizeMultiplier={1.4}
        >
          {label}
        </Text>
        {detail ? <PText v="tiny">{detail}</PText> : null}
      </View>
    </Tap>
  );
}

/** Línea de "concepto ... importe" de la caja. */
export function CashLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: S.md,
        paddingBottom: 6,
        paddingTop: strong ? 10 : 6,
        marginTop: strong ? 4 : 0,
        borderTopWidth: strong ? 1 : 0,
        borderTopColor: C.borderLight,
      }}
    >
      <Text style={{ flex: 1, fontSize: 14, color: strong ? C.text : C.muted, fontFamily: strong ? FONT.semibold : undefined }} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, color: C.text, fontFamily: FONT.semibold }} maxFontSizeMultiplier={1.4}>
        {value}
      </Text>
    </View>
  );
}

/** Aviso de borde discontinuo (borradores, propuestas pendientes). */
export function DashedNote({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 10 }}>
      <PText v="small">{children}</PText>
    </View>
  );
}

/** Tarjeta blanca con borde, como los `article` de la web. */
export function Card({ children, onPress, accessibilityLabel, highlight, style }: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const base: StyleProp<ViewStyle> = [
    { borderRadius: R.lg, borderWidth: 1, borderColor: highlight ? `${C.blue}55` : C.border, backgroundColor: C.surface, padding: S.lg, gap: S.md, marginBottom: S.md },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={base}>
      {children}
    </Tap>
  );
}
