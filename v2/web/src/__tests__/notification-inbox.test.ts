import { describe, expect, it, vi } from 'vitest';
import { createNotificationInbox as webInbox, openInboxNotification, type InboxNotification, type InboxPage } from '@/lib/notification-inbox';
import { createNotificationInbox as mobileInbox } from '../../../mobile/src/lib/notification-inbox';
import { inboxCursorFilter, createInboxServices } from '@/lib/notification-inbox-query';
import { notificationWebDestination, notificationNativeDestination, safeNotificationPath } from '@/lib/notification-destinations';
import { notificationNativeDestination as nativeDestination } from '../../../mobile/src/lib/notification-destinations';

const uuid = '11111111-1111-4111-8111-111111111111';
const notice = (id: string, extra: Partial<InboxNotification> = {}): InboxNotification => ({ id, created_at: '2026-09-05T10:00:00.123456+00:00', type: 'news', title: id, body: null, data: null, is_read: false, ...extra });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const page = (...items: InboxNotification[]): InboxPage => ({ items, hasMore: false });

describe.each([['web', webInbox], ['mobile', mobileInbox]] as const)('%s account-scoped inbox', (_, create) => {
  it('confirms the read after delayed auth before navigation unmounts the inbox', async () => {
    let active = true;
    const auth = deferred<any>(); const update = vi.fn();
    const query: any = { update: (...args: any[]) => { update(...args); return query; }, eq: () => query, in: () => query, select: async () => ({ data: [{ id: uuid }], error: null }) };
    const services = createInboxServices({ auth: { getUser: () => auth.promise }, from: () => query } as any, 'owner', () => active);
    const inbox = create({ ...services, fetchPage: async () => page(notice(uuid)) });
    inbox.start(); await vi.waitFor(() => expect(inbox.getSnapshot().loading).toBe(false));
    const navigate = vi.fn(() => { active = false; inbox.stop(); });
    const opening = openInboxNotification(notice(uuid), { isCurrent: () => active, markRead: inbox.markRead, destination: '/noticias', navigate });
    expect(navigate).not.toHaveBeenCalled(); auth.resolve({ data: { user: { id: 'owner' } }, error: null }); await opening;
    expect(update).toHaveBeenCalledOnce(); expect(inbox.getSnapshot().items[0].is_read).toBe(true); expect(navigate).toHaveBeenCalledOnce();
  });
  it('keeps the inbox open for retry if marking the destination fails', async () => {
    const navigate = vi.fn();
    await openInboxNotification(notice(uuid), { isCurrent: () => true, markRead: async () => false, destination: '/noticias', navigate });
    expect(navigate).not.toHaveBeenCalled();
  });
  it('discards an old account response, including after a restart', async () => {
    const old = deferred<InboxPage>();
    const fetchPage = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(page(notice('new')));
    const inbox = create({ fetchPage, markRead: vi.fn(), isCurrent: () => true });
    inbox.start(); inbox.stop(); inbox.start();
    await vi.waitFor(() => expect(inbox.getSnapshot().items[0]?.id).toBe('new'));
    old.resolve(page(notice('old'))); await old.promise;
    expect(inbox.getSnapshot().items.map(row => row.id)).toEqual(['new']);
    inbox.stop();
  });
  it('retains a live arrival while the initial response is in flight', async () => {
    const pending = deferred<InboxPage>();
    const inbox = create({ fetchPage: () => pending.promise, markRead: vi.fn(), isCurrent: () => true });
    inbox.start(); inbox.receive(notice('new'), true);
    pending.resolve(page(notice('old')));
    await vi.waitFor(() => expect(inbox.getSnapshot().loading).toBe(false));
    expect(new Set(inbox.getSnapshot().items.map(row => row.id))).toEqual(new Set(['new', 'old']));
    inbox.stop();
  });
  it('paginates with the last server row and deduplicates overlapping notices', async () => {
    const first = notice('b'); const last = notice('a');
    const fetchPage = vi.fn().mockResolvedValueOnce({ items: [first, last], hasMore: true }).mockResolvedValue(page(last, notice('0')));
    const inbox = create({ fetchPage, markRead: vi.fn(), isCurrent: () => true });
    inbox.start(); await vi.waitFor(() => expect(inbox.getSnapshot().loading).toBe(false));
    await Promise.all([inbox.loadMore(), inbox.loadMore()]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls[1][0]).toEqual({ id: last.id, created_at: last.created_at });
    expect(inbox.getSnapshot().items.map(row => row.id)).toEqual(['b', 'a', '0']);
    inbox.stop();
  });
  it('keeps unread state on a rejected write and allows a retry', async () => {
    const markRead = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const inbox = create({ fetchPage: async () => page(notice('a')), markRead, isCurrent: () => true });
    inbox.start(); await vi.waitFor(() => expect(inbox.getSnapshot().loading).toBe(false));
    expect(await inbox.markRead(['a'])).toBe(false);
    expect(inbox.getSnapshot().items[0].is_read).toBe(false);
    expect(inbox.getSnapshot().readError).toBe(true);
    expect(await inbox.markRead(['a'])).toBe(true);
    expect(inbox.getSnapshot().items[0].is_read).toBe(true);
    inbox.stop();
  });
  it('serializes writes and does not reintroduce unread state from a stale refresh', async () => {
    const pending = deferred<InboxPage>(); const write = deferred<void>();
    const fetchPage = vi.fn().mockResolvedValueOnce(page(notice('a'))).mockReturnValueOnce(pending.promise);
    const markRead = vi.fn().mockReturnValue(write.promise);
    const inbox = create({ fetchPage, markRead, isCurrent: () => true });
    inbox.start(); await vi.waitFor(() => expect(inbox.getSnapshot().loading).toBe(false));
    const refresh = inbox.refresh(); const saving = inbox.markRead(['a']);
    expect(await inbox.markRead(['a'])).toBe(false);
    write.resolve(); expect(await saving).toBe(true);
    pending.resolve(page(notice('a'))); await refresh;
    expect(inbox.getSnapshot().items[0].is_read).toBe(true);
    expect(markRead).toHaveBeenCalledTimes(1);
    inbox.stop();
  });
  it('ignores the old account write and new realtime messages as soon as identity changes', async () => {
    let current = true; const pending = deferred<void>();
    const inbox = create({ fetchPage: async () => page(notice('a')), markRead: () => pending.promise, isCurrent: () => current });
    inbox.start(); await vi.waitFor(() => expect(inbox.getSnapshot().loading).toBe(false));
    const saving = inbox.markRead(['a']); current = false;
    inbox.receive(notice('private'), true); pending.resolve();
    expect(await saving).toBe(false);
    expect(inbox.getSnapshot().items.map(row => row.id)).toEqual(['a']);
    expect(inbox.getSnapshot().items[0].is_read).toBe(false);
    inbox.stop();
  });
});

