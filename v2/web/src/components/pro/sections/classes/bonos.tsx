"use client";

import * as React from "react";
import { Gift, MessageCircle, Printer, Search, Ticket, TicketCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProChargeMethod, ProGiftVoucher } from "@/lib/pro/classes-types";
import { addDays, dayLabel, localDate, money, plural } from "@/lib/pro/format";
import { CHARGE_METHOD_LABEL } from "@/lib/pro/classes-care";
import {
  VOUCHER_MONTHS,
  findVoucher,
  redeemVoucher,
  sellVoucher,
  voucherGiftText,
  voucherStatus,
  vouchersExpiring,
  vouchersOf,
} from "@/lib/pro/classes-play";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  inputClass,
} from "../../kit";
import { escapeHtml, printSheet } from "./ui";

/**
 * Bonos regalo del escape room y los talleres: se venden con su código y su
 * caducidad, se canjean en recepción en un toque y avisan antes de caducar.
 * Se acabaron las libretas de códigos.
 */

const METHODS: ProChargeMethod[] = ["card", "bizum", "cash", "transfer"];
type Filter = "active" | "redeemed" | "expired";

function until(date: string) {
  return dayLabel(`${date}T12:00:00Z`, { weekday: false });
}

export default function ClassesBonos() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const [selling, setSelling] = React.useState(false);
  const [shown, setShown] = React.useState<ProGiftVoucher | null>(null);
  const [filter, setFilter] = React.useState<Filter>("active");
  const [code, setCode] = React.useState("");
  const all = vouchersOf(data);
  const active = all.filter((v) => voucherStatus(v, today) === "active");
  const soon = vouchersExpiring(data, now, 30);
  const month = today.slice(0, 7);
  const soldMonth = all.filter((v) => v.soldOn.slice(0, 7) === month);
  const pendingCents = active.reduce((a, v) => a + v.amountCents, 0);
  const list = all
    .filter((v) => voucherStatus(v, today) === filter)
    .sort((a, b) =>
      filter === "active"
        ? a.expiresOn.localeCompare(b.expiresOn)
        : b.soldOn.localeCompare(a.soldOn),
    );
  const found = code.trim() ? findVoucher(data, code) : undefined;

  const redeem = () => {
    const res = redeemVoucher(data, code, now);
    if (!res.ok) {
      toast.error(
        res.reason === "unknown"
          ? "Ese código no existe"
          : res.reason === "redeemed"
            ? "Ese bono ya se canjeó"
            : "Ese bono ha caducado",
        res.reason === "unknown" ? "Revisa las letras y los números." : undefined,
      );
      return;
    }
    void update("voucher.redeem", (d) => {
      const again = redeemVoucher(d, code, now);
      return again.ok ? again.data : d;
    });
    toast.success(
      "Bono canjeado",
      `${res.voucher.concept} para ${res.voucher.recipient || res.voucher.buyer}.`,
    );
    setCode("");
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Bonos regalo"
        title="Regala una experiencia"
        description={
          all.length
            ? `${plural(active.length, "bono por canjear", "bonos por canjear")} (${money(pendingCents, { round: true })})${soon.length ? `, ${plural(soon.length, "caduca", "caducan")} en menos de un mes` : ""}.`
            : "Vende bonos para cumpleaños, amigos invisibles y empresas. Cada uno con su código y su caducidad."
        }
        actions={
          <Button variant="dark" onClick={() => setSelling(true)}>
            <Gift className="h-4 w-4" /> Vender bono
          </Button>
        }
      />

      <KpiRow>
        <Kpi
          icon={Ticket}
          label="Por canjear"
          value={active.length}
          hint={money(pendingCents, { round: true })}
        />
        <Kpi
          icon={Wallet}
          label="Vendidos este mes"
          value={soldMonth.length}
          hint={money(
            soldMonth.reduce((a, v) => a + v.amountCents, 0),
            { round: true },
          )}
        />
        <Kpi
          label="Caducan en 30 días"
          value={soon.length}
          emphasis={soon.length > 0}
          hint={soon.length ? "avisa a quien lo tiene" : "ninguno"}
        />
        <Kpi
          icon={TicketCheck}
          label="Canjeados"
          value={all.filter((v) => v.redeemedAt).length}
          hint="en total"
        />
      </KpiRow>

      <Panel title="Canjear en recepción" description="Escribe el código que trae el cliente.">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            redeem();
          }}
        >
          <label className="relative flex-1">
            <span className="sr-only">Código del bono</span>
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-text-muted"
              strokeWidth={1.9}
            />
            <input
              className={cn(inputClass, "pl-9 font-semibold uppercase tracking-wider")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="LAB-0001"
              autoComplete="off"
            />
          </label>
          <Button type="submit" variant="outline" disabled={!code.trim()}>
            Canjear
          </Button>
        </form>
        {found ? (
          <p className="mt-3 text-sm text-text-secondary">
            <span className="font-semibold">{found.concept}</span> para{" "}
            {found.recipient || found.buyer}, {money(found.amountCents)}.{" "}
            {voucherStatus(found, today) === "active"
              ? `Válido hasta el ${until(found.expiresOn)}.`
              : voucherStatus(found, today) === "redeemed"
                ? "Ya canjeado."
                : "Caducado."}
          </p>
        ) : null}
      </Panel>

      <div className="flex flex-col gap-3">
        <Segmented
          label="Estado"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: "Por canjear", count: active.length },
            {
              value: "redeemed",
              label: "Canjeados",
              count: all.filter((v) => voucherStatus(v, today) === "redeemed").length,
            },
            {
              value: "expired",
              label: "Caducados",
              count: all.filter((v) => voucherStatus(v, today) === "expired").length,
            },
          ]}
        />
        <Panel flush>
          {list.length ? (
            <ul className="divide-y divide-border-light">
              {list.map((v) => {
                const status = voucherStatus(v, today);
                const expiring = status === "active" && v.expiresOn <= addDays(today, 30);
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setShown(v)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
                    >
                      <span className="w-20 shrink-0 font-heading text-sm font-bold tabular">
                        {v.code}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{v.concept}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {v.recipient ? `Para ${v.recipient}, ` : ""}de {v.buyer}
                        </span>
                      </span>
                      {status === "active" ? (
                        <Pill tone={expiring ? "warning" : "neutral"}>
                          Hasta el {until(v.expiresOn)}
                        </Pill>
                      ) : status === "redeemed" ? (
                        <Pill tone="success">Canjeado</Pill>
                      ) : (
                        <Pill tone="danger">Caducado</Pill>
                      )}
                      <span className="hidden w-16 shrink-0 text-right text-sm font-semibold tabular sm:block">
                        {money(v.amountCents)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty
              icon={Gift}
              title={
                filter === "active"
                  ? "No hay bonos por canjear"
                  : filter === "redeemed"
                    ? "Ningún bono canjeado"
                    : "Ningún bono caducado"
              }
              body={
                filter === "active"
                  ? "Los cumpleaños y la Navidad venden solos: ten el botón de vender a mano en recepción."
                  : undefined
              }
            />
          )}
        </Panel>
      </div>

      <SellDrawer open={selling} onClose={() => setSelling(false)} onSold={setShown} />
      <VoucherDrawer voucher={shown} onClose={() => setShown(null)} />
    </div>
  );
}

function SellDrawer({
  open,
  onClose,
  onSold,
}: {
  open: boolean;
  onClose: () => void;
  onSold: (v: ProGiftVoucher) => void;
}) {
  const { data, now, demo, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  // Lo que se suele regalar: los planes y packs del negocio, con su precio.
  const presets = data.plans.map((p) => ({ concept: p.name, cents: p.priceCents }));
  const [concept, setConcept] = React.useState("");
  const [euros, setEuros] = React.useState("");
  const [buyer, setBuyer] = React.useState("");
  const [recipient, setRecipient] = React.useState("");
  const [months, setMonths] = React.useState(String(VOUCHER_MONTHS));
  const [method, setMethod] = React.useState<ProChargeMethod>("card");
  React.useEffect(() => {
    if (!open) return;
    setConcept(presets[0]?.concept ?? "");
    setEuros(presets[0] ? String(presets[0].cents / 100).replace(".", ",") : "");
    setBuyer("");
    setRecipient("");
    setMonths(String(VOUCHER_MONTHS));
    setMethod("card");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const cents = Math.round(Number(euros.replace(",", ".")) * 100);
  const valid = concept.trim() && Number.isFinite(cents) && cents > 0 && buyer.trim();
  const expiresOn = addDays(today, Number(months) * 30);

  const sell = () => {
    if (!valid) return;
    const id = localId("vc");
    const input = { concept, amountCents: cents, buyer, recipient, expiresOn, method };
    // En un negocio real el cobro de mostrador todavía no se guarda aparte del
    // bono: el bono sí queda con su forma de pago.
    const { voucher } = sellVoucher(data, input, now, id);
    void update(
      "voucher.sell",
      (d) => sellVoucher(d, input, now, id, { recordPayment: demo }).data,
    );
    toast.success(
      `Bono ${voucher.code}`,
      `${money(cents)} por ${CHARGE_METHOD_LABEL[method].toLowerCase()}.`,
    );
    onClose();
    onSold(voucher);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Vender bono regalo"
      description="Sale con su código para dictar o imprimir."
      footer={
        <Button variant="dark" onClick={sell} disabled={!valid}>
          Cobrar {Number.isFinite(cents) && cents > 0 ? money(cents) : ""}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {presets.length ? (
          <FormField label="Qué regala">
            <ChoiceChips
              value={concept}
              onChange={(c) => {
                setConcept(c);
                const p = presets.find((x) => x.concept === c);
                if (p) setEuros(String(p.cents / 100).replace(".", ","));
              }}
              options={presets.map((p) => ({
                value: p.concept,
                label: p.concept,
                hint: money(p.cents),
              }))}
            />
          </FormField>
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <FormField label="Concepto" htmlFor="vc-concept">
            <input
              id="vc-concept"
              className={inputClass}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
          </FormField>
          <FormField label="Importe (€)" htmlFor="vc-amount">
            <input
              id="vc-amount"
              className={inputClass}
              value={euros}
              onChange={(e) => setEuros(e.target.value)}
              inputMode="decimal"
            />
          </FormField>
        </div>
        <FormField label="Quién lo compra" htmlFor="vc-buyer">
          <input
            id="vc-buyer"
            className={inputClass}
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Para quién" htmlFor="vc-recipient" hint="Opcional. Sale en el bono.">
          <input
            id="vc-recipient"
            className={inputClass}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Válido durante" hint={`Hasta el ${until(expiresOn)}.`}>
          <ChoiceChips
            value={months}
            onChange={setMonths}
            options={[
              { value: "3", label: "3 meses" },
              { value: "6", label: "6 meses" },
              { value: "12", label: "1 año" },
            ]}
          />
        </FormField>
        <FormField label="Forma de pago">
          <ChoiceChips
            value={method}
            onChange={setMethod}
            options={METHODS.map((m) => ({ value: m, label: CHARGE_METHOD_LABEL[m] }))}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

function VoucherDrawer({
  voucher,
  onClose,
}: {
  voucher: ProGiftVoucher | null;
  onClose: () => void;
}) {
  const { data, now } = usePro();
  const toast = useToast();
  if (!voucher)
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );
  const status = voucherStatus(voucher, localDate(now));
  const text = voucherGiftText(
    voucher,
    data.space.name,
    money(voucher.amountCents),
    until(voucher.expiresOn),
  );
  const phone = data.clients.find((c) => c.name === voucher.buyer)?.phone;
  const link = customerWhatsApp(phone, text);

  const print = () => {
    const e = escapeHtml;
    const ok = printSheet(
      `Bono ${voucher.code}`,
      ".card{max-width:520px;margin:40px auto;border:2px solid #141318;border-radius:24px;padding:40px;text-align:center}" +
        "h1{font-size:34px;margin:12px 0;letter-spacing:-0.02em}.code{font-size:30px;font-weight:800;letter-spacing:4px;margin:24px 0 8px}" +
        "p{margin:6px 0;font-size:16px;color:#4a4757}",
      `<div class="card"><p>${e(data.space.name)}</p><h1>${e(voucher.concept)}</h1>` +
        `${voucher.recipient ? `<p>Para ${e(voucher.recipient)}</p>` : ""}<p class="code">${e(voucher.code)}</p>` +
        `<p>Válido hasta el ${e(until(voucher.expiresOn))}</p><p>${e(data.space.address)}, ${e(data.space.city)}</p></div>`,
    );
    if (!ok)
      toast.info(
        "No se pudo abrir la ventana",
        "Permite las ventanas emergentes para imprimir el bono.",
      );
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Bono ${voucher.code}`}
      description={`${voucher.concept}, ${money(voucher.amountCents)}`}
      footer={
        <>
          <Button variant="outline" onClick={print}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          {link ? (
            <Button variant="dark" asChild>
              <a href={link} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
              </a>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-3xl border border-border p-6 text-center">
          <p className="text-sm text-text-muted">{data.space.name}</p>
          <p className="mt-2 font-heading text-2xl font-extrabold tracking-[-0.02em]">
            {voucher.concept}
          </p>
          {voucher.recipient ? (
            <p className="mt-1 text-sm text-text-secondary">Para {voucher.recipient}</p>
          ) : null}
          <p className="mt-5 font-heading text-3xl font-extrabold tracking-[0.12em] tabular">
            {voucher.code}
          </p>
          <p className="mt-2 text-sm text-text-muted">Válido hasta el {until(voucher.expiresOn)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-text-muted">Estado</span>
          <span className="text-right font-medium">
            {status === "active" ? "Por canjear" : status === "redeemed" ? "Canjeado" : "Caducado"}
          </span>
          <span className="text-text-muted">Comprado por</span>
          <span className="text-right font-medium">{voucher.buyer}</span>
          <span className="text-text-muted">Vendido el</span>
          <span className="text-right font-medium">{until(voucher.soldOn)}</span>
          {voucher.method ? (
            <>
              <span className="text-text-muted">Pagado con</span>
              <span className="text-right font-medium">{CHARGE_METHOD_LABEL[voucher.method]}</span>
            </>
          ) : null}
          {voucher.redeemedAt ? (
            <>
              <span className="text-text-muted">Canjeado el</span>
              <span className="text-right font-medium">
                {dayLabel(voucher.redeemedAt, { weekday: false })}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}
