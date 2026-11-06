import React from "react";
import { Share, View } from "react-native";
import { Check, Copy, MapPin, Video } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { S } from "@/theme";
import type { ProVisit } from "../../../../../shared/pro/types";
import { atLocal, dayLabel, localDate, minutesToLabel, money, relative, time } from "../../../../../shared/pro/format";
import { VISIT_STATUS, shortDate, uniShort, visitLink } from "../../../../../shared/pro/housing";
import { localId, usePro } from "../../store";
import { ChoiceGrid, Detail, Field, PButton, PText, Pill, Sheet } from "../../kit";
import { RoomieBadge, UniBadge, dayChip, staffName } from "./shared";
import { SlotPicker, openExternal } from "./drawer-common";
import { Box, Quote, SelectField } from "./ui";

/* ------------------------------------------------------------------ */
/* Visita                                                              */
/* ------------------------------------------------------------------ */

export function VisitDrawer({ visitId, onClose, onOpenLead }: { visitId: string | null; onClose: () => void; onOpenLead?: (leadId: string) => void }) {
  const { data } = usePro();
  const visit = data.visits.find((v) => v.id === visitId);
  if (!visit) return null;
  return <VisitDrawerBody key={visit.id} visit={visit} onClose={onClose} onOpenLead={onOpenLead} />;
}

