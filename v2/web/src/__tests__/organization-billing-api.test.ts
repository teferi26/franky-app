// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn(), demo: vi.fn(), rate: vi.fn(), start: vi.fn(), context: vi.fn(), recover: vi.fn(),
  customer: vi.fn(), configuration: vi.fn(), portal: vi.fn(), retrieveInvoice: vi.fn(), listInvoices: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({ createRequestSupabase: async () => ({ rpc: mock.rpc, auth: { getUser: mock.user } }) }));
vi.mock('@/lib/payment-demo-guard', () => ({ isDemoPaymentActor: mock.demo }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mock.rate }));
vi.mock('@/lib/organization-billing', () => ({ startOrganizationCheckout: mock.start, organizationCheckoutContext: mock.context, recoverOrganizationCheckout: mock.recover,
  organizationPaymentReply: (value: { status: string; attempt_id: string; checkout_url: string }, allowUrl: boolean) => value.status === 'paid' ? { status: 'paid', order_id: value.attempt_id }
    : allowUrl ? { status: 'checkout', order_id: value.attempt_id, url: value.checkout_url } : { status: 'pending', order_id: value.attempt_id } }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ customers: { retrieve: mock.customer }, billingPortal: { configurations: { retrieve: mock.configuration }, sessions: { create: mock.portal } },
  invoices: { retrieve: mock.retrieveInvoice, list: mock.listInvoices } }) }));
import { POST as checkout } from '@/app/api/organizations/[id]/billing/checkout/route';
import { POST as portal } from '@/app/api/organizations/[id]/billing/portal/route';
import { GET as status } from '@/app/api/organizations/[id]/billing/status/route';
import { GET as invoices } from '@/app/api/organizations/[id]/billing/invoices/route';
const org = '11111111-1111-4111-8111-111111111111', actor = '22222222-2222-4222-8222-222222222222';
const order = '33333333-3333-4333-8333-333333333333', quote = '44444444-4444-4444-8444-444444444444', key = '55555555-5555-4555-8555-555555555555';
const params = { params: Promise.resolve({ id: org }) };
const body = () => ({ quote_id: quote, request_key: key, accepted_terms_version: 'v1', accepted: true, accepted_first_base_cents: 19900, accepted_renewal_base_cents: 29000 });
const req = (path: string, method = 'GET', payload?: unknown, headers: Record<string, string> = {}) => new NextRequest(`https://franky.es/api/organizations/${org}/billing/${path}`, {
  method, headers: { origin: 'https://franky.es', 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(payload ?? {}) } : {}),
});
const access = { organization_id: org, account_id: 'account', environment: 'test', customer_id: 'cus_org', portal_config_id: 'bpc_org', can_manage_billing: true };
const orderContext = { attempt_id: order, organization_id: org, status: 'open', checkout_url: 'https://checkout.stripe.com/c/pay/test' };
const billing = { organization_id: org, environment: 'test', sales_enabled: true, provider_ready: true, pending_attempt_id: null,
  can_manage_billing: true, account: { verified: true }, access: { paused: false }, catalog: [{ status: 'active' }] };
