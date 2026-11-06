import React from "react";
import { Linking, Share, Text, View } from "react-native";
import { ArrowRight, Check, MessageCircle, type LucideIcon } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProData, ProSectionId } from "../../../../../shared/pro/types";
import type { ProTablesOps } from "../../../../../shared/pro/tables-types";
import { emptyTablesOps } from "../../../../../shared/pro/tables-ops";
import { buildTablesOps } from "../../../../../shared/pro/demo/tables-ops";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import { proCsvCell } from "../../../../../shared/pro/csv";
import { usePro } from "../../store";
import { useGoSection } from "../../shell";
import { Empty, Field, Input, PButton, PText, Panel } from "../../kit";

/**
 * Piezas compartidas de la operación diaria de hostelería en la app nativa,
 * igual que `ops-kit.tsx` de la web: acceso a `tablesOps`, WhatsApp,
 * importes en euros y filas de pendientes.
 */

export function useTablesOps() {
  const { data, update, demo, pending, vertical, now } = usePro();
  // Una visita de demo guardada antes de existir estas herramientas no trae
  // `tablesOps`: se reconstruye igual que la demo nueva.
  const fallback = React.useMemo(
    () => (demo && !data.tablesOps ? seedFrom(data, now) : null),
    // Solo cuando falta: no hay que recalcularla con cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demo, Boolean(data.tablesOps)],
  );
  const ops = data.tablesOps ?? fallback;

  const save = React.useCallback(
    async (label: string, fn: (ops: ProTablesOps) => ProTablesOps) => {
      if (pending) return false;
      return update(`ops.${label}`, (d) => ({
        ...d,
        tablesOps: fn(d.tablesOps ?? fallback ?? emptyTablesOps()),
      }));
    },
    [pending, update, fallback],
  );

  /**
   * Cambia la operación y el resto del espacio en un solo paso: por ejemplo,
   * agotar en la vitrina también quita el producto de la carta y del QR.
   */
  const saveAll = React.useCallback(
    async (label: string, fn: (data: ProData, ops: ProTablesOps) => ProData) => {
      if (pending) return false;
      return update(`ops.${label}`, (d) =>
        fn(d, d.tablesOps ?? fallback ?? emptyTablesOps()),
      );
    },
    [pending, update, fallback],
  );

  return { ops, save, saveAll, vertical, demo, pending };
}

function seedFrom(data: ProData, now: Date): ProTablesOps {
  return buildTablesOps({
    vertical: data.space.vertical,
    now,
    hours: data.space.hours,
    staff: data.staff,
    clients: data.clients,
    menu: data.menu,
    bookings: data.bookings,
    groupRequests: data.groupRequests,
    studyOccupied: 0,
  });
}

