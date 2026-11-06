import React from "react";
import { Linking, Text, View } from "react-native";
import { MessageCircle, PackageCheck, Plus, ShoppingBasket, Trash2, Truck } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProPurchaseOrder, ProShoppingLine, ProStockItem, ProSupplier } from "../../../../../shared/pro/tables-types";
import { lowStock, nextDelivery, shoppingBySupplier, stockValue, supplierMessage } from "../../../../../shared/pro/tables-ops";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import { dayLabel, localDate, localMinutes, minutesToLabel, money, plural, relative } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  ChoiceGrid,
  Empty,
  Field,
  IconButton,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Sheet,
  Stepper,
  Tip,
} from "../../kit";
import { OpsMissing, staffFirstName, useTablesOps } from "./ops";
import { Card, PickList } from "./ui";

/**
 * Lista de la compra, inventario y proveedores, versión nativa de
 * web/.../tables/compras.tsx: cualquiera apunta lo que falta durante el
 * turno, se agrupa por proveedor y sale por WhatsApp en un toque.
 */

type Tab = "lista" | "inventario" | "proveedores";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export default function TablesCompras() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("lista");
  if (!ops) {
    return (
      <ProPage>
        <PageHeader eyebrow="Compras" title="Lista de la compra" />
        <OpsMissing icon={ShoppingBasket} title="Sin compras todavía" />
      </ProPage>
    );
  }
  const low = lowStock(ops);
  const groups = shoppingBySupplier(ops);

  return (
    <ProPage>
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
        <Segmented<Tab>
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
        <Kpi
          icon={Truck}
          label="Pedidos esta semana"
          value={ops.purchaseOrders.filter((p) => Date.parse(p.sentAt) > now.getTime() - 7 * 86_400_000).length}
        />
        <Kpi label="Valor del almacén" value={money(stockValue(ops), { round: true })} hint="según el último recuento" />
      </KpiRow>

      {tab === "lista" ? <ListTab /> : tab === "inventario" ? <StockTab /> : <SuppliersTab />}
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de la compra                                                   */
/* ------------------------------------------------------------------ */

function ListTab() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const [name, setName] = React.useState("");
  const [qty, setQty] = React.useState(1);
  const [unit, setUnit] = React.useState("ud");
  const [supplierId, setSupplierId] = React.useState(ops?.suppliers[0]?.id ?? "");
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const low = lowStock(ops).filter(({ item }) => !ops.shopping.some((l) => l.itemId === item.id));
  const groups = shoppingBySupplier(ops);
  const needle = name.trim().toLowerCase();
  const matches =
    needle.length > 1 && !ops.stock.some((i) => i.name.toLowerCase() === needle)
      ? ops.stock.filter((i) => i.name.toLowerCase().includes(needle)).slice(0, 4)
      : [];

  const add = async (entry: Omit<ProShoppingLine, "id" | "addedAt">) => {
    const line: ProShoppingLine = { ...entry, id: localId("l"), addedAt: now.toISOString(), addedBy: data.staff[0]?.id };
    if (!(await save("shopping.add", (o) => ({ ...o, shopping: [...o.shopping, line] })))) return false;
    toast("Apuntado", { kind: "success", body: `${entry.qty} ${entry.unit} de ${entry.name.toLowerCase()}.` });
    return true;
  };

  const remove = (id: string) => save("shopping.remove", (o) => ({ ...o, shopping: o.shopping.filter((l) => l.id !== id) }));

  const send = async (supplier: ProSupplier, lines: ProShoppingLine[]) => {
    const order: ProPurchaseOrder = {
      id: localId("po"),
      supplierId: supplier.id,
      sentAt: now.toISOString(),
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit })),
      received: false,
    };
    const href = customerWhatsApp(supplier.phone, supplierMessage(supplier, lines, data.space.name));
    const ok = await save("shopping.send", (o) => ({
      ...o,
      purchaseOrders: [order, ...o.purchaseOrders],
      shopping: o.shopping.filter((l) => l.supplierId !== supplier.id),
    }));
    if (!ok) return;
    if (href) {
      void Linking.openURL(href).catch(() => toast("No se ha podido abrir WhatsApp", { kind: "error" }));
      toast("Pedido preparado", { kind: "success", body: `Envíalo en WhatsApp a ${supplier.name}.` });
    } else {
      toast("Marcado como pedido", { kind: "success", body: supplier.name });
    }
  };

  return (
    <>
      <Panel title="Apunta lo que falta" description="Cualquiera del equipo puede hacerlo durante el turno.">
        <View style={{ gap: S.md }}>
          <Input label="Qué falta" value={name} onChangeText={setName} placeholder="Limones, barril, vasos..." />
          {matches.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {matches.map((m) => (
                <PButton
                  key={m.id}
                  label={m.name}
                  variant="outline"
                  small
                  onPress={() => {
                    setName(m.name);
                    setUnit(m.unit);
                    setSupplierId(m.supplierId);
                  }}
                />
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
            <Stepper label="Cantidad" value={qty} min={1} onChange={setQty} />
            <View style={{ flex: 1 }}>
              <Input label="Unidad" value={unit} onChangeText={setUnit} />
            </View>
          </View>
          {ops.suppliers.length ? (
            <Field label="Proveedor">
              <PickList value={supplierId} onChange={setSupplierId} options={ops.suppliers.map((s) => ({ value: s.id, label: s.name, detail: s.category }))} />
            </Field>
          ) : (
            <PText v="small">Añade antes un proveedor en la pestaña Proveedores.</PText>
          )}
          <PButton
            label="Añadir a la lista"
            icon={Plus}
            full
            disabled={name.trim().length < 2 || !supplierId}
            onPress={async () => {
              const item = ops.stock.find((i) => i.name === name.trim());
              if (await add({ name: name.trim(), qty, unit: unit.trim() || "ud", supplierId, itemId: item?.id })) {
                setName("");
                setQty(1);
              }
            }}
          />
        </View>
      </Panel>

      {groups.length ? (
        groups.map(({ supplier, lines }) => {
          const next = nextDelivery(supplier, today, nowMin);
          const hasPhone = Boolean(customerWhatsApp(supplier.phone, "."));
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
              {lines.map((l) => (
                <ListRow key={l.id}>
                  <Text style={{ width: 70, fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.2}>
                    {`${l.qty} `}
                    <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: C.muted }}>{l.unit}</Text>
                  </Text>
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>
                      {l.name}
                    </PText>
                    <PText v="tiny">{staffFirstName(data, l.addedBy)}</PText>
                  </View>
                  <IconButton icon={Trash2} label={`Quitar ${l.name}`} onPress={() => void remove(l.id)} />
                </ListRow>
              ))}
              <View style={{ padding: S.lg }}>
                <PButton
                  label={hasPhone ? "Enviar pedido por WhatsApp" : "Marcar como pedido"}
                  icon={hasPhone ? MessageCircle : undefined}
                  full
                  onPress={() => void send(supplier, lines)}
                />
              </View>
            </Panel>
          );
        })
      ) : (
        <Panel>
          <Empty
            icon={ShoppingBasket}
            title="La lista está vacía"
            body="Cuando alguien vea que se acaba algo, lo apunta aquí. Al cerrar, lo mandas a cada proveedor en un toque."
          />
        </Panel>
      )}

      <Panel title="Por debajo del mínimo" flush>
        {low.length ? (
          low.map(({ item, suggest }, i) => (
            <ListRow key={item.id} last={i === low.length - 1}>
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>
                  {item.name}
                </PText>
                <PText v="tiny">{`Quedan ${item.current} ${item.unit}, mínimo ${item.min}`}</PText>
              </View>
              <PButton
                label={`+ ${suggest}`}
                variant="outline"
                small
                onPress={() => void add({ name: item.name, qty: suggest, unit: item.unit, supplierId: item.supplierId, itemId: item.id })}
              />
            </ListRow>
          ))
        ) : (
          <View style={{ padding: S.lg }}>
            <PText v="small">Todo por encima del mínimo.</PText>
          </View>
        )}
      </Panel>

      <Panel title="Últimos pedidos" flush>
        {ops.purchaseOrders.length ? (
          ops.purchaseOrders.slice(0, 6).map((p, i, arr) => (
            <ListRow key={p.id} last={i === arr.length - 1}>
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>
                  {ops.suppliers.find((s) => s.id === p.supplierId)?.name ?? "Proveedor"}
                </PText>
                <PText v="tiny" numberOfLines={2}>
                  {`${relative(p.sentAt, now.getTime())}, ${p.lines.map((l) => `${l.qty} ${l.name.toLowerCase()}`).join(", ")}`}
                </PText>
              </View>
              {p.received ? (
                <Pill tone="success" label="Recibido" />
              ) : (
                <PButton
                  label="Recibido"
                  variant="outline"
                  small
                  onPress={() =>
                    void save("order.received", (o) => ({
                      ...o,
                      purchaseOrders: o.purchaseOrders.map((x) => (x.id === p.id ? { ...x, received: true } : x)),
                    }))
                  }
                />
              )}
            </ListRow>
          ))
        ) : (
          <View style={{ padding: S.lg }}>
            <PText v="small">Aún no has enviado ningún pedido.</PText>
          </View>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Inventario                                                           */
/* ------------------------------------------------------------------ */

function StockTab() {
  const { now } = usePro();
  const { ops, save } = useTablesOps();
  const [draft, setDraft] = React.useState<Record<string, number>>({});
  const [adding, setAdding] = React.useState(false);
  if (!ops) return null;
  const categories = [...new Set(ops.stock.map((i) => i.category))];
  const changed = Object.keys(draft).length;
  const value = (i: ProStockItem) => draft[i.id] ?? i.current;

  const commit = async () => {
    const at = now.toISOString();
    const ok = await save("stock.count", (o) => ({
      ...o,
      stock: o.stock.map((i) =>
        draft[i.id] === undefined ? i : { ...i, previousCount: i.current, current: draft[i.id], countedAt: at },
      ),
    }));
    if (!ok) return;
    setDraft({});
    toast("Recuento guardado", { kind: "success", body: plural(changed, "producto actualizado", "productos actualizados") });
  };

  const toList = async () => {
    const low = lowStock(ops).filter(({ item }) => !ops.shopping.some((l) => l.itemId === item.id));
    if (!low.length) {
      toast("Nada por debajo del mínimo", { kind: "info" });
      return;
    }
    const ok = await save("stock.tolist", (o) => ({
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
    if (ok) toast("Pasado a la lista", { kind: "success", body: plural(low.length, "producto", "productos") });
  };

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginBottom: S.lg }}>
        <PButton label={`Guardar recuento${changed ? ` (${changed})` : ""}`} disabled={!changed} onPress={() => void commit()} />
        <PButton label="Pasar lo que falta a la lista" variant="outline" onPress={() => void toList()} />
        <PButton label="Producto" icon={Plus} variant="ghost" onPress={() => setAdding(true)} />
      </View>
      {categories.map((category) => {
        const items = ops.stock.filter((i) => i.category === category);
        return (
          <Panel key={category} title={category} flush>
            {items.map((i, idx) => {
              const v = value(i);
              const diff = i.previousCount !== undefined ? i.current - i.previousCount : null;
              return (
                <View
                  key={i.id}
                  style={{
                    paddingHorizontal: S.lg,
                    paddingVertical: S.md,
                    gap: S.sm,
                    borderBottomWidth: idx === items.length - 1 ? 0 : 1,
                    borderBottomColor: C.borderLight,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {i.name}
                    </PText>
                    {v < i.min ? <Pill tone="warning" label="Bajo mínimo" /> : null}
                  </View>
                  <PText v="tiny">
                    {`Mínimo ${i.min} ${i.unit}${diff !== null && diff !== 0 ? `, ${diff > 0 ? "+" : ""}${diff} desde el último recuento` : ""}${i.countedAt ? `, contado ${relative(i.countedAt, now.getTime())}` : ""}`}
                  </PText>
                  <Stepper
                    label={`Cantidad de ${i.name}`}
                    value={v}
                    format={(n) => `${n} ${i.unit.length <= 3 ? i.unit : ""}`.trim()}
                    onChange={(n) => setDraft((d) => ({ ...d, [i.id]: n }))}
                  />
                </View>
              );
            })}
          </Panel>
        );
      })}
      {!ops.stock.length ? (
        <Panel>
          <Empty
            icon={PackageCheck}
            title="Sin inventario"
            body="Añade lo que compras a menudo con su mínimo. Lo que baje del mínimo pasa a la lista de la compra."
          />
        </Panel>
      ) : null}
      <Tip title="Recuento rápido">
        Una vez por semana, con el local cerrado: toca más o menos en cada producto y guarda. Verás cuánto se ha gastado desde el último recuento.
      </Tip>
      <StockSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function StockSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ops, save } = useTablesOps();
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
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!ops) return null;
  const submit = async () => {
    const item: ProStockItem = {
      id: localId("k"),
      name: name.trim(),
      category: category.trim() || "Otros",
      supplierId,
      unit: unit.trim() || "ud",
      min,
      current,
      costCents: 0,
    };
    if (!(await save("stock.add", (o) => ({ ...o, stock: [...o.stock, item] })))) return;
    toast("Producto añadido", { kind: "success", body: item.name });
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo producto del inventario"
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" disabled={name.trim().length < 2 || !supplierId} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Nombre">
        <Input label="Nombre" value={name} onChangeText={setName} />
      </Field>
      <Field label="Categoría">
        <Input label="Categoría" value={category} onChangeText={setCategory} />
      </Field>
      <Field label="Unidad">
        <Input label="Unidad" value={unit} onChangeText={setUnit} />
      </Field>
      <Field label="Mínimo">
        <Stepper label="Mínimo" value={min} onChange={setMin} />
      </Field>
      <Field label="Hay ahora">
        <Stepper label="Hay ahora" value={current} onChange={setCurrent} />
      </Field>
      <Field label="Proveedor">
        <PickList value={supplierId} onChange={setSupplierId} options={ops.suppliers.map((s) => ({ value: s.id, label: s.name, detail: s.category }))} empty="Añade antes un proveedor." />
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Proveedores                                                          */
/* ------------------------------------------------------------------ */

function SuppliersTab() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  const [editing, setEditing] = React.useState<ProSupplier | "new" | null>(null);
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  return (
    <>
      <View style={{ marginBottom: S.lg }}>
        <PButton label="Nuevo proveedor" icon={Plus} onPress={() => setEditing("new")} />
      </View>
      {ops.suppliers.map((s) => {
        const next = nextDelivery(s, today, nowMin);
        return (
          <Tap key={s.id} onPress={() => setEditing(s)} accessibilityRole="button" accessibilityLabel={`Editar ${s.name}`}>
            <Card style={{ gap: S.sm }}>
              <PText v="h2">{s.name}</PText>
              <PText v="tiny">{`${s.category}${s.phone ? `, ${s.phone}` : ""}`}</PText>
              <View style={{ flexDirection: "row", gap: 4 }} accessibilityLabel="Días de reparto">
                {WEEKDAYS.map((d, i) => {
                  const on = s.deliveryDays.includes(i);
                  return (
                    <View
                      key={d}
                      style={{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.text : C.input }}
                    >
                      <Text style={{ fontFamily: FONT.heading, fontSize: 12, color: on ? C.bg : C.muted }} maxFontSizeMultiplier={1.2}>
                        {d}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <PText v="small">
                {`${next ? `Próximo reparto: ${dayLabel(`${next}T12:00:00Z`)}` : "Sin días de reparto"}${s.orderBefore !== undefined ? `. Pedidos antes de las ${minutesToLabel(s.orderBefore)}` : ""}`}
              </PText>
            </Card>
          </Tap>
        );
      })}
      {!ops.suppliers.length ? (
        <Panel>
          <Empty icon={Truck} title="Sin proveedores" body="Apunta a quién le compras y qué días reparte: la lista de la compra se agrupa por proveedor." />
        </Panel>
      ) : null}
      <SupplierSheet supplier={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function SupplierSheet({ supplier, onClose }: { supplier: ProSupplier | "new" | null; onClose: () => void }) {
  const { save } = useTablesOps();
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
  if (!supplier) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const submit = async () => {
    const next: ProSupplier = {
      id: supplier === "new" ? localId("p") : supplier.id,
      name: name.trim(),
      category: category.trim() || "General",
      phone: phone.trim() || undefined,
      deliveryDays: [...days].sort(),
      orderBefore: before === "none" ? undefined : Number(before) * 60,
    };
    const ok = await save("supplier.save", (o) => ({
      ...o,
      suppliers: supplier === "new" ? [...o.suppliers, next] : o.suppliers.map((s) => (s.id === next.id ? next : s)),
    }));
    if (!ok) return;
    toast("Proveedor guardado", { kind: "success", body: next.name });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={supplier === "new" ? "Nuevo proveedor" : supplier.name}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" disabled={name.trim().length < 2} onPress={() => void submit()} />
        </>
      }
    >
      <Field label="Nombre">
        <Input label="Nombre" value={name} onChangeText={setName} />
      </Field>
      <Field label="Qué te sirve">
        <Input label="Qué te sirve" value={category} onChangeText={setCategory} placeholder="Bebidas, pescado, pan..." />
      </Field>
      <Field label="WhatsApp o teléfono">
        <Input label="WhatsApp o teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="600 000 000" />
      </Field>
      <Field label="Días de reparto">
        <View style={{ flexDirection: "row", gap: 6 }}>
          {WEEKDAYS.map((d, i) => {
            const on = days.includes(i);
            return (
              <Tap
                key={d}
                onPress={() => setDays((prev) => (on ? prev.filter((x) => x !== i) : [...prev, i]))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Reparte el ${["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][i]}`}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: R.md,
                  borderWidth: 1,
                  borderColor: on ? C.text : C.border,
                  backgroundColor: on ? C.text : C.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: FONT.heading, fontSize: 14, color: on ? C.bg : C.muted }} maxFontSizeMultiplier={1.2}>
                  {d}
                </Text>
              </Tap>
            );
          })}
        </View>
      </Field>
      <Field label="Hora límite para pedir">
        <ChoiceGrid
          value={before}
          onChange={setBefore}
          options={[
            { value: "none", label: "Sin hora" },
            { value: "12", label: "12:00" },
            { value: "18", label: "18:00" },
            { value: "20", label: "20:00" },
          ]}
        />
      </Field>
    </Sheet>
  );
}
