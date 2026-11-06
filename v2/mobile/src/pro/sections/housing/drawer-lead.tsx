import React from "react";
import { Text, View } from "react-native";
import { CalendarPlus, Check, FileSignature, MapPin, MessageCircle, Users, Video } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { LeadStage, ProData, ProLead, ProRoom, ProTenant, ProVisit } from "../../../../../shared/pro/types";
import { addDays, atLocal, dayLabel, localDate, minutesToLabel, money, relative, time } from "../../../../../shared/pro/format";
import { LOST_REASONS, ROOM_STATUS, STAGES, VISIT_STATUS, addMonths, findRoom, shortDate, uniShort } from "../../../../../shared/pro/housing";
import { UNIVERSITIES } from "../../../../../shared/pro/demo/common";
import { localId, usePro } from "../../store";
import { ChoiceGrid, Detail, Field, Input, PAvatar, PButton, PText, Pill, Segmented, Sheet, Stepper } from "../../kit";
import { BudgetFit, ErasmusBadge, RoomChip, RoomTraits, RoomieBadge, UniBadge, dayChip, euros, staffName } from "./shared";
import { SlotPicker, openExternal, whatsappHref } from "./drawer-common";
import { Box, DateField, Quote, SelectField, SoftBox, WarnNote } from "./ui";
import { DocsChecklist, FitBox, FlatCompat, QuickReplies } from "./lead-tools";

/* ------------------------------------------------------------------ */
/* Interesado                                                          */
/* ------------------------------------------------------------------ */

