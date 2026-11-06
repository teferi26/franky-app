import { describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() {
  let owner = { userId: 'tenant-a', generation: 1 };
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'checkout', url: 'https://checkout.stripe.com/c/pay/fixture', order_id: 'order-a' }) });
  const browser = vi.fn().mockResolvedValue({ type: 'cancel' });
  const evidence = vi.fn().mockResolvedValue({ status: 'pending', type: 'rent' });
  const load = nativeLoader({
    'expo-web-browser': { openBrowserAsync: browser, WebBrowserPresentationStyle: { PAGE_SHEET: 'sheet' } },
    './session': { captureSessionIdentity: () => owner },
    './owned-request': { withOwnedRequest: async (captured: typeof owner, work: (request: any) => unknown) => {
      const check = () => { if (captured !== owner) throw new Error('session_changed'); };
      check(); const result = await work({ owner: captured, signal: new AbortController().signal, authorization: `Bearer ${captured.userId}`, check }); check(); return result;
    } },
    './payment-return': { readPaymentReturn: evidence },
    './supabase': { WEB_URL: 'https://franky.es', fetchConTimeout: fetch, supabase: {} },
  });
  return { module: load('../mobile/src/lib/rent-payments.ts'), fetch, browser, evidence, get owner() { return owner; }, switchAccount() { owner = { userId: 'tenant-b', generation: 2 }; } };
}

describe('native contract payments', () => {
  it('deduplicates simultaneous rent and deposit taps for one owned contract', async () => {
    const f = fixture(), pending = deferred<any>(); f.fetch.mockReturnValueOnce(pending.promise);
    const rent = f.module.payContractRent('contract-a', 'rent', f.owner), deposit = f.module.payContractRent('contract-a', 'deposit', f.owner);
    expect(rent).toBe(deposit); expect(f.fetch).toHaveBeenCalledTimes(1);
    pending.resolve({ ok: true, status: 200, json: async () => ({ status: 'pending', order_id: 'order-a' }) });
    expect((await rent).status).toBe('pending');
  });
  it('browser dismissal leaves the payment pending without server evidence', async () => {
    const f = fixture(); expect((await f.module.payContractRent('contract-a', 'both', f.owner)).status).toBe('pending');
    expect(f.browser).toHaveBeenCalledOnce(); expect(f.evidence).toHaveBeenCalledWith('order-a', f.owner);
    expect(JSON.parse(f.fetch.mock.calls[0][1].body)).toEqual({ contract_id: 'contract-a', kind: 'both', return_to: 'app' });
  });
  it('does not display a checkout for a response belonging to a previous account', async () => {
    const f = fixture(), pending = deferred<any>(); f.fetch.mockReturnValueOnce(pending.promise);
    const result = f.module.payContractRent('contract-a', 'rent', f.owner);
    f.switchAccount(); pending.resolve({ ok: true, status: 200, json: async () => ({ status: 'checkout', url: 'https://checkout.stripe.com/c/pay/stale' }) });
    await expect(result).rejects.toThrow('session_changed'); expect(f.browser).not.toHaveBeenCalled();
  });
  it('requires owned ledger confirmation and rejects untrusted redirect URLs', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'paid' }) });
    expect((await f.module.payContractRent('contract-a', 'rent', f.owner)).status).toBe('pending');
    f.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'checkout', url: 'https://other.test/checkout' }) });
    expect((await f.module.payContractRent('contract-a', 'rent', f.owner)).status).toBe('failed'); expect(f.browser).not.toHaveBeenCalled();
    f.evidence.mockResolvedValueOnce({ status: 'paid', type: 'rent' });
    expect((await f.module.payContractRent('contract-a', 'rent', f.owner)).status).toBe('paid');
  });
});
