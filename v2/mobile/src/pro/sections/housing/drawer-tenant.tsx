import React from "react";
import { View } from "react-native";
import { ArrowUpRight, Check, UserMinus, Users } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, S } from "@/theme";
import type { ProLead, ProTenant } from "../../../../../shared/pro/types";
import { addDays, localDate, money } from "../../../../../shared/pro/format";
import { CONTRACT_LABEL, GVA_URL, findRoom, roomieSuggestions, shortDate, uniShort } from "../../../../../shared/pro/housing";
import { DEPOSIT_FORMS, closeMoveOut, depositCountdown, patchTenant, renewalState, settlement } from "../../../../../shared/pro/housing-ops";
import { usePro } from "../../store";
import { Detail, PAvatar, PButton, PText, Pill, Sheet } from "../../kit";
import { RoomTraits, UniBadge } from "./shared";
import { DepositPill, IncidentPill, PriorityDot, openExternal } from "./drawer-common";
import { DocsChecklist } from "./lead-tools";
import { KeysLine, MoveOutFlow, RenewalBox, RentLedgerBox, moveOutDraft, type MoveOutDraft } from "./tenant-tools";
import { Box, DateField, SoftBox } from "./ui";

/* ------------------------------------------------------------------ */
/* Inquilino                                                           */
/* ------------------------------------------------------------------ */

export function TenantDrawer({ tenantId, onClose, startLeaving }: { tenantId: string | null; onClose: () => void; startLeaving?: boolean }) {
  const { data } = usePro();
  const tenant = data.tenants.find((t) => t.id === tenantId);
  if (!tenant) return null;
  return <TenantDrawerBody key={tenant.id} tenant={tenant} onClose={onClose} startLeaving={startLeaving} />;
}

