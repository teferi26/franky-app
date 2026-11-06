import { NextResponse } from 'next/server';
import { partyIdentity, partyStateSchema, partyJson, partyRpcError } from '@/lib/crush-party-api';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const identity = await partyIdentity(req, slug);
  if (identity instanceof NextResponse) return identity;
  const { data, error } = await identity.supabase.rpc('get_crush_party_state', { p_slug: slug });
  if (error) return partyRpcError(error);
  const parsed = partyStateSchema.safeParse(data);
  if (!parsed.success || parsed.data.party.slug !== slug) return partyJson({ message: 'No se han podido recuperar tus datos.' }, 503);
  return partyJson(parsed.data);
}
