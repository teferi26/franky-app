"use client";

import * as React from "react";
import { Gift, Package, Star, Ticket } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import type { ProBooking, ProPayment } from "@/lib/pro/types";
import type { ProProduct } from "@/lib/pro/agenda-types";
import {
  activeBundle,
  applyCheckout,
  bundleRemaining,
  checkoutTotals,
  findGiftCard,
  METHOD_LABEL,
  type CheckoutDiscount,
} from "@/lib/pro/agenda-money";
import {
  bookingMessage,
  markAftercareSent,
  markReviewAsked,
} from "@/lib/pro/agenda-ops";
import { localDate, money } from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import { ChoiceChips, Detail, FormField, Pill, inputClass } from "../../kit";
import {
  Callout,
  OptionButton,
  Stepper,
  WhatsAppButton,
  parseEuros,
  qtyLabel,
  useAgenda,
} from "./parts";

type Method = ProPayment["method"];
type DiscountChoice = "none" | "card" | "10" | "20" | "custom";

/**
 * Cobro completo de una cita: servicio, productos, descuento, bono, señal,
 * tarjeta regalo, propina y pago mixto. El estado vive aquí para que el cajón
 * de la cita pueda poner el botón de cobrar en su pie.
 */
export function useCheckout(booking: ProBooking | null) {
  const { data, now, ops, run, can, pending } = useAgenda();
  const toast = useToast();
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [discount, setDiscount] = React.useState<DiscountChoice>("none");
  const [customDiscount, setCustomDiscount] = React.useState("");
  const [useBundle, setUseBundle] = React.useState(true);
  const [giftCode, setGiftCode] = React.useState("");
  const [tip, setTip] = React.useState("0");
  const [method, setMethod] = React.useState<Method>("card");
  const [mixed, setMixed] = React.useState(false);
  const [second, setSecond] = React.useState<Method>("cash");
  const [secondAmount, setSecondAmount] = React.useState("");

  const reset = React.useCallback(() => {
    setQty({});
    setDiscount("none");
    setCustomDiscount("");
    setUseBundle(true);
    setGiftCode("");
    setTip("0");
    setMethod("card");
    setMixed(false);
    setSecond("cash");
    setSecondAmount("");
  }, []);

  const service = data.services.find((s) => s.id === booking?.serviceId);
  const client = data.clients.find((c) => c.id === booking?.clientId);
  const date = booking ? localDate(booking.start) : localDate(now);
  const bundle = activeBundle(
    data,
    booking?.clientId,
    booking?.serviceId,
    date,
  );
  const deposit = booking?.agenda?.deposit;
  const depositPaid = deposit?.status === "paid" ? deposit.cents : 0;
  // Lo pagado antes que no sea la señal (reservas pagadas online).
  const prepaid =
    booking?.paidCents === null || !booking
      ? null
      : Math.max(0, booking.paidCents - depositPaid);
  const serviceCents =
    booking && prepaid !== null ? Math.max(0, booking.priceCents - prepaid) : 0;
  const cardPct = data.space.publicProfile.cardDiscountPct ?? 0;
  const gift =
    giftCode.trim().length >= 6 ? findGiftCard(data, giftCode) : null;
  const giftUsable =
    gift && gift.balanceCents > 0 && gift.expiresAt >= date ? gift : null;

  const products = (ops?.products ?? [])
    .filter((p) => p.kind === "retail" && (qty[p.id] ?? 0) > 0)
    .map((product) => ({ product, qty: qty[product.id] }));

  const discountValue: CheckoutDiscount =
    discount === "card"
      ? { kind: "pct", pct: cardPct, label: `Franky Card ${cardPct} %` }
      : discount === "10" || discount === "20"
        ? {
            kind: "pct",
            pct: Number(discount),
            label: `Descuento ${discount} %`,
          }
        : discount === "custom"
          ? {
              kind: "cents",
              cents: parseEuros(customDiscount) ?? 0,
              label: "Descuento",
            }
          : { kind: "none" };

  const totals = checkoutTotals({
    serviceCents,
    products,
    discount: discountValue,
    useBundle: Boolean(bundle && useBundle),
    depositPaidCents: depositPaid,
    giftCardCents: giftUsable?.balanceCents ?? 0,
    tipCents: parseEuros(tip) ?? 0,
  });

  const secondCents = mixed ? (parseEuros(secondAmount) ?? 0) : 0;
  const ready =
    Boolean(booking) &&
    prepaid !== null &&
    !pending &&
    can("booking.charge") &&
    (!mixed || (secondCents > 0 && secondCents < totals.dueCents));

  const submit = async (): Promise<boolean> => {
    if (!booking || !ready) return false;
    const at = new Date().toISOString();
    const ok = await run("booking.charge", (d) =>
      applyCheckout(d, {
        paymentId: localId("p"),
        at,
        bookingId: booking.id,
        clientId: booking.clientId,
        clientName: booking.clientName,
        staffId: booking.staffId,
        serviceId: booking.serviceId,
        serviceName: service?.name ?? "Servicio",
        draft: {
          serviceCents,
          products,
          discount: discountValue,
          useBundle: Boolean(bundle && useBundle),
          depositPaidCents: depositPaid,
          giftCardCents: giftUsable?.balanceCents ?? 0,
          tipCents: totals.tipCents,
        },
        method,
        secondary: mixed ? { method: second, cents: secondCents } : undefined,
        bundleId: bundle?.id,
        giftCardId: giftUsable?.id,
        discountLabel:
          discountValue.kind === "none" ? undefined : discountValue.label,
      }),
    );
    if (!ok) return false;
    toast.success(
      "Cobro registrado",
      totals.chargeCents
        ? `${money(totals.chargeCents)} ya cobrados con ${mixed ? "pago mixto" : METHOD_LABEL[method].toLowerCase()}`
        : "Cubierto con el bono",
    );
    return true;
  };

  return {
    booking,
    service,
    client,
    bundle,
    depositPaid,
    prepaid,
    serviceCents,
    cardPct,
    gift,
    giftUsable,
    totals,
    ready,
    submit,
    reset,
    state: {
      qty,
      setQty,
      discount,
      setDiscount,
      customDiscount,
      setCustomDiscount,
      useBundle,
      setUseBundle,
      giftCode,
      setGiftCode,
      tip,
      setTip,
      method,
      setMethod,
      mixed,
      setMixed,
      second,
      setSecond,
      secondAmount,
      setSecondAmount,
    },
  };
}

