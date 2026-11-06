import * as Notifications from 'expo-notifications';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from './session';

let tail = Promise.resolve();
let suspended: SessionIdentity | null = null;
function queue<T>(work: () => Promise<T>): Promise<T> {
  const task = tail.then(work); tail = task.then(() => {}, () => {}); return task;
}
export function resumeLocalNotifications(owner: SessionIdentity) {
  if (suspended?.userId === owner.userId && suspended.generation === owner.generation) suspended = null;
}
export function scheduleOwnedNotification(owner: SessionIdentity, request: Notifications.NotificationRequestInput): Promise<string | null> {
  const current = () => isCurrentSessionIdentity(owner) && !(suspended?.userId === owner.userId && suspended.generation === owner.generation);
  return queue(async () => {
    if (!current()) return null;
    const id = await Notifications.scheduleNotificationAsync({ ...request, content: { ...request.content,
      title: 'Tu agenda en Franky', body: 'Abre Franky para consultar tus recordatorios.',
      data: { ...request.content.data, recipient_user_id: owner.userId },
    } });
    if (!current()) { await Notifications.cancelScheduledNotificationAsync(id); return null; }
    return id;
  });
}
export function clearOwnedNotifications(owner: SessionIdentity): Promise<void> {
  suspended = owner;
  return queue(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      const recipient = item.content.data?.recipient_user_id;
      if (!recipient || recipient === owner.userId) await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
    const delivered = await Notifications.getPresentedNotificationsAsync();
    for (const item of delivered) {
      const recipient = item.request.content.data?.recipient_user_id;
      if (!recipient || recipient === owner.userId) await Notifications.dismissNotificationAsync(item.request.identifier);
    }
  });
}

export { captureSessionIdentity };
