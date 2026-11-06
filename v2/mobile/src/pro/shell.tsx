import React from "react";
import { Image, Linking, RefreshControl, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Check, ChevronLeft, ChevronsUpDown, Ellipsis, RotateCcw, Sparkles } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { FadeIn } from "@/components/motion";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { MAX_FONT_SCALE } from "@/lib/a11y";
import { C, F, FONT, R, S } from "@/theme";
import type { ProData, ProSectionId } from "../../../shared/pro/types";
import { PRO_VERTICALS, VERTICAL_ORDER, demoSpaceId } from "../../../shared/pro/verticals";
import { relative } from "../../../shared/pro/format";
import { usePro } from "./store";
import { SECTION_META, sectionLabel } from "./sections";
import { Empty, IconButton, PText, Sheet } from "./kit";
import { SpaceAccessProvider, useSpaceAccess } from "./billing/access";
import { LockMark, PlanStripBar } from "./billing/ui";

const ICON = require("../../assets/images/icon.png");

/** Alto de la barra inferior sin el área segura. */
export const PRO_BAR_HEIGHT = 64;

export function sectionHref(spaceId: string, section: ProSectionId) {
  return section === "hoy" ? `/pro/${spaceId}` : `/pro/${spaceId}/${section}`;
}

export function useActiveSection(spaceId: string): ProSectionId {
  const pathname = usePathname() ?? "";
  const rest = pathname.replace(`/pro/${spaceId}`, "").split("/").filter(Boolean)[0];
  return (rest as ProSectionId) || "hoy";
}

/** Ir a otra sección del mismo negocio (sin apilar pantallas). */
export function useGoSection() {
  const router = useRouter();
  const { spaceId } = usePro();
  return React.useCallback((section: ProSectionId) => router.replace(sectionHref(spaceId, section) as never), [router, spaceId]);
}

/**
 * Cuerpo desplazable de cada sección. Deja sitio a la barra inferior y en un
 * negocio real permite deslizar para actualizar.
 */
