import React from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Check, ChevronLeft, Settings2, Sparkles } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { FadeIn, Stagger } from "@/components/motion";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { C, FONT, R, S, SHADOW } from "@/theme";
import { PText } from "@/pro/kit";
import { allowAccountPanel } from "@/pro/legacy-panel";
import { PRO_VERTICALS, VERTICAL_ORDER, demoSpaceId } from "../../../shared/pro/verticals";
import { PRO_IAP_TIERS, PRO_TRIAL_DAYS } from "../../../shared/pro/iap";
import type { ProVerticalId } from "../../../shared/pro/types";
import type { Workspace } from "../../../shared/workspaces";
import { useProAccess } from "@/pro/billing/access";
import { trialDaysLeft } from "@/pro/billing/logic";
import { plansHref } from "@/pro/billing/ui";

const GROUP_ORDER = ["Belleza", "Comer y beber", "Noche", "Deporte y aprendizaje", "Vivienda", "Comunidades"] as const;

const KIND_LABEL: Record<string, string> = {
  housing: "Pisos",
  community: "Comunidad",
  leisure: "Negocio",
  university: "Universidad",
};

/** Entrada de Franky Pro en la app: tus negocios arriba y las demos debajo. */
export default function ProHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, workspaces, canCreate } = useWorkspace();
  const mine = workspaces.filter((w) => w.status !== "archived");

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md }}>
          <Tap
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/perfil" as never))}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <ChevronLeft size={22} color={C.text} />
          </Tap>
          <Image source={require("../../assets/images/icon.png")} style={{ width: 26, height: 26, borderRadius: 7 }} />
          <Text style={{ fontFamily: FONT.display, fontSize: 18, letterSpacing: -0.4, color: C.text }} maxFontSizeMultiplier={1.2}>
            Franky <Text style={{ color: C.blue }}>Pro</Text>
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + S.xxl, gap: S.xl }}>
        {ready && mine.length ? (
          <FadeIn>
            <PText v="label" style={{ marginBottom: S.sm }}>Entra en tu negocio</PText>
            <View style={{ gap: S.sm }}>
              {mine.map((w) => (
                <Tap
                  key={w.id}
                  onPress={() => router.push(`/pro/${w.id}` as never)}
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir ${w.name}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: S.md, padding: S.lg, borderRadius: R.lg, backgroundColor: "#121019", ...SHADOW.card }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: FONT.heading, fontSize: 17, color: "#FFFFFF" }} numberOfLines={1} maxFontSizeMultiplier={1.3}>{w.name}</Text>
                    <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                      {[KIND_LABEL[w.kind] ?? "Espacio", w.city].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <ArrowRight size={20} color="#FFFFFF" />
                </Tap>
              ))}
            </View>
          </FadeIn>
        ) : null}

        {ready && mine.length ? <PlanBlock spaces={mine} /> : null}

        <FadeIn>
          <PText v="label">Para negocios, pisos, asociaciones y universidades</PText>
          <Text style={{ fontFamily: FONT.display, fontSize: 32, lineHeight: 36, letterSpacing: -1, color: C.text, marginTop: S.sm }} maxFontSizeMultiplier={1.25}>
            La app de tu negocio que te trae estudiantes.
          </Text>
          <PText v="body" color={C.muted} style={{ marginTop: S.sm }}>
            Agenda, reservas, clientes y equipo en el móvil. Y los estudiantes de tu ciudad a unos minutos de tu puerta, sin pagar comisión por cada uno.
          </PText>
          <View style={{ gap: 6, marginTop: S.md }}>
            {["Cuota fija, 0 % por cliente", "El cliente es tuyo y lo exportas", "Te lo dejamos montado en tu local"].map((t) => (
              <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <Check size={15} color={C.blue} strokeWidth={2.4} />
                <PText v="small" color={C.text}>{t}</PText>
              </View>
            ))}
          </View>
        </FadeIn>

        <View style={{ gap: S.xl }}>
          <View>
            <PText v="label">Pruébala por dentro</PText>
            <PText v="h1" style={{ marginTop: 4 }}>Elige tu tipo de negocio</PText>
            <PText v="small" style={{ marginTop: 4 }}>Cada demo es la app real con un negocio de ejemplo de Alicante. Nada sale de tu móvil.</PText>
          </View>
          {GROUP_ORDER.map((group) => {
            const ids = VERTICAL_ORDER.filter((id) => PRO_VERTICALS[id].group === group);
            if (!ids.length) return null;
            return (
              <View key={group} style={{ gap: S.sm }}>
                <PText v="h3" color={C.muted}>{group}</PText>
                <Stagger>
                  {ids.map((id) => {
                    const v = PRO_VERTICALS[id];
                    return (
                      <Tap
                        key={id}
                        onPress={() => router.push(`/pro/${demoSpaceId(id)}` as never)}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver la demo de ${v.label}`}
                        style={{ padding: S.lg, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, gap: 4, marginBottom: S.sm, ...SHADOW.card }}
                      >
                        <PText v="h2">{v.label}</PText>
                        <PText v="small">{v.tagline}</PText>
                        <PText v="small" color={C.text} style={{ marginTop: 6 }}>{v.studentHook}</PText>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: S.sm }}>
                          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>Ver la demo</Text>
                          <ArrowRight size={16} color={C.blue} />
                        </View>
                      </Tap>
                    );
                  })}
                </Stagger>
              </View>
            );
          })}
        </View>

        <View style={{ backgroundColor: "#121019", borderRadius: R.xl, padding: S.xl, gap: S.sm }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.6, color: "#FFFFFF" }} maxFontSizeMultiplier={1.25}>
            Te lo dejamos funcionando en tu local, en una visita.
          </Text>
          <Text style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }} maxFontSizeMultiplier={1.4}>
            Pasamos tus citas o reservas, formamos a tu equipo y ponemos el QR en tu mostrador.
          </Text>
          <Tap
            onPress={() => {
              // Con el alta directa abierta se crea el espacio; si no, alta asistida.
              if (canCreate) {
                allowAccountPanel();
                router.push("/espacios" as never);
              } else router.push("/pro/alta" as never);
            }}
            accessibilityRole="button"
            style={{ alignSelf: "flex-start", marginTop: S.sm, backgroundColor: "#FFFFFF", borderRadius: R.md, paddingHorizontal: S.lg, paddingVertical: 12 }}
          >
            <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: "#121019" }} maxFontSizeMultiplier={1.3}>Crear mi espacio</Text>
          </Tap>
        </View>

        {ready && mine.length ? (
          <Tap onPress={() => {
              allowAccountPanel();
              router.push("/espacios" as never);
            }} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: S.sm, alignSelf: "center", padding: S.sm }}>
            <Settings2 size={15} color={C.muted} />
            <PText v="small">Cuenta, equipo y facturación</PText>
          </Tap>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** "Tu plan": gratis, en prueba o Pro, con el camino al paywall. */
function PlanBlock({ spaces }: { spaces: Workspace[] }) {
  const router = useRouter();
  const { access } = useProAccess();
  // Sin respuesta del servidor no se dice nada: mejor callar que equivocarse.
  if (!access) return null;
  // Quien no es dueño ni administrador no contrata: su plan es el del negocio.
  if (!access.pro && !spaces.some((w) => w.role === "owner" || w.role === "admin")) return null;
  const withVertical = spaces.find((w) => w.subtype && w.subtype in PRO_VERTICALS);
  const vertical = withVertical ? (withVertical.subtype as ProVerticalId) : null;
  const href = vertical ? plansHref(vertical, withVertical?.id) : "/pro/planes";
  const days = trialDaysLeft(access, Date.now());
  const renews = access.expiresAt ? `renueva el ${new Date(access.expiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}` : null;
  const title = access.pro ? (days !== null ? "Prueba de Franky Pro" : "Franky Pro activo") : "Plan gratis";
  let body: string;
  if (access.pro && days !== null) body = days === 1 ? "Te queda 1 día de prueba. Después se renueva cada mes." : `Te quedan ${days} días de prueba. Después se renueva cada mes.`;
  else if (access.pro) body = [access.tier ? PRO_IAP_TIERS[access.tier].name : null, renews].filter(Boolean).join(", ") || "Tienes todas las herramientas de tu sector.";
  else if (access.trialEligible) body = `Tu escaparate está activo. Prueba Pro ${PRO_TRIAL_DAYS} días gratis y ten la app completa de tu negocio.`;
  else body = "Tu escaparate está activo. Pásate a Pro para tener la app completa de tu negocio.";
  return (
    <FadeIn>
      <PText v="label" style={{ marginBottom: S.sm }}>Tu plan</PText>
      <Tap
        onPress={() => router.push(href as never)}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${body}`}
        style={{ flexDirection: "row", alignItems: "center", gap: S.md, padding: S.lg, borderRadius: R.lg, borderWidth: access.pro ? 1 : 2, borderColor: access.pro ? C.border : C.blue, backgroundColor: access.pro ? C.surface : C.accentSoft }}
      >
        <Sparkles size={20} color={access.pro ? C.blue : C.blueDeep} strokeWidth={2} />
        <View style={{ flex: 1, gap: 2 }}>
          <PText v="h3" color={access.pro ? C.text : C.blueDeep}>{title}</PText>
          <PText v="small" color={access.pro ? C.muted : C.blueDeep}>{body}</PText>
        </View>
        <ArrowRight size={18} color={access.pro ? C.muted : C.blueDeep} />
      </Tap>
    </FadeIn>
  );
}
