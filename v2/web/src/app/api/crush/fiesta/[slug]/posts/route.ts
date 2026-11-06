import { NextResponse, after } from 'next/server';
import { processPublicationReviews } from '@/lib/publication-review';
import { validateBody } from '@/lib/api-helpers';
import { partyIdentity, partyPostSchema, partyPostReceiptSchema, partyJson, partyRpcError, privatePartyResponse } from '@/lib/crush-party-api';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const identity = await partyIdentity(req, slug, true);
  if (identity instanceof NextResponse) return identity;
  const body = await validateBody(req, partyPostSchema, { maxBytes: 4096 });
  if (body instanceof NextResponse) return privatePartyResponse(body);
  const { data, error } = await identity.supabase.rpc('create_crush_party_post', { p_slug: slug, p_body: body.body, p_is_anonymous: body.is_anonymous, p_share_instagram: body.share_instagram, p_client_request_id: body.client_request_id, p_screen_consent: body.screen_consent, p_expected_instagram_handle: body.expected_instagram_handle, p_expected_display_name: body.expected_display_name });
  if (error) return partyRpcError(error);
  const parsed = partyPostReceiptSchema.safeParse(data);
  if (!parsed.success || parsed.data.party_slug !== slug) return partyJson({ message: 'No se ha confirmado la publicación. Puedes reintentar el mismo envío.' }, 503);
  const status = await identity.supabase.rpc('own_publication_review_status', { p_target: parsed.data.id });
  if (status.data === 'pending') after(async () => { await processPublicationReviews(identity.userId).catch(() => undefined); });
  return partyJson({ ...parsed.data, review: status.data ?? (parsed.data.available ? 'approved' : 'unavailable') });
}
