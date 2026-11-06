import React from "react";
import { View } from "react-native";
import { Camera, Check, FileText, KeyRound, MessageCircle, Minus, Plus, Printer, TriangleAlert } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProRoom, ProTenant } from "../../../../../shared/pro/types";
import type { ProInventory, ProInventoryState, ProMoveOut } from "../../../../../shared/pro/housing-types";
import { capitalize, localDate, money, relative } from "../../../../../shared/pro/format";
import { findRoom, shortDate } from "../../../../../shared/pro/housing";
import {
  INVENTORY_STATE,
  MOVE_OUT_CHECKS,
  RENEWAL_LABEL,
  inventoryChanges,
  inventoryOf,
  keysHeldBy,
  ledgerTotals,
  markMonthPaid,
  monthLabel,
  patchTenant,
  proposedRent,
  receiptFor,
  renewalState,
  renewalText,
  rentLedger,
  rentReminderText,
  settlement,
  whatsappHref,
  type LedgerStatus,
} from "../../../../../shared/pro/housing-ops";
import { moveOutHtml, receiptHtml } from "../../../../../shared/pro/housing-docs";
import { answerRenewal } from "../../../../../shared/pro/housing-plan";
import { localId, usePro } from "../../store";
import { ChoiceGrid, Detail, Field, Input, PButton, PText, Pill, Stepper } from "../../kit";
import { openExternal } from "./drawer-common";
import { euros } from "./shared";
import { Box, DateField, SoftBox, WarnNote } from "./ui";
import { shareDocument, slugFile } from "./output";

/**
 * Herramientas del inquilino en el móvil, las mismas que la web: cobros mes
 * a mes con recibo, renovación del curso siguiente, llaves y la salida con
 * la liquidación de la fianza.
 */

export const LEDGER_PILL: Record<LedgerStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  paid: { label: "Cobrada", tone: "success" },
  pending: { label: "Pendiente", tone: "warning" },
  late: { label: "Con retraso", tone: "danger" },
  unrecorded: { label: "Sin apuntar", tone: "neutral" },
  upcoming: { label: "Por venir", tone: "info" },
};

/** Comparte el recibo de un mes para guardarlo en PDF o mandarlo. */
export function useShareReceipt() {
  const { data, now } = usePro();
  return (tenant: ProTenant, month: string) => {
    const { property, room } = findRoom(data, tenant.propertyId, tenant.roomId);
    const receipt = receiptFor(data, tenant, month, now);
    void shareDocument(receiptHtml(data, tenant, receipt, property, room), slugFile("recibo", tenant.name, month), "html", `Recibo de ${monthLabel(month, "long")}`);
  };
}

/* ------------------------------------------------------------------ */
/* Cobros mes a mes                                                    */
/* ------------------------------------------------------------------ */

