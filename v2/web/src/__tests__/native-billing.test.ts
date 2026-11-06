// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { constantTimeAuthorization, subscriberEntitlements, verifyRevenueCatWebhook } from '@/lib/native-billing';
import { validNativeProducts } from '../../../shared/billing';
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabase: vi.fn() }));
vi.mock('@/lib/payment-demo-guard', () => ({ isDemoPaymentActor: vi.fn() }));

const uid = '12345678-1234-4234-8234-123456789012';
const now = Date.parse('2026-09-22T12:00:00Z');
const mapping = validNativeProducts([{ productId: 'es.franky.pro.monthly', platform: 'ios', catalogKey: 'student_pro', entitlement: 'franky.pro' }]);
const payload = () => ({ request_date_ms: now, subscriber: { original_app_user_id: uid,
  entitlements: { 'franky.pro': { product_identifier: mapping[0].productId, expires_date: new Date(now + 86_400_000).toISOString() } },
  subscriptions: { [mapping[0].productId]: { store: 'app_store', is_sandbox: false, refunded_at: null as string | null } },
} });

describe('signed RevenueCat delivery', () => {
  it('authenticates the exact raw payload and rejects tampering and replay', () => {
    const raw = '{"event": {"id":"test"}}', secret = 'synthetic-signing-secret';
    const stamp = String(now / 1000);
    const signature = `t=${stamp},v1=${createHmac('sha256', secret).update(stamp + '.' + raw).digest('hex')}`;
    expect(verifyRevenueCatWebhook(raw, signature, secret, now)).toBe(true);
    expect(verifyRevenueCatWebhook(raw + ' ', signature, secret, now)).toBe(false);
    expect(verifyRevenueCatWebhook(raw, signature, secret, now + 301_000)).toBe(false);
    expect(verifyRevenueCatWebhook(raw, signature, 'wrong', now)).toBe(false);
    expect(verifyRevenueCatWebhook(raw, 'v1=malformed', secret, now)).toBe(false);
  });
  it('compares authorization without exceptions on malformed unicode or unequal lengths', () => {
    expect(constantTimeAuthorization('Bearer synthetic', 'Bearer synthetic')).toBe(true);
    expect(constantTimeAuthorization('é', 'a')).toBe(false);
    expect(constantTimeAuthorization(null, 'secret')).toBe(false);
    expect(constantTimeAuthorization('secretX', 'secret')).toBe(false);
  });
});
describe('canonical native entitlement snapshot', () => {
  it('grants only a current mapped subscription of the expected store and environment', () => {
    expect(subscriberEntitlements(payload(), uid, mapping, 'PRODUCTION', now)).toEqual({ observedAt: now, grants: [{ entitlement: 'franky.pro', productId: mapping[0].productId, expiresAt: new Date(now + 86_400_000).toISOString(), platform: 'ios' }] });
    expect(subscriberEntitlements(payload(), uid, mapping, 'SANDBOX', now).grants).toEqual([]);
  });
  it('does not accept an alias or another account as the purchase owner', () => {
    const data = payload(); data.subscriber.original_app_user_id = 'some-other-uuid';
    expect(() => subscriberEntitlements(data, uid, mapping, 'PRODUCTION', now)).toThrow('owner_unverified');
  });
  it('does not retain expired, refunded or unconfigured entitlement grants', () => {
    const expired = payload(); expired.subscriber.entitlements['franky.pro'].expires_date = new Date(now - 1).toISOString();
    expect(subscriberEntitlements(expired, uid, mapping, 'PRODUCTION', now).grants).toEqual([]);
    const refunded = payload(); refunded.subscriber.subscriptions[mapping[0].productId].refunded_at = new Date(now).toISOString();
    expect(subscriberEntitlements(refunded, uid, mapping, 'PRODUCTION', now).grants).toEqual([]);
    expect(subscriberEntitlements(payload(), uid, [], 'PRODUCTION', now).grants).toEqual([]);
  });
  it('rejects an old provider snapshot rather than reinstating revoked access', () => {
    expect(() => subscriberEntitlements({ ...payload(), request_date_ms: now - 600_000 }, uid, mapping, 'PRODUCTION', now)).toThrow('snapshot_invalid');
  });
});
describe('manual product mapping', () => {
  it('disables an invalid or duplicated catalog instead of selling the wrong capability', () => {
    expect(validNativeProducts([{ ...mapping[0], entitlement: 'university_verified' }])).toEqual([]);
    expect(validNativeProducts([mapping[0], mapping[0]])).toEqual([]);
    expect(validNativeProducts(null)).toEqual([]);
  });
});