function VisitDrawerBody({ visit, onClose, onOpenLead }: { visit: ProVisit; onClose: () => void; onOpenLead?: (leadId: string) => void }) {
  const { data, update, now, pending } = usePro();
  const [mode, setMode] = React.useState<"view" | "move">("view");
  const [day, setDay] = React.useState("");
  const [slot, setSlot] = React.useState<number | null>(null);
  const lead = data.leads.find((l) => l.id === visit.leadId);
  const property = data.properties.find((p) => p.id === visit.propertyId);
  const isAgency = data.staff.length > 1;
  const link = visitLink(visit.id);
  const firstName = lead?.name.split(" ")[0] ?? "El interesado";

  const patch = (label: string, fields: Partial<ProVisit>) =>
    update(label, (d) => ({ ...d, visits: d.visits.map((v) => (v.id === visit.id ? { ...v, ...fields } : v)) }));

  const setStatus = async (status: ProVisit["status"]) => {
    if (!(await patch(`visit.${status}`, { status }))) return;
    if (status === "done") toast("Visita hecha", { kind: "success", body: `Si a ${firstName} le ha gustado, envíale el contrato desde su ficha.` });
    else if (status === "no_show") toast("Marcada como no vino", { kind: "success", body: "Cuenta en su historial para la próxima vez." });
    else if (status === "cancelled") {
      toast("Visita cancelada", { kind: "success", body: `Avisamos a ${firstName} en Franky.` });
      onClose();
    }
  };

  const move = async () => {
    if (!day || slot === null) return;
    if (!(await patch("visit.move", { start: atLocal(day, slot), status: "scheduled" }))) return;
    toast("Visita movida", { kind: "success", body: `${dayLabel(atLocal(day, slot))} a las ${minutesToLabel(slot)}. ${firstName} recibe el cambio.` });
    setMode("view");
  };

  // Sin portapapeles en la app: se comparte el enlace (incluye "Copiar" en el menú del sistema).
  const copy = async () => {
    try {
      await Share.share({ message: link });
    } catch {
      toast("Copia el enlace", { kind: "info", body: link });
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Visita de ${lead?.name ?? "interesado"}`}
      description={`${dayLabel(visit.start)} a las ${time(visit.start)}`}
      footer={
        mode === "move" ? (
          <>
            <PButton label="Volver" variant="ghost" onPress={() => setMode("view")} />
            <PButton label="Mover visita" onPress={() => void move()} disabled={pending || !day || slot === null} />
          </>
        ) : visit.status === "scheduled" ? (
          <>
            <PButton label="Cancelar" variant="ghost" onPress={() => void setStatus("cancelled")} disabled={pending} accessibilityLabel="Cancelar la visita" />
            <PButton label="Reprogramar" variant="outline" onPress={() => setMode("move")} />
            <PButton label="No vino" variant="outline" onPress={() => void setStatus("no_show")} disabled={pending} />
            <PButton label="Hecha" icon={Check} onPress={() => void setStatus("done")} disabled={pending} />
          </>
        ) : (
          <>
            <PButton label="Nueva fecha" variant="outline" onPress={() => setMode("move")} />
            {lead && onOpenLead ? <PButton label="Abrir interesado" onPress={() => onOpenLead(lead.id)} /> : null}
          </>
        )
      }
    >
      {mode === "move" ? (
        <SlotPicker
          day={day}
          slot={slot}
          onDay={(d) => {
            setDay(d);
            setSlot(null);
          }}
          onSlot={setSlot}
        />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
            <Pill tone={VISIT_STATUS[visit.status].tone} label={VISIT_STATUS[visit.status].label} />
            {visit.mode === "video" ? <Pill tone="info" icon={Video} label="Por vídeo" /> : <Pill icon={MapPin} label="En el piso" />}
            {lead ? <UniBadge university={lead.university} verified={lead.verified} /> : null}
            {lead?.roomieGroup ? <RoomieBadge group={lead.roomieGroup} /> : null}
          </View>
          <View>
            <Detail label="Piso" value={property?.title ?? "Sin piso"} />
            <Detail label="Dirección" value={property?.address ?? ""} last={!lead} />
            {lead ? <Detail label="Busca" value={`entrada ${shortDate(lead.moveIn)}, ${lead.months} meses, hasta ${money(lead.budgetCents)}`} /> : null}
            {lead ? <Detail label="Estudia" value={lead.studies} last /> : null}
          </View>
          {isAgency ? (
            <SelectField
              label="Quién la hace"
              value={visit.agentId ?? ""}
              onChange={async (v) => {
                if (!(await patch("visit.agent", { agentId: v || undefined }))) return;
                toast("Visita reasignada", { kind: "success", body: staffName(data, v) ?? "Sin agente" });
              }}
              options={[{ value: "", label: "Sin asignar" }, ...data.staff.map((s) => ({ value: s.id, label: s.name }))]}
            />
          ) : null}
          <Field label="Formato">
            <ChoiceGrid
              value={visit.mode}
              onChange={(m) => void patch("visit.mode", { mode: m })}
              options={[
                { value: "in_person", label: "En el piso" },
                { value: "video", label: "Por vídeo" },
              ]}
            />
          </Field>
          {visit.mode === "video" ? (
            <Box>
              <PText v="h3">Enlace de la videollamada</PText>
              <PText v="tiny">{link}</PText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                <PButton small label="Copiar" variant="outline" icon={Copy} onPress={() => void copy()} accessibilityLabel="Copiar el enlace de la videollamada" />
                <PButton small label="Entrar" variant="secondary" icon={Video} onPress={() => openExternal(link)} accessibilityLabel="Entrar en la videollamada" />
              </View>
              <PText v="tiny">{`${firstName} lo tiene en su Franky. Enseña cada habitación con la cámara trasera y la luz encendida.`}</PText>
            </Box>
          ) : null}
          {lead ? <Quote text={lead.message} /> : null}
          <PText v="tiny">{`Creada ${relative(visit.start, now.getTime())}.`}</PText>
        </>
      )}
    </Sheet>
  );
}

export function NewVisitDrawer({ open, leadId, onClose }: { open: boolean; leadId?: string; onClose: () => void }) {
  const { data, update, now, pending } = usePro();
  const active = data.leads.filter((l) => l.stage !== "lost" && l.stage !== "signed");
  const [pick, setPick] = React.useState(leadId ?? "");
  const [propertyId, setPropertyId] = React.useState("");
  const [day, setDay] = React.useState("");
  const [slot, setSlot] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<ProVisit["mode"]>("in_person");
  const [agentId, setAgentId] = React.useState("");
  const lead = data.leads.find((l) => l.id === pick);
  const prop = propertyId || lead?.propertyId || "";

  const create = async () => {
    if (!lead || !prop || !day || slot === null) return;
    const visit: ProVisit = {
      id: localId("v"),
      leadId: lead.id,
      propertyId: prop,
      start: atLocal(day, slot),
      mode,
      status: "scheduled",
      agentId: agentId || lead.agentId || data.properties.find((p) => p.id === prop)?.agentId,
    };
    const ok = await update("visit.create", (d) => ({
      ...d,
      visits: [...d.visits, visit],
      leads: d.leads.map((l) =>
        l.id === lead.id && (l.stage === "new" || l.stage === "contacted") ? { ...l, stage: "visit", propertyId: prop, lastContactAt: new Date().toISOString() } : l,
      ),
    }));
    if (!ok) return;
    toast("Visita creada", { kind: "success", body: `${lead.name.split(" ")[0]} la recibe en Franky. ${dayChip(day, localDate(now))} a las ${minutesToLabel(slot)}.` });
    setDay("");
    setSlot(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nueva visita"
      description="Elige interesado, piso y una franja libre."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Crear visita" onPress={() => void create()} disabled={pending || !lead || !prop || !day || slot === null} />
        </>
      }
    >
      <SelectField
        label="Interesado"
        value={pick}
        onChange={setPick}
        placeholder="Elige un interesado"
        options={active.map((l) => ({ value: l.id, label: l.name, hint: `${uniShort(l.university)}, entrada ${shortDate(l.moveIn)}` }))}
      />
      <SelectField label="Piso" value={prop} onChange={setPropertyId} placeholder="Elige un piso" options={data.properties.map((p) => ({ value: p.id, label: p.title }))} />
      <SlotPicker
        day={day}
        slot={slot}
        onDay={(d) => {
          setDay(d);
          setSlot(null);
        }}
        onSlot={setSlot}
      />
      <Field label="Formato">
        <ChoiceGrid
          value={mode}
          onChange={setMode}
          options={[
            { value: "in_person", label: "En el piso" },
            { value: "video", label: "Por vídeo" },
          ]}
        />
      </Field>
      {data.staff.length > 1 ? (
        <SelectField
          label="Quién la hace"
          value={agentId}
          onChange={setAgentId}
          options={[{ value: "", label: "El agente del piso" }, ...data.staff.map((s) => ({ value: s.id, label: s.name }))]}
        />
      ) : null}
    </Sheet>
  );
}