export function RentLedgerBox({ tenant }: { tenant: ProTenant }) {
  const { data, now, update, pending } = usePro();
  const shareReceipt = useShareReceipt();
  const [showAll, setShowAll] = React.useState(false);
  const ledger = rentLedger(tenant, now);
  const totals = ledgerTotals(ledger);
  const done = ledger.filter((m) => m.status !== "upcoming");
  const upcoming = ledger.filter((m) => m.status === "upcoming");
  const visible = showAll ? done : done.slice(-4);
  const firstName = tenant.name.split(" ")[0];

  const pay = async (month: string) => {
    if (!(await update("tenant.month.paid", (d) => patchTenant(d, tenant.id, (t) => markMonthPaid(t, month, new Date()))))) return;
    toast("Mensualidad cobrada", { kind: "success", body: `${capitalize(monthLabel(month, "long"))} de ${firstName}, ${money(tenant.rentCents)}.` });
  };
  const remind = () => {
    openExternal(whatsappHref(rentReminderText(data, tenant, now)));
    void update("tenant.remind", (d) => patchTenant(d, tenant.id, (t) => ({ ...t, remindedAt: new Date().toISOString() })));
  };

  return (
    <Box>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: S.sm }}>
        <PText v="h3">Cobros</PText>
        <PText v="tiny" color={totals.owedCents ? C.errorText : C.muted}>
          {`${money(totals.paidCents, { round: true })} cobrados${totals.owedCents ? `, debe ${money(totals.owedCents)}` : ""}`}
        </PText>
      </View>
      {visible.map((m, i) => (
        <View key={m.month} style={{ flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.borderLight }}>
          <View style={{ flex: 1, gap: 2 }}>
            <PText v="small" color={C.text}>{`${capitalize(monthLabel(m.month, "long"))} ${m.month.slice(0, 4)}`}</PText>
            <PText v="tiny">{m.paidAt ? `${money(m.amountCents)}, cobrada el ${shortDate(localDate(m.paidAt))}` : money(m.amountCents)}</PText>
          </View>
          <Pill tone={LEDGER_PILL[m.status].tone} label={LEDGER_PILL[m.status].label} />
          {m.status === "paid" ? (
            <Tap
              onPress={() => shareReceipt(tenant, m.month)}
              accessibilityRole="button"
              accessibilityLabel={`Recibo de ${monthLabel(m.month, "long")}`}
              hitSlop={4}
              style={{ width: 40, height: 40, borderRadius: R.md, alignItems: "center", justifyContent: "center" }}
            >
              <Printer size={17} color={C.muted} strokeWidth={1.9} />
            </Tap>
          ) : (
            <PButton small variant="secondary" icon={Check} label="Cobrada" onPress={() => void pay(m.month)} disabled={pending} accessibilityLabel={`Marcar ${monthLabel(m.month, "long")} como cobrada`} />
          )}
        </View>
      ))}
      {!visible.length ? <PText v="small">Aún no ha empezado su contrato.</PText> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
        {done.length > 4 ? <PButton small variant="ghost" label={showAll ? "Ver menos" : `Ver los ${done.length} meses`} onPress={() => setShowAll((v) => !v)} /> : null}
        {totals.owedCents ? <PButton small variant="outline" icon={MessageCircle} label="Recordar por WhatsApp" onPress={remind} /> : null}
        {tenant.remindedAt && totals.owedCents ? <PText v="tiny">{`Recordado ${relative(tenant.remindedAt, now.getTime())}`}</PText> : null}
      </View>
      {upcoming.length ? (
        <PText v="tiny">{`Quedan ${upcoming.length} ${upcoming.length === 1 ? "mensualidad" : "mensualidades"} hasta el ${shortDate(tenant.contractEnd)}.`}</PText>
      ) : null}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Renovación                                                          */
/* ------------------------------------------------------------------ */

export function RenewalBox({ tenant }: { tenant: ProTenant }) {
  const { data, now, update, pending } = usePro();
  const state = renewalState(tenant);
  const [pctUp, setPctUp] = React.useState("0");
  const newRent = tenant.renewal?.newRentCents ?? proposedRent(tenant.rentCents, Number(pctUp));
  const firstName = tenant.name.split(" ")[0];

  const send = async () => {
    const at = new Date().toISOString();
    openExternal(whatsappHref(renewalText(data, tenant, newRent)));
    await update("tenant.renewal", (d) => patchTenant(d, tenant.id, (t) => ({ ...t, renewalSentAt: at, renewal: { sentAt: at, newRentCents: newRent } })));
  };
  const answer = async (value: "yes" | "no") => {
    if (!(await update(`tenant.renewal.${value}`, (d) => answerRenewal(d, tenant.id, value, now)))) return;
    toast(value === "yes" ? `${firstName} sigue el curso que viene` : `${firstName} no renueva`, {
      kind: "success",
      body: value === "yes" ? "Su habitación ya no sale como libre." : "Su habitación sale como libre al acabar el contrato.",
    });
  };

  return (
    <Box>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
        <PText v="h3">Curso que viene</PText>
        <Pill tone={state === "staying" ? "success" : state === "leaving" ? "warning" : state === "waiting" ? "info" : "neutral"} label={RENEWAL_LABEL[state]} />
      </View>
      {state === "staying" && tenant.renewal ? (
        <PText v="small" color={C.text}>
          {`Renueva por ${money(tenant.renewal.newRentCents)} al mes${tenant.renewal.newRentCents !== tenant.rentCents ? ` (ahora ${money(tenant.rentCents)})` : ""}.`}
        </PText>
      ) : state === "leaving" ? (
        <PText v="small" color={C.text}>{`No sigue. Su habitación sale como libre desde el ${shortDate(tenant.leavingAt ?? tenant.contractEnd)}.`}</PText>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: S.sm }}>
            <SoftBox style={{ flex: 1 }}>
              <PText v="tiny">Ahora paga</PText>
              <PText v="h3">{money(tenant.rentCents)}</PText>
            </SoftBox>
            <SoftBox style={{ flex: 1, backgroundColor: C.accentSoft }}>
              <PText v="tiny" color={C.blueDeep}>Propuesta</PText>
              <PText v="h3" color={C.blueDeep}>{money(newRent)}</PText>
            </SoftBox>
          </View>
          {state === "not_asked" ? (
            <>
              <ChoiceGrid
                value={pctUp}
                onChange={setPctUp}
                options={[
                  { value: "0", label: "Igual" },
                  { value: "2", label: "+2 %" },
                  { value: "3", label: "+3 %" },
                  { value: "5", label: "+5 %" },
                ]}
              />
              <PButton small icon={MessageCircle} label="Ofrecer por WhatsApp" onPress={() => void send()} disabled={pending} />
            </>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              <PButton small variant="ghost" icon={MessageCircle} label="Recordar" onPress={() => openExternal(whatsappHref(renewalText(data, tenant, newRent)))} />
              <PButton small variant="outline" label="Sigue" onPress={() => void answer("yes")} disabled={pending} />
              <PButton small variant="outline" label="Se va" onPress={() => void answer("no")} disabled={pending} />
            </View>
          )}
        </>
      )}
    </Box>
  );
}

