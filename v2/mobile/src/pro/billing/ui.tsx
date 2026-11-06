import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { C, FONT, R, S } from "@/theme";
import type { ProSectionId, ProVerticalId } from "../../../../shared/pro/types";
import { PRO_TRIAL_DAYS } from "../../../../shared/pro/iap";
import { PRO_VERTICALS, demoSpaceId } from "../../../../shared/pro/verticals";
import { PButton, PText, PageHeader, Panel } from "../kit";
import { SECTION_META, sectionLabel } from "../sections";
import { FREE_SHOWCASE, planStrip, planStripText, proGains } from "./logic";
import { useSpaceAccess } from "./access";

/** Ruta del paywall para un sector (y el negocio desde el que se llega). */
export function plansHref(vertical: ProVerticalId, spaceId?: string): string {
  const space = spaceId ? `&space=${encodeURIComponent(spaceId)}` : "";
  return `/pro/planes?vertical=${encodeURIComponent(vertical)}${space}`;
}

function Line({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: S.sm, alignItems: "flex-start" }}>
      <Check size={16} color={strong ? C.blue : C.muted} strokeWidth={2.4} style={{ marginTop: 2 }} />
      <PText v="small" color={C.text} style={{ flex: 1 }}>{text}</PText>
    </View>
  );
}

/**
 * Comparativa Gratis frente a Pro para un sector. La usan el paywall y el
 * alta: arriba el escaparate que tiene cualquiera, debajo todo lo que gana
 * ese tipo de negocio con Pro.
 */
export function PlanCompare({ vertical, price }: { vertical: ProVerticalId; price?: string | null }) {
  const v = PRO_VERTICALS[vertical];
  return (
    <View style={{ gap: S.md }}>
      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: S.sm }}>
          <PText v="h2">Gratis</PText>
          <PText v="small">0 € para siempre</PText>
        </View>
        <PText v="small" style={{ marginBottom: 4 }}>El escaparate de tu negocio en Franky.</PText>
        {FREE_SHOWCASE.map((line) => (
          <Line key={line} text={line} />
        ))}
      </View>

      <View style={{ borderRadius: R.lg, borderWidth: 2, borderColor: C.blue, backgroundColor: C.surface, overflow: "hidden" }}>
        <View style={{ backgroundColor: C.accentSoft, paddingHorizontal: S.lg, paddingVertical: S.md, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Sparkles size={16} color={C.blueDeep} strokeWidth={2.2} />
              <PText v="h2" color={C.blueDeep}>Franky Pro</PText>
            </View>
            <PText v="small" color={C.blueDeep}>{price ? `${price} al mes` : `${PRO_TRIAL_DAYS} días gratis`}</PText>
          </View>
          <PText v="small" color={C.blueDeep}>{`La app completa de ${v.noun}. Todo lo gratis y además:`}</PText>
        </View>
        <View style={{ padding: S.lg, gap: S.sm }}>
          {proGains(vertical).map((line) => (
            <Line key={line} text={line} strong />
          ))}
        </View>
      </View>
    </View>
  );
}

/** Franja de Hoy: plan gratis o días de prueba. Nada si ya es Pro. */
export function PlanStripBar({ spaceId, vertical, demo, now }: { spaceId: string; vertical: ProVerticalId; demo: boolean; now: number }) {
  const router = useRouter();
  const { access } = useSpaceAccess();
  const { workspaces } = useWorkspace();
  const role = workspaces.find((w) => w.id === spaceId)?.role;
  const strip = planStrip({ demo, access, vertical, now });
  // El plan lo lleva el dueño o un administrador; el resto del equipo no lo ve.
  if (!strip || access?.viaTeam || (role && role !== "owner" && role !== "admin")) return null;
  const text = planStripText(strip);
  return (
    <Tap
      onPress={() => router.push(plansHref(vertical, spaceId) as never)}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={{ flexDirection: "row", alignItems: "center", gap: S.sm, marginHorizontal: S.lg, marginTop: S.md, paddingHorizontal: S.md, minHeight: 44, borderRadius: R.md, backgroundColor: C.accentSoft }}
    >
      <Sparkles size={15} color={C.blueDeep} strokeWidth={2.2} />
      <Text style={{ flex: 1, fontFamily: FONT.semibold, fontSize: 13.5, color: C.blueDeep }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {text}
      </Text>
      <ArrowRight size={16} color={C.blueDeep} />
    </Tap>
  );
}

/** Candado pequeño para la barra inferior y el menú Más. */
export function LockMark({ size = 11 }: { size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, backgroundColor: C.text, alignItems: "center", justifyContent: "center" }}
    >
      <Lock size={size} color={C.bg} strokeWidth={2.4} />
    </View>
  );
}

/**
 * Lo que se ve en una sección de Pro sin tener Pro: qué hace esa sección, lo
 * que gana el negocio y el camino a la prueba de 7 días.
 */
export function ProLockScreen({ spaceId, vertical, section }: { spaceId: string; vertical: ProVerticalId; section: ProSectionId }) {
  const router = useRouter();
  const { access } = useSpaceAccess();
  const { workspaces } = useWorkspace();
  const role = workspaces.find((w) => w.id === spaceId)?.role;
  // Pro se activa con la cuenta del dueño o de un administrador del negocio.
  const canBuy = !role || role === "owner" || role === "admin";
  const label = sectionLabel(vertical, section);
  const trial = access?.trialEligible !== false;
  return (
    <View>
      <PageHeader eyebrow={label} title="Esto es Franky Pro" description={SECTION_META[section].blurb} />
      <Panel title="Lo que ganas con Pro" description={`Todo esto para ${PRO_VERTICALS[vertical].noun}, además de tu escaparate gratis.`}>
        <View style={{ gap: S.sm }}>
          {proGains(vertical).map((line) => (
            <Line key={line} text={line} strong />
          ))}
        </View>
      </Panel>
      {canBuy ? (
        <View style={{ gap: S.sm }}>
          <PButton label={trial ? `Empezar ${PRO_TRIAL_DAYS} días gratis` : "Ver Franky Pro"} icon={Sparkles} full onPress={() => router.push(plansHref(vertical, spaceId) as never)} />
          <PButton label={`Ver ${label.toLowerCase()} en la demo`} variant="outline" full onPress={() => router.push(`/pro/${demoSpaceId(vertical)}/${section}` as never)} />
        </View>
      ) : (
        <View style={{ gap: S.md }}>
          <View style={{ padding: S.md, borderRadius: R.lg, backgroundColor: C.input }}>
            <PText v="small" color={C.text}>Pide a quien lleva el negocio que active Franky Pro desde su cuenta: se activa para todo el equipo.</PText>
          </View>
          <PButton label={`Ver ${label.toLowerCase()} en la demo`} variant="outline" full onPress={() => router.push(`/pro/${demoSpaceId(vertical)}/${section}` as never)} />
        </View>
      )}
    </View>
  );
}
