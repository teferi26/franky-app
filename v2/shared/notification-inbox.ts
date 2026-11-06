/** Account-scoped inbox. This pure controller is mirrored in the mobile app. */
export type InboxNotification = {
  id: string; type: string | null; title: string; body: string | null;
  is_read: boolean; created_at: string; data: Record<string, unknown> | null;
};
export type InboxCursor = Pick<InboxNotification, 'id' | 'created_at'>;
export type InboxPage = { items: InboxNotification[]; hasMore: boolean };
export type InboxServices = {
  isCurrent: () => boolean;
  fetchPage: (cursor: InboxCursor | null, signal: AbortSignal) => Promise<InboxPage>;
  markRead: (ids: string[]) => Promise<void>;
};
export type InboxState = {
  items: InboxNotification[]; loading: boolean; loadingMore: boolean;
  hasMore: boolean; error: boolean; moreError: boolean; readError: boolean; marking: string[];
};

function mergeRows(...groups: InboxNotification[][]): InboxNotification[] {
  const rows = new Map<string, InboxNotification>();
  for (const group of groups) for (const row of group) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

export function createNotificationInbox(services: InboxServices) {
  let state: InboxState = { items: [], loading: true, loadingMore: false, hasMore: false, error: false, moreError: false, readError: false, marking: [] };
  const listeners = new Set<() => void>();
  const confirmedRead = new Set<string>();
  let active = false;
  let lifetime = 0;
  let request = 0;
  let controller: AbortController | null = null;
  let cursor: InboxCursor | null = null;
  let incoming = new Map<string, InboxNotification>();
  let writing = false;
  const current = () => active && services.isCurrent();
  const patch = (value: Partial<InboxState>) => { state = { ...state, ...value }; listeners.forEach(fn => fn()); };
  const reconcile = (rows: InboxNotification[]) => rows.map(row => confirmedRead.has(row.id) ? { ...row, is_read: true } : row);

  async function load(append: boolean) {
    if (!current() || (append && (state.loading || state.loadingMore || !state.hasMore))) return;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const operation = ++request;
    const epoch = lifetime;
    incoming = new Map();
    patch(append ? { loadingMore: true, moreError: false } : { loading: true, loadingMore: false, error: false, moreError: false });
    try {
      const page = await services.fetchPage(append ? cursor : null, signal);
      if (!current() || epoch !== lifetime || operation !== request) return;
      const last = page.items.at(-1);
      cursor = last ? { id: last.id, created_at: last.created_at } : null;
      patch({ items: reconcile(mergeRows(append ? state.items : [], page.items, [...incoming.values()])), hasMore: page.hasMore, error: false, moreError: false });
    } catch {
      if (current() && epoch === lifetime && operation === request) patch(append ? { moreError: true } : { error: true });
    } finally {
      if (current() && epoch === lifetime && operation === request) { incoming.clear(); patch({ loading: false, loadingMore: false }); }
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start() { active = true; lifetime++; void load(false); },
    stop() { active = false; lifetime++; request++; controller?.abort(); writing = false; },
    refresh: () => load(false),
    loadMore: () => load(true),
    receive(row: InboxNotification, insert: boolean) {
      if (!current()) return;
      if (state.loading || state.loadingMore) incoming.set(row.id, row);
      if (insert || state.items.some(item => item.id === row.id)) patch({ items: reconcile(mergeRows(state.items, [row])) });
    },
    async markRead(ids: string[]) {
      if (!current() || writing) return false;
      const unread = new Set(state.items.filter(row => !row.is_read).map(row => row.id));
      const selected = [...new Set(ids)].filter(id => unread.has(id));
      if (!selected.length) return true;
      const epoch = lifetime;
      writing = true;
      patch({ marking: selected, readError: false });
      try {
        await services.markRead(selected);
        if (!current() || epoch !== lifetime) return false;
        selected.forEach(id => confirmedRead.add(id));
        patch({ items: reconcile(state.items) });
        return true;
      } catch {
        if (current() && epoch === lifetime) patch({ readError: true });
        return false;
      } finally {
        if (epoch === lifetime) { writing = false; if (current()) patch({ marking: [] }); }
      }
    },
  };
}

/** Opening waits for a confirmed read before the screen's lifetime can end. */
export async function openInboxNotification(row: InboxNotification, options: {
  isCurrent(): boolean;
  markRead(ids: string[]): Promise<boolean>;
  destination: string | null;
  navigate(path: string): void;
}): Promise<void> {
  if (!options.isCurrent()) return;
  if (!row.is_read && !await options.markRead([row.id])) return;
  if (options.isCurrent() && options.destination) options.navigate(options.destination);
}
