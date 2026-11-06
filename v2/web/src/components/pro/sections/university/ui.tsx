"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, EyeOff, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import { time } from "@/lib/pro/format";
import { PRIVACY_MIN_GROUP, URGENT_KIND_LABEL, activeUrgent, endUrgent, uniExtrasOf } from "@/lib/pro/university";
import type { UniPublication } from "@/lib/pro/university-types";
import { Pill } from "../../kit";
import { sectionHref } from "../../shell";

/**
 * Guarda un cambio y avisa. En un espacio real sin estas tablas `update`
 * devuelve false: entonces no se felicita a nadie, se dice que no se guardó.
 */
export function useUniAction() {
  const { update } = usePro();
  const toast = useToast();
  return React.useCallback(
    async (label: string, fn: (d: ProData) => ProData, title: string, detail?: string) => {
      const ok = await update(label, fn);
      if (ok) toast.success(title, detail);
      else toast.error("No se ha podido guardar", "Vuelve a intentarlo en un momento.");
      return ok;
    },
    [toast, update],
  );
}

/** Facultades del campus que conoce el espacio, para elegir sin escribir. */
export function facultyOptions(data: ProData): string[] {
  const extras = uniExtrasOf(data);
  const known = [...extras.faculties.map((f) => f.faculty), ...Object.keys(extras.audiences.faculties)];
  return [...new Set(known)].sort((a, b) => a.localeCompare(b, "es"));
}

/** Descarga un CSV con BOM para que Excel respete las tildes. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fila con interruptor: toda la fila se puede tocar (más de 40 px de alto). */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  id,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        {hint ? <span className="block text-xs text-text-muted">{hint}</span> : null}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function OfficialBadge() {
  return (
    <Pill tone="violet">
      <BadgeCheck className="h-3 w-3" /> Oficial
    </Pill>
  );
}

export function HiddenGroup({ className }: { className?: string }) {
  return (
    <span className={className ?? "inline-flex items-center gap-1.5 text-xs text-text-muted"}>
      <EyeOff className="h-3.5 w-3.5" /> Menos de {PRIVACY_MIN_GROUP} personas, oculto
    </span>
  );
}

/**
 * Aviso urgente vigente, fijado arriba de Hoy y de Publicaciones con su botón
 * "Ya no aplica". Mientras está activo, los estudiantes lo ven arriba del campus.
 */
export function UrgentBanner() {
  const { data, now, spaceId } = usePro();
  const run = useUniAction();
  const urgent = activeUrgent(data.uniPublications as UniPublication[], now);
  if (!urgent?.urgent) return null;

  const end = () =>
    run(
      "publication.urgent.end",
      (d) => ({
        ...d,
        uniPublications: (d.uniPublications as UniPublication[]).map((p) => (p.id === urgent.id ? endUrgent(p, now) : p)),
      }),
      "Aviso retirado de arriba",
      "Sigue en el muro como publicación normal.",
    );

  return (
    <section
      role="status"
      className="flex flex-col gap-3 rounded-2xl border border-rose-500/30 bg-rose-50 px-4 py-3.5 text-rose-900 dark:bg-rose-950/30 dark:text-rose-100 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
    >
      <Siren className="hidden h-5 w-5 shrink-0 sm:block" strokeWidth={1.9} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] opacity-80">
          {URGENT_KIND_LABEL[urgent.urgent.kind]} · fijado arriba hasta las {time(urgent.urgent.until)}
        </p>
        <Link href={`${sectionHref(spaceId, "publicaciones")}?ver=${urgent.id}`} className="mt-0.5 block font-heading text-base font-bold leading-snug hover:underline">
          {urgent.title}
        </Link>
      </div>
      <Button variant="outline" onClick={end} className="shrink-0 border-rose-500/40 bg-bg-primary">
        Ya no aplica
      </Button>
    </section>
  );
}
