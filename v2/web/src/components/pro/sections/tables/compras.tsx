"use client";

import * as React from "react";
import { PackageCheck, Plus, ShoppingBasket, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type {
  ProPurchaseOrder,
  ProShoppingLine,
  ProStockItem,
  ProSupplier,
} from "@/lib/pro/tables-types";
import {
  lowStock,
  nextDelivery,
  shoppingBySupplier,
  stockValue,
  supplierMessage,
} from "@/lib/pro/tables-ops";
import {
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  relative,
} from "@/lib/pro/format";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  IconButton,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import { OpsMissing, Stepper, staffFirstName, useTablesOps } from "./ops-kit";

type Tab = "lista" | "inventario" | "proveedores";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export default function TablesCompras() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("lista");
  if (!ops) return <OpsMissing icon={ShoppingBasket} title="Sin compras todavía" />;
  const low = lowStock(ops);
  const groups = shoppingBySupplier(ops);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Compras"
        title="Lista de la compra"
        description={
          ops.shopping.length
            ? `${plural(ops.shopping.length, "cosa apuntada", "cosas apuntadas")} para ${plural(groups.length, "proveedor", "proveedores")}. Se envía por WhatsApp agrupada por proveedor.`
            : low.length
              ? `${plural(low.length, "producto está", "productos están")} por debajo del mínimo.`
              : "Nada pendiente. Apunta lo que falte durante el turno."
        }
      >
        <Segmented
          label="Apartado"
          value={tab}
          onChange={setTab}
          options={[
            { value: "lista", label: "Lista", count: ops.shopping.length },
            { value: "inventario", label: "Inventario", count: low.length || undefined },
            { value: "proveedores", label: "Proveedores", count: ops.suppliers.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={ShoppingBasket} label="En la lista" value={ops.shopping.length} hint="pendiente de pedir" emphasis={ops.shopping.length > 0} />
        <Kpi icon={PackageCheck} label="Bajo mínimo" value={low.length} hint={low.length ? "revisa el inventario" : "todo en orden"} />
        <Kpi icon={Truck} label="Pedidos esta semana" value={ops.purchaseOrders.filter((p) => Date.parse(p.sentAt) > now.getTime() - 7 * 86_400_000).length} />
        <Kpi label="Valor del almacén" value={money(stockValue(ops), { round: true })} hint="según el último recuento" />
      </KpiRow>

      {tab === "lista" ? <ListTab /> : tab === "inventario" ? <StockTab /> : <SuppliersTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de la compra                                                  */
/* ------------------------------------------------------------------ */

function ListTab() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [qty, setQty] = React.useState(1);
  const [unit, setUnit] = React.useState("ud");
  const [supplierId, setSupplierId] = React.useState(ops?.suppliers[0]?.id ?? "");
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const low = lowStock(ops).filter(
    ({ item }) => !ops.shopping.some((l) => l.itemId === item.id),
  );
  const groups = shoppingBySupplier(ops);
  const matches = name.trim().length > 1
    ? ops.stock.filter((i) => i.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 4)
    : [];

  const add = async (entry: Omit<ProShoppingLine, "id" | "addedAt">) => {
    const lineItem: ProShoppingLine = { ...entry, id: localId("l"), addedAt: now.toISOString(), addedBy: data.staff[0]?.id };
    if (!(await save("shopping.add", (o) => ({ ...o, shopping: [...o.shopping, lineItem] })))) return;
    toast.success("Apuntado", `${entry.qty} ${entry.unit} de ${entry.name.toLowerCase()}.`);
  };

  const remove = (id: string) =>
    save("shopping.remove", (o) => ({ ...o, shopping: o.shopping.filter((l) => l.id !== id) }));

  const send = async (supplier: ProSupplier, lines: ProShoppingLine[]) => {
    const order: ProPurchaseOrder = {
      id: localId("po"),
      supplierId: supplier.id,
      sentAt: now.toISOString(),
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit })),
      received: false,
    };
    await save("shopping.send", (o) => ({
      ...o,
      purchaseOrders: [order, ...o.purchaseOrders],
      shopping: o.shopping.filter((l) => l.supplierId !== supplier.id),
    }));
    toast.success("Pedido preparado", `Envíalo en WhatsApp a ${supplier.name}.`);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Apunta lo que falta" description="Cualquiera del equipo puede hacerlo durante el turno.">
          <div className="flex flex-col gap-3">
            <input
              aria-label="Qué falta"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Limones, barril, vasos..."
              className={inputClass}
            />
            {matches.length ? (
              <div className="flex flex-wrap gap-1.5">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setName(m.name);
                      setUnit(m.unit);
                      setSupplierId(m.supplierId);
                    }}
                    className="h-8 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-text-primary/25"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Stepper label="Cantidad" value={qty} onChange={setQty} min={1} />
              <input aria-label="Unidad" value={unit} onChange={(e) => setUnit(e.target.value)} className={cn(inputClass, "w-24")} />
              <select
                aria-label="Proveedor"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={cn(inputClass, "min-w-0 flex-1")}
              >
                {ops.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <Button
              variant="dark"
              className="h-11"
              disabled={name.trim().length < 2 || !supplierId}
              onClick={async () => {
                const item = ops.stock.find((i) => i.name === name.trim());
                await add({ name: name.trim(), qty, unit: unit.trim() || "ud", supplierId, itemId: item?.id });
                setName("");
                setQty(1);
              }}
            >
              <Plus className="h-4 w-4" /> Añadir a la lista
            </Button>
          </div>
        </Panel>

        {groups.length ? (
          groups.map(({ supplier, lines }) => {
            const next = nextDelivery(supplier, today, nowMin);
            const message = supplierMessage(supplier, lines, data.space.name);
            const href = customerWhatsApp(supplier.phone, message);
            return (
              <Panel
                key={supplier.id}
                title={supplier.name}
                description={
                  next
                    ? `Reparte el ${dayLabel(`${next}T12:00:00Z`)}${supplier.orderBefore !== undefined ? `. Pide antes de las ${minutesToLabel(supplier.orderBefore)}` : ""}`
                    : supplier.category
                }
                flush
              >
                <RowList>
                  {lines.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <span className="w-20 shrink-0 font-heading text-sm font-bold tabular">
                        {l.qty} <span className="font-sans text-xs font-medium text-text-muted">{l.unit}</span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{l.name}</span>
                      <span className="hidden text-xs text-text-muted sm:block">{staffFirstName(data, l.addedBy)}</span>
                      <IconButton label={`Quitar ${l.name}`} icon={Trash2} onClick={() => remove(l.id)} />
                    </div>
                  ))}
                </RowList>
                <div className="border-t border-border-light px-4 py-3 sm:px-5">
                  {href ? (
                    <Button variant="dark" className="h-11 w-full" asChild>
                      <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => send(supplier, lines)}>
                        Enviar pedido por WhatsApp
                      </a>
                    </Button>
                  ) : (
                    <Button variant="dark" className="h-11 w-full" onClick={() => send(supplier, lines)}>
                      Marcar como pedido
                    </Button>
                  )}
                </div>
              </Panel>
            );
          })
        ) : (
          <Panel>
            <Empty icon={ShoppingBasket} title="La lista está vacía" body="Cuando alguien vea que se acaba algo, lo apunta aquí. Al cerrar, lo mandas a cada proveedor en un toque." />
          </Panel>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Por debajo del mínimo" flush>
          {low.length ? (
            <RowList>
              {low.map(({ item, suggest }) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.name}</span>
                    <span className="block text-xs text-text-muted">Quedan {item.current} {item.unit}, mínimo {item.min}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10"
                    onClick={() => add({ name: item.name, qty: suggest, unit: item.unit, supplierId: item.supplierId, itemId: item.id })}
                  >
                    + {suggest}
                  </Button>
                </div>
              ))}
            </RowList>
          ) : (
            <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Todo por encima del mínimo.</p>
          )}
        </Panel>

        <Panel title="Últimos pedidos" flush>
          {ops.purchaseOrders.length ? (
            <RowList>
              {ops.purchaseOrders.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{ops.suppliers.find((s) => s.id === p.supplierId)?.name}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {relative(p.sentAt, now.getTime())} · {p.lines.map((l) => `${l.qty} ${l.name.toLowerCase()}`).join(", ")}
                    </span>
                  </span>
                  {p.received ? (
                    <Pill tone="success">Recibido</Pill>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10"
                      onClick={() => save("order.received", (o) => ({ ...o, purchaseOrders: o.purchaseOrders.map((x) => (x.id === p.id ? { ...x, received: true } : x)) }))}
                    >
                      Recibido
                    </Button>
                  )}
                </div>
              ))}
            </RowList>
          ) : (
            <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Aún no has enviado ningún pedido.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inventario                                                          */
/* ------------------------------------------------------------------ */

function StockTab() {
  const { now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [draft, setDraft] = React.useState<Record<string, number>>({});
  const [adding, setAdding] = React.useState(false);
  if (!ops) return null;
  const categories = [...new Set(ops.stock.map((i) => i.category))];
  const changed = Object.keys(draft).length;
  const value = (i: ProStockItem) => draft[i.id] ?? i.current;

  const commit = async () => {
    const at = now.toISOString();
    if (!(await save("stock.count", (o) => ({
      ...o,
      stock: o.stock.map((i) =>
        draft[i.id] === undefined ? i : { ...i, previousCount: i.current, current: draft[i.id], countedAt: at },
      ),
    })))) return;
    setDraft({});
    toast.success("Recuento guardado", plural(changed, "producto actualizado", "productos actualizados"));
  };

  const toList = async () => {
    const low = lowStock(ops).filter(({ item }) => !ops.shopping.some((l) => l.itemId === item.id));
    if (!low.length) return;
    await save("stock.tolist", (o) => ({
      ...o,
      shopping: [
        ...o.shopping,
        ...low.map(({ item, suggest }) => ({
          id: localId("l"),
          name: item.name,
          qty: suggest,
          unit: item.unit,
          supplierId: item.supplierId,
          itemId: item.id,
          addedAt: now.toISOString(),
        })),
      ],
    }));
    toast.success("Pasado a la lista", plural(low.length, "producto", "productos"));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="dark" disabled={!changed} onClick={commit}>
          Guardar recuento{changed ? ` (${changed})` : ""}
        </Button>
        <Button variant="outline" onClick={toList}>Pasar lo que falta a la lista</Button>
        <Button variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Producto
        </Button>
      </div>
      {categories.map((category) => (
        <Panel key={category} title={category} flush>
          <RowList>
            {ops.stock
              .filter((i) => i.category === category)
              .map((i) => {
                const v = value(i);
                const diff = i.previousCount !== undefined ? i.current - i.previousCount : null;
                return (
                  <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className="truncate">{i.name}</span>
                        {v < i.min ? <Pill tone="warning">Bajo mínimo</Pill> : null}
                      </span>
                      <span className="block text-xs text-text-muted">
                        Mínimo {i.min} {i.unit}
                        {diff !== null && diff !== 0 ? ` · ${diff > 0 ? "+" : ""}${diff} desde el último recuento` : ""}
                        {i.countedAt ? ` · contado ${relative(i.countedAt, now.getTime())}` : ""}
                      </span>
                    </span>
                    <Stepper
                      label={`Cantidad de ${i.name}`}
                      value={v}
                      suffix={i.unit.length <= 3 ? i.unit : undefined}
                      onChange={(n) => setDraft((d) => ({ ...d, [i.id]: n }))}
                    />
                  </div>
                );
              })}
          </RowList>
        </Panel>
      ))}
      {!ops.stock.length ? (
        <Panel>
          <Empty icon={PackageCheck} title="Sin inventario" body="Añade lo que compras a menudo con su mínimo. Lo que baje del mínimo pasa a la lista de la compra." />
        </Panel>
      ) : null}
      <Tip title="Recuento rápido">
        Una vez por semana, con el local cerrado: toca más o menos en cada producto y guarda. Verás cuánto se ha gastado desde el último recuento.
      </Tip>
      <StockDrawer open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function StockDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [unit, setUnit] = React.useState("ud");
  const [min, setMin] = React.useState(5);
  const [current, setCurrent] = React.useState(0);
  const [supplierId, setSupplierId] = React.useState("");
  React.useEffect(() => {
    if (!open) return;
    setName("");
    setCategory(ops?.stock[0]?.category ?? "Barra");
    setUnit("ud");
    setMin(5);
    setCurrent(0);
    setSupplierId(ops?.suppliers[0]?.id ?? "");
  }, [open, ops]);
  if (!ops) return null;
  const submit = async () => {
    const item: ProStockItem = { id: localId("k"), name: name.trim(), category: category.trim() || "Otros", supplierId, unit: unit.trim() || "ud", min, current, costCents: 0 };
    if (!(await save("stock.add", (o) => ({ ...o, stock: [...o.stock, item] })))) return;
    toast.success("Producto añadido", item.name);
    onClose();
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nuevo producto del inventario"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={name.trim().length < 2 || !supplierId} onClick={submit}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre" htmlFor="st-name">
          <input id="st-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Categoría" htmlFor="st-cat">
            <input id="st-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Unidad" htmlFor="st-unit">
            <input id="st-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-6">
          <FormField label="Mínimo">
            <Stepper label="Mínimo" value={min} onChange={setMin} />
          </FormField>
          <FormField label="Hay ahora">
            <Stepper label="Hay ahora" value={current} onChange={setCurrent} />
          </FormField>
        </div>
        <FormField label="Proveedor" htmlFor="st-sup">
          <select id="st-sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
            {ops.suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Proveedores                                                         */
/* ------------------------------------------------------------------ */

function SuppliersTab() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  const [editing, setEditing] = React.useState<ProSupplier | "new" | null>(null);
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="dark" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Nuevo proveedor
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ops.suppliers.map((s) => {
          const next = nextDelivery(s, today, nowMin);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setEditing(s)}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-colors hover:border-text-primary/20"
            >
              <span className="font-heading text-base font-bold">{s.name}</span>
              <span className="text-xs text-text-muted">{s.category}{s.phone ? ` · ${s.phone}` : ""}</span>
              <span className="flex gap-1" aria-label="Días de reparto">
                {WEEKDAYS.map((d, i) => (
                  <span
                    key={d}
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold",
                      s.deliveryDays.includes(i) ? "bg-text-primary text-bg-primary" : "bg-bg-secondary text-text-muted",
                    )}
                  >
                    {d}
                  </span>
                ))}
              </span>
              <span className="text-xs text-text-secondary">
                {next ? `Próximo reparto: ${dayLabel(`${next}T12:00:00Z`)}` : "Sin días de reparto"}
                {s.orderBefore !== undefined ? `. Pedidos antes de las ${minutesToLabel(s.orderBefore)}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <SupplierDrawer supplier={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function SupplierDrawer({ supplier, onClose }: { supplier: ProSupplier | "new" | null; onClose: () => void }) {
  const { save } = useTablesOps();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [days, setDays] = React.useState<number[]>([]);
  const [before, setBefore] = React.useState<"none" | "12" | "18" | "20">("none");
  React.useEffect(() => {
    if (!supplier) return;
    const s = supplier === "new" ? null : supplier;
    setName(s?.name ?? "");
    setCategory(s?.category ?? "");
    setPhone(s?.phone ?? "");
    setDays(s?.deliveryDays ?? []);
    setBefore(s?.orderBefore ? (String(s.orderBefore / 60) as "12" | "18" | "20") : "none");
  }, [supplier]);
  if (!supplier) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const submit = async () => {
    const next: ProSupplier = {
      id: supplier === "new" ? localId("p") : supplier.id,
      name: name.trim(),
      category: category.trim() || "General",
      phone: phone.trim() || undefined,
      deliveryDays: [...days].sort(),
      orderBefore: before === "none" ? undefined : Number(before) * 60,
    };
    if (!(await save("supplier.save", (o) => ({
      ...o,
      suppliers: supplier === "new" ? [...o.suppliers, next] : o.suppliers.map((s) => (s.id === next.id ? next : s)),
    })))) return;
    toast.success("Proveedor guardado", next.name);
    onClose();
  };
  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={supplier === "new" ? "Nuevo proveedor" : supplier.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={name.trim().length < 2} onClick={submit}>Guardar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre" htmlFor="sp-name">
          <input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="Qué te sirve" htmlFor="sp-cat">
          <input id="sp-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Bebidas, pescado, pan..." className={inputClass} />
        </FormField>
        <FormField label="WhatsApp o teléfono" htmlFor="sp-phone">
          <input id="sp-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="600 000 000" className={inputClass} />
        </FormField>
        <FormField label="Días de reparto">
          <div className="flex gap-1.5">
            {WEEKDAYS.map((d, i) => {
              const on = days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays((prev) => (on ? prev.filter((x) => x !== i) : [...prev, i]))}
                  className={cn(
                    "h-10 w-10 rounded-xl border text-sm font-bold",
                    on ? "border-text-primary bg-text-primary text-bg-primary" : "border-border text-text-secondary",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </FormField>
        <FormField label="Hora límite para pedir">
          <ChoiceChips
            value={before}
            onChange={setBefore}
            options={[
              { value: "none", label: "Sin hora" },
              { value: "12", label: "12:00" },
              { value: "18", label: "18:00" },
              { value: "20", label: "20:00" },
            ]}
          />
        </FormField>
      </div>
    </Drawer>
  );
}
