import React from "react";
import { View } from "react-native";
import { CalendarPlus, Check, ChevronDown, ChevronUp, CircleSlash, Clock3, Inbox, Sparkles } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, R, S, SHADOW } from "@/theme";
import type { ProLead } from "../../../../../shared/pro/types";
import { money } from "../../../../../shared/pro/format";
import { shortDate, waitingLabel, waitingMinutes, waitingTone } from "../../../../../shared/pro/housing";
import { assignBest, inboxBuckets, recordReply, replyTemplates, whatsappHref, type InboxEntry } from "../../../../../shared/pro/housing-ops";
import { usePro } from "../../store";
import { Empty, PAvatar, PButton, PText, Pill } from "../../kit";
import { openExternal } from "./drawer-common";
import { ErasmusBadge, RoomieBadge, UniBadge } from "./shared";

/**
 * Bandeja de interesados en el móvil: arriba los que encajan con algún piso,
 * con el porqué y la visita en un toque; abajo, plegados, los que están fuera
 * de presupuesto o de fechas.
 */
export function LeadInbox({ visible, onOpen }: { visible: Set<string>; onOpen: (id: string) => void }) {
  const { data } = usePro();
  const [showOut, setShowOut] = React.useState(false);
  const buckets = inboxBuckets(data);
  const fit = buckets.fit.filter((e) => visible.has(e.lead.id));
  const out = buckets.out.filter((e) => visible.has(e.lead.id));

  if (!fit.length && !out.length)
    return (
      <Empty
        icon={Inbox}
        title="Bandeja al día"
        body="Aquí llegan los estudiantes que escriben por Franky, ya separados entre los que encajan con tus pisos y los que no."
      />
    );

  return (
    <View style={{ gap: S.md, marginBottom: S.lg }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <PText v="h2">Encajan con algún piso</PText>
        <PText v="small">{String(fit.length)}</PText>
      </View>
      {fit.length ? (
        fit.map((e) => <InboxCard key={e.lead.id} entry={e} onOpen={() => onOpen(e.lead.id)} />)
      ) : (
        <View style={{ borderRadius: R.md, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, padding: S.lg }}>
          <PText v="small" style={{ textAlign: "center" }}>Ninguno encaja ahora mismo con lo que tienes libre. Revisa los de abajo: quizá con otra fecha sí.</PText>
        </View>
      )}

      {out.length ? (
        <>
          <Tap
            onPress={() => setShowOut((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showOut }}
            accessibilityLabel={`Fuera de presupuesto o de fechas, ${out.length}`}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}
          >
            <PText v="h2" style={{ flex: 1 }}>Fuera de presupuesto o de fechas</PText>
            <PText v="small">{String(out.length)}</PText>
            {showOut ? <ChevronUp size={17} color={C.muted} /> : <ChevronDown size={17} color={C.muted} />}
          </Tap>
          {showOut ? (
            <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, overflow: "hidden" }}>
              {out.map((e, i) => (
                <OutRow key={e.lead.id} entry={e} last={i === out.length - 1} onOpen={() => onOpen(e.lead.id)} />
              ))}
            </View>
          ) : (
            <PText v="small">Contéstales con un toque que ahora no hay hueco y quedan apuntados para cuando se libere algo.</PText>
          )}
        </>
      ) : null}
    </View>
  );
}

function WaitTag({ lead }: { lead: ProLead }) {
  const { now } = usePro();
  if (lead.stage !== "new") return <Pill label="Contactado" />;
  const wait = waitingMinutes(lead, now);
  const t = waitingTone(wait);
  const color = t === "danger" ? C.errorText : t === "warning" ? C.warning : C.muted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Clock3 size={13} color={color} strokeWidth={1.9} />
      <PText v="tiny" color={color}>{waitingLabel(wait)}</PText>
    </View>
  );
}

