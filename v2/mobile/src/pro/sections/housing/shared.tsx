import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { BadgeCheck, Bath, Camera, Globe2, MapPin, Sun, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import type { ProData, ProProperty, ProRoom, ToneKey } from "../../../../../shared/pro/types";
import { money } from "../../../../../shared/pro/format";
import { ROOM_STATUS, shortDate, uniShort } from "../../../../../shared/pro/housing";
import { Pill, tone } from "../../kit";

/** Universidad con la marca de verificado de Franky. */
export function UniBadge({ university, verified, long }: { university: string; verified: boolean; long?: boolean }) {
  if (!verified)
    return (
      <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: C.muted }} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {`${uniShort(university)}, sin verificar`}
      </Text>
    );
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      accessible
      accessibilityLabel={long ? `Verificado por la ${uniShort(university)}` : `${uniShort(university)}, verificado por su universidad en Franky`}
    >
      <BadgeCheck size={14} color={C.blue} strokeWidth={1.9} />
      <Text style={{ fontSize: 12, fontFamily: FONT.semibold, color: C.blueDeep }} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {long ? `Verificado por la ${uniShort(university)}` : uniShort(university)}
      </Text>
    </View>
  );
}

export function RoomieBadge({ group }: { group: { size: number; compatibility: number } }) {
  return <Pill tone="violet" icon={Users} label={`Grupo de ${group.size} · ${group.compatibility} %`} />;
}

export function ErasmusBadge() {
  return <Pill tone="info" icon={Globe2} label="Erasmus" />;
}

/** Colores de cada estado de habitación. Se calculan en cada pintado (tema). */
function roomColors(status: ProRoom["status"]) {
  switch (status) {
    case "free":
      return { border: `${C.success}66`, bg: `${C.success}1A`, fg: C.success };
    case "reserved":
      return { border: `${C.blue}4D`, bg: C.accentSoft, fg: C.blueDeep };
    case "leaving":
      return { border: `${C.warning}66`, bg: `${C.warning}1F`, fg: C.warning };
    default:
      return { border: C.border, bg: C.input, fg: C.muted };
  }
}

/** Una habitación como píldora: estado por color, número y precio. */
export function RoomChip({ room, onPress, showPrice = true, selected }: { room: ProRoom; onPress?: () => void; showPrice?: boolean; selected?: boolean }) {
  const label = `${room.name}: ${ROOM_STATUS[room.status].label.toLowerCase()}${room.status === "leaving" ? ` el ${shortDate(room.availableFrom)}` : ""}, ${money(room.priceCents)}`;
  const c = roomColors(room.status);
  const style: ViewStyle = {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: R.sm,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? C.text : c.border,
    backgroundColor: c.bg,
  };
  const content = (
    <>
      <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: c.fg }} maxFontSizeMultiplier={1.2}>{room.name.replace("Habitación ", "H")}</Text>
      {showPrice ? <Text style={{ fontSize: 12, color: c.fg, opacity: 0.8 }} maxFontSizeMultiplier={1.2}>{`${Math.round(room.priceCents / 100)} €`}</Text> : null}
    </>
  );
  if (onPress)
    return (
      <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} hitSlop={7} style={style}>
        {content}
      </Tap>
    );
  return (
    <View style={style} accessible accessibilityLabel={label}>
      {content}
    </View>
  );
}

