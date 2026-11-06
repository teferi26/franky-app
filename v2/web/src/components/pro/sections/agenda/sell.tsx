"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import type { ProClient, ProPayment } from "@/lib/pro/types";
import {
  applyCheckout,
  giftCode,
  sellBundle,
  sellGiftCard,
} from "@/lib/pro/agenda-money";
import { addDays, localDate, money } from "@/lib/pro/format";
import {
  ChoiceChips,
  Drawer,
  FormField,
  Segmented,
  inputClass,
} from "../../kit";
import {
  OptionButton,
  Stepper,
  parseEuros,
  qtyLabel,
  useAgenda,
} from "./parts";

type Kind = "product" | "bundle" | "gift";
type Method = ProPayment["method"];

const METHODS: { value: Method; label: string }[] = [
  { value: "card", label: "Tarjeta" },
  { value: "cash", label: "Efectivo" },
  { value: "bizum", label: "Bizum" },
];

/**
 * Vender sin cita: un producto de la estantería, un bono de sesiones o una
 * tarjeta regalo. Todo entra en la caja del día.
 */
export function SellDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, now, ops, run, allowed } = useAgenda();
  const toast = useToast();
  const [kind, setKind] = React.useState<Kind>("product");
  const [method, setMethod] = React.useState<Method>("card");
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [buyer, setBuyer] = React.useState("");
  const [client, setClient] = React.useState<ProClient | null>(null);
  const [serviceId, setServiceId] = React.useState("");
  const [sessions, setSessions] = React.useState(5);
  const [price, setPrice] = React.useState("");
  const [recipient, setRecipient] = React.useState("");
  const [amount, setAmount] = React.useState("30");

  React.useEffect(() => {
    if (!open) return;
    setKind("product");
    setMethod("card");
    setQty({});
    setBuyer("");
    setClient(null);
    setServiceId(data.services.find((s) => s.priceCents > 0)?.id ?? "");
    setSessions(5);
    setPrice("");
    setRecipient("");
    setAmount("30");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!ops) return null;
  const retail = ops.products.filter((p) => p.kind === "retail");
  const lines = retail
    .filter((p) => (qty[p.id] ?? 0) > 0)
    .map((product) => ({ product, qty: qty[product.id] }));
  const productTotal = lines.reduce(
    (t, l) => t + l.product.priceCents * l.qty,
    0,
  );
  const service = data.services.find((s) => s.id === serviceId);
  // Precio sugerido del bono: las sesiones con un 10 % menos, redondeado.
  const suggested = service
    ? Math.round((service.priceCents * sessions * 0.9) / 500) * 500
    : 0;
  const bundlePrice = parseEuros(price) ?? suggested;
  const giftAmount = parseEuros(amount) ?? 0;
  const matches =
    buyer.trim().length >= 2 && !client
      ? data.clients
          .filter((c) =>
            c.name.toLowerCase().includes(buyer.trim().toLowerCase()),
          )
          .slice(0, 4)
      : [];
  const name = client?.name ?? buyer.trim();
  const at = () => new Date().toISOString();

  const total =
    kind === "product"
      ? productTotal
      : kind === "bundle"
        ? bundlePrice
        : giftAmount;
  const valid =
    kind === "product"
      ? lines.length > 0
      : kind === "bundle"
        ? Boolean(client && service && bundlePrice > 0)
        : giftAmount > 0 && name.length > 1;

  const save = async () => {
    let ok = false;
    if (kind === "product") {
      ok = await run("agenda.sale", (d) =>
        applyCheckout(d, {
          paymentId: localId("p"),
          at: at(),
          clientId: client?.id,
          clientName: name || "Venta en mostrador",
          draft: {
            serviceCents: 0,
            products: lines,
            discount: { kind: "none" },
            useBundle: false,
            depositPaidCents: 0,
            giftCardCents: 0,
            tipCents: 0,
          },
          method,
        }),
      );
    } else if (kind === "bundle" && client && service) {
      const label = `Bono ${sessions} ${service.name.toLowerCase()}`;
      ok = await run("agenda.bundle", (d) =>
        sellBundle(
          d,
          {
            id: localId("bn"),
            clientId: client.id,
            clientName: client.name,
            serviceId: service.id,
            label,
            sessions,
            used: 0,
            priceCents: bundlePrice,
            soldAt: at(),
            expiresAt: addDays(localDate(now), 365),
            moves: [],
          },
          { paymentId: localId("p"), method },
        ),
      );
    } else if (kind === "gift") {
      const code = giftCode(Math.random);
      ok = await run("agenda.gift", (d) =>
        sellGiftCard(
          d,
          {
            id: localId("gc"),
            code,
            amountCents: giftAmount,
            balanceCents: giftAmount,
            buyer: name,
            recipient: recipient.trim() || undefined,
            soldAt: at(),
            expiresAt: addDays(localDate(now), 365),
          },
          { paymentId: localId("p"), method },
        ),
      );
      if (ok)
        toast.success(
          `Tarjeta regalo ${code}`,
          "Apunta el código en la tarjeta: se canjea al cobrar.",
        );
    }
    if (!ok) return;
    if (kind !== "gift") toast.success("Venta registrada", money(total));
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Vender"
      description="Sin cita: entra en la caja de hoy."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            disabled={
              !valid ||
              !allowed(
                kind === "product"
                  ? "agenda.sale"
                  : kind === "bundle"
                    ? "agenda.bundle"
                    : "agenda.gift",
              )
            }
            onClick={save}
          >
            Cobrar {money(total)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Segmented
          label="Qué vendes"
          value={kind}
          onChange={setKind}
          options={[
            { value: "product", label: "Producto" },
            { value: "bundle", label: "Bono" },
            { value: "gift", label: "Tarjeta regalo" },
          ]}
        />

        <FormField
          label={kind === "gift" ? "Quién la compra" : "Cliente"}
          htmlFor="sell-buyer"
          hint={kind === "product" ? "Opcional." : undefined}
        >
          {client ? (
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
              <span className="truncate font-semibold">{client.name}</span>
              <button
                type="button"
                onClick={() => setClient(null)}
                className="inline-flex h-10 items-center text-xs font-semibold text-violet"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                id="sell-buyer"
                autoComplete="off"
                value={buyer}
                onChange={(e) => setBuyer(e.target.value)}
                placeholder="Nombre"
                className={inputClass}
              />
              {matches.length ? (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-bg-primary shadow-float">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setClient(c)}
                        className="flex min-h-10 w-full items-center px-3 text-left text-sm hover:bg-bg-secondary"
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </FormField>

        {kind === "product" ? (
          retail.length ? (
            <ul className="divide-y divide-border-light rounded-2xl border border-border">
              {retail.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {product.name}
                    </span>
                    <span className="text-xs text-text-muted">
                      {money(product.priceCents)} · quedan {qtyLabel(product.stock)}
                    </span>
                  </span>
                  <Stepper
                    label={`Unidades de ${product.name}`}
                    value={qty[product.id] ?? 0}
                    max={product.stock}
                    onChange={(n) =>
                      setQty((prev) => ({ ...prev, [product.id]: n }))
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">
              Añade productos de venta en Servicios, pestaña Productos.
            </p>
          )
        ) : null}

        {kind === "bundle" ? (
          <>
            <FormField label="Servicio">
              <ChoiceChips
                value={serviceId}
                onChange={setServiceId}
                options={data.services
                  .filter((s) => s.priceCents > 0)
                  .map((s) => ({ value: s.id, label: s.name }))}
              />
            </FormField>
            <FormField label="Sesiones">
              <div className="flex flex-wrap gap-2">
                {[3, 5, 6, 8, 10].map((n) => (
                  <OptionButton
                    key={n}
                    active={sessions === n}
                    onClick={() => setSessions(n)}
                  >
                    {n}
                  </OptionButton>
                ))}
              </div>
            </FormField>
            <FormField
              label="Precio del bono (€)"
              htmlFor="sell-price"
              hint={
                service
                  ? `Sueltas serían ${money(service.priceCents * sessions)}. Te sugerimos ${money(suggested)}.`
                  : undefined
              }
            >
              <input
                id="sell-price"
                inputMode="decimal"
                value={price}
                placeholder={(suggested / 100).toFixed(0)}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </FormField>
            {!client ? (
              <p className="text-sm text-text-muted">
                Elige a quién se lo vendes: el bono queda en su ficha y se
                descuenta solo al cobrar.
              </p>
            ) : null}
          </>
        ) : null}

        {kind === "gift" ? (
          <>
            <FormField label="Importe">
              <div className="flex flex-wrap gap-2">
                {["20", "30", "50"].map((v) => (
                  <OptionButton
                    key={v}
                    active={amount === v}
                    onClick={() => setAmount(v)}
                  >
                    {v} €
                  </OptionButton>
                ))}
                <input
                  inputMode="decimal"
                  aria-label="Otro importe"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${inputClass} w-24`}
                />
              </div>
            </FormField>
            <FormField
              label="Para quién"
              htmlFor="sell-recipient"
              hint="Opcional."
            >
              <input
                id="sell-recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className={inputClass}
              />
            </FormField>
            <p className="text-sm text-text-muted">
              Al cobrar te damos un código corto. Vale un año y se canjea al
              cobrar cualquier cita.
            </p>
          </>
        ) : null}

        <FormField label="Cobrado con">
          <ChoiceChips value={method} onChange={setMethod} options={METHODS} />
        </FormField>
      </div>
    </Drawer>
  );
}
