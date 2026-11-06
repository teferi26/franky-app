"use client";

import * as React from "react";
import { Medal, MessageCircle, Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProPersonalRecord } from "@/lib/pro/classes-types";
import { dayLabel, localDate } from "@/lib/pro/format";
import {
  COMMON_LIFTS,
  addRecord,
  cheerMessage,
  cheerRecord,
  formatRecord,
  isPersonalBest,
  memberBests,
  parseRecordValue,
  recordsOf,
  recordsToCheer,
} from "@/lib/pro/classes-play";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Panel,
  Pill,
  SearchInput,
  inputClass,
} from "../../kit";

/**
 * Marcas personales: el socio (o su coach) apunta su 1RM o su tiempo en un
 * benchmark, se ve su progreso y el coach le felicita cuando bate una.
 */

const UNIT_LABEL: Record<ProPersonalRecord["unit"], string> = {
  kg: "Kilos",
  s: "Tiempo",
  reps: "Repeticiones",
};

/** Marcas de un socio, para su ficha. */
export function MemberRecords({ memberId }: { memberId: string }) {
  const { data } = usePro();
  const [adding, setAdding] = React.useState(false);
  const bests = memberBests(data, memberId);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.82rem] font-semibold">Marcas personales</h3>
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Apuntar
        </Button>
      </div>
      {bests.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {bests.map((b) => (
            <li key={b.lift} className="rounded-xl bg-bg-secondary px-3 py-2.5">
              <p className="truncate text-xs text-text-muted">{b.lift}</p>
              <p className="font-heading text-lg font-extrabold tabular">
                {formatRecord(b.best.value, b.best.unit)}
              </p>
              <p className="truncate text-xs text-text-muted">
                {b.previous ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                    <TrendingUp className="h-3 w-3" /> antes{" "}
                    {formatRecord(b.previous.value, b.previous.unit)}
                  </span>
                ) : (
                  dayLabel(`${b.best.on}T12:00:00Z`, { weekday: false })
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-bg-secondary px-3 py-2.5 text-sm text-text-muted">
          Sin marcas todavía. Apunta su primer 1RM o su tiempo en un benchmark y verás cómo mejora.
        </p>
      )}
      <RecordDrawer open={adding} memberId={memberId} onClose={() => setAdding(false)} />
    </section>
  );
}

/** Apuntar una marca: socio, movimiento y valor. */
export function RecordDrawer({
  open,
  memberId,
  onClose,
}: {
  open: boolean;
  memberId?: string;
  onClose: () => void;
}) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [who, setWho] = React.useState(memberId ?? "");
  const [query, setQuery] = React.useState("");
  const [lift, setLift] = React.useState(COMMON_LIFTS[0].lift);
  const [custom, setCustom] = React.useState("");
  const [unit, setUnit] = React.useState<ProPersonalRecord["unit"]>("kg");
  const [value, setValue] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setWho(memberId ?? "");
    setQuery("");
    setValue("");
    setCustom("");
  }, [open, memberId]);

  const chosen = COMMON_LIFTS.find((l) => l.lift === lift);
  const finalUnit = chosen ? chosen.unit : unit;
  const parsed = parseRecordValue(value, finalUnit);
  const name = (chosen ? lift : custom).trim();
  const q = query.trim().toLowerCase();
  const candidates = data.members
    .filter((m) => m.status !== "cancelled")
    .filter((m) => !q || m.name.toLowerCase().includes(q))
    .slice(0, 8);

  const save = () => {
    if (!who || !name || parsed === null) return;
    const rec = {
      id: localId("pr"),
      memberId: who,
      lift: name,
      unit: finalUnit,
      value: parsed,
      on: localDate(now),
    };
    void update("member.record", (d) => addRecord(d, rec));
    const withRec = addRecord(data, rec);
    const best = isPersonalBest(withRec, { ...rec });
    toast.success(
      best ? "Marca nueva" : "Marca apuntada",
      best ? "Aparece en Hoy para felicitarle." : undefined,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Apuntar marca"
      description="1RM, tiempo en un benchmark o repeticiones seguidas."
      footer={
        <Button variant="dark" onClick={save} disabled={!who || !name || parsed === null}>
          Guardar marca
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {!memberId ? (
          <FormField label="Socio">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre" />
            <div className="mt-2 flex flex-wrap gap-2">
              {candidates.map((m) => (
                <Button
                  key={m.id}
                  size="sm"
                  variant={who === m.id ? "dark" : "outline"}
                  onClick={() => setWho(m.id)}
                >
                  {m.name}
                </Button>
              ))}
            </div>
          </FormField>
        ) : null}
        <FormField label="Movimiento o benchmark">
          <ChoiceChips
            value={lift}
            onChange={setLift}
            options={[
              ...COMMON_LIFTS.map((l) => ({ value: l.lift, label: l.lift })),
              { value: "__other", label: "Otro" },
            ]}
          />
        </FormField>
        {!chosen ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <FormField label="Nombre" htmlFor="rec-name">
              <input
                id="rec-name"
                className={inputClass}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Murph, 1 km..."
              />
            </FormField>
            <FormField label="Se mide en">
              <ChoiceChips
                value={unit}
                onChange={setUnit}
                options={(Object.keys(UNIT_LABEL) as ProPersonalRecord["unit"][]).map((u) => ({
                  value: u,
                  label: UNIT_LABEL[u],
                }))}
              />
            </FormField>
          </div>
        ) : null}
        <FormField
          label={
            finalUnit === "s"
              ? "Tiempo (minutos:segundos)"
              : finalUnit === "kg"
                ? "Kilos"
                : "Repeticiones"
          }
          htmlFor="rec-value"
          hint={value && parsed === null ? "No lo entendemos. Ejemplo: 3:25 o 102,5." : undefined}
        >
          <input
            id="rec-value"
            className={inputClass}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode={finalUnit === "s" ? "text" : "decimal"}
            placeholder={finalUnit === "s" ? "3:25" : finalUnit === "kg" ? "102,5" : "21"}
            aria-invalid={Boolean(value && parsed === null)}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

/** Marcas batidas esta semana que el coach todavía no ha celebrado. */
export function CheerList({ compact }: { compact?: boolean }) {
  const { data, now, update } = usePro();
  const list = recordsToCheer(data, now);
  if (compact && !list.length) return null;
  const sender = data.space.owner.firstName || data.space.name;

  return (
    <Panel
      title="Marcas para felicitar"
      description={
        list.length
          ? "Un mensaje del coach cuando alguien mejora vale más que cualquier descuento."
          : undefined
      }
      flush
    >
      {list.length ? (
        <ul className="divide-y divide-border-light">
          {list.slice(0, compact ? 4 : 20).map(({ record, member }) => {
            const previous = recordsOf(data)
              .filter(
                (r) =>
                  r.memberId === member.id &&
                  r.lift === record.lift &&
                  r.unit === record.unit &&
                  r.id !== record.id &&
                  r.on <= record.on,
              )
              .sort((a, b) => b.on.localeCompare(a.on))[0];
            const link = customerWhatsApp(
              member.phone,
              cheerMessage(member, record, previous, sender, data.space.name),
            );
            const cheer = () => void update("member.cheer", (d) => cheerRecord(d, record.id, now));
            return (
              <li key={record.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <Avatar name={member.name} size="sm" tone="amber" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{member.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {record.lift}: {formatRecord(record.value, record.unit)}
                    {previous ? ` (antes ${formatRecord(previous.value, previous.unit)})` : ""}
                  </span>
                </span>
                {link ? (
                  <Button size="sm" variant="secondary" asChild>
                    <a href={link} target="_blank" rel="noreferrer" onClick={cheer}>
                      <MessageCircle className="h-3.5 w-3.5" /> Felicitar
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={cheer}>
                    Felicitado
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          icon={Medal}
          title="Nadie ha batido marca esta semana"
          body="Cuando apuntes una marca mejor que la anterior, aparecerá aquí para felicitarle."
        />
      )}
    </Panel>
  );
}

/** Mejores de cada movimiento en el centro: una tabla para la pizarra. */
export function RecordBoard() {
  const { data } = usePro();
  const lifts = [...new Set(recordsOf(data).map((r) => r.lift))];
  const [lift, setLift] = React.useState(lifts[0] ?? "");
  const current = lift || lifts[0] || "";
  const bestByMember = new Map<string, ProPersonalRecord>();
  for (const r of recordsOf(data)) {
    if (r.lift !== current) continue;
    const prev = bestByMember.get(r.memberId);
    if (!prev || (r.unit === "s" ? r.value < prev.value : r.value > prev.value))
      bestByMember.set(r.memberId, r);
  }
  const rows = [...bestByMember.values()]
    .sort((a, b) => (a.unit === "s" ? a.value - b.value : b.value - a.value))
    .slice(0, 10);
  if (!lifts.length) return null;
  return (
    <Panel
      title="Las mejores del centro"
      description="Solo las que habéis apuntado. Buen material para la pizarra."
      flush
    >
      <div className="border-b border-border-light px-4 py-3 sm:px-5">
        <ChoiceChips
          value={current}
          onChange={setLift}
          options={lifts.map((l) => ({ value: l, label: l }))}
        />
      </div>
      <ol className="divide-y divide-border-light">
        {rows.map((r, i) => {
          const member = data.members.find((m) => m.id === r.memberId);
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="w-6 shrink-0 font-heading font-bold tabular text-text-muted">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {member?.name ?? "Socio"}
              </span>
              {i === 0 ? <Pill tone="warning">Récord</Pill> : null}
              <span className="w-20 shrink-0 text-right font-heading font-bold tabular">
                {formatRecord(r.value, r.unit)}
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
