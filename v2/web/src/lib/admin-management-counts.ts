import type { SupabaseClient } from '@supabase/supabase-js';

export type ManagementCounts = {
  users: number; careers: number; universities: number; scholarships: number;
  news: number; events: number; accommodations: number; lookingHousing: number;
  lookingRoommate: number; propietarios: number; discarded: number; pendingReports: number;
};
type Request = { query<T extends { setHeader(name: string, value: string): unknown; abortSignal(signal: AbortSignal): unknown }>(builder: T): T };

/** Complete inventory counts. A failed source must never become a zero. */
export async function readManagementCounts(supabase: SupabaseClient, request?: Request): Promise<ManagementCounts> {
  const count = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true });
  const profiles = () => count('profiles').not('is_discarded', 'is', true);
  const queries = {
    users: profiles(), careers: count('careers'), universities: count('universities'),
    scholarships: count('scholarships'), news: count('news'), events: count('events'), accommodations: count('accommodations'),
    lookingHousing: profiles().eq('looking_for_housing', true), lookingRoommate: profiles().eq('looking_for_roommate', true),
    propietarios: profiles().eq('role', 'propietario'), discarded: count('profiles').eq('is_discarded', true),
    pendingReports: count('user_reports').eq('status', 'pending'),
  };
  const rows = await Promise.all(Object.entries(queries).map(async ([key, query]) => {
    const result = await (request ? request.query(query) : query);
    if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) {
      throw new Error('No se pudo comprobar todo el inventario. Vuelve a cargar el panel.');
    }
    return [key, result.count] as const;
  }));
  return Object.fromEntries(rows) as ManagementCounts;
}
