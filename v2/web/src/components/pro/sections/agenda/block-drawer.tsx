"use client";

import * as React from "react";
import { CalendarOff, Lock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import type { ProAgendaBlock } from "@/lib/pro/agenda-types";
import {
  ABSENCE_REASONS,
  BLOCK_REASONS,
  addAbsence,
  addBlock,
  clashesWithBlock,
  removeBlock,
} from "@/lib/pro/agenda-ops";
import { openingIntervals } from "@/lib/pro/agenda";
import {
  addDays,
  dayLabel,
  durationLabel,
  minutesToLabel,
  time,
} from "@/lib/pro/format";
import {
  ChoiceChips,
  Drawer,
  FormField,
  Segmented,
  inputClass,
} from "../../kit";
import { Callout, OptionButton, serviceStaff, useAgenda } from "./parts";

export type BlockPreset = {
  date: string;
  staffId?: string;
  minute?: number;
  kind?: "block" | "absence";
} | null;

const DURATIONS = [15, 30, 60, 90, 120];

function weekdayName(date: string) {
  if (!date) return "semana";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", {
    weekday: "long",
  });
}

/**
 * Bloquear un tramo (descanso, formación, médico) o cerrar la columna de
 * alguien varios días (vacaciones, baja). Sin esto la reserva online vende
 * horas que no existen.
 */
