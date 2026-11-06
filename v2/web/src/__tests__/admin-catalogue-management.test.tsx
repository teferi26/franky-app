import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CrudTable from '../app/admin/components/CrudTable';
import { AdminSessionScope } from '../app/admin/components/AdminSessionScope';

const f = vi.hoisted(() => ({ records: [] as any[], rows: [] as any[], confirm: vi.fn(), error: null as any, receipt: true, zeroUpdate: false }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => f.confirm }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => {
  const make = (table: string, kind = 'read', payload?: any) => {
    const record = { table, kind, payload, fields: '', options: null as any, filters: [] as any[], headers: {} as any, signal: null as any };
    const builder: any = {
      select(fields: string, options: any) { record.fields = fields; record.options = options; return builder; }, order: () => builder, range: () => builder,
      eq(...args: any[]) { record.filters.push(args); return builder; }, ilike(...args: any[]) { record.filters.push(args); return builder; },
      update(value: any) { record.kind = 'update'; record.payload = value; return builder; }, insert(value: any) { record.kind = 'insert'; record.payload = value; return builder; },
      delete() { record.kind = 'delete'; return builder; },
      setHeader(key: string, value: string) { record.headers[key] = value; return builder; }, abortSignal(signal: AbortSignal) { record.signal = signal; return builder; },
      maybeSingle: () => builder,
      then(yes: any, no: any) {
        f.records.push(record);
        if (table === 'profiles') return Promise.resolve({ data: { role: 'admin', is_discarded: false }, error: null }).then(yes,no);
        if (f.error) return Promise.resolve({ data: null, count: null, error: f.error }).then(yes,no);
        if (table === 'delete_catalogue_record') {
          if (!f.receipt) return Promise.resolve({ data: null, error: null }).then(yes,no);
          f.rows = []; return Promise.resolve({ data: { discarded_record_id: '00000000-0000-4000-8000-000000000002', original_id: payload.p_record_id, original_table: payload.p_table, snapshot_complete: true, deleted_at: '2026-09-06T11:00:00Z' }, error: null }).then(yes,no);
        }
        if (kind === 'rpc') return Promise.resolve({ data: null, error: null }).then(yes,no);
        return Promise.resolve({ data: record.kind === 'update' && f.zeroUpdate ? [] : f.rows, count: f.rows.length, error: null }).then(yes,no);
      },
    }; return builder;
  };
  return { auth: { getSession: async () => ({ data: { session: { user: { id: 'admin' }, access_token: `h.${btoa('{"aal":"aal2"}')}.s` } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: (table: string) => make(table), rpc: (name: string, args: any) => make(name, 'rpc', args) };
} }));
const id = '00000000-0000-4000-8000-000000000001';
const open = (table = 'universities') => render(<AdminSessionScope viewerId="admin"><CrudTable table={table} label="Catálogo" columns={[{ key: 'name', label: 'Nombre' }, { key: 'created_at', label: 'Alta', editable: false }]} /></AdminSessionScope>);
beforeEach(() => { f.records.length = 0; f.rows = [{ id, name: 'Ficha de prueba', created_at: '2026-09-01' }]; f.confirm.mockReset().mockResolvedValue(true); f.error = null; f.receipt = true; f.zeroUpdate = false; });
describe('Catalogue deletion saves a full server snapshot or does nothing', () => {
  it('sends only the row identity to the atomic deletion RPC', async () => {
    open(); await screen.findByText('Ficha de prueba'); fireEvent.click(screen.getByTitle('Mover a la papelera'));
    await waitFor(() => expect(f.records.some(record => record.table === 'delete_catalogue_record')).toBe(true));
    const call = f.records.find(record => record.table === 'delete_catalogue_record'); expect(call.payload).toEqual({ p_table: 'universities', p_record_id: id });
    expect(call.headers.Authorization).toContain('Bearer '); expect(f.records.some(record => record.table === 'discarded_records' || record.kind === 'delete')).toBe(false);
    await screen.findByText('No hay registros');
  });
  it('does not mutate when the confirmation is cancelled', async () => {
    f.confirm.mockResolvedValue(false); open(); await screen.findByText('Ficha de prueba'); fireEvent.click(screen.getByTitle('Mover a la papelera'));
    await waitFor(() => expect(f.confirm).toHaveBeenCalled()); expect(f.records.some(record => record.table === 'delete_catalogue_record')).toBe(false); expect(screen.getByText('Ficha de prueba')).toBeInTheDocument();
  });
  it('keeps the row visible when a dependent record prevents deletion', async () => {
    open(); await screen.findByText('Ficha de prueba'); f.error = { message: 'catalogue_record_has_dependencies' }; fireEvent.click(screen.getByTitle('Mover a la papelera'));
    await screen.findByText(/relacionada con otros datos/); expect(screen.getByText('Ficha de prueba')).toBeInTheDocument();
  });
  it('does not claim success without a matching deletion receipt', async () => {
    f.receipt = false; open(); await screen.findByText('Ficha de prueba'); fireEvent.click(screen.getByTitle('Mover a la papelera'));
    await screen.findByText(/No se ha confirmado el borrado/); expect(screen.getByText('Ficha de prueba')).toBeInTheDocument();
  });
  it.each(['news','events','accommodations'])('does not offer generic destructive deletion of %s', async table => {
    open(table); await screen.findByText('Ficha de prueba'); expect(screen.queryByTitle('Mover a la papelera')).toBeNull(); expect(screen.getByText(/gestión específica/)).toBeInTheDocument();
  });
  it('updates editable fields without replaying the ID or read-only metadata', async () => {
    open(); await screen.findByText('Ficha de prueba'); fireEvent.click(screen.getByTitle('Editar'));
    fireEvent.change(screen.getByDisplayValue('Ficha de prueba'), { target: { value: 'Título corregido' } }); fireEvent.click(screen.getByTitle('Guardar'));
    await waitFor(() => expect(f.records.some(record => record.kind === 'update')).toBe(true));
    expect(f.records.find(record => record.kind === 'update').payload).toEqual({ name: 'Título corregido' });
  });
  it('does not report saved when the update matched no authorized row', async () => {
    f.zeroUpdate = true; open(); await screen.findByText('Ficha de prueba'); fireEvent.click(screen.getByTitle('Editar')); fireEvent.click(screen.getByTitle('Guardar'));
    await screen.findByText(/no está disponible o no tienes permiso/); expect(f.records.some(record => record.table === 'log_admin_action')).toBe(false);
  });
  it('shows a source failure with retry rather than an empty catalogue', async () => {
    f.error = { message: 'connection failed' }; open(); await screen.findByText(/No se pudo cargar el catálogo/);
    expect(screen.queryByText('No hay registros')).toBeNull(); f.error = null; fireEvent.click(screen.getByText('Reintentar')); await screen.findByText('Ficha de prueba');
  });
});
