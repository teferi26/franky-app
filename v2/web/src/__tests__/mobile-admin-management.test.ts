import { describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() {
  let owner = { userId: 'admin-a', generation: 1 }, role = 'admin', aal = 'aal2';
  const listeners = new Set<() => void>();
  const records: any[] = [];
  const response = vi.fn(async (record: any): Promise<any> => {
    if (record.fields === 'role, is_discarded') return { data: { role, is_discarded: false }, error: null };
    if (record.method === 'insert') return { data: [{ id: 'written' }], error: null };
    if (record.method === 'update') return { data: [{ id: 'updated' }], error: null };
    return { data: [], error: null, count: 2 };
  });
  const query = (table: string, payload?: unknown) => {
    const record = { table, method: payload === undefined ? 'select' : 'rpc', payload, fields: '', filters: [] as any[], headers: {} as Record<string, string>, signal: undefined as AbortSignal | undefined };
    const builder: any = {
      select(fields: string) { record.fields = fields; return builder; },
      insert(value: unknown) { record.method = 'insert'; record.payload = value; return builder; },
      update(value: unknown) { record.method = 'update'; record.payload = value; return builder; },
      setHeader(name: string, value: string) { record.headers[name] = value; return builder; },
      abortSignal(signal: AbortSignal) { record.signal = signal; return builder; },
      then(yes: any, no: any) { records.push(record); return response(record).then(yes, no); },
    };
    for (const method of ['eq', 'not', 'is', 'order', 'range', 'limit', 'or', 'maybeSingle']) builder[method] = (...args: any[]) => { record.filters.push([method, ...args]); return builder; };
    return builder;
  };
  const getUser = vi.fn(async () => ({ data: { user: { id: owner.userId } }, error: null }));
  const getSession = vi.fn(async () => ({ data: { session: { user: { id: owner.userId }, access_token: `token-${owner.userId}` } }, error: null }));
  const supabase = { auth: { getUser, getSession, mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: aal }, error: null }) } }, from: (name: string) => query(name), rpc: (name: string, payload: unknown) => query(name, payload) };
  const session = { captureSessionIdentity: () => ({ ...owner }), isCurrentSessionIdentity: (value: typeof owner) => value.userId === owner.userId && value.generation === owner.generation,
    onSessionIdentityChange(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); } };
  const fetcher = vi.fn(async (): Promise<any> => ({ ok: true, json: async () => ({}) }));
  const shared = { supabase, WEB_URL: 'https://fixture.invalid', fetchConTimeout: fetcher };
  const load = nativeLoader({ '@/lib/supabase': shared, './supabase': shared, '@/lib/session': session, './session': session });
  return { api: load('../mobile/src/lib/admin.ts'), profile: load('../mobile/src/lib/profile.ts'), owner: () => ({ ...owner }), records, response, getUser, getSession, fetcher,
    setRole(value: string) { role = value; }, setAal(value: string) { aal = value; },
    change() { owner = { userId: 'admin-b', generation: owner.generation + 1 }; for (const listener of listeners) listener(); } };
}