export function RoomLegend({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.md, rowGap: 4 }, style]}>
      {(Object.keys(ROOM_STATUS) as ProRoom["status"][]).map((s) => {
        const c = roomColors(s);
        return (
          <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg }} />
            <Text style={{ fontSize: 12, color: C.muted }} maxFontSizeMultiplier={1.3}>{ROOM_STATUS[s].label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const ZONE_TONE: Record<string, ToneKey> = {
  "San Vicente centro": "violet",
  Tómbola: "sky",
  "Ciudad Jardín": "emerald",
  "Alicante centro": "amber",
};

export function zoneTone(zone: string): ToneKey {
  return ZONE_TONE[zone] ?? "slate";
}

/** Portada del piso: bloque de color por zona (las fotos reales las sube el dueño). */
export function PropertyCover({ property, height = 128, radius = 0, children }: { property: ProProperty; height?: number; radius?: number; children?: React.ReactNode }) {
  const t = tone(zoneTone(property.zone));
  const cols = Math.max(1, Math.min(property.rooms.length, 3));
  const rows: ProRoom[][] = [];
  for (let i = 0; i < property.rooms.length; i += cols) rows.push(property.rooms.slice(i, i + cols));
  const chip: ViewStyle = { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: C.bg, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 3 };
  return (
    <View style={{ height, overflow: "hidden", backgroundColor: t.block, borderRadius: radius }}>
      {/* Plano esquemático: una celda por habitación. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", left: 20, right: 20, top: 24, bottom: 0, gap: 6, opacity: 0.6 }}>
        {rows.map((row, i) => (
          <View key={i} style={{ flex: 1, flexDirection: "row", gap: 6 }}>
            {row.map((r) => (
              <View
                key={r.id}
                style={{ flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderWidth: 1, borderBottomWidth: 0, borderColor: `${C.text}1A`, backgroundColor: C.bg, opacity: r.status === "free" ? 0.8 : 0.4 }}
              />
            ))}
            {row.length < cols ? Array.from({ length: cols - row.length }, (_, j) => <View key={`e${j}`} style={{ flex: 1 }} />) : null}
          </View>
        ))}
      </View>
      <View style={{ flex: 1, justifyContent: "space-between", padding: S.md }}>
        <View style={chip}>
          <MapPin size={12} color={t.strong} strokeWidth={1.9} />
          <Text style={{ fontFamily: FONT.semibold, fontSize: 11.5, color: t.strong }} maxFontSizeMultiplier={1.2}>{property.zone}</Text>
        </View>
        <View style={chip}>
          <Camera size={12} color={C.muted} strokeWidth={1.9} />
          <Text style={{ fontFamily: FONT.semibold, fontSize: 11.5, color: C.muted }} maxFontSizeMultiplier={1.2}>{`${property.photos} fotos`}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

/** Rasgos de una habitación en pequeño. */
export function RoomTraits({ room }: { room: ProRoom }) {
  const txt = { fontSize: 12, color: C.muted };
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 2 }}>
      <Text style={txt} maxFontSizeMultiplier={1.3}>{`${room.sizeM2} m²`}</Text>
      {room.exterior ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Sun size={12} color={C.muted} strokeWidth={1.9} />
          <Text style={txt} maxFontSizeMultiplier={1.3}>Exterior</Text>
        </View>
      ) : (
        <Text style={txt} maxFontSizeMultiplier={1.3}>Interior</Text>
      )}
      {room.privateBath ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Bath size={12} color={C.muted} strokeWidth={1.9} />
          <Text style={txt} maxFontSizeMultiplier={1.3}>Baño propio</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Si una habitación entra en el presupuesto del interesado. */
export function BudgetFit({ budgetCents, priceCents }: { budgetCents: number; priceCents: number }) {
  const diff = priceCents - budgetCents;
  if (diff <= 0)
    return (
      <Text style={{ fontSize: 12, fontFamily: FONT.semibold, color: C.success }} maxFontSizeMultiplier={1.3}>
        Entra en su presupuesto
      </Text>
    );
  return (
    <Text style={{ fontSize: 12, fontFamily: FONT.semibold, color: C.warning }} maxFontSizeMultiplier={1.3}>
      {`${money(diff)} por encima de su presupuesto`}
    </Text>
  );
}

/** Iniciales del agente en un círculo de su color. */
export function AgentDot({ name, toneKey }: { name: string; toneKey: ToneKey }) {
  return (
    <View accessible accessibilityLabel={`Agente: ${name}`} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: tone(toneKey).soft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 10, fontFamily: FONT.semibold, color: C.text }} maxFontSizeMultiplier={1.1}>
        {name
          .split(" ")
          .map((x) => x[0])
          .join("")
          .slice(0, 2)}
      </Text>
    </View>
  );
}

export function staffName(data: ProData, id?: string) {
  return data.staff.find((s) => s.id === id)?.name;
}

/** Día corto para chips: "hoy", "mañana", "vie 26". */
export function dayChip(date: string, today: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export function euros(input: string): number {
  return Math.round(Number(input.replace(",", ".")) * 100) || 0;
}
