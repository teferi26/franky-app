"use client";

import * as React from "react";
import { BadgeCheck, DoorOpen, Plus, ScrollText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProClassType } from "@/lib/pro/types";
import type { ProBookingPolicy, ProPlayerPrice } from "@/lib/pro/classes-types";
import { money, plural } from "@/lib/pro/format";
import { PERIOD_LABEL, isRoomMode, priceForPlayers } from "@/lib/pro/classes";
import { extrasOf, withExtras } from "@/lib/pro/classes-care";
import { patchTypeExtra, policyLines, typeExtra } from "@/lib/pro/classes-ops";
import { cn } from "@/lib/utils";
import { ChoiceChips, Empty, FormField, PageHeader, Panel, Pill, Segmented, Tip, inputClass } from "../../kit";
import { TONES } from "../../tones";
import { PlanDrawer } from "./plan-drawer";
import { Stepper } from "./ui";
import { GameMastersView, SeatMaterialEditor } from "./leisure";

/**
 * Ocio (escape room, talleres): caja del día, packs con precio de estudiante,
 * la tabla de precio por jugadores y el montaje de cada sala, y las normas de
 * reserva que Franky aplica al cancelar.
 */

// La caja del día tiene su propia sección (Caja) desde la segunda ola.
type View = "packs" | "rooms" | "team" | "rules";

export function CulturePacks() {
  const { data, vertical } = usePro();
  const [view, setView] = React.useState<View>("packs");
  const [planOpen, setPlanOpen] = React.useState<string | null>(null);
  const label = vertical.nav.find((n) => n.id === "socios")?.label ?? "Packs y caja";
  const rooms = data.classTypes.filter((c) => isRoomMode(data, c));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={label}
        title="Packs, salas y normas"
        description={`${plural(data.plans.length, "pack", "packs")} a la venta y ${plural(rooms.length, "sala", "salas")} con precio por jugadores. La caja del día está en Caja.`}
        actions={
          <Button variant="dark" onClick={() => setPlanOpen("new")}>
            <Plus className="h-4 w-4" /> Nuevo pack
          </Button>
        }
      />

      <Segmented
        label="Vista"
        value={view}
        onChange={setView}
        options={[
          { value: "packs", label: "Packs", count: data.plans.length },
          { value: "rooms", label: "Salas y precios", count: rooms.length },
          { value: "team", label: "Game masters" },
          { value: "rules", label: "Normas" },
        ]}
      />

      {view === "packs" ? <PacksGrid onOpen={setPlanOpen} /> : null}
      {view === "rooms" ? <RoomsSetup /> : null}
      {view === "team" ? <GameMastersView /> : null}
      {view === "rules" ? <RulesPanel /> : null}

      <PlanDrawer planId={planOpen} onClose={() => setPlanOpen(null)} />
    </div>
  );
}

function PacksGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const { data } = usePro();
  if (!data.plans.length) {
    return (
      <Panel>
        <Empty
          icon={Wallet}
          title="Aún no tienes packs"
          body="Crea la sala para el grupo, el pack cumpleaños, el taller suelto o el bono de 4 talleres, con su precio de estudiante."
          action={
            <Button variant="dark" onClick={() => onOpen("new")}>
              <Plus className="h-4 w-4" /> Crear pack
            </Button>
          }
        />
      </Panel>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.plans.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="flex flex-col rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-[border-color,transform] hover:-translate-y-px hover:border-text-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
          >
            <span className="text-sm font-semibold">{p.name}</span>
            <span className="mt-2 flex items-baseline gap-1.5">
              <span className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{money(p.priceCents)}</span>
              <span className="text-sm text-text-muted">{p.sessions && p.sessions > 1 ? `${p.sessions} sesiones` : PERIOD_LABEL[p.period]}</span>
            </span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              {p.studentPriceCents && p.studentPriceCents !== p.priceCents ? (
                <Pill tone="violet">
                  <BadgeCheck className="h-3 w-3" /> Estudiante {money(p.studentPriceCents)}
                </Pill>
              ) : null}
            </span>
            <span className="mt-4 text-xs text-text-muted tabular">{plural(p.members, "vendido este curso", "vendidos este curso")}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onOpen("new")}
          className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-semibold text-text-secondary transition-colors hover:border-violet/50 hover:text-violet"
        >
          <Plus className="h-5 w-5" /> Crear pack
        </button>
      </div>
      <Tip title="Precio estudiante">Un precio de estudiante solo de lunes a jueves antes de las 19:00 llena las tardes flojas sin rebajar tus sábados.</Tip>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Salas: modo sala, jugadores, precio por tramo y montaje             */
/* ------------------------------------------------------------------ */

function RoomsSetup() {
  const { data } = usePro();
  const types = data.classTypes;
  if (!types.length) {
    return (
      <Panel>
        <Empty icon={DoorOpen} title="Aún no tienes salas ni talleres" body="Crea tus sesiones en el horario y aquí configuras cómo se venden." />
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {types.map((ct) => (
        <RoomCard key={ct.id} ct={ct} />
      ))}
    </div>
  );
}

const DEFAULT_TABLE: ProPlayerPrice[] = [2, 3, 4, 5, 6].map((players) => ({ players, priceCents: players * 1400 }));

function RoomCard({ ct }: { ct: ProClassType }) {
  const { data, update } = usePro();
  const toast = useToast();
  const extra = typeExtra(data, ct.id);
  const room = isRoomMode(data, ct);
  const [table, setTable] = React.useState<ProPlayerPrice[]>(extra.playerPrices ?? DEFAULT_TABLE);
  const [setup, setSetup] = React.useState(extra.setupMin ?? 0);
  const [min, setMin] = React.useState(extra.roomMode?.minPlayers ?? 2);
  const [max, setMax] = React.useState(extra.roomMode?.maxPlayers ?? Math.min(ct.capacity, 6));
  const tone = TONES[ct.tone];

  const setMode = (value: "room" | "seat") => {
    void update("room.mode", (d) =>
      patchTypeExtra(d, ct.id, value === "room" ? { roomMode: { minPlayers: min, maxPlayers: max } } : { roomMode: undefined }),
    );
    toast.success(value === "room" ? "Se vende como sala" : "Se vende por plaza", value === "room" ? `${ct.name} se reserva entera para un grupo.` : `${ct.name} se reserva plaza a plaza.`);
  };

  const cents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;
  const setRow = (players: number, key: "priceCents" | "studentPriceCents", value: string) =>
    setTable((rows) => rows.map((r) => (r.players === players ? { ...r, [key]: cents(value) || undefined } : r)) as ProPlayerPrice[]);

  // La tabla sigue al rango de jugadores: se añaden o quitan filas al cambiarlo.
  const rows = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i).map(
    (n) => table.find((r) => r.players === n) ?? { players: n, priceCents: priceForPlayers(table, n, false) },
  );

  const save = () => {
    void update("room.setup", (d) =>
      patchTypeExtra(d, ct.id, {
        setupMin: setup,
        ...(room ? { roomMode: { minPlayers: min, maxPlayers: max }, playerPrices: rows.filter((r) => r.priceCents > 0) } : {}),
      }),
    );
    toast.success("Guardado", room ? `${ct.name}: de ${min} a ${max} jugadores y ${setup} min de montaje entre partidas.` : `${ct.name}: ${setup} min de preparación.`);
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", tone.dot)} />
          {ct.name}
        </span>
      }
      description={ct.category}
    >
      <div className="flex flex-col gap-4">
        <ChoiceChips
          value={room ? "room" : "seat"}
          onChange={setMode}
          options={[
            { value: "room" as const, label: "Sala para un grupo", hint: "Se reserva entera" },
            { value: "seat" as const, label: "Por plaza", hint: "Talleres y actividades" },
          ]}
        />
        {room ? (
          <>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs font-medium text-text-muted">Mínimo</p>
                <Stepper value={min} onChange={setMin} min={1} max={max} label="Mínimo de jugadores" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">Máximo</p>
                <Stepper value={max} onChange={setMax} min={min} max={20} label="Máximo de jugadores" />
              </div>
            </div>
            <div className="overflow-x-auto pro-scroll">
              <table className="w-full min-w-[300px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-muted">
                    <th className="pb-1.5 font-semibold">Jugadores</th>
                    <th className="pb-1.5 font-semibold">Precio del grupo (€)</th>
                    <th className="pb-1.5 font-semibold">Estudiante (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.players}>
                      <td className="py-1 pr-2 font-semibold tabular">{r.players}</td>
                      <td className="py-1 pr-2">
                        <input
                          inputMode="decimal"
                          aria-label={`Precio para ${r.players} jugadores`}
                          defaultValue={r.priceCents ? String(r.priceCents / 100) : ""}
                          onChange={(e) => setRow(r.players, "priceCents", e.target.value)}
                          className={inputClass}
                        />
                      </td>
                      <td className="py-1">
                        <input
                          inputMode="decimal"
                          aria-label={`Precio estudiante para ${r.players} jugadores`}
                          defaultValue={r.studentPriceCents ? String(r.studentPriceCents / 100) : ""}
                          onChange={(e) => setRow(r.players, "studentPriceCents", e.target.value)}
                          className={inputClass}
                          placeholder="Igual"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-muted">
              Si vienen menos de los reservados, el precio se recalcula solo en recepción con esta tabla ({money(Math.round((rows.at(-1)?.priceCents ?? 0) / Math.max(1, rows.at(-1)?.players ?? 1)))} por persona con el grupo completo).
            </p>
          </>
        ) : null}
        {!room ? <SeatMaterialEditor typeId={ct.id} /> : null}
        <FormField label={room ? "Montaje entre partidas" : "Preparación entre sesiones"} hint="El horario no deja crear otra sesión en la misma sala durante ese tiempo.">
          <ChoiceChips
            value={String(setup)}
            onChange={(v) => setSetup(Number(v))}
            options={["0", "10", "15", "20", "30"].map((v) => ({ value: v, label: v === "0" ? "Sin montaje" : `${v} min` }))}
          />
        </FormField>
        <Button variant="dark" className="self-start" onClick={save}>
          Guardar
        </Button>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Normas de reserva                                                   */
/* ------------------------------------------------------------------ */

function RulesPanel() {
  const { data, update } = usePro();
  const toast = useToast();
  const saved = extrasOf(data).policy;
  const [policy, setPolicy] = React.useState<ProBookingPolicy>(saved);
  const dirty = JSON.stringify(policy) !== JSON.stringify(saved);

  const save = () => {
    void update("policy.save", (d) => withExtras(d, (x) => ({ ...x, policy })));
    toast.success("Normas guardadas", "Franky las aplica al cancelar y se las recuerda a cada grupo.");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <Panel title="Tus normas de reserva" description="Las eliges tú. Al cancelar una reserva, Franky te dice qué toca según ellas.">
        <div className="flex flex-col gap-5">
          <FormField label="Cambios y cancelaciones sin coste hasta">
            <ChoiceChips
              value={String(policy.freeChangeHours)}
              onChange={(v) => setPolicy((p) => ({ ...p, freeChangeHours: Number(v) }))}
              options={["12", "24", "48", "72"].map((v) => ({ value: v, label: `${v} h antes` }))}
            />
          </FormField>
          <FormField label="Si avisan más tarde">
            <ChoiceChips
              value={policy.lateNoticeVoucher ? "voucher" : "none"}
              onChange={(v) => setPolicy((p) => ({ ...p, lateNoticeVoucher: v === "voucher" }))}
              options={[
                { value: "voucher", label: "Bono para otra fecha" },
                { value: "none", label: "Sin devolución" },
              ]}
            />
          </FormField>
          <FormField label="Minutos de cortesía">
            <ChoiceChips
              value={String(policy.courtesyMin)}
              onChange={(v) => setPolicy((p) => ({ ...p, courtesyMin: Number(v) }))}
              options={["5", "10", "15"].map((v) => ({ value: v, label: `${v} min` }))}
            />
          </FormField>
          <FormField label="Enlace para dejar reseña" htmlFor="rv-url" hint="El de Google o tu ficha de Franky. Va en el mensaje de después de la partida.">
            <input id="rv-url" value={policy.reviewUrl ?? ""} onChange={(e) => setPolicy((p) => ({ ...p, reviewUrl: e.target.value.trim() || undefined }))} className={inputClass} placeholder="https://..." />
          </FormField>
          <Button variant="dark" className="self-start" onClick={save} disabled={!dirty}>
            {dirty ? "Guardar normas" : "Guardadas"}
          </Button>
        </div>
      </Panel>
      <Panel title="Así lo leen tus clientes" description="En el recordatorio de la víspera y al reservar.">
        <ul className="flex flex-col gap-2.5">
          {policyLines(policy).map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-text-secondary">
              <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.8} />
              {line}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