describe('Native management fixes actor, permissions and incomplete writes', () => {
  it('rejects an old confirmation before looking up the new administrator', async () => {
    const f = fixture(), owner = f.owner(); f.change();
    await expect(f.api.alternarDescartado('target', false, owner)).rejects.toThrow('session_changed'); expect(f.getUser).not.toHaveBeenCalled(); expect(f.records).toHaveLength(0);
  });
  it('does not write after an account changes while checking the staff role', async () => {
    const f = fixture(), pending = deferred<any>(); f.getUser.mockReturnValueOnce(pending.promise);
    const operation = f.api.ponerStrike('target', 'Motivo', f.owner()); const rejected = expect(operation).rejects.toThrow('session_changed');
    f.change(); pending.resolve({ data: { user: { id: 'admin-a' } }, error: null }); await rejected;
    expect(f.records.filter(r => r.method === 'insert' || r.method === 'rpc')).toHaveLength(0);
  });
  it('requires AAL2 before reading data which RLS could otherwise reduce to own rows', async () => {
    const f = fixture(); f.setAal('aal1'); await expect(f.api.listUsuarios()).rejects.toBeInstanceOf(f.api.MfaRequiredError);
    expect(f.records.filter(r => r.fields !== 'role, is_discarded')).toHaveLength(0);
  });
  it('keeps analyst access read-only', async () => {
    const f = fixture(); f.setRole('analyst'); await expect(f.api.ponerStrike('target', 'Motivo')).rejects.toThrow(/permiso/);
    expect(f.records.some(r => r.method === 'insert')).toBe(false);
  });
  it('pins both the strike and its audit entry to the initial administrator', async () => {
    const f = fixture(); await f.api.ponerStrike('target', ' Motivo ');
    const write = f.records.find(r => r.method === 'insert'), log = f.records.find(r => r.table === 'log_admin_action');
    expect(write.payload).toMatchObject({ issued_by: 'admin-a', reason: 'Motivo' }); expect(log.payload.p_admin_id).toBe('admin-a');
    expect(write.headers.Authorization).toBe('Bearer token-admin-a'); expect(log.headers.Authorization).toBe(write.headers.Authorization);
  });
  it('does not issue a subsequent audit or mutation with B after a write for A returns late', async () => {
    const f = fixture(), pending = deferred<any>(); f.response.mockImplementation(async record => record.method === 'insert' ? pending.promise : { data: { role: 'admin', is_discarded: false }, error: null });
    const operation = f.api.ponerStrike('target', 'Motivo'); const rejected = expect(operation).rejects.toThrow('session_changed');
    await vi.waitFor(() => expect(f.records.some(r => r.method === 'insert')).toBe(true)); f.change(); pending.resolve({ data: [{ id: 'strike' }], error: null }); await rejected;
    expect(f.records.find(r => r.method === 'insert').signal.aborted).toBe(true); expect(f.records.some(r => r.table === 'log_admin_action')).toBe(false);
  });
  it('does not claim or log a report update which affected zero rows', async () => {
    const f = fixture(); f.response.mockImplementation(async r => r.method === 'update' ? { data: [], error: null } : { data: { role: 'admin', is_discarded: false }, error: null });
    await expect(f.api.resolverReporte('report', 'reviewed')).rejects.toThrow(/ya cambió/); expect(f.records.some(r => r.table === 'log_admin_action')).toBe(false);
  });
  it('does not present a partial trash list as complete', async () => {
    const f = fixture(); f.response.mockImplementation(async r => r.fields === 'role, is_discarded' ? { data: { role: 'admin' }, error: null } : r.table === 'discarded_records' ? { data: null, error: { message: 'offline' } } : { data: [], error: null });
    await expect(f.api.listPapelera()).rejects.toThrow(/toda la papelera/);
  });
  it('does not restore a self-deleted user', async () => {
    const f = fixture(); await expect(f.api.restaurarDePapelera({ tipo: 'usuario', id: 'deleted', bruto: { self_deleted: true } })).rejects.toThrow(/titular/); expect(f.records).toHaveLength(0);
  });
  it('uses the original bearer and abort signal for a role change', async () => {
    const f = fixture(); await f.api.cambiarRol('target', 'analyst');
    expect(f.fetcher).toHaveBeenCalledWith('https://fixture.invalid/api/admin/users/target/set-role', expect.objectContaining({ headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-admin-a' }, signal: expect.any(AbortSignal) }));
  });
});

describe('Native profile writes never adopt another account', () => {
  it('requires the requested profile and captured owner to agree', async () => {
    const f = fixture(); await expect(f.profile.updateMyProfile('someone-else', { full_name: 'Stale' })).rejects.toThrow('session_changed'); expect(f.records).toHaveLength(0);
  });
  it('does not dispatch a profile update after its session read changes account', async () => {
    const f = fixture(), pending = deferred<any>(); f.getSession.mockReturnValueOnce(pending.promise);
    const operation = f.profile.updateMyProfile('admin-a', { full_name: 'A' }, f.owner()); const rejected = expect(operation).rejects.toThrow('session_changed');
    f.change(); pending.resolve({ data: { session: { user: { id: 'admin-a' }, access_token: 'old-a' } }, error: null }); await rejected; expect(f.records).toHaveLength(0);
  });
  it('pins profile updates and acknowledges only an affected row', async () => {
    const f = fixture(); expect(await f.profile.updateMyProfile('admin-a', { full_name: 'A' })).toEqual({ ok: true });
    expect(f.records[0].headers.Authorization).toBe('Bearer token-admin-a');
    f.response.mockResolvedValue({ data: [], error: null }); expect(await f.profile.updateMyProfile('admin-a', { full_name: 'A' })).toMatchObject({ ok: false });
  });
});

describe('Native administration uses atomic strike and restoration receipts', () => {
  const reportId = '00000000-0000-4000-8000-000000000001', targetId = '00000000-0000-4000-8000-000000000002';
  it('lets the server derive the reported user and records only the report ID', async () => {
    const f = fixture(); f.response.mockImplementation(async record => record.table === 'issue_strike_from_report' ? { data: { report_id:reportId,user_id:targetId,strike_id:targetId,report_status:'reviewed',already_issued:false }, error:null } : { data:{role:'admin',is_discarded:false},error:null });
    await f.api.strikeDesdeReporte(reportId);
    const operations = f.records.filter(record => record.method === 'rpc'); expect(operations).toHaveLength(1); expect(operations[0].payload).toEqual({p_report_id:reportId}); expect(operations[0].headers.Authorization).toBe('Bearer token-admin-a');
  });
  it('does not accept a receipt for a different report', async () => {
    const f = fixture(); f.response.mockImplementation(async record => record.table === 'issue_strike_from_report' ? { data: { report_id:targetId,user_id:targetId,strike_id:targetId,report_status:'reviewed',already_issued:false }, error:null } : { data:{role:'admin'},error:null });
    await expect(f.api.strikeDesdeReporte(reportId)).rejects.toThrow(/confirmar el strike/);
  });
  it('does not send a client snapshot when restoring a catalogue row', async () => {
    const f = fixture(); f.response.mockImplementation(async record => record.table === 'restore_discarded_record' ? { data: { original_id:targetId,original_table:'careers',restored_at:'2026-09-06T11:00:00Z',already_restored:false }, error:null } : { data:{role:'admin'},error:null });
    await f.api.restaurarDePapelera({ tipo:'registro',id:reportId,bruto:{original_table:'careers',data:{id:'tampered',name:'Tampered'}} });
    const operation = f.records.find(record => record.table === 'restore_discarded_record'); expect(operation.payload).toEqual({p_record_id:reportId}); expect(f.records.some(record => record.method === 'insert')).toBe(false);
  });
  it('keeps restoration failure distinct from success', async () => {
    const f = fixture(); f.response.mockImplementation(async record => record.table === 'restore_discarded_record' ? { data:null,error:{message:'restore_requires_billing_review'} } : { data:{role:'admin'},error:null });
    await expect(f.api.restaurarDePapelera({tipo:'registro',id:reportId,bruto:{}})).rejects.toThrow(/facturación/);
  });
});
