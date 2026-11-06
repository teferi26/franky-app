import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { createNotificationInbox, type InboxNotification } from '@/lib/notification-inbox';
import { createInboxServices } from '@/lib/notification-inbox-query';

export function useNotificationInbox(owner: string) {
  const client = useMemo(() => createClient(), []);
  const isCurrent = useSessionGuard(owner);
  const inbox = useMemo(() => createNotificationInbox(createInboxServices(client, owner, isCurrent)), [client, owner, isCurrent]);
  const state = useSyncExternalStore(inbox.subscribe, inbox.getSnapshot, inbox.getSnapshot);
  useEffect(() => {
    inbox.start();
    const channel = client.channel('inbox-' + owner)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + owner }, payload => {
        if (payload.new.user_id === owner) inbox.receive(payload.new as InboxNotification, true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + owner }, payload => {
        if (payload.new.user_id === owner) inbox.receive(payload.new as InboxNotification, false);
      }).subscribe();
    const focus = () => { if (document.visibilityState === 'visible') void inbox.refresh(); };
    document.addEventListener('visibilitychange', focus);
    return () => { inbox.stop(); document.removeEventListener('visibilitychange', focus); void client.removeChannel(channel); };
  }, [client, inbox, owner]);
  return { ...state, inbox, isCurrent };
}
