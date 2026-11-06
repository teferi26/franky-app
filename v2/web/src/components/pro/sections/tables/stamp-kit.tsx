"use client";

import * as React from "react";
import { Check, Gift, Heart, Stamp, Star, Ticket, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProClient, ProValidation } from "@/lib/pro/types";
import {
  activeBonosFor,
  bonoRemaining,
  consumeBono,
  reviewMessage,
  usualFor,
} from "@/lib/pro/tables-ops";
import { stampCandidates, stampStatus, stampValidation } from "@/lib/pro/tables-day";
import { relative } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import { Avatar, Drawer, Empty, Panel, SearchInput } from "../../kit";
import { StampDots, StudentMark } from "./table-kit";
import { WhatsAppButton, useTablesOps } from "./ops-kit";

/**
 * Sello en un toque: el habitual pide su café, se le busca por el nombre y
 * se sella sin escribir ningún importe. Si ya tiene la tarjeta completa, la
 * pantalla dice "Invita la casa". Aquí también se descuenta su bono y se
 * pide la reseña después del premio.
 */

export function QuickStampPanel() {
  const { data } = usePro();
  const [open, setOpen] = React.useState(false);
  if (!data.loyalty) return null;
  return (
    <Panel
      title="Sello rápido"
      description="Para el habitual de cada mañana: sin escanear ni escribir importe."
    >
      <Button
        variant="dark"
        className="h-14 w-full text-base"
        onClick={() => setOpen(true)}
      >
        <Stamp className="h-5 w-5" strokeWidth={1.9} /> Sellar a un habitual
      </Button>
      <QuickStampDrawer open={open} onClose={() => setOpen(false)} />
    </Panel>
  );
}

type Done = {
  client: ProClient;
  validationId: string;
  kind: "stamp" | "reward";
  stamps: number;
};

function QuickStampDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, pending } = usePro();
  const { ops } = useTablesOps();
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<ProClient | null>(null);
  const [done, setDone] = React.useState<Done | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setPicked(null);
    setDone(null);
  }, [open]);

  const loyalty = data.loyalty;
  if (!loyalty) return null;
  const needed = loyalty.stampsNeeded;
  const list = stampCandidates(data, q, needed, 10);

  const record = async (client: ProClient, kind: "stamp" | "reward") => {
    const at = new Date().toISOString();
    const base = stampValidation({
      id: localId("v"),
      at,
      clientName: client.name,
      university: client.student?.university,
      staffId: data.staff[0]?.id,
    });
    const v: ProValidation = kind === "reward" ? { ...base, kind: "reward" } : base;
    const ok = await update(kind === "reward" ? "card.reward" : "card.stamp", (d) => ({
      ...d,
      validations: [v, ...d.validations],
      loyalty: d.loyalty
        ? {
            ...d.loyalty,
            stampsToday: d.loyalty.stampsToday + (kind === "stamp" ? 1 : 0),
            rewardsThisMonth: d.loyalty.rewardsThisMonth + (kind === "reward" ? 1 : 0),
          }
        : d.loyalty,
      clients: d.clients.map((c) =>
        c.id === client.id ? { ...c, visits: c.visits + 1, lastVisit: at } : c,
      ),
    }));
    if (!ok) return;
    const stamps = kind === "reward" ? 0 : Math.min(needed, stampStatus(data.validations, client.name, needed).stamps + 1);
    setDone({ client, validationId: v.id, kind, stamps });
  };

  const undo = async () => {
    if (!done) return;
    const ok = await update("card.undo", (d) => ({
      ...d,
      validations: d.validations.filter((v) => v.id !== done.validationId),
      loyalty: d.loyalty
        ? {
            ...d.loyalty,
            stampsToday: Math.max(0, d.loyalty.stampsToday - (done.kind === "stamp" ? 1 : 0)),
            rewardsThisMonth: Math.max(0, d.loyalty.rewardsThisMonth - (done.kind === "reward" ? 1 : 0)),
          }
        : d.loyalty,
      clients: d.clients.map((c) =>
        c.id === done.client.id ? { ...c, visits: Math.max(0, c.visits - 1) } : c,
      ),
    }));
    if (ok) {
      toast.info("Deshecho", done.client.name);
      setDone(null);
    }
  };

  const pickedStatus = picked ? stampStatus(data.validations, picked.name, needed) : null;

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={done ? "Hecho" : picked ? picked.name : "Sellar a un habitual"}
      description={
        done || picked
          ? undefined
          : "Los que vienen más a menudo salen primero."
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-4 pt-2 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <div>
            <p className="font-heading text-xl font-extrabold">
              {done.kind === "reward" ? "Invita la casa" : `Sello ${done.stamps} de ${needed}`}
            </p>
            <p className="text-sm text-text-muted">
              {done.kind === "reward"
                ? `${loyalty.reward}. Empieza una tarjeta nueva.`
                : done.stamps >= needed
                  ? `Tarjeta completa: la próxima vez, ${loyalty.reward.toLowerCase()}.`
                  : `Le ${needed - done.stamps === 1 ? "falta 1 sello" : `faltan ${needed - done.stamps} sellos`} para ${loyalty.reward.toLowerCase()}.`}
            </p>
          </div>
          {done.kind === "stamp" ? <StampDots value={done.stamps} max={needed} /> : null}
          <ClientExtras client={done.client} afterReward={done.kind === "reward"} />
          <div className="flex w-full gap-2">
            <Button variant="ghost" className="h-12" disabled={pending} onClick={undo}>
              <Undo2 className="h-4 w-4" /> Deshacer
            </Button>
            <Button
              variant="dark"
              className="h-12 flex-1"
              onClick={() => {
                setDone(null);
                setPicked(null);
                setQ("");
              }}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : picked && pickedStatus?.full ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-5 text-center text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <Gift className="h-8 w-8" strokeWidth={1.75} />
            <p className="font-heading text-2xl font-extrabold">Invita la casa</p>
            <p className="text-sm">
              {picked.name.split(" ")[0]} tiene la tarjeta completa: {loyalty.reward.toLowerCase()}.
            </p>
          </div>
          <ClientExtras client={picked} />
          <div className="flex gap-2">
            <Button variant="ghost" className="h-12" onClick={() => setPicked(null)}>
              Volver
            </Button>
            <Button
              variant="dark"
              className="h-12 flex-1"
              disabled={pending}
              onClick={() => void record(picked, "reward")}
            >
              Canjear premio
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre" />
          {list.length ? (
            <ul className="divide-y divide-border-light rounded-2xl border border-border">
              {list.map(({ client, stamps, full, seen }) => {
                const bono = ops ? activeBonosFor(ops, client.name)[0] : undefined;
                return (
                  <li key={client.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => (full ? setPicked(client) : void record(client, "stamp"))}
                      className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-secondary"
                    >
                      <Avatar name={client.name} size="sm" tone="violet" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <span className="truncate">{client.name}</span>
                          {client.student ? <StudentMark university={client.student.university} /> : null}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                          <StampDots value={stamps} max={needed} />
                          {bono ? <span>bono: quedan {bonoRemaining(bono)}</span> : null}
                          {seen ? <span>{relative(seen)}</span> : null}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-xl px-3 py-2 text-xs font-bold",
                          full ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-violet-50 text-violet-deep",
                        )}
                      >
                        {full ? "Premio" : "+1 sello"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty
              icon={Stamp}
              title="Nadie con ese nombre"
              body="Si es su primera vez, valida su Franky Card con el código y su tarjeta de sellos empieza sola."
              className="py-6"
            />
          )}
        </div>
      )}
    </Drawer>
  );
}