export type Checkout = ReturnType<typeof useCheckout>;

const METHODS: { value: Method; label: string }[] = [
  { value: "card", label: "Tarjeta" },
  { value: "cash", label: "Efectivo" },
  { value: "bizum", label: "Bizum" },
];

export function CheckoutFields({ checkout }: { checkout: Checkout }) {
  const { ops } = useAgenda();
  const { booking, bundle, totals, state, client } = checkout;
  if (!booking) return null;
  const retail = (ops?.products ?? []).filter((p) => p.kind === "retail");
  // Quien reserva con su Franky Card también tiene el descuento de la tarjeta.
  const cardOption =
    checkout.cardPct > 0 && (client?.cardMember || booking.source === "card");

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-bg-secondary p-4">
        <p className="text-sm text-text-muted">{booking.clientName}</p>
        <p className="mt-1 font-heading text-3xl font-extrabold tabular">
          {checkout.prepaid === null
            ? "Sin importe disponible"
            : money(totals.chargeCents)}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {totals.tipCents
            ? `${money(totals.dueCents)} y ${money(totals.tipCents)} de propina`
            : "Lo que cobras ahora"}
        </p>
      </div>

      {bundle ? (
        <label className="flex items-start gap-3 rounded-2xl border border-violet/25 bg-violet-50 p-3.5">
          <input
            type="checkbox"
            checked={state.useBundle}
            onChange={(e) => state.setUseBundle(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-violet)]"
          />
          <span className="min-w-0 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-text-primary">
              <Ticket className="h-4 w-4 text-violet" strokeWidth={1.9} />
              Descontar del {bundle.label.toLowerCase()}
            </span>
            <span className="text-text-secondary">
              Le quedan {bundleRemaining(bundle)} de {bundle.sessions}
              {bundleRemaining(bundle) === 1
                ? ". Es la última: buen momento para renovarlo."
                : "."}
            </span>
          </span>
        </label>
      ) : null}

      {retail.length ? (
        <FormField label="Productos">
          <ul className="divide-y divide-border-light rounded-2xl border border-border">
            {retail.map((product) => (
              <ProductLine
                key={product.id}
                product={product}
                qty={state.qty[product.id] ?? 0}
                onChange={(n) =>
                  state.setQty((prev) => ({ ...prev, [product.id]: n }))
                }
              />
            ))}
          </ul>
        </FormField>
      ) : null}

      <FormField label="Descuento">
        <div className="flex flex-wrap gap-2">
          <OptionButton
            active={state.discount === "none"}
            onClick={() => state.setDiscount("none")}
          >
            Ninguno
          </OptionButton>
          {cardOption ? (
            <OptionButton
              active={state.discount === "card"}
              onClick={() => state.setDiscount("card")}
            >
              Franky Card {checkout.cardPct} %
            </OptionButton>
          ) : null}
          <OptionButton
            active={state.discount === "10"}
            onClick={() => state.setDiscount("10")}
          >
            10 %
          </OptionButton>
          <OptionButton
            active={state.discount === "20"}
            onClick={() => state.setDiscount("20")}
          >
            20 %
          </OptionButton>
          <OptionButton
            active={state.discount === "custom"}
            onClick={() => state.setDiscount("custom")}
          >
            Otro
          </OptionButton>
          {state.discount === "custom" ? (
            <input
              inputMode="decimal"
              aria-label="Descuento en euros"
              placeholder="€"
              value={state.customDiscount}
              onChange={(e) => state.setCustomDiscount(e.target.value)}
              className={cn(inputClass, "w-24")}
            />
          ) : null}
        </div>
      </FormField>

      <FormField
        label="Tarjeta regalo"
        htmlFor="gift-code"
        hint={
          state.giftCode.trim().length >= 6
            ? checkout.giftUsable
              ? `Saldo ${money(checkout.giftUsable.balanceCents)}: se descuenta de este cobro.`
              : checkout.gift
                ? "Esta tarjeta ya no tiene saldo o ha caducado."
                : "No hay ninguna tarjeta con ese código."
            : "Si trae una, escribe su código."
        }
      >
        <div className="relative">
          <Gift
            className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-text-muted"
            strokeWidth={1.9}
          />
          <input
            id="gift-code"
            value={state.giftCode}
            onChange={(e) => state.setGiftCode(e.target.value.toUpperCase())}
            placeholder="ABC-234"
            autoComplete="off"
            className={cn(inputClass, "pl-9 uppercase tracking-wider")}
          />
        </div>
      </FormField>

      <FormField label="Propina" htmlFor="tip">
        <div className="flex flex-wrap gap-2">
          {["0", "1", "2", "5"].map((t) => (
            <OptionButton
              key={t}
              active={state.tip === t}
              onClick={() => state.setTip(t)}
            >
              {t === "0" ? "Sin propina" : `${t} €`}
            </OptionButton>
          ))}
          <input
            id="tip"
            inputMode="decimal"
            value={state.tip}
            onChange={(e) => state.setTip(e.target.value)}
            className={cn(inputClass, "w-24")}
            aria-label="Otra propina"
          />
        </div>
      </FormField>

      <FormField label="Ya cobrado con">
        <ChoiceChips
          value={state.method}
          onChange={state.setMethod}
          options={METHODS}
        />
        <label className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={state.mixed}
            onChange={(e) => state.setMixed(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-violet)]"
          />
          Pago mixto
        </label>
        {state.mixed ? (
          <div className="flex flex-wrap items-center gap-2">
            <ChoiceChips
              value={state.second}
              onChange={state.setSecond}
              options={METHODS.filter((m) => m.value !== state.method)}
            />
            <input
              inputMode="decimal"
              aria-label="Importe con el segundo método"
              placeholder="€"
              value={state.secondAmount}
              onChange={(e) => state.setSecondAmount(e.target.value)}
              className={cn(inputClass, "w-28")}
            />
          </div>
        ) : null}
      </FormField>

      <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
        <Detail label={checkout.service?.name ?? "Servicio"}>
          {money(checkout.serviceCents)}
        </Detail>
        {totals.productCents ? (
          <Detail label="Productos">{money(totals.productCents)}</Detail>
        ) : null}
        {totals.bundleCents ? (
          <Detail label="Del bono">-{money(totals.bundleCents)}</Detail>
        ) : null}
        {totals.discountCents ? (
          <Detail label="Descuento">-{money(totals.discountCents)}</Detail>
        ) : null}
        {totals.depositAppliedCents ? (
          <Detail label="Señal ya pagada">
            -{money(totals.depositAppliedCents)}
          </Detail>
        ) : null}
        {totals.giftCardCents ? (
          <Detail label="Tarjeta regalo">-{money(totals.giftCardCents)}</Detail>
        ) : null}
        {totals.tipCents ? (
          <Detail label="Propina">{money(totals.tipCents)}</Detail>
        ) : null}
        <Detail label="Total ahora">
          <span className="font-heading text-base font-bold">
            {money(totals.chargeCents)}
          </span>
        </Detail>
      </div>
      <p className="text-xs text-text-muted">
        Registra aquí lo que ya has cobrado en tu local.
      </p>
    </div>
  );
}

