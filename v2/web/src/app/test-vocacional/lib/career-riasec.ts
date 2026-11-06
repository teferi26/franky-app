import { RIASEC_KEYS, type RiasecScores } from '../types';

/** The database's all-zero default means "not profiled", not zero affinity. */
export function resolveCareerRiasec(fallback: RiasecScores, stored: unknown): RiasecScores {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { ...fallback };
  const record = stored as Record<string, unknown>;
  const values = RIASEC_KEYS.map(key => record[key]);
  // Require a complete, bounded vector. Mixing a partial vector with the
  // fallback can mix incompatible scales and change its meaning.
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)
      || !values.some(value => (value as number) > 0)) return { ...fallback };
  return Object.fromEntries(RIASEC_KEYS.map(key => [key, record[key]])) as RiasecScores;
}
