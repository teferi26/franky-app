import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, BadgeCheck, Siren } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProData } from "../../../../../shared/pro/types";
import { time } from "../../../../../shared/pro/format";
import { PRIVACY_MIN_GROUP, URGENT_KIND_LABEL, activeUrgent, endUrgent, uniExtrasOf } from "../../../../../shared/pro/university";
import type { UniPublication } from "../../../../../shared/pro/university-types";
import { usePro } from "../../store";
import { sectionHref } from "../../shell";
import { PButton, Pill, PText } from "../../kit";

/**
 * Piezas pequeñas del motor universidad que no están en el kit: tarjetas
 * tocables de lista, el distintivo oficial y los enlaces de panel.
 */

/** Tarjeta tocable de lista (publicaciones, paradas, pisos, reportes). */
export function Card({ children, onPress, accessibilityLabel, style }: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const base: ViewStyle = { borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, gap: S.md, ...SHADOW.card };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[base, style]}>
      {children}
    </Tap>
  );
}

/** Lista vertical de tarjetas con el mismo hueco que la web. */
export function CardList({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: S.md, marginBottom: S.lg }}>{children}</View>;
}

/** Contenedor con borde para los vacíos que en la web van sueltos. */
export function EmptyBox({ children }: { children: React.ReactNode }) {
  return <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginBottom: S.lg, ...SHADOW.card }}>{children}</View>;
}

export function OfficialBadge() {
  return <Pill tone="violet" icon={BadgeCheck} label="Oficial" />;
}

/** Enlace de cabecera de panel: "Todas", "Pasaporte". */
export function PanelLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>{label}</Text>
      <ArrowRight size={14} color={C.blue} />
    </Tap>
  );
}

/** Cifra pequeña en caja gris (ficha de asociación). */
export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: "center", borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.sm, paddingVertical: 10 }}>
      <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.3}>{value}</Text>
      <PText v="tiny">{label}</PText>
    </View>
  );
}

/** Cita del contenido reportado. */
export function Quote({ children, muted }: { children: string; muted?: boolean }) {
  return (
    <View style={{ borderLeftWidth: 2, borderLeftColor: C.border, paddingLeft: S.md }}>
      <PText v="small" color={muted ? C.muted : C.text}>{children}</PText>
    </View>
  );
}

/**
 * Guarda un cambio y avisa. En un espacio real sin estas tablas `update`
 * devuelve false: entonces no se felicita a nadie, se dice que no se guardó.
 */
export function useUniAction() {
  const { update } = usePro();
  return React.useCallback(
    async (label: string, fn: (d: ProData) => ProData, title: string, detail?: string) => {
      const ok = await update(label, fn);
      if (ok) toast(title, { kind: "success", body: detail });
      else toast("No se ha podido guardar", { kind: "error", body: "Vuelve a intentarlo en un momento." });
      return ok;
    },
    [update],
  );
}

/** Facultades del campus que conoce el espacio, para elegir sin escribir. */
export function facultyOptions(data: ProData): string[] {
  const extras = uniExtrasOf(data);
  const known = [...extras.faculties.map((f) => f.faculty), ...Object.keys(extras.audiences.faculties)];
  return [...new Set(known)].sort((a, b) => a.localeCompare(b, "es"));
}

/** Grupo oculto por privacidad. */
export function HiddenGroup() {
  return <PText v="tiny">{`Menos de ${PRIVACY_MIN_GROUP} personas, oculto`}</PText>;
}

/** Aviso de color (rojo o ámbar) dentro de una hoja o de una pantalla. */
export function Notice({ tone = "danger", title, children }: { tone?: "danger" | "warning"; title: string; children?: React.ReactNode }) {
  const color = tone === "danger" ? C.errorText : C.warning;
  const base = tone === "danger" ? C.error : C.warning;
  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: `${base}40`, backgroundColor: `${base}14`, padding: S.md, gap: 4 }}>
      <PText v="h3" color={color}>{title}</PText>
      {typeof children === "string" ? <PText v="small" color={color}>{children}</PText> : children}
    </View>
  );
}

/**
 * Aviso urgente vigente, fijado arriba de Resumen y de Publicaciones con su
 * botón "Ya no aplica". Mientras está activo, los estudiantes lo ven arriba
 * del campus.
 */
export function UrgentBanner() {
  const { data, now, spaceId, pending } = usePro();
  const run = useUniAction();
  const router = useRouter();
  const urgent = activeUrgent(data.uniPublications as UniPublication[], now);
  if (!urgent?.urgent) return null;

  const end = () =>
    void run(
      "publication.urgent.end",
      (d) => ({
        ...d,
        uniPublications: (d.uniPublications as UniPublication[]).map((p) => (p.id === urgent.id ? endUrgent(p, now) : p)),
      }),
      "Aviso retirado de arriba",
      "Sigue en el muro como publicación normal.",
    );
  const open = () => router.replace(`${sectionHref(spaceId, "publicaciones")}?ver=${urgent.id}` as never);

  return (
    <View
      accessibilityRole="alert"
      style={{ borderRadius: R.lg, borderWidth: 1, borderColor: `${C.error}4D`, backgroundColor: `${C.error}14`, padding: S.md, gap: S.sm, marginBottom: S.lg }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Siren size={15} color={C.errorText} strokeWidth={1.9} />
        <PText v="tiny" color={C.errorText} style={{ flex: 1, fontFamily: FONT.semibold, textTransform: "uppercase", letterSpacing: 0.6 }}>
          {`${URGENT_KIND_LABEL[urgent.urgent.kind]} · hasta las ${time(urgent.urgent.until)}`}
        </PText>
      </View>
      <Tap onPress={open} accessibilityRole="link" accessibilityLabel={urgent.title}>
        <PText v="h2" color={C.errorText}>{urgent.title}</PText>
      </Tap>
      <PButton label="Ya no aplica" variant="outline" small onPress={end} disabled={pending} />
    </View>
  );
}
