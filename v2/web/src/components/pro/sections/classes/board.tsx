"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { HeartPulse, Maximize2, Plus, Timer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProClassSession } from "@/lib/pro/types";
import type { ProBoardBlock } from "@/lib/pro/classes-types";
import { time } from "@/lib/pro/format";
import { sessionRoster } from "@/lib/pro/classes";
import { careOf } from "@/lib/pro/classes-care";
import { BOARD_TEMPLATE, boardOf, saveBoard } from "@/lib/pro/classes-ops";
import { Empty, inputClass, textareaClass } from "../../kit";

/**
 * Pizarra del día: el coach escribe el entreno por bloques, el socio lo ve al
 * reservar y en la sala se proyecta a pantalla completa con la lista y un
 * cronómetro. Evita pagar otra aplicación solo para el WOD.
 */

export function BoardEditor({ session }: { session: ProClassSession }) {
  const { data, update } = usePro();
  const toast = useToast();
  const saved = boardOf(data, session.id);
  const [blocks, setBlocks] = React.useState<ProBoardBlock[]>(saved);
  const [same, setSame] = React.useState(true);
  const [projecting, setProjecting] = React.useState(false);
  const dirty = JSON.stringify(blocks) !== JSON.stringify(saved);

  React.useEffect(() => {
    setBlocks(boardOf(data, session.id));
    // Solo al cambiar de sesión: mientras se escribe no se pisa el borrador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const set = (id: string, changes: Partial<ProBoardBlock>) => setBlocks((list) => list.map((b) => (b.id === id ? { ...b, ...changes } : b)));

  const start = () => setBlocks(BOARD_TEMPLATE.map((b) => ({ id: localId("bb"), ...b })));

  const save = () => {
    void update("class.board", (d) => saveBoard(d, session.id, blocks, same));
    toast.success("Pizarra guardada", same ? "Se ve en todas las clases iguales de hoy y al reservar en Franky." : "Se ve al reservar en Franky.");
  };

  if (!blocks.length) {
    return (
      <Empty
        icon={Timer}
        title="La pizarra está vacía"
        body="Escribe el entreno por bloques. Tus socios lo ven antes de reservar y lo proyectas en la sala."
        action={
          <Button variant="outline" onClick={start}>
            <Plus className="h-4 w-4" /> Escribir el entreno
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b) => (
        <div key={b.id} className="rounded-2xl border border-border p-3">
          <div className="flex items-center gap-2">
            <input
              value={b.title}
              onChange={(e) => set(b.id, { title: e.target.value })}
              aria-label="Nombre del bloque"
              placeholder="Bloque"
              className={`${inputClass} h-9 font-semibold`}
            />
            <button
              type="button"
              onClick={() => setBlocks((list) => list.filter((x) => x.id !== b.id))}
              aria-label={`Quitar ${b.title || "bloque"}`}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-bg-secondary hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
          <textarea
            value={b.body}
            onChange={(e) => set(b.id, { body: e.target.value })}
            aria-label={`Contenido de ${b.title || "bloque"}`}
            placeholder="AMRAP 12 min: 10 thrusters, 10 dominadas..."
            className={`${textareaClass} mt-2`}
          />
        </div>
      ))}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setBlocks((l) => [...l, { id: localId("bb"), title: "", body: "" }])}>
        <Plus className="h-3.5 w-3.5" /> Añadir bloque
      </Button>
      <label className="flex min-h-10 items-center gap-2.5 text-sm">
        <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
        Usar la misma pizarra en todas las clases iguales de ese día
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="dark" onClick={save} disabled={!dirty}>
          {dirty ? "Guardar pizarra" : "Guardada"}
        </Button>
        <Button variant="outline" onClick={() => setProjecting(true)}>
          <Maximize2 className="h-4 w-4" /> Proyectar en la sala
        </Button>
      </div>
      {projecting ? <BoardScreen session={session} blocks={blocks} onClose={() => setProjecting(false)} /> : null}
    </div>
  );
}

/** Pantalla de sala: pizarra, quién ha venido y cronómetro. Se abre desde el móvil del coach. */
function BoardScreen({ session, blocks, onClose }: { session: ProClassSession; blocks: ProBoardBlock[]; onClose: () => void }) {
  const { data, now } = usePro();
  const ct = data.classTypes.find((c) => c.id === session.classTypeId);
  const { booked } = sessionRoster(data, session, now);
  const [running, setRunning] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    // Diálogo propio (anidado en el panel de la sesión): Radix lo lleva al body,
    // así que el `fixed` no se rompe, y Escape lo cierra.
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
      <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-0 z-[80] flex flex-col bg-bg-dark text-white focus:outline-none">
        <DialogPrimitive.Title className="sr-only">Pizarra en pantalla completa</DialogPrimitive.Title>
        <header className="flex items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">{data.space.name}</p>
            <p className="truncate font-heading text-2xl font-extrabold">
              {ct?.name} · {time(session.start)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRunning((r) => !r)}
              className="rounded-2xl border border-white/20 px-4 py-2 font-heading text-4xl font-extrabold tabular"
              aria-label={running ? "Parar cronómetro" : "Arrancar cronómetro"}
            >
              {mm}:{ss}
            </button>
            <button type="button" onClick={() => setElapsed(0)} className="h-10 rounded-xl px-3 text-sm text-white/70 hover:text-white">
              Reiniciar
            </button>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-6">
            {blocks.map((b) => (
              <section key={b.id}>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/60">{b.title}</p>
                <p className="mt-1 whitespace-pre-line font-heading text-3xl font-bold leading-snug sm:text-4xl">{b.body}</p>
              </section>
            ))}
          </div>
          <aside>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white/60">En la clase ({booked.length})</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {booked.map((b) => {
                const health = b.clientId ? careOf(data, b.clientId).health : undefined;
                return (
                  <li key={b.id} className="flex items-center gap-2 text-lg">
                    <span className={b.status === "arrived" ? "text-white" : "text-white/50"}>{b.clientName}</span>
                    {health ? <HeartPulse className="h-4 w-4 text-amber-300" aria-label="Tiene un aviso de salud" /> : null}
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
