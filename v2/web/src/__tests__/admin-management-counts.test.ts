import { describe, expect, it } from 'vitest';
import { readManagementCounts } from '@/lib/admin-management-counts';
import { adminOperationError, isReportStrikeResult, isRestorationResult, restorationHint } from '@/lib/admin-operation-result';
import { readFileSync } from 'node:fs';

function fixture(broken?: string, count: number | null = 0) {
  const records: any[] = [];
  const client: any = { from(table: string) {
    const record = { table, filters: [] as unknown[], options: null as any }; records.push(record);
    const builder: any = { select(_fields: string, options: any) { record.options = options; return builder; },
      not(...args: any[]) { record.filters.push(['not', ...args]); return builder; }, eq(...args: any[]) { record.filters.push(['eq', ...args]); return builder; },
      then(yes: any, no: any) { return Promise.resolve({ error: table === broken ? { message: 'offline' } : null, count }).then(yes, no); },
    }; return builder;
  } }; return { client, records };
}
describe('Management inventory uses complete, meaningful counts', () => {
  it('preserves actual zeros across all twelve sources', async () => {
    const f = fixture(); const counts = await readManagementCounts(f.client); expect(Object.keys(counts)).toHaveLength(12); expect(Object.values(counts).every(n => n === 0)).toBe(true);
    expect(f.records.every(r => r.options.head && r.options.count === 'exact')).toBe(true);
  });
  it('excludes discarded profiles while keeping legacy NULL flags', async () => {
    const f = fixture(); await readManagementCounts(f.client);
    const active = f.records.filter(r => r.table === 'profiles' && !r.filters.some((v: any) => v[0] === 'eq' && v[1] === 'is_discarded'));
    expect(active).toHaveLength(4); expect(active.every(r => r.filters.some((v: any) => v.join('|') === 'not|is_discarded|is|true'))).toBe(true);
  });
  it('rejects an incomplete source rather than silently returning a partial inventory', async () => {
    await expect(readManagementCounts(fixture('careers').client)).rejects.toThrow(/inventario/);
    await expect(readManagementCounts(fixture(undefined, null).client)).rejects.toThrow(/inventario/);
  });
  it('does not cap inventory counts to a page of database rows', async () => {
    expect((await readManagementCounts(fixture(undefined, 10001).client)).users).toBe(10001);
  });
});

describe('Reviewed administration RPC contracts', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('keeps native and web interpretation identical', () => {
    expect(readFileSync('../mobile/src/lib/admin-operation-result.ts','utf8')).toBe(readFileSync('src/lib/admin-operation-result.ts','utf8'));
  });
  it('rejects missing or mismatched receipts without manufacturing success', () => {
    expect(isRestorationResult(null)).toBe(false); expect(isRestorationResult({ original_id: id, original_table: 'careers', restored_at: 'bad', already_restored: false })).toBe(false);
    expect(isRestorationResult({ original_id: id, original_table: 'careers', restored_at: '2026-09-06T10:00:00Z', already_restored: false })).toBe(true);
    expect(isReportStrikeResult({ strike_id: id, user_id: id, report_id: 'different', already_issued: false, report_status: 'reviewed' }, id)).toBe(false);
  });
  it('explains unsupported recovery and incomplete old leisure snapshots', () => {
    expect(restorationHint('profiles', {})).toContain('específica'); expect(restorationHint('news', {})).toContain('específica');
    expect(restorationHint('leisure_spots', {})).toContain('facturación'); expect(restorationHint('leisure_spots', { owner_id: null, subscription_id: null })).toBeNull();
    expect(adminOperationError({ message: 'restore_target_already_exists' })).toContain('ya existe');
    expect(adminOperationError({ message: 'private SQL details' })).not.toContain('SQL');
  });
});