/** Juegos de llaves que tiene el inquilino. */
export function KeysLine({ tenant }: { tenant: ProTenant }) {
  const { data } = usePro();
  const keys = keysHeldBy(data, tenant.id);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}>
      <KeyRound size={13} color={C.muted} strokeWidth={1.9} />
      <PText v="small" color={C.text} numberOfLines={1}>{keys.length ? keys.map((k) => k.label).join(", ") : "Sin llaves"}</PText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Salida y liquidación de fianza                                      */
/* ------------------------------------------------------------------ */

export type MoveOutDraft = { moveOut: ProMoveOut; inventory: ProInventory };

export function moveOutDraft(tenant: ProTenant, room?: ProRoom): MoveOutDraft {
  return {
    moveOut: tenant.moveOut ?? {
      date: (tenant.leavingAt ?? tenant.contractEnd).slice(0, 10),
      checks: { keys: false, photos: false, meters: false, room: false },
      deductions: [],
    },
    inventory: inventoryOf(tenant, room),
  };
}

const OUT_OPTIONS: { value: ProInventoryState; label: string }[] = (["good", "worn", "damaged", "missing"] as ProInventoryState[]).map((v) => ({
  value: v,
  label: INVENTORY_STATE[v].label,
}));

/**
 * Salida sin discusiones: llaves, fotos, contadores, inventario comparado con
 * la entrada, descuentos y lo que se devuelve. La hoja guarda el borrador y
 * cierra la salida desde su pie.
 */
