import React from "react";
import { Alert, Linking, View } from "react-native";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import { localId, usePro } from "../../store";
import type { ProResource } from "../../../../../shared/pro/types";
import { ChoiceGrid, Field, Input, PButton, PText, Sheet, Stepper } from "../../kit";
import { TextLink } from "./ui";

const KIND_LABEL: Partial<Record<ProResource["kind"], string>> = {
  court: "Pista",
  room: "Sala",
  desk: "Zona de puestos",
};

export function ResourceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, spaceId, pending, can, update } = usePro();
  const [id, setId] = React.useState("");
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<ProResource["kind"]>("court");
  const [capacity, setCapacity] = React.useState(1);
  const [mode, setMode] = React.useState<"shared" | "exclusive">("exclusive");
  const reset = React.useCallback(() => {
    setId("");
    setName("");
    setKind("court");
    setCapacity(1);
    setMode("exclusive");
  }, []);
  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);
  const select = (resource: ProResource) => {
    setId(resource.id);
    setName(resource.name);
    setKind(resource.kind);
    setCapacity(resource.capacity);
    setMode(resource.allocationMode ?? "shared");
  };
  const save = async () => {
    if (!name.trim() || !Number.isSafeInteger(capacity) || capacity < 1) return;
    const previous = data.resources.find((resource) => resource.id === id);
    const resource: ProResource = {
      ...(previous ?? {
        id: localId("resource"),
        tone: "violet",
        pricePerHourCents: null,
      }),
      name: name.trim(),
      kind,
      capacity: kind === "desk" ? capacity : 1,
      allocationMode: mode,
      capacityUnit: kind === "desk" ? "people" : "concurrent_bookings",
    };
    if (
      !(await update(previous ? "resource.save" : "resource.create", (draft) => ({
        ...draft,
        resources: previous ? draft.resources.map((row) => (row.id === id ? resource : row)) : [...draft.resources, resource],
      })))
    )
      return;
    toast("Espacio guardado", { kind: "success" });
    reset();
  };
  const archive = async () => {
    if (!id || !(await update("resource.archive", (draft) => ({ ...draft, resources: draft.resources.filter((row) => row.id !== id) })))) return;
    toast("Espacio archivado", { kind: "success" });
    reset();
  };
  const confirmArchive = () =>
    Alert.alert("Archivar este espacio", name.trim() || undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Archivar", style: "destructive", onPress: () => void archive() },
    ]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pistas y espacios"
      description="Prepara los espacios que se pueden reservar."
      footer={
        <>
          <PButton label="Cerrar" variant="ghost" onPress={onClose} />
          <PButton
            label="Guardar espacio"
            onPress={() => void save()}
            disabled={pending || !can(id ? "resource.save" : "resource.create") || !name.trim() || !Number.isSafeInteger(capacity) || capacity < 1}
          />
        </>
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        {data.resources.map((resource) => (
          <PButton key={resource.id} label={resource.name} small variant={id === resource.id ? "secondary" : "outline"} onPress={() => select(resource)} />
        ))}
        <PButton label="Añadir espacio" small variant="secondary" onPress={reset} />
      </View>
      <Field label="Nombre">
        <Input value={name} maxLength={120} onChangeText={setName} label="Nombre" />
      </Field>
      <Field label="Tipo">
        {id ? (
          // El tipo de un espacio existente no se cambia.
          <View style={{ minHeight: 46, justifyContent: "center", paddingHorizontal: S.md, borderRadius: R.md, backgroundColor: C.input }}>
            <PText v="body" color={C.muted}>{KIND_LABEL[kind] ?? kind}</PText>
          </View>
        ) : (
          <ChoiceGrid
            value={kind}
            onChange={(next) => {
              setKind(next);
              setCapacity(1);
              setMode(next === "desk" ? "shared" : "exclusive");
            }}
            options={[
              { value: "court", label: "Pista" },
              { value: "room", label: "Sala" },
              { value: "desk", label: "Zona de puestos" },
            ]}
          />
        )}
      </Field>
      {kind === "desk" ? (
        <>
          <Field label="Número de puestos">
            <Stepper value={capacity} onChange={setCapacity} min={1} max={500} label="puestos" />
          </Field>
          <Field label="Reservas">
            <ChoiceGrid
              value={mode}
              onChange={setMode}
              options={[
                { value: "shared", label: "Cada persona reserva su puesto" },
                { value: "exclusive", label: "Una reserva ocupa toda la zona" },
              ]}
            />
          </Field>
        </>
      ) : (
        <PText v="small">{`Una reserva ocupa ${kind === "court" ? "la pista" : "la sala"} completa.`}</PText>
      )}
      <View style={{ gap: 2 }}>
        <PText v="small">La duración, el precio y el número de personas se configuran en los servicios vinculados.</PText>
        <TextLink
          label="Gestionar servicios"
          onPress={() => void Linking.openURL(`https://franky.es/espacios/servicios?organization=${encodeURIComponent(spaceId)}&panel=1`)}
        />
      </View>
      {id ? <PButton label="Archivar este espacio" variant="ghost" disabled={pending || !can("resource.archive")} onPress={confirmArchive} /> : null}
    </Sheet>
  );
}
