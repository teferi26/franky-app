import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest, adminJson } from '@/lib/admin-request';
import { uuid } from '@/lib/api-helpers';

/** Containment until commerce retention is transactional and tested.
 * Auth deletion cascades into contracts/tickets and unlinks historical payments.
 * A read-before-delete cannot protect a concurrent purchase. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requireAdminRequest(request);
  if (identity instanceof NextResponse) return identity;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return adminJson({ error: 'ID de usuario no válido' }, { status: 400 });
  return adminJson({ code: 'permanent_delete_suspended',
    error: 'El borrado permanente está suspendido para proteger contratos, entradas y pagos. Puedes desactivar la cuenta conservando su historial.' }, { status: 409 });
}
