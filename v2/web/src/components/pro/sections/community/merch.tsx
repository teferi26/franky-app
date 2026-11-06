"use client";

import * as React from "react";
import { Check, ClipboardCopy, Download, MessageCircle, PackageCheck, Plus, Shirt, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import { addDays, dayLabel, localDate, money } from "@/lib/pro/format";
import { PAY_METHOD_LABEL, communityOps, courseLabel, whatsAppShareUrl, withCommunityOps } from "@/lib/pro/community";
import type {
  CommunityMember,
  CommunityMerchLine,
  CommunityMerchOrder,
  CommunityPayMethod,
} from "@/lib/pro/community-types";
import {
  MERCH_PAY_METHODS,
  MERCH_SIZES,
  addMerchLine,
  merchCallMessage,
  merchOrderCsv,
  merchReminderMessage,
  merchSummary,
  placeMerchOrder,
  removeMerchLine,
  reopenMerchOrder,
  saveMerchOrder,
  setLineDelivered,
  setLinePaid,
  sizeTotals,
  supplierOrderText,
} from "@/lib/pro/community-merch";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import { Drawer, Empty, FormField, Panel, Pill, Segmented, Tip, inputClass } from "../../kit";
import { downloadCsv, fileSlug } from "./files";
import { WhatsAppButton, centsToInput, paidWith, parseEuros, useCommunitySave } from "./ui";

/**
 * Pedidos de sudaderas y merchandising, dentro de la Caja: quién quiere qué
 * talla, quién ha pagado, el total por talla para el proveedor y la entrega.
 */

const STATUS: Record<CommunityMerchOrder["status"], { label: string; tone: "violet" | "warning" | "success" }> = {
  abierto: { label: "Eligiendo tallas", tone: "violet" },
  encargado: { label: "Encargado", tone: "warning" },
  entregado: { label: "Entregado", tone: "success" },
};

function fullDate(date: string) {
  return dayLabel(`${date.slice(0, 10)}T12:00:00Z`, { weekday: false });
}

export function MerchView() {
  const { data } = usePro();
  const orders = communityOps(data).merch ?? [];
  const [selected, setSelected] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const current = orders.find((o) => o.id === selected) ?? orders.find((o) => o.status !== "entregado") ?? orders[0];

  if (!orders.length) {
    return (
      <>
        <Panel>
          <Empty
            icon={Shirt}
            title="Sudaderas sin Excel"
            body="Pon la prenda, el precio y las tallas. Apuntas a cada socio, ves quién ha pagado y el total por talla sale solo para el proveedor."
            action={
              <Button variant="dark" onClick={() => setCreating(true)}>
                Nuevo pedido
              </Button>
            }
          />
        </Panel>
        <NewOrderDrawer open={creating} onClose={() => setCreating(false)} onCreated={setSelected} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1 pro-scroll">
          {orders.map((o) => {
            const s = merchSummary(o);
            const active = o.id === current?.id;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(o.id)}
                className={cn(
                  "flex min-h-14 shrink-0 flex-col items-start justify-center rounded-2xl border px-3.5 py-2 text-left transition-colors",
                  active ? "border-violet bg-violet-50" : "border-border bg-bg-primary hover:border-text-primary/20",
                )}
              >
                <span className="max-w-[14rem] truncate text-sm font-semibold">{o.title}</span>
                <span className="text-xs text-text-muted">
                  {STATUS[o.status].label} · {s.units} {s.units === 1 ? "unidad" : "unidades"}
                </span>
              </button>
            );
          })}
        </div>
        <Button variant="outline" className="self-start sm:self-auto" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nuevo pedido
        </Button>
      </div>

      {current ? <OrderDetail key={current.id} order={current} /> : null}
      <NewOrderDrawer open={creating} onClose={() => setCreating(false)} onCreated={setSelected} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OrderDetail({ order }: { order: CommunityMerchOrder }) {
  const { data, now } = usePro();
  const toast = useToast();
  const save = useCommunitySave();
  const ops = communityOps(data);
  const today = localDate(now);
  const s = merchSummary(order);
  const totals = sizeTotals(order);
  const max = Math.max(1, ...totals.map((t) => t.qty));
  const [via, setVia] = React.useState<CommunityPayMethod>("bizum");
  const [placing, setPlacing] = React.useState(false);
  const closed = order.status !== "abierto";
  const late = !closed && order.closesOn < today;

  const lines = [...order.lines].sort(
    (a, b) => Number(Boolean(a.paidAt)) - Number(Boolean(b.paidAt)) || a.name.localeCompare(b.name, "es"),
  );

  const pay = (line: CommunityMerchLine) =>
    void save(
      "community.merch.pay",
      (d) =>
        withCommunityOps(d, (o) => setLinePaid(o, order.id, line.id, { at: new Date().toISOString(), via })),
      { title: `${line.name.split(" ")[0]} ha pagado`, detail: `${money(line.qty * order.priceCents)} ${paidWith(via)}. Ya está en la caja.` },
    );

  const unpay = (line: CommunityMerchLine) =>
    void save("community.merch.unpay", (d) => withCommunityOps(d, (o) => setLinePaid(o, order.id, line.id, null)), {
      title: "Pago quitado",
      detail: `${line.name} vuelve a pendiente.`,
    });

  const deliver = (line: CommunityMerchLine, on: boolean) =>
    void save(
      "community.merch.deliver",
      (d) => withCommunityOps(d, (o) => setLineDelivered(o, order.id, line.id, on ? new Date().toISOString() : null)),
      on ? { title: `Entregada a ${line.name.split(" ")[0]}` } : undefined,
    );

  const remove = (line: CommunityMerchLine) =>
    void save("community.merch.remove", (d) => withCommunityOps(d, (o) => removeMerchLine(o, order.id, line.id)), {
      title: "Quitado del pedido",
      detail: line.name,
    });

  const copySupplier = async () => {
    const text = supplierOrderText(order, data.space.name);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado para el proveedor", "Pégalo en WhatsApp o en el correo.");
    } catch {
      toast.info("Total por talla", text.replace(/\n/g, " · "));
    }
  };

  const reopen = () =>
    void save("community.merch.reopen", (d) => withCommunityOps(d, (o) => reopenMerchOrder(o, order.id)), {
      title: "Tallas abiertas otra vez",
      detail: "Se ha quitado el gasto del proveedor de la caja.",
    });

  const call = whatsAppShareUrl(merchCallMessage(order, data.space.name));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel flush>
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-heading text-lg font-bold leading-snug">{order.title}</p>
                <p className="text-sm text-text-muted">
                  {order.garment}. {money(order.priceCents)} cada una.
                </p>
              </div>
              <Pill tone={late ? "danger" : STATUS[order.status].tone}>
                {late ? "Tallas cerradas, falta encargar" : STATUS[order.status].label}
              </Pill>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">Total por talla</p>
                <p className="text-xs text-text-muted">
                  {closed
                    ? `Encargado el ${fullDate(localDate(order.orderedAt ?? today))}`
                    : `Tallas hasta el ${fullDate(order.closesOn)}`}
                </p>
              </div>
              {/* Barras por talla: lo que se le pide al proveedor, de un vistazo. */}
              <div className="mt-3 flex h-28 items-end gap-2" role="img" aria-label={totals.map((t) => `${t.size}: ${t.qty}`).join(", ")}>
                {totals.map((t) => (
                  <div key={t.size} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-xs font-semibold tabular">{t.qty || ""}</span>
                    <div
                      className={cn("w-full rounded-md", t.qty ? "bg-violet" : "bg-bg-tertiary")}
                      style={{ height: `${Math.max(4, (t.qty / max) * 100)}%` }}
                    />
                    <span className="text-[0.72rem] font-semibold text-text-muted">{t.size}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {!closed ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={call} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3.5 w-3.5" /> Pedir tallas en el grupo
                  </a>
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={copySupplier} disabled={!s.units}>
                <ClipboardCopy className="h-3.5 w-3.5" /> Copiar para el proveedor
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadCsv(merchOrderCsv(order), `${fileSlug(order.title)}.csv`)}
                disabled={!order.lines.length}
              >
                <Download className="h-3.5 w-3.5" /> Lista de entrega
              </Button>
            </div>
          </div>
        </Panel>

        {!closed ? <AddLineForm order={order} /> : null}

        <Panel
          title={`${s.people} ${s.people === 1 ? "persona" : "personas"}`}
          description={
            s.unpaid.length
              ? `${s.unpaid.length} sin pagar, ${money(s.pendingCents)} por cobrar.`
              : order.lines.length
                ? "Todo cobrado."
                : "Aún no hay nadie apuntado."
          }
          action={
            s.unpaid.length ? (
              <Segmented<CommunityPayMethod>
                size="sm"
                label="Cobras por"
                value={via}
                onChange={setVia}
                options={MERCH_PAY_METHODS.map((m) => ({ value: m, label: PAY_METHOD_LABEL[m] }))}
              />
            ) : null
          }
          flush
        >
          {lines.length ? (
            <ul className="divide-y divide-border-light">
              {lines.map((line) => {
                const href = !line.paidAt
                  ? customerWhatsApp(
                      line.phone,
                      merchReminderMessage({ line, order, spaceName: data.space.name, howToPay: ops.settings.howToPay }),
                    )
                  : undefined;
                return (
                  <li key={line.id} className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-sm font-bold tabular">
                      {line.size}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {line.name}
                        {line.qty > 1 ? <span className="font-normal text-text-muted"> × {line.qty}</span> : null}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {line.paidAt
                          ? `Pagado ${paidWith(line.paidVia ?? "bizum")}`
                          : `Debe ${money(line.qty * order.priceCents)}`}
                        {line.deliveredAt ? " · Entregada" : ""}
                      </span>
                    </span>
                    {href ? <WhatsAppButton href={href} label={`Recordar el pago a ${line.name}`} /> : null}
                    {line.paidAt ? (
                      closed ? (
                        <Button
                          size="sm"
                          variant={line.deliveredAt ? "ghost" : "outline"}
                          className="h-10"
                          onClick={() => deliver(line, !line.deliveredAt)}
                          aria-pressed={Boolean(line.deliveredAt)}
                        >
                          {line.deliveredAt ? <Check className="h-3.5 w-3.5" /> : <PackageCheck className="h-3.5 w-3.5" />}
                          {line.deliveredAt ? "Entregada" : "Entregar"}
                        </Button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => unpay(line)}
                          className="inline-flex h-10 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-emerald-700 hover:bg-bg-secondary dark:text-emerald-300"
                          title="Quitar el pago"
                        >
                          <Check className="h-3.5 w-3.5" /> Pagado
                        </button>
                      )
                    ) : (
                      <Button size="sm" variant="dark" className="h-10" onClick={() => pay(line)}>
                        Cobrado
                      </Button>
                    )}
                    {!closed ? (
                      <button
                        type="button"
                        onClick={() => remove(line)}
                        aria-label={`Quitar a ${line.name} del pedido`}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.9} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty
              icon={Shirt}
              title="Nadie apuntado todavía"
              body="Comparte el mensaje en el grupo y apunta a cada persona con su talla."
            />
          )}
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Las cuentas del pedido">
          <ul className="flex flex-col gap-2.5 text-sm">
            <Line label={`${s.units} unidades a ${money(order.priceCents)}`} value={money(s.units * order.priceCents)} />
            <Line label="Cobrado" value={money(s.paidCents)} strong />
            <Line label="Por cobrar" value={money(s.pendingCents)} />
            {s.marginCents !== null ? (
              <>
                <Line label={`Proveedor, ${money(order.unitCostCents ?? 0)} cada una`} value={`−${money(s.costCents)}`} />
                <Line label="Queda para la asociación" value={money(s.marginCents)} strong />
              </>
            ) : null}
          </ul>
          <p className="mt-3 text-xs text-text-muted">Lo cobrado entra solo en la caja del curso como venta.</p>
        </Panel>

        {order.status === "abierto" ? (
          <Button variant="dark" size="lg" onClick={() => setPlacing(true)} disabled={!s.units}>
            <Truck className="h-4 w-4" /> Encargar al proveedor
          </Button>
        ) : order.status === "encargado" ? (
          <Button variant="outline" onClick={reopen}>
            Volver a abrir las tallas
          </Button>
        ) : null}

        <Tip title="Sin sorpresas">
          Cobra al apuntar a cada persona. Así no encargas sudaderas que luego nadie paga.
        </Tip>
      </div>

      <PlaceOrderDrawer order={order} open={placing} onClose={() => setPlacing(false)} />
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-text-secondary">{label}</span>
      <span className={cn("tabular", strong ? "font-semibold" : "font-medium")}>{value}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function AddLineForm({ order }: { order: CommunityMerchOrder }) {
  const { data } = usePro();
  const save = useCommunitySave();
  const members = (data.communityMembers as CommunityMember[]).filter((m) => !m.leftAt);
  const [name, setName] = React.useState("");
  const [size, setSize] = React.useState(order.sizes.includes("M") ? "M" : order.sizes[0] ?? "");
  const [qty, setQty] = React.useState(1);
  const [paidNow, setPaidNow] = React.useState(true);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const who = name.trim();
    if (who.length < 2 || !size) return;
    const member = members.find((m) => m.name.toLowerCase() === who.toLowerCase());
    const at = new Date().toISOString();
    const ok = await save(
      "community.merch.add",
      (d) =>
        withCommunityOps(d, (o) =>
          addMerchLine(o, order.id, {
            id: localId("ml"),
            name: member?.name ?? who,
            memberId: member?.id,
            phone: member?.phone,
            size,
            qty,
            paidAt: paidNow ? at : undefined,
            paidVia: paidNow ? "bizum" : undefined,
          }),
        ),
      {
        title: `${(member?.name ?? who).split(" ")[0]}: talla ${size}`,
        detail: paidNow ? `${money(qty * order.priceCents)} cobrados por Bizum.` : "Apuntado. Queda pendiente de pago.",
      },
    );
    if (ok) {
      setName("");
      setQty(1);
    }
  };

  return (
    <Panel title="Apuntar a alguien">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <FormField label="Nombre" htmlFor="merch-name">
          <input
            id="merch-name"
            list="merch-members"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Busca un socio o escribe el nombre"
            className={inputClass}
            autoComplete="off"
          />
          <datalist id="merch-members">
            {members.slice(0, 250).map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </FormField>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Talla">
          {order.sizes.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={size === s}
              onClick={() => setSize(s)}
              className={cn(
                "inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-colors",
                size === s ? "border-violet bg-violet-50 text-violet-deep" : "border-border hover:border-text-primary/25",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-xl border border-border">
            <button
              type="button"
              aria-label="Una menos"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="inline-flex h-10 w-10 items-center justify-center text-lg text-text-secondary"
            >
              −
            </button>
            <span className="w-8 text-center text-sm font-semibold tabular" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              aria-label="Una más"
              onClick={() => setQty((q) => Math.min(20, q + 1))}
              className="inline-flex h-10 w-10 items-center justify-center text-lg text-text-secondary"
            >
              +
            </button>
          </div>
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={paidNow}
              onChange={(e) => setPaidNow(e.target.checked)}
              className="h-4 w-4 accent-violet"
            />
            Ya ha pagado por Bizum
          </label>
          <Button type="submit" variant="dark" className="ml-auto" disabled={name.trim().length < 2 || !size}>
            Apuntar
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function PlaceOrderDrawer({
  order,
  open,
  onClose,
}: {
  order: CommunityMerchOrder;
  open: boolean;
  onClose: () => void;
}) {
  const { data } = usePro();
  const save = useCommunitySave();
  const s = merchSummary(order);
  const people = data.board.map((b) => b.name);
  const [paidBy, setPaidBy] = React.useState("");

  const confirm = async () => {
    const ok = await save(
      "community.merch.place",
      (d) =>
        withCommunityOps(d, (o) =>
          placeMerchOrder(o, order.id, new Date().toISOString(), { paidBy, movementId: localId("mv") }),
        ),
      {
        title: "Pedido encargado",
        detail: s.costCents
          ? `${money(s.costCents)} al proveedor apuntados en la caja${paidBy ? `, a devolver a ${paidBy.split(" ")[0]}` : ""}.`
          : "Cuando llegue, marca cada entrega.",
      },
    );
    if (ok) onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Encargar al proveedor"
      description={`${s.units} unidades${order.supplier ? ` a ${order.supplier}` : ""}.`}
      footer={
        <Button variant="dark" onClick={confirm}>
          <Truck className="h-4 w-4" /> Encargar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <pre className="whitespace-pre-wrap rounded-2xl border border-border bg-bg-secondary p-4 font-sans text-sm">
          {supplierOrderText(order, data.space.name)}
        </pre>
        {s.unpaid.length ? (
          <p className="text-sm text-text-secondary">
            {s.unpaid.length} {s.unpaid.length === 1 ? "persona no ha pagado" : "personas no han pagado"} todavía. Puedes
            encargarlo igual y cobrarles al entregar.
          </p>
        ) : null}
        {s.costCents ? (
          <FormField label="¿Quién paga al proveedor?" hint={`${money(s.costCents)} se apuntan como gasto en la caja.`}>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={inputClass}>
              <option value="">La cuenta de la asociación</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  Lo adelanta {p}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */

function NewOrderDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data, now } = usePro();
  const save = useCommunitySave();
  const today = localDate(now);
  const [title, setTitle] = React.useState("");
  const [garment, setGarment] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [sizes, setSizes] = React.useState<string[]>(MERCH_SIZES);
  const [supplier, setSupplier] = React.useState("");
  const [closesOn, setClosesOn] = React.useState(addDays(today, 10));

  React.useEffect(() => {
    if (!open) return;
    setTitle(`Sudadera ${data.space.name} ${courseLabel(now)}`);
    setGarment("");
    setPrice("");
    setCost("");
    setSizes(MERCH_SIZES);
    setSupplier("");
    setClosesOn(addDays(localDate(now), 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const priceCents = parseEuros(price);
  const costCents = parseEuros(cost);
  const valid =
    title.trim().length > 2 && Boolean(priceCents) && sizes.length > 0 && (cost === "" || costCents !== null) && Boolean(closesOn);

  const toggle = (s: string) =>
    setSizes((list) => (list.includes(s) ? list.filter((x) => x !== s) : MERCH_SIZES.filter((x) => x === s || list.includes(x))));

  const submit = async () => {
    const order: CommunityMerchOrder = {
      id: localId("mo"),
      title: title.trim(),
      garment: garment.trim() || title.trim(),
      priceCents: priceCents ?? 0,
      unitCostCents: costCents ?? undefined,
      sizes,
      supplier: supplier.trim() || undefined,
      closesOn,
      status: "abierto",
      lines: [],
    };
    const ok = await save("community.merch.create", (d) => withCommunityOps(d, (o) => saveMerchOrder(o, order)), {
      title: "Pedido abierto",
      detail: "Comparte el mensaje en el grupo y apunta a cada persona con su talla.",
    });
    if (ok) {
      onCreated(order.id);
      onClose();
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo pedido"
      description="Sudaderas, camisetas, bolsas o lo que queráis hacer."
      footer={
        <Button variant="dark" onClick={submit} disabled={!valid}>
          Abrir pedido
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre del pedido" htmlFor="mo-title">
          <input id="mo-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Prenda y acabado" htmlFor="mo-garment" hint="Tal y como se lo pides al proveedor.">
          <input
            id="mo-garment"
            value={garment}
            onChange={(e) => setGarment(e.target.value)}
            placeholder="Sudadera con capucha, logo bordado en el pecho"
            className={inputClass}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Precio para socios" htmlFor="mo-price">
            <input
              id="mo-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="28"
              aria-invalid={price !== "" && !priceCents}
              className={inputClass}
            />
          </FormField>
          <FormField label="Os cuesta" htmlFor="mo-cost" hint="Por unidad, opcional.">
            <input
              id="mo-cost"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder={centsToInput(priceCents ? Math.round(priceCents * 0.6) : undefined) || "17,50"}
              aria-invalid={cost !== "" && costCents === null}
              className={inputClass}
            />
          </FormField>
        </div>
        <FormField label="Tallas">
          <div className="flex flex-wrap gap-2">
            {MERCH_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sizes.includes(s)}
                onClick={() => toggle(s)}
                className={cn(
                  "inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-colors",
                  sizes.includes(s) ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-muted",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Proveedor" htmlFor="mo-supplier">
            <input id="mo-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Tallas hasta el" htmlFor="mo-closes">
            <input
              id="mo-closes"
              type="date"
              value={closesOn}
              min={today}
              onChange={(e) => setClosesOn(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>
      </div>
    </Drawer>
  );
}
