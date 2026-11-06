import React from "react";
import { Text, View } from "react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProIncident } from "../../../../../shared/pro/types";
import { relative } from "../../../../../shared/pro/format";
import { currentTenants } from "../../../../../shared/pro/housing";
import { localId, usePro } from "../../store";
import { ChoiceGrid, Field, Input, PButton, Sheet } from "../../kit";
import { SelectField } from "./ui";

/* ------------------------------------------------------------------ */
/* Incidencia                                                          */
/* ------------------------------------------------------------------ */

export function IncidentDrawer({ incidentId, onClose }: { incidentId: string | "new" | null; onClose: () => void }) {
  const { data } = usePro();
  const incident = data.incidents.find((i) => i.id === incidentId);
  if (incidentId === "new") return <IncidentBody key="new" onClose={onClose} />;
  if (!incident) return null;
  return <IncidentBody key={incident.id} incident={incident} onClose={onClose} />;
}

function IncidentBody({ incident, onClose }: { incident?: ProIncident; onClose: () => void }) {
  const { data, update, now, pending } = usePro();
  const tenants = currentTenants(data, now);
  const [propertyId, setPropertyId] = React.useState(incident?.propertyId ?? data.properties[0]?.id ?? "");
  const [tenantId, setTenantId] = React.useState("");
  const [title, setTitle] = React.useState(incident?.title ?? "");
  const [priority, setPriority] = React.useState<ProIncident["priority"]>(incident?.priority ?? "normal");
  const [status, setStatus] = React.useState<ProIncident["status"]>(incident?.status ?? "open");
  const [assignee, setAssignee] = React.useState(incident?.assignee ?? "");
  const property = data.properties.find((p) => p.id === (incident?.propertyId ?? propertyId));
  const inFlat = tenants.filter((t) => t.propertyId === propertyId);

  const save = async () => {
    if (incident) {
      const ok = await update("incident.update", (d) => ({
        ...d,
        incidents: d.incidents.map((i) => (i.id === incident.id ? { ...i, priority, status, assignee: assignee.trim() || undefined } : i)),
      }));
      if (!ok) return;
      toast(status === "resolved" ? "Incidencia resuelta" : "Incidencia actualizada", {
        kind: "success",
        body: status === "resolved" ? `Avisamos a ${incident.tenantName.split(" ")[0]}.` : undefined,
      });
    } else {
      const tenant = inFlat.find((t) => t.id === tenantId);
      const item: ProIncident = {
        id: localId("i"),
        propertyId,
        roomId: tenant?.roomId,
        tenantName: tenant?.name ?? "Zonas comunes",
        title: title.trim(),
        priority,
        status: "open",
        createdAt: new Date().toISOString(),
        assignee: assignee.trim() || undefined,
      };
      if (!(await update("incident.create", (d) => ({ ...d, incidents: [item, ...d.incidents] })))) return;
      toast("Incidencia abierta", { kind: "success", body: assignee.trim() ? `Asignada a ${assignee.trim()}.` : "Asígnala para que no se quede parada." });
    }
    onClose();
  };

  const people = [...data.staff.map((s) => s.name), "Fontanería Esteve", "Electricidad Pastor", "Cerrajería San Vicente"];
  const needle = assignee.trim().toLowerCase();
  const suggestions = people.filter((p) => p.toLowerCase() !== needle && (!needle || p.toLowerCase().includes(needle)));

  return (
    <Sheet
      open
      onClose={onClose}
      title={incident ? incident.title : "Nueva incidencia"}
      description={
        incident
          ? `${property?.title ?? ""} · ${incident.tenantName} · ${relative(incident.createdAt, now.getTime())}`
          : "Para lo que te llega por teléfono. Tus inquilinos las abren desde su Franky."
      }
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={incident ? "Guardar" : "Abrir incidencia"} onPress={() => void save()} disabled={pending || (!incident && (!title.trim() || !propertyId))} />
        </>
      }
    >
      {!incident ? (
        <>
          <Field label="Qué pasa">
            <Input value={title} onChangeText={setTitle} placeholder="No hay agua caliente" label="Qué pasa" />
          </Field>
          <SelectField
            label="Piso"
            value={propertyId}
            onChange={(v) => {
              setPropertyId(v);
              setTenantId("");
            }}
            options={data.properties.map((p) => ({ value: p.id, label: p.title }))}
          />
          <SelectField
            label="Quién avisa"
            value={tenantId}
            onChange={setTenantId}
            options={[{ value: "", label: "Zonas comunes" }, ...inFlat.map((t) => ({ value: t.id, label: t.name }))]}
          />
        </>
      ) : (
        <Field label="Estado">
          <ChoiceGrid
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: "Abierta" },
              { value: "in_progress", label: "En curso" },
              { value: "resolved", label: "Resuelta" },
            ]}
          />
        </Field>
      )}
      <Field label="Prioridad">
        <ChoiceGrid
          value={priority}
          onChange={setPriority}
          options={[
            { value: "urgent", label: "Urgente", hint: "Hoy mismo" },
            { value: "normal", label: "Normal", hint: "Esta semana" },
            { value: "low", label: "Baja", hint: "Cuando se pueda" },
          ]}
        />
      </Field>
      <Field label="Quién se encarga" hint="Alguien del equipo o tu técnico de confianza.">
        <Input value={assignee} onChangeText={setAssignee} placeholder="Nombre o empresa" label="Quién se encarga" />
        {/* Sugerencias: el <datalist> de la web. */}
        {suggestions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {suggestions.map((p) => (
              <Tap
                key={p}
                onPress={() => setAssignee(p)}
                accessibilityRole="button"
                accessibilityLabel={`Asignar a ${p}`}
                hitSlop={5}
                style={{ minHeight: 34, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, justifyContent: "center" }}
              >
                <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.text }} maxFontSizeMultiplier={1.3}>{p}</Text>
              </Tap>
            ))}
          </View>
        ) : null}
      </Field>
    </Sheet>
  );
}
