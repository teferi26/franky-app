import React, { useEffect, useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Check, ChevronLeft, MessageCircle } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { FadeIn } from "@/components/motion";
import { supabase, WEB_URL } from "@/lib/supabase";
import { Field, Input, PButton, PText } from "@/pro/kit";
import { C, FONT, R, S } from "@/theme";
import type { ProVerticalId } from "../../../shared/pro/types";
import { PRO_VERTICALS, VERTICAL_ORDER, demoSpaceId } from "../../../shared/pro/verticals";
import { PRO_CONTACT } from "../../../shared/pro/contact";
import { PRO_TRIAL_DAYS } from "../../../shared/pro/iap";
import { tierForVertical } from "@/pro/billing/logic";
import { PlanCompare, plansHref } from "@/pro/billing/ui";

type Grupo = "ocio" | "vivienda" | "comunidad" | "universidad";
type Step = "sector" | "datos" | "hecho";

function sectorsFor(grupo: Grupo): ProVerticalId[] {
  if (grupo === "comunidad") return ["community"];
  if (grupo === "universidad") return ["university"];
  if (grupo === "vivienda") return VERTICAL_ORDER.filter((id) => PRO_VERTICALS[id].group === "Vivienda");
  return VERTICAL_ORDER.filter((id) => !["Vivienda", "Comunidades"].includes(PRO_VERTICALS[id].group));
}

const TITLES: Record<Grupo, string> = {
  ocio: "¿Qué tipo de negocio tienes?",
  vivienda: "¿Cómo alquilas?",
  comunidad: "Tu asociación en Franky",
  universidad: "Tu universidad en Franky",
};

/**
 * Alta en Franky Pro desde la app, igual que franky.es/pro/empezar: el
 * negocio elige su sector, deja sus datos y una persona de Franky se lo deja
 * montado. Mientras, puede probar ya la app de su sector con datos de ejemplo.
 */
