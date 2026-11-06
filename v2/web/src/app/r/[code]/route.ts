import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { normalizeReferralCode } from '../../../../../shared/growth';
import { rateLimit } from '@/lib/rate-limit';
import { androidStoreUrl } from '@/lib/device';

/** Opaque database touch tokens retain attribution without tracking identity. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const url = new URL(req.url);
  const code = normalizeReferralCode((await params).code);
  const target = new URL('/registro', url.origin);
  if (code) target.searchParams.set('invite', code);
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'private, no-store');
  if (!code) return response;
  const rl = await rateLimit(req, { key: 'growth-touch', limit: 30, windowMs: 60_000 });
  if (!rl.ok) return response;
  try {
    const { data, error } = await createAdminSupabase().rpc('growth_record_touch', { p_code: code, p_campaign: url.searchParams.get('campaign')?.slice(0,120) ?? null, p_content: url.searchParams.get('content')?.slice(0,120) ?? null });
    if (!error && typeof data === 'string') {
      const cookie = req.headers.get('cookie') ?? '';
      const options = { path: '/', maxAge: 30*86400, sameSite: 'lax' as const, secure: url.protocol === 'https:', httpOnly: true };
      if (!/(?:^|;\s*)growth_first_touch=/.test(cookie)) response.cookies.set('growth_first_touch', data, options);
      response.cookies.set('growth_last_touch', data, options);
      const store = androidStoreUrl();
      if (url.searchParams.get('install') === 'android' && store) {
        const destination = new URL(store);
        destination.searchParams.set('referrer', new URLSearchParams({ growth_touch: data }).toString());
        const install = NextResponse.redirect(destination);
        install.headers.set('Cache-Control','private, no-store');
        return install;
      }
    }
  } catch { /* Registration remains available if attribution is temporarily down. */ }
  return response;
}
