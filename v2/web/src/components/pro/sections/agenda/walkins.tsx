"use client";

import * as React from "react";
import { Maximize2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import {
  addWalkin,
  serveWalkin,
  setWalkinStatus,
  walkinQueue,
  type WalkinTurn,
} from "@/lib/pro/agenda-ops";
import {
  atLocal,
  localDate,
  localMinutes,
  minutesToLabel,
} from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  FixedPortal,
  FormField,
  Panel,
  Pill,
  inputClass,
} from "../../kit";
import { staffFirst, useAgenda } from "./parts";

/**
 * Cola de sin cita para barberías: quien entra por la puerta se apunta, la
 * espera se calcula con la agenda real y, cuando le toca, pasa a ser una cita
 * en marcha. Tiene una pantalla grande para la tele o la tablet del local.
 */
export function WalkinPanel() {
  const { data, now, run, allowed, ops } = useAgenda();
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);
  const [screen, setScreen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  if (!ops) return null;
  const queue = walkinQueue(data, now);
  const services = data.services.filter(
    (s) => s.online && s.durationMin <= 45 && s.priceCents > 0,
  );

  const add = async () => {
    const service = serviceId || services[0]?.id;
    if (!name.trim() || !service) return;
    if (
      await run("agenda.walkin", (d) =>
        addWalkin(d, {
          id: localId("wk"),
          name: name.trim(),
          serviceId: service,
          arrivedAt: new Date().toISOString(),
          status: "waiting",
        }),
      )
    ) {
      toast.success(`${name.trim()} apuntado en la cola`);
      setName("");
      setAdding(false);
    }
  };

  const serve = async (turn: WalkinTurn) => {
    if (!turn.staffId) return;
    // Empieza ahora, redondeado al minuto.
    const start = atLocal(localDate(now), localMinutes(now));
    if (
      await run("agenda.walkin", (d) =>
        serveWalkin(d, turn.entry.id, {
          bookingId: localId("b"),
          staffId: turn.staffId!,
          start,
        }),
      )
    )
      toast.success(
        `${turn.entry.name} pasa con ${staffFirst(data, turn.staffId)}`,
      );
  };

  return (
    <Panel
      title="Sin cita"
      description={
        queue.length
          ? `${queue.length} ${queue.length === 1 ? "persona espera" : "personas esperan"} turno.`
          : "Apunta a quien entra sin cita y te decimos cuánto esperará."
      }
      action={
        <div className="flex gap-1.5">
          {queue.length ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-10"
              onClick={() => setScreen(true)}
            >
              <Maximize2 className="h-4 w-4" /> Pantalla
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-10"
            disabled={!allowed("agenda.walkin")}
            onClick={() => setAdding((v) => !v)}
          >
            <UserPlus className="h-4 w-4" /> Apuntar
          </Button>
        </div>
      }
      flush
    >
      {adding ? (
        <div className="flex flex-col gap-3 border-b border-border-light p-4 sm:px-5">
          <FormField label="Nombre" htmlFor="wk-name">
            <input
              id="wk-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
              placeholder="Cómo le llamamos"
              className={inputClass}
            />
          </FormField>
          <ChoiceChips
            value={serviceId || services[0]?.id || ""}
            onChange={setServiceId}
            options={services.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Button
            variant="dark"
            disabled={!name.trim() || !allowed("agenda.walkin")}
            onClick={add}
          >
            Apuntar en la cola
          </Button>
        </div>
      ) : null}
      {queue.length ? (
        <ol className="divide-y divide-border-light">
          {queue.map((turn, i) => (
            <li
              key={turn.entry.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5"
            >
              <span className="w-6 shrink-0 font-heading text-lg font-extrabold tabular text-text-muted">
                {i + 1}
              </span>
              <span className="min-w-[10rem] flex-1">
                <span className="block truncate text-sm font-semibold">
                  {turn.entry.name}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {
                    data.services.find((s) => s.id === turn.entry.serviceId)
                      ?.name
                  }
                  {" · "}
                  {waitText(turn, data)}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-10"
                disabled={!allowed("agenda.walkin")}
                onClick={() =>
                  void run("agenda.walkin", (d) =>
                    setWalkinStatus(d, turn.entry.id, "left"),
                  )
                }
              >
                Se fue
              </Button>
              <Button
                size="sm"
                variant={turn.waitMin === 0 ? "dark" : "outline"}
                className="h-10"
                disabled={!turn.staffId || !allowed("agenda.walkin")}
                onClick={() => serve(turn)}
              >
                Le toca
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
      {screen ? (
        <WalkinScreen queue={queue} onClose={() => setScreen(false)} />
      ) : null}
    </Panel>
  );
}

function waitText(
  turn: WalkinTurn,
  data: ReturnType<typeof useAgenda>["data"],
): string {
  if (turn.startMinute === null) return "sin hueco hoy";
  if (!turn.waitMin)
    return `ya con ${staffFirst(data, turn.staffId ?? undefined)}`;
  return `unos ${roundWait(turn.waitMin)} min, con ${staffFirst(data, turn.staffId ?? undefined)} a las ${minutesToLabel(turn.startMinute)}`;
}

/** La espera se enseña en tramos de 5 minutos: nadie espera "13 minutos". */
function roundWait(minutes: number) {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

/** Pantalla completa para la tele o la tablet del local. */
function WalkinScreen({
  queue,
  onClose,
}: {
  queue: WalkinTurn[];
  onClose: () => void;
}) {
  const { data } = useAgenda();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <FixedPortal>
      <div
        role="dialog"
        aria-label="Turnos sin cita"
        className="fixed inset-0 z-[70] flex flex-col bg-bg-primary px-6 py-8 sm:px-12"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{data.space.name}</p>
            <h2 className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] sm:text-6xl">
              Turnos sin cita
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar pantalla"
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border text-text-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-10 flex flex-col gap-4 overflow-y-auto">
          {queue.map((turn, i) => (
            <li
              key={turn.entry.id}
              className={cn(
                "flex items-center gap-6 rounded-3xl border px-6 py-5",
                i === 0 ? "border-text-primary" : "border-border",
              )}
            >
              <span className="w-12 font-heading text-4xl font-extrabold tabular text-text-muted">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-heading text-3xl font-bold sm:text-5xl">
                {publicName(turn.entry.name)}
              </span>
              <span className="text-right">
                {turn.startMinute === null ? (
                  <Pill>Te avisamos</Pill>
                ) : !turn.waitMin ? (
                  <span className="font-heading text-2xl font-bold text-violet sm:text-4xl">
                    Pasa ya
                  </span>
                ) : (
                  <span className="font-heading text-2xl font-bold tabular sm:text-4xl">
                    {roundWait(turn.waitMin)} min
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </FixedPortal>
  );
}

/** En la pantalla del local solo se ve el nombre y la inicial del apellido. */
function publicName(name: string) {
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
}
