import { describe, expect, it } from "vitest";
import {
  activeBundle,
  applyCheckout,
  bundleRemaining,
  checkoutTotals,
  findGiftCard,
  gestoriaText,
  giftCode,
  lastSessionToday,
  lowStock,
  monthCsv,
  monthSummary,
  orderGroups,
  orderMessage,
  returnBundleSession,
  sellBundle,
  saveProduct,
  sellGiftCard,
  suggestedOrder,
  type CheckoutDraft,
} from "@/lib/pro/agenda-money";
import type { ProProduct } from "@/lib/pro/agenda-types";
import type { ProData } from "@/lib/pro/types";
import { NOW, TODAY, agendaFixture, booking } from "./pro-agenda-fixture";

const LONG_DASH = /[–—]/;

const wax: ProProduct = {
  id: "wax",
  name: "Cera mate",
  kind: "retail",
  priceCents: 1800,
  costCents: 900,
  stock: 3,
  min: 4,
  supplier: { name: "Distribuciones Levante", phone: "611 234 567" },
};

function draft(extra: Partial<CheckoutDraft> = {}): CheckoutDraft {
  return {
    serviceCents: 2000,
    products: [],
    discount: { kind: "none" },
    useBundle: false,
    depositPaidCents: 0,
    giftCardCents: 0,
    tipCents: 0,
    ...extra,
  };
}

describe("caja: cobro completo", () => {
  it("suma productos, descuenta y aplica señal, tarjeta regalo y propina en orden", () => {
    const totals = checkoutTotals(
      draft({
        products: [{ product: wax, qty: 1 }],
        discount: { kind: "pct", pct: 10, label: "10 %" },
        depositPaidCents: 500,
        giftCardCents: 1000,
        tipCents: 200,
      }),
    );
    // 20 + 18 = 38 €, -10 % = 34,20 €, -5 € de señal, -10 € de regalo.
    expect(totals).toMatchObject({
      productCents: 1800,
      discountCents: 380,
      depositAppliedCents: 500,
      giftCardCents: 1000,
      dueCents: 1920,
      chargeCents: 2120,
    });
  });

  it("el bono cubre el servicio y la tarjeta regalo nunca pasa de lo que se debe", () => {
    const totals = checkoutTotals(draft({ useBundle: true, giftCardCents: 5000 }));
    expect(totals).toMatchObject({ bundleCents: 2000, dueCents: 0, giftCardCents: 0 });
  });

  it("registra la cita, baja el stock, gasta el bono y la tarjeta y reparte el pago", () => {
    let data: ProData = agendaFixture();
    data = saveProduct(data, wax);
    data.bookings = [booking("b1", TODAY, 10 * 60, { status: "in_service", priceCents: 2000 })];
    data.agendaOps!.bundles = [
      {
        id: "bn",
        clientId: "c1",
        clientName: "Pablo Ruiz",
        serviceId: "sv2",
        label: "Bono 5 degradados",
        sessions: 5,
        used: 1,
        priceCents: 6500,
        soldAt: "2026-09-01T10:00:00.000Z",
        moves: [],
      },
    ];
    data.agendaOps!.giftCards = [
      {
        id: "gc",
        code: "ABC-234",
        amountCents: 3000,
        balanceCents: 3000,
        buyer: "Ana",
        soldAt: "2026-09-01T10:00:00.000Z",
        expiresAt: "2027-09-01",
      },
    ];
    const next = applyCheckout(data, {
      paymentId: "p1",
      at: NOW.toISOString(),
      bookingId: "b1",
      clientId: "c1",
      clientName: "Pablo Ruiz",
      staffId: "s1",
      serviceId: "sv2",
      serviceName: "Degradado",
      draft: draft({
        products: [{ product: wax, qty: 2 }],
        useBundle: true,
        giftCardCents: 3000,
      }),
      method: "card",
      secondary: { method: "cash", cents: 200 },
      bundleId: "bn",
      giftCardId: "gc",
    });
    const payment = next.payments.at(-1)!;
    // 36 € de cera, 30 € con la tarjeta regalo y 6 € entre tarjeta y efectivo.
    expect(payment.amountCents).toBe(600);
    expect(payment.agenda?.split).toEqual([
      { method: "card", cents: 400 },
      { method: "cash", cents: 200 },
    ]);
    expect(next.bookings[0]).toMatchObject({ status: "done", paidCents: 2000 });
    expect(next.agendaOps!.products[0].stock).toBe(1);
    expect(bundleRemaining(next.agendaOps!.bundles[0])).toBe(3);
    expect(next.agendaOps!.giftCards[0].balanceCents).toBe(0);
  });
});

