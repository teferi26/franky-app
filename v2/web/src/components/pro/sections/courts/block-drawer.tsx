"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProCourtBlock, ProCourtBlockReason } from "@/lib/pro/courts-types";
import { dayLabel, localDate, time } from "@/lib/pro/format";
import { hoursFor } from "@/lib/pro/courts";
import { BLOCK_REASON_LABEL, blocksOn, clockLabel } from "@/lib/pro/courts-base";
import { addBlock, blockConflicts, removeBlock } from "@/lib/pro/courts-ops";
import { cn } from "@/lib/utils";
import { ChoiceChips, Detail, Drawer, FormField, inputClass } from "../../kit";
import { TONES } from "../../tones";

/**
 * Bloquear una o varias pistas por mantenimiento, una clase, un torneo o un
 * evento privado. Antes de guardar enseña las reservas que pisaría.
 */

export type BlockTarget =
  | { mode: "new"; date: string; resourceId?: string; minute?: number }
  | { mode: "view"; date: string; blockId: string }
  | null;

export const BLOCK_STYLE: Record<ProCourtBlockReason, string> = {
  maintenance: "border-slate-400/70 bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
  class: "border-sky-400/70 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
  tournament: "border-violet/60 bg-violet-50 text-violet-deep dark:bg-violet-950/40",
  private: "border-amber-400/70 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
};

export function BlockDrawer({
  target,
  onClose,
}: {
  target: BlockTarget;
  onClose: () => void;
}) {
  const { data, update, vertical } = usePro();
  const toast = useToast();
  const coworking = vertical.id === "coworking";
  const [resourceIds, setResourceIds] = React.useState<string[]>([]);
  const [date, setDate] = React.useState("");
  const [from, setFrom] = React.useState(8 * 60);
  const [to, setTo] = React.useState(9 * 60 + 30);
  const [reason, setReason] = React.useState<ProCourtBlockReason>("maintenance");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!target || target.mode !== "new") return;
    const hours = hoursFor(data, target.date);
    const start = target.minute ?? hours?.open ?? 8 * 60;
    setResourceIds(target.resourceId ? [target.resourceId] : []);
    setDate(target.date);
    setFrom(start);
    setTo(Math.min(start + 90, hours?.close ?? start + 90));
    setReason("maintenance");
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  if (target.mode === "view") {
    const block = blocksOn(data, target.date).find((b) => b.id === target.blockId);
    if (!block) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
    const names = block.resourceIds
      .map((id) => data.resources.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    const remove = () => {
      update("court.block.remove", (d) => removeBlock(d, block.id));
      toast.success("Bloqueo quitado", `${names} vuelve a estar disponible para reservar.`);
      onClose();
    };
    return (
      <Drawer
        open
        onOpenChange={(v) => !v && onClose()}
        title={block.note ?? BLOCK_REASON_LABEL[block.reason]}
        description={`${names} · ${dayLabel(`${block.date}T12:00:00Z`)} · ${clockLabel(block.from)} a ${clockLabel(block.to)}`}
        footer={
          block.virtual ? (
            <Button variant="dark" onClick={onClose}>Entendido</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Cerrar</Button>
              <Button variant="outline" className="text-rose-600" onClick={remove}>Quitar bloqueo</Button>
            </>
          )
        }
      >
        <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
          <Detail label="Motivo">{BLOCK_REASON_LABEL[block.reason]}</Detail>
          <Detail label={coworking ? "Espacios" : "Pistas"}>{names}</Detail>
          <Detail label="Horario">
            {clockLabel(block.from)} a {clockLabel(block.to)}
          </Detail>
        </div>
        {block.virtual ? (
          <p className="mt-4 text-sm text-text-muted">
            Es un grupo de la escuela: ocupa esta pista cada semana del curso. Cambia su horario o su pista en Escuela.
          </p>
        ) : block.sourceId ? (
          <p className="mt-4 text-sm text-text-muted">
            Lo creó un torneo o la liga. Si lo quitas, la pista se puede volver a reservar a esa hora.
          </p>
        ) : null}
      </Drawer>
    );
  }

  const hours = hoursFor(data, date);
  const times: number[] = [];
  if (hours) for (let m = hours.open; m <= hours.close; m += 30) times.push(m);
  const conflicts =
    resourceIds.length && to > from
      ? blockConflicts(data, { resourceIds, date, from, to })
      : [];
  const valid = resourceIds.length > 0 && to > from && Boolean(hours);

  const save = () => {
    if (!valid) return;
    const block: ProCourtBlock = {
      id: localId("blk"),
      resourceIds,
      date,
      from,
      to,
      reason,
      note: note.trim() || undefined,
    };
    update("court.block.add", (d) => addBlock(d, block));
    toast.success(
      "Pista bloqueada",
      conflicts.length
        ? `Hay ${conflicts.length === 1 ? "una reserva" : `${conflicts.length} reservas`} a esa hora: muévelas desde el calendario.`
        : `${BLOCK_REASON_LABEL[reason]} de ${clockLabel(from)} a ${clockLabel(to)}. Nadie podrá reservar a esa hora.`,
    );
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={coworking ? "Bloquear un espacio" : "Bloquear pistas"}
      description="Mantenimiento, clases, torneos o eventos privados. No se podrá reservar a esa hora."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            Bloquear
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label={coworking ? "Espacios" : "Pistas"}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.resources.map((r) => {
              const on = resourceIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setResourceIds(on ? resourceIds.filter((x) => x !== r.id) : [...resourceIds, r.id])
                  }
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-colors",
                    on ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONES[r.tone].dot)} />
                  <span className="truncate">{r.name}</span>
                </button>
              );
            })}
          </div>
        </FormField>

        <FormField label="Motivo">
          <ChoiceChips
            value={reason}
            onChange={setReason}
            options={(Object.keys(BLOCK_REASON_LABEL) as ProCourtBlockReason[]).map((k) => ({
              value: k,
              label: BLOCK_REASON_LABEL[k],
            }))}
          />
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Día" htmlFor="blk-date" className="col-span-3 sm:col-span-1">
            <input
              id="blk-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Desde" htmlFor="blk-from">
            <select id="blk-from" value={from} onChange={(e) => setFrom(Number(e.target.value))} className={inputClass}>
              {times.slice(0, -1).map((m) => (
                <option key={m} value={m}>
                  {clockLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Hasta" htmlFor="blk-to">
            <select id="blk-to" value={to} onChange={(e) => setTo(Number(e.target.value))} className={inputClass}>
              {times
                .filter((m) => m > from)
                .map((m) => (
                  <option key={m} value={m}>
                    {clockLabel(m)}
                  </option>
                ))}
            </select>
          </FormField>
        </div>
        {!hours ? <p className="text-sm text-text-muted">Ese día está cerrado.</p> : null}

        <FormField label="Nota" htmlFor="blk-note" hint="La ve tu equipo en el calendario.">
          <input
            id="blk-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={reason === "maintenance" ? "Cambio de red, cepillado, focos..." : "Cumpleaños de Lucía, torneo de empresa..."}
            className={inputClass}
          />
        </FormField>

        {conflicts.length ? (
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.9} />
              {conflicts.length === 1 ? "Hay una reserva" : `Hay ${conflicts.length} reservas`} a esa hora
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {conflicts.map((b) => (
                <li key={b.id}>
                  {b.clientName}, {data.resources.find((r) => r.id === b.resourceId)?.name} a las {time(b.start)}
                  {localDate(b.start) !== date ? ` (${dayLabel(b.start)})` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">Se bloquea igual; después muévelas desde el calendario y avísales.</p>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