/**
 * Lo que conviene saber del cliente en la barra: lo de siempre, su bono con
 * los usos que le quedan (y el botón para descontar uno) y, tras un premio,
 * pedirle la reseña.
 */
export function ClientExtras({
  client,
  afterReward,
}: {
  client: ProClient;
  afterReward?: boolean;
}) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [used, setUsed] = React.useState<string | null>(null);
  if (!ops) return null;
  const usual = usualFor(ops, client.name);
  const bono = activeBonosFor(ops, client.name)[0];
  const template = bono ? ops.bonoTemplates.find((t) => t.id === bono.templateId) : undefined;
  const askReview =
    afterReward && ops.reviewLink && client.marketingConsent && client.phone;
  if (!usual && !bono && !used && !askReview) return null;

  const spend = async () => {
    if (!bono) return;
    const ok = await save("bono.use", (o) => ({
      ...o,
      bonos: o.bonos.map((b) =>
        b.id === bono.id ? consumeBono(b, now.toISOString(), client.name) : b,
      ),
    }));
    if (!ok) return;
    const left = bonoRemaining(bono) - 1;
    setUsed(left > 0 ? `Descontado. Quedan ${left}.` : "Descontado. Era el último: ofrécele otro bono.");
    toast.success("Bono descontado", `${template?.itemName ?? "Uso"} de ${client.name.split(" ")[0]}.`);
  };

  return (
    <div className="flex w-full flex-col gap-2 text-left">
      {usual ? (
        <p className="flex items-start gap-2 rounded-2xl border border-border px-4 py-3 text-sm">
          <Heart className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
          <span>
            <span className="font-semibold">Lo de siempre: </span>
            {usual}
          </span>
        </p>
      ) : null}
      {bono && !used ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm">
          <Ticket className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{template?.name ?? "Bono"}</span>
            <span className="text-text-muted">
              {" "}
              · quedan {bonoRemaining(bono)} de {bono.uses}
              {bono.members?.length ? ` · grupo ${bono.clientName}` : ""}
            </span>
          </span>
          <Button size="sm" variant="secondary" className="h-10" onClick={spend}>
            Descontar {template?.itemName.toLowerCase() ?? "uno"}
          </Button>
        </div>
      ) : null}
      {used ? (
        <p className="rounded-2xl bg-bg-secondary px-4 py-3 text-sm">{used}</p>
      ) : null}
      {askReview ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm">
          <Star className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
          <span className="min-w-0 flex-1">Se va con su premio: buen momento para pedir la reseña.</span>
          <WhatsAppButton
            phone={client.phone}
            message={reviewMessage(client.name, data.space.name, ops.reviewLink ?? "")}
            label="Pedir reseña"
          />
        </div>
      ) : null}
    </div>
  );
}