describe("caja: bonos y tarjetas regalo", () => {
  it("vender un bono lo deja en la ficha y cobra por adelantado", () => {
    const data = sellBundle(
      agendaFixture(),
      {
        id: "bn",
        clientId: "c1",
        clientName: "Pablo Ruiz",
        serviceId: "sv2",
        label: "Bono 5 degradados",
        sessions: 5,
        used: 4,
        priceCents: 6500,
        soldAt: NOW.toISOString(),
        moves: [],
      },
      { paymentId: "p1", method: "bizum" },
    );
    expect(data.payments[0]).toMatchObject({ amountCents: 6500, method: "bizum" });
    expect(activeBundle(data, "c1", "sv2", TODAY)?.id).toBe("bn");
    data.bookings = [booking("b1", TODAY, 12 * 60)];
    expect(lastSessionToday(data, TODAY)).toEqual([{ bundle: data.agendaOps!.bundles[0], bookingId: "b1" }]);
    const back = returnBundleSession(data, "bn", { at: NOW.toISOString(), reason: "Error" });
    expect(back.agendaOps!.bundles[0].used).toBe(3);
  });

  it("el código regalo se dicta fácil y se encuentra sin guiones", () => {
    let seed = 0;
    const code = giftCode(() => ((seed += 0.13) % 1));
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    const data = sellGiftCard(
      agendaFixture(),
      { id: "gc", code, amountCents: 3000, balanceCents: 3000, buyer: "Ana", soldAt: NOW.toISOString(), expiresAt: "2027-09-24" },
      { paymentId: "p1", method: "cash" },
    );
    expect(findGiftCard(data, code.replace("-", "").toLowerCase())?.id).toBe("gc");
  });
});

describe("caja: stock y pedidos", () => {
  it("avisa de lo que está bajo mínimo y escribe el pedido por proveedor", () => {
    const low = lowStock([wax, { ...wax, id: "ok", stock: 10 }]);
    expect(low.map((p) => p.id)).toEqual(["wax"]);
    expect(suggestedOrder(wax)).toBe(5);
    const groups = orderGroups([wax]);
    expect(groups[0].name).toBe("Distribuciones Levante");
    const text = orderMessage(agendaFixture(), groups[0].name, groups[0].items);
    expect(text).toContain("5 x Cera mate");
    expect(text).not.toMatch(LONG_DASH);
  });
});

describe("caja: cierre del mes", () => {
  function monthData(): ProData {
    const data = agendaFixture();
    data.payments = [
      // Lucía: mechas con comisión propia del 40 % y un producto al 10 %.
      {
        id: "p1",
        at: "2026-09-10T10:00:00.000Z",
        staffId: "s2",
        clientName: "Ana",
        concept: "Mechas balayage, Cera mate",
        amountCents: 9300,
        tipCents: 300,
        method: "card",
        agenda: {
          lines: [
            { kind: "service", refId: "sv7", name: "Mechas balayage", qty: 1, cents: 7500 },
            { kind: "product", refId: "wax", name: "Cera mate", qty: 1, cents: 1800 },
          ],
          discountCents: 0,
          depositAppliedCents: 0,
          giftCardCents: 0,
        },
      },
      // Marcos: corte al 30 %.
      {
        id: "p2",
        at: "2026-09-11T10:00:00.000Z",
        staffId: "s3",
        clientName: "Leo",
        concept: "Degradado",
        amountCents: 1500,
        tipCents: 0,
        method: "cash",
      },
      // Otro mes: no cuenta.
      {
        id: "p3",
        at: "2026-08-30T10:00:00.000Z",
        staffId: "s3",
        clientName: "Leo",
        concept: "Degradado",
        amountCents: 1500,
        tipCents: 0,
        method: "cash",
      },
    ];
    return data;
  }

  it("aplica la comisión del servicio antes que la de la persona y separa productos", () => {
    const summary = monthSummary(monthData(), "2026-09");
    expect(summary.totalCents).toBe(10800);
    expect(summary.tipsCents).toBe(300);
    expect(summary.byMethod).toEqual({ card: 9300, cash: 1500, bizum: 0 });
    const lucia = summary.staff.find((r) => r.staff.id === "s2")!;
    expect(lucia).toMatchObject({ serviceCents: 7500, productCents: 1800, commissionCents: 3000 + 180 });
    const marcos = summary.staff.find((r) => r.staff.id === "s3")!;
    expect(marcos.commissionCents).toBe(450);
  });

  it("quien alquila sillón debe su cuota y no cobra comisión", () => {
    const data = monthData();
    data.staff = data.staff.map((s) =>
      s.id === "s3" ? { ...s, commissionPct: 0, agenda: { chairRentCents: 40000 } } : s,
    );
    const marcos = monthSummary(data, "2026-09").staff.find((r) => r.staff.id === "s3")!;
    expect(marcos).toMatchObject({ commissionCents: 0, chairRentCents: 40000 });
  });

  it("con un día concreto solo cuenta ese día", () => {
    const summary = monthSummary(monthData(), "2026-09", "2026-09-11");
    expect(summary.totalCents).toBe(1500);
    expect(summary.staff.map((r) => r.staff.id)).toContain("s3");
  });

  it("el CSV y el texto para la gestoría salen completos y sin guiones largos", () => {
    const data = monthData();
    const summary = monthSummary(data, "2026-09");
    const csv = monthCsv(summary);
    const cells = (line: string) =>
      line.split(";").map((cell) => cell.replace(/^"|"$/g, ""));
    const lines = csv.split("\r\n");
    expect(cells(lines[0])).toEqual(["Fecha", "Cobros", "Tarjeta", "Efectivo", "Bizum", "Propinas", "Total"]);
    expect(cells(lines[1])).toEqual(["2026-09-10", "1", "93,00", "0,00", "0,00", "3,00", "96,00"]);
    const text = gestoriaText(data, summary, "septiembre de 2026");
    expect(text).toContain("Lucía Pastor: comisión");
    expect(`${csv}${text}`).not.toMatch(LONG_DASH);
  });
});
