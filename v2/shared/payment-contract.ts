/** Pure wire contract shared by native checkout, returns and tests. */
export type PaymentStatus = 'checkout' | 'pending' | 'paid' | 'cancelled' | 'failed';
export type PaymentReply = {
  status: PaymentStatus;
  order_id?: string;
  url?: string;
  free?: boolean;
  error?: string;
  invalid_url?: boolean;
};

export function safeStripeUrl(value: unknown, hosts: readonly string[] = ['checkout.stripe.com']): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && hosts.includes(url.hostname)
      ? url.href : null;
  } catch { return null; }
}

/** Older servers lack status. Never infer payment from an arbitrary return URL. */
export function parsePaymentReply(value: unknown): PaymentReply {
  if (!value || typeof value !== 'object') return { status: 'pending' };
  const v = value as Record<string, unknown>;
  const status = ['checkout', 'pending', 'paid', 'cancelled', 'failed'].includes(String(v.status))
    ? v.status as PaymentStatus : v.free === true ? 'paid' : safeStripeUrl(v.url) ? 'checkout' : 'pending';
  return { status, ...(typeof v.order_id === 'string' ? { order_id: v.order_id } : {}),
    ...(v.url !== undefined && v.url !== null && !safeStripeUrl(v.url) ? { invalid_url: true } : {}),
    ...(safeStripeUrl(v.url) ? { url: safeStripeUrl(v.url)! } : {}),
    ...(typeof v.error === 'string' ? { error: v.error } : {}), free: v.free === true };
}

/** Missing rows, outages and browser cancellation do not prove cancellation. */
export function ticketPaymentStatus(status: unknown): 'paid' | 'pending' | 'cancelled' {
  if (status === 'valid' || status === 'used') return 'paid';
  if (status === 'cancelled' || status === 'refunded') return 'cancelled';
  return 'pending';
}

export function invoiceDocumentUrl(invoice: { invoice_pdf: string | null; hosted_invoice_url: string | null }, native: boolean): string | null {
  // A hosted unpaid invoice can initiate an external digital purchase. Native
  // receives the read-only document only, irrespective of OS or invoice label.
  return native
    ? safeStripeUrl(invoice.invoice_pdf, ['pay.stripe.com', 'invoice.stripe.com', 'files.stripe.com'])
    : safeStripeUrl(invoice.hosted_invoice_url ?? invoice.invoice_pdf, ['invoice.stripe.com', 'pay.stripe.com', 'files.stripe.com']);
}
