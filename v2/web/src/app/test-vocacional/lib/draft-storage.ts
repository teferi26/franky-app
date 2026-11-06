export const BIG_FIVE_DRAFT_KEY = 'franky:bigfive-draft:2026-09';
export const ATTEMPT_KEY = 'franky:vocational-attempt:2026-09';
export const HANDOFF_KEY = 'franky:vocational-login-handoff:2026-09';
export const PENDING_KEY = 'franky:vocational-pending:2026-09';
/** Anonymous drafts can only be transferred after pressing the login/save CTA. */
export function ownedDraftKey(key: string, owner: string | null) {
  return `${key}:${owner ?? 'anonymous'}`;
}
export function removeUnchangedDraft(key: string, snapshot: string | null) {
  if (snapshot !== null && sessionStorage.getItem(key) === snapshot) sessionStorage.removeItem(key);
}
