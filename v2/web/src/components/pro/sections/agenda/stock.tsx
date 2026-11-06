"use client";

import * as React from "react";
import { DoorOpen, Package, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import type { ProCabin, ProProduct } from "@/lib/pro/agenda-types";
import {
  adjustStock,
  lowStock,
  orderGroups,
  orderMessage,
  removeProduct,
  saveProduct,
  suggestedOrder,
} from "@/lib/pro/agenda-money";
import { removeCabin, saveCabin } from "@/lib/pro/agenda-ops";
import { money } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  Meter,
  Panel,
  Pill,
  Segmented,
  inputClass,
} from "../../kit";
import {
  NotYet,
  Stepper,
  WhatsAppButton,
  eurosText,
  parseEuros,
  useAgenda,
} from "./parts";

/* ------------------------------------------------------------------ */
/* Productos y stock                                                   */
/* ------------------------------------------------------------------ */

export function ProductsPanel({
  adding,
  onAdded,
}: {
  adding: boolean;
  onAdded: () => void;
}) {
  const { data, ops, run, allowed } = useAgenda();
  const [filter, setFilter] = React.useState<"all" | "retail" | "tech">("all");
  const [editing, setEditing] = React.useState<ProProduct | "new" | null>(null);

  React.useEffect(() => {
    if (adding) {
      setEditing("new");
      onAdded();
    }
  }, [adding, onAdded]);

  if (!ops) return <NotYet icon={Package} title="Aún no tienes productos" />;

  const products = ops.products.filter(
    (p) => filter === "all" || p.kind === filter,
  );
  const low = lowStock(ops.products);
  const groups = orderGroups(ops.products);
  const retail = ops.products.filter((p) => p.kind === "retail");
  const stockValue = ops.products.reduce(
    (t, p) => t + p.costCents * p.stock,
    0,
  );
  const margin = retail.length
    ? Math.round(
        (retail.reduce(
          (t, p) =>
            t + (p.priceCents - p.costCents) / Math.max(1, p.priceCents),
          0,
        ) /
          retail.length) *
          100,
      )
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <KpiRow>
        <Kpi
          icon={Package}
          label="Productos"
          value={ops.products.length}
          hint={`${retail.length} de venta`}
        />
        <Kpi
          label="Bajo mínimo"
          value={low.length}
          hint={low.length ? "toca pedir" : "todo en orden"}
          emphasis={low.length > 0}
        />
        <Kpi
          label="Valor en estantería"
          value={money(stockValue, { round: true })}
          hint="a precio de coste"
        />
        <Kpi
          label="Margen de venta"
          value={`${margin} %`}
          hint="media de reventa"
        />
      </KpiRow>

      {groups.length ? (
        <Panel
          title="Pedido al proveedor"
          description="Lo que está por debajo del mínimo, agrupado por proveedor. Se pide el doble del mínimo."
          flush
        >
          <ul className="divide-y divide-border-light">
            {groups.map((group) => (
              <li
                key={group.name}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5"
              >
                <Truck
                  className="h-4 w-4 shrink-0 text-text-muted"
                  strokeWidth={1.9}
                />
                <span className="min-w-[11rem] flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {group.name}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {group.items
                      .map((item) => `${suggestedOrder(item)} x ${item.name}`)
                      .join(", ")}
                  </span>
                </span>
                <WhatsAppButton
                  phone={group.supplier?.phone}
                  share={!group.supplier?.phone}
                  message={orderMessage(data, group.name, group.items)}
                  label="Pedir"
                  variant="dark"
                />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel
        title="Estantería"
        action={
          <Segmented
            size="sm"
            label="Tipo"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Todo" },
              { value: "retail", label: "Venta" },
              { value: "tech", label: "Técnico" },
            ]}
          />
        }
        flush
      >
        {products.length ? (
          <ul className="divide-y divide-border-light">
            {products.map((product) => {
              const under = product.stock <= product.min;
              return (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
                >
                  <button
                    type="button"
                    onClick={() => setEditing(product)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {product.name}
                      </span>
                      {under ? <Pill tone="warning">Bajo mínimo</Pill> : null}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {product.brand ? `${product.brand} · ` : ""}
                      {product.kind === "retail"
                        ? `${money(product.priceCents)} venta · ${money(product.costCents)} coste`
                        : `Técnico · ${money(product.costCents)} coste`}
                    </span>
                    <Meter
                      value={product.stock}
                      max={Math.max(product.min * 2, product.stock, 1)}
                      tone={under ? "warning" : "success"}
                      className="mt-2 max-w-48"
                    />
                  </button>
                  <Stepper
                    label={`Existencias de ${product.name}`}
                    value={product.stock}
                    onChange={(n) => {
                      if (allowed("agenda.product"))
                        void run("agenda.product", (d) =>
                          adjustStock(d, product.id, n - product.stock),
                        );
                    }}
                    suffix="ud"
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            icon={Package}
            title="Añade lo que vendes y lo que gastas"
            body="Champús, ceras o cremas para vender al cobrar, y tintes o material técnico para saber cuándo pedir."
            action={
              <Button variant="dark" onClick={() => setEditing("new")}>
                Añadir producto
              </Button>
            }
          />
        )}
      </Panel>

      <ProductDrawer value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ProductDrawer({
  value,
  onClose,
}: {
  value: ProProduct | "new" | null;
  onClose: () => void;
}) {
  const { run, allowed } = useAgenda();
  const toast = useToast();
  const base = value === "new" ? null : value;
  const [name, setName] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [kind, setKind] = React.useState<ProProduct["kind"]>("retail");
  const [price, setPrice] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [stock, setStock] = React.useState(0);
  const [min, setMin] = React.useState(2);
  const [supplier, setSupplier] = React.useState("");
  const [supplierPhone, setSupplierPhone] = React.useState("");

  React.useEffect(() => {
    if (!value) return;
    setName(base?.name ?? "");
    setBrand(base?.brand ?? "");
    setKind(base?.kind ?? "retail");
    setPrice(base?.priceCents ? eurosText(base.priceCents) : "");
    setCost(base?.costCents ? eurosText(base.costCents) : "");
    setStock(base?.stock ?? 0);
    setMin(base?.min ?? 2);
    setSupplier(base?.supplier?.name ?? "");
    setSupplierPhone(base?.supplier?.phone ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const priceCents = parseEuros(price) ?? 0;
  const valid = name.trim().length > 1 && (kind === "tech" || priceCents > 0);

  const save = async () => {
    const product: ProProduct = {
      id: base?.id ?? localId("pr"),
      name: name.trim(),
      brand: brand.trim() || undefined,
      kind,
      priceCents: kind === "retail" ? priceCents : 0,
      costCents: parseEuros(cost) ?? 0,
      stock,
      min,
      supplier: supplier.trim()
        ? { name: supplier.trim(), phone: supplierPhone.trim() || undefined }
        : undefined,
    };
    if (await run("agenda.product", (d) => saveProduct(d, product))) {
      toast.success(
        base ? "Producto guardado" : "Producto añadido",
        product.name,
      );
      onClose();
    }
  };

  return (
    <Drawer
      open={Boolean(value)}
      onOpenChange={(v) => !v && onClose()}
      title={base ? "Editar producto" : "Nuevo producto"}
      footer={
        <>
          {base ? (
            <Button
              variant="ghost"
              className="mr-auto text-rose-600"
              disabled={!allowed("agenda.product")}
              onClick={async () => {
                if (
                  await run("agenda.product", (d) => removeProduct(d, base.id))
                ) {
                  toast.success("Producto quitado", base.name);
                  onClose();
                }
              }}
            >
              Quitar
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            disabled={!valid || !allowed("agenda.product")}
            onClick={save}
          >
            Guardar producto
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Tipo">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={[
              {
                value: "retail",
                label: "Para vender",
                hint: "Se cobra en Caja",
              },
              { value: "tech", label: "Técnico", hint: "Lo gastas tú" },
            ]}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Producto" htmlFor="pr-name">
            <input
              id="pr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Marca" htmlFor="pr-brand">
            <input
              id="pr-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {kind === "retail" ? (
            <FormField label="Precio de venta (€)" htmlFor="pr-price">
              <input
                id="pr-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </FormField>
          ) : null}
          <FormField label="Coste (€)" htmlFor="pr-cost">
            <input
              id="pr-cost"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-6">
          <FormField label="Existencias">
            <Stepper label="Existencias" value={stock} onChange={setStock} />
          </FormField>
          <FormField label="Mínimo">
            <Stepper label="Mínimo" value={min} onChange={setMin} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Proveedor" htmlFor="pr-sup">
            <input
              id="pr-sup"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Su WhatsApp" htmlFor="pr-sup-phone">
            <input
              id="pr-sup-phone"
              inputMode="tel"
              value={supplierPhone}
              onChange={(e) => setSupplierPhone(e.target.value)}
              className={inputClass}
            />
          </FormField>
        </div>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Cabinas y máquinas                                                  */
/* ------------------------------------------------------------------ */

export function CabinsPanel({
  adding,
  onAdded,
}: {
  adding: boolean;
  onAdded: () => void;
}) {
  const { data, ops, run, allowed } = useAgenda();
  const toast = useToast();
  const [editing, setEditing] = React.useState<ProCabin | "new" | null>(null);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<ProCabin["kind"]>("room");

  React.useEffect(() => {
    if (adding) {
      setEditing("new");
      onAdded();
    }
  }, [adding, onAdded]);

  React.useEffect(() => {
    if (!editing) return;
    setName(editing === "new" ? "" : editing.name);
    setKind(editing === "new" ? "room" : editing.kind);
  }, [editing]);

  if (!ops) return <NotYet icon={DoorOpen} title="Aún no tienes cabinas" />;
  const base = editing === "new" ? null : editing;

  return (
    <div className="flex flex-col gap-5">
      <Panel flush>
        {ops.cabins.length ? (
          <ul className="divide-y divide-border-light">
            {ops.cabins.map((cabin) => {
              const services = data.services.filter(
                (s) => s.agenda?.cabinId === cabin.id,
              );
              return (
                <li key={cabin.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(cabin)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-bg-secondary sm:px-5"
                  >
                    <DoorOpen
                      className="h-4 w-4 shrink-0 text-text-muted"
                      strokeWidth={1.9}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {cabin.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {services.length
                          ? services.map((s) => s.name).join(", ")
                          : "Ningún tratamiento la usa todavía"}
                      </span>
                    </span>
                    <Pill>
                      {cabin.kind === "machine" ? "Máquina" : "Cabina"}
                    </Pill>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            icon={DoorOpen}
            title="Da de alta tus cabinas y máquinas"
            body="Después, en cada tratamiento dices cuál ocupa. La agenda no dejará dos citas a la vez en la misma."
            action={
              <Button variant="dark" onClick={() => setEditing("new")}>
                Añadir cabina
              </Button>
            }
          />
        )}
      </Panel>

      <Drawer
        open={Boolean(editing)}
        onOpenChange={(v) => !v && setEditing(null)}
        title={base ? "Editar cabina" : "Nueva cabina o máquina"}
        footer={
          <>
            {base ? (
              <Button
                variant="ghost"
                className="mr-auto text-rose-600"
                disabled={!allowed("agenda.cabin")}
                onClick={async () => {
                  if (
                    await run("agenda.cabin", (d) => removeCabin(d, base.id))
                  ) {
                    toast.success("Cabina quitada", base.name);
                    setEditing(null);
                  }
                }}
              >
                Quitar
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              variant="dark"
              disabled={name.trim().length < 2 || !allowed("agenda.cabin")}
              onClick={async () => {
                const cabin: ProCabin = {
                  id: base?.id ?? localId("cb"),
                  name: name.trim(),
                  kind,
                };
                if (await run("agenda.cabin", (d) => saveCabin(d, cabin))) {
                  toast.success(
                    base ? "Cabina guardada" : "Cabina añadida",
                    cabin.name,
                  );
                  setEditing(null);
                }
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <FormField label="Nombre" htmlFor="cb-name">
            <input
              id="cb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cabina 1, Láser de diodo..."
              className={inputClass}
            />
          </FormField>
          <FormField label="Qué es">
            <ChoiceChips
              value={kind}
              onChange={setKind}
              options={[
                { value: "room", label: "Cabina o sala" },
                { value: "machine", label: "Máquina" },
              ]}
            />
          </FormField>
          <p className={cn("text-sm text-text-muted")}>
            Asígnala en cada tratamiento, en Vuelta, pose, cabina y señal.
          </p>
        </div>
      </Drawer>
    </div>
  );
}
