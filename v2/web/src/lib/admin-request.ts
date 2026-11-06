import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/analytics-filters';
import { createRequestSupabase } from '@/lib/supabase-server';

/** The same verified credential must authorize both the administrator and AAL2.
 * Never combine an incoming Bearer token with a different browser cookie. */
export async function requireAdminRequest(request: { headers: Headers }) {
  const identity = await requireAdmin(request);
  if (!identity.ok) {
    identity.response.headers.set('Cache-Control', 'private, no-store');
    return identity.response;
  }
  return { supabase: await createRequestSupabase(request), user: { id: identity.userId, email: null as string | null } };
}

export function adminJson(data: unknown, options: ResponseInit = {}) {
  const headers = new Headers(options.headers); headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(data, { ...options, headers });
}