function ProductLine({
  product,
  qty,
  onChange,
}: {
  product: ProProduct;
  qty: number;
  onChange: (n: number) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <Package className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {product.name}
        </span>
        <span className="block text-xs text-text-muted">
          {money(product.priceCents)}
          {product.stock <= product.min
            ? ` · quedan ${qtyLabel(product.stock)}`
            : ""}
        </span>
      </span>
      <Stepper
        label={`Unidades de ${product.name}`}
        value={qty}
        onChange={onChange}
        max={Math.max(0, product.stock)}
      />
    </li>
  );
}

/**
 * Lo que se hace justo después de cobrar: pedir la reseña y mandar los
 * cuidados del tratamiento, cada uno en un toque.
 */
export function AfterCharge({ bookingId }: { bookingId: string }) {
  const { data, run, allowed } = useAgenda();
  const booking = data.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  const service = data.services.find((s) => s.id === booking.serviceId);
  const client = data.clients.find((c) => c.id === booking.clientId);
  const paid = data.payments
    .filter((p) => p.bookingId === booking.id)
    .reduce((total, p) => total + p.amountCents + p.tipCents, 0);
  const aftercare = service?.agenda?.aftercare;
  const now = () => new Date().toISOString();

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="success" title={`Cobrado: ${money(paid)}`} icon={Star}>
        Aprovecha ahora que {booking.clientName.split(" ")[0]} sigue en el
        local.
      </Callout>
      <div className="rounded-2xl border border-border p-4">
        <p className="font-semibold">Pide la reseña</p>
        <p className="mt-1 text-sm text-text-muted">
          Un mensaje con las gracias y el enlace para opinar. Es cuando más
          reseñas se consiguen.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <WhatsAppButton
            phone={client?.phone}
            message={bookingMessage(data, "thanks", booking)}
            label="Pedir reseña"
            variant="dark"
            onOpen={() => {
              if (allowed("agenda.review"))
                void run("agenda.review", (d) =>
                  markReviewAsked(d, booking.id, now()),
                );
            }}
          />
          {booking.agenda?.reviewAskedAt ? (
            <Pill tone="success">Pedida</Pill>
          ) : null}
        </div>
      </div>
      {aftercare ? (
        <div className="rounded-2xl border border-border p-4">
          <p className="font-semibold">Cuidados de {service?.name}</p>
          <p className="mt-1 text-sm text-text-muted">{aftercare}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <WhatsAppButton
              phone={client?.phone}
              message={bookingMessage(data, "aftercare", booking)}
              label="Enviar cuidados"
              onOpen={() => {
                if (allowed("agenda.aftercare"))
                  void run("agenda.aftercare", (d) =>
                    markAftercareSent(d, booking.id, now()),
                  );
              }}
            />
            {booking.agenda?.aftercareSentAt ? (
              <Pill tone="success">Enviados</Pill>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
