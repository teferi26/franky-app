import { WEB_URL, fetchConTimeout } from './supabase';
import { captureSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import type { GrowthSnapshot } from '../../../shared/growth';
export type { GrowthSnapshot } from '../../../shared/growth';
export async function growthRequest<T = GrowthSnapshot>(body?: Record<string,unknown>, path = '/api/growth'): Promise<T> {
  const owner = captureSessionIdentity();
  return withOwnedRequest(owner, async request => {
    const response = await fetchConTimeout(`${WEB_URL}${path}`, { method:body?'POST':'GET',headers:{Authorization:request.authorization,'Content-Type':'application/json'},signal:request.signal,...(body?{body:JSON.stringify(body)}:{}) });
    const result = await response.json();
    request.check();
    if (!response.ok) throw new Error(result.message ?? 'No se pudo cargar este espacio. Inténtalo de nuevo.');
    return result as T;
  });
}
