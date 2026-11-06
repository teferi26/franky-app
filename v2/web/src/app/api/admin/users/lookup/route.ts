import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminRequest, adminJson } from '@/lib/admin-request';
import { createAdminSupabase } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { validateBody } from '@/lib/api-helpers';
import { findAuthUser, authUserSummary, reconciledProfile, LookupIncompleteError } from '@/lib/admin-user-lookup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const emailSchema = z.string().trim().max(254).email().transform(value => value.toLowerCase());
const PROFILE_FIELDS = 'id,email,full_name,role,created_at,email_verified_at,is_discarded';

async function authorize(req: NextRequest) {
  const identity = await requireAdminRequest(req);
  if (identity instanceof NextResponse) return identity;
  const parsed = emailSchema.safeParse(req.nextUrl.searchParams.get('email'));
  if (!parsed.success) return adminJson({ error: 'Introduce un email válido.' }, { status: 400 });
  const limit = await rateLimit(req, { key: 'admin-user-lookup', subject: identity.user.id, limit: 6, windowMs: 60_000 });
  if (!limit.ok) { limit.response.headers.set('Cache-Control', 'private, no-store'); return limit.response; }
  return { ...identity, email: parsed.data };
}

function lookupError(error: unknown) {
  return adminJson({ error: error instanceof LookupIncompleteError
    ? 'La búsqueda no ha terminado. No podemos confirmar si existe esta cuenta. No se ha modificado ningún perfil.'
    : 'No se pudo comprobar la cuenta. Inténtalo de nuevo.',
    code: error instanceof LookupIncompleteError ? 'lookup_incomplete' : 'lookup_unavailable' }, { status: 503 });
}

export async function GET(req: NextRequest) {
  const identity = await authorize(req);
  if (identity instanceof NextResponse) return identity;
  try {
    const admin = createAdminSupabase();
    const authUser = await findAuthUser(identity.email, (page, perPage) => admin.auth.admin.listUsers({ page, perPage }));
    let query = admin.from('profiles').select(PROFILE_FIELDS);
    query = authUser ? query.eq('id', authUser.id) : query.eq('email', identity.email);
    const { data: profile, error } = await query.maybeSingle();
    if (error) throw error;
    return adminJson({ email: identity.email,
      status: authUser ? profile ? 'ok' : 'missing_profile' : profile ? 'missing_auth' : 'missing_both',
      authUser: authUser ? authUserSummary(authUser) : null, profile });
  } catch (error) { return lookupError(error); }
}

export async function POST(req: NextRequest) {
  const identity = await authorize(req);
  if (identity instanceof NextResponse) return identity;
  const body = await validateBody(req, z.object({ userId: z.string().uuid() }).strict(), { maxBytes: 1024 });
  if (body instanceof NextResponse) { body.headers.set('Cache-Control', 'private, no-store'); return body; }
  try {
    const admin = createAdminSupabase();
    const { data, error: authError } = await admin.auth.admin.getUserById(body.userId);
    if (authError || !data.user) return adminJson({ error: 'No se pudo comprobar el usuario. Vuelve a buscarlo.' }, { status: 409 });
    if (data.user.email?.trim().toLowerCase() !== identity.email) return adminJson({ error: 'La cuenta ha cambiado. Vuelve a buscarla antes de crear el perfil.' }, { status: 409 });
    const { data: existing, error: existingError } = await admin.from('profiles').select(PROFILE_FIELDS).eq('id', body.userId).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return adminJson({ error: 'El perfil ya existe.', profile: existing }, { status: 409 });
    const profile = reconciledProfile(data.user);
    const operationId = crypto.randomUUID();
    const audit = (action: string) => admin.from('admin_actions').insert({ actor_id: identity.user.id, actor_email: null,
      action, target_table: 'profiles', target_id: body.userId, changes: { operation_id: operationId } });
    const intent = await audit('reconcile_profile_requested');
    if (intent.error) return adminJson({ error: 'No se pudo registrar la operación. No se ha creado el perfil.' }, { status: 503 });
    // INSERT only: a competing registration wins without being overwritten.
    const created = await admin.from('profiles').insert(profile).select(PROFILE_FIELDS).single();
    if (created.error?.code === '23505') return adminJson({ error: 'El perfil ya ha sido creado. Vuelve a consultar la cuenta.' }, { status: 409 });
    if (created.error || !created.data) return adminJson({ error: 'No se pudo crear el perfil. Consulta la cuenta antes de reintentar.' }, { status: 503 });
    let receiptFailed = false;
    try { receiptFailed = !!(await audit('reconcile_profile_completed')).error; }
    catch { receiptFailed = true; }
    if (receiptFailed) return adminJson({ ok: true, profile: created.data, audit_pending: true, operation_id: operationId,
      message: 'El perfil está creado. Falta completar el registro de auditoría; no repitas la creación.' }, { status: 202 });
    return adminJson({ ok: true, profile: created.data, operation_id: operationId });
  } catch (error) { return lookupError(error); }
}
