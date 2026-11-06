import React from "react";
import { Alert, View } from "react-native";
import { Download, GlassWater, Plus, Trash2 } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, S } from "@/theme";
import type { ProInvite, ProInviteReason } from "../../../../../shared/pro/night-types";
import { addDays, money, time } from "../../../../../shared/pro/format";
import { focusEvent, nightOf } from "../../../../../shared/pro/night";
import { eventOfNight, nightTitle } from "../../../../../shared/pro/night-ops";
import {
  DEFAULT_DRINK_CENTS,
  INVITE_CAP_CHOICES,
  INVITE_REASONS,
  INVITE_REASON_ORDER,
  addInvite,
  inviteCapLeft,
  inviteRows,
  invitesBetween,
  invitesByPerson,
  invitesByReason,
  invitesOfNight,
  inviteTotals,
  invitableItems,
  removeInvite,
} from "../../../../../shared/pro/night-invites";
import { localId, usePro } from "../../store";
import { ChoiceGrid, Empty, Field, Input, ListRow, Meter, PButton, PText, Panel, Pill, Sheet, Stepper, Tip } from "../../kit";
import { Note, SignerChips, defaultSigner, shareCsv, useNightOps } from "./ops-ui";

/**
 * Invitaciones con nombre: versión nativa de web/.../night/invites.tsx.
 * Quién invita, a quién y por qué, con el cupo por persona y noche.
 */
