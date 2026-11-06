import type { SupabaseClient } from '@supabase/supabase-js';
import type { InboxCursor, InboxNotification, InboxServices } from './notification-inbox';

export const INBOX_PAGE_SIZE = 50;
export const INBOX_COLUMNS = 'id,type,title,body,is_read,created_at,data';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A keyset cursor retains PostgreSQL microseconds and never interpolates arbitrary text. */
export function inboxCursorFilter(cursor: InboxCursor): string {
  if (!UUID.test(cursor.id) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.created_at) || !Number.isFinite(Date.parse(cursor.created_at))) throw new Error('invalid_cursor');
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

export function createInboxServices(client: SupabaseClient, owner: string, isCurrent: () => boolean): InboxServices {
  return {
    isCurrent,
    async fetchPage(cursor, signal) {
      if (!isCurrent()) throw new Error('session_changed');
      let query = client.from('notifications').select(INBOX_COLUMNS).eq('user_id', owner)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(INBOX_PAGE_SIZE + 1).abortSignal(signal);
      if (cursor) query = query.or(inboxCursorFilter(cursor));
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as InboxNotification[];
      return { items: rows.slice(0, INBOX_PAGE_SIZE), hasMore: rows.length > INBOX_PAGE_SIZE };
    },
    async markRead(ids) {
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !isCurrent() || user?.id !== owner) throw new Error('session_changed');
      for (let offset = 0; offset < ids.length; offset += 200) {
        if (!isCurrent()) throw new Error('session_changed');
        const batch = ids.slice(offset, offset + 200);
        const { data, error } = await client.from('notifications').update({ is_read: true }).eq('user_id', owner).in('id', batch).select('id');
        if (error) throw error;
        const changed = new Set((data ?? []).map((row: { id: string }) => row.id));
        if (batch.some(id => !changed.has(id))) throw new Error('notification_not_updated');
      }
    },
  };
}
