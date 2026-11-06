import React from "react";
import { Linking, Text, View } from "react-native";
import { ArrowRight, ChevronDown, MessageCircle, PlayCircle } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S, SHADOW } from "@/theme";
import { PRO_CONTACT } from "../../../../../shared/pro/contact";
import type { ProGuideChapter } from "../../../../../shared/pro/verticals";
import { usePro } from "../../store";
import { ProPage, useGoSection } from "../../shell";
import { SECTION_META, sectionLabel } from "../../sections";
import { DarkBlock, DarkText, PText, PageHeader, Panel } from "../../kit";
import { SetupChecklist } from "./checklist";

const WHEN_ORDER: ProGuideChapter["when"][] = ["Primer día", "Cada día", "Cada semana", "Cada temporada"];

const FAQ: { q: string; a: string }[] = [
  { q: "¿Mis clientes tienen que descargarse Franky?", a: "No. Puedes apuntar a cualquiera en tu agenda o libro con su nombre y teléfono. Si tiene Franky, recibe los avisos en la app; si no, le escribes por WhatsApp." },
  { q: "¿Cuánto me cobra Franky por cada cliente que me trae?", a: "Nada. Pagas tu cuota fija y ya. Ni por reserva, ni por comensal, ni por primera visita. Solo las entradas vendidas online llevan una pequeña comisión que paga el comprador." },
  { q: "¿Qué pasa si ya uso otra agenda o TPV?", a: "Te ayudamos a pasar tus citas y clientes en la visita de alta. Tu TPV sigue emitiendo las facturas: Franky registra cobros y cierres para tu control." },
  { q: "¿Quién ve mis datos?", a: "Tu equipo, cada uno con su rol. Franky no usa a tus clientes para otros negocios y te los llevas en CSV cuando quieras." },
  // En la web se explica cómo añadirla a la pantalla de inicio; aquí ya se está en la app.
  { q: "¿Puedo usarlo desde el ordenador?", a: "Sí. Entra en franky.es/pro con la misma cuenta y verás lo mismo que en el móvil." },
];

export default function GuiaSection() {
  const { vertical, data } = usePro();
  const go = useGoSection();
  const chapters = [...vertical.guide].sort((a, b) => WHEN_ORDER.indexOf(a.when) - WHEN_ORDER.indexOf(b.when));
  const [open, setOpen] = React.useState<string | null>(chapters[0]?.id ?? null);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Guía"
        title={`Cómo sacarle todo el partido en ${vertical.noun}`}
        description="Capítulos cortos para el primer día, para cada día y para cada momento del curso."
      />

      <SetupChecklist always />

      {WHEN_ORDER.map((when) => {
        const list = chapters.filter((c) => c.when === when);
        if (!list.length) return null;
        return (
          <View key={when} style={{ marginBottom: S.xl }}>
            <PText v="label" style={{ marginBottom: S.sm }}>{when}</PText>
            <View style={{ gap: S.sm }}>
              {list.map((c) => {
                const isOpen = open === c.id;
                return (
                  <View key={c.id} style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: "hidden", ...SHADOW.card }}>
                    <Tap
                      onPress={() => setOpen(isOpen ? null : c.id)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                      accessibilityLabel={c.title}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md, paddingHorizontal: S.lg, paddingVertical: 14, minHeight: 52 }}
                    >
                      <Text style={{ flex: 1, fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3}>{c.title}</Text>
                      <ChevronDown size={17} color={C.muted} style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }} />
                    </Tap>
                    {isOpen ? (
                      <View style={{ gap: S.md, paddingHorizontal: S.lg, paddingBottom: S.lg }}>
                        {c.body.map((p, i) => (
                          <View key={i} style={{ flexDirection: "row", gap: S.md }}>
                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.input, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                              <Text style={{ fontFamily: FONT.heading, fontSize: 11.5, color: C.text }} maxFontSizeMultiplier={1.2}>{i + 1}</Text>
                            </View>
                            <PText v="small" style={{ flex: 1 }}>{p}</PText>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      <View style={{ marginBottom: S.xl }}>
        <PText v="label" style={{ marginBottom: S.sm }}>Tu app, pantalla a pantalla</PText>
        <View style={{ gap: S.sm }}>
          {vertical.nav
            .filter((n) => n.id !== "guia")
            .map((n) => {
              const Icon = SECTION_META[n.id].icon;
              const label = sectionLabel(vertical.id, n.id);
              return (
                <Tap
                  key={n.id}
                  onPress={() => go(n.id)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md, padding: S.lg, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}
                >
                  <Icon size={20} color={C.blue} strokeWidth={1.8} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <PText v="h3">{label}</PText>
                      <ArrowRight size={14} color={C.muted} />
                    </View>
                    <PText v="small">{SECTION_META[n.id].blurb}</PText>
                  </View>
                </Tap>
              );
            })}
        </View>
      </View>

      <View style={{ marginBottom: S.xl }}>
        <PText v="label" style={{ marginBottom: S.sm }}>Preguntas frecuentes</PText>
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}>
          {FAQ.map((f, i) => (
            <View key={f.q} style={{ paddingHorizontal: S.lg, paddingVertical: 14, gap: 4, borderBottomWidth: i === FAQ.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
              <PText v="h3">{f.q}</PText>
              <PText v="small">{f.a}</PText>
            </View>
          ))}
        </View>
      </View>

      <DarkBlock>
        <DarkText v="h2">Te ayudamos en persona</DarkText>
        <DarkText v="small" dim>
          Una persona de Franky te lo deja montado en tu local, forma a tu equipo y resuelve dudas por WhatsApp.
        </DarkText>
        <Tap
          onPress={() => void Linking.openURL(PRO_CONTACT.whatsappHref(`Hola, soy de ${data.space.name} y tengo una duda con Franky Pro`))}
          accessibilityRole="link"
          accessibilityLabel="Escribir por WhatsApp"
          style={{ marginTop: S.sm, minHeight: 46, borderRadius: R.md, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm }}
        >
          <MessageCircle size={17} color="#121019" />
          <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: "#121019" }} maxFontSizeMultiplier={1.3}>Escribir por WhatsApp</Text>
        </Tap>
        <DarkText v="small" dim style={{ textAlign: "center" }}>{PRO_CONTACT.phoneLabel}</DarkText>
      </DarkBlock>

      <Panel title="Lo que te promete Franky">
        <View style={{ gap: S.md }}>
          {vertical.promises.map((p) => (
            <View key={p} style={{ flexDirection: "row", gap: S.sm }}>
              <PlayCircle size={16} color={C.blue} strokeWidth={1.8} style={{ marginTop: 2 }} />
              <PText v="small" style={{ flex: 1 }}>{p}</PText>
            </View>
          ))}
        </View>
      </Panel>
    </ProPage>
  );
}
