import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Check, type LucideIcon } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import { PRO_BAR_HEIGHT } from "../../shell";
import { PText, SearchInput } from "../../kit";

/**
 * Piezas propias del motor de mesas que no están en el kit: tonos de aviso
 * (alergias, disponible, agotado, por limpiar), enlaces de panel, botones de
 * elección con dos líneas, listas de selección y el botón flotante.
 */

/** true si el tema activo es oscuro (C cambia con el tema). */
function darkTheme(): boolean {
  const hex = C.bg.replace("#", "");
  if (hex.length < 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/** Tonos de aviso. Se calculan en cada pintado para seguir al tema. */
export function statusTone(kind: "amber" | "emerald" | "rose" | "slate") {
  const dark = darkTheme();
  switch (kind) {
    case "amber":
      return dark
        ? { bg: "#F59E0B24", border: "#B45309", fg: "#FCD34D" }
        : { bg: "#FFFBEB", border: "#FCD34D", fg: "#92400E" };
    case "emerald":
      return dark
        ? { bg: "#10B98124", border: "#065F46", fg: "#6EE7B7" }
        : { bg: "#ECFDF5", border: "#A7F3D0", fg: "#047857" };
    case "rose":
      return dark
        ? { bg: "#F43F5E24", border: "#9F1239", fg: "#FDA4AF" }
        : { bg: "#FFF1F2", border: "#FECDD3", fg: "#BE123C" };
    default:
      return dark
        ? { bg: "#33415599", border: "#64748B", fg: "#E2E8F0" }
        : { bg: "#F1F5F9", border: "#94A3B8", fg: "#334155" };
  }
}

/** Enlace de texto con flecha para la cabecera de un panel ("Libro", "Sala"). */
export function TextLink({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: S.sm }}
    >
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <ArrowRight size={14} color={C.blue} />
    </Tap>
  );
}

/** Botón de elección con título y detalle (mesas, horas, personas). */
export function PickButton({ title, detail, badge, selected, disabled, onPress, accessibilityLabel, style }: {
  title: string;
  detail?: string;
  badge?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? [title, detail].filter(Boolean).join(", ")}
      style={[
        {
          minHeight: 46,
          minWidth: 46,
          paddingHorizontal: S.md,
          paddingVertical: 6,
          borderRadius: R.md,
          borderWidth: 1,
          borderColor: selected ? C.blue : C.border,
          backgroundColor: selected ? C.accentSoft : C.surface,
          justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontFamily: FONT.heading, fontSize: 14, color: selected ? C.blueDeep : C.text }} maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
        {badge ? (
          <Text style={{ fontFamily: FONT.heading, fontSize: 11, color: C.blue }} maxFontSizeMultiplier={1.2}>
            {badge}
          </Text>
        ) : null}
      </View>
      {detail ? (
        <Text style={{ fontSize: 11.5, color: C.muted }} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </Tap>
  );
}

/**
 * Sustituto nativo de un <select>: lista de opciones tocables. Si hay muchas,
 * añade un buscador y enseña las 40 primeras.
 */
export function PickList<T extends string>({ options, value, onChange, empty, searchPlaceholder }: {
  options: { value: T; label: string; detail?: string }[];
  value: T | "";
  onChange: (value: T) => void;
  empty?: string;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = React.useState("");
  const [limit, setLimit] = React.useState(40);
  const searchable = options.length > 8;
  const needle = q.trim().toLowerCase();
  const filtered = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const shown = filtered.slice(0, limit);
  if (!options.length) return empty ? <PText v="small">{empty}</PText> : null;
  return (
    <View>
      {searchable ? <SearchInput value={q} onChange={setQ} placeholder={searchPlaceholder ?? "Buscar"} /> : null}
      <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
        {shown.map((o, i) => {
          const on = o.value === value;
          return (
            <Tap
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={[o.label, o.detail].filter(Boolean).join(", ")}
              style={{
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: S.sm,
                paddingHorizontal: S.md,
                paddingVertical: 8,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: C.borderLight,
                backgroundColor: on ? C.accentSoft : C.surface,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 14.5, color: on ? C.blueDeep : C.text }} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.detail ? <PText v="tiny" numberOfLines={1}>{o.detail}</PText> : null}
              </View>
              {on ? <Check size={16} color={C.blue} strokeWidth={2.4} /> : null}
            </Tap>
          );
        })}
      </View>
      {filtered.length > shown.length ? (
        <Tap onPress={() => setLimit((l) => l + 40)} accessibilityRole="button" style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: FONT.semibold, color: C.blue }} maxFontSizeMultiplier={1.3}>Ver más</Text>
        </Tap>
      ) : null}
    </View>
  );
}

/** Botón flotante sobre la barra inferior (atajo de la acción principal). */
export function Fab({ label, icon: Icon, onPress, disabled }: { label: string; icon?: LucideIcon; onPress: () => void; disabled?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      haptic
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        position: "absolute",
        right: S.lg,
        bottom: PRO_BAR_HEIGHT + insets.bottom + S.md,
        minHeight: 52,
        paddingHorizontal: S.xl,
        borderRadius: R.full,
        backgroundColor: C.text,
        flexDirection: "row",
        alignItems: "center",
        gap: S.sm,
        opacity: disabled ? 0.45 : 1,
        ...SHADOW.float,
      }}
    >
      {Icon ? <Icon size={18} color={C.bg} strokeWidth={2} /> : null}
      <Text style={{ fontFamily: FONT.semibold, fontSize: 15.5, color: C.bg }} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </Tap>
  );
}

/** Relleno inferior de ProPage para que el botón flotante no tape lo último. */
export function useFabPadding() {
  const insets = useSafeAreaInsets();
  return { paddingBottom: PRO_BAR_HEIGHT + insets.bottom + 96 };
}

/** Tarjeta blanca con borde, como las secciones sueltas de la web. */
export function Card({ children, style, highlight }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; highlight?: string }) {
  return (
    <View
      style={[
        { borderRadius: R.lg, borderWidth: 1, borderColor: highlight ?? C.border, backgroundColor: C.surface, padding: S.lg, marginBottom: S.lg, ...SHADOW.card },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Cifra grande con su texto al lado ("12 de 20 mesas"). */
export function BigFigure({ value, suffix, size = 34 }: { value: string | number; suffix?: string; size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
      <Text style={{ fontFamily: FONT.display, fontSize: size, letterSpacing: -0.8, color: C.text }} maxFontSizeMultiplier={1.2}>
        {String(value)}
      </Text>
      {suffix ? <PText v="small">{suffix}</PText> : null}
    </View>
  );
}
