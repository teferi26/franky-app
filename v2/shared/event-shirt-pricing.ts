export type ShirtPriceFields = { payment_mode?: string | null; price_without_shirt?: number | string | null; price_with_shirt?: number | string | null };
export type ShirtPrices = { withoutCents: number; withCents: number };
export type ShirtChoice = 'ninguna' | 'with_shirt' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;
export function shirtPrices(event: ShirtPriceFields): ShirtPrices | null {
  if (event.payment_mode !== 'info' || event.price_without_shirt == null || event.price_with_shirt == null) return null;
  const withoutCents = Math.round(Number(event.price_without_shirt) * 100);
  const withCents = Math.round(Number(event.price_with_shirt) * 100);
  return Number.isSafeInteger(withoutCents) && Number.isSafeInteger(withCents) && withoutCents > 0 && withCents >= withoutCents
    ? { withoutCents, withCents } : null;
}
export function shirtChoiceReady(choice: ShirtChoice): boolean { return choice !== null && choice !== 'with_shirt'; }
export function shirtChoiceCents(prices: ShirtPrices, choice: ShirtChoice): number { return choice && choice !== 'ninguna' ? prices.withCents : prices.withoutCents; }
export function parseEventPrice(text: string, { allowFree = false, max = 10000 }: { allowFree?: boolean; max?: number } = {}): number | null {
  const value = text.trim().replace(',', '.');
  if (allowFree && value === '') return 0;
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(value)) return null;
  const price = Number(value);
  return (price > 0 || (allowFree && price === 0)) && price <= max ? price : null;
}
export function shirtPriceLabel(cents: number): string { return (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); }

/** Validate the final attendee price, after any commissions. Free events stay free. */
export function eventPriceMeetsPaymentMinimum(price: number, paymentMode: string, organizerId: string): boolean {
  const online = paymentMode === 'app' || organizerId === 'efc99d1b-c713-4061-9146-e905fc599f56';
  return Number.isFinite(price) && price >= 0 && (price === 0 || !online || Math.round(price * 100) >= 50);
}
