import { supabase } from './supabase';
import { isCurrentSessionIdentity, onSessionIdentityChange, type SessionIdentity } from './session';

export function assertSessionOwner(owner: SessionIdentity | null): SessionIdentity {
  if (!owner) throw new Error('session_required');
  if (!isCurrentSessionIdentity(owner)) throw new Error('session_changed');
  return owner;
}

/** Capture at the caller, before any await or confirmation dialog. */
export async function ownerAuthorization(owner: SessionIdentity | null): Promise<string> {
  const expected = assertSessionOwner(owner);
  const { data: { session }, error } = await supabase.auth.getSession();
  assertSessionOwner(expected);
  if (error || session?.user.id !== expected.userId || !session.access_token) throw new Error('session_required');
  // Pin this header on the PostgREST builder. The shared client can resolve a
  // different session asynchronously before fetch; it must not change actor.
  return `Bearer ${session.access_token}`;
}

export type OwnedRequest = {
  owner: SessionIdentity;
  authorization: string;
  signal: AbortSignal;
  check(): void;
  query<T extends { setHeader(name: string, value: string): unknown; abortSignal(signal: AbortSignal): unknown }>(builder: T): T;
};

/** Cancels stale work, including time spent waiting inside the shared SDK. */
export async function withOwnedRequest<T>(owner: SessionIdentity | null, work: (request: OwnedRequest) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const expected = assertSessionOwner(owner);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel);
  const unsubscribe = onSessionIdentityChange(() => {
    if (!isCurrentSessionIdentity(expected)) controller.abort();
  });
  try {
    const check = () => {
      assertSessionOwner(expected);
      if (controller.signal.aborted) throw new Error('request_cancelled');
    };
    check();
    const authorization = await ownerAuthorization(expected);
    check();
    const result = await work({
      owner: expected, authorization, signal: controller.signal, check,
      query(builder) {
        check();
        builder.setHeader('Authorization', authorization);
        builder.abortSignal(controller.signal);
        return builder;
      },
    });
    check();
    return result;
  } finally {
    unsubscribe();
    signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}
