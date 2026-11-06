import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, type LucideIcon } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import { addDays, capitalize, dayLabel } from "../../../../../shared/pro/format";
import { addMonths } from "../../../../../shared/pro/housing";
import { Meter, PText } from "../../kit";

/**
 * Piezas nativas del motor de vivienda que no están en el kit: selectores
 * (los <select> de la web), fechas sin teclado, enlaces de panel y cajas.
 */

/* ------------------------------------------------------------------ */
/* Selector desplegable (sustituye al <select> de la web)              */
/* ------------------------------------------------------------------ */

export type SelectOption<T extends string> = { value: T; label: string; hint?: string; disabled?: boolean };

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Elige una opción",
  hint,
  hideLabel,
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  hint?: string;
  hideLabel?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      {!hideLabel ? <PText v="h3">{label}</PText> : null}
      <Tap
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        accessibilityState={{ expanded: open }}
        style={{
          minHeight: 46,
          flexDirection: "row",
          alignItems: "center",
          gap: S.sm,
          borderWidth: 1,
          borderColor: open ? C.blue : C.border,
          borderRadius: R.md,
          paddingHorizontal: S.md,
          backgroundColor: C.surface,
        }}
      >
        <Text style={{ flex: 1, fontSize: 15, color: current ? C.text : C.muted }} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {current?.label ?? placeholder}
        </Text>
        {open ? <ChevronUp size={17} color={C.muted} /> : <ChevronDown size={17} color={C.muted} />}
      </Tap>
      {open ? (
        <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.md, backgroundColor: C.surface, overflow: "hidden" }}>
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <Tap
                key={`${o.value}-${i}`}
                disabled={o.disabled}
                onPress={() => {
                  setOpen(false);
                  onChange(o.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o.label}
                style={{
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: S.sm,
                  paddingHorizontal: S.md,
                  paddingVertical: 8,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: C.borderLight,
                  backgroundColor: on ? C.accentSoft : "transparent",
                  opacity: o.disabled ? 0.4 : 1,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14.5, fontFamily: on ? FONT.semibold : undefined, color: on ? C.blueDeep : C.text }} maxFontSizeMultiplier={1.4}>
                    {o.label}
                  </Text>
                  {o.hint ? <PText v="tiny">{o.hint}</PText> : null}
                </View>
                {on ? <Check size={16} color={C.blue} /> : null}
              </Tap>
            );
          })}
        </View>
      ) : null}
      {hint ? <PText v="tiny">{hint}</PText> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Fecha sin teclado (sustituye al <input type="date">)                */
/* ------------------------------------------------------------------ */

export function DateField({ label, value, onChange, min, today, hint }: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  /** Fecha mínima (AAAA-MM-DD). */
  min?: string;
  /** Si se pasa, aparece el atajo "Hoy". */
  today?: string;
  hint?: string;
}) {
  const clamp = (d: string) => (min && d < min ? min : d);
  const btn: ViewStyle = { width: 44, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface };
  const quick: { label: string; to: string }[] = [
    ...(today ? [{ label: "Hoy", to: today }] : []),
    { label: "+1 semana", to: addDays(value, 7) },
    { label: "+1 mes", to: addMonths(value, 1) },
    { label: "-1 mes", to: addMonths(value, -1) },
  ];
  const atMin = Boolean(min && value <= min);
  return (
    <View style={{ gap: 6 }}>
      <PText v="h3">{label}</PText>
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: dayLabel(`${value}T12:00:00Z`) }}>
        <Tap onPress={() => onChange(clamp(addDays(value, -1)))} disabled={atMin} accessibilityRole="button" accessibilityLabel={`${label}, día anterior`} style={[btn, atMin && { opacity: 0.4 }]}>
          <ChevronLeft size={18} color={C.text} />
        </Tap>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: FONT.heading, fontSize: 15.5, color: C.text }} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
          {capitalize(dayLabel(`${value}T12:00:00Z`))}
        </Text>
        <Tap onPress={() => onChange(addDays(value, 1))} accessibilityRole="button" accessibilityLabel={`${label}, día siguiente`} style={btn}>
          <ChevronRight size={18} color={C.text} />
        </Tap>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {quick.map((q) => {
          const target = clamp(q.to);
          const on = target === value && q.label === "Hoy";
          return (
            <Tap
              key={q.label}
              onPress={() => onChange(target)}
              disabled={target === value && q.label !== "Hoy"}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${q.label}`}
              hitSlop={6}
              style={{ minHeight: 34, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: on ? C.text : C.border, backgroundColor: on ? C.text : C.surface, justifyContent: "center" }}
            >
              <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: on ? C.bg : C.text }} maxFontSizeMultiplier={1.3}>{q.label}</Text>
            </Tap>
          );
        })}
      </View>
      {hint ? <PText v="tiny">{hint}</PText> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Enlaces, cajas y bloques                                            */
/* ------------------------------------------------------------------ */

/** Enlace de acción de un panel: "Interesados" con flecha. */
export function PanelLink({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel={accessibilityLabel ?? label} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>{label}</Text>
      <ArrowRight size={14} color={C.blue} />
    </Tap>
  );
}

/** Enlace de texto con icono al final (sedes externas, "Cambiar"). */
export function TextLink({ label, onPress, icon: Icon, color }: { label: string; onPress: () => void; icon?: LucideIcon; color?: string }) {
  const fg = color ?? C.blue;
  return (
    <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel={label} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: fg }} maxFontSizeMultiplier={1.3}>{label}</Text>
      {Icon ? <Icon size={14} color={fg} /> : null}
    </Tap>
  );
}

/** Caja con borde (bloques dentro de las hojas). */
export function Box({ children, style, accent }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; accent?: boolean }) {
  return (
    <View
      style={[
        {
          borderRadius: R.lg,
          borderWidth: 1,
          borderColor: accent ? `${C.blue}40` : C.border,
          backgroundColor: accent ? C.accentSoft : C.surface,
          padding: S.md,
          gap: S.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Bloque gris suave (resúmenes y citas). */
export function SoftBox({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.md, paddingVertical: 10, gap: 2 }, style]}>{children}</View>;
}

/** El mensaje del interesado entre comillas. */
export function Quote({ text }: { text: string }) {
  return (
    <View style={{ borderRadius: R.lg, backgroundColor: C.input, paddingHorizontal: S.lg, paddingVertical: S.md }}>
      <PText v="small" color={C.text} style={{ lineHeight: 20 }}>{`“${text}”`}</PText>
    </View>
  );
}

/** Cifra con rótulo pequeño debajo (rejillas de tres en paneles). */
export function MiniStat({ value, label, danger, boxed }: { value: string | number; label: string; danger?: boolean; boxed?: boolean }) {
  return (
    <View style={[{ flex: 1, gap: 2 }, boxed && { borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.sm, paddingVertical: 10, alignItems: "center" }]}>
      <Text style={{ fontFamily: FONT.display, fontSize: 19, color: danger ? C.errorText : C.text }} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
        {String(value)}
      </Text>
      <PText v="tiny" style={boxed ? { textAlign: "center" } : undefined}>{label}</PText>
    </View>
  );
}

/** Kpi con barra de progreso bajo la pista (la web mete un Meter en el hint). */
export function MeterKpi({ label, value, hint, icon: Icon, meter }: {
  label: string;
  value: string;
  hint: string;
  icon?: LucideIcon;
  meter: { value: number; max: number; tone?: "violet" | "success" | "warning" | "danger" };
}) {
  return (
    <View style={{ flex: 1, minHeight: 96, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.md, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {Icon ? <Icon size={14} color={C.muted} strokeWidth={1.9} /> : null}
        <PText v="small" numberOfLines={1} style={{ flexShrink: 1 }}>{label}</PText>
      </View>
      <Text style={{ fontFamily: FONT.display, fontSize: 26, letterSpacing: -0.6, color: C.text }} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <PText v="tiny" numberOfLines={2}>{hint}</PText>
      <View style={{ marginTop: 4 }}>
        <Meter value={meter.value} max={meter.max} tone={meter.tone} />
      </View>
    </View>
  );
}

/** Botón flotante redondo sobre la barra inferior (el "+ Piso" de la web en móvil). */
export function Fab({ label, icon: Icon, onPress, accessibilityLabel, bottom }: { label: string; icon: LucideIcon; onPress: () => void; accessibilityLabel: string; bottom: number }) {
  return (
    <Tap
      onPress={onPress}
      haptic
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ position: "absolute", right: S.lg, bottom, minHeight: 50, paddingHorizontal: S.xl, borderRadius: R.full, backgroundColor: C.text, flexDirection: "row", alignItems: "center", gap: S.sm, ...SHADOW.float }}
    >
      <Icon size={17} color={C.bg} strokeWidth={2} />
      <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.bg }} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Tap>
  );
}

/** Aviso en tono ámbar (falta un dato antes de seguir). */
export function WarnNote({ text }: { text: string }) {
  return (
    <View style={{ borderRadius: R.md, backgroundColor: `${C.warning}1F`, paddingHorizontal: S.md, paddingVertical: 10 }}>
      <PText v="small" color={C.text}>{text}</PText>
    </View>
  );
}
