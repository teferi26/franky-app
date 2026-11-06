import React from "react";
import { View } from "react-native";
import { CalendarPlus, Check, CircleSlash, ClipboardList, FileText, MessageCircle, Sparkles, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProLead } from "../../../../../shared/pro/types";
import type { ProTenantDocKind, ProTenantDocState, ProTenantDocs } from "../../../../../shared/pro/housing-types";
import { relative } from "../../../../../shared/pro/format";
import {
  DOC_KINDS,
  assignBest,
  docsProgress,
  flatCompatibility,
  leadFit,
  recordReply,
  replyTemplates,
  whatsappHref,
  type LeadFit,
  type ReplyId,
} from "../../../../../shared/pro/housing-ops";
import { usePro } from "../../store";
import { Field, Input, PButton, PText, Pill } from "../../kit";
import { openExternal } from "./drawer-common";
import { Box } from "./ui";

/**
 * Herramientas del interesado en el móvil, las mismas que la web: respuestas
 * por WhatsApp en un toque, por qué encaja, compatibilidad con el piso y
 * papeles pedidos o recibidos.
 */

const REPLY_ICON: Record<ReplyId, typeof MessageCircle> = {
  visit: CalendarPlus,
  terms: FileText,
  docs: ClipboardList,
  full: CircleSlash,
};