export function BlockDrawer({
  preset,
  onClose,
}: {
  preset: BlockPreset;
  onClose: () => void;
}) {
  const { data, run, allowed } = useAgenda();
  const toast = useToast();
  const staff = serviceStaff(data);
  const [kind, setKind] = React.useState<"block" | "absence">("block");
  const [staffId, setStaffId] = React.useState("");
  const [date, setDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [from, setFrom] = React.useState(10 * 60);
  const [length, setLength] = React.useState<number | "rest">(60);
  const [reason, setReason] = React.useState(BLOCK_REASONS[0]);
  const [absenceReason, setAbsenceReason] = React.useState(ABSENCE_REASONS[0]);
  const [weekly, setWeekly] = React.useState(false);

  React.useEffect(() => {
    if (!preset) return;
    setKind(preset.kind ?? "block");
    setStaffId(preset.staffId ?? staff[0]?.id ?? "");
    setDate(preset.date);
    setToDate(addDays(preset.date, 6));
    setFrom(preset.minute ?? 10 * 60);
    setLength(60);
    setReason(BLOCK_REASONS[0]);
    setAbsenceReason(ABSENCE_REASONS[0]);
    setWeekly(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const close =
    openingIntervals(data, date, staffId).at(-1)?.close ?? from + 60;
  const to = length === "rest" ? Math.max(from + 15, close) : from + length;
  const clashes =
    kind === "block"
      ? clashesWithBlock(data, staffId, date, date, from, to)
      : clashesWithBlock(data, staffId, date, toDate);
  const person = data.staff.find((s) => s.id === staffId);
  const validAbsence = kind === "absence" && toDate >= date;

  const save = async () => {
    if (kind === "block") {
      const ok = await run("agenda.block", (d) =>
        addBlock(d, {
          id: localId("bl"),
          staffId,
          date,
          from,
          to,
          reason,
          weekly: weekly || undefined,
        }),
      );
      if (!ok) return;
      toast.success(
        "Tramo bloqueado",
        `${person?.name.split(" ")[0]} de ${minutesToLabel(from)} a ${minutesToLabel(to)}${weekly ? ", cada semana" : ""}`,
      );
    } else {
      const ok = await run("agenda.absence", (d) =>
        addAbsence(d, {
          id: localId("ab"),
          staffId,
          from: date,
          to: toDate,
          reason: absenceReason,
        }),
      );
      if (!ok) return;
      toast.success(
        `${absenceReason} apuntadas`,
        `La columna de ${person?.name.split(" ")[0]} queda cerrada esos días.`,
      );
    }
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      title={kind === "block" ? "Bloquear un tramo" : "Vacaciones o baja"}
      description="Nadie podrá reservar en ese tiempo, tampoco online."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            onClick={save}
            disabled={
              !staffId ||
              !date ||
              (kind === "block"
                ? !allowed("agenda.block")
                : !allowed("agenda.absence") || !validAbsence)
            }
          >
            {kind === "block" ? "Bloquear" : "Cerrar su agenda"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Segmented
          label="Tipo"
          value={kind}
          onChange={setKind}
          options={[
            { value: "block", label: "Unas horas" },
            { value: "absence", label: "Varios días" },
          ]}
        />
        <FormField label="Quién">
          <ChoiceChips
            value={staffId}
            onChange={setStaffId}
            options={staff.map((s) => ({
              value: s.id,
              label: s.name.split(" ")[0],
            }))}
          />
        </FormField>

        {kind === "block" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Día" htmlFor="bl-date">
                <input
                  id="bl-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Desde" htmlFor="bl-from">
                <select
                  id="bl-from"
                  value={from}
                  onChange={(e) => setFrom(Number(e.target.value))}
                  className={inputClass}
                >
                  {Array.from({ length: 64 }, (_, i) => 7 * 60 + i * 15).map(
                    (m) => (
                      <option key={m} value={m}>
                        {minutesToLabel(m)}
                      </option>
                    ),
                  )}
                </select>
              </FormField>
            </div>
            <FormField label="Cuánto">
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((m) => (
                  <OptionButton
                    key={m}
                    active={length === m}
                    onClick={() => setLength(m)}
                  >
                    {durationLabel(m)}
                  </OptionButton>
                ))}
                <OptionButton
                  active={length === "rest"}
                  onClick={() => setLength("rest")}
                >
                  Resto del día
                </OptionButton>
              </div>
            </FormField>
            <FormField label="Motivo">
              <div className="flex flex-wrap gap-2">
                {BLOCK_REASONS.map((r) => (
                  <OptionButton
                    key={r}
                    active={reason === r}
                    onClick={() => setReason(r)}
                  >
                    {r}
                  </OptionButton>
                ))}
              </div>
            </FormField>
            <label className="flex min-h-10 items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={weekly}
                onChange={(e) => setWeekly(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-violet)]"
              />
              Repetir cada {weekdayName(date)}
            </label>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Desde" htmlFor="ab-from">
                <input
                  id="ab-from"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Hasta" htmlFor="ab-to">
                <input
                  id="ab-to"
                  type="date"
                  value={toDate}
                  min={date}
                  onChange={(e) => setToDate(e.target.value)}
                  className={inputClass}
                />
              </FormField>
            </div>
            <FormField label="Motivo">
              <div className="flex flex-wrap gap-2">
                {ABSENCE_REASONS.map((r) => (
                  <OptionButton
                    key={r}
                    active={absenceReason === r}
                    onClick={() => setAbsenceReason(r)}
                  >
                    {r}
                  </OptionButton>
                ))}
              </div>
            </FormField>
          </>
        )}

        {clashes.length ? (
          <Callout
            tone="warning"
            icon={TriangleAlert}
            title={`${clashes.length} ${clashes.length === 1 ? "cita ya reservada" : "citas ya reservadas"} en ese tiempo`}
          >
            {clashes
              .slice(0, 4)
              .map(
                (b) =>
                  `${b.clientName} (${dayLabel(b.start)} ${time(b.start)})`,
              )
              .join(", ")}
            . Muévelas desde la agenda antes o después de bloquear.
          </Callout>
        ) : null}
      </div>
    </Drawer>
  );
}

/** Detalle de un bloqueo ya puesto, con la opción de quitarlo. */
export function BlockInfoDrawer({
  block,
  onClose,
}: {
  block: ProAgendaBlock | null;
  onClose: () => void;
}) {
  const { data, run, allowed } = useAgenda();
  const toast = useToast();
  const person = data.staff.find((s) => s.id === block?.staffId);
  return (
    <Drawer
      open={Boolean(block)}
      onOpenChange={(v) => !v && onClose()}
      title={block?.reason ?? "Bloqueo"}
      description={
        block
          ? `${person?.name.split(" ")[0]} · ${minutesToLabel(block.from)} a ${minutesToLabel(block.to)}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            variant="dark"
            disabled={!block || !allowed("agenda.block")}
            onClick={async () => {
              if (!block) return;
              if (await run("agenda.block", (d) => removeBlock(d, block.id))) {
                toast.success("Tramo liberado", "Ya se puede reservar.");
                onClose();
              }
            }}
          >
            Quitar bloqueo
          </Button>
        </>
      }
    >
      {block ? (
        <div className="flex items-start gap-3 rounded-2xl bg-bg-secondary p-4 text-sm text-text-secondary">
          {block.weekly ? (
            <CalendarOff
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={1.9}
            />
          ) : (
            <Lock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
          )}
          <p>
            {block.weekly
              ? `Se repite cada semana desde el ${dayLabel(`${block.date}T12:00:00Z`, { weekday: false })}. Al quitarlo se libera en todas las semanas.`
              : `Solo el ${dayLabel(`${block.date}T12:00:00Z`)}.`}
          </p>
        </div>
      ) : null}
    </Drawer>
  );
}
