/** Keep aligned with web: historical results must not claim a newer calculation. */
export const VOCATIONAL_MATCHING_VERSION = '2026-09-06-evidence-5';
export function isCurrentVocationalResult(snapshot: Record<string, unknown> | null | undefined): boolean {
  return snapshot?.matching_version === VOCATIONAL_MATCHING_VERSION;
}
