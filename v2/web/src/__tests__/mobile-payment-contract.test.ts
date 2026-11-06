import { describe, expect, it } from 'vitest';
import { invoiceDocumentUrl, parsePaymentReply, safeStripeUrl, ticketPaymentStatus } from '../../../mobile/src/lib/payment-contract';

describe('native payment evidence and link safety', () => {
  it.each(['http://checkout.stripe.com/a', 'https://checkout.stripe.com.evil.test/a', 'https://checkout.stripe.com@evil.test/a', 'javascript:alert(1)', 'https://checkout.stripe.com:444/a', 'https://evil.test/'])('rejects untrusted checkout %s', url => {
    expect(safeStripeUrl(url)).toBeNull();
  });
  it('reads modern and legacy checkout replies without treating return links as proof', () => {
    expect(parsePaymentReply({ url: 'https://checkout.stripe.com/c/pay/fixture' }).status).toBe('checkout');
    expect(parsePaymentReply({ url: 'https://franky.es/mis-entradas?pay=ok' }).status).toBe('pending');
    expect(parsePaymentReply({ status: 'paid', order_id: 'order' })).toMatchObject({ status: 'paid', order_id: 'order' });
    expect(parsePaymentReply({ free: true }).status).toBe('paid');
  });
  it.each([undefined, null, 'pending_payment', 'unknown'])('does not manufacture cancellation from %s', state => {
    expect(ticketPaymentStatus(state)).toBe('pending');
  });
  it('only exposes read-only invoice PDFs in native clients', () => {
    const invoice = { hosted_invoice_url: 'https://invoice.stripe.com/i/payable', invoice_pdf: 'https://pay.stripe.com/invoice/fixture/pdf' };
    expect(invoiceDocumentUrl(invoice, true)).toBe(invoice.invoice_pdf);
    expect(invoiceDocumentUrl({ ...invoice, invoice_pdf: null }, true)).toBeNull();
    expect(invoiceDocumentUrl(invoice, false)).toBe(invoice.hosted_invoice_url);
  });
});