/** Cada botón abre WhatsApp con el mensaje escrito y deja apuntado que se ha contestado. */
export function QuickReplies({ lead }: { lead: ProLead }) {
  const { data, now, update, vertical } = usePro();
  const templates = replyTemplates(data, lead, now, vertical.id === "landlord");
  const sent = (id: ReplyId) => lead.replies?.filter((r) => r.id === id).at(-1);

  const reply = (t: (typeof templates)[number]) => {
    openExternal(whatsappHref(t.text));
    void update(`lead.reply.${t.id}`, (d) => recordReply(d, lead.id, t, new Date().toISOString())).then((ok) => {
      if (!ok) return;
      toast("Mensaje listo en WhatsApp", {
        kind: "success",
        body: lead.stage === "new" && t.nextStage ? `${lead.name.split(" ")[0]} pasa a contactado.` : "Solo tienes que enviarlo.",
      });
    });
  };

  return (
    <View style={{ gap: 6 }}>
      <PText v="label">Contestar por WhatsApp</PText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        {templates.map((t) => {
          const Icon = REPLY_ICON[t.id];
          const last = sent(t.id);
          return (
            <Tap
              key={t.id}
              onPress={() => reply(t)}
              accessibilityRole="button"
              accessibilityLabel={`${t.label} por WhatsApp`}
              style={{
                flexBasis: "48%",
                flexGrow: 1,
                minHeight: 50,
                flexDirection: "row",
                alignItems: "center",
                gap: S.sm,
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: R.md,
                paddingHorizontal: S.md,
                paddingVertical: 8,
                backgroundColor: C.surface,
              }}
            >
              <Icon size={16} color={C.muted} strokeWidth={1.9} />
              <View style={{ flex: 1 }}>
                <PText v="small" color={C.text} numberOfLines={1} style={{ fontFamily: FONT.semibold }}>{t.label}</PText>
                {last ? <PText v="tiny" numberOfLines={1}>{`Enviado ${relative(last.at, now.getTime())}`}</PText> : null}
              </View>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

/** Por qué encaja y la mejor habitación, con asignación en un toque. */
export function FitBox({ lead, fit }: { lead: ProLead; fit?: LeadFit }) {
  const { data, update, pending } = usePro();
  const f = fit ?? leadFit(data, lead);
  const target = f.best ? `${f.best.room.name} de ${f.best.property.title}` : f.wholeFlat ? `${f.wholeFlat.property.title} entero` : null;
  const already = f.best
    ? lead.roomId === f.best.room.id && lead.propertyId === f.best.property.id
    : f.wholeFlat
      ? lead.propertyId === f.wholeFlat.property.id
      : false;

  const assign = async () => {
    if (!(await update("lead.assign.best", (d) => assignBest(d, lead.id)))) return;
    toast("Habitación asignada", { kind: "success", body: target ?? undefined });
  };

  return (
    <Box style={f.fits ? { borderColor: `${C.success}55`, backgroundColor: `${C.success}0F` } : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Sparkles size={16} color={f.fits ? C.success : C.muted} strokeWidth={1.9} />
        <PText v="h3">{f.fits ? "Encaja con tu cartera" : "Ahora no encaja"}</PText>
      </View>
      {f.reasons.map((r) => (
        <View key={r} style={{ flexDirection: "row", gap: 6 }}>
          <Check size={14} color={C.success} strokeWidth={2} style={{ marginTop: 2 }} />
          <PText v="small" color={C.text} style={{ flex: 1 }}>{r}</PText>
        </View>
      ))}
      {f.issues.map((r) => (
        <View key={r} style={{ flexDirection: "row", gap: 6 }}>
          <CircleSlash size={14} color={C.warning} strokeWidth={1.9} style={{ marginTop: 2 }} />
          <PText v="small" color={C.text} style={{ flex: 1 }}>{r}</PText>
        </View>
      ))}
      {target && f.fits && !already ? (
        <PButton small variant="secondary" icon={lead.roomieGroup ? Users : Check} label={`Asignar ${target.toLowerCase()}`} onPress={() => void assign()} disabled={pending} />
      ) : null}
    </Box>
  );
}

/** Compatibilidad de Roomie con los que ya viven en el piso. */
export function FlatCompat({ personId, propertyId, exceptTenantId }: { personId: string; propertyId?: string; exceptTenantId?: string }) {
  const { data, now } = usePro();
  if (!propertyId) return null;
  const c = flatCompatibility(data, personId, propertyId, now, exceptTenantId);
  if (!c) return <PText v="tiny">Aún no vive nadie en el piso.</PText>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Users size={13} color={C.blue} strokeWidth={1.9} />
      <PText v="tiny" color={C.blueDeep}>{`${c.score} % compatible con ${c.with === 1 ? "quien vive allí" : `los ${c.with} que viven allí`}`}</PText>
    </View>
  );
}

const DOC_STATUS: { value: ProTenantDocState["status"]; label: string }[] = [
  { value: "missing", label: "Falta" },
  { value: "requested", label: "Pedido" },
  { value: "received", label: "Recibido" },
];

/** Papeles del interesado o del inquilino y los datos del avalista. Solo los ve el equipo. */
export function DocsChecklist({ docs, onChange }: { docs?: ProTenantDocs; onChange: (next: ProTenantDocs) => void }) {
  const current: ProTenantDocs = docs ?? { items: {} };
  const progress = docsProgress(current);
  const [name, setName] = React.useState(current.guarantor?.name ?? "");
  const [phone, setPhone] = React.useState(current.guarantor?.phone ?? "");
  const setItem = (kind: ProTenantDocKind, status: ProTenantDocState["status"]) =>
    onChange({ ...current, items: { ...current.items, [kind]: { status, at: new Date().toISOString() } } });
  const dirty = name.trim() !== (current.guarantor?.name ?? "") || phone.trim() !== (current.guarantor?.phone ?? "");

  return (
    <Box>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
        <PText v="h3">Documentación</PText>
        <Pill tone={progress.complete ? "success" : "warning"} label={`${progress.received} de ${progress.total}`} />
      </View>
      {DOC_KINDS.map((k) => {
        const status = current.items[k.id]?.status ?? "missing";
        return (
          <View key={k.id} style={{ gap: 6, paddingVertical: 4 }}>
            <PText v="small" color={C.text}>{k.label}</PText>
            <View style={{ flexDirection: "row", backgroundColor: C.input, borderRadius: R.sm, padding: 3, alignSelf: "flex-start" }}>
              {DOC_STATUS.map((s) => {
                const on = status === s.value;
                return (
                  <Tap
                    key={s.value}
                    onPress={() => setItem(k.id, s.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${k.label}: ${s.label}`}
                    style={{ minHeight: 34, paddingHorizontal: S.md, borderRadius: R.sm - 2, justifyContent: "center", backgroundColor: on ? C.surface : "transparent" }}
                  >
                    <PText v="tiny" color={on ? (s.value === "received" ? C.success : C.text) : C.muted} style={{ fontFamily: FONT.semibold }}>{s.label}</PText>
                  </Tap>
                );
              })}
            </View>
          </View>
        );
      })}
      <Field label="Avalista">
        <Input value={name} onChangeText={setName} placeholder="Nombre" />
      </Field>
      <Input value={phone} onChangeText={setPhone} placeholder="Teléfono del avalista" keyboardType="phone-pad" />
      {dirty ? (
        <PButton
          small
          variant="secondary"
          label="Guardar avalista"
          onPress={() => onChange({ ...current, guarantor: name.trim() ? { ...current.guarantor, name: name.trim(), phone: phone.trim() || undefined } : undefined })}
        />
      ) : null}
    </Box>
  );
}
