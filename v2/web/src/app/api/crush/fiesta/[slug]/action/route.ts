import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/api-helpers';
import { partyIdentity, partyJson, partyRpcError, privatePartyResponse } from '@/lib/crush-party-api';
const schema = z.object({ post_id: z.string().uuid(), action: z.enum(['request', 'report', 'delete']) }).strict();
export const dynamic = 'force-dynamic';
export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const identity = await partyIdentity(req, slug, true);
  if (identity instanceof NextResponse) return identity;
  const body = await validateBody(req, schema, { maxBytes: 1024 });
  if (body instanceof NextResponse) return privatePartyResponse(body);
  const { data: state, error: stateError } = await identity.supabase.rpc('get_crush_party_state', { p_slug: slug });
  if (stateError) return partyRpcError(stateError);
  if (!state?.party || !Array.isArray(state.my_post_ids)) return partyJson({ message: 'No se pudo comprobar tu participación. Vuelve a intentarlo.' }, 503);
  const mine = state.my_post_ids.includes(body.post_id);
  if (body.action === 'delete') {
    if (!mine) return partyJson({ message: 'Esta publicación no está disponible para borrarla.' }, 404);
    const { error } = await identity.supabase.rpc('delete_ligar_post', { p_post_id: body.post_id });
    if (error) return partyRpcError(error);
    return partyJson({ message: 'Publicación retirada de Crush. Desaparecerá de las pantallas en su próxima actualización.' });
  }
  if (!state.joined || !state.eligible) return partyJson({ message: 'Completa tu perfil de la fiesta para continuar.' }, 409);
  if (mine) return partyJson({ message: 'Esta publicación es tuya.' }, 400);
  const { data: feed, error: feedError } = await identity.supabase.rpc('get_crush_party_feed', { p_slug: slug });
  if (feedError) return partyRpcError(feedError);
  if (!Array.isArray(feed?.posts) || !feed.posts.some((post: { id?: string }) => post.id === body.post_id)) return partyJson({ message: 'Esta publicación ya no está disponible en el muro de la fiesta.' }, 404);
  if (body.action === 'report') {
    const { error } = await identity.supabase.rpc('report_ligar_post', { p_post_id: body.post_id, p_reason: 'Publicación de la fiesta: revisar contenido' });
    if (error) return partyRpcError(error);
    return partyJson({ message: 'Reporte enviado. Gracias por ayudar a cuidar el muro.' });
  }
  const { data, error } = await identity.supabase.rpc('request_ig_for_post', { p_post_id: body.post_id });
  if (error) return partyRpcError(error);
  if (typeof data?.matched !== 'boolean') return partyJson({ message: 'No se pudo confirmar la solicitud. Consulta tus solicitudes en Crush antes de repetirla.' }, 503);
  const handle = data.matched && typeof data.instagram_handle === 'string' && /^[a-zA-Z0-9._]{1,30}$/.test(data.instagram_handle) ? data.instagram_handle : null;
  return partyJson({ matched: data.matched, instagram_handle: handle, message: data.matched ? '¡Es un match! También quería tu Instagram.' : 'Solicitud enviada. Tu Instagram se compartirá si esa persona también acepta.' });
}
