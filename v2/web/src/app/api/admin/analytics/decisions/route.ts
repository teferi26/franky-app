import { NextResponse, type NextRequest } from 'next/server';
import { createRequestSupabase } from '@/lib/supabase-server';
import { requireStaff } from '@/lib/analytics-filters';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const guard = await requireStaff(req);
  if (!guard.ok) return guard.response;
  const days = Number(req.nextUrl.searchParams.get('days') ?? 30);
  if (![7, 30, 90].includes(days)) return NextResponse.json({ error: 'Periodo no válido' }, { status: 400 });
  const db = await createRequestSupabase(req);
  const { data, error } = await db.rpc('admin_decision_metrics', { p_days: days });
  if (error) return NextResponse.json({ error: 'No se pudieron cargar los indicadores. Comprueba tu sesión y el segundo factor.' }, { status: 503 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
