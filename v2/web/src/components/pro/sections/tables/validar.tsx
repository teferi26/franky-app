"use client";

import * as React from "react";
import { BadgeCheck, Check, Delete, Gift, Keyboard, Pencil, ScanLine, Stamp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProClient, ProLoyalty, ProValidation } from "@/lib/pro/types";
import { localDate, money, plural, time } from "@/lib/pro/format";
import { stampsFor } from "@/lib/pro/tables";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, Empty, FormField, Kpi, KpiRow, LiveDot, PageHeader, Panel, Pill, RowList, Tip, inputClass } from "../../kit";
import { StampDots, StudentMark, shortUni } from "./table-kit";
import { RealCardValidation } from "@/lib/pro/card-validation";
import { ClientExtras, QuickStampPanel } from "./stamp-kit";

type Step = "idle" | "scanning" | "amount" | "done";

type Receipt = {
  code: string;
  at: string;
  client: ProClient;
  amountCents: number;
  discountCents: number;
  stamps: number | null;
  reward: boolean;
  completed: boolean;
};

export default function TablesValidar() {
  const { demo, data } = usePro();
  if (!demo) return <RealCardValidation organizationId={data.space.id} services={data.services} />;
  return <DemoTablesValidar />;
}

function DemoTablesValidar() {
  const { data, now, vertical } = usePro();
  const [editOpen, setEditOpen] = React.useState(false);
  const today = localDate(now);
  const label = vertical.nav.find((n) => n.id === "validar")?.label ?? "Franky Card";
  const todays = data.validations.filter((v) => localDate(v.at) === today).sort((a, b) => b.at.localeCompare(a.at));
  const discounted = todays.reduce((a, v) => a + v.discountCents, 0);
  const charged = todays.reduce((a, v) => a + v.amountCents - v.discountCents, 0);
  const pct = data.space.publicProfile.cardDiscountPct;
  const stampsToday = data.loyalty?.stampsToday ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={label}
        title={vertical.id === "bar" ? "Fidelidad y Franky Card" : "Validar Franky Card"}
        description={`Hoy: ${plural(todays.length, "validación", "validaciones")}${data.loyalty ? ` y ${plural(stampsToday, "sello", "sellos")}` : ""}. Los estudiantes con Franky Card tienen un ${pct} % de descuento aquí.`}
        actions={
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" strokeWidth={1.9} /> {data.loyalty ? "Editar tarjeta" : "Crear tarjeta de sellos"}
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <ValidateFlow />

        <div className="flex min-w-0 flex-col gap-5">
          <QuickStampPanel />

          <KpiRow className="lg:grid-cols-2 xl:grid-cols-2">
            <Kpi icon={ScanLine} label="Validaciones hoy" value={todays.length} hint={`${new Set(todays.map((v) => v.clientName)).size} estudiantes`} />
            <Kpi icon={Wallet} label="Cobrado con Card" value={money(charged, { round: true })} hint={`${money(discounted)} descontados`} />
          </KpiRow>

          <LoyaltyCard onEdit={() => setEditOpen(true)} />

          <Panel title="Historial de hoy" description={todays.length ? "El estudiante tiene el mismo comprobante en su móvil." : undefined} flush>
            {todays.length ? (
              <RowList className="max-h-[520px] overflow-y-auto pro-scroll">
                {todays.map((v) => (
                  <HistoryRow key={v.id} v={v} />
                ))}
              </RowList>
            ) : (
              <Empty icon={ScanLine} title="Aún no has validado ninguna hoy" body="Cuando un estudiante te enseñe su tarjeta, toca Escanear código. Son tres toques." />
            )}
          </Panel>
        </div>
      </div>

      <LoyaltyDrawer open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flujo de validación                                                 */
/* ------------------------------------------------------------------ */

function ValidateFlow() {
  const { data, update, pending } = usePro();
  const toast = useToast();
  const [step, setStep] = React.useState<Step>("idle");
  const [turn, setTurn] = React.useState(0);
  const [amount, setAmount] = React.useState("");
  const [manual, setManual] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [receipt, setReceipt] = React.useState<Receipt | null>(null);

  const candidates = React.useMemo(() => {
    const members = data.clients.filter((c) => c.student?.verified && c.cardMember);
    return members.length ? members : data.clients.filter((c) => c.student);
  }, [data.clients]);
  const client = candidates.length ? candidates[turn % candidates.length] : null;

  React.useEffect(() => {
    if (step !== "scanning") return;
    const id = window.setTimeout(() => setStep("amount"), 900);
    return () => window.clearTimeout(id);
  }, [step]);

  const pct = data.space.publicProfile.cardDiscountPct;
  const cents = toCents(amount);
  const discount = Math.round((cents * pct) / 100);
  const loyalty = data.loyalty;
  const stamps = client && loyalty ? stampsFor(data.validations, client.name, loyalty.stampsNeeded) : 0;
  const full = Boolean(loyalty && stamps >= loyalty.stampsNeeded);
  const quick = quickAmounts(data);

  const press = (k: string) => {
    setAmount((prev) => {
      if (k === "del") return prev.slice(0, -1);
      if (k === ",") return prev.includes(",") ? prev : prev ? `${prev},` : "0,";
      const [int, dec] = prev.split(",");
      if (dec !== undefined && dec.length >= 2) return prev;
      if (dec === undefined && int.length >= 4) return prev;
      if (prev === "0") return k;
      return prev + k;
    });
  };

  const reset = () => {
    setStep("idle");
    setAmount("");
    setReceipt(null);
    setManual(false);
    setCode("");
    setTurn((t) => t + 1);
  };

  const confirm = async (reward: boolean) => {
    if (!client) return;
    const at = new Date().toISOString();
    const rewardValue = Math.min(cents || 160, 400);
    const v: ProValidation = {
      id: localId("v"),
      at,
      clientName: client.name,
      university: client.student?.university,
      kind: reward ? "reward" : "discount",
      amountCents: reward ? rewardValue : cents,
      discountCents: reward ? rewardValue : discount,
      staffId: data.staff[0]?.id,
    };
    const afterStamps = loyalty ? (reward ? 0 : Math.min(loyalty.stampsNeeded, stamps + 1)) : null;
    const completed = Boolean(loyalty && !reward && afterStamps === loyalty.stampsNeeded);
    if (!(await update(reward ? "card.reward" : "card.validate", (d) => ({
      ...d,
      validations: [v, ...d.validations],
      loyalty: d.loyalty
        ? {
            ...d.loyalty,
            stampsToday: d.loyalty.stampsToday + (reward ? 0 : 1),
            rewardsThisMonth: d.loyalty.rewardsThisMonth + (reward ? 1 : 0),
          }
        : d.loyalty,
      clients: d.clients.map((c) => (c.id === client.id ? { ...c, visits: c.visits + 1, spentCents: c.spentCents === null ? null : c.spentCents + v.amountCents - v.discountCents, lastVisit: at } : c)),
    })))) return;
    setReceipt({
      code: `FK-${1000 + Math.floor(Math.random() * 9000)}`,
      at,
      client,
      amountCents: v.amountCents,
      discountCents: v.discountCents,
      stamps: afterStamps,
      reward,
      completed,
    });
    setStep("done");
    if (reward) toast.success("Premio canjeado", `${client.name.split(" ")[0]} empieza una tarjeta nueva.`);
    else if (completed) toast.success("Tarjeta completa", `La próxima vez, ${loyalty?.reward.toLowerCase()} para ${client.name.split(" ")[0]}.`);
    else toast.success("Validado", `${money(cents - discount)} con un ${pct} % de descuento.`);
  };

  if (!client) {
    return (
      <Panel>
        <Empty icon={ScanLine} title="Todavía no hay estudiantes con tarjeta" body="Cuando un estudiante active su Franky Card cerca de ti, podrás validarla desde aquí." />
      </Panel>
    );
  }

  return (
    <section className="flex min-w-0 flex-col rounded-3xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
      {step === "idle" ? (
        <div className="flex flex-col gap-3">
          <Button variant="dark" className="h-44 w-full flex-col gap-3 rounded-3xl text-xl sm:h-52" onClick={() => setStep("scanning")}>
            <ScanLine className="h-12 w-12" strokeWidth={1.6} />
            Escanear código
            <span className="text-sm font-medium opacity-70">El código de su Franky Card</span>
          </Button>
          {manual ? (
            <div className="flex items-center gap-2">
              <input
                aria-label="Código de la tarjeta"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                  if (v.length === 6) setStep("amount");
                }}
                placeholder="6 cifras"
                className={cn(inputClass, "h-12 text-center font-heading text-xl tracking-[0.3em] tabular")}
              />
              <Button variant="ghost" className="h-12" onClick={() => setManual(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="h-11 self-center" onClick={() => setManual(true)}>
              <Keyboard className="h-4 w-4" strokeWidth={1.9} /> Sin cámara: escribir el código
            </Button>
          )}
          <ol className="grid grid-cols-3 gap-2 text-center text-xs text-text-muted">
            <li className="rounded-xl bg-bg-secondary px-2 py-2"><span className="block font-heading text-base font-bold text-text-primary">1</span>Escanea</li>
            <li className="rounded-xl bg-bg-secondary px-2 py-2"><span className="block font-heading text-base font-bold text-text-primary">2</span>Importe</li>
            <li className="rounded-xl bg-bg-secondary px-2 py-2"><span className="block font-heading text-base font-bold text-text-primary">3</span>Validar</li>
          </ol>
        </div>
      ) : null}

      {step === "scanning" ? (
        <div className="flex h-72 flex-col items-center justify-center gap-4" aria-live="polite">
          <div className="relative h-40 w-40">
            <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-text-primary" />
            <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-text-primary" />
            <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-text-primary" />
            <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-text-primary" />
            <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-violet" />
          </div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold">
            <LiveDot /> Leyendo el código
          </p>
        </div>
      ) : null}

      {step === "amount" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-2xl bg-bg-secondary p-3">
            <Avatar name={client.name} size="lg" tone="violet" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-lg font-bold">{client.name}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
                <StudentMark university={client.student?.university} />
                <span className="truncate">{client.student?.faculty}</span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <Pill tone="success">
                  <BadgeCheck className="h-3 w-3" /> Tarjeta activa
                </Pill>
                {loyalty ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                    <StampDots value={stamps} max={loyalty.stampsNeeded} />
                    <span className="tabular">{stamps}/{loyalty.stampsNeeded}</span>
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <ClientExtras client={client} />

          {full && loyalty ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <Gift className="h-5 w-5 shrink-0" strokeWidth={1.9} />
              <p className="min-w-0 flex-1 text-sm font-semibold">Tiene la tarjeta completa: {loyalty.reward.toLowerCase()}.</p>
              <Button variant="dark" className="h-11" disabled={pending} onClick={() => confirm(true)}>
                Canjear premio
              </Button>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border px-4 py-3 text-center">
            <p className="text-xs font-semibold text-text-muted">Importe del ticket</p>
            <p className={cn("font-heading text-5xl font-extrabold tracking-[-0.03em] tabular", !amount && "text-text-muted")} aria-live="polite">
              {amount ? `${amount} €` : "0 €"}
            </p>
          </div>

          {quick.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1 pro-scroll">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setAmount((q.cents / 100).toFixed(2).replace(".", ","))}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-text-primary/25"
                >
                  {q.label} <span className="text-text-muted tabular">{money(q.cents)}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "del"].map((k) => (
              <button
                key={k}
                type="button"
                aria-label={k === "del" ? "Borrar" : k === "," ? "Coma decimal" : k}
                onClick={() => press(k)}
                className="flex h-14 items-center justify-center rounded-2xl bg-bg-secondary font-heading text-2xl font-bold tabular transition-colors hover:bg-bg-tertiary active:scale-[0.98] sm:h-16"
              >
                {k === "del" ? <Delete className="h-6 w-6" strokeWidth={1.75} /> : k}
              </button>
            ))}
          </div>

          <div className="divide-y divide-border-light rounded-2xl border border-border px-4 text-sm">
            <div className="flex justify-between py-2">
              <span className="text-text-muted">Descuento Franky Card ({pct} %)</span>
              <span className="font-semibold text-violet tabular">-{money(discount)}</span>
            </div>
            {loyalty ? (
              <div className="flex justify-between py-2">
                <span className="text-text-muted">Sello</span>
                <span className="font-semibold tabular">
                  +1 ({Math.min(loyalty.stampsNeeded, stamps + 1)}/{loyalty.stampsNeeded})
                </span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between py-2">
              <span className="font-semibold">Cobra</span>
              <span className="font-heading text-2xl font-extrabold tabular">{money(cents - discount)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" className="h-14" onClick={reset}>
              Cancelar
            </Button>
            <Button variant="dark" className="h-14 flex-1 text-base" disabled={pending || cents <= 0} onClick={() => confirm(false)}>
              Validar {cents > 0 ? money(cents - discount) : ""}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "done" && receipt ? (
        <div className="flex flex-col items-center gap-4 text-center" aria-live="polite">
          <span className="mt-2 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-8 w-8" strokeWidth={2.5} />
          </span>
          <div>
            <p className="font-heading text-2xl font-extrabold">{receipt.reward ? "Premio canjeado" : "Validado"}</p>
            <p className="text-sm text-text-muted">
              {receipt.code} · {time(receipt.at)} · {receipt.client.name}
            </p>
          </div>
          <div className="w-full divide-y divide-border-light rounded-2xl border border-border px-4 text-left text-sm">
            <div className="flex justify-between py-2">
              <span className="text-text-muted">Importe</span>
              <span className="tabular">{money(receipt.amountCents)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-text-muted">{receipt.reward ? "Premio" : "Descuento"}</span>
              <span className="text-violet tabular">-{money(receipt.discountCents)}</span>
            </div>
            <div className="flex items-baseline justify-between py-2">
              <span className="font-semibold">Cobrado</span>
              <span className="font-heading text-xl font-extrabold tabular">{money(receipt.amountCents - receipt.discountCents)}</span>
            </div>
            {receipt.stamps !== null && loyalty ? (
              <div className="flex items-center justify-between gap-2 py-2">
                <span className="text-text-muted">Tarjeta de sellos</span>
                <span className="inline-flex items-center gap-2">
                  <StampDots value={receipt.stamps} max={loyalty.stampsNeeded} />
                  <span className="tabular">{receipt.stamps}/{loyalty.stampsNeeded}</span>
                </span>
              </div>
            ) : null}
          </div>
          {receipt.completed && loyalty ? (
            <p className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              Tarjeta completa. La próxima vez: {loyalty.reward.toLowerCase()}.
            </p>
          ) : null}
          {receipt.reward ? <ClientExtras client={receipt.client} afterReward /> : null}
          <p className="text-xs text-text-muted">{receipt.client.name.split(" ")[0]} ve este mismo comprobante en su móvil.</p>
          <Button variant="dark" className="h-14 w-full text-base" onClick={reset}>
            Siguiente cliente
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function toCents(v: string): number {
  if (!v) return 0;
  return Math.round(Number(v.replace(",", ".")) * 100) || 0;
}

/** Importes de un toque: lo que más se pide y el menú del día. */
function quickAmounts(data: ReturnType<typeof usePro>["data"]): { label: string; cents: number }[] {
  const out: { label: string; cents: number }[] = [];
  if (data.dailyMenu) out.push({ label: "Menú del día", cents: data.dailyMenu.priceCents });
  data.menu
    .filter((m) => m.studentFavorite && m.available)
    .slice(0, 3)
    .forEach((m) => out.push({ label: m.name, cents: m.priceCents }));
  return out;
}

/* ------------------------------------------------------------------ */
/* Tarjeta de sellos                                                   */
/* ------------------------------------------------------------------ */

function LoyaltyCard({ onEdit }: { onEdit: () => void }) {
  const { data } = usePro();
  const loyalty = data.loyalty;
  if (!loyalty) {
    return (
      <Panel>
        <Empty
          icon={Stamp}
          title="Crea tu tarjeta de sellos"
          body={`Por ejemplo: ${sampleReward(data.space.vertical).toLowerCase()}. Los estudiantes la llevan en Franky y se suma sola al validar.`}
          action={
            <Button variant="dark" onClick={onEdit}>
              Crear tarjeta
            </Button>
          }
        />
      </Panel>
    );
  }
  return (
    <Panel
      title="Tu tarjeta de sellos"
      action={
        <Button size="sm" variant="outline" className="h-9" onClick={onEdit}>
          Editar
        </Button>
      }
    >
      <div className="rounded-2xl border border-border bg-bg-secondary/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{data.space.name}</p>
        <p className="mt-1 font-heading text-lg font-bold">{loyalty.reward}</p>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10" aria-label={`${loyalty.stampsNeeded} sellos`}>
          {Array.from({ length: loyalty.stampsNeeded }, (_, i) => {
            const last = i === loyalty.stampsNeeded - 1;
            return (
              <span
                key={i}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-full border-2 text-[0.7rem] font-bold tabular",
                  last ? "border-violet bg-violet text-white" : i < 3 ? "border-violet bg-violet-50 text-violet-deep" : "border-dashed border-border text-text-muted",
                )}
              >
                {last ? <Gift className="h-4 w-4" strokeWidth={1.9} /> : i + 1}
              </span>
            );
          })}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-text-muted">Tarjetas activas</dt>
          <dd className="font-heading text-xl font-bold tabular">{loyalty.activeCards}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Sellos hoy</dt>
          <dd className="font-heading text-xl font-bold tabular">{loyalty.stampsToday}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Premios del mes</dt>
          <dd className="font-heading text-xl font-bold tabular">{loyalty.rewardsThisMonth}</dd>
        </div>
      </dl>
      <Tip title="Por qué funciona" className="mt-4">
        Quien lleva 7 sellos no se va a la cafetería de al lado. El código de la tarjeta cambia cada 30 segundos, así que una captura de pantalla no sirve.
      </Tip>
    </Panel>
  );
}

function LoyaltyDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, pending } = usePro();
  const toast = useToast();
  const [needed, setNeeded] = React.useState<"5" | "6" | "8" | "10" | "12">("10");
  const [reward, setReward] = React.useState("");
  const [pct, setPct] = React.useState<"5" | "10" | "15" | "20">("10");

  React.useEffect(() => {
    if (!open) return;
    const n = String(data.loyalty?.stampsNeeded ?? 10);
    setNeeded((["5", "6", "8", "10", "12"].includes(n) ? n : "10") as typeof needed);
    setReward(data.loyalty?.reward ?? sampleReward(data.space.vertical));
    const p = String(data.space.publicProfile.cardDiscountPct);
    setPct((["5", "10", "15", "20"].includes(p) ? p : "10") as typeof pct);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const base: ProLoyalty = data.loyalty ?? { stampsNeeded: 10, reward: "", activeCards: 0, stampsToday: 0, rewardsThisMonth: 0 };
    if (!(await update("loyalty.save", (d) => ({
      ...d,
      loyalty: { ...base, stampsNeeded: Number(needed), reward: reward.trim() },
      space: { ...d.space, publicProfile: { ...d.space.publicProfile, cardDiscountPct: Number(pct), cardEnabled: true } },
    })))) return;
    toast.success(data.loyalty ? "Tarjeta actualizada" : "Tarjeta de sellos creada", `${reward.trim()} con ${needed} sellos. Los estudiantes ya la ven en Franky.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={data.loyalty ? "Editar tarjeta de sellos" : "Crear tarjeta de sellos"}
      description="Un sello por visita validada. Al completarla, el premio se canjea en la misma pantalla."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={pending || reward.trim().length < 3}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Sellos para el premio">
          <ChoiceChips value={needed} onChange={setNeeded} options={(["5", "6", "8", "10", "12"] as const).map((v) => ({ value: v, label: v }))} />
        </FormField>
        <FormField label="Premio" htmlFor="loy-reward" hint="Algo barato para ti y deseable para ellos.">
          <input id="loy-reward" value={reward} onChange={(e) => setReward(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Descuento Franky Card" hint="Se aplica solo al validar. Lo que más se usa: 10 %.">
          <ChoiceChips value={pct} onChange={setPct} options={(["5", "10", "15", "20"] as const).map((v) => ({ value: v, label: `${v} %` }))} />
        </FormField>
      </div>
    </Drawer>
  );
}

function HistoryRow({ v }: { v: ProValidation }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <span className="w-11 shrink-0 text-sm font-semibold text-text-muted tabular">{time(v.at)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{v.clientName}</span>
        {v.university ? <span className="text-xs text-text-muted">{shortUni(v.university)}</span> : null}
      </span>
      <Pill tone={v.kind === "reward" ? "success" : v.kind === "stamp" ? "neutral" : "violet"}>
        {v.kind === "reward" ? "Premio" : v.kind === "stamp" ? "Sello" : `-${money(v.discountCents)}`}
      </Pill>
      <span className="w-16 shrink-0 text-right text-sm font-semibold tabular">{money(v.amountCents - v.discountCents)}</span>
    </div>
  );
}

/** Premio de ejemplo de la tarjeta de sellos, según el sector. */
function sampleReward(vertical: string): string {
  if (vertical === "cafe") return "El 10.º café gratis";
  if (vertical === "hairdresser") return "Un arreglo de barba gratis";
  if (vertical === "beauty") return "Una manicura gratis";
  return "Una ración gratis";
}
