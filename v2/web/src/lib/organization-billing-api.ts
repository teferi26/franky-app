import { NextRequest, NextResponse } from 'next/server';
import { createRequestSupabase } from './supabase-server';
import { cardOriginAllowed, CARD_PRIVATE_HEADERS } from './franky-card-api';
import { rateLimit } from './rate-limit';
import { isDemoPaymentActor } from './payment-demo-guard';
import type { User } from '@supabase/supabase-js';

export const ORGANIZATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const organizationJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: CARD_PRIVATE_HEADERS });
export const organizationNativeRequest = (req: NextRequest) => req.headers.get('x-franky-client') === 'native' || !!req.headers.get('authorization');
export async function organizationBillingRequest(req: NextRequest, organizationId: string, mutation: boolean): Promise<
  { response: NextResponse } | { client: Awaited<ReturnType<typeof createRequestSupabase>>; user: User }
> {
  if (!ORGANIZATION_UUID.test(organizationId)) return { response: organizationJson({ error: 'Espacio no válido.' }, 400) } as const;
  // Native billing needs its own store-reviewed purchase contract. A bearer header is never a browser-cookie purchase.
  if (mutation && (organizationNativeRequest(req) || !req.headers.get('origin') || !cardOriginAllowed(req)
    || req.headers.get('sec-fetch-site') === 'cross-site'))
    return { response: organizationJson({ error: 'Esta gestión requiere la sesión web de Franky.' }, 403) } as const;
  const client = await createRequestSupabase(req);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { response: organizationJson({ error: 'Inicia sesión para continuar.' }, 401) } as const;
  const { data: usable, error: unavailable } = await client.rpc('account_session_usable');
  if (unavailable || usable !== true) return { response: organizationJson({ error: 'La cuenta no está disponible.' }, 403) } as const;
  if (await isDemoPaymentActor(user.id)) return { response: organizationJson({ error: 'La facturación está desactivada en las cuentas de demostración.' }, 403) } as const;
  const rate = await rateLimit(req, { key: `organization-billing:${mutation ? 'write' : 'read'}`, subject: user.id, limit: mutation ? 10 : 40, windowMs: 60_000 });
  if (!rate.ok) return { response: rate.response ?? organizationJson({ error: 'Espera antes de volver a intentarlo.' }, 429) } as const;
  return { client, user } as const;
}
export function organizationBillingFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/aal2|mfa|assurance/i.test(message)) return organizationJson({ error: 'Confirma tu identidad con la verificación en dos pasos.', code: 'mfa_required' }, 403);
  if (/permission|forbidden|unauthorized|not_authorized|access_denied/i.test(message)) return organizationJson({ error: 'No tienes permiso para gestionar la facturación de este espacio.' }, 403);
  if (/sales_disabled|checkout_unavailable|not_ready/i.test(message)) return organizationJson({ error: 'La contratación aún no está disponible. Tu servicio actual continúa según sus condiciones.' }, 409);
  if (/quote_expired|quote_changed|terms|consent|price_changed/i.test(message)) return organizationJson({ error: 'Actualiza la propuesta y acepta sus condiciones antes de continuar.' }, 409);
  return organizationJson({ error: 'No se ha podido comprobar la facturación. Reintenta la misma operación; no abras otra compra.' }, 503);
}
