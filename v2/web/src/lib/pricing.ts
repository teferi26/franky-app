/**
 * Single source of truth for Franky pricing.
 *
 * Used by:
 * - The /pricing page (display).
 * - The Stripe checkout API (route lookup is by env-var STRIPE_*_PRICE_ID,
 *   but the marketing copy / "from €X/mo" labels come from here).
 * - The admin analytics dashboard (MRR / ARR calculations).
 *
 * Currency: EUR. Los importes son brutos para el usuario. Checkout activa
 * Stripe Tax; las nuevas tarifas deben configurarse con impuestos incluidos.
 */

export const PRICING = {
  pro: {
    monthly: 4.99,
    yearly: 39.99,
  },
  premium: {
    monthly: 9.99,
    yearly: 79.99,
  },
  business_leisure: {
    monthly: 9.99,
    yearly: 100,
  },
  business_housing: {
    monthly: 9.99,
  },
} as const;

/**
 * Plan "Usuario Propietario": suscripción a nivel de cuenta para
 * propietarios/inmobiliarias. 80 €/mes con hasta 40 pisos publicados sin
 * pasar por el pago individual de 9,99 €/ficha.
 *
 * El contrato actual mantiene su prueba de 7 días, una vez por cuenta.
 * La oferta futura por primer interesado sólo se usa tras activación manual:
 *   - mensual:    80 €/mes.
 *   - trimestral: los 3 primeros meses de golpe con un 20% de descuento
 *                 (240 € -> 192 €) y después 80 €/mes automáticamente (vía
 *                 Stripe subscription schedule).
 */
export const OWNER_PLAN = {
  monthly: 80,
  maxListings: 40,
  introMonths: 3,
  introDiscountPct: 20,
  /** 3 meses x 80 € con -20% = 192 €, cobrados de una vez. */
  introQuarterTotal: 192,
  /** Prueba del contrato actual, una vez por propietario. */
  trialDays: 15,
} as const;

export type PlanKey = keyof typeof PRICING;

/**
 * Lee un porcentaje de comisión de env (en puntos porcentuales, p. ej. "10")
 * y lo devuelve como fracción (0.10). Si el valor no es un número finito (env
 * mal escrito como "10%", vacío o ausente), cae al porcentaje por defecto en
 * lugar de propagar un NaN que haría que `applicationFeeCents` clampe a 0 y
 * Franky cobrase comisión cero sin enterarse.
 */
function commissionFraction(raw: string | undefined, defaultPct: number): number {
  const parsed = Number(raw);
  const pct = Number.isFinite(parsed) ? parsed : defaultPct;
  return pct / 100;
}

/**
 * Marketplace commission Franky keeps from each paid flow (Stripe Connect
 * `application_fee`). Configurable per type via env (placeholders below until
 * finance confirms the final numbers). Values are fractions (0.10 = 10%).
 */
export const COMMISSION = {
  visit: commissionFraction(process.env.FEE_VISIT_PCT, 10),
  rent: commissionFraction(process.env.FEE_RENT_PCT, 5),
  // El % de ticket también lo necesita el CLIENTE (desglose en el formulario
  // de crear evento), así que la fuente preferente es NEXT_PUBLIC_* (se
  // inyecta en el bundle en build). Mantén ambos env en el mismo valor.
  ticket: commissionFraction(
    process.env.NEXT_PUBLIC_FEE_TICKET_PCT ?? process.env.FEE_TICKET_PCT,
    8
  ),
} as const;

export type CommissionType = keyof typeof COMMISSION;

/**
 * Tasa de procesamiento de Stripe por cobro con tarjeta (España, tarjetas
 * europeas): 1,5% + 0,25 €. Con "destination charges" de Connect esa tasa la
 * paga la PLATAFORMA (se descuenta de nuestra application_fee), no el
 * organizador. Si no se repercute, Franky se queda con casi nada: en el primer
 * evento cobrado (ago-2026) el 8% eran 7,31 € y tras Stripe llegaron 1,40 €.
 *
 * Por eso la application_fee que retenemos en Stripe = comisión Franky +
 * esta tasa estimada, y el precio bruto que paga el asistente se calcula
 * incluyéndola: el organizador recibe su neto íntegro y Franky su % íntegro.
 *
 * Configurable por env (NEXT_PUBLIC_* porque el desglose también se pinta en
 * el cliente). Si Stripe cambia la tarifa, se ajusta aquí sin tocar código.
 */
export const STRIPE_PROCESSING = {
  pct: commissionFraction(
    process.env.NEXT_PUBLIC_STRIPE_FEE_PCT ?? process.env.STRIPE_FEE_PCT,
    1.5
  ),
  fixedCents: (() => {
    const parsed = Number(
      process.env.NEXT_PUBLIC_STRIPE_FEE_FIXED_CENTS ?? process.env.STRIPE_FEE_FIXED_CENTS
    );
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 25;
  })(),
} as const;

/** Gross EUR (e.g. 49.99) -> integer cents for Stripe `unit_amount`. */
export function toCents(eur: number): number {
  return Math.round(eur * 100);
}

/** Comisión Franky pura (solo el %), en céntimos, sin la tasa de Stripe. */
export function frankyCommissionCents(amountCents: number, type: CommissionType): number {
  if (amountCents <= 0) return 0;
  return Math.max(0, Math.round(amountCents * COMMISSION[type]));
}

