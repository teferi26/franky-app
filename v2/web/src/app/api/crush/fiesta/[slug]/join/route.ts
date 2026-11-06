import { NextResponse } from 'next/server';
import { validateBody } from '@/lib/api-helpers';
import { partyIdentity, partyJoinSchema, partyStateSchema, partyJson, partyRpcError, privatePartyResponse } from '@/lib/crush-party-api';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const identity = await partyIdentity(req, slug, true);
  if (identity instanceof NextResponse) return identity;
  const body = await validateBody(req, partyJoinSchema, { maxBytes: 4096 });
  if (body instanceof NextResponse) return privatePartyResponse(body);
  const { data, error } = await identity.supabase.rpc('join_crush_party', { p_slug: slug, p_university_id: body.university_id, p_career: body.career, p_instagram_handle: body.instagram_handle, p_birth_date: body.birth_date, p_display_name: body.display_name, p_accept_terms: body.accept_terms });
  if (error) return partyRpcError(error);
  const parsed = partyStateSchema.safeParse(data);
  if (!parsed.success || parsed.data.party.slug !== slug || !parsed.data.joined) return partyJson({ message: 'No se ha confirmado el alta. Vuelve a intentarlo.' }, 503);
  const terms = await identity.supabase.rpc('accept_community_terms', { p_version: '2026-09-10' });
  if (terms.error) return partyRpcError(terms.error);
  return partyJson({ ok: true });
}
