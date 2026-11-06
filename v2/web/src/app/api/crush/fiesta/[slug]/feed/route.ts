import { createPublicSupabase } from '@/lib/supabase-server';
import { validPartySlug } from '@/lib/crush-party-route';
import { partyFeedSchema, partyHeaders, partyJson, partyRpcError } from '@/lib/crush-party-api';
import { rateLimit } from '@/lib/rate-limit';
export const dynamic = 'force-dynamic';
export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!validPartySlug(slug)) return partyJson({ message: 'Fiesta no encontrada.' }, 404);
  // A venue can have hundreds of people behind one Wi-Fi address. Per-account
  // posting is independently limited in SQL; this ceiling only protects reads.
  const limit = await rateLimit(req, { key: 'crush-party-feed', limit: 15000, windowMs: 60000 });
  if (!limit.ok) { for (const [key, value] of Object.entries(partyHeaders)) limit.response.headers.set(key, value); return limit.response; }
  const { data, error } = await createPublicSupabase().rpc('get_crush_party_feed', { p_slug: slug });
  if (error) return partyRpcError(error);
  const result = partyFeedSchema.safeParse(data);
  if (!result.success) return partyJson({ message: 'No se ha podido cargar el muro. Se reintentará en unos segundos.' }, 503);
  return partyJson(result.data);
}