export function LeadDrawer({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { data } = usePro();
  const lead = data.leads.find((l) => l.id === leadId);
  if (!lead) return null;
  return <LeadDrawerBody key={lead.id} lead={lead} onClose={onClose} />;
}

function setRoomStatus(d: ProData, propertyId: string | undefined, roomId: string | undefined, fields: Partial<ProRoom>): ProData {
  return {
    ...d,
    properties: d.properties.map((p) => (p.id === propertyId ? { ...p, rooms: p.rooms.map((r) => (r.id === roomId ? { ...r, ...fields } : r)) } : p)),
  };
}

function LeadDrawerBody({ lead, onClose }: { lead: ProLead; onClose: () => void }) {
  const { data, update, now, vertical, pending } = usePro();
  const today = localDate(now);
  const isAgency = data.staff.length > 1;
  const { property, room } = findRoom(data, lead.propertyId, lead.roomId);
  const [mode, setMode] = React.useState<"view" | "visit" | "contract" | "lost">("view");
  const [day, setDay] = React.useState("");
  const [slot, setSlot] = React.useState<number | null>(null);
  const [visitMode, setVisitMode] = React.useState<ProVisit["mode"]>(lead.erasmus ? "video" : "in_person");
  const [kind, setKind] = React.useState<ProTenant["contractKind"]>(lead.months >= 11 ? "habitacion" : "temporada");
  const [start, setStart] = React.useState(lead.moveIn.slice(0, 10) < today ? today : lead.moveIn.slice(0, 10));
  const [months, setMonths] = React.useState(lead.months);
  const [rent, setRent] = React.useState(String((room?.priceCents ?? lead.budgetCents) / 100));
  const [reason, setReason] = React.useState(LOST_REASONS[0]);

  const visits = data.visits.filter((v) => v.leadId === lead.id).sort((a, b) => b.start.localeCompare(a.start));
  const firstName = lead.name.split(" ")[0];

  const patch = (label: string, fields: Partial<ProLead>) =>
    update(label, (d) => ({ ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, ...fields } : l)) }));

  const moveStage = async (stage: LeadStage) => {
    if (stage === lead.stage) return;
    if (!(await patch("lead.stage", { stage, lastContactAt: stage === "new" ? lead.lastContactAt : new Date().toISOString() }))) return;
    toast(`${firstName} pasa a ${STAGES.find((s) => s.id === stage)?.label.toLowerCase()}`, { kind: "success" });
  };

  const proposeVisit = async () => {
    if (!day || slot === null) return;
    const visit: ProVisit = {
      id: localId("v"),
      leadId: lead.id,
      propertyId: lead.propertyId ?? data.properties[0]?.id ?? "",
      start: atLocal(day, slot),
      mode: visitMode,
      status: "scheduled",
      agentId: lead.agentId ?? property?.agentId,
    };
    const ok = await update("visit.propose", (d) => ({
      ...d,
      visits: [...d.visits, visit],
      leads: d.leads.map((l) =>
        l.id === lead.id ? { ...l, stage: l.stage === "new" || l.stage === "contacted" ? "visit" : l.stage, lastContactAt: new Date().toISOString() } : l,
      ),
    }));
    if (!ok) return;
    toast("Visita propuesta", { kind: "success", body: `${firstName} la confirma desde Franky. ${dayChip(day, today)} a las ${minutesToLabel(slot)}.` });
    setMode("view");
  };

  const sendContract = async () => {
    const rentCents = euros(rent);
    const contract = { kind, start, months: Math.max(1, months || 1), rentCents };
    const ok = await update("lead.contract", (d) => {
      const next = {
        ...d,
        leads: d.leads.map((l) =>
          l.id === lead.id ? { ...l, stage: "reserved" as LeadStage, contractSentAt: new Date().toISOString(), contract, lastContactAt: new Date().toISOString() } : l,
        ),
      };
      return room && room.status === "free" ? setRoomStatus(next, lead.propertyId, lead.roomId, { status: "reserved", availableFrom: start }) : next;
    });
    if (!ok) return;
    toast("Contrato enviado", { kind: "success", body: `${firstName} lo firma desde el móvil. La habitación queda reservada.` });
    setMode("view");
  };

  const markSigned = async () => {
    if (!property || !room) return;
    const c = lead.contract ?? { kind, start, months: lead.months, rentCents: room.priceCents };
    const end = addDays(addMonths(c.start, c.months), -1);
    const tenant: ProTenant = {
      id: localId("t"),
      name: lead.name,
      university: lead.university,
      propertyId: property.id,
      roomId: room.id,
      rentCents: c.rentCents,
      contractStart: c.start,
      contractEnd: end,
      contractKind: c.kind,
      deposit: { amountCents: c.rentCents * (c.kind === "temporada" ? 2 : 1), status: "pending", dueAt: addDays(c.start, 30) },
      rentStatus: c.start <= today ? "pending" : "paid",
    };
    const ok = await update("lead.signed", (d) => {
      const next = {
        ...d,
        tenants: [...d.tenants, tenant],
        leads: d.leads.map((l) => (l.id === lead.id ? { ...l, stage: "signed" as LeadStage, lastContactAt: new Date().toISOString() } : l)),
      };
      return setRoomStatus(next, property.id, room.id, { status: "occupied", tenantId: tenant.id, availableFrom: addDays(end, 1) });
    });
    if (!ok) return;
    toast("Contrato firmado", { kind: "success", body: `${firstName} ya es inquilino. Te avisaremos del plazo para depositar la fianza.` });
    onClose();
  };

  const markLost = async () => {
    const ok = await update("lead.lost", (d) => {
      const next = { ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, stage: "lost" as LeadStage, lostReason: reason } : l)) };
      return room?.status === "reserved" && lead.stage === "reserved" ? setRoomStatus(next, lead.propertyId, lead.roomId, { status: "free", availableFrom: today }) : next;
    });
    if (!ok) return;
    toast("Marcado como perdido", { kind: "success", body: reason });
    onClose();
  };

  const whatsappText = `Hola ${firstName}, soy ${data.space.owner.firstName} de ${data.space.name}. Te escribo por ${property ? `el ${property.title}` : "tu búsqueda de habitación"} que viste en Franky.`;

  const openWhatsapp = () => {
    openExternal(whatsappHref(whatsappText));
    if (lead.stage === "new") void patch("lead.contacted", { stage: "contacted", lastContactAt: new Date().toISOString() });
  };

  const footer = (() => {
    if (mode === "visit")
      return (
        <>
          <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
          <PButton label="Proponer visita" icon={CalendarPlus} onPress={() => void proposeVisit()} disabled={pending || !day || slot === null} />
        </>
      );
    if (mode === "contract")
      return (
        <>
          <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
          <PButton label="Enviar para firmar" icon={FileSignature} onPress={() => void sendContract()} disabled={pending || !room || !start || euros(rent) <= 0} />
        </>
      );
    if (mode === "lost")
      return (
        <>
          <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
          <PButton label="Marcar como perdido" variant="danger" onPress={() => void markLost()} disabled={pending} />
        </>
      );
    return (
      <>
        {lead.stage !== "lost" && lead.stage !== "signed" ? <PButton label="Perdido" variant="ghost" onPress={() => setMode("lost")} /> : null}
        <PButton label="WhatsApp" variant="outline" icon={MessageCircle} onPress={openWhatsapp} accessibilityLabel={`Escribir a ${firstName} por WhatsApp`} />
        {lead.stage !== "signed" && lead.stage !== "lost" ? <PButton label="Proponer visita" variant="secondary" icon={CalendarPlus} onPress={() => setMode("visit")} /> : null}
        {lead.stage === "reserved" && lead.contractSentAt ? (
          <PButton label="Marcar firmado" icon={Check} onPress={() => void markSigned()} disabled={pending || !room} />
        ) : lead.stage !== "signed" && lead.stage !== "lost" ? (
          <PButton label="Enviar contrato" icon={FileSignature} onPress={() => setMode("contract")} />
        ) : null}
      </>
    );
  })();

  return (
    <Sheet open onClose={onClose} title={lead.name} description={`${lead.studies} · llegó ${relative(lead.createdAt, now.getTime())}`} footer={footer}>
      {mode === "visit" ? (
        <>
          <PText v="small" color={C.text}>
            {`${firstName} recibe la propuesta en Franky y la confirma con un toque. ${property ? `Piso: ${property.title}.` : ""}`}
          </PText>
          <SlotPicker
            day={day}
            slot={slot}
            onDay={(d) => {
              setDay(d);
              setSlot(null);
            }}
            onSlot={setSlot}
          />
          <Field label="Cómo">
            <ChoiceGrid
              value={visitMode}
              onChange={setVisitMode}
              options={[
                { value: "in_person", label: "En el piso", hint: "Presencial" },
                { value: "video", label: "Por vídeo", hint: lead.erasmus ? "Ideal si aún no ha llegado" : "Videollamada" },
              ]}
            />
          </Field>
        </>
      ) : mode === "contract" ? (
        <>
          {room && property ? (
            <Box>
              <PText v="h3">{`${property.title}, ${room.name.toLowerCase()}`}</PText>
              <RoomTraits room={room} />
            </Box>
          ) : (
            <WarnNote text="Elige antes el piso y la habitación en la ficha del interesado." />
          )}
          <Field label="Tipo de contrato">
            <ChoiceGrid
              value={kind}
              onChange={setKind}
              options={[
                { value: "temporada", label: "Temporada", hint: "El curso o un cuatrimestre" },
                { value: "habitacion", label: "Habitación", hint: "Un año, renovable" },
              ]}
            />
          </Field>
          <DateField label="Entrada" value={start} onChange={setStart} today={today} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
            <Field label="Meses">
              <Stepper value={months} onChange={setMonths} min={1} max={24} label="meses" />
            </Field>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Field label="Renta (€)">
                <Input value={rent} onChangeText={setRent} keyboardType="decimal-pad" label="Renta en euros" />
              </Field>
            </View>
          </View>
          <SoftBox>
            <Detail label="Fianza" value={money(euros(rent) * (kind === "temporada" ? 2 : 1))} />
            <Detail label="Fin del contrato" value={start ? shortDate(addDays(addMonths(start, months || 1), -1)) : "Sin fecha"} last />
            <PText v="tiny" style={{ paddingTop: 4 }}>Cuando firme, Franky te recuerda depositar la fianza en la Generalitat dentro de plazo.</PText>
          </SoftBox>
        </>
      ) : mode === "lost" ? (
        <Field label={`¿Por qué no sigue ${firstName}?`} hint="Te sirve para ver dónde pierdes interesados.">
          <View style={{ gap: 6 }} accessibilityRole="radiogroup">
            {LOST_REASONS.map((r) => {
              const on = reason === r;
              return (
                <Tap
                  key={r}
                  onPress={() => setReason(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={r}
                  style={{ minHeight: 46, flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 1, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.accentSoft : C.surface }}
                >
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: on ? 5 : 1.5, borderColor: on ? C.blue : C.border }} />
                  <Text style={{ fontSize: 14.5, color: C.text }} maxFontSizeMultiplier={1.4}>{r}</Text>
                </Tap>
              );
            })}
          </View>
        </Field>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
            <UniBadge university={lead.university} verified={lead.verified} long />
            {lead.source === "manual" ? <Pill label="Añadido a mano" /> : <Pill tone="violet" label="Vino por Franky" />}
            {lead.erasmus ? <ErasmusBadge /> : null}
            {lead.roomieGroup ? <RoomieBadge group={lead.roomieGroup} /> : null}
            {lead.guarantor ? <Pill tone="success" label="Con avalista" /> : null}
            {lead.stage === "lost" ? <Pill tone="danger" label={`Perdido${lead.lostReason ? `: ${lead.lostReason.toLowerCase()}` : ""}`} /> : null}
          </View>

          <Quote text={lead.message} />

          {lead.stage === "new" || lead.stage === "contacted" || lead.stage === "visit" ? <FitBox lead={lead} /> : null}
          {lead.stage !== "lost" && lead.stage !== "signed" ? <QuickReplies lead={lead} /> : null}

          {lead.stage !== "lost" ? (
            <Field label="Fase">
              <Segmented
                value={lead.stage}
                onChange={(s) => void moveStage(s)}
                options={STAGES.filter((s) => s.id !== "lost").map((s) => ({ value: s.id, label: s.label }))}
              />
            </Field>
          ) : (
            <PButton label="Recuperar interesado" variant="outline" small onPress={() => void moveStage("contacted")} disabled={pending} />
          )}

          <View>
            <Detail label="Universidad" value={lead.university} />
            <Detail label="Entrada" value={dayLabel(`${lead.moveIn.slice(0, 10)}T12:00:00Z`, { weekday: false })} />
            <Detail label="Estancia" value={`${lead.months} meses`} />
            <Detail label="Presupuesto" value={`hasta ${money(lead.budgetCents)}/mes`} />
            <Detail label="Avalista" value={lead.guarantor ? "Sí, sus padres" : "No lo ha indicado"} last={!lead.contractSentAt} />
            {lead.contractSentAt ? <Detail label="Contrato" value={`Enviado ${relative(lead.contractSentAt, now.getTime())}, pendiente de firma`} last /> : null}
          </View>

          <LeadRoomPicker lead={lead} />
          {lead.propertyId ? <FlatCompat personId={lead.id} propertyId={lead.propertyId} /> : null}

          {lead.roomieGroup ? <GroupBox lead={lead} /> : null}

          {lead.stage === "visit" || lead.stage === "reserved" || lead.docs ? (
            <DocsChecklist docs={lead.docs} onChange={(docs) => void patch("lead.docs", { docs, guarantor: Boolean(docs.guarantor?.name) || lead.guarantor })} />
          ) : null}

          {isAgency ? (
            <SelectField
              label="Agente"
              value={lead.agentId ?? ""}
              onChange={async (v) => {
                if (!(await patch("lead.agent", { agentId: v || undefined }))) return;
                toast("Asignado", { kind: "success", body: `${staffName(data, v) ?? "Sin agente"} se encarga de ${firstName}.` });
              }}
              options={[{ value: "", label: "Sin asignar" }, ...data.staff.map((s) => ({ value: s.id, label: s.name }))]}
            />
          ) : null}

          {visits.length ? (
            <View style={{ gap: 6 }}>
              <PText v="label">Visitas</PText>
              {visits.map((v) => (
                <View key={v.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 32 }}>
                  {v.mode === "video" ? <Video size={14} color={C.muted} /> : <MapPin size={14} color={C.muted} />}
                  <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{`${dayLabel(v.start, { weekday: true })}, ${time(v.start)}`}</PText>
                  <Pill tone={VISIT_STATUS[v.status].tone} label={VISIT_STATUS[v.status].label} />
                </View>
              ))}
            </View>
          ) : null}
          <PText v="tiny">
            {`${vertical.id === "landlord" ? "Tú decides" : "Tu equipo decide"} a quién enseñar el piso. Su teléfono se comparte cuando acepta la visita.`}
          </PText>
        </>
      )}
    </Sheet>
  );
}