export function MoveOutFlow({ tenant, draft, onChange }: { tenant: ProTenant; draft: MoveOutDraft; onChange: (d: MoveOutDraft) => void }) {
  const { data, now } = usePro();
  const { property, room } = findRoom(data, tenant.propertyId, tenant.roomId);
  const [concept, setConcept] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const keys = keysHeldBy(data, tenant.id);
  const changes = inventoryChanges(draft.inventory);
  const owed = ledgerTotals(rentLedger(tenant, now)).owedCents;
  const s = settlement(tenant, draft.moveOut);
  const { moveOut, inventory } = draft;
  const setMoveOut = (fields: Partial<ProMoveOut>) => onChange({ ...draft, moveOut: { ...moveOut, ...fields } });
  const addDeduction = (label: string, cents: number) => {
    if (!label.trim() || cents <= 0) return;
    setMoveOut({ deductions: [...moveOut.deductions, { id: localId("dd"), label: label.trim(), amountCents: cents }] });
  };
  const has = (label: string) => moveOut.deductions.some((d) => d.label === label);

  return (
    <>
      <DateField label="Último día en el piso" value={moveOut.date} onChange={(date) => setMoveOut({ date })} />

      {keys.length ? (
        <View style={{ flexDirection: "row", gap: S.sm, borderRadius: R.md, backgroundColor: `${C.warning}1F`, padding: S.md }}>
          <TriangleAlert size={16} color={C.warning} strokeWidth={1.9} />
          <PText v="small" color={C.text} style={{ flex: 1 }}>
            {`Tiene ${keys.length === 1 ? "1 juego de llaves" : `${keys.length} juegos de llaves`} (${keys.map((k) => k.label).join(", ")}). Al cerrar la salida pasan a ${data.staff.length > 1 ? "la oficina" : "ti"}.`}
          </PText>
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <PText v="label">Antes de devolver la fianza</PText>
        {MOVE_OUT_CHECKS.map((c) => {
          const on = moveOut.checks[c.id];
          return (
            <Tap
              key={c.id}
              onPress={() => setMoveOut({ checks: { ...moveOut.checks, [c.id]: !on } })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={c.label}
              style={{
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: S.sm,
                borderWidth: 1,
                borderColor: on ? `${C.success}66` : C.border, backgroundColor: on ? `${C.success}12` : C.surface, borderRadius: R.md, paddingHorizontal: S.md,
              }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: on ? C.success : C.border, backgroundColor: on ? C.success : "transparent", alignItems: "center", justifyContent: "center" }}>
                {on ? <Check size={13} color="#FFFFFF" strokeWidth={2.6} /> : null}
              </View>
              <PText v="small" color={C.text}>{c.label}</PText>
            </Tap>
          );
        })}
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
          <PText v="label">Inventario: entrada y salida</PText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Camera size={13} color={C.muted} strokeWidth={1.9} />
            <PText v="tiny">{`${inventory.inPhotos} fotos al entrar`}</PText>
          </View>
        </View>
        {inventory.items.map((item) => (
          <Box key={item.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
              <PText v="h3" style={{ flex: 1 }}>{item.label}</PText>
              <PText v="tiny">{`Al entrar: ${INVENTORY_STATE[item.in].label.toLowerCase()}`}</PText>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {OUT_OPTIONS.map((o) => {
                const on = item.out === o.value;
                const bad = o.value === "damaged" || o.value === "missing";
                return (
                  <Tap
                    key={o.value}
                    onPress={() => onChange({ ...draft, inventory: { ...inventory, items: inventory.items.map((x) => (x.id === item.id ? { ...x, out: o.value } : x)) } })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${item.label} al salir: ${o.label}`}
                    style={{
                      minHeight: 36,
                      paddingHorizontal: S.md,
                      borderRadius: R.sm,
                      borderWidth: 1,
                      justifyContent: "center",
                      borderColor: on ? (bad ? C.error : C.text) : C.border,
                      backgroundColor: on ? (bad ? `${C.error}1F` : C.text) : C.surface,
                    }}
                  >
                    <PText v="tiny" color={on ? (bad ? C.errorText : C.bg) : C.text} style={{ fontFamily: FONT.semibold }}>{o.label}</PText>
                  </Tap>
                );
              })}
            </View>
          </Box>
        ))}
        <Field label="Fotos de salida">
          <Stepper label="fotos de salida" value={inventory.outPhotos ?? 0} min={0} max={60} onChange={(v) => onChange({ ...draft, inventory: { ...inventory, outPhotos: v } })} />
        </Field>
      </View>

      {changes.length || owed ? (
        <Box style={{ borderColor: `${C.warning}55`, backgroundColor: `${C.warning}10` }}>
          <PText v="h3">Qué ha cambiado</PText>
          {changes.map(({ item, from, to }) => (
            <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <PText v="small" color={C.text} style={{ flex: 1 }}>{`${item.label}: ${from.toLowerCase()} al entrar, ${to.toLowerCase()} al salir`}</PText>
              {!has(item.label) ? (
                <PButton
                  small
                  variant="ghost"
                  label="Descontar"
                  onPress={() => {
                    setConcept(item.label);
                    setAmount("");
                  }}
                />
              ) : null}
            </View>
          ))}
          {owed ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <PText v="small" color={C.text} style={{ flex: 1 }}>{`Mensualidades sin pagar: ${money(owed)}`}</PText>
              {!has("Rentas sin pagar") ? <PButton small variant="ghost" label="Descontar" onPress={() => addDeduction("Rentas sin pagar", owed)} /> : null}
            </View>
          ) : null}
        </Box>
      ) : null}

      <View style={{ gap: 6 }}>
        <PText v="label">Descuentos de la fianza</PText>
        {moveOut.deductions.length ? (
          moveOut.deductions.map((d) => (
            <View key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{d.label}</PText>
              <PText v="small" color={C.text}>{`-${money(d.amountCents)}`}</PText>
              <Tap
                onPress={() => setMoveOut({ deductions: moveOut.deductions.filter((x) => x.id !== d.id) })}
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${d.label}`}
                style={{ width: 40, height: 40, borderRadius: R.md, alignItems: "center", justifyContent: "center" }}
              >
                <Minus size={16} color={C.muted} />
              </Tap>
            </View>
          ))
        ) : (
          <PText v="small">Sin descuentos: se devuelve entera.</PText>
        )}
        <Input value={concept} onChangeText={setConcept} placeholder="Concepto, por ejemplo silla rota" />
        <View style={{ flexDirection: "row", gap: S.sm, alignItems: "center" }}>
          <Input value={amount} onChangeText={setAmount} placeholder="Importe en €" keyboardType="decimal-pad" style={{ flex: 1 }} />
          <PButton
            variant="outline"
            icon={Plus}
            label="Añadir"
            onPress={() => {
              addDeduction(concept, euros(amount));
              setConcept("");
              setAmount("");
            }}
            disabled={!concept.trim() || euros(amount) <= 0}
          />
        </View>
      </View>

      <SoftBox>
        <Detail label="Fianza" value={money(s.depositCents)} />
        <Detail label="Descuentos" value={`-${money(s.deductionsCents)}`} />
        <Detail label="A devolver" value={money(s.returnCents)} last />
      </SoftBox>
      {!moveOut.checks.keys && keys.length ? <WarnNote text="Recoge las llaves antes de cerrar la salida." /> : null}
      <PButton
        small
        variant="outline"
        icon={FileText}
        label={`Resumen para ${tenant.name.split(" ")[0]}`}
        onPress={() => void shareDocument(moveOutHtml(data, { ...tenant, inventory }, moveOut, property, room), slugFile("liquidacion-fianza", tenant.name), "html", "Liquidación de la fianza")}
      />
    </>
  );
}
