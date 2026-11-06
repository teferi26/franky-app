import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { useSessionGuard } from './useSessionGuard';
import { createNotificationInbox, type InboxNotification } from './notification-inbox';
import { createInboxServices } from './notification-inbox-query';

export function useNotificationInbox(owner: string) {
  const isCurrent = useSessionGuard(owner);
  const inbox = useMemo(() => createNotificationInbox(createInboxServices(supabase, owner, isCurrent)), [owner, isCurrent]);
  const state = useSyncExternalStore(inbox.subscribe, inbox.getSnapshot, inbox.getSnapshot);
  useEffect(() => {
    inbox.start();
    const channel = supabase.channel('inbox-' + owner)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + owner }, payload => {
        if (payload.new.user_id === owner) inbox.receive(payload.new as InboxNotification, true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + owner }, payload => {
        if (payload.new.user_id === owner) inbox.receive(payload.new as InboxNotification, false);
      }).subscribe();
    const appState = AppState.addEventListener('change', value => { if (value === 'active') void inbox.refresh(); });
    return () => { inbox.stop(); appState.remove(); void supabase.removeChannel(channel); };
  }, [inbox, owner]);
  // El número del icono sigue a la bandeja: al leer, baja; al llegar, sube.
  const unread = state.items.filter(row => !row.is_read).length;
  useEffect(() => { void Notifications.setBadgeCountAsync(unread).catch(() => {}); }, [unread]);
  return { ...state, inbox, isCurrent };
}
