"use client";

import * as React from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProTable } from "@/lib/pro/types";
import { ChoiceChips, Drawer, FormField, Panel, inputClass } from "../../kit";

export function UnplacedTables({
  defaultZone,
  onPlaced,
}: {
  defaultZone: string;
  onPlaced: (zone: string) => void;
}) {
  const { data, demo, pending, can } = usePro();
  const [open, setOpen] = React.useState(false);
  const tables =
    data.tableOperations?.unmappedResources?.filter((row) => row.active) ?? [];
  if (demo || !tables.length) return null;
  return (
    <Panel
      title="Tus mesas están listas para colocar"
      description="Lleva las mesas que ya usas al plano y conserva todas sus reservas."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {tables.length === 1
            ? "1 mesa pendiente"
            : `${tables.length} mesas pendientes`}
        </p>
        <Button
          variant="dark"
          disabled={pending || !can("table.adopt")}
          onClick={() => setOpen(true)}
        >
          <MapPin className="h-4 w-4" /> Colocar mesas
        </Button>
      </div>
      <AdoptTableDrawer
        open={open}
        onClose={() => setOpen(false)}
        defaultZone={defaultZone}
        onPlaced={onPlaced}
      />
    </Panel>
  );
}

function dimensions(capacity: number, shape: ProTable["shape"]) {
  return {
    w: shape === "bar" ? 5 : capacity <= 4 ? 2 : capacity <= 6 ? 3 : 4,
    h: shape === "bar" ? 1 : capacity <= 8 ? 2 : 3,
  };
}

export function AdoptTableDrawer({
  open,
  onClose,
  defaultZone,
  onPlaced,
}: {
  open: boolean;
  onClose: () => void;
  defaultZone: string;
  onPlaced: (zone: string) => void;
}) {
  const { data, pending, can, update } = usePro();
  const toast = useToast();
  const resources =
    data.tableOperations?.unmappedResources?.filter((row) => row.active) ?? [];
  const [resourceId, setResourceId] = React.useState("");
  const [zone, setZone] = React.useState(defaultZone);
  const [shape, setShape] = React.useState<ProTable["shape"]>("square");
  const [x, setX] = React.useState(0);
  const [y, setY] = React.useState(0);
  const resource = resources.find((row) => row.id === resourceId);
  const { w, h } = dimensions(resource?.capacity ?? 4, shape);
  const targetZone = zone.trim();
  const inZone = data.tables.filter((table) => table.zone === targetZone);
  const clampedX = Math.min(x, 12 - w);
  const clampedY = Math.min(y, 8 - h);
  const occupied = inZone.some(
    (table) =>
      clampedX < table.x + table.w &&
      clampedX + w > table.x &&
      clampedY < table.y + table.h &&
      clampedY + h > table.y,
  );

  React.useEffect(() => {
    if (!open) return;
    setResourceId(resources[0]?.id ?? "");
    setZone(defaultZone);
    setShape("square");
    const size = dimensions(resources[0]?.capacity ?? 4, "square");
    let spot: { x: number; y: number } | undefined;
    for (let row = 0; row + size.h <= 8 && !spot; row++) {
      for (let col = 0; col + size.w <= 12; col++) {
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
    if (pending || !can("table.adopt") || !resource || !targetZone || occupied)
      return;
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
    toast.success(
      "Mesa colocada",
      `${resource.name} ya está en ${targetZone}.`,
    );
    onPlaced(targetZone);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title="Colocar una mesa"
      description="Elige dónde va en tu sala."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            onClick={save}
            disabled={
              pending ||
              !can("table.adopt") ||
              !resource ||
              !targetZone ||
              occupied
            }
          >
            Colocar mesa
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Mesa existente" htmlFor="adopt-table-id">
          <select
            id="adopt-table-id"
            className={inputClass}
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
          >
            {resources.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.capacity} personas
              </option>
            ))}
          </select>
          {resource ? (
            <p className="mt-2 text-xs text-text-muted">
              Conserva sus reservas y su capacidad de {resource.capacity}{" "}
              personas.
            </p>
          ) : null}
        </FormField>
        <FormField label="Zona" htmlFor="adopt-table-zone">
          <input
            id="adopt-table-zone"
            className={inputClass}
            maxLength={60}
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            placeholder="Sala, terraza…"
          />
        </FormField>
        <FormField label="Forma">
          <ChoiceChips
            value={shape}
            onChange={setShape}
            options={[
              { value: "square", label: "Cuadrada" },
              { value: "round", label: "Redonda" },
              { value: "bar", label: "Barra" },
            ]}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Columna" htmlFor="adopt-table-x">
            <select
              id="adopt-table-x"
              className={inputClass}
              value={clampedX}
              onChange={(event) => setX(Number(event.target.value))}
            >
              {Array.from({ length: 13 - w }, (_, value) => (
                <option key={value} value={value}>
                  {value + 1}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Fila" htmlFor="adopt-table-y">
            <select
              id="adopt-table-y"
              className={inputClass}
              value={clampedY}
              onChange={(event) => setY(Number(event.target.value))}
            >
              {Array.from({ length: 9 - h }, (_, value) => (
                <option key={value} value={value}>
                  {value + 1}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div
          role="img"
          aria-label={`Vista previa en ${targetZone || "tu sala"}`}
          className="relative aspect-[12/8] rounded-xl bg-bg-secondary bg-dots"
        >
          {inZone.map((table) => (
            <span
              key={table.id}
              className="absolute flex items-center justify-center rounded-lg border border-border bg-bg-primary text-xs text-text-muted"
              style={{
                left: `${(table.x / 12) * 100}%`,
                top: `${(table.y / 8) * 100}%`,
                width: `${(table.w / 12) * 100}%`,
                height: `${(table.h / 8) * 100}%`,
              }}
            >
              {table.name}
            </span>
          ))}
          <span
            className={`absolute flex items-center justify-center border-2 border-violet bg-violet-50 text-center text-xs font-bold text-violet-deep ${shape === "round" ? "rounded-full" : "rounded-lg"}`}
            style={{
              left: `${(clampedX / 12) * 100}%`,
              top: `${(clampedY / 8) * 100}%`,
              width: `${(w / 12) * 100}%`,
              height: `${(h / 8) * 100}%`,
            }}
          >
            {resource?.name}
          </span>
        </div>
        {occupied ? (
          <p role="alert" className="text-sm text-rose-600">
            Ese sitio ya tiene una mesa. Elige otra fila o columna.
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
