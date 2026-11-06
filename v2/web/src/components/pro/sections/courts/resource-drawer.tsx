"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProResource } from "@/lib/pro/types";
import { Drawer, FormField, inputClass } from "../../kit";

export function ResourceDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, spaceId, pending, can, update } = usePro();
  const toast = useToast();
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
      !(await update(
        previous ? "resource.save" : "resource.create",
        (draft) => ({
          ...draft,
          resources: previous
            ? draft.resources.map((row) => (row.id === id ? resource : row))
            : [...draft.resources, resource],
        }),
      ))
    )
      return;
    toast.success("Espacio guardado");
    reset();
  };
  const archive = async () => {
    if (
      !id ||
      !(await update("resource.archive", (draft) => ({
        ...draft,
        resources: draft.resources.filter((row) => row.id !== id),
      })))
    )
      return;
    toast.success("Espacio archivado");
    reset();
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title="Pistas y espacios"
      description="Prepara los espacios que se pueden reservar."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            variant="dark"
            onClick={save}
            disabled={
              pending ||
              !can(id ? "resource.save" : "resource.create") ||
              !name.trim() ||
              !Number.isSafeInteger(capacity) ||
              capacity < 1
            }
          >
            Guardar espacio
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {data.resources.map((resource) => (
            <Button
              key={resource.id}
              variant={id === resource.id ? "secondary" : "ghost"}
              onClick={() => select(resource)}
            >
              {resource.name}
            </Button>
          ))}
          <Button variant="secondary" onClick={reset}>
            Añadir espacio
          </Button>
        </div>
        <FormField label="Nombre" htmlFor="resource-name">
          <input
            id="resource-name"
            className={inputClass}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField label="Tipo" htmlFor="resource-kind">
          <select
            id="resource-kind"
            className={inputClass}
            value={kind}
            disabled={Boolean(id)}
            onChange={(event) => {
              const next = event.target.value as ProResource["kind"];
              setKind(next);
              setCapacity(1);
              setMode(next === "desk" ? "shared" : "exclusive");
            }}
          >
            <option value="court">Pista</option>
            <option value="room">Sala</option>
            <option value="desk">Zona de puestos</option>
          </select>
        </FormField>
        {kind === "desk" ? (
          <>
            <FormField label="Número de puestos" htmlFor="resource-capacity">
              <input
                id="resource-capacity"
                className={inputClass}
                type="number"
                min={1}
                max={500}
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
              />
            </FormField>
            <FormField label="Reservas" htmlFor="resource-mode">
              <select
                id="resource-mode"
                className={inputClass}
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as "shared" | "exclusive")
                }
              >
                <option value="shared">Cada persona reserva su puesto</option>
                <option value="exclusive">
                  Una reserva ocupa toda la zona
                </option>
              </select>
            </FormField>
          </>
        ) : (
          <p className="text-sm text-text-muted">
            Una reserva ocupa {kind === "court" ? "la pista" : "la sala"}{" "}
            completa.
          </p>
        )}
        <p className="text-sm text-text-muted">
          La duración, el precio y el número de personas se configuran en los
          servicios vinculados.{" "}
          <Link
            className="font-semibold text-violet"
            href={`/espacios/servicios?organization=${encodeURIComponent(spaceId)}`}
          >
            Gestionar servicios
          </Link>
        </p>
        {id ? (
          <Button
            variant="ghost"
            disabled={pending || !can("resource.archive")}
            onClick={archive}
          >
            Archivar este espacio
          </Button>
        ) : null}
      </div>
    </Drawer>
  );
}
