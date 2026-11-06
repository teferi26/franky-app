import React from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { MapPin } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProTable } from "../../../../../shared/pro/types";
import { usePro } from "../../store";
import { ChoiceGrid, Field, Input, PButton, PText, Panel, Sheet, Stepper } from "../../kit";
import { PickList } from "./ui";

/** Rejilla del plano: 12 columnas por 8 filas, igual que la web. */
export const FLOOR_COLS = 12;
export const FLOOR_ROWS = 8;

export function UnplacedTables({ defaultZone, onPlaced }: { defaultZone: string; onPlaced: (zone: string) => void }) {
  const { data, demo, pending, can } = usePro();
  const [open, setOpen] = React.useState(false);
  const tables = data.tableOperations?.unmappedResources?.filter((row) => row.active) ?? [];
  if (demo || !tables.length) return null;
  return (
    <Panel title="Tus mesas están listas para colocar" description="Lleva las mesas que ya usas al plano y conserva todas sus reservas.">
      <View style={{ gap: S.md }}>
        <PText v="small">{tables.length === 1 ? "1 mesa pendiente" : `${tables.length} mesas pendientes`}</PText>
        <PButton label="Colocar mesas" icon={MapPin} disabled={pending || !can("table.adopt")} onPress={() => setOpen(true)} />
      </View>
      <AdoptTableDrawer open={open} onClose={() => setOpen(false)} defaultZone={defaultZone} onPlaced={onPlaced} />
    </Panel>
  );
}

function dimensions(capacity: number, shape: ProTable["shape"]) {
  return {
    w: shape === "bar" ? 5 : capacity <= 4 ? 2 : capacity <= 6 ? 3 : 4,
    h: shape === "bar" ? 1 : capacity <= 8 ? 2 : 3,
  };
}

export function AdoptTableDrawer({ open, onClose, defaultZone, onPlaced }: {
  open: boolean;
  onClose: () => void;
  defaultZone: string;
  onPlaced: (zone: string) => void;
}) {
  const { data, pending, can, update } = usePro();
  const { width } = useWindowDimensions();
  const resources = data.tableOperations?.unmappedResources?.filter((row) => row.active) ?? [];
  const [resourceId, setResourceId] = React.useState("");
  const [zone, setZone] = React.useState(defaultZone);
  const [shape, setShape] = React.useState<ProTable["shape"]>("square");
  const [x, setX] = React.useState(0);
  const [y, setY] = React.useState(0);
  const resource = resources.find((row) => row.id === resourceId);
  const { w, h } = dimensions(resource?.capacity ?? 4, shape);
  const targetZone = zone.trim();
  const inZone = data.tables.filter((table) => table.zone === targetZone);
  const clampedX = Math.min(x, FLOOR_COLS - w);
  const clampedY = Math.min(y, FLOOR_ROWS - h);
  const occupied = inZone.some(
    (table) => clampedX < table.x + table.w && clampedX + w > table.x && clampedY < table.y + table.h && clampedY + h > table.y,
  );

  React.useEffect(() => {
    if (!open) return;
    setResourceId(resources[0]?.id ?? "");
    setZone(defaultZone);
    setShape("square");
    const size = dimensions(resources[0]?.capacity ?? 4, "square");
    let spot: { x: number; y: number } | undefined;
    for (let row = 0; row + size.h <= FLOOR_ROWS && !spot; row++) {
      for (let col = 0; col + size.w <= FLOOR_COLS; col++) {
        if (
          !data.tables.some(
            (table) =>
              table.zone === defaultZone &&
              col < table.x + table.w &&
              col + size.w > table.x &&
              row < table.y + table.h &&
              row + size.h > table.y,
          )
        ) {
          spot = { x: col, y: row };
          break;
        }
      }
    }
    setX(spot?.x ?? 0);
    setY(spot?.y ?? 0);
    // Una actualización no debe borrar la posición que se está editando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    if (pending || !can("table.adopt") || !resource || !targetZone || occupied) return;
    const saved = await update("table.adopt", (current) => current, {
      type: "table.adopt",
      resourceId: resource.id,
      zone: targetZone,
      x: clampedX,
      y: clampedY,
      w,
      h,
      shape,
    });
    if (!saved) return;
    toast("Mesa colocada", { kind: "success", body: `${resource.name} ya está en ${targetZone}.` });
    onPlaced(targetZone);
    onClose();
  };

  // Vista previa escalada al ancho de la hoja.
  const previewW = Math.min(width, 640) - S.lg * 2;
  const cell = previewW / FLOOR_COLS;
  const box = (col: number, row: number, cols: number, rows: number) => ({
    position: "absolute" as const,
    left: col * cell + 2,
    top: row * cell + 2,
    width: cols * cell - 4,
    height: rows * cell - 4,
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Colocar una mesa"
      description="Elige dónde va en tu sala."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Colocar mesa" onPress={() => void save()} disabled={pending || !can("table.adopt") || !resource || !targetZone || occupied} />
        </>
      }
    >
      <Field label="Mesa existente" hint={resource ? `Conserva sus reservas y su capacidad de ${resource.capacity} personas.` : undefined}>
        <PickList
          value={resourceId}
          onChange={setResourceId}
          options={resources.map((row) => ({ value: row.id, label: `${row.name} · ${row.capacity} personas` }))}
        />
      </Field>
      <Field label="Zona">
        <Input value={zone} onChangeText={setZone} maxLength={60} placeholder="Sala, terraza..." label="Zona" />
      </Field>
      <Field label="Forma">
        <ChoiceGrid
          value={shape}
          onChange={setShape}
          options={[
            { value: "square", label: "Cuadrada" },
            { value: "round", label: "Redonda" },
            { value: "bar", label: "Barra" },
          ]}
        />
      </Field>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
        <Field label="Columna">
          <Stepper value={clampedX} onChange={setX} min={0} max={FLOOR_COLS - w} format={(v) => String(v + 1)} label="columna" />
        </Field>
        <Field label="Fila">
          <Stepper value={clampedY} onChange={setY} min={0} max={FLOOR_ROWS - h} format={(v) => String(v + 1)} label="fila" />
        </Field>
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Vista previa en ${targetZone || "tu sala"}`}
        style={{ width: previewW, height: cell * FLOOR_ROWS, borderRadius: R.md, backgroundColor: C.input }}
      >
        {inZone.map((table) => (
          <View
            key={table.id}
            style={[box(table.x, table.y, table.w, table.h), { borderRadius: R.sm, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }]}
          >
            <Text style={{ fontSize: 11, color: C.muted }} numberOfLines={1} maxFontSizeMultiplier={1.1}>{table.name}</Text>
          </View>
        ))}
        <View
          style={[
            box(clampedX, clampedY, w, h),
            { borderRadius: shape === "round" ? 999 : R.sm, borderWidth: 2, borderColor: C.blue, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center" },
          ]}
        >
          <Text style={{ fontFamily: FONT.heading, fontSize: 11, color: C.blueDeep }} numberOfLines={1} maxFontSizeMultiplier={1.1}>{resource?.name}</Text>
        </View>
      </View>
      {occupied ? (
        <View accessibilityRole="alert">
          <PText v="small" color={C.errorText}>Ese sitio ya tiene una mesa. Elige otra fila o columna.</PText>
        </View>
      ) : null}
    </Sheet>
  );
}
