import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRequestSupabase } from '@/lib/supabase-server';
import { validPartySlug } from '@/lib/crush-party-route';
import { rateLimit } from '@/lib/rate-limit';

export const partyHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' };
export const partyJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: partyHeaders });
export function privatePartyResponse(response: NextResponse) {
  for (const [key, value] of Object.entries(partyHeaders)) response.headers.set(key, value);
  return response;
}
export function partyRpcError(error: { code?: string; message?: string } | null) {
  const code = error?.message ?? '';
  const known: Record<string, [number, string]> = {
    party_not_found: [404, 'Esta fiesta no está disponible. Revisa el enlace del QR.'],
    party_closed: [409, 'El envío de mensajes de esta fiesta está cerrado.'],
    party_not_open: [409, 'Todavía no se ha abierto el envío de mensajes.'],
    party_inactive: [409, 'Esta fiesta no está activa.'],
    screen_consent_required: [400, 'Confirma que quieres publicar en Crush y en las pantallas.'],
    terms_required: [400, 'Acepta las condiciones para activar tu perfil de Crush.'],
    underage: [403, 'Crush solo está disponible para mayores de 18 años.'],
    birth_date_required: [400, 'Completa tu fecha de nacimiento para comprobar que tienes 18 años.'],
    profile_incomplete: [409, 'Completa universidad, carrera e Instagram antes de publicar.'],
    instagram_quarantined: [409, 'Revisa tu Instagram en el perfil de Crush antes de compartirlo.'],
    rate_limited: [429, 'Dale unos segundos al muro antes de volver a publicar.'],
    idempotency_conflict: [409, 'Ese envío ya se utilizó con otro mensaje. Actualiza antes de volver a intentarlo.'],
    self_request: [400, 'Esta publicación es tuya.'],
    already_requested: [409, 'Ya has enviado una solicitud. Puedes verla en Crush.'],
    party_terms_required: [400, 'Acepta las condiciones para activar tu perfil de Crush.'],
    party_acceptance_required: [409, 'Confirma los datos y las condiciones de la fiesta antes de publicar.'],
    adult_required: [403, 'Crush solo está disponible para mayores de 18 años.'],
    account_inactive: [403, 'Esta cuenta está desactivada y no puede participar.'],
    profile_not_ready: [409, 'Tu perfil todavía no está listo. Vuelve a entrar para recuperarlo.'],
    birth_date_unavailable: [409, 'No se ha podido comprobar tu edad. Revisa tu perfil antes de continuar.'],
    invalid_birth_date: [400, 'Revisa la fecha de nacimiento.'],
    invalid_party_profile: [400, 'Revisa el nombre, la carrera y tu usuario de Instagram.'],
    invalid_university: [400, 'Elige una universidad de la lista.'],
    party_profile_incomplete: [409, 'Completa universidad, carrera e Instagram antes de publicar.'],
    crush_participation_required: [409, 'Activa tu perfil de Crush y revisa tu Instagram antes de publicar.'],
    party_rate_limit: [429, 'Ya has publicado 10 mensajes en la última hora. Espera un poco antes del siguiente.'],
    client_request_conflict: [409, 'Ese envío ya se utilizó con otro mensaje. Actualiza antes de volver a intentarlo.'],
    party_post_not_found: [404, 'Esta publicación ya no está disponible.'],
    party_profile_changed: [409, 'Tu nombre o Instagram ha cambiado en otra pestaña. Abre «Mis datos», compruébalos y vuelve a enviar el mensaje.'],
    admin_mfa_required: [403, 'Confirma tu acceso de administrador con la verificación en dos pasos.'],
  };
  const mapped = known[code];
  if (mapped) return partyJson({ message: mapped[1] }, mapped[0]);
  if (error?.code === '42501') return partyJson({ message: 'Tu cuenta no puede realizar esta acción. Comprueba tu perfil y vuelve a entrar.' }, 403);
  if (error?.code === 'P0002') return partyJson({ message: 'Esta fiesta o publicación ya no está disponible.' }, 404);
  if (error?.code === '22023' || error?.code === '23514') return partyJson({ message: 'Revisa los datos del formulario y vuelve a intentarlo.' }, 400);
  return partyJson({ message: 'No se ha podido completar. Tus datos no se han confirmado; vuelve a intentarlo.' }, 503);
}

