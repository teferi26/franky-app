/** Retain a mutation key only while retrying the exact same submitted payload. */
export type WorkspaceAttempt = { fingerprint: string; key: string };
export function workspaceAttempt(previous: WorkspaceAttempt | null, payload: unknown, newKey: () => string): WorkspaceAttempt {
  const fingerprint = JSON.stringify(payload);
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: newKey() };
}