function InboxCard({ entry, onOpen }: { entry: InboxEntry; onOpen: () => void }) {
  const { data, now, update, vertical, pending } = usePro();
  const { lead, fit } = entry;
  const visit = replyTemplates(data, lead, now, vertical.id === "landlord").find((t) => t.id === "visit")!;
  const target = fit.best ? `${fit.best.room.name.replace("Habitación ", "H")} de ${fit.best.property.title}` : fit.wholeFlat ? `${fit.wholeFlat.property.title} entero` : "";
  const assigned = fit.best
    ? lead.roomId === fit.best.room.id && lead.propertyId === fit.best.property.id
    : Boolean(fit.wholeFlat && lead.propertyId === fit.wholeFlat.property.id);

  const assign = async () => {
    if (!(await update("lead.assign.best", (d) => assignBest(d, lead.id)))) return;
    toast("Habitación asignada", { kind: "success", body: `${target} para ${lead.name.split(" ")[0]}.` });
  };
  const proposeVisit = async () => {
    openExternal(whatsappHref(visit.text));
    const ok = await update("lead.reply.visit", (d) => recordReply(assigned ? d : assignBest(d, lead.id), lead.id, visit, new Date().toISOString()));
    if (ok) toast("Mensaje listo en WhatsApp", { kind: "success", body: "Con el piso, el precio y tus franjas libres." });
  };

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, ...SHADOW.card }}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Abrir ${lead.name}`} style={{ padding: S.md, gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
          <PAvatar name={lead.name} size={34} toneKey={lead.roomieGroup ? "violet" : lead.erasmus ? "sky" : "slate"} />
          <View style={{ flex: 1, gap: 2 }}>
            <PText v="h3" numberOfLines={1}>{lead.name}</PText>
            <UniBadge university={lead.university} verified={lead.verified} />
            <PText v="tiny" numberOfLines={1}>{`Entrada ${shortDate(lead.moveIn)} · ${lead.months} meses · hasta ${money(lead.budgetCents)}`}</PText>
          </View>
          <WaitTag lead={lead} />
        </View>
        {lead.roomieGroup || lead.erasmus ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {lead.roomieGroup ? <RoomieBadge group={lead.roomieGroup} /> : null}
            {lead.erasmus ? <ErasmusBadge /> : null}
          </View>
        ) : null}
        {fit.reasons.slice(lead.verified ? 1 : 0, lead.verified ? 3 : 2).map((r) => (
          <View key={r} style={{ flexDirection: "row", gap: 6 }}>
            <Check size={14} color={C.success} strokeWidth={2} style={{ marginTop: 2 }} />
            <PText v="small" color={C.text} style={{ flex: 1 }}>{r}</PText>
          </View>
        ))}
      </Tap>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm, borderTopWidth: 1, borderTopColor: C.borderLight, paddingHorizontal: S.md, paddingVertical: S.sm }}>
        {assigned ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
            <Sparkles size={13} color={C.success} strokeWidth={1.9} />
            <PText v="tiny" color={C.success} numberOfLines={1} style={{ flex: 1 }}>{target}</PText>
          </View>
        ) : (
          <PButton small variant="ghost" label={`Asignar ${target}`} onPress={() => void assign()} disabled={pending} style={{ flexShrink: 1 }} />
        )}
        <PButton small variant="secondary" icon={CalendarPlus} label="Proponer visita" onPress={() => void proposeVisit()} disabled={pending} style={{ marginLeft: "auto" }} />
      </View>
    </View>
  );
}

function OutRow({ entry, onOpen, last }: { entry: InboxEntry; onOpen: () => void; last: boolean }) {
  const { data, now, update, vertical, pending } = usePro();
  const { lead, fit } = entry;
  const full = replyTemplates(data, lead, now, vertical.id === "landlord").find((t) => t.id === "full")!;
  const answered = lead.replies?.some((r) => r.id === "full");

  const reply = async () => {
    openExternal(whatsappHref(full.text));
    const ok = await update("lead.reply.full", (d) => recordReply(d, lead.id, { ...full, nextStage: "contacted" }, new Date().toISOString()));
    if (ok) toast("Mensaje listo en WhatsApp", { kind: "success", body: `${lead.name.split(" ")[0]} queda apuntado por si se libera algo.` });
  };

  return (
    <View style={{ paddingHorizontal: S.md, paddingVertical: S.md, gap: S.sm, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.borderLight }}>
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Abrir ${lead.name}`} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
        <PAvatar name={lead.name} size={32} />
        <View style={{ flex: 1, gap: 2 }}>
          <PText v="h3" numberOfLines={1}>{lead.name}</PText>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <CircleSlash size={12} color={C.warning} strokeWidth={1.9} style={{ marginTop: 2 }} />
            <PText v="tiny" color={C.text} style={{ flex: 1 }}>{fit.issues[0] ?? ""}</PText>
          </View>
        </View>
      </Tap>
      {answered ? <Pill label="Contestado" /> : <PButton small variant="ghost" label={full.label} onPress={() => void reply()} disabled={pending} />}
    </View>
  );
}
