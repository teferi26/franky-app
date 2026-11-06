import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, MessageCircle, RotateCcw, Smartphone, Sparkles } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { FadeIn } from "@/components/motion";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import { ChoiceGrid, DarkBlock, DarkText, PButton, PText, Panel } from "@/pro/kit";
import { useProAccess } from "@/pro/billing/access";
import { fetchTierPrice, openManageSubscriptions, purchasePro, restorePro, storeAvailable, type PurchaseResult } from "@/pro/billing/iap";
import { coversVertical, renewalNotice, tierForVertical, trialDaysLeft, type ProAccess } from "@/pro/billing/logic";
import { PlanCompare } from "@/pro/billing/ui";
import type { ProVerticalId } from "../../../shared/pro/types";
import { PRO_IAP_TIERS, PRO_TRIAL_DAYS } from "../../../shared/pro/iap";
import { PRO_VERTICALS, VERTICAL_ORDER } from "../../../shared/pro/verticals";
import { PRO_CONTACT } from "../../../shared/pro/contact";

type Store = "checking" | "ready" | "unavailable";

function isVertical(value: unknown): value is ProVerticalId {
  return typeof value === "string" && value in PRO_VERTICALS;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

/**
 * Paywall de Franky Pro. Compra dentro de la app con Apple: 7 días gratis y
 * después cobro mensual automático. El precio sale siempre de StoreKit. En
 * Android, web o Expo Go se explica que se contrata desde iPhone.
 */
export default function ProPlanes() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ vertical?: string; space?: string }>();
  const { active } = useWorkspace();
  const { userId, access, refresh } = useProAccess();

  const fromActive = active?.subtype && isVertical(active.subtype) ? active.subtype : null;
  const [picked, setPicked] = useState<ProVerticalId | null>(isVertical(params.vertical) ? params.vertical : fromActive);
  const vertical = picked;
  const tier = vertical ? tierForVertical(vertical) : null;
  const plan = tier ? PRO_IAP_TIERS[tier] : null;

  const [store, setStore] = useState<Store>(Platform.OS === "ios" ? "checking" : "unavailable");
  const [price, setPrice] = useState<string | null>(null);
  const [priceFailed, setPriceFailed] = useState(false);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);

  const loadPrice = useCallback(async () => {
    if (!tier) return;
    setPriceFailed(false);
    const ok = await storeAvailable();
    setStore(ok ? "ready" : "unavailable");
    if (!ok) return;
    const value = await fetchTierPrice(tier);
    setPrice(value);
    setPriceFailed(!value);
  }, [tier]);

  useEffect(() => {
    setPrice(null);
    void loadPrice();
  }, [loadPrice]);

  const covered = vertical ? coversVertical(access, vertical) : !!access?.pro;
  const done = (next: ProAccess) => {
    if (!(vertical ? coversVertical(next, vertical) : next.pro)) return;
    if (typeof params.space === "string" && params.space) router.replace(`/pro/${params.space}` as never);
    else if (router.canGoBack()) router.back();
    else router.replace("/pro" as never);
  };

  const handle = (result: PurchaseResult, restoring: boolean) => {
    switch (result.kind) {
      case "ok":
        if (result.access.pro) {
          toast(result.access.isTrial ? "Tu prueba de Franky Pro ha empezado" : "Franky Pro activado", { kind: "success" });
          done(result.access);
        } else toast("Esta suscripción ya no está activa", { kind: "info", body: "Puedes volver a suscribirte cuando quieras." });
        return;
      case "cancelled":
        return;
      case "pending":
        toast("Compra pendiente de aprobación", { kind: "info", body: "Cuando Apple la apruebe, Franky Pro se activará solo." });
        return;
      case "none":
        toast(restoring ? "No hay compras que restaurar" : "No se ha completado la compra", { kind: "info", body: "No encontramos ninguna suscripción de Franky Pro en esta cuenta de Apple." });
        return;
      case "unavailable":
        setStore("unavailable");
        toast("La App Store no está disponible ahora", { kind: "error" });
        return;
      case "failed":
        toast(result.message, { kind: "error" });
        void refresh();
    }
  };

  const buy = async () => {
    if (!tier || !userId || busy) return;
    setBusy("buy");
    try {
      handle(await purchasePro(tier, userId), false);
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!userId || busy) return;
    setBusy("restore");
    try {
      handle(await restorePro(userId), true);
    } finally {
      setBusy(null);
    }
  };

  const withTrial = access?.trialEligible !== false;
  const trialLeft = trialDaysLeft(access, Date.now());

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md }}>
          <Tap
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/pro" as never))}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <ChevronLeft size={22} color={C.text} />
          </Tap>
          <Text style={{ flex: 1, fontFamily: FONT.display, fontSize: 18, letterSpacing: -0.4, color: C.text }} maxFontSizeMultiplier={1.2}>
            Franky <Text style={{ color: C.blue }}>Pro</Text>
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + S.xxl }}>
        <FadeIn>
          <DarkBlock>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Sparkles size={14} color="#A78BFA" strokeWidth={2.2} />
              <DarkText v="label" dim>{vertical ? PRO_VERTICALS[vertical].label : "Franky Pro"}</DarkText>
            </View>
            <DarkText v="display" style={{ fontSize: 34, lineHeight: 38 }}>Pasa a Franky Pro</DarkText>
            <DarkText dim>
              {[
                vertical ? `La app completa para ${PRO_VERTICALS[vertical].noun}.` : "La app completa de tu negocio.",
                withTrial ? `${PRO_TRIAL_DAYS} días gratis para probarlo todo.` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            </DarkText>
            {plan ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.xs }}>
                {withTrial ? (
                  <View style={{ backgroundColor: "#FFFFFF", borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 5 }}>
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: "#121019" }} maxFontSizeMultiplier={1.2}>{`${PRO_TRIAL_DAYS} días gratis`}</Text>
                  </View>
                ) : null}
                {price ? (
                  <View style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 5 }}>
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: "#FFFFFF" }} maxFontSizeMultiplier={1.2}>{withTrial ? `Después ${price} al mes` : `${price} al mes`}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </DarkBlock>

          {!vertical ? (
            <Panel title="¿Qué tipo de negocio tienes?" description="Cada sector tiene su propia app y su plan.">
              <ChoiceGrid
                options={VERTICAL_ORDER.filter((id) => id !== "university").map((id) => ({ value: id, label: PRO_VERTICALS[id].label }))}
                value={"" as ProVerticalId}
                onChange={setPicked}
              />
            </Panel>
          ) : null}

          {covered && access ? (
            <Panel title={access.viaTeam ? "Tu equipo tiene Franky Pro" : "Ya tienes Franky Pro"}>
              <PText v="body" color={C.text}>
                {trialLeft !== null
                  ? `Estás en la prueba gratis: ${trialLeft === 1 ? "te queda 1 día" : `te quedan ${trialLeft} días`}.`
                  : access.expiresAt
                    ? `Tu plan sigue activo. Próxima renovación: ${formatDate(access.expiresAt)}.`
                    : "Tu plan está activo."}
              </PText>
              {Platform.OS === "ios" ? (
                <PButton
                  label="Gestionar suscripción"
                  variant="outline"
                  full
                  style={{ marginTop: S.md }}
                  onPress={() => {
                    void openManageSubscriptions().then((ok) => {
                      if (!ok) void Linking.openURL("https://apps.apple.com/account/subscriptions");
                    });
                  }}
                />
              ) : null}
            </Panel>
          ) : null}

          {vertical ? (
            <View style={{ marginBottom: S.lg }}>
              <PlanCompare vertical={vertical} price={price} />
            </View>
          ) : null}

          {vertical && !tier ? (
            <Panel title="Las universidades van por contrato anual" description="Lo preparamos con vuestro servicio y os lo dejamos funcionando.">
              <PButton
                label="Hablar con Franky"
                icon={MessageCircle}
                full
                onPress={() => void Linking.openURL(PRO_CONTACT.whatsappHref("Hola, quiero Franky Pro para nuestra universidad."))}
              />
            </Panel>
          ) : null}

          {tier && plan && !covered ? (
            store === "unavailable" ? (
              <Panel>
                <View style={{ flexDirection: "row", gap: S.md, alignItems: "flex-start" }}>
                  <Smartphone size={22} color={C.text} strokeWidth={1.8} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <PText v="h3">La suscripción está disponible en iPhone</PText>
                    <PText v="small">
                      Franky Pro se contrata desde la app de Franky en un iPhone, con tu cuenta de Apple. Entra allí con esta misma cuenta y se activará también aquí.
                    </PText>
                  </View>
                </View>
              </Panel>
            ) : store === "checking" || (!price && !priceFailed) ? (
              <View style={{ alignItems: "center", gap: S.sm, paddingVertical: S.lg }}>
                <ActivityIndicator color={C.muted} />
                <PText v="small">Conectando con la App Store</PText>
              </View>
            ) : !price ? (
              <Panel>
                <PText v="small" style={{ marginBottom: S.md }}>No hemos podido cargar el precio de la App Store. Revisa tu conexión.</PText>
                <PButton label="Reintentar" icon={RotateCcw} variant="outline" full onPress={() => void loadPrice()} />
              </Panel>
            ) : (
              <View style={{ gap: S.md }}>
                <View style={{ gap: 2 }}>
                  <PText v="h3">{plan.name}</PText>
                  <PText v="small">{`Suscripción mensual · ${price} al mes`}</PText>
                </View>
                {!userId ? (
                  <PButton label="Entra para suscribirte" full onPress={() => router.push("/welcome" as never)} />
                ) : (
                  <PButton
                    label={busy === "buy" ? "Abriendo la App Store" : withTrial ? `Empezar ${PRO_TRIAL_DAYS} días gratis` : "Suscribirme"}
                    icon={Sparkles}
                    full
                    disabled={busy !== null}
                    onPress={() => void buy()}
                  />
                )}
                <PText v="tiny">{renewalNotice(price, withTrial)}</PText>
              </View>
            )
          ) : null}

          {tier && store === "ready" && userId ? (
            <PButton
              label={busy === "restore" ? "Restaurando" : "Restaurar compras"}
              variant="ghost"
              full
              disabled={busy !== null}
              style={{ marginTop: S.sm }}
              onPress={() => void restore()}
            />
          ) : null}

          <View style={{ flexDirection: "row", justifyContent: "center", gap: S.lg, marginTop: S.md }}>
            <Tap onPress={() => void Linking.openURL("https://franky.es/terminos")} accessibilityRole="link" style={{ paddingVertical: S.sm }}>
              <PText v="small" style={{ textDecorationLine: "underline" }}>Términos de uso</PText>
            </Tap>
            <Tap onPress={() => void Linking.openURL("https://franky.es/privacidad")} accessibilityRole="link" style={{ paddingVertical: S.sm }}>
              <PText v="small" style={{ textDecorationLine: "underline" }}>Privacidad</PText>
            </Tap>
          </View>
        </FadeIn>
      </ScrollView>
    </View>
  );
}
