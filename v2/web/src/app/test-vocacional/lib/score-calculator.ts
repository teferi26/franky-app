/* ═══════════════════════════════════════════════════════════
   Score Calculator — applies dimension impacts to the
   student profile from each answered question.
   ═══════════════════════════════════════════════════════════ */

import type { StudentProfile, DimensionImpact } from "../types";

/**
 * Apply an array of dimension impacts to a student profile (mutates in place).
 * Dimension strings are dotted paths like "riasec.I", "aversiones.sangre", "tags.medicina".
 */
export function applyImpacts(profile: StudentProfile, impacts: DimensionImpact[]): void {
  for (const { dimension, delta } of impacts) {
    const parts = dimension.split(".");
    if (parts.length !== 2) continue;

    const [group, key] = parts;

    if (group === "tags") {
      profile.tags[key] = (profile.tags[key] || 0) + delta;
      continue;
    }

    const section = profile[group as keyof StudentProfile];
    if (typeof section === "object" && section !== null && !Array.isArray(section)) {
      const obj = section as Record<string, number | string>;
      const current = obj[key];
      if (typeof current === "number") {
        obj[key] = current + delta;
      } else if (current === undefined) {
        // New dynamic key — allow it for tags-like sub-scores
        obj[key] = delta;
      }
    }
  }
}

/**
 * Reverse impacts (for undo/change answer).
 */
export function reverseImpacts(profile: StudentProfile, impacts: DimensionImpact[]): void {
  applyImpacts(
    profile,
    impacts.map((i) => ({ dimension: i.dimension, delta: -i.delta }))
  );
}

/**
 * Cosine similarity between two numeric vectors (as Records).
 */
export function cosineSimilarity(
  a: Record<string, number>,
  b: Record<string, number>
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keys) {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Normalized dot-product similarity for typed scored objects.
 * Returns 0-1 where 1 = perfect alignment.
 */
export function normalizedSimilarity(
  a: Record<string, number>,
  b: Record<string, number>
): number {
  const keys = Object.keys(b);
  if (keys.length === 0) return 0.5;

  let sum = 0;
  let maxPossible = 0;
  for (const k of keys) {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    // Both on similar scale (0-10ish), higher alignment = better
    sum += Math.max(0, 1 - Math.abs(va - vb) / 10);
    maxPossible += 1;
  }
  return maxPossible > 0 ? sum / maxPossible : 0.5;
}

/**
 * Calculate the entropy (uncertainty) of each top-level dimension group.
 * Higher entropy = more questions needed for that dimension.
 * Uses variance of sub-scores within a dimension — low variance = uncertain.
 */
export function calculateDimensionEntropy(profile: StudentProfile): Record<string, number> {
  const entropy: Record<string, number> = {};

  const groups: [string, Record<string, number>][] = [
    ["riasec", profile.riasec],
    ["aptitudes", profile.aptitudes],
    ["valores", profile.valores],
    ["aversiones", profile.aversiones],
    ["ambicion", profile.ambicion],
    ["estilo_vida", profile.estilo_vida as unknown as Record<string, number>],
  ];

  for (const [name, scores] of groups) {
    const vals = Object.values(scores).filter((v): v is number => typeof v === "number");
    if (vals.length === 0) {
      entropy[name] = 10; // max uncertainty
      continue;
    }
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const totalMag = vals.reduce((s, v) => s + Math.abs(v), 0);

    // Low total magnitude = haven't answered relevant questions yet = high entropy
    // Low variance = all sub-scores similar = can't distinguish = high entropy
    const magFactor = Math.max(0, 10 - totalMag * 0.5);
    const varFactor = Math.max(0, 5 - Math.sqrt(variance));
    entropy[name] = magFactor + varFactor;
  }

  return entropy;
}