function TenantDrawerBody({ tenant, onClose, startLeaving }: { tenant: ProTenant; onClose: () => void; startLeaving?: boolean }) {
  const { data, update, now, pending } = usePro();
  const today = localDate(now);
  const { property, room } = findRoom(data, tenant.propertyId, tenant.roomId);
  const ended = tenant.contractEnd < today || Boolean(tenant.moveOut?.closedAt);
  const [mode, setMode] = React.useState<"view" | "leave" | "suggest" | "moveout">(startLeaving ? (tenant.leavingAt ? "suggest" : "leave") : "view");
  const [leaveDate, setLeaveDate] = React.useState((tenant.leavingAt ?? tenant.contractEnd).slice(0, 10));
  const [draft, setDraft] = React.useState<MoveOutDraft>(() => moveOutDraft(tenant, room));
  const firstName = tenant.name.split(" ")[0];
  const incidents = data.incidents.filter((i) => i.propertyId === tenant.propertyId && i.tenantName === tenant.name);
  const suggestions = roomieSuggestions(data, tenant, now, 4);
  const endsSoon = !ended && tenant.contractEnd.slice(0, 10) <= addDays(today, 150);

  const patch = (label: string, fields: Partial<ProTenant>) =>
    update(label, (d) => ({ ...d, tenants: d.tenants.map((t) => (t.id === tenant.id ? { ...t, ...fields } : t)) }));

  const lodge = async () => {
    const ok = await update("tenant.deposit.lodged", (d) => patchTenant(d, tenant.id, (t) => ({ ...t, deposit: { ...t.deposit, status: "lodged" }, lodgedAt: today })));
    if (!ok) return;
    toast("Fianza depositada", { kind: "success", body: "Guarda el justificante de la Generalitat con el contrato." });
  };
  const registerLeave = async () => {
    const ok = await update("tenant.leave", (d) => ({
      ...d,
      tenants: d.tenants.map((t) =>
        t.id === tenant.id
          ? { ...t, leavingAt: leaveDate, renewal: t.renewal ? { ...t.renewal, answer: "no" as const, answeredAt: new Date().toISOString() } : t.renewal }
          : t,
      ),
      properties: d.properties.map((p) =>
        p.id === tenant.propertyId
          ? { ...p, rooms: p.rooms.map((r) => (r.id === tenant.roomId ? { ...r, status: "leaving", availableFrom: addDays(leaveDate, 1) } : r)) }
          : p,
      ),
    }));
    if (!ok) return;
    toast("Salida registrada", { kind: "success", body: `La habitación se libera el ${shortDate(addDays(leaveDate, 1))}. Roomie ya busca sustitutos.` });
    setMode("suggest");
  };
  const propose = async (lead: ProLead) => {
    const ok = await update("tenant.substitute", (d) => ({
      ...d,
      leads: d.leads.map((l) =>
        l.id === lead.id
          ? { ...l, propertyId: tenant.propertyId, roomId: tenant.roomId, stage: l.stage === "new" ? "contacted" : l.stage, lastContactAt: new Date().toISOString() }
          : l,
      ),
    }));
    if (!ok) return;
    toast("Habitación propuesta", { kind: "success", body: `${lead.name.split(" ")[0]} ya la tiene asignada. Escríbele desde su ficha.` });
  };
  const closeOut = async () => {
    const { returnCents } = settlement(tenant, draft.moveOut);
    const ok = await update("tenant.moveout", (d) =>
      closeMoveOut(patchTenant(d, tenant.id, (t) => ({ ...t, inventory: draft.inventory })), tenant.id, draft.moveOut, new Date()),
    );
    if (!ok) return;
    toast("Salida cerrada", { kind: "success", body: `Devuelves ${money(returnCents)} a ${firstName}. La habitación queda libre desde el ${shortDate(addDays(draft.moveOut.date, 1))}.` });
    setMode("view");
  };

  const s = settlement(tenant, draft.moveOut);
  const footer =
    mode === "leave" ? (
      <>
        <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
        <PButton label="Registrar salida" icon={UserMinus} onPress={() => void registerLeave()} disabled={pending || !leaveDate} />
      </>
    ) : mode === "suggest" ? (
      <PButton label="Volver a la ficha" variant="ghost" onPress={() => setMode("view")} />
    ) : mode === "moveout" ? (
      <>
        <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
        <PButton label={`Cerrar y devolver ${money(s.returnCents)}`} icon={Check} onPress={() => void closeOut()} disabled={pending || !draft.moveOut.date} />
      </>
    ) : tenant.moveOut?.closedAt ? undefined : ended || tenant.leavingAt ? (
      <>
        {tenant.leavingAt && !ended ? <PButton label="Sustitutos" variant="outline" icon={Users} onPress={() => setMode("suggest")} /> : null}
        {tenant.deposit.status !== "returned" ? <PButton label="Salida y fianza" onPress={() => setMode("moveout")} /> : null}
      </>
    ) : (
      <PButton label="Registrar salida" icon={UserMinus} onPress={() => setMode("leave")} />
    );

  return (
    <Sheet open onClose={onClose} title={mode === "moveout" ? `Salida de ${firstName}` : tenant.name} description={`${property?.title ?? ""} · ${room?.name ?? ""}`} footer={footer}>
      {mode === "leave" ? (
        <>
          <PText v="small" color={C.text}>
            {`Cuando ${firstName} se vaya, la habitación queda libre y Roomie propone estudiantes compatibles con quienes se quedan en el piso.`}
          </PText>
          <DateField label="Último día en el piso" value={leaveDate} onChange={setLeaveDate} min={today} today={today} />
          {room ? (
            <SoftBox>
              <Detail label="Habitación" value={`${room.name}, ${money(room.priceCents)}`} />
              <Detail label="Fianza a devolver" value={money(tenant.deposit.amountCents)} last />
            </SoftBox>
          ) : null}
        </>
      ) : mode === "suggest" ? (
        <>
          <PText v="small" color={C.text}>
            {`Sustitutos para ${room?.name.toLowerCase() ?? "la habitación"} desde el ${shortDate(addDays(tenant.leavingAt ?? leaveDate, 1))}, ordenados por compatibilidad con quienes se quedan.`}
          </PText>
          {suggestions.length ? (
            suggestions.map(({ lead, score, with: w }) => (
              <Box key={lead.id} style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                <PAvatar name={lead.name} size={34} toneKey="violet" />
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{lead.name}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${uniShort(lead.university)} · entrada ${shortDate(lead.moveIn)} · hasta ${money(lead.budgetCents)}`}</PText>
                  <PText v="tiny" color={C.blueDeep}>
                    {`${score} % compatible${w ? ` con ${w === 1 ? "quien se queda" : `los ${w} que se quedan`}` : ""}`}
                  </PText>
                </View>
                {lead.propertyId === tenant.propertyId && lead.roomId === tenant.roomId ? (
                  <Pill tone="success" label="Propuesta" />
                ) : (
                  <PButton small label="Proponer" variant="secondary" onPress={() => void propose(lead)} disabled={pending} accessibilityLabel={`Proponer la habitación a ${lead.name}`} />
                )}
              </Box>
            ))
          ) : (
            <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: C.border, borderRadius: 16, paddingHorizontal: S.lg, paddingVertical: S.xl }}>
              <PText v="small" style={{ textAlign: "center" }}>Aún no hay interesados compatibles para esas fechas. Roomie te avisa en cuanto entre uno.</PText>
            </View>
          )}
        </>
      ) : mode === "moveout" ? (
        <MoveOutFlow tenant={tenant} draft={draft} onChange={setDraft} />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
            <UniBadge university={tenant.university} verified long />
            <Pill label={CONTRACT_LABEL[tenant.contractKind]} />
            {tenant.leavingAt && !ended ? <Pill tone="warning" label={`Se va el ${shortDate(tenant.leavingAt)}`} /> : null}
            {tenant.moveOut?.closedAt ? <Pill label="Salida cerrada" /> : ended ? <Pill label="Contrato terminado" /> : null}
          </View>

          <View>
            <Detail label="Contrato" value={`${shortDate(tenant.contractStart)} a ${shortDate(tenant.contractEnd)}`} />
            <Detail label="Renta" value={`${money(tenant.rentCents)}/mes`} />
            {room ? <Detail label="Habitación" value={<RoomTraits room={room} />} /> : null}
            <Detail label="Llaves" value={<KeysLine tenant={tenant} />} last={!tenant.docs?.guarantor && !tenant.moveOut?.closedAt} />
            {tenant.docs?.guarantor ? (
              <Detail
                label="Avalista"
                value={`${tenant.docs.guarantor.name}${tenant.docs.guarantor.phone ? `, ${tenant.docs.guarantor.phone}` : ""}`}
                last={!tenant.moveOut?.closedAt}
              />
            ) : null}
            {tenant.moveOut?.closedAt ? <Detail label="Fianza devuelta" value={money(tenant.moveOut.returnCents ?? 0)} last /> : null}
          </View>

          <RentLedgerBox tenant={tenant} />

          {!ended && (endsSoon || tenant.renewal || renewalState(tenant) !== "not_asked") && !tenant.leavingAt ? <RenewalBox tenant={tenant} /> : null}

          <DepositBox tenant={tenant} ended={ended} onLodge={() => void lodge()} onSettle={() => setMode("moveout")} />

          <DocsChecklist docs={tenant.docs} onChange={(docs) => void patch("tenant.docs", { docs })} />

          <View style={{ gap: 6 }}>
            <PText v="label">Incidencias</PText>
            {incidents.length ? (
              incidents.map((i) => (
                <View key={i.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 32 }}>
                  <PriorityDot priority={i.priority} />
                  <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{i.title}</PText>
                  <IncidentPill status={i.status} />
                </View>
              ))
            ) : (
              <PText v="small">Ninguna. Las abre desde su Franky con fotos.</PText>
            )}
          </View>
        </>
      )}
    </Sheet>
  );
}

/** La fianza con su cuenta atrás en días hábiles y el enlace a la sede. */
function DepositBox({ tenant, ended, onLodge, onSettle }: { tenant: ProTenant; ended: boolean; onLodge: () => void; onSettle: () => void }) {
  const { now, pending } = usePro();
  const c = depositCountdown(tenant, localDate(now));
  return (
    <Box>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
        <PText v="h3">
          {"Fianza "}
          <PText v="h3" color={C.muted}>{money(tenant.deposit.amountCents)}</PText>
        </PText>
        <DepositPill status={tenant.deposit.status} />
      </View>
      {tenant.deposit.status === "pending" ? (
        <>
          <PText v="small" color={c.urgent ? C.errorText : C.text}>
            {c.overdue
              ? `El plazo acabó el ${shortDate(c.dueAt)}. Deposítala cuanto antes: fuera de plazo hay recargo.`
              : `Depositar antes del ${shortDate(c.dueAt)}: ${c.businessDays === 0 ? "vence hoy" : c.businessDays === 1 ? "queda 1 día hábil" : `quedan ${c.businessDays} días hábiles`}.`}
          </PText>
          <PText v="tiny">{`En la sede de la Generalitat, con el ${DEPOSIT_FORMS}.`}</PText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            <PButton small label="Ir a la sede" variant="outline" icon={ArrowUpRight} onPress={() => openExternal(GVA_URL)} />
            <PButton small label="Marcar depositada" variant="secondary" icon={Check} onPress={onLodge} disabled={pending} />
          </View>
        </>
      ) : tenant.deposit.status === "lodged" ? (
        <>
          <PText v="tiny">
            {`Depositada en la Generalitat${tenant.lodgedAt ? ` el ${shortDate(tenant.lodgedAt)}` : ""}. ${ended ? "Revisa la habitación con el inventario y liquídala." : "Se recupera al acabar el contrato."}`}
          </PText>
          {ended ? <PButton small label="Liquidar la fianza" variant="secondary" onPress={onSettle} /> : null}
        </>
      ) : (
        <PText v="tiny">
          {`Devuelta${tenant.returnedAt ? ` el ${shortDate(tenant.returnedAt)}` : ""}${tenant.moveOut?.returnCents !== undefined ? `: ${money(tenant.moveOut.returnCents)}` : ""}.`}
        </PText>
      )}
    </Box>
  );
}
