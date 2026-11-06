import React from "react";
import { Alert, Text, View } from "react-native";
import { AlertTriangle, Beer, Check, ClipboardList, MessageCircle, Minus, PackageCheck, Plus, Truck } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProStockItem, ProStockUnit, ProSupplier } from "../../../../../shared/pro/night-types";
import { money, relative, shortDay } from "../../../../../shared/pro/format";
import { nightOf } from "../../../../../shared/pro/night";
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
} from "../../../../../shared/pro/night-ops";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { Bars, ChoiceGrid, Detail, Empty, Field, Input, Kpi, KpiRow, ListRow, Meter, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, Stepper, Tip } from "../../kit";
import { SignerChips, defaultSigner, euros, eurosInput, openWhatsApp, useNightOps } from "./ops-ui";

/**
 * Barra: existencias, recuento en dos minutos, pedido sugerido por WhatsApp y
 * proveedores. Versión nativa de web/.../night/barra.tsx.
 */

type Tab = "stock" | "pedido" | "proveedores";

const UNIT_PLURAL: Record<ProStockUnit, string> = { botella: "botellas", barril: "barriles", caja: "cajas", unidad: "unidades" };

export default function NightBarra() {
  const { now } = usePro();
  const { ops } = useNightOps();
  const [tab, setTab] = React.useState<Tab>("stock");
  const [counting, setCounting] = React.useState(false);
  const [item, setItem] = React.useState<ProStockItem | "new" | null>(null);
  const [supplier, setSupplier] = React.useState<ProSupplier | "new" | null>(null);

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
    <ProPage>
      <PageHeader
        eyebrow="Barra"
        title="Barra y pedidos"
        description={description}
        actions={<PButton label="Contar la barra" icon={ClipboardList} onPress={() => setCounting(true)} disabled={!ops.stockItems.length} />}
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
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
        <Kpi label="Bajo mínimo" value={below.length} hint={below.length ? "Pasan al pedido" : "Nada que pedir"} onPress={() => setTab("pedido")} />
        <Kpi label="Recuentos" value={counts.length} hint={last ? `Último ${shortDay(last.at)}` : "Ninguno todavía"} />
        <Kpi icon={Truck} label="En camino" value={onTheWay.length} hint={onTheWay.length ? "Pedidos sin recibir" : "Sin pedidos pendientes"} />
      </KpiRow>

      {tab === "stock" ? (
        <StockView rows={rows} onEdit={setItem} onNew={() => setItem("new")} />
      ) : tab === "pedido" ? (
        <OrderView />
      ) : (
        <SuppliersView onEdit={setSupplier} />
      )}

      <CountSheet open={counting} onClose={() => setCounting(false)} />
      <ItemSheet item={item} onClose={() => setItem(null)} />
      <SupplierSheet supplier={supplier} onClose={() => setSupplier(null)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Existencias                                                         */
/* ------------------------------------------------------------------ */

function StockView({ rows, onEdit, onNew }: { rows: StockRow[]; onEdit: (item: ProStockItem) => void; onNew: () => void }) {
  if (!rows.length) {
    return (
      <Panel>
        <Empty
          icon={Beer}
          title="Tu barra está vacía"
          body="Añade tus botellas, barriles y cajas con el mínimo por debajo del cual hay que pedir. Con dos recuentos Franky ya compara."
          action={<PButton label="Añadir producto" icon={Plus} onPress={onNew} />}
        />
      </Panel>
    );
  }
  const unusual = rows.filter((r) => r.unusual);
  const shelves = [...new Set(rows.map((r) => r.item.shelf))];
  return (
    <>
      {unusual.length ? (
        <Panel title="Para mirar" description="Lo que bajó bastante más que en los recuentos anteriores." flush>
          {unusual.map((r, i) => (
            <ListRow key={r.item.id} last={i === unusual.length - 1} onPress={() => onEdit(r.item)} accessibilityLabel={r.item.name}>
              <AlertTriangle size={16} color={C.warning} strokeWidth={1.9} />
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{r.item.name}</PText>
                <PText v="tiny">
                  {`Bajó ${unitLabel(r.item.unit, r.lastUsed ?? 0)} y lo normal es ${(r.avgUsed ?? 0).toLocaleString("es-ES")}. Unos ${money(
                    Math.round(((r.lastUsed ?? 0) - (r.avgUsed ?? 0)) * r.item.costCents),
                    { round: true },
                  )} de más a precio de coste.`}
                </PText>
              </View>
            </ListRow>
          ))}
        </Panel>
      ) : null}
      {shelves.map((shelf, si) => {
        const list = rows.filter((r) => r.item.shelf === shelf);
        return (
          <Panel key={shelf} title={shelf} flush action={si === 0 ? <PButton label="Producto" icon={Plus} variant="ghost" small onPress={onNew} /> : undefined}>
            {list.map((r, i) => (
              <ListRow key={r.item.id} last={i === list.length - 1} onPress={() => onEdit(r.item)} accessibilityLabel={`${r.item.name}, ${r.level ?? 0} ${UNIT_PLURAL[r.item.unit]}`}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{r.item.name}</PText>
                    {r.unusual ? <Pill label="Bajada rara" tone="warning" /> : null}
                    {r.below ? <Pill label="Pedir" tone="danger" /> : null}
                  </View>
                  <Meter value={r.level ?? 0} max={Math.max(r.item.target, r.level ?? 0)} tone={r.below ? "danger" : r.unusual ? "warning" : "violet"} />
                  <PText v="tiny" numberOfLines={1}>
                    {`${
                      r.lastUsed !== null
                        ? `Última noche bajó ${unitLabel(r.item.unit, r.lastUsed)}${r.avgUsed !== null ? `, lo normal ${r.avgUsed.toLocaleString("es-ES")}` : ""}`
                        : "Sin comparar todavía"
                    } · mínimo ${r.item.par.toLocaleString("es-ES")}`}
                  </PText>
                </View>
                <View style={{ alignItems: "flex-end", minWidth: 56 }}>
                  <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.3}>
                    {r.level === null ? "Sin contar" : r.level.toLocaleString("es-ES")}
                  </Text>
                  <PText v="tiny">{UNIT_PLURAL[r.item.unit]}</PText>
                </View>
              </ListRow>
            ))}
          </Panel>
        );
      })}
      <Tip title="Cuenta siempre a la misma hora">
        Al cerrar y antes de reponer. Así cada recuento es una noche y la comparación es justa. Una bajada rara puede ser una botella rota, copas mal servidas o invitaciones sin apuntar.
      </Tip>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Recuento                                                            */
/* ------------------------------------------------------------------ */

/** Botón cuadrado de más o menos (40 px para el dedo, también de madrugada). */
function StepButton({ icon: Icon, label, onPress }: { icon: typeof Plus; label: string; onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 44, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", backgroundColor: C.surface }}
    >
      <Icon size={17} color={C.text} strokeWidth={1.9} />
    </Tap>
  );
}

function CountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
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

  const save = async () => {
    const count = { id: localId("sc"), at: new Date().toISOString(), by: by.trim(), night: nightOf(now), counts: values };
    const ok = await setOps("stock.count", (o) => ({ ...o, stockCounts: [...o.stockCounts, count] }));
    if (!ok) return;
    const after = stockRows({ ...ops, stockCounts: [...ops.stockCounts, count] });
    const rare = after.filter((r) => r.unusual).length;
    const low = after.filter((r) => r.below).length;
    toast("Recuento guardado", {
      kind: "success",
      body: `${rare ? `${rare} ${rare === 1 ? "producto ha" : "productos han"} bajado más de lo normal. ` : ""}${low} por debajo del mínimo.`,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Contar la barra"
      description="Empieza con lo que debería haber. Toca más o menos hasta que coincida con lo que ves."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar recuento" icon={Check} onPress={() => void save()} disabled={!by.trim()} />
        </>
      }
    >
      <Field label="Quién cuenta">
        <SignerChips value={by} onChange={setBy} />
      </Field>
      {shelves.map((shelf) => (
        <View key={shelf} style={{ gap: 2 }}>
          <PText v="label">{shelf}</PText>
          {ops.stockItems
            .filter((i) => i.shelf === shelf)
            .map((item) => {
              const expected = stockLevel(ops, item.id) ?? 0;
              const value = values[item.id] ?? 0;
              const diff = Math.round((value - expected) * 100) / 100;
              return (
                <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{item.name}</PText>
                    <PText v="tiny" color={diff ? C.warning : C.muted}>
                      {diff ? `${diff > 0 ? "+" : ""}${diff.toLocaleString("es-ES")} sobre lo esperado` : `Esperado ${expected.toLocaleString("es-ES")}`}
                    </PText>
                  </View>
                  <StepButton icon={Minus} label={`Menos ${item.name}`} onPress={() => bump(item, -1)} />
                  <Text style={{ width: 52, textAlign: "center", fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.3}>
                    {value.toLocaleString("es-ES")}
                  </Text>
                  <StepButton icon={Plus} label={`Más ${item.name}`} onPress={() => bump(item, 1)} />
                </View>
              );
            })}
        </View>
      ))}
      <PText v="tiny">
        {`${changed ? `${changed} ${changed === 1 ? "producto cambia" : "productos cambian"} respecto a lo esperado.` : "Todo coincide con lo esperado."} Las botellas y los barriles se cuentan por cuartos.`}
      </PText>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Pedido a proveedores                                                */
/* ------------------------------------------------------------------ */

function OrderView() {
  const { data } = usePro();
  const { ops, setOps } = useNightOps();
  const suggestion = suggestedOrder(ops);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const onTheWay = ops.orders.filter((o) => o.status === "sent").sort((a, b) => b.at.localeCompare(a.at));
  const qtyOf = (itemId: string, fallback: number) => qty[itemId] ?? fallback;

  const send = async (supplier: ProSupplier, lines: { item: ProStockItem; qty: number }[]) => {
    const ok = await setOps("order.send", (o) => ({
      ...o,
      orders: [
        ...o.orders,
        { id: localId("po"), supplierId: supplier.id, at: new Date().toISOString(), lines: lines.map((l) => ({ itemId: l.item.id, qty: l.qty })), status: "sent" },
      ],
    }));
    if (!ok) return;
    const phone = customerWhatsApp(supplier.phone, "x") ? supplier.phone : undefined;
    if (phone) openWhatsApp(orderMessage(data.space, supplier, lines), phone);
    toast(`Pedido a ${supplier.name}`, { kind: "success", body: "Queda en camino hasta que lo marques como recibido." });
  };

  const receive = async (orderId: string) => {
    const ok = await setOps("order.receive", (o) => ({
      ...o,
      orders: o.orders.map((x) => (x.id === orderId ? { ...x, status: "received", receivedAt: new Date().toISOString() } : x)),
    }));
    if (ok) toast("Pedido recibido", { kind: "success", body: "Se suma a tus existencias." });
  };

  return (
    <>
      {suggestion.length ? (
        suggestion.map(({ supplier, lines }) => {
          const final = lines.map((l) => ({ item: l.item, qty: qtyOf(l.item.id, l.qty) })).filter((l) => l.qty > 0);
          const total = final.reduce((a, l) => a + l.qty * l.item.costCents, 0);
          const hasPhone = Boolean(customerWhatsApp(supplier.phone, "x"));
          return (
            <Panel key={supplier.id} title={supplier.name} description={`${supplier.contact} · ${supplier.supplies}`} flush>
              {lines.map((l) => {
                const value = qtyOf(l.item.id, l.qty);
                const level = stockLevel(ops, l.item.id) ?? 0;
                const step = Math.max(1, l.item.packSize);
                return (
                  <ListRow key={l.item.id}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <PText v="h3" numberOfLines={1}>{l.item.name}</PText>
                      <PText v="tiny" numberOfLines={2}>
                        {`Quedan ${level.toLocaleString("es-ES")}, mínimo ${l.item.par}, objetivo ${l.item.target}${l.item.packSize > 1 ? ` · de ${l.item.packSize} en ${l.item.packSize}` : ""}`}
                      </PText>
                    </View>
                    <StepButton icon={Minus} label={`Pedir menos ${l.item.name}`} onPress={() => setQty((p) => ({ ...p, [l.item.id]: Math.max(0, value - step) }))} />
                    <Text style={{ width: 64, textAlign: "center", fontFamily: FONT.semibold, fontSize: 13, color: C.text }} maxFontSizeMultiplier={1.3} numberOfLines={2}>
                      {unitLabel(l.item.unit, value)}
                    </Text>
                    <StepButton icon={Plus} label={`Pedir más ${l.item.name}`} onPress={() => setQty((p) => ({ ...p, [l.item.id]: value + step }))} />
                  </ListRow>
                );
              })}
              <View style={{ padding: S.lg, gap: S.sm }}>
                <PText v="small">{`Unos ${money(total, { round: true })} a precio de coste`}</PText>
                <PButton
                  label={hasPhone ? "Enviar por WhatsApp" : "Marcar como pedido"}
                  icon={hasPhone ? MessageCircle : Check}
                  full
                  disabled={!final.length}
                  onPress={() => void send(supplier, final)}
                />
              </View>
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
      <Panel title="En camino" description="Pedidos enviados que aún no han llegado." flush>
        {onTheWay.length ? (
          onTheWay.map((o, i) => {
            const s = ops.suppliers.find((x) => x.id === o.supplierId);
            const what = o.lines
              .map((l) => {
                const item = ops.stockItems.find((it) => it.id === l.itemId);
                return item ? `${unitLabel(item.unit, l.qty)} de ${item.name}` : `${l.qty}`;
              })
              .join(", ");
            return (
              <ListRow key={o.id} last={i === onTheWay.length - 1}>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{s?.name ?? "Proveedor"}</PText>
                  <PText v="tiny" numberOfLines={2}>{`${what} · pedido ${relative(o.at)}`}</PText>
                </View>
                <PButton label="Recibido" icon={Check} variant="outline" small onPress={() => void receive(o.id)} />
              </ListRow>
            );
          })
        ) : (
          <Empty icon={Truck} title="Nada en camino" body="Al enviar un pedido quedará aquí hasta que llegue." />
        )}
      </Panel>
      <Tip title="Pide por cajas y a día fijo">
        El pedido redondea a cajas completas y no repite lo que ya está en camino. Si pides siempre el mismo día, el proveedor lo tiene listo y no te quedas sin hielo el jueves.
      </Tip>
    </>
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
      action={<PButton label="Proveedor" icon={Plus} variant="ghost" small onPress={() => onEdit("new")} />}
      flush
    >
      {ops.suppliers.length ? (
        ops.suppliers.map((s, i) => {
          const items = ops.stockItems.filter((it) => it.supplierId === s.id).length;
          return (
            <ListRow key={s.id} last={i === ops.suppliers.length - 1} onPress={() => onEdit(s)} accessibilityLabel={s.name}>
              <Truck size={16} color={C.muted} strokeWidth={1.9} />
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="h3" numberOfLines={1}>{s.name}</PText>
                <PText v="tiny" numberOfLines={1}>{`${s.contact} · ${s.phone} · ${s.supplies}`}</PText>
              </View>
              <PText v="tiny">{`${items} ${items === 1 ? "producto" : "productos"}`}</PText>
            </ListRow>
          );
        })
      ) : (
        <Empty
          icon={Truck}
          title="Sin proveedores"
          body="Añade a quien te sirve la cerveza, los licores y el hielo. Con su teléfono, el pedido se envía por WhatsApp en un toque."
          action={<PButton label="Añadir proveedor" icon={Plus} onPress={() => onEdit("new")} />}
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

function ItemSheet({ item, onClose }: { item: ProStockItem | "new" | null; onClose: () => void }) {
  const { ops, setOps } = useNightOps();
  const isNew = item === "new";
  const current = item && item !== "new" ? item : null;
  const [name, setName] = React.useState("");
  const [shelf, setShelf] = React.useState("");
  const [unit, setUnit] = React.useState<ProStockUnit>("botella");
  const [par, setPar] = React.useState(3);
  const [target, setTarget] = React.useState(8);
  const [pack, setPack] = React.useState(6);
  const [supplierId, setSupplierId] = React.useState("");
  const [cost, setCost] = React.useState("");

  React.useEffect(() => {
    if (!item) return;
    const it = item === "new" ? null : item;
    setName(it?.name ?? "");
    setShelf(it?.shelf ?? ops.stockItems[0]?.shelf ?? "Botellero");
    setUnit(it?.unit ?? "botella");
    setPar(it?.par ?? 3);
    setTarget(it?.target ?? 8);
    setPack(it?.packSize ?? 6);
    setSupplierId(it?.supplierId ?? ops.suppliers[0]?.id ?? "");
    setCost(it ? eurosInput(it.costCents) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) return null;

  const series = current ? usageSeries(ops, current.id).slice(-8) : [];
  const shelves = [...new Set([...ops.stockItems.map((i) => i.shelf), "Botellero", "Nevera", "Cámara", "Almacén"])];
  const valid = name.trim().length > 1 && target >= par;

  const save = async () => {
    const next: ProStockItem = {
      id: current?.id ?? localId("st"),
      name: name.trim(),
      shelf: shelf.trim() || "Botellero",
      unit,
      par,
      target,
      packSize: Math.max(1, pack),
      supplierId,
      costCents: euros(cost),
    };
    const ok = await setOps(isNew ? "stock.item_create" : "stock.item_update", (o) => ({
      ...o,
      stockItems: isNew ? [...o.stockItems, next] : o.stockItems.map((i) => (i.id === next.id ? next : i)),
    }));
    if (!ok) return;
    toast(isNew ? "Producto añadido" : "Producto guardado", { kind: "success", body: isNew ? "Aparecerá en el próximo recuento." : undefined });
    onClose();
  };

  const remove = () => {
    if (!current) return;
    Alert.alert(`¿Quitar ${current.name} de la barra?`, "Deja de salir en los recuentos y en los pedidos.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar",
        style: "destructive",
        onPress: async () => {
          const ok = await setOps("stock.item_delete", (o) => ({ ...o, stockItems: o.stockItems.filter((i) => i.id !== current.id) }));
          if (!ok) return;
          toast("Producto quitado de la barra", { kind: "success" });
          onClose();
        },
      },
    ]);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? "Nuevo producto" : current?.name ?? "Producto"}
      description="Mínimo para pedir, objetivo al reponer y de cuánto en cuánto lo sirve el proveedor."
      footer={
        <>
          {current ? <PButton label="Quitar" variant="ghost" onPress={remove} /> : null}
          <PButton label="Guardar" onPress={() => void save()} disabled={!valid} />
        </>
      }
    >
      {series.length > 1 ? (
        <View style={{ gap: S.sm }}>
          <PText v="label">Lo que bajó noche a noche</PText>
          <Bars values={series} height={80} format={(v) => v.toLocaleString("es-ES")} />
        </View>
      ) : null}
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} placeholder="Ginebra de la casa" label="Nombre del producto" />
      </Field>
      <Field label="Dónde está">
        <ChoiceGrid value={shelf} onChange={setShelf} options={shelves.map((s) => ({ value: s, label: s }))} />
      </Field>
      <Field label="Se cuenta por">
        <ChoiceGrid value={unit} onChange={setUnit} options={UNITS} />
      </Field>
      <Field label="Mínimo" hint="Por debajo, pasa al pedido.">
        <Stepper value={par} onChange={setPar} min={0} max={500} label="mínimo" />
      </Field>
      <Field label="Objetivo" hint={target < par ? "Tiene que ser igual o mayor que el mínimo." : "Hasta aquí se repone."}>
        <Stepper value={target} onChange={setTarget} min={0} max={1000} label="objetivo" />
      </Field>
      <Field label="Caja de">
        <Stepper value={pack} onChange={setPack} min={1} max={48} label="unidades por caja" />
      </Field>
      <Field label="Coste por unidad (€)">
        <Input value={cost} onChangeText={setCost} keyboardType="decimal-pad" label="Coste por unidad en euros" />
      </Field>
      {ops.suppliers.length ? (
        <Field label="Proveedor">
          <ChoiceGrid value={supplierId} onChange={setSupplierId} options={ops.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
      ) : null}
      {current ? <Detail label="Ahora hay" value={unitLabel(current.unit, stockLevel(ops, current.id) ?? 0)} last /> : null}
    </Sheet>
  );
}

function SupplierSheet({ supplier, onClose }: { supplier: ProSupplier | "new" | null; onClose: () => void }) {
  const { setOps } = useNightOps();
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

  if (!supplier) return null;
  const phoneOk = Boolean(customerWhatsApp(phone, "x"));
  const valid = name.trim().length > 1 && contact.trim().length > 1 && phoneOk;

  const save = async () => {
    const next: ProSupplier = { id: current?.id ?? localId("sup"), name: name.trim(), contact: contact.trim(), phone: phone.trim(), supplies: supplies.trim() };
    const ok = await setOps(isNew ? "supplier.create" : "supplier.update", (o) => ({
      ...o,
      suppliers: isNew ? [...o.suppliers, next] : o.suppliers.map((s) => (s.id === next.id ? next : s)),
    }));
    if (!ok) return;
    toast(isNew ? "Proveedor añadido" : "Proveedor guardado", { kind: "success" });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={isNew ? "Nuevo proveedor" : current?.name ?? "Proveedor"} footer={<PButton label="Guardar" onPress={() => void save()} disabled={!valid} />}>
      <Field label="Empresa">
        <Input value={name} onChangeText={setName} placeholder="Distribuciones Soler" label="Empresa" />
      </Field>
      <Field label="Persona de contacto">
        <Input value={contact} onChangeText={setContact} label="Persona de contacto" autoCapitalize="words" />
      </Field>
      <Field label="WhatsApp" hint={phone && !phoneOk ? "Revisa el número" : undefined}>
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="600 000 000" label="WhatsApp del proveedor" />
      </Field>
      <Field label="Qué te sirve">
        <Input value={supplies} onChangeText={setSupplies} placeholder="Cerveza, barriles y refrescos" label="Qué te sirve" />
      </Field>
    </Sheet>
  );
}
