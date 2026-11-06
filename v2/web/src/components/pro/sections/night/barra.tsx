"use client";

import * as React from "react";
import { AlertTriangle, Beer, Check, ClipboardList, MessageCircle, Minus, PackageCheck, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProStockItem, ProStockUnit, ProSupplier } from "@/lib/pro/night-types";
import { money, relative, shortDay } from "@/lib/pro/format";
import { nightOf } from "@/lib/pro/night";
import {
  countStep,
  orderMessage,
  sortedCounts,
  stockLevel,
  stockRows,
  suggestedOrder,
  unitLabel,
  unusualCostCents,
  usageSeries,
  type StockRow,
} from "@/lib/pro/night-ops";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import {
  Bars,
  ChoiceChips,
  Detail,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import { SignerChips, defaultSigner, euros, eurosInput, useNightOps } from "./ops-ui";

type Tab = "stock" | "pedido" | "proveedores";

export default function NightBarra() {
  const { ops } = useNightOps();
  const [tab, setTab] = React.useState<Tab>("stock");
  const [counting, setCounting] = React.useState(false);
  const [item, setItem] = React.useState<ProStockItem | "new" | null>(null);
  const [supplier, setSupplier] = React.useState<ProSupplier | "new" | null>(null);
  const { now } = usePro();

  const rows = stockRows(ops);
  const below = rows.filter((r) => r.below);
  const unusual = rows.filter((r) => r.unusual);
  const counts = sortedCounts(ops);
  const last = counts[counts.length - 1];
  const order = suggestedOrder(ops);
  const onTheWay = ops.orders.filter((o) => o.status === "sent");

  const description = !ops.stockItems.length
    ? "Da de alta lo que tienes en la barra y cuéntalo al cerrar. Franky te dirá qué baja de más y qué pedir."
    : last
      ? `Último recuento ${relative(last.at, now.getTime())}, por ${last.by.split(" ")[0]}. ${below.length} por debajo del mínimo${unusual.length ? ` y ${unusual.length} con una bajada rara` : ""}.`
      : "Aún no has contado la barra. Hazlo al cerrar: son dos minutos con los botones.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Barra"
        title="Barra y pedidos"
        description={description}
        actions={
          <Button variant="dark" onClick={() => setCounting(true)} disabled={!ops.stockItems.length}>
            <ClipboardList className="h-4 w-4" /> Contar la barra
          </Button>
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          label="Qué ver"
          options={[
            { value: "stock", label: "Existencias", count: ops.stockItems.length },
            { value: "pedido", label: "Pedido", count: order.reduce((a, o) => a + o.lines.length, 0) + onTheWay.length },
            { value: "proveedores", label: "Proveedores", count: ops.suppliers.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi
          icon={AlertTriangle}
          label="Bajada rara"
          value={unusual.length}
          hint={unusual.length ? `Unos ${money(unusualCostCents(rows), { round: true })} de más` : "Todo normal"}
          emphasis={unusual.length > 0}
        />
        <Kpi label="Bajo mínimo" value={below.length} hint={below.length ? "Pasan al pedido" : "Nada que pedir"} onClick={() => setTab("pedido")} />
        <Kpi label="Recuentos" value={counts.length} hint={last ? `Último ${shortDay(last.at)}` : "Ninguno todavía"} />
        <Kpi icon={Truck} label="En camino" value={onTheWay.length} hint={onTheWay.length ? "Pedidos sin recibir" : "Sin pedidos pendientes"} />
      </KpiRow>

      {tab === "stock" ? (
        <StockView rows={rows} onEdit={setItem} onNew={() => setItem("new")} onCount={() => setCounting(true)} />
      ) : tab === "pedido" ? (
        <OrderView />
      ) : (
        <SuppliersView onEdit={setSupplier} />
      )}

      <CountDrawer open={counting} onClose={() => setCounting(false)} />
      <ItemDrawer item={item} onClose={() => setItem(null)} />
      <SupplierDrawer supplier={supplier} onClose={() => setSupplier(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Existencias                                                         */
/* ------------------------------------------------------------------ */

function StockView({
  rows,
  onEdit,
  onNew,
  onCount,
}: {
  rows: StockRow[];
  onEdit: (item: ProStockItem) => void;
  onNew: () => void;
  onCount: () => void;
}) {
  if (!rows.length) {
    return (
      <Panel>
        <Empty
          icon={Beer}
          title="Tu barra está vacía"
          body="Añade tus botellas, barriles y cajas con el mínimo por debajo del cual hay que pedir. Con dos recuentos Franky ya compara."
          action={
            <Button variant="dark" onClick={onNew}>
              <Plus className="h-4 w-4" /> Añadir producto
            </Button>
          }
        />
      </Panel>
    );
  }
  const unusual = rows.filter((r) => r.unusual);
  const shelves = [...new Set(rows.map((r) => r.item.shelf))];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        {shelves.map((shelf) => (
          <Panel
            key={shelf}
            title={shelf}
            flush
            action={
              shelf === shelves[0] ? (
                <Button variant="ghost" size="sm" onClick={onNew}>
                  <Plus className="h-3.5 w-3.5" /> Producto
                </Button>
              ) : null
            }
          >
            <RowList>
              {rows
                .filter((r) => r.item.shelf === shelf)
                .map((r) => (
                  <button
                    key={r.item.id}
                    type="button"
                    onClick={() => onEdit(r.item)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.item.name}</span>
                        {r.unusual ? <Pill tone="warning">Bajada rara</Pill> : null}
                        {r.below ? <Pill tone="danger">Pedir</Pill> : null}
                      </span>
                      <Meter
                        value={r.level ?? 0}
                        max={Math.max(r.item.target, r.level ?? 0)}
                        tone={r.below ? "danger" : r.unusual ? "warning" : "violet"}
                        className="mt-1.5 max-w-[260px]"
                      />
                      <span className="mt-1 block truncate text-xs text-text-muted">
                        {r.lastUsed !== null
                          ? `Última noche bajó ${unitLabel(r.item.unit, r.lastUsed)}${r.avgUsed !== null ? `, lo normal ${r.avgUsed.toLocaleString("es-ES")}` : ""}`
                          : "Sin comparar todavía"}
                        {` · mínimo ${r.item.par.toLocaleString("es-ES")}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-heading text-lg font-bold tabular">
                        {r.level === null ? "Sin contar" : r.level.toLocaleString("es-ES")}
                      </span>
                      <span className="block text-[0.7rem] text-text-muted">{unitPlural(r.item.unit)}</span>
                    </span>
                  </button>
                ))}
            </RowList>
          </Panel>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Para mirar" description="Lo que bajó bastante más que en los recuentos anteriores." flush>
          {unusual.length ? (
            <RowList>
              {unusual.map((r) => (
                <div key={r.item.id} className="px-4 py-3 sm:px-5">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.9} />
                    {r.item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    Bajó {unitLabel(r.item.unit, r.lastUsed ?? 0)} y lo normal es {(r.avgUsed ?? 0).toLocaleString("es-ES")}. Unos{" "}
                    {money(Math.round(((r.lastUsed ?? 0) - (r.avgUsed ?? 0)) * r.item.costCents), { round: true })} de más a precio de coste.
                  </p>
                </div>
              ))}
            </RowList>
          ) : (
            <Empty icon={Check} title="Nada raro" body="Ningún producto ha bajado más de lo normal en el último recuento." className="py-8" />
          )}
        </Panel>
        <Tip title="Cuenta siempre a la misma hora">
          Al cerrar y antes de reponer. Así cada recuento es una noche y la comparación es justa. Una bajada rara puede ser una botella rota, copas mal servidas o invitaciones sin apuntar.
        </Tip>
        <Button variant="outline" onClick={onCount}>
          <ClipboardList className="h-4 w-4" /> Contar ahora
        </Button>
      </div>
    </div>
  );
}

function unitPlural(unit: ProStockUnit): string {
  return { botella: "botellas", barril: "barriles", caja: "cajas", unidad: "unidades" }[unit];
}

/* ------------------------------------------------------------------ */
/* Recuento                                                            */
/* ------------------------------------------------------------------ */

function CountDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const [values, setValues] = React.useState<Record<string, number>>({});
  const [by, setBy] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    // Se parte de lo que debería haber: el último recuento más lo recibido.
    const start: Record<string, number> = {};
    for (const item of ops.stockItems) start[item.id] = stockLevel(ops, item.id) ?? 0;
    setValues(start);
    setBy(defaultSigner(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shelves = [...new Set(ops.stockItems.map((i) => i.shelf))];
  const changed = ops.stockItems.filter((i) => (stockLevel(ops, i.id) ?? 0) !== (values[i.id] ?? 0)).length;

  const bump = (item: ProStockItem, dir: 1 | -1) => {
    const step = countStep(item.unit);
    setValues((prev) => ({ ...prev, [item.id]: Math.max(0, Math.round(((prev[item.id] ?? 0) + dir * step) * 100) / 100) }));
  };

  const save = () => {
    const count = { id: localId("sc"), at: new Date().toISOString(), by: by.trim(), night: nightOf(now), counts: values };
    void setOps("stock.count", (o) => ({ ...o, stockCounts: [...o.stockCounts, count] }));
    const after = stockRows({ ...ops, stockCounts: [...ops.stockCounts, count] });
    const rare = after.filter((r) => r.unusual).length;
    const low = after.filter((r) => r.below).length;
    toast.success(
      "Recuento guardado",
      `${rare ? `${rare} ${rare === 1 ? "producto ha" : "productos han"} bajado más de lo normal. ` : ""}${low} por debajo del mínimo.`,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      wide
      title="Contar la barra"
      description="Empieza con lo que debería haber. Toca más o menos hasta que coincida con lo que ves."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!by.trim()}>
            <Check className="h-4 w-4" /> Guardar recuento
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Quién cuenta">
          <SignerChips value={by} onChange={setBy} />
        </FormField>
        {shelves.map((shelf) => (
          <section key={shelf}>
            <p className="eyebrow mb-1">{shelf}</p>
            <ul className="divide-y divide-border-light">
              {ops.stockItems
                .filter((i) => i.shelf === shelf)
                .map((item) => {
                  const expected = stockLevel(ops, item.id) ?? 0;
                  const value = values[item.id] ?? 0;
                  const diff = Math.round((value - expected) * 100) / 100;
                  return (
                    <li key={item.id} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.name}</span>
                        <span className={cn("block text-xs", diff ? "text-amber-700 dark:text-amber-400" : "text-text-muted")}>
                          {diff ? `${diff > 0 ? "+" : ""}${diff.toLocaleString("es-ES")} sobre lo esperado` : `Esperado ${expected.toLocaleString("es-ES")}`}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Menos ${item.name}`}
                        onClick={() => bump(item, -1)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary hover:border-text-primary/25 hover:text-text-primary"
                      >
                        <Minus className="h-4 w-4" strokeWidth={1.9} />
                      </button>
                      <span className="w-14 shrink-0 text-center font-heading text-lg font-bold tabular" aria-live="polite">
                        {value.toLocaleString("es-ES")}
                      </span>
                      <button
                        type="button"
                        aria-label={`Más ${item.name}`}
                        onClick={() => bump(item, 1)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary hover:border-text-primary/25 hover:text-text-primary"
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.9} />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
        <p className="text-xs text-text-muted">
          {changed ? `${changed} ${changed === 1 ? "producto cambia" : "productos cambian"} respecto a lo esperado.` : "Todo coincide con lo esperado."} Las botellas y los barriles se cuentan por cuartos.
        </p>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Pedido a proveedores                                                */
/* ------------------------------------------------------------------ */

function OrderView() {
  const { data } = usePro();
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const suggestion = suggestedOrder(ops);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const onTheWay = ops.orders.filter((o) => o.status === "sent").sort((a, b) => b.at.localeCompare(a.at));

  const qtyOf = (itemId: string, fallback: number) => qty[itemId] ?? fallback;

  const send = (supplier: ProSupplier, lines: { item: ProStockItem; qty: number }[]) => {
    void setOps("order.send", (o) => ({
      ...o,
      orders: [
        ...o.orders,
        {
          id: localId("po"),
          supplierId: supplier.id,
          at: new Date().toISOString(),
          lines: lines.map((l) => ({ itemId: l.item.id, qty: l.qty })),
          status: "sent",
        },
      ],
    }));
    toast.success(`Pedido a ${supplier.name}`, "Queda en camino hasta que lo marques como recibido.");
  };

  const receive = (orderId: string) => {
    void setOps("order.receive", (o) => ({
      ...o,
      orders: o.orders.map((x) => (x.id === orderId ? { ...x, status: "received", receivedAt: new Date().toISOString() } : x)),
    }));
    toast.success("Pedido recibido", "Se suma a tus existencias.");
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        {suggestion.length ? (
          suggestion.map(({ supplier, lines }) => {
            const final = lines.map((l) => ({ item: l.item, qty: qtyOf(l.item.id, l.qty) })).filter((l) => l.qty > 0);
            const total = final.reduce((a, l) => a + l.qty * l.item.costCents, 0);
            const href = customerWhatsApp(supplier.phone, orderMessage(data.space, supplier, final));
            return (
              <Panel
                key={supplier.id}
                title={supplier.name}
                description={`${supplier.contact} · ${supplier.supplies}`}
                flush
              >
                <RowList>
                  {lines.map((l) => {
                    const value = qtyOf(l.item.id, l.qty);
                    const level = stockLevel(ops, l.item.id) ?? 0;
                    return (
                      <div key={l.item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{l.item.name}</span>
                          <span className="block truncate text-xs text-text-muted">
                            Quedan {level.toLocaleString("es-ES")}, mínimo {l.item.par}, objetivo {l.item.target}
                            {l.item.packSize > 1 ? ` · de ${l.item.packSize} en ${l.item.packSize}` : ""}
                          </span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Pedir menos ${l.item.name}`}
                          onClick={() => setQty((p) => ({ ...p, [l.item.id]: Math.max(0, value - Math.max(1, l.item.packSize)) }))}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary hover:text-text-primary"
                        >
                          <Minus className="h-4 w-4" strokeWidth={1.9} />
                        </button>
                        <span className="w-20 shrink-0 text-center text-sm font-semibold tabular">{unitLabel(l.item.unit, value)}</span>
                        <button
                          type="button"
                          aria-label={`Pedir más ${l.item.name}`}
                          onClick={() => setQty((p) => ({ ...p, [l.item.id]: value + Math.max(1, l.item.packSize) }))}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary hover:text-text-primary"
                        >
                          <Plus className="h-4 w-4" strokeWidth={1.9} />
                        </button>
                      </div>
                    );
                  })}
                </RowList>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-light px-4 py-3 sm:px-5">
                  <span className="text-sm text-text-muted">
                    Unos <span className="font-semibold text-text-primary">{money(total, { round: true })}</span> a precio de coste
                  </span>
                  {href ? (
                    <Button asChild variant="dark" size="sm">
                      <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => send(supplier, final)}>
                        <MessageCircle className="h-3.5 w-3.5" /> Enviar por WhatsApp
                      </a>
                    </Button>
                  ) : (
                    <Button variant="dark" size="sm" onClick={() => send(supplier, final)} disabled={!final.length}>
                      Marcar como pedido
                    </Button>
                  )}
                </div>
              </Panel>
            );
          })
        ) : (
          <Panel>
            <Empty
              icon={PackageCheck}
              title="Nada que pedir"
              body="Todo está por encima del mínimo. Cuando un producto baje, aparecerá aquí con la cantidad para volver al objetivo, en cajas completas."
            />
          </Panel>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="En camino" description="Pedidos enviados que aún no han llegado." flush>
          {onTheWay.length ? (
            <RowList>
              {onTheWay.map((o) => {
                const s = ops.suppliers.find((x) => x.id === o.supplierId);
                return (
                  <div key={o.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s?.name ?? "Proveedor"}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {o.lines
                          .map((l) => {
                            const item = ops.stockItems.find((i) => i.id === l.itemId);
                            return item ? `${unitLabel(item.unit, l.qty)} de ${item.name}` : `${l.qty}`;
                          })
                          .join(", ")}{" "}
                        · pedido {relative(o.at)}
                      </span>
                    </span>
                    <Button variant="outline" size="sm" onClick={() => receive(o.id)} className="shrink-0">
                      <Check className="h-3.5 w-3.5" /> Recibido
                    </Button>
                  </div>
                );
              })}
            </RowList>
          ) : (
            <Empty icon={Truck} title="Nada en camino" body="Al enviar un pedido quedará aquí hasta que llegue." className="py-8" />
          )}
        </Panel>
        <Tip title="Pide por cajas y a día fijo">
          El pedido redondea a cajas completas y no repite lo que ya está en camino. Si pides siempre el mismo día, el proveedor lo tiene listo y no te quedas sin hielo el jueves.
        </Tip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Proveedores                                                         */
/* ------------------------------------------------------------------ */

function SuppliersView({ onEdit }: { onEdit: (s: ProSupplier | "new") => void }) {
  const { ops } = useNightOps();
  return (
    <Panel
      title="Proveedores"
      description="A quién pides cada cosa. El pedido sale escrito a su WhatsApp."
      action={
        <Button variant="ghost" size="sm" onClick={() => onEdit("new")}>
          <Plus className="h-3.5 w-3.5" /> Proveedor
        </Button>
      }
      flush
    >
      {ops.suppliers.length ? (
        <RowList>
          {ops.suppliers.map((s) => {
            const items = ops.stockItems.filter((i) => i.supplierId === s.id).length;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onEdit(s)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
              >
                <Truck className="h-4 w-4 shrink-0 text-text-secondary" strokeWidth={1.9} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {s.contact} · {s.phone} · {s.supplies}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {items} {items === 1 ? "producto" : "productos"}
                </span>
              </button>
            );
          })}
        </RowList>
      ) : (
        <Empty
          icon={Truck}
          title="Sin proveedores"
          body="Añade a quien te sirve la cerveza, los licores y el hielo. Con su teléfono, el pedido se envía por WhatsApp en un toque."
          action={
            <Button variant="dark" onClick={() => onEdit("new")}>
              <Plus className="h-4 w-4" /> Añadir proveedor
            </Button>
          }
        />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Fichas de producto y proveedor                                      */
/* ------------------------------------------------------------------ */

const UNITS: { value: ProStockUnit; label: string }[] = [
  { value: "botella", label: "Botella" },
  { value: "barril", label: "Barril" },
  { value: "caja", label: "Caja" },
  { value: "unidad", label: "Unidad" },
];

function ItemDrawer({ item, onClose }: { item: ProStockItem | "new" | null; onClose: () => void }) {
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const isNew = item === "new";
  const current = item && item !== "new" ? item : null;
  const [name, setName] = React.useState("");
  const [shelf, setShelf] = React.useState("");
  const [unit, setUnit] = React.useState<ProStockUnit>("botella");
  const [par, setPar] = React.useState("3");
  const [target, setTarget] = React.useState("8");
  const [pack, setPack] = React.useState("6");
  const [supplierId, setSupplierId] = React.useState("");
  const [cost, setCost] = React.useState("");

  React.useEffect(() => {
    if (!item) return;
    const it = item === "new" ? null : item;
    setName(it?.name ?? "");
    setShelf(it?.shelf ?? ops.stockItems[0]?.shelf ?? "Botellero");
    setUnit(it?.unit ?? "botella");
    setPar(String(it?.par ?? 3));
    setTarget(String(it?.target ?? 8));
    setPack(String(it?.packSize ?? 6));
    setSupplierId(it?.supplierId ?? ops.suppliers[0]?.id ?? "");
    setCost(it ? eurosInput(it.costCents) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) return <Drawer open={false} onOpenChange={() => onClose()} title="Producto">{null}</Drawer>;

  const series = current ? usageSeries(ops, current.id).slice(-8) : [];
  const shelves = [...new Set([...ops.stockItems.map((i) => i.shelf), "Botellero", "Nevera", "Cámara", "Almacén"])];
  const valid = name.trim().length > 1 && Number(target) >= Number(par);

  const save = () => {
    const next: ProStockItem = {
      id: current?.id ?? localId("st"),
      name: name.trim(),
      shelf: shelf.trim() || "Botellero",
      unit,
      par: Math.max(0, Number(par.replace(",", ".")) || 0),
      target: Math.max(0, Number(target.replace(",", ".")) || 0),
      packSize: Math.max(1, Number(pack) || 1),
      supplierId,
      costCents: euros(cost),
    };
    void setOps(isNew ? "stock.item_create" : "stock.item_update", (o) => ({
      ...o,
      stockItems: isNew ? [...o.stockItems, next] : o.stockItems.map((i) => (i.id === next.id ? next : i)),
    }));
    toast.success(isNew ? "Producto añadido" : "Producto guardado", isNew ? "Aparecerá en el próximo recuento." : undefined);
    onClose();
  };

  const remove = () => {
    if (!current) return;
    void setOps("stock.item_delete", (o) => ({ ...o, stockItems: o.stockItems.filter((i) => i.id !== current.id) }));
    toast.success("Producto quitado de la barra");
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={isNew ? "Nuevo producto" : current?.name}
      description="Mínimo para pedir, objetivo al reponer y de cuánto en cuánto lo sirve el proveedor."
      footer={
        <>
          {current ? (
            <Button variant="ghost" onClick={remove}>
              Quitar
            </Button>
          ) : null}
          <Button variant="dark" onClick={save} disabled={!valid}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {series.length > 1 ? (
          <section>
            <p className="eyebrow mb-2">Lo que bajó noche a noche</p>
            <Bars values={series} className="h-20" format={(v) => v.toLocaleString("es-ES")} />
          </section>
        ) : null}
        <FormField label="Nombre" htmlFor="it-name">
          <input id="it-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ginebra de la casa" className={inputClass} />
        </FormField>
        <FormField label="Dónde está">
          <ChoiceChips value={shelf} onChange={setShelf} options={shelves.map((s) => ({ value: s, label: s }))} />
        </FormField>
        <FormField label="Se cuenta por">
          <ChoiceChips value={unit} onChange={setUnit} options={UNITS} />
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Mínimo" htmlFor="it-par">
            <input id="it-par" inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Objetivo" htmlFor="it-target">
            <input id="it-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Caja de" htmlFor="it-pack">
            <input id="it-pack" inputMode="numeric" value={pack} onChange={(e) => setPack(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Coste por unidad (€)" htmlFor="it-cost">
            <input id="it-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        {ops.suppliers.length ? (
          <FormField label="Proveedor">
            <ChoiceChips value={supplierId} onChange={setSupplierId} options={ops.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          </FormField>
        ) : null}
        {current ? (
          <div className="divide-y divide-border-light">
            <Detail label="Ahora hay">{unitLabel(current.unit, stockLevel(ops, current.id) ?? 0)}</Detail>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

function SupplierDrawer({ supplier, onClose }: { supplier: ProSupplier | "new" | null; onClose: () => void }) {
  const { setOps } = useNightOps();
  const toast = useToast();
  const isNew = supplier === "new";
  const current = supplier && supplier !== "new" ? supplier : null;
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [supplies, setSupplies] = React.useState("");

  React.useEffect(() => {
    if (!supplier) return;
    const s = supplier === "new" ? null : supplier;
    setName(s?.name ?? "");
    setContact(s?.contact ?? "");
    setPhone(s?.phone ?? "");
    setSupplies(s?.supplies ?? "");
  }, [supplier]);

  if (!supplier) return <Drawer open={false} onOpenChange={() => onClose()} title="Proveedor">{null}</Drawer>;
  const valid = name.trim().length > 1 && contact.trim().length > 1 && Boolean(customerWhatsApp(phone, "x"));

  const save = () => {
    const next: ProSupplier = {
      id: current?.id ?? localId("sup"),
      name: name.trim(),
      contact: contact.trim(),
      phone: phone.trim(),
      supplies: supplies.trim(),
    };
    void setOps(isNew ? "supplier.create" : "supplier.update", (o) => ({
      ...o,
      suppliers: isNew ? [...o.suppliers, next] : o.suppliers.map((s) => (s.id === next.id ? next : s)),
    }));
    toast.success(isNew ? "Proveedor añadido" : "Proveedor guardado");
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={isNew ? "Nuevo proveedor" : current?.name}
      footer={
        <Button variant="dark" onClick={save} disabled={!valid}>
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Empresa" htmlFor="sp-name">
          <input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Distribuciones Soler" className={inputClass} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Persona de contacto" htmlFor="sp-contact">
            <input id="sp-contact" value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="WhatsApp" htmlFor="sp-phone" hint={phone && !customerWhatsApp(phone, "x") ? "Revisa el número" : undefined}>
            <input id="sp-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="600 000 000" className={inputClass} />
          </FormField>
        </div>
        <FormField label="Qué te sirve" htmlFor="sp-supplies">
          <input id="sp-supplies" value={supplies} onChange={(e) => setSupplies(e.target.value)} placeholder="Cerveza, barriles y refrescos" className={inputClass} />
        </FormField>
      </div>
    </Drawer>
  );
}
