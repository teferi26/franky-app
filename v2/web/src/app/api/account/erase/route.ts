import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from '@/lib/supabase-server';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { validateBody } from '@/lib/api-helpers';

const schema = z.object({ confirmation: z.literal('ELIMINAR') }).strict();

/** New explicit endpoint: old clients saying "deactivate" remain reversible. */
export async function POST(req: Request) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Confirmación necesaria' }, { status: 415 });
  }
  const parsed = await validateBody(req, schema, { maxBytes: 512 });
  if (parsed instanceof NextResponse) return parsed;
  const auth = await createRequestSupabase(req);
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Vuelve a iniciar sesión para eliminar tu cuenta.' }, { status: 401 });
  const limited = await rateLimit(req, { key: 'account-erase', subject: user.id, limit: 3, windowMs: 600_000 });
  if (!limited.ok) return limited.response;
  const { data, error } = await createAdminSupabase().rpc('request_account_erasure', { p_user: user.id });
  if (error) {
    if(error.message?.includes('workspace_transfer_before_erasure'))return NextResponse.json({error:'Antes de eliminar tu cuenta, transfiere la propiedad de tus espacios desde Gestión → Equipo. Sus datos y contratos seguirán vinculados a la organización.'},{status:409});
    const isAdmin = error.message?.includes('admin_transfer_required');
    return NextResponse.json({ error: isAdmin
      ? 'Antes de eliminar la cuenta que administra Franky, transfiere la administración desde soporte.'
      : 'No se ha podido registrar la eliminación. Inténtalo de nuevo.' }, { status: isAdmin ? 409 : 503 });
  }
  return NextResponse.json({ ok: true, ...data }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