/** Tasa estimada de Stripe para un cobro de `amountCents` (0 si no hay cobro). */
export function stripeProcessingCents(amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.round(amountCents * STRIPE_PROCESSING.pct) + STRIPE_PROCESSING.fixedCents;
}

/**
 * Platform fee in integer cents = comisión Franky + tasa de Stripe. Es lo que
 * se manda como `application_fee_amount`: Stripe se cobra su tasa de ahí y a
 * Franky le queda (aprox.) su % limpio. Clamped so it never exceeds the charge
 * amount (the DB has the same CHECK as a backstop).
 */
export function applicationFeeCents(amountCents: number, type: CommissionType): number {
  const fee = frankyCommissionCents(amountCents, type) + stripeProcessingCents(amountCents);
  return Math.min(Math.max(fee, 0), Math.max(0, amountCents));
}

/**
 * Desglose céntimo a céntimo de un cobro: qué parte es comisión Franky, qué
 * parte cubre la tasa de Stripe y qué recibe el vendedor. Suma exacta:
 * frankyCents + stripeCents + sellerCents = amountCents (el clamp del fee, si
 * llega a actuar en importes ridículos, recorta primero la parte de Franky).
 */
export function feeBreakdown(amountCents: number, type: CommissionType) {
  const feeCents = applicationFeeCents(amountCents, type);
  const stripeCents = Math.min(stripeProcessingCents(amountCents), feeCents);
  return {
    feeCents,
    stripeCents,
    frankyCents: feeCents - stripeCents,
    sellerCents: Math.max(0, amountCents - feeCents),
  };
}

/**
 * Lo que recibe el vendedor tras la comisión Franky y la tasa de Stripe
 * (céntimos). Con destination charges de Stripe Connect el organizador cobra
 * exactamente amount menos application_fee, así que esta cuenta es exacta.
 */
export function netFromGrossCents(grossCents: number, type: CommissionType): number {
  return Math.max(0, grossCents - applicationFeeCents(grossCents, type));
}

/**
 * Inversa: el menor precio bruto (lo que paga el asistente, en céntimos) que
 * garantiza al organizador el neto pedido. Ajusta céntimo a céntimo porque la
 * comisión se redondea y la división directa puede quedarse 1 céntimo corta.
 */
export function grossFromNetCents(netCents: number, type: CommissionType): number {
  if (netCents <= 0) return 0;
  const variablePct = COMMISSION[type] + STRIPE_PROCESSING.pct;
  let gross = Math.max(
    1,
    Math.ceil((netCents + STRIPE_PROCESSING.fixedCents) / (1 - variablePct))
  );
  while (netFromGrossCents(gross, type) < netCents) gross++;
  while (gross > 1 && netFromGrossCents(gross - 1, type) >= netCents) gross--;
  return gross;
}

/** "1,5 %" / "8 %": porcentaje legible en español, sin decimales de sobra. */
export function formatPct(fraction: number): string {
  const pct = fraction * 100;
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(pct) + " %";
}

/**
 * Texto corto de la tasa de Stripe ("1,5 % + 0,25 €") para desgloses de UI.
 */
export function stripeProcessingLabel(): string {
  return `${formatPct(STRIPE_PROCESSING.pct)} + ${formatEur(STRIPE_PROCESSING.fixedCents / 100)}`;
}

/**
 * Pie de la factura que Stripe emite al comprar una entrada: desglose céntimo
 * a céntimo de a dónde va el dinero. Las entradas de eventos presenciales son
 * un servicio del mundo real, así que Apple/Google permiten cobrarlas con
 * Stripe SIN pasar por compras in-app: la "tasa de la store" es 0 y lo decimos
 * explícitamente para que nadie crea que Franky se queda todo.
 */
export function ticketInvoiceFooter(amountCents: number, feeCents: number): string {
  const pct = formatPct(COMMISSION.ticket);
  const stripeCents = Math.min(stripeProcessingCents(amountCents), feeCents);
  const organizer = formatEur((amountCents - feeCents) / 100);
  const franky = formatEur((feeCents - stripeCents) / 100);
  const stripe = formatEur(stripeCents / 100);
  return (
    `Desglose de tu pago: ${organizer} van al organizador del evento, ${franky} ` +
    `(${pct}) es la comisión de servicio de Franky por el mantenimiento de la ` +
    `plataforma y ${stripe} (${stripeProcessingLabel()}) son los gastos de ` +
    `procesamiento del pago con tarjeta (Stripe). ` +
    `Apple App Store y Google Play no aplican ninguna tasa a esta compra ` +
    `(entrada para un evento presencial), así que no pagas nada extra por ` +
    `comprar desde el móvil.`
  );
}

/**
 * Normalise any active subscription to its monthly recurring revenue
 * contribution. Yearly plans are divided by 12 so MRR stays comparable
 * across customers paying different cadences.
 */
export function monthlyRecurringFromPlan(
  plan: PlanKey,
  period: "monthly" | "yearly"
): number {
  const prices = PRICING[plan] as { monthly: number; yearly?: number };
  if (period === "yearly" && prices.yearly !== undefined) {
    return Number((prices.yearly / 12).toFixed(2));
  }
  return prices.monthly;
}

/**
 * Format an EUR amount with es-ES locale (e.g. "1.234,56 €").
 */
export function formatEur(value: number, opts: { decimals?: number } = {}): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: opts.decimals ?? 2,
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(value);
}