/** Estado vacío cuando el espacio aún no tiene estas herramientas. */
export function OpsMissing({ title, icon }: { title: string; icon?: LucideIcon }) {
  return (
    <Panel>
      <Empty
        icon={icon}
        title={title}
        body="Todavía no hay nada apuntado aquí. En cuanto tu espacio tenga estos datos, los verás en esta pantalla."
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* WhatsApp y compartir                                                 */
/* ------------------------------------------------------------------ */

/** Enlace para compartir un texto sin destinatario (se elige el chat). */
export function shareWhatsApp(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Abre WhatsApp con el texto: al número si lo hay; si no, se elige el chat. */
export function openWhatsApp(message: string, phone?: string) {
  const url = customerWhatsApp(phone, message) ?? shareWhatsApp(message);
  void Linking.openURL(url).catch(() => {
    toast("No se ha podido abrir WhatsApp", { kind: "error" });
  });
}

/** Comparte un texto con el menú del móvil (notas, correo, gestoría). */
export function shareText(title: string, message: string) {
  void Share.share({ title, message }).catch(() => {
    toast("No se ha podido compartir", { kind: "error" });
  });
}

/** Comparte un CSV (separador ;) como texto. */
export function shareCsv(title: string, rows: string[][]) {
  shareText(title, rows.map((r) => r.map(proCsvCell).join(";")).join("\n"));
}

/**
 * Botón que abre WhatsApp con el mensaje escrito. Quien lo pulsa decide si
 * lo envía; `onOpen` sirve para apuntar que se ha avisado.
 */
export function WhatsAppButton({
  phone,
  message,
  label = "WhatsApp",
  onOpen,
  variant = "outline",
  small = true,
  full,
  share,
}: {
  phone?: string;
  message: string;
  label?: string;
  onOpen?: () => void;
  variant?: "outline" | "dark" | "secondary" | "ghost";
  small?: boolean;
  full?: boolean;
  share?: boolean;
}) {
  const href = share ? shareWhatsApp(message) : customerWhatsApp(phone, message);
  return (
    <PButton
      label={label}
      icon={MessageCircle}
      variant={variant}
      small={small}
      full={full}
      disabled={!href}
      accessibilityLabel={href ? `${label} por WhatsApp` : `${label}: sin teléfono en la ficha`}
      onPress={() => {
        if (!href) return;
        onOpen?.();
        void Linking.openURL(href).catch(() => {
          toast("No se ha podido abrir WhatsApp", { kind: "error" });
        });
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Importes                                                             */
/* ------------------------------------------------------------------ */

/** "1,35" o "1.35" a céntimos. Vacío o no numérico: null. */
export function parseEuros(text: string): number | null {
  const clean = text.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function eurosText(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Campo de importe en euros con teclado decimal y el símbolo a la derecha. */
export function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <View style={{ justifyContent: "center" }}>
        <Input
          label={label}
          value={value}
          keyboardType="decimal-pad"
          placeholder="0,00"
          onChangeText={(t) => onChange(t.replace(/[^\d,.]/g, ""))}
          onBlur={() => {
            const cents = parseEuros(value);
            if (cents !== null) onChange(eurosText(cents));
          }}
          style={{ textAlign: "right", paddingRight: 30 }}
        />
        <Text
          style={{ position: "absolute", right: S.md, fontSize: 15, color: C.muted }}
          maxFontSizeMultiplier={1.3}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          €
        </Text>
      </View>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Filas y avisos                                                       */
/* ------------------------------------------------------------------ */

/** Fila de "Antes de irte": hecho en verde o pendiente que lleva a su sección. */
export function PendingRow({
  icon: Icon,
  label,
  done,
  section,
  last,
}: {
  icon: LucideIcon;
  label: string;
  done: boolean;
  section: ProSectionId;
  last?: boolean;
}) {
  const go = useGoSection();
  return (
    <Tap
      onPress={() => go(section)}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={{
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: S.md,
        paddingHorizontal: S.lg,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.borderLight,
      }}
    >
      {done ? (
        <Check size={16} color={C.success} strokeWidth={2.2} />
      ) : (
        <Icon size={16} color={C.warning} strokeWidth={1.9} />
      )}
      <PText v="body" color={done ? C.muted : C.text} style={{ flex: 1 }}>
        {label}
      </PText>
      <ArrowRight size={14} color={C.muted} />
    </Tap>
  );
}

/** Nota corta con fondo suave (la nota de un pedido, un aviso del grupo). */
export function SoftNote({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "neutral" }) {
  return (
    <View
      style={{
        borderRadius: R.md,
        paddingHorizontal: S.md,
        paddingVertical: 6,
        backgroundColor: tone === "amber" ? `${C.warning}1F` : C.input,
      }}
    >
      <Text style={{ fontSize: 13, color: C.text }} maxFontSizeMultiplier={1.3}>
        {children}
      </Text>
    </View>
  );
}

/** Cifra con su rótulo, para rejillas de dos columnas dentro de un panel. */
export function Figure({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <PText v="tiny">{label}</PText>
      <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.2}>
        {String(value)}
      </Text>
      {hint ? <PText v="tiny">{hint}</PText> : null}
    </View>
  );
}

/** Nombre corto de una persona del equipo. */
export function staffFirstName(data: ProData, id?: string): string {
  const name = data.staff.find((s) => s.id === id)?.name;
  return name ? name.split(" ")[0] : "Equipo";
}
