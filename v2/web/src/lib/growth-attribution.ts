import { normalizeReferralCode } from '../../../shared/growth';

export function growthCookieValue(header: string | null, key: string): string | undefined {
  const value = header?.split(';').map(x => x.trim()).find(x => x.startsWith(`${key}=`))?.slice(key.length + 1);
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return undefined; }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function growthSignupMetadata(header: string | null, supplied?: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ['growth_first_touch','growth_last_touch']) {
    const value = growthCookieValue(header,key) ?? supplied?.[key];
    if (value && UUID.test(value)) result[key] = value;
  }
  const code = normalizeReferralCode(supplied?.growth_explicit_code ?? growthCookieValue(header,'growth_explicit_code'));
  if (code) result.growth_explicit_code = code;
  return result;
}
export function persistExplicitGrowthCode(code: string) {
  const safe = normalizeReferralCode(code);
  document.cookie = `growth_explicit_code=${safe ?? ''}; Path=/; Max-Age=${safe ? 3600 : 0}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