const invoice = { id: 'in_org', customer: 'cus_org', livemode: false, number: '2026-1', status: 'paid', currency: 'eur', total: 24079, amount_paid: 24079, created: 1780000000,
  invoice_pdf: 'https://pay.stripe.com/invoice/test/pdf', hosted_invoice_url: 'https://invoice.stripe.com/i/test',
  parent: { subscription_details: { metadata: { mode: 'organization_saas', organization_id: org, billing_account_id: 'account' } } } };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic'); vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'synthetic'); vi.stubEnv('ORGANIZATION_BILLING_CHECKOUT_ENABLED', 'false');
  mock.user.mockResolvedValue({ data: { user: { id: actor } }, error: null }); mock.demo.mockResolvedValue(false); mock.rate.mockResolvedValue({ ok: true });
  mock.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'account_session_usable' ? true
    : name === 'prepare_organization_checkout' ? orderContext : name === 'get_organization_billing_access' ? access
    : name === 'get_organization_billing' ? billing : name === 'lookup_organization_checkout' ? { attempt_known: false, attempt_id: null } : null }));
  mock.start.mockResolvedValue({ status: 'checkout', order_id: order, url: orderContext.checkout_url }); mock.context.mockResolvedValue(orderContext); mock.recover.mockResolvedValue(orderContext);
  mock.customer.mockResolvedValue({ id: 'cus_org', livemode: false, metadata: { mode: 'organization_saas', organization_id: org, billing_account_id: 'account', environment: 'test' } });
  mock.configuration.mockResolvedValue({ id: 'bpc_org', livemode: false, active: true, login_page: { enabled: false }, features: { payment_method_update: { enabled: true },
    customer_update: { enabled: false }, subscription_update: { enabled: false }, subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' } } });
  mock.portal.mockResolvedValue({ customer: 'cus_org', url: 'https://billing.stripe.com/p/session/test' }); mock.listInvoices.mockResolvedValue({ data: [invoice], has_more: false }); mock.retrieveInvoice.mockResolvedValue(invoice);
});
it.each<Record<string, string>>([{ origin: 'https://evil.invalid' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }, { authorization: 'Bearer native' }, { 'x-franky-client': 'native' }])('forbids external/digital-native checkout and portal before authentication: %j', async headers => {
  expect((await checkout(req('checkout', 'POST', body(), headers), params)).status).toBe(403);
  expect((await portal(req('portal', 'POST', {}, headers), params)).status).toBe(403);
  expect(mock.user).not.toHaveBeenCalled(); expect(mock.start).not.toHaveBeenCalled(); expect(mock.portal).not.toHaveBeenCalled();
});
it.each([{ price_id: 'price_arbitrary' }, { customer_id: 'cus_other' }, { amount: 1 }, { accepted: false }, { accepted_first_base_cents: 19.9 }, { accepted_renewal_base_cents: -1 }, { request_key: 'not-a-uuid' }])('closed checkout payload rejects %j', async patch => {
  expect((await checkout(req('checkout', 'POST', { ...body(), ...patch }), params)).status).toBe(400); expect(mock.start).not.toHaveBeenCalled();
});
it('passes the displayed amounts only as consent to a server-priced quote', async () => {
  const response = await checkout(req('checkout', 'POST', body()), params);
  expect(response.status).toBe(200); expect(mock.rpc).toHaveBeenCalledWith('prepare_organization_checkout', { p_organization_id: org, p_quote_id: quote, p_request_key: key,
    p_terms_version: 'v1', p_first_base_cents: 19900, p_renewal_base_cents: 29000 });
  expect(mock.start).toHaveBeenCalledWith(order, actor, org); expect(response.headers.get('cache-control')).toContain('no-store');
});
it('losing the Stripe response preserves the durable pending order', async () => {
  mock.start.mockRejectedValue(Error('network'));
  const response = await checkout(req('checkout', 'POST', body()), params); expect(await response.json()).toEqual({ status: 'pending', order_id: order });
});
it('does not call the provider when AAL2/current authorization fails', async () => {
  mock.rpc.mockImplementation(async name => name === 'account_session_usable' ? { data: true } : { error: { message: 'organization_billing_mfa_required' } });
  expect((await checkout(req('checkout', 'POST', body()), params)).status).toBe(403); expect(mock.start).not.toHaveBeenCalled();
});
it('keeps all real payment routes disabled for a demo actor', async () => {
  mock.demo.mockResolvedValue(true);
  expect((await checkout(req('checkout', 'POST', body()), params)).status).toBe(403); expect((await invoices(req('invoices'), params)).status).toBe(403);
  expect(mock.start).not.toHaveBeenCalled(); expect(mock.customer).not.toHaveBeenCalled();
});
it('an unauthenticated request and a revoked account fail before provider reads', async () => {
  mock.user.mockResolvedValueOnce({ data: { user: null } }); expect((await status(req('status'), params)).status).toBe(401);
  mock.rpc.mockResolvedValueOnce({ data: false }); expect((await status(req('status'), params)).status).toBe(403); expect(mock.recover).not.toHaveBeenCalled();
});
it('the deployment flag overrides a database sales flag without blocking read-only state', async () => {
  const response = await status(req('status'), params); expect((await response.json()).billing.can_checkout_web).toBe(false);
  expect(mock.rpc).not.toHaveBeenCalledWith('get_organization_billing_access', expect.anything());
  vi.stubEnv('ORGANIZATION_BILLING_CHECKOUT_ENABLED', 'true'); expect((await (await status(req('status'), params)).json()).billing.can_checkout_web).toBe(true);
});
it('a native financial reader receives no checkout URL or purchase capability', async () => {
  vi.stubEnv('ORGANIZATION_BILLING_CHECKOUT_ENABLED', 'true');
  const result = await (await status(req(`status?order=${order}`, 'GET', undefined, { authorization: 'Bearer token' }), params)).json();
  expect(result.payment).toEqual({ status: 'pending', order_id: order }); expect(result.billing.can_checkout_web).toBe(false);
});
it('finance.read without management+AAL2 receives state but cannot continue a purchase', async () => {
  const original = mock.rpc.getMockImplementation()!;
  mock.rpc.mockImplementation((name, args) => name === 'get_organization_billing_access' && args.p_manage ? { error: { message: 'organization_billing_mfa_required' } } : original(name, args));
  const result = await (await status(req(`status?order=${order}`), params)).json(); expect(result.payment).toEqual({ status: 'pending', order_id: order });
});
it('downgrading the financial role during recovery cannot leak the recovered checkout URL', async () => {
  const original = mock.rpc.getMockImplementation()!; let revoked = false;
  mock.recover.mockImplementation(async () => { revoked = true; return orderContext; });
  mock.rpc.mockImplementation((name, args) => revoked && name === 'get_organization_billing_access' ? { error: { message: 'forbidden' } } : original(name, args));
  const result = await status(req(`status?order=${order}`), params); expect(result.status).toBe(403); expect(JSON.stringify(await result.json())).not.toContain('checkout.stripe.com');
});
it('a recovery outage is pending, never cancelled or failed', async () => {
  mock.recover.mockRejectedValue(Error('timeout')); const result = await (await status(req(`status?order=${order}`), params)).json(); expect(result.payment).toEqual({ status: 'pending', order_id: order });
});
it('does not reconcile a valid order from another organization', async () => {
  mock.context.mockResolvedValue({ ...orderContext, organization_id: 'other' }); expect((await status(req(`status?order=${order}`), params)).status).toBe(404); expect(mock.recover).not.toHaveBeenCalled();
});
it('an explicit missing request-key is reported only after an authoritative lookup', async () => {
  const result = await (await status(req(`status?request_key=${key}`), params)).json(); expect(result.attempt_known).toBe(false);
  const original = mock.rpc.getMockImplementation()!; mock.rpc.mockImplementation((name, args) => name === 'lookup_organization_checkout' ? { error: { message: 'network' } } : original(name, args));
  const failed = await status(req(`status?request_key=${key}`), params); expect(failed.status).toBe(503); expect(await failed.json()).not.toHaveProperty('attempt_known');
});
it('a found request-key recovers that exact order', async () => {
  const original = mock.rpc.getMockImplementation()!; mock.rpc.mockImplementation((name, args) => name === 'lookup_organization_checkout' ? { data: { attempt_known: true, attempt_id: order } } : original(name, args));
  const result = await (await status(req(`status?request_key=${key}`), params)).json(); expect(result.attempt_known).toBe(true); expect(mock.recover).toHaveBeenCalledWith(order, org);
});
it('portal configuration and customer are organization-specific while sales are closed', async () => {
  const result = await portal(req('portal', 'POST'), params); expect(result.status).toBe(200);
  expect(mock.portal).toHaveBeenCalledWith({ customer: 'cus_org', configuration: 'bpc_org', return_url: `https://franky.es/espacios/facturacion?organization=${org}` });
});
it('rejects a personal customer or unsafe portal configuration', async () => {
  mock.customer.mockResolvedValueOnce({ id: 'cus_org', livemode: false, metadata: { supabase_user_id: actor } }); expect((await portal(req('portal', 'POST'), params)).status).toBe(503);
  mock.configuration.mockResolvedValueOnce({ ...(await mock.configuration()), login_page: { enabled: true } }); expect((await portal(req('portal', 'POST'), params)).status).toBe(503);
  expect(mock.portal).not.toHaveBeenCalled();
});
it('invoices are paginated without an invented total and native readers get read-only documents', async () => {
  mock.listInvoices.mockResolvedValue({ data: [invoice], has_more: true });
  const result = await (await invoices(req('invoices', 'GET', undefined, { 'x-franky-client': 'native' }), params)).json();
  expect(result.next_cursor).toBe('in_org'); expect(result.invoices[0].invoice_pdf).toBe(invoice.invoice_pdf); expect(result.invoices[0].hosted_invoice_url).toBeNull();
  expect(mock.listInvoices).toHaveBeenCalledWith({ customer: 'cus_org', limit: 50 });
});
it('an invoice cursor from another entity never becomes a pagination oracle', async () => {
  mock.retrieveInvoice.mockResolvedValue({ ...invoice, customer: 'cus_other' }); expect((await invoices(req('invoices?cursor=in_other'), params)).status).toBe(404); expect(mock.listInvoices).not.toHaveBeenCalled();
});
it('a permission revoked during invoice retrieval prevents returning documents', async () => {
  const original = mock.rpc.getMockImplementation()!; let revoked = false;
  mock.listInvoices.mockImplementation(async () => { revoked = true; return { data: [invoice], has_more: false }; });
  mock.rpc.mockImplementation((name, args) => revoked && name === 'get_organization_billing_access' ? { error: { message: 'forbidden' } } : original(name, args));
  expect((await invoices(req('invoices'), params)).status).toBe(403);
});
it('a suspended or changed legal entity keeps financial status but receives no purchase URL', async () => {
  mock.context.mockImplementation(async (_attempt, user) => { if (user) throw Error('organization_billing_account_suspended'); return orderContext; });
  const result = await (await status(req(`status?order=${order}`), params)).json();
  expect(result.payment).toEqual({ status: 'pending', order_id: order });
});
it('no active catalog or verified entity means no purchase CTA even with deployment enabled', async () => {
  vi.stubEnv('ORGANIZATION_BILLING_CHECKOUT_ENABLED', 'true');
  const original = mock.rpc.getMockImplementation()!;
  mock.rpc.mockImplementation((name, args) => name === 'get_organization_billing' ? { data: { ...billing, account: null, catalog: [] } } : original(name, args));
  expect((await (await status(req('status'), params)).json()).billing.can_checkout_web).toBe(false);
});
