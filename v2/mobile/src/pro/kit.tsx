import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronLeft, ChevronRight, Lightbulb, Minus, Plus, Search, X, type LucideIcon } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { Pulse } from "@/components/motion";
import { MAX_FONT_SCALE } from "@/lib/a11y";
import { C, F, FONT, R, S, SHADOW } from "@/theme";
import type { BookingStatus, ToneKey } from "../../../shared/pro/types";
import { addDays, capitalize, initials, minutesToLabel, shortDay } from "../../../shared/pro/format";

/**
 * Kit visual de Franky Pro en la app. Es la versión nativa de
 * web/src/components/pro/kit.tsx: mismas piezas, mismos nombres, mismo tono.
 * Los colores se leen de C en cada pintado (C cambia con el tema); nunca se
 * guardan en constantes de módulo.
 */

const M = MAX_FONT_SCALE;

/* ------------------------------------------------------------------ */
/* Tonos de persona o recurso                                           */
/* ------------------------------------------------------------------ */

export const TONE_HEX: Record<ToneKey, string> = {
  violet: "#7C4DFF",
  sky: "#0EA5E9",
  emerald: "#10B981",
  amber: "#F59E0B",
  rose: "#F43F5E",
  teal: "#14B8A6",
  slate: "#64748B",
};

export function tone(key: ToneKey | undefined) {
  const hex = TONE_HEX[key ?? "slate"];
  return { bar: hex, block: `${hex}1F`, soft: `${hex}2E`, strong: hex };
}

/* ------------------------------------------------------------------ */
/* Texto                                                                */
/* ------------------------------------------------------------------ */