export function ProPage({ children, contentStyle }: { children: React.ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const { demo, refresh, pending } = usePro();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={[{ paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: PRO_BAR_HEIGHT + insets.bottom + S.xl }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={demo ? undefined : <RefreshControl refreshing={pending} onRefresh={() => void refresh()} tintColor={C.muted} />}
    >
      <FadeIn>{children}</FadeIn>
    </ScrollView>
  );
}

/**
 * Carcasa de cada negocio. Envuelve todo en el acceso a Franky Pro para que
 * la barra, el menú y las secciones sepan qué lleva candado.
 */
export function ProShell({ children }: { children: React.ReactNode }) {
  const { spaceId, vertical, demo } = usePro();
  return (
    <SpaceAccessProvider spaceId={spaceId} demo={demo} vertical={vertical.id}>
      <ProShellFrame>{children}</ProShellFrame>
    </SpaceAccessProvider>
  );
}

function ProShellFrame({ children }: { children: React.ReactNode }) {
  const { spaceId, vertical, data, demo, now, canView, error, pending, refresh } = usePro();
  const { locked } = useSpaceAccess();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const active = useActiveSection(spaceId);
  const [switcher, setSwitcher] = React.useState(false);
  const [inbox, setInbox] = React.useState(false);
  const [more, setMore] = React.useState(false);
  const unread = data.inbox.filter((i) => !i.read).length;
  const nav = vertical.nav.filter((item) => canView(item.id));
  const primary = vertical.mobileNav.filter(canView);
  const barItems = primary.length ? primary : nav.slice(0, 3).map((n) => n.id);
  const go = (id: ProSectionId) => router.replace(sectionHref(spaceId, id) as never);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
        {demo ? <DemoStrip /> : null}
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md }}>
          <Tap onPress={() => router.replace("/pro" as never)} accessibilityRole="button" accessibilityLabel="Volver a Franky Pro" style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={22} color={C.text} />
          </Tap>
          <Tap onPress={() => setSwitcher(true)} accessibilityRole="button" accessibilityLabel="Cambiar de negocio" style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 44 }}>
            <Image source={ICON} style={{ width: 26, height: 26, borderRadius: 7 }} />
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>{data.space.name}</Text>
              <Text style={{ fontSize: 12, color: C.muted }} numberOfLines={1} maxFontSizeMultiplier={1.3}>{vertical.label}</Text>
            </View>
            <ChevronsUpDown size={15} color={C.muted} />
          </Tap>
          {demo || data.inbox.length ? <IconButton icon={Bell} label="Avisos" badge={unread || undefined} onPress={() => setInbox(true)} /> : null}
        </View>
      </View>

      {!demo && error ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: S.md, marginHorizontal: S.lg, marginTop: S.md, padding: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border }}>
          <PText v="small" style={{ flex: 1 }}>{error}</PText>
          <Tap onPress={() => void refresh()} disabled={pending} accessibilityRole="button" style={{ paddingHorizontal: S.md, paddingVertical: 8, borderRadius: R.sm, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontFamily: FONT.semibold, color: C.text }} maxFontSizeMultiplier={1.3}>Actualizar</Text>
          </Tap>
        </View>
      ) : null}

      {active === "hoy" ? <PlanStripBar spaceId={spaceId} vertical={vertical.id} demo={demo} now={now.getTime()} /> : null}

      <View style={{ flex: 1 }}>{children}</View>

      <View
        accessibilityRole="tablist"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border, flexDirection: "row" }}
      >
        {barItems.map((id) => {
          const Icon = SECTION_META[id].icon;
          const on = active === id;
          const closed = locked(id);
          return (
            <Tap key={id} onPress={() => go(id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={closed ? `${sectionLabel(vertical.id, id)}, Franky Pro` : sectionLabel(vertical.id, id)} style={{ flex: 1, height: PRO_BAR_HEIGHT, alignItems: "center", justifyContent: "center", gap: 3 }}>
              <View>
                <Icon size={21} color={on ? C.blue : C.muted} strokeWidth={on ? 2.2 : 1.8} />
                {closed ? (
                  <View style={{ position: "absolute", top: -5, right: -9 }}>
                    <LockMark size={8} />
                  </View>
                ) : null}
              </View>
              <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: on ? C.blue : C.muted }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {sectionLabel(vertical.id, id)}
              </Text>
            </Tap>
          );
        })}
        <Tap onPress={() => setMore(true)} accessibilityRole="tab" accessibilityState={{ selected: !barItems.includes(active) }} accessibilityLabel="Más secciones" style={{ flex: 1, height: PRO_BAR_HEIGHT, alignItems: "center", justifyContent: "center", gap: 3 }}>
          <Ellipsis size={21} color={barItems.includes(active) ? C.muted : C.blue} strokeWidth={1.8} />
          <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: barItems.includes(active) ? C.muted : C.blue }} maxFontSizeMultiplier={1.2}>Más</Text>
        </Tap>
      </View>

      <Sheet open={more} onClose={() => setMore(false)} title="Todas las secciones">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          {nav.map((item) => {
            const Icon = SECTION_META[item.id].icon;
            const on = active === item.id;
            const badge = navBadge(item.id, data);
            const closed = locked(item.id);
            return (
              <Tap
                key={item.id}
                onPress={() => {
                  setMore(false);
                  go(item.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={closed ? `${sectionLabel(vertical.id, item.id)}, Franky Pro` : sectionLabel(vertical.id, item.id)}
                style={{ width: "48.5%", minHeight: 112, padding: S.md, gap: 6, borderRadius: R.lg, borderWidth: 1, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.accentSoft : C.surface }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Icon size={20} color={on ? C.blue : C.text} strokeWidth={1.8} />
                  {closed ? (
                    <LockMark />
                  ) : badge ? (
                    <View style={{ backgroundColor: C.accentSoft, borderRadius: R.full, paddingHorizontal: 7, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 11, fontFamily: FONT.heading, color: C.blueDeep }} maxFontSizeMultiplier={1.2}>{badge}</Text>
                    </View>
                  ) : null}
                </View>
                <PText v="h3">{sectionLabel(vertical.id, item.id)}</PText>
                <PText v="tiny" numberOfLines={3}>{SECTION_META[item.id].blurb}</PText>
              </Tap>
            );
          })}
        </View>
        <PublicProfileRow />
      </Sheet>

      <SpaceSwitcher open={switcher} onClose={() => setSwitcher(false)} />
      <InboxSheet open={inbox} onClose={() => setInbox(false)} />
    </View>
  );
}

/** Números que merecen estar en el menú: cosas que esperan una respuesta. */
export function navBadge(id: ProSectionId, data: ProData): number | null {
  switch (id) {
    case "agenda":
    case "reservas":
      return data.bookings.filter((b) => b.status === "requested").length || null;
    case "grupos":
    case "estudiantes":
      return data.groupRequests.filter((g) => g.status === "new").length || null;
    case "interesados":
      return data.leads.filter((l) => l.stage === "new").length || null;
    case "inquilinos":
      return data.incidents.filter((i) => i.status === "open").length || null;
    case "moderacion":
      return data.uniModeration.filter((m) => m.status === "pending").length || null;
    default:
      return null;
  }
}

function PublicProfileRow() {
  const { data, demo } = usePro();
  if (!data.space.slug || (!demo && data.space.publicProfile.published !== true)) return null;
  return (
    <View style={{ marginTop: S.sm, padding: S.md, borderRadius: R.lg, backgroundColor: C.input, gap: 2 }}>
      <PText v="tiny">Tu ficha para estudiantes</PText>
      <PText v="h3">{`franky.es/n/${data.space.slug}`}</PText>
    </View>
  );
}

function DemoStrip() {
  const { resetDemo } = usePro();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: "#121019", paddingHorizontal: S.lg, paddingVertical: 8 }}>
      <Sparkles size={14} color="#A78BFA" strokeWidth={2} />
      <Text style={{ flex: 1, color: "#FFFFFF", fontSize: 12.5 }} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        Demo con datos de ejemplo. Lo que toques se queda en este móvil.
      </Text>
      <Tap onPress={resetDemo} accessibilityRole="button" accessibilityLabel="Reiniciar la demo" style={{ padding: 6 }}>
        <RotateCcw size={15} color="#FFFFFF" />
      </Tap>
      <Tap onPress={() => void Linking.openURL("https://franky.es/pro/empezar")} accessibilityRole="button" style={{ backgroundColor: "#FFFFFF", borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 5 }}>
        <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: "#121019" }} maxFontSizeMultiplier={1.2}>Crear mi negocio</Text>
      </Tap>
    </View>
  );
}

function SpaceSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { spaceId, demo } = usePro();
  const { workspaces } = useWorkspace();
  const router = useRouter();
  const pick = (id: string) => {
    onClose();
    if (id !== spaceId) router.replace(`/pro/${id}` as never);
  };
  const groups = VERTICAL_ORDER.reduce<Record<string, typeof VERTICAL_ORDER>>((acc, id) => {
    (acc[PRO_VERTICALS[id].group] ??= []).push(id);
    return acc;
  }, {});
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cambiar de negocio"
      description={demo ? "Prueba la app de cada sector con datos de ejemplo." : "Negocios a los que tienes acceso con esta cuenta."}
    >
      {!demo ? (
        <View style={{ gap: 4 }}>
          {workspaces.map((w) => (
            <SwitchRow key={w.id} title={w.name} detail={w.city ?? undefined} current={w.id === spaceId} onPress={() => pick(w.id)} />
          ))}
        </View>
      ) : (
        Object.entries(groups).map(([group, ids]) => (
          <View key={group} style={{ gap: 4 }}>
            <PText v="label" style={{ marginBottom: 4 }}>{group}</PText>
            {ids.map((id) => {
              const target = demoSpaceId(id);
              return <SwitchRow key={id} title={PRO_VERTICALS[id].label} detail={PRO_VERTICALS[id].tagline} current={target === spaceId} onPress={() => pick(target)} />;
            })}
          </View>
        ))
      )}
    </Sheet>
  );
}

function SwitchRow({ title, detail, current, onPress }: { title: string; detail?: string; current: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: current }} style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.md, paddingVertical: 10, borderRadius: R.md, backgroundColor: current ? C.accentSoft : "transparent", minHeight: 48 }}>
      <View style={{ flex: 1 }}>
        <PText v="h3">{title}</PText>
        {detail ? <PText v="tiny" numberOfLines={1}>{detail}</PText> : null}
      </View>
      {current ? <Check size={17} color={C.blue} /> : null}
    </Tap>
  );
}

function InboxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now, pending, can, spaceId } = usePro();
  const router = useRouter();
  const items = [...data.inbox].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Avisos"
      description="Reservas, mensajes y lo que necesita tu respuesta."
      footer={
        items.some((i) => !i.read) ? (
          <Tap
            disabled={pending || !can("inbox.readAll")}
            onPress={() => void update("inbox.readAll", (d) => ({ ...d, inbox: d.inbox.map((i) => ({ ...i, read: true })) }))}
            accessibilityRole="button"
            style={{ paddingVertical: 8 }}
          >
            <Text style={{ fontFamily: FONT.semibold, color: C.blue }} maxFontSizeMultiplier={1.3}>Marcar todo como leído</Text>
          </Tap>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <Empty icon={Bell} title="Todo al día" body="Cuando entre una reserva o un mensaje, aparecerá aquí." />
      ) : (
        items.map((it) => (
          <Tap
            key={it.id}
            accessibilityRole="button"
            onPress={async () => {
              const ok = await update("inbox.read", (d) => ({ ...d, inbox: d.inbox.map((i) => (i.id === it.id ? { ...i, read: true } : i)) }));
              if (!ok) return;
              onClose();
              if (it.href) router.replace(sectionHref(spaceId, it.href as ProSectionId) as never);
            }}
            style={{ flexDirection: "row", gap: S.md, paddingVertical: 10 }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: it.read ? "transparent" : C.blue }} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
                <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>{it.title}</PText>
                <PText v="tiny">{relative(it.at, now.getTime())}</PText>
              </View>
              <PText v="small">{it.body}</PText>
            </View>
          </Tap>
        ))
      )}
    </Sheet>
  );
}

export function ProShellSkeleton() {
  const insets = useSafeAreaInsets();
  const block = (h: number) => <View style={{ height: h, borderRadius: R.lg, backgroundColor: C.input }} />;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + S.lg, paddingHorizontal: S.lg, gap: S.md }} accessibilityLabel="Cargando tu negocio">
      {block(36)}
      <View style={{ flexDirection: "row", gap: S.sm }}>
        <View style={{ flex: 1 }}>{block(96)}</View>
        <View style={{ flex: 1 }}>{block(96)}</View>
      </View>
      {block(280)}
      <Text style={{ ...F.small, textAlign: "center" }} maxFontSizeMultiplier={MAX_FONT_SCALE}>Preparando tu negocio</Text>
    </View>
  );
}