export async function partyIdentity(req: Request, slug: string, write = false) {
  if (!validPartySlug(slug)) return partyJson({ message: 'El enlace de la fiesta no es válido.' }, 404);
  if (write) {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return partyJson({ message: 'Abre la fiesta desde Franky para continuar.' }, 403);
  }
  const supabase = await createRequestSupabase(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return partyJson({ message: 'Inicia sesión para entrar en la fiesta.' }, 401);
  const limit = await rateLimit(req, { key: write ? 'crush-party-write' : 'crush-party-state', subject: data.user.id, limit: write ? 30 : 90, windowMs: 60000 });
  if (!limit.ok) { for (const [key, value] of Object.entries(partyHeaders)) limit.response.headers.set(key, value); return limit.response; }
  return { supabase, userId: data.user.id };
}

const plain = (max: number) => z.string().trim().min(2, 'Completa este campo.').max(max, `Usa como máximo ${max} caracteres.`).regex(/^[^\x00-\x1F\x7F]*$/, 'Evita los caracteres de control.');
export const partyJoinSchema = z.object({
  university_id: z.string().uuid('Elige tu universidad.'), career: plain(160),
  instagram_handle: z.string().regex(/^[a-zA-Z0-9._]{1,30}$/, 'Escribe tu usuario de Instagram sin espacios.'),
  display_name: plain(40), birth_date: z.iso.date({ message: 'Elige una fecha de nacimiento válida.' }).nullable(), accept_terms: z.literal(true, { message: 'Acepta las condiciones para entrar en Crush.' }),
}).strict();
export const partyPostSchema = z.object({
  body: z.string().trim().min(2, 'Escribe un mensaje.').max(320, 'El mensaje puede tener hasta 320 caracteres.').regex(/^[^\x00-\x08\x0B\x0C\x0E-\x1F\x7F]*$/, 'Evita los caracteres de control.'),
  is_anonymous: z.boolean(), share_instagram: z.boolean(), screen_consent: z.literal(true, { message: 'Confirma que quieres publicar en Crush y en las pantallas.' }), client_request_id: z.string().uuid(),
  expected_instagram_handle: z.string().regex(/^[a-zA-Z0-9._]{1,30}$/).nullable(), expected_display_name: plain(50).nullable(),
}).strict().refine(data => !data.is_anonymous || !data.share_instagram, { message: 'Para compartir tu Instagram, publica con tu nombre.', path: ['share_instagram'] })
  .refine(data => data.share_instagram ? data.expected_instagram_handle !== null : data.expected_instagram_handle === null, { message: 'Comprueba el Instagram que quieres compartir.', path: ['expected_instagram_handle'] })
  .refine(data => data.is_anonymous ? data.expected_display_name === null : data.expected_display_name !== null, { message: 'Comprueba el nombre con el que quieres aparecer.', path: ['expected_display_name'] });

const party = z.object({ id: z.string().uuid(), slug: z.string(), title: z.string(), university_id: z.string().uuid(), university_name: z.string(), starts_at: z.string(), opens_at: z.string(), ends_at: z.string(), active: z.boolean(), screen_paused: z.boolean() });
export const partyPostReceiptSchema = z.object({ id: z.string().uuid(), party_slug: z.string(), already_created: z.boolean(), available: z.boolean(), created_at: z.string() });
export const partyStateSchema = z.object({
  party, joined: z.boolean(), eligible: z.boolean(), posting_open: z.boolean(), display_name: z.string().nullable(), needs_birth_date: z.boolean(), ineligibility_reasons: z.array(z.string()),
  my_post_ids: z.array(z.string().uuid()).max(60),
  my_posts: z.array(z.object({ id: z.string().uuid(), body: z.string().max(320), created_at: z.string(), is_anonymous: z.boolean(), available: z.boolean() })).max(60),
  profile: z.object({ full_name: z.string().nullable(), university_id: z.string().uuid().nullable(), career: z.string().nullable(), instagram_handle: z.string().nullable(), birth_date: z.string().nullable(), opted_in: z.boolean().nullable().transform(value => value === true), role: z.string().nullable() }),
});
export const partyAdminSchema = z.object({ party, posts: z.array(z.object({ id: z.string().uuid(), body: z.string().max(320), display_name: z.string().nullable(), is_anonymous: z.boolean(), created_at: z.string(), hidden: z.boolean(), deleted: z.boolean() })).max(100) });
// A second explicit projection prevents accidental future RPC additions exposing profile data.
export const partyFeedSchema = z.object({ party, generated_at: z.string(), matches: z.number().int().nonnegative().optional(), requests: z.number().int().nonnegative().optional(), posts: z.array(z.object({ id: z.string().uuid(), body: z.string().max(320), display_name: z.string().nullable(), instagram_handle: z.string().regex(/^[a-zA-Z0-9._]{1,30}$/).nullable(), is_anonymous: z.boolean(), created_at: z.string(), reaction_count: z.number().int().nonnegative(), request_count: z.number().int().nonnegative().optional() }).transform(post => post.is_anonymous ? { ...post, display_name: null, instagram_handle: null } : post)).max(60) });
