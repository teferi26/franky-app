export type VocationalBigFiveTrait = 'O' | 'C' | 'E' | 'A' | 'N';
export type VocationalBigFive = Partial<Record<VocationalBigFiveTrait, number>>;
const names: Record<VocationalBigFiveTrait, string> = {
  O: 'openness', C: 'conscientiousness', E: 'extraversion', A: 'agreeableness', N: 'neuroticism',
};

/** Read both persisted shapes. Missing traits stay missing; N is not inverted. */
export function normalizeVocationalBigFive(value: unknown): VocationalBigFive {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: VocationalBigFive = {};
  for (const [trait, legacyName] of Object.entries(names)) {
    const score = source[trait] ?? source[legacyName];
    if (typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100) {
      result[trait as VocationalBigFiveTrait] = score;
    }
  }
  return result;
}
