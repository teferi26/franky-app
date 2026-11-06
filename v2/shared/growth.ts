/** Public contracts; prices, qualification and balances are always server-derived. */
export const GROWTH_RULES = { attributionDays: 30, reviewDays: 7, validReferralPoints: 100, activationPoints: 150, monthlyAutomaticLimit: 20 } as const;
export const GROWTH_REWARD_KEYS = ['profile_palette', 'planning_pack', 'university_report'] as const;
export type GrowthRewardKey = typeof GROWTH_REWARD_KEYS[number];
export type GrowthReward = { key: GrowthRewardKey; title: string; description: string; points: number; available: boolean };
export type GrowthLedgerEntry = { id: string; points: number; reason: string; created_at: string };
export type GrowthRedemption = { id: string; reward_key: GrowthRewardKey; points: number; created_at: string };
export type CreatorApplication = { id: string; mode: 'ugc' | 'affiliate' | 'both'; channels: string; proposal: string; status: 'pending' | 'approved' | 'rejected' | 'paused'; created_at: string };
export type CreatorContent = { id: string; title: string; url: string; rights: string; status: string; created_at: string };
export type GrowthSnapshot = {
  enabled: boolean; cash_enabled: boolean; demo: boolean; code: string | null; balance: number;
  referrals: { pending: number; approved: number; activated: number; rejected: number };
  ledger: GrowthLedgerEntry[]; rewards: GrowthReward[]; redemptions: GrowthRedemption[];
  creator: CreatorApplication | null; content: CreatorContent[];
  tariffs: { stage: 'qualified' | 'activated'; version: number; amount_cents: number; terms: string; starts_at: string }[];
  commissions: { id: string; amount_cents: number; currency: string; status: string; created_at: string }[];
};
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{5,63}$/.test(code) ? code : null;
}
export function referralUrl(origin: string, code: string): string {
  const safe = normalizeReferralCode(code);
  if (!safe) throw new Error('invalid_referral_code');
  return `${origin.replace(/\/$/, '')}/r/${encodeURIComponent(safe)}`;
}
export function growthMessage(error: string): string {
  const messages: Record<string, string> = {
    growth_disabled: 'Las recompensas aún no están activadas. Tus funciones habituales siguen disponibles.',
    insufficient_points: 'Todavía no tienes puntos suficientes.', reward_unavailable: 'Esta recompensa no está disponible.',
    referral_locked: 'La invitación queda fijada al terminar el registro.', invalid_referral: 'Este código no está disponible.',
    self_referral: 'No puedes utilizar tu propio código.', forbidden: 'No tienes permiso para esta operación.',
    creator_not_approved: 'Tu solicitud de creador debe estar aprobada para enviar contenido.',
    request_conflict: 'Esta solicitud ya corresponde a otra recompensa.', cash_disabled: 'Las liquidaciones monetarias no están activadas.',
  };
  return messages[error] ?? 'No se pudo completar la operación. Vuelve a intentarlo.';
}