describe('notification destinations and cursor integrity', () => {
  it('retains microseconds and a UUID tie breaker in the pagination cursor', () => {
    expect(inboxCursorFilter(notice(uuid))).toBe(`created_at.lt.2026-09-05T10:00:00.123456+00:00,and(created_at.eq.2026-09-05T10:00:00.123456+00:00,id.lt.${uuid})`);
    expect(() => inboxCursorFilter(notice('x),user_id.neq.y'))).toThrow('invalid_cursor');
  });
  it('routes historical Roomie likes and matches to their actual connections', () => {
    const like = { from_user_id: uuid }; const match = { target_user_id: uuid };
    expect(notificationWebDestination(like, 'roomie_like')).toBe('/roomie-match?tab=received#roomie-likes');
    expect(notificationWebDestination(match, 'match')).toBe('/roomie-match?tab=matches#roomie-likes');
    for (const resolve of [notificationNativeDestination, nativeDestination]) {
      expect(resolve(like, 'roomie_like')).toBe('/roomie-conexiones?tab=received');
      expect(resolve(match, 'match')).toBe('/roomie-conexiones?tab=matches');
      expect(resolve({ kind: 'ig_request', url: '/crush' }, 'match')).toBe('/(tabs)/crush');
    }
  });
  it('opens messages that never had data.url and retains the explicit Crush Live destination', () => {
    expect(notificationWebDestination({ conversation_id: uuid }, 'message')).toBe('/chats?chat=' + uuid);
    for (const resolve of [notificationNativeDestination, nativeDestination]) {
      expect(resolve({ conversation_id: uuid }, 'message')).toBe('/chat/' + uuid);
      expect(resolve({ conversation_id: uuid, url: '/crush-live?eventId=' + uuid })).toBe('/crush-live?eventId=' + uuid);
    }
  });
  it.each(['//evil.test', '/\\evil.test', '/%5cevil.test', '/%252f%252fevil.test', '/\nevil.test', '/x/..//evil.test', 'https://evil.test', '/%E0%A4%A'])('rejects an unsafe internal destination %j', path => {
    expect(safeNotificationPath(path)).toBeNull();
  });
  it.each([
    ['/noticias/nuevo-franky', '/noticia/nuevo-franky'], ['/noticias?categoria=campus', '/novedades?categoria=campus'],
    [`/alojamiento/${uuid}`, `/piso/${uuid}`], [`/fomo/universidad-de-alicante/${uuid}`, `/fomo/${uuid}`],
    ['/horario?tab=examenes', '/horario?tab=examenes'], ['/contratos/example', null],
    ['/propietario/dashboard', null], ['/admin', null], ['/auth/callback?code=bad', null],
  ])('maps only existing native destinations for %s', (url, expected) => {
    expect(notificationNativeDestination({ url })).toBe(expected);
    expect(nativeDestination({ url })).toBe(expected);
  });
});
