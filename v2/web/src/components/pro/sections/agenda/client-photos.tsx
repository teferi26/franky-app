"use client";

import * as React from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import type { ProClientPhoto } from "@/lib/pro/agenda-types";
import {
  PHOTOS_PER_CLIENT,
  addPhoto,
  canTakePhotos,
  photoPairs,
  removePhoto,
  setShowcase,
  type PhotoPair,
} from "@/lib/pro/agenda-clients";
import { dayLabel, localDate } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import { useAgenda } from "./parts";

/** Lado mayor de la foto guardada: se ve bien en la ficha y pesa poco. */
const PHOTO_MAX_PX = 720;

/**
 * Reduce la foto del móvil a un JPEG ligero. Pasar por un canvas también
 * quita los datos de ubicación de la cámara.
 */
export async function shrinkImage(
  file: File,
  max = PHOTO_MAX_PX,
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("unreadable"));
      element.src = url;
    });
    const scale = Math.min(
      1,
      max / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("unreadable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Antes y después dentro de la ficha. Solo se guardan con el permiso de
 * fotos activado, y solo salen en el escaparate las que se marcan.
 */
export function ClientPhotos({ clientId }: { clientId: string }) {
  const { data, now, run, allowed } = useAgenda();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return null;

  const granted = canTakePhotos(client);
  const pairs = photoPairs(client);
  const total = client.agenda?.photos?.length ?? 0;
  const inShowcase = (client.agenda?.photos ?? []).filter(
    (p) => p.showcase,
  ).length;
  const canEdit = allowed("agenda.photo") && !busy;

  // El servicio de hoy, si tiene cita: así la foto queda con su tratamiento.
  const today = localDate(now);
  const todayBooking = data.bookings.find(
    (b) =>
      b.clientId === client.id &&
      b.status !== "cancelled" &&
      localDate(b.start) === today,
  );

  const upload = async (kind: ProClientPhoto["kind"], file: File) => {
    setBusy(true);
    try {
      const src = await shrinkImage(file);
      const ok = await run("agenda.photo", (d) =>
        addPhoto(d, client.id, {
          id: localId("ph"),
          at: new Date().toISOString(),
          kind,
          src,
          serviceId: todayBooking?.serviceId,
        }),
      );
      if (ok)
        toast.success(
          kind === "before" ? "Foto de antes guardada" : "Foto de después guardada",
          total + 1 > PHOTOS_PER_CLIENT
            ? `Guardamos las ${PHOTOS_PER_CLIENT} más recientes.`
            : undefined,
        );
    } catch {
      toast.error(
        "No hemos podido leer esa foto",
        "Prueba con otra o hazla de nuevo con la cámara.",
      );
    } finally {
      setBusy(false);
    }
  };

  const togglePair = (pair: PhotoPair, on: boolean) =>
    run("agenda.photo", (d) =>
      [pair.before, pair.after]
        .filter((p): p is ProClientPhoto => Boolean(p))
        .reduce((acc, photo) => setShowcase(acc, client.id, photo.id, on), d),
    );

  const dropPair = async (pair: PhotoPair) => {
    const ok = await run("agenda.photo", (d) =>
      [pair.before, pair.after]
        .filter((p): p is ProClientPhoto => Boolean(p))
        .reduce((acc, photo) => removePhoto(acc, client.id, photo.id), d),
    );
    if (ok) toast.success("Fotos quitadas de la ficha");
  };

  return (
    <section className="rounded-2xl border border-border p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <Camera className="h-3.5 w-3.5" strokeWidth={1.9} /> Antes y después
        </p>
        {inShowcase ? (
          <span className="text-xs text-text-muted">
            {inShowcase} en tu escaparate
          </span>
        ) : null}
      </div>

      {!granted ? (
        <p className="text-sm text-text-muted">
          Activa su permiso de fotos en Permisos y podrás guardar aquí el antes
          y el después de cada visita.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <PhotoInput
              label="Foto de antes"
              disabled={!canEdit}
              onFile={(file) => upload("before", file)}
            />
            <PhotoInput
              label="Foto de después"
              disabled={!canEdit}
              onFile={(file) => upload("after", file)}
            />
          </div>

          {pairs.length ? (
            <ul className="flex flex-col gap-4">
              {pairs.map((pair) => {
                const service = data.services.find(
                  (s) => s.id === pair.serviceId,
                );
                const showcase = Boolean(
                  pair.after?.showcase || pair.before?.showcase,
                );
                return (
                  <li key={pair.date} className="flex flex-col gap-2">
                    <p className="text-xs text-text-muted">
                      {dayLabel(`${pair.date}T12:00:00Z`, { weekday: false })}
                      {service ? ` · ${service.name}` : ""}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <PhotoFrame photo={pair.before} label="Antes" />
                      <PhotoFrame photo={pair.after} label="Después" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex min-h-10 flex-1 items-center gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={showcase}
                          disabled={!canEdit}
                          onChange={(e) => void togglePair(pair, e.target.checked)}
                          className="h-4 w-4 accent-[var(--color-violet)]"
                        />
                        Puede salir en tu escaparate
                      </label>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => void dropPair(pair)}
                        aria-label="Quitar estas fotos"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.9} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">
              Haz la foto de antes al sentarse y la de después al terminar.
              Aquí las verás lado a lado.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function PhotoInput({
  label,
  disabled,
  onFile,
}: {
  label: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold text-text-secondary transition-colors hover:border-text-primary/25",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <ImagePlus className="h-4 w-4" strokeWidth={1.9} /> {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Se limpia para poder elegir la misma foto otra vez.
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

function PhotoFrame({
  photo,
  label,
}: {
  photo?: ProClientPhoto;
  label: string;
}) {
  return (
    <figure className="relative aspect-[3/4] overflow-hidden rounded-xl bg-bg-secondary">
      {photo ? (
        // Las fotos se guardan como data URL reducida: no pasan por next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.src}
          alt={label}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full items-center justify-center text-xs text-text-muted">
          Sin foto de {label.toLowerCase()}
        </span>
      )}
      <figcaption className="absolute left-2 top-2 rounded-md bg-bg-primary/90 px-1.5 py-0.5 text-[0.68rem] font-semibold">
        {label}
      </figcaption>
    </figure>
  );
}