export default function ProAlta() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ grupo?: string }>();
  const grupo: Grupo = (["ocio", "vivienda", "comunidad", "universidad"] as const).find((g) => g === params.grupo) ?? "ocio";
  const sectors = sectorsFor(grupo);

  const [step, setStep] = useState<Step>(sectors.length === 1 ? "datos" : "sector");
  const [vertical, setVertical] = useState<ProVerticalId | null>(sectors.length === 1 ? sectors[0] : null);
  const [business, setBusiness] = useState("");
  const [city, setCity] = useState("Alicante");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nombre y correo salen de la cuenta recién creada.
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive || !data.user) return;
      setEmail((prev) => prev || data.user?.email || "");
      const meta = data.user.user_metadata as Record<string, unknown> | undefined;
      const full = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
      setName((prev) => prev || full);
    });
    return () => {
      alive = false;
    };
  }, []);

  const v = vertical ? PRO_VERTICALS[vertical] : null;
  const valid = business.trim().length > 1 && name.trim().length > 1 && phone.replace(/\D/g, "").length >= 9 && /.+@.+\..+/.test(email.trim());

  const submit = async () => {
    if (!v || !valid) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${WEB_URL}/api/contacto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: name.trim(),
          email: email.trim(),
          asunto: `Alta Franky Pro: ${v.label}`,
          mensaje: `Negocio: ${business.trim()}\nSector: ${v.label}\nCiudad: ${city.trim()}\nTeléfono: ${phone.trim()}\nQuiere activar Franky Pro (alta desde la app).`,
          tipo: "otro",
          origen: "movil",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo enviar");
      }
      setStep("hecho");
    } catch (err) {
      setError(err instanceof Error && err.message !== "Network request failed" ? err.message : "No se pudo enviar. Escríbenos por WhatsApp y lo activamos igual.");
    } finally {
      setSending(false);
    }
  };

  const back = () => {
    if (step === "datos" && sectors.length > 1) setStep("sector");
    else router.replace("/onboarding-tipo");
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md }}>
          {step !== "hecho" ? (
            <Tap onPress={back} accessibilityRole="button" accessibilityLabel="Volver" style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={22} color={C.text} />
            </Tap>
          ) : null}
          <Text style={{ flex: 1, fontFamily: FONT.display, fontSize: 18, letterSpacing: -0.4, color: C.text }} maxFontSizeMultiplier={1.2}>
            Franky <Text style={{ color: C.blue }}>Pro</Text>
          </Text>
          <PText v="small">{step === "sector" ? "Paso 1 de 2" : step === "datos" ? (sectors.length > 1 ? "Paso 2 de 2" : "Un paso") : "Listo"}</PText>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + (step === "sector" && v ? 160 : S.xxl), gap: S.md }} keyboardShouldPersistTaps="handled">
        {step === "sector" ? (
          <FadeIn>
            <PText v="label">Empieza</PText>
            <Text style={{ fontFamily: FONT.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: C.text, marginTop: S.sm }} maxFontSizeMultiplier={1.25}>{TITLES[grupo]}</Text>
            <PText v="body" color={C.muted} style={{ marginTop: S.sm, marginBottom: S.md }}>Cada sector tiene su propia app. Elige el tuyo y te enseñamos lo que hará por ti.</PText>
            <View style={{ gap: S.sm }}>
              {sectors.map((id) => {
                const item = PRO_VERTICALS[id];
                const on = vertical === id;
                return (
                  <Tap
                    key={id}
                    onPress={() => setVertical(id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={{ flexDirection: "row", gap: S.md, padding: S.lg, borderRadius: R.lg, borderWidth: on ? 2 : 1, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.accentSoft : C.surface }}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.blue : "transparent", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                      {on ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <PText v="h3">{item.label}</PText>
                      <PText v="small">{item.tagline}</PText>
                    </View>
                  </Tap>
                );
              })}
            </View>
            {v ? (
              <View style={{ marginTop: S.xl, gap: S.md }}>
                <View style={{ gap: 4 }}>
                  <PText v="h2">{`${v.label}: gratis o con Pro`}</PText>
                  <PText v="small">
                    {tierForVertical(v.id)
                      ? `Empiezas gratis con tu escaparate. Con Pro tienes la app completa, y los primeros ${PRO_TRIAL_DAYS} días no pagas nada.`
                      : "Las universidades tienen la app completa con un contrato anual."}
                  </PText>
                </View>
                <PlanCompare vertical={v.id} />
              </View>
            ) : null}
          </FadeIn>
        ) : null}

        {step === "datos" && v ? (
          <FadeIn>
            <PText v="label">{v.label}</PText>
            <Text style={{ fontFamily: FONT.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: C.text, marginTop: S.sm }} maxFontSizeMultiplier={1.25}>Te lo dejamos funcionando</Text>
            <PText v="body" color={C.muted} style={{ marginTop: S.sm, marginBottom: S.md }}>
              Déjanos tus datos y te llamamos para montarlo contigo: pasamos tus citas o reservas, formamos a tu equipo y ponemos el QR en tu local.
            </PText>
            <View style={{ gap: S.md }}>
              <Field label={grupo === "universidad" ? "Universidad o servicio" : grupo === "comunidad" ? "Nombre de la asociación" : "Nombre del negocio"}>
                <Input value={business} onChangeText={setBusiness} placeholder={grupo === "ocio" ? "Barbería Nómada" : ""} autoCapitalize="words" />
              </Field>
              <Field label="Ciudad">
                <Input value={city} onChangeText={setCity} autoCapitalize="words" />
              </Field>
              <Field label="Tu nombre">
                <Input value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" />
              </Field>
              <Field label="Teléfono" hint="Solo lo usamos para ayudarte a ponerlo en marcha.">
                <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="600 000 000" />
              </Field>
              <Field label="Correo">
                <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
              </Field>
              {error ? <PText v="small" color={C.errorText}>{error}</PText> : null}
              <PButton label={sending ? "Enviando" : "Quiero Franky Pro"} full disabled={!valid || sending} onPress={() => void submit()} />
              <PButton
                label="Prefiero escribir por WhatsApp"
                icon={MessageCircle}
                variant="ghost"
                full
                onPress={() => void Linking.openURL(PRO_CONTACT.whatsappHref(`Hola, quiero activar Franky Pro para mi ${v.noun.replace(/^tu /, "")}.`))}
              />
            </View>
          </FadeIn>
        ) : null}

        {step === "hecho" && v ? (
          <FadeIn>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center" }}>
              <Check size={28} color={C.blue} strokeWidth={2.6} />
            </View>
            <Text style={{ fontFamily: FONT.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: C.text, marginTop: S.lg }} maxFontSizeMultiplier={1.25}>Recibido. Te llamamos pronto.</Text>
            <PText v="body" color={C.muted} style={{ marginTop: S.sm }}>
              {tierForVertical(v.id)
                ? `Una persona de Franky te llamará al ${phone.trim()} para ponerlo todo en marcha. Mientras, empieza tus ${PRO_TRIAL_DAYS} días gratis de Pro con tu cuenta de Apple, o prueba antes la app de tu sector con datos de ejemplo.`
                : `Una persona de Franky te llamará al ${phone.trim()} para ponerlo todo en marcha. Mientras, prueba la app de tu sector con datos de ejemplo: todo lo que toques se queda en tu móvil.`}
            </PText>
            <View style={{ gap: S.sm, marginTop: S.lg }}>
              {tierForVertical(v.id) ? (
                <>
                  <PButton label={`Empezar mis ${PRO_TRIAL_DAYS} días gratis de Pro`} icon={ArrowRight} full onPress={() => router.push(plansHref(v.id) as never)} />
                  <PButton label="Probar la app de mi sector" variant="outline" full onPress={() => router.replace(`/pro/${demoSpaceId(v.id)}` as never)} />
                  <PButton label="Ver Franky Pro" variant="ghost" full onPress={() => router.replace("/pro" as never)} />
                </>
              ) : (
                <>
                  <PButton label="Probar la app de mi sector" icon={ArrowRight} full onPress={() => router.replace(`/pro/${demoSpaceId(v.id)}` as never)} />
                  <PButton label="Ver Franky Pro" variant="outline" full onPress={() => router.replace("/pro" as never)} />
                </>
              )}
            </View>
          </FadeIn>
        ) : null}
      </ScrollView>

      {step === "sector" && v ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: S.lg, paddingBottom: insets.bottom + S.lg, gap: S.sm, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.borderLight }}>
          <PButton label={`Continuar con ${v.label.toLowerCase()}`} icon={ArrowRight} full onPress={() => setStep("datos")} />
          <PButton label="Ver la app de ejemplo" variant="outline" full onPress={() => router.push(`/pro/${demoSpaceId(v.id)}` as never)} />
        </View>
      ) : null}
    </View>
  );
}
