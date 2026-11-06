/** Deduplicates foreground/cold-start taps and never handles another account's payload. */
export type PushResponse = { actionIdentifier: string; notification: { request: { identifier: string; content: { data: Record<string, unknown> } } } };
export function createNotificationResponseHandler(services: {
  owner: string; isCurrent: () => boolean;
  destination: (data: Record<string, unknown>) => string | null;
  navigate: (path: string) => void;
  consume: () => Promise<unknown>;
  seen: Set<string>;
}) {
  let active = true;
  return {
    stop() { active = false; },
    handle(response: PushResponse | null) {
      if (!active || !response || !services.isCurrent()) return;
      const { identifier, content } = response.notification.request;
      const key = `${identifier}:${response.actionIdentifier}`;
      if (services.seen.has(key)) return;
      const recipient = content.data?.recipient_user_id;
      services.seen.add(key);
      if (services.seen.size > 200) services.seen.delete(services.seen.values().next().value!);
      void services.consume().catch(() => {});
      if (recipient !== services.owner) return;
      const destination = services.destination(content.data);
      if (destination && active && services.isCurrent()) services.navigate(destination);
    },
  };
}
