import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { validateBody } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { saveAppleCredentials } from '@/lib/apple-account';

const schema = z.object({ identityToken: z.string().min(32).max(8192), authorizationCode: z.string().min(1).max(4096) }).strict();
export async function POST(req: Request) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'JSON requerido' }, { status: 415 });
  const parsed = await validateBody(req, schema, { maxBytes: 16_384 });
  if (parsed instanceof NextResponse) return parsed;
  const client = await createRequestSupabase(req);
  const { data: { user }, error } = await client.auth.getUser();
  const identity = user?.identities?.find(item => item.provider === 'apple');
  const subject = identity?.identity_data?.sub;
  if (error || !user || typeof subject !== 'string') return NextResponse.json({ error: 'Acceso Apple necesario' }, { status: 401 });
  const limited = await rateLimit(req, { key: 'apple-credentials', subject: user.id, limit: 6, windowMs: 600_000 });
  if (!limited.ok) return limited.response;
  try {
    await saveAppleCredentials(createAdminSupabase(), user.id, subject, parsed.identityToken, parsed.authorizationCode);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Never disclose authorization codes, tokens or provider response bodies.
    return NextResponse.json({ error: 'No se ha podido completar el acceso con Apple. Inténtalo de nuevo.' }, { status: 503 });
  }
}