function LeadRoomPicker({ lead }: { lead: ProLead }) {
  const { data, update } = usePro();
  const { property, room } = findRoom(data, lead.propertyId, lead.roomId);
  const set = (propertyId?: string, roomId?: string) =>
    update("lead.room", (d) => ({ ...d, leads: d.leads.map((l) => (l.id === lead.id ? { ...l, propertyId, roomId } : l)) }));
  return (
    <Box>
      <PText v="label">Piso y habitación</PText>
      <SelectField
        label="Piso"
        hideLabel
        value={lead.propertyId ?? ""}
        onChange={(v) => {
          const p = data.properties.find((x) => x.id === v);
          const firstFree = p?.rooms.find((r) => r.status === "free" || r.status === "leaving");
          void set(p?.id, lead.roomieGroup ? undefined : firstFree?.id);
        }}
        options={[{ value: "", label: "Sin piso todavía" }, ...data.properties.map((p) => ({ value: p.id, label: p.title }))]}
      />
      {property && !lead.roomieGroup ? (
        <SelectField
          label="Habitación"
          hideLabel
          value={lead.roomId ?? ""}
          onChange={async (v) => {
            if (!(await set(property.id, v || undefined))) return;
            toast("Habitación asignada", { kind: "success" });
          }}
          options={[
            { value: "", label: "Cualquier habitación" },
            ...property.rooms.map((r) => ({
              value: r.id,
              label: `${r.name}, ${Math.round(r.priceCents / 100)} € (${ROOM_STATUS[r.status].label.toLowerCase()})`,
              disabled: r.status === "occupied",
            })),
          ]}
        />
      ) : null}
      {property ? (
        <View style={{ gap: S.sm, marginTop: 2 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {property.rooms.map((r) => (
              <RoomChip
                key={r.id}
                room={r}
                selected={r.id === lead.roomId}
                onPress={r.status !== "occupied" && !lead.roomieGroup ? () => void set(property.id, r.id) : undefined}
              />
            ))}
          </View>
          {room ? <BudgetFit budgetCents={lead.budgetCents} priceCents={room.priceCents} /> : null}
        </View>
      ) : null}
    </Box>
  );
}

function GroupBox({ lead }: { lead: ProLead }) {
  const { data, update, pending } = usePro();
  const group = lead.roomieGroup!;
  const fits = data.properties.filter((p) => p.rooms.filter((r) => r.status === "free").length >= group.size);
  return (
    <Box accent>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Users size={16} color={C.blueDeep} strokeWidth={1.9} />
        <PText v="h3" color={C.blueDeep}>Grupo formado por Roomie</PText>
      </View>
      <PText v="tiny" color={C.text}>
        {`${group.size} estudiantes, ${group.compatibility} % compatibles en horarios, limpieza y ruido. Buscan piso entero, presupuesto por persona.`}
      </PText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {group.names.map((n) => (
          <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.bg, borderRadius: R.full, paddingLeft: 3, paddingRight: 10, paddingVertical: 3 }}>
            <PAvatar name={n} size={22} toneKey="violet" />
            <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.text }} maxFontSizeMultiplier={1.3}>{n}</Text>
          </View>
        ))}
      </View>
      {fits.length ? (
        <View style={{ gap: 6 }}>
          {fits.map((p) => (
            <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm, borderRadius: R.md, backgroundColor: C.bg, paddingHorizontal: S.md, paddingVertical: S.sm }}>
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>{p.title}</PText>
                <PText v="tiny">{`${p.rooms.length} habitaciones · ${money(p.wholeFlatPriceCents ?? p.rooms.reduce((a, r) => a + r.priceCents, 0))}/mes entero`}</PText>
              </View>
              <PButton
                small
                label={lead.propertyId === p.id ? "Propuesto" : "Ofrecer entero"}
                variant={lead.propertyId === p.id ? "outline" : "secondary"}
                disabled={pending}
                onPress={async () => {
                  const ok = await update("lead.group.offer", (d) => ({
                    ...d,
                    leads: d.leads.map((l) =>
                      l.id === lead.id ? { ...l, propertyId: p.id, roomId: undefined, stage: l.stage === "new" ? "contacted" : l.stage, lastContactAt: new Date().toISOString() } : l,
                    ),
                  }));
                  if (!ok) return;
                  toast("Piso entero propuesto", { kind: "success", body: `El grupo de ${group.names[0]} lo recibe en Franky.` });
                }}
              />
            </View>
          ))}
        </View>
      ) : (
        <PText v="tiny">{`Ahora no tienes pisos con ${group.size} habitaciones libres a la vez.`}</PText>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo interesado (el que llama o escribe por fuera de Franky)       */
/* ------------------------------------------------------------------ */

export function NewLeadDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now, pending } = usePro();
  const today = localDate(now);
  const [name, setName] = React.useState("");
  const [uni, setUni] = React.useState(UNIVERSITIES[0]);
  const [studies, setStudies] = React.useState("");
  const [moveIn, setMoveIn] = React.useState(addDays(today, 14));
  const [months, setMonths] = React.useState(10);
  const [budget, setBudget] = React.useState("350");
  const [propertyId, setPropertyId] = React.useState("");
  const [message, setMessage] = React.useState("");

  const valid = name.trim().length > 2 && euros(budget) > 0 && Boolean(moveIn);
  const create = async () => {
    const lead: ProLead = {
      id: localId("l"),
      name: name.trim(),
      university: uni,
      studies: studies.trim() || "Sin indicar",
      verified: false,
      erasmus: false,
      budgetCents: euros(budget),
      moveIn,
      months: Math.max(1, months || 1),
      propertyId: propertyId || undefined,
      stage: "contacted",
      message: message.trim() || "Añadido a mano por teléfono o en la oficina.",
      createdAt: new Date().toISOString(),
      lastContactAt: new Date().toISOString(),
      guarantor: false,
      source: "manual",
    };
    if (!(await update("lead.create", (d) => ({ ...d, leads: [lead, ...d.leads] })))) return;
    toast("Interesado añadido", { kind: "success", body: "Cuando se registre en Franky verás su universidad verificada." });
    setName("");
    setStudies("");
    setMessage("");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Añadir interesado"
      description="Para quien te llama o pasa por la oficina. Los que llegan por Franky entran solos."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Añadir" onPress={() => void create()} disabled={pending || !valid} />
        </>
      }
    >
      <Field label="Nombre y apellido">
        <Input value={name} onChangeText={setName} placeholder="Marta López" label="Nombre y apellido" autoCapitalize="words" />
      </Field>
      <Field label="Universidad">
        <ChoiceGrid value={uni} onChange={setUni} options={UNIVERSITIES.map((u) => ({ value: u, label: uniShort(u) }))} />
      </Field>
      <Field label="Estudios">
        <Input value={studies} onChangeText={setStudies} placeholder="Enfermería" label="Estudios" />
      </Field>
      <DateField label="Entrada" value={moveIn} onChange={setMoveIn} today={today} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
        <Field label="Meses">
          <Stepper value={months} onChange={setMonths} min={1} max={24} label="meses" />
        </Field>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Field label="Hasta (€)">
            <Input value={budget} onChangeText={setBudget} keyboardType="decimal-pad" label="Presupuesto máximo en euros" />
          </Field>
        </View>
      </View>
      <SelectField
        label="Piso que le interesa"
        value={propertyId}
        onChange={setPropertyId}
        options={[{ value: "", label: "Aún no lo sabe" }, ...data.properties.map((p) => ({ value: p.id, label: p.title }))]}
      />
      <Field label="Nota">
        <Input value={message} onChangeText={setMessage} multiline placeholder="Qué busca, cuándo puede ver el piso..." label="Nota" />
      </Field>
    </Sheet>
  );
}
