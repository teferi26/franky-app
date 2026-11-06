"use client";

import * as React from "react";
import { BadgeCheck, BookOpenText, Check, ChevronDown, KeyRound, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import { dayLabel, localDate, shortDay } from "@/lib/pro/format";
import { communityOps, withCommunityOps } from "@/lib/pro/community";
import type { CommunityArchiveDoc, CommunityHandoverItem } from "@/lib/pro/community-types";
import {
  handoverPeople,
  handoverProgress,
  handoverStage,
  setHandoverOwner,
  startHandover,
  toggleHandoverItem,
} from "@/lib/pro/community-handover";
import { annualReportHtml, annualReportTag, courseYearNumbers } from "@/lib/pro/community-annual";
import { ratingLabel } from "@/lib/pro/community-feedback";
import { cn } from "@/lib/utils";
import { Meter, Panel, Pill, inputClass } from "../../kit";
import { openPrintable } from "./files";

/**
 * Dos piezas de la pantalla de Junta: la guía del relevo (lo que hay que
 * cambiar fuera de Franky, con quién lo hizo) y la memoria anual del curso.
 */

function fullDate(date: string) {
  return dayLabel(`${date.slice(0, 10)}T12:00:00Z`, { weekday: false });
}

/* ------------------------------------------------------------------ */
/* Guía del relevo                                                     */
/* ------------------------------------------------------------------ */

export function HandoverGuide() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const ops = communityOps(data);
  const stage = handoverStage(data, now);
  const handover = ops.handover;
  const progress = handoverProgress(handover);
  const people = handoverPeople(data);
  const me = data.space.owner.name;
  const [showDone, setShowDone] = React.useState(false);

  // Sin relevo a la vista ni guía guardada, la pantalla no enseña nada.
  if (stage === "idle" && !handover) return null;

  const until = data.board[0]?.until;
  const fresh = stage === "soon";

  const start = () => {
    update("community.handover.start", (d) =>
      withCommunityOps(d, (o) => startHandover(o, localDate(new Date()))),
    );
    toast.success("Guía del relevo en marcha", "Reparte cada paso y márcalo cuando esté hecho.");
  };

  const toggle = (item: CommunityHandoverItem) => {
    update("community.handover.toggle", (d) =>
      withCommunityOps(d, (o) => toggleHandoverItem(o, item.id, me, new Date().toISOString())),
    );
    if (!item.doneAt) toast.success(`${item.label}: hecho`, `Queda apuntado a nombre de ${item.owner || me}.`);
  };

  const assign = (item: CommunityHandoverItem, owner: string) =>
    update("community.handover.owner", (d) => withCommunityOps(d, (o) => setHandoverOwner(o, item.id, owner)));

  const items = handover?.items ?? [];
  const pending = items.filter((i) => !i.doneAt);
  const done = items.filter((i) => i.doneAt);

  return (
    <Panel
      title="Guía del relevo"
      description={
        fresh
          ? `${until ? `El mandato acaba el ${fullDate(until)}. ` : ""}Banco, registro, redes y llaves: repartid quién hace cada cosa.`
          : progress.complete
            ? `Relevo completo desde el ${fullDate(handover?.startedAt ?? localDate(now))}. Queda aquí para la próxima junta.`
            : `Empezado el ${fullDate(handover?.startedAt ?? localDate(now))}. Lo de dentro de Franky ya está; esto es lo de fuera.`
      }
      action={
        !fresh && progress.total ? (
          <Pill tone={progress.complete ? "success" : "warning"}>
            {progress.done} de {progress.total}
          </Pill>
        ) : null
      }
      flush
    >
      {fresh ? (
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <p className="text-sm text-text-secondary">
            Cada año se quedan cosas en el aire: la firma del banco a nombre de quien ya no está, la contraseña de
            Instagram en un móvil ajeno, las llaves del local. Con la guía, cada paso tiene responsable y fecha.
          </p>
          <Button variant="outline" className="self-start" onClick={start}>
            <KeyRound className="h-4 w-4" /> Empezar la guía del relevo
          </Button>
        </div>
      ) : (
        <>
          <div className="px-4 pt-4 sm:px-5">
            <Meter
              value={progress.done}
              max={Math.max(1, progress.total)}
              tone={progress.complete ? "success" : "violet"}
            />
          </div>
          <ul className="mt-2 divide-y divide-border-light">
            {pending.map((item) => (
              <HandoverRow key={item.id} item={item} people={people} onToggle={toggle} onAssign={assign} />
            ))}
            {showDone
              ? done.map((item) => (
                  <HandoverRow key={item.id} item={item} people={people} onToggle={toggle} onAssign={assign} />
                ))
              : null}
          </ul>
          {done.length ? (
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-border-light text-sm font-semibold text-text-secondary hover:text-text-primary"
            >
              {showDone ? "Ocultar lo hecho" : `Ver lo hecho (${done.length})`}
              <ChevronDown className={cn("h-4 w-4 transition-transform", showDone && "rotate-180")} />
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function HandoverRow({
  item,
  people,
  onToggle,
  onAssign,
}: {
  item: CommunityHandoverItem;
  people: string[];
  onToggle: (item: CommunityHandoverItem) => void;
  onAssign: (item: CommunityHandoverItem, owner: string) => void;
}) {
  const isDone = Boolean(item.doneAt);
  const options = item.owner && !people.includes(item.owner) ? [item.owner, ...people] : people;
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-pressed={isDone}
        aria-label={isDone ? `Desmarcar ${item.label}` : `Marcar ${item.label} como hecho`}
        className="-m-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full border",
            isDone ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
          )}
        >
          {isDone ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
      </button>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-semibold", isDone && "text-text-muted")}>{item.label}</span>
        <span className="block text-xs text-text-muted">{item.detail}</span>
        {isDone ? (
          <span className="mt-1 flex items-center gap-1 text-xs text-text-muted">
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.9} />
            {item.doneBy ?? "Hecho"} · {shortDay(item.doneAt ?? "")}
          </span>
        ) : null}
      </span>
      {!isDone ? (
        <select
          aria-label={`Quién se encarga de ${item.label}`}
          value={item.owner ?? ""}
          onChange={(e) => onAssign(item, e.target.value)}
          className={cn(inputClass, "h-10 w-auto max-w-[9.5rem] shrink-0 px-2.5 text-xs")}
        >
          <option value="">Sin encargar</option>
          {options.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Memoria anual del curso                                             */
/* ------------------------------------------------------------------ */

export function AnnualReportPanel() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const n = courseYearNumbers(data, now);
  const tag = annualReportTag(n.course);
  const prepared = communityOps(data)
    .documents.filter((d) => d.tag === tag)
    .sort((a, b) => b.at.localeCompare(a.at))[0];

  const prepare = () => {
    const html = annualReportHtml(data, now);
    const doc: CommunityArchiveDoc = {
      id: localId("d"),
      title: `Memoria del curso ${n.course.label}`,
      kind: "memoria",
      at: new Date().toISOString(),
      by: "Secretaría",
      html,
      tag,
    };
    update("community.annual.prepare", (d) =>
      withCommunityOps(d, (o) => ({
        ...o,
        // Solo se guarda la última versión de la memoria de cada curso.
        documents: [doc, ...o.documents.filter((x) => x.tag !== tag)],
      })),
    );
    const opened = openPrintable(html, doc.title);
    toast.success(
      "Memoria preparada",
      opened
        ? "Guárdala en PDF desde la ventana de impresión. Queda también en el archivo."
        : "Se ha descargado y queda también en el archivo.",
    );
  };

  return (
    <Panel
      title={`Memoria del curso ${n.course.label}`}
      description="Para la asamblea y para la junta que entra. Se escribe sola con lo que vais haciendo."
      action={
        prepared ? (
          <Pill tone="success">
            <Check className="h-3 w-3" /> Preparada
          </Pill>
        ) : null
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Figure value={n.activities.length} label="actividades hechas" />
        <Figure value={n.attendance.toLocaleString("es-ES")} label="asistencias con check-in" />
        <Figure value={n.rating.count ? ratingLabel(n.rating.avg) : "Sin notas"} label="nota media" />
      </div>
      <p className="mt-3 text-xs text-text-muted">
        Socios, actividades con su nota, horas para créditos, voluntariado, caja, patrocinadores, acuerdos y lo
        que queda abierto.
      </p>
      {prepared ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
          Preparada el {dayLabel(prepared.at, { weekday: false })}. Está en el archivo.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={prepare} disabled={!n.activities.length}>
          <BookOpenText className="h-4 w-4" /> {prepared ? "Volver a preparar" : "Preparar la memoria"}
        </Button>
        {prepared?.html ? (
          <Button variant="ghost" onClick={() => openPrintable(prepared.html ?? "", prepared.title)}>
            <Printer className="h-4 w-4" /> Abrir la última
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}

function Figure({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <p className="font-heading text-xl font-bold tabular">{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}