export function InvitesView({ onAdd }: { onAdd: () => void }) {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
  const night = nightOf(now);
  const latest = [...new Set((ops.invites ?? []).map((i) => i.night))].sort((a, b) => b.localeCompare(a))[0];
  const shown = invitesOfNight(ops, night).length || !latest ? night : latest;
  const list = invitesOfNight(ops, shown);
  const totals = inviteTotals(list);
  const cap = ops.settings.invitesPerPerson ?? null;
  const byPerson = invitesByPerson(list, cap);
  const month = invitesBetween(ops, addDays(night, -30), night);
  const monthTotals = inviteTotals(month);
  const monthPeople = invitesByPerson(month);
  const reasons = invitesByReason(month);
  const maxDrinks = Math.max(1, ...monthPeople.map((r) => r.drinks));

  const setCap = async (value: number | null) => {
    if (!(await setOps("invites.cap", (o) => ({ ...o, settings: { ...o.settings, invitesPerPerson: value } })))) return;
    toast(value === null ? "Sin cupo de invitaciones" : `Cupo de ${value} copas por persona y noche`, { kind: "success" });
  };

  const remove = (i: ProInvite) =>
    Alert.alert("Borrar invitación", `${i.drinks} ${i.drinks === 1 ? "copa" : "copas"} a ${i.to}.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: () => void setOps("invites.delete", (o) => removeInvite(o, i.id)),
      },
    ]);

  const exportMonth = () => {
    const rows = inviteRows(ops, night.slice(0, 7));
    if (rows.length <= 1) {
      toast("Este mes aún no hay invitaciones", { kind: "info", body: "Cuando apuntes la primera saldrá en el CSV." });
      return;
    }
    shareCsv(`Invitaciones de ${data.space.name}`, rows);
  };

  return (
    <View>
      <Panel
        title={shown === night ? "Esta noche" : `Noche del ${nightTitle(shown).toLowerCase()}`}
        description={
          totals.count
            ? `${totals.drinks} ${totals.drinks === 1 ? "copa invitada" : "copas invitadas"}, ${money(totals.cents)} de carta.`
            : "Nadie ha invitado todavía."
        }
        action={<PButton label="Apuntar" icon={Plus} variant="outline" small onPress={onAdd} />}
        flush
      >
        {list.length ? (
          list.map((i, idx) => (
            <ListRow key={i.id} last={idx === list.length - 1 && !byPerson.length}>
              <PText v="tiny" style={{ width: 40 }}>{time(i.at)}</PText>
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{i.to}</PText>
                <PText v="tiny" numberOfLines={1}>
                  {`${i.by.split(" ")[0]} invita · ${INVITE_REASONS[i.reason].label}${i.itemName ? ` · ${i.drinks} x ${i.itemName}` : ` · ${i.drinks} copas`}`}
                </PText>
              </View>
              <PText v="h3">{money(i.cents)}</PText>
              <Tap
                onPress={() => remove(i)}
                accessibilityRole="button"
                accessibilityLabel={`Borrar la invitación a ${i.to}`}
                style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Trash2 size={16} color={C.muted} strokeWidth={1.9} />
              </Tap>
            </ListRow>
          ))
        ) : (
          <Empty
            icon={GlassWater}
            title="Sin invitaciones apuntadas"
            body="Cuando alguien del equipo invite a una copa, apúntalo con a quién y por qué. Al cerrar la caja ya estará sumado."
            action={<PButton label="Apuntar invitación" icon={Plus} onPress={onAdd} />}
          />
        )}
        {byPerson.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.md, borderTopWidth: 1, borderTopColor: C.borderLight }}>
            {byPerson.map((r) => (
              <Pill key={r.by} label={`${r.by.split(" ")[0]}: ${r.drinks}${cap !== null ? ` de ${cap}` : ""}`} tone={r.over ? "warning" : "neutral"} />
            ))}
          </View>
        ) : null}
      </Panel>

      <Panel
        title="Quién invita más"
        description={
          monthTotals.count
            ? `En 30 días, ${monthTotals.drinks} copas regaladas: ${money(monthTotals.cents, { round: true })} de carta.`
            : "En cuanto haya invitaciones verás aquí a cada persona del equipo."
        }
      >
        {monthPeople.length ? (
          <View style={{ gap: S.md }}>
            {monthPeople.map((r) => (
              <View key={r.by} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
                  <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{r.by}</PText>
                  <PText v="small">{`${r.drinks} copas · ${money(r.cents, { round: true })}`}</PText>
                </View>
                <Meter value={r.drinks} max={maxDrinks} />
              </View>
            ))}
          </View>
        ) : (
          <PText v="small">Sin invitaciones en los últimos 30 días.</PText>
        )}
        {reasons.length ? (
          <PText v="tiny" style={{ marginTop: S.md }}>
            {`Por motivo: ${reasons.map((r) => `${r.label.toLowerCase()} ${r.drinks}`).join(", ")}.`}
          </PText>
        ) : null}
        <PButton label="CSV del mes" icon={Download} variant="outline" small onPress={exportMonth} style={{ marginTop: S.md, alignSelf: "flex-start" }} />
      </Panel>

      <Panel title="Cupo por persona" description="Copas que puede invitar cada persona del equipo en una noche.">
        <ChoiceGrid
          value={cap === null ? "none" : String(cap)}
          onChange={(v) => void setCap(v === "none" ? null : Number(v))}
          options={INVITE_CAP_CHOICES.map((c) => ({ value: c === null ? "none" : String(c), label: c === null ? "Sin cupo" : String(c) }))}
        />
        <PText v="tiny" style={{ marginTop: S.md }}>
          Quien pase su cupo sale en ámbar aquí y en el cierre. No bloquea: a veces invitar es lo correcto.
        </PText>
      </Panel>

      <Tip title="Por qué con nombre">
        Una copa regalada sin apuntar es la fuga de barra más difícil de ver. Con quién, a quién y por qué, el cierre cuadra y sabes qué invitaciones traen gente de vuelta.
      </Tip>
    </View>
  );
}

const QUICK_TO = ["Equipo al cerrar", "DJ", "Cumpleaños", "Cliente habitual"];

export function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
  const items = invitableItems(data.menu);
  const [by, setBy] = React.useState("");
  const [to, setTo] = React.useState("");
  const [reason, setReason] = React.useState<ProInviteReason>("habitual");
  const [itemId, setItemId] = React.useState("other");
  const [drinks, setDrinks] = React.useState(1);

  React.useEffect(() => {
    if (!open) return;
    setBy(defaultSigner(data));
    setTo("");
    setReason("habitual");
    setItemId(items[0]?.id ?? "other");
    setDrinks(1);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const night = nightOf(now);
  const item = items.find((m) => m.id === itemId);
  const cents = (item?.priceCents ?? DEFAULT_DRINK_CENTS) * drinks;
  const left = by ? inviteCapLeft(ops, night, by) : null;
  const over = left !== null && drinks > left;
  const valid = Boolean(by.trim()) && to.trim().length > 1 && drinks > 0;

  const save = async () => {
    const ev = eventOfNight(data, night) ?? focusEvent(data, now);
    const invite: ProInvite = {
      id: localId("inv"),
      night,
      eventId: ev?.date === night ? ev.id : undefined,
      at: new Date().toISOString(),
      by: by.trim(),
      to: to.trim(),
      reason,
      drinks,
      cents,
      itemName: item?.name,
    };
    if (!(await setOps("invites.create", (o) => addInvite(o, invite)))) return;
    toast(`${drinks} ${drinks === 1 ? "copa" : "copas"} a ${invite.to}`, {
      kind: "success",
      body: over ? `${by.split(" ")[0]} ha pasado su cupo de esta noche.` : `Apuntado a nombre de ${by.split(" ")[0]}.`,
    });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Apuntar invitación"
      description={`Noche del ${nightTitle(night).toLowerCase()}. Quién invita, a quién y por qué.`}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={`Apuntar · ${money(cents)}`} onPress={() => void save()} disabled={!valid} />
        </>
      }
    >
      <Field label="Quién invita">
        <SignerChips value={by} onChange={setBy} />
      </Field>
      <Field label="A quién">
        <Input value={to} onChangeText={setTo} placeholder="Nombre, mesa o grupo" label="A quién" autoCapitalize="sentences" />
        <ChoiceGrid value={QUICK_TO.includes(to) ? to : ""} onChange={setTo} options={QUICK_TO.map((q) => ({ value: q, label: q }))} />
      </Field>
      <Field label="Motivo">
        <ChoiceGrid value={reason} onChange={setReason} options={INVITE_REASON_ORDER.map((r) => ({ value: r, label: INVITE_REASONS[r].label }))} />
      </Field>
      <Field label="Qué">
        <ChoiceGrid
          value={itemId}
          onChange={setItemId}
          options={[
            ...items.map((m) => ({ value: m.id, label: m.name, hint: money(m.priceCents) })),
            { value: "other", label: "Otra copa", hint: money(DEFAULT_DRINK_CENTS) },
          ]}
        />
      </Field>
      <Field label="Cuántas" hint={`${money(cents)} de carta`}>
        <Stepper value={drinks} onChange={setDrinks} min={1} max={20} label="copas" />
      </Field>
      {left !== null ? (
        <Note tone={over ? "warning" : "neutral"}>
          {over
            ? `${by.split(" ")[0]} solo tiene ${left} ${left === 1 ? "copa" : "copas"} de cupo esta noche. Se apunta igual y lo verás en el cierre.`
            : `A ${by.split(" ")[0]} le quedan ${left} ${left === 1 ? "copa" : "copas"} de cupo esta noche.`}
        </Note>
      ) : null}
    </Sheet>
  );
}

/** Tarjeta de Esta noche: invitaciones de la noche en curso y un toque para apuntar otra. */
export function InvitesTonightCard() {
  const { now } = usePro();
  const { ops } = useNightOps();
  const [adding, setAdding] = React.useState(false);
  const list = invitesOfNight(ops, nightOf(now));
  const t = inviteTotals(list);
  const top = invitesByPerson(list, ops.settings.invitesPerPerson ?? null);
  const over = top.filter((r) => r.over);
  return (
    <Panel
      title="Invitaciones de la noche"
      description={t.count ? `${t.drinks} copas, ${money(t.cents)} de carta.` : "Apunta cada copa regalada con su nombre."}
      action={<PButton label="Apuntar" icon={Plus} variant="outline" small onPress={() => setAdding(true)} />}
    >
      <PText v="small" color={top.length ? C.text : C.muted}>
        {top.length
          ? `${top
              .slice(0, 3)
              .map((r) => `${r.by.split(" ")[0]} ${r.drinks}`)
              .join(", ")}${over.length ? `. ${over.map((r) => r.by.split(" ")[0]).join(" y ")} ${over.length === 1 ? "ha pasado" : "han pasado"} el cupo.` : ""}`
          : "Aún no se ha invitado a nada esta noche."}
      </PText>
      <InviteSheet open={adding} onClose={() => setAdding(false)} />
    </Panel>
  );
}
