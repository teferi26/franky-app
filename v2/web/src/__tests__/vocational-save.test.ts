import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/vocational/save/route';
import { ownedDraftKey, removeUnchangedDraft } from '@/app/test-vocacional/lib/draft-storage';

const db = vi.hoisted(() => ({ auth: vi.fn(), insert: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({ createServerSupabase: async () => ({
  auth: { getUser: db.auth }, from: () => ({
    insert: db.insert,
    select: () => ({ eq: db.eq }),
  }),
}) }));
const owner = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000002';
function request(body: object) { return new NextRequest('https://franky.es/api/vocational/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  db.auth.mockResolvedValue({ data: { user: { id: owner } } });
  db.insert.mockReturnValue({ select: () => ({ single: db.single }) });
  db.eq.mockReturnValue({ eq: db.eq, maybeSingle: db.maybeSingle });
});

describe('vocational session isolation and retries', () => {
  it('rejects a response computed for a different account before any write', async () => {
    const result = await POST(request({ profile: {}, expectedUserId: attemptId, attemptId }));
    expect(result.status).toBe(409); expect(db.insert).not.toHaveBeenCalled();
  });
  it('recovers the same owned result after a lost successful response', async () => {
    db.single.mockResolvedValue({ data: null, error: { code: '23505' } });
    db.maybeSingle.mockResolvedValue({ data: { id: attemptId }, error: null });
    const result = await POST(request({ profile: {}, expectedUserId: owner, attemptId }));
    expect(result.status).toBe(200); expect(await result.json()).toEqual({ resultId: attemptId });
    expect(db.eq).toHaveBeenCalledWith('user_id', owner);
  });
  it('separates accounts and never clears a newer draft after an old save', () => {
    const oldKey = ownedDraftKey('quiz', owner);
    expect(oldKey).not.toBe(ownedDraftKey('quiz', attemptId));
    expect(oldKey).not.toBe(ownedDraftKey('quiz', null));
    sessionStorage.setItem(oldKey, 'new answers');
    removeUnchangedDraft(oldKey, 'old answers');
    expect(sessionStorage.getItem(oldKey)).toBe('new answers');
    removeUnchangedDraft(oldKey, 'new answers');
    expect(sessionStorage.getItem(oldKey)).toBeNull();
  });
});