export function PText({ v = "body", style, children, numberOfLines, color }: {
  v?: "h1" | "h2" | "h3" | "display" | "body" | "small" | "tiny" | "label";
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
  color?: string;
}) {
  const base = { ...F[v], ...(color ? { color } : null) };
  return (
    <Text style={[base, style]} numberOfLines={numberOfLines} maxFontSizeMultiplier={M}>
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* Cabecera de pantalla                                                 */
/* ------------------------------------------------------------------ */

export function PageHeader({ eyebrow, title, description, actions, children }: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ gap: S.sm, paddingBottom: S.lg }}>
      {eyebrow ? <PText v="label">{eyebrow}</PText> : null}
      <Text style={{ fontFamily: FONT.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: C.text }} maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      {description ? <PText v="body" color={C.muted}>{description}</PText> : null}
      {actions ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.xs }}>{actions}</View> : null}
      {children ? <View style={{ marginTop: S.xs }}>{children}</View> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Botones                                                              */
/* ------------------------------------------------------------------ */

export function PButton({ label, onPress, variant = "dark", icon: Icon, small, disabled, full, accessibilityLabel, style }: {
  label: string;
  onPress?: () => void;
  variant?: "dark" | "outline" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
  small?: boolean;
  disabled?: boolean;
  full?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === "dark" ? C.text : variant === "secondary" ? C.accentSoft : variant === "danger" ? C.error : "transparent";
  const fg = variant === "dark" ? C.bg : variant === "secondary" ? C.blueDeep : variant === "danger" ? "#FFFFFF" : C.text;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      haptic
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          minHeight: small ? 36 : 46,
          paddingHorizontal: small ? S.md : S.lg,
          borderRadius: small ? R.sm : R.md,
          backgroundColor: bg,
          borderWidth: variant === "outline" ? 1 : 0,
          borderColor: C.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: S.sm,
          opacity: disabled ? 0.45 : 1,
          alignSelf: full ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {Icon ? <Icon size={small ? 15 : 17} color={fg} strokeWidth={2} /> : null}
      <Text style={{ fontFamily: FONT.semibold, fontSize: small ? 13 : 15, color: fg }} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {label}
      </Text>
    </Tap>
  );
}

export function IconButton({ icon: Icon, label, onPress, badge }: { icon: LucideIcon; label: string; onPress?: () => void; badge?: number }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} sin leer` : label}
      style={{ width: 42, height: 42, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface }}
    >
      <Icon size={19} color={C.text} strokeWidth={1.9} />
      {badge ? (
        <View style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.blue, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 10.5, fontFamily: FONT.heading }} maxFontSizeMultiplier={1.2}>{badge}</Text>
        </View>
      ) : null}
    </Tap>
  );
}

/* ------------------------------------------------------------------ */
/* Cifras y paneles                                                     */
/* ------------------------------------------------------------------ */

export function Kpi({ label, value, hint, icon: Icon, emphasis, onPress }: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  emphasis?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View
      style={{
        flex: 1,
        minHeight: 96,
        borderRadius: R.lg,
        borderWidth: 1,
        borderColor: emphasis ? `${C.blue}55` : C.border,
        backgroundColor: emphasis ? C.accentSoft : C.surface,
        padding: S.md,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {Icon ? <Icon size={14} color={emphasis ? C.blue : C.muted} strokeWidth={1.9} /> : null}
        <PText v="small" numberOfLines={1} style={{ flexShrink: 1 }}>{label}</PText>
      </View>
      <Text style={{ fontFamily: FONT.display, fontSize: 26, letterSpacing: -0.6, color: C.text }} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
        {String(value)}
      </Text>
      {hint ? <PText v="tiny" numberOfLines={2}>{hint}</PText> : null}
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }}>{body}</View>;
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={{ flex: 1 }}>
      {body}
    </Tap>
  );
}

/** Rejilla de cifras en dos columnas. */
export function KpiRow({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: S.sm, marginBottom: S.lg }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: S.sm }}>
          {row}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

export function Panel({ title, description, action, children, flush, style }: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginBottom: S.lg, overflow: "hidden", ...SHADOW.card }, style]}>
      {title || action ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
          <View style={{ flex: 1, gap: 2 }}>
            {title ? <PText v="h2">{title}</PText> : null}
            {description ? <PText v="small">{description}</PText> : null}
          </View>
          {action}
        </View>
      ) : null}
      <View style={flush ? undefined : { padding: S.lg }}>{children}</View>
    </View>
  );
}

/** Fila de lista densa: interesados, reservas, clientes. */
export function ListRow({ children, onPress, accessibilityLabel, last }: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  last?: boolean;
}) {
  const style: ViewStyle = { flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.borderLight, minHeight: 56 };
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [style, pressed && { backgroundColor: C.input }]}>
      {children}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Personas y estados                                                   */
/* ------------------------------------------------------------------ */

export function PAvatar({ name, toneKey = "slate", size = 38 }: { name: string; toneKey?: ToneKey; size?: number }) {
  const t = tone(toneKey);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.soft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: FONT.heading, fontSize: size * 0.36, color: C.text }} maxFontSizeMultiplier={1.1}>{initials(name)}</Text>
    </View>
  );
}

const STATUS: Record<BookingStatus, { label: string; tone: PillTone }> = {
  requested: { label: "Por confirmar", tone: "warning" },
  confirmed: { label: "Confirmada", tone: "neutral" },
  arrived: { label: "Ha llegado", tone: "info" },
  in_service: { label: "Atendiendo", tone: "violet" },
  done: { label: "Cobrada", tone: "success" },
  no_show: { label: "No vino", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const BOOKING_STATUS_LABEL = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])) as Record<BookingStatus, string>;

export function StatusPill({ status, label }: { status: BookingStatus; label?: string }) {
  return <Pill label={label ?? STATUS[status].label} tone={STATUS[status].tone} />;
}

type PillTone = "neutral" | "violet" | "success" | "warning" | "danger" | "info" | "dark";

export function Pill({ label, tone: t = "neutral", icon: Icon }: { label: string; tone?: PillTone; icon?: LucideIcon }) {
  const map: Record<PillTone, { bg: string; fg: string }> = {
    neutral: { bg: C.input, fg: C.muted },
    violet: { bg: C.accentSoft, fg: C.blueDeep },
    success: { bg: `${C.success}22`, fg: C.success },
    warning: { bg: `${C.warning}26`, fg: C.warning },
    danger: { bg: `${C.error}1F`, fg: C.errorText },
    info: { bg: "#0EA5E91F", fg: "#0284C7" },
    dark: { bg: C.text, fg: C.bg },
  };
  const c = map[t];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: c.bg, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 3 }}>
      {Icon ? <Icon size={11} color={c.fg} strokeWidth={2.2} /> : null}
      <Text style={{ fontFamily: FONT.semibold, fontSize: 11.5, color: c.fg }} maxFontSizeMultiplier={1.3} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function LiveDot({ size = 8 }: { size?: number }) {
  return (
    <Pulse>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.success }} />
    </Pulse>
  );
}

/* ------------------------------------------------------------------ */
/* Vacíos y guía                                                        */
/* ------------------------------------------------------------------ */

export function Empty({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: S.xxl, paddingHorizontal: S.xl, gap: S.sm }}>
      {Icon ? <Icon size={26} color={C.muted} strokeWidth={1.6} /> : null}
      <PText v="h3" style={{ textAlign: "center" }}>{title}</PText>
      {body ? <PText v="small" style={{ textAlign: "center" }}>{body}</PText> : null}
      {action ? <View style={{ marginTop: S.sm }}>{action}</View> : null}
    </View>
  );
}

export function Tip({ title = "Consejo", children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: S.md, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, borderRadius: R.lg, padding: S.md, marginBottom: S.lg }}>
      <Lightbulb size={16} color={C.blue} strokeWidth={1.9} style={{ marginTop: 2 }} />
      <Text style={{ ...F.small, flex: 1, color: C.text }} maxFontSizeMultiplier={M}>
        <Text style={{ fontFamily: FONT.semibold }}>{title}. </Text>
        {children}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Controles                                                            */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, padding: 4 }} style={{ flexGrow: 0, backgroundColor: C.input, borderRadius: R.md, marginBottom: S.md }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Tap
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ minHeight: 36, paddingHorizontal: S.md, borderRadius: R.sm, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: active ? C.surface : "transparent", ...(active ? SHADOW.card : null) }}
          >
            <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: active ? C.text : C.muted }} maxFontSizeMultiplier={1.3}>{o.label}</Text>
            {typeof o.count === "number" ? <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: active ? C.blue : C.muted }} maxFontSizeMultiplier={1.3}>{o.count}</Text> : null}
          </Tap>
        );
      })}
    </ScrollView>
  );
}

export function Chips<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; hint?: string; dot?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }} style={{ flexGrow: 0, marginBottom: S.md }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Tap
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ minHeight: 40, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: active ? C.text : C.border, backgroundColor: active ? C.text : C.surface, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {o.dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: o.dot }} /> : null}
            <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: active ? C.bg : C.text }} maxFontSizeMultiplier={1.3}>{o.label}</Text>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

/** Opciones en botones que ocupan varias líneas (formularios). */
export function ChoiceGrid<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Tap
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ minHeight: 42, paddingHorizontal: S.md, paddingVertical: 8, borderRadius: R.md, borderWidth: 1, borderColor: active ? C.blue : C.border, backgroundColor: active ? C.accentSoft : C.surface, justifyContent: "center" }}
          >
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: active ? C.blueDeep : C.text }} maxFontSizeMultiplier={1.3}>{o.label}</Text>
            {o.hint ? <Text style={{ fontSize: 12, color: active ? C.blueDeep : C.muted }} maxFontSizeMultiplier={1.3}>{o.hint}</Text> : null}
          </Tap>
        );
      })}
    </View>
  );
}

export function SearchInput({ value, onChange, placeholder = "Buscar" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: S.md, marginBottom: S.md }}>
      <Search size={16} color={C.muted} strokeWidth={1.9} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        accessibilityLabel={placeholder}
        style={{ flex: 1, color: C.text, fontSize: 15, paddingVertical: 10 }}
        maxFontSizeMultiplier={1.4}
        returnKeyType="search"
      />
    </View>
  );
}

export function StepNav({ label, onPrev, onNext, onToday, isToday }: {
  label?: string;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  isToday?: boolean;
}) {
  const btn = { width: 40, height: 40, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: C.surface };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: S.md }}>
      <Tap onPress={onPrev} accessibilityRole="button" accessibilityLabel="Anterior" style={btn}>
        <ChevronLeft size={18} color={C.text} />
      </Tap>
      <Tap onPress={onNext} accessibilityRole="button" accessibilityLabel="Siguiente" style={btn}>
        <ChevronRight size={18} color={C.text} />
      </Tap>
      {onToday ? (
        <Tap onPress={onToday} disabled={isToday} accessibilityRole="button" accessibilityLabel="Ir a hoy" style={{ ...btn, width: undefined, paddingHorizontal: S.md, opacity: isToday ? 0.4 : 1 }}>
          <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: C.text }} maxFontSizeMultiplier={1.3}>Hoy</Text>
        </Tap>
      ) : null}
      {label ? <PText v="h3" numberOfLines={1} style={{ marginLeft: 6, flex: 1 }}>{capitalize(label)}</PText> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Hoja inferior (detalle y formularios)                                */
/* ------------------------------------------------------------------ */

export function Sheet({ open, onClose, title, description, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // El porcentaje no se resuelve dentro de KeyboardAvoidingView: alto en píxeles.
  const maxHeight = height - insets.top - S.xl;
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={{ maxHeight, backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, ...SHADOW.float }}>
            <View style={{ alignItems: "center", paddingTop: S.sm }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.border }} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md, paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.sm }}>
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h2">{title}</PText>
                {description ? <PText v="small">{description}</PText> : null}
              </View>
              <Tap onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: 36, height: 36, borderRadius: R.md, alignItems: "center", justifyContent: "center", backgroundColor: C.input }}>
                <X size={17} color={C.text} />
              </Tap>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: footer ? S.lg : insets.bottom + S.lg, gap: S.md }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: S.sm, paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: insets.bottom + S.md, borderTopWidth: 1, borderTopColor: C.borderLight }}>
                {footer}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Formularios                                                          */
/* ------------------------------------------------------------------ */

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <PText v="h3">{label}</PText>
      {children}
      {hint ? <PText v="tiny">{hint}</PText> : null}
    </View>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  return (
    <TextInput
      accessibilityLabel={props.label ?? props.placeholder}
      placeholderTextColor={C.muted}
      maxFontSizeMultiplier={1.4}
      {...props}
      style={[
        { minHeight: 46, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 10, color: C.text, backgroundColor: C.surface, fontSize: 15 },
        props.multiline ? { minHeight: 90, textAlignVertical: "top" } : null,
        props.style,
      ]}
    />
  );
}

export function Toggle({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Tap onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        <PText v="h3">{label}</PText>
        {detail ? <PText v="small">{detail}</PText> : null}
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: value ? C.blue : C.border, padding: 3, alignItems: value ? "flex-end" : "flex-start" }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" }} />
      </View>
    </Tap>
  );
}

/* ------------------------------------------------------------------ */
/* Medidores y gráficos                                                 */
/* ------------------------------------------------------------------ */

export function Meter({ value, max, tone: t = "violet" }: { value: number; max: number; tone?: "violet" | "success" | "warning" | "danger" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = t === "success" ? C.success : t === "warning" ? C.warning : t === "danger" ? C.error : C.blue;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }} style={{ height: 6, borderRadius: 3, backgroundColor: C.input, overflow: "hidden" }}>
      <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

export function Bars({ values, labels, format, height = 110, dark }: { values: number[]; labels?: string[]; format?: (v: number) => string; height?: number; dark?: boolean }) {
  const max = Math.max(1, ...values);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height }}>
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 4 }}>
            <Text style={{ fontSize: 10.5, fontFamily: FONT.semibold, color: dark ? "rgba(255,255,255,0.7)" : C.muted }} maxFontSizeMultiplier={1.2}>{format ? format(v) : v}</Text>
            <View style={{ width: "100%", height: `${Math.max(4, (v / max) * 72)}%`, borderRadius: 5, backgroundColor: last ? (dark ? "#A78BFA" : C.blue) : dark ? "rgba(255,255,255,0.2)" : C.input }} />
            {labels ? <Text style={{ fontSize: 9.5, color: dark ? "rgba(255,255,255,0.55)" : C.muted }} maxFontSizeMultiplier={1.2} numberOfLines={1}>{labels[i]}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

export function Detail({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.borderLight }}>
      <PText v="small">{label}</PText>
      {typeof value === "string" || typeof value === "number" ? <PText v="h3" style={{ flexShrink: 1, textAlign: "right" }}>{String(value)}</PText> : value}
    </View>
  );
}

/** Bloque oscuro de "lo que Franky te ha traído". Uno por pantalla como mucho. */
export function DarkBlock({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: "#121019", borderRadius: R.xl, padding: S.lg, marginBottom: S.lg, gap: S.sm }, style]}>{children}</View>;
}

export function DarkText({ v = "body", children, dim, style }: { v?: "label" | "display" | "body" | "small" | "h2"; children: React.ReactNode; dim?: boolean; style?: StyleProp<TextStyle> }) {
  const sizes = {
    label: { fontSize: 11.5, fontFamily: FONT.semibold, letterSpacing: 0.6, textTransform: "uppercase" as const },
    display: { fontSize: 40, fontFamily: FONT.display, letterSpacing: -1.2 },
    h2: { fontSize: 20, fontFamily: FONT.heading },
    body: { fontSize: 15 },
    small: { fontSize: 13 },
  };
  return <Text style={[sizes[v], { color: dim ? "rgba(255,255,255,0.65)" : "#FFFFFF" }, style]} maxFontSizeMultiplier={1.3}>{children}</Text>;
}

/* ------------------------------------------------------------------ */
/* Fecha, hora y cantidades (sin teclado)                               */
/* ------------------------------------------------------------------ */

/** Los próximos días en chips: "Hoy", "Mañana", "vie 3". */
export function DayChips({ value, onChange, today, days = 14 }: { value: string; onChange: (date: string) => void; today: string; days?: number }) {
  const list = Array.from({ length: days }, (_, i) => addDays(today, i));
  if (!list.includes(value)) list.unshift(value);
  const label = (d: string) => {
    if (d === today) return "Hoy";
    if (d === addDays(today, 1)) return "Mañana";
    return shortDay(`${d}T12:00:00Z`).replace(/\./g, "");
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }} style={{ flexGrow: 0 }}>
      {list.map((d) => {
        const active = d === value;
        return (
          <Tap
            key={d}
            onPress={() => onChange(d)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ minHeight: 40, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 1, borderColor: active ? C.text : C.border, backgroundColor: active ? C.text : C.surface, justifyContent: "center" }}
          >
            <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: active ? C.bg : C.text }} maxFontSizeMultiplier={1.3}>{capitalize(label(d))}</Text>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

/** Contador con menos y más. Sirve para plazas, minutos, precios en pasos. */
export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, format, label }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  label: string;
}) {
  const btn = { width: 44, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: C.surface };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format ? format(value) : String(value) }}>
      <Tap onPress={() => onChange(Math.max(min, value - step))} disabled={value <= min} accessibilityRole="button" accessibilityLabel={`Menos ${label}`} style={[btn, value <= min && { opacity: 0.4 }]}>
        <Minus size={17} color={C.text} />
      </Tap>
      <Text style={{ minWidth: 64, textAlign: "center", fontFamily: FONT.heading, fontSize: 17, color: C.text }} maxFontSizeMultiplier={1.3}>{format ? format(value) : value}</Text>
      <Tap onPress={() => onChange(Math.min(max, value + step))} disabled={value >= max} accessibilityRole="button" accessibilityLabel={`Más ${label}`} style={[btn, value >= max && { opacity: 0.4 }]}>
        <Plus size={17} color={C.text} />
      </Tap>
    </View>
  );
}

/** Hora del día en minutos, en pasos de 15. */
export function TimeStepper({ value, onChange, label, min = 0, max = 24 * 60 - 15, step = 15 }: { value: number; onChange: (m: number) => void; label: string; min?: number; max?: number; step?: number }) {
  return <Stepper value={value} onChange={onChange} min={min} max={max} step={step} format={minutesToLabel} label={label} />;
}

/** Varias opciones a la vez (universidades, etiquetas, días). */
export function MultiChips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <Tap
            key={o.value}
            onPress={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            style={{ minHeight: 38, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: on ? C.text : C.border, backgroundColor: on ? C.text : C.surface, flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {on ? <Check size={13} color={C.bg} strokeWidth={2.6} /> : null}
            <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: on ? C.bg : C.text }} maxFontSizeMultiplier={1.3}>{o.label}</Text>
          </Tap>
        );
      })}
    </View>
  );
}
