import { cutOffForYear } from './academic-year';

export type AdmissionOffer = {
  university_id: string;
  cut_off_score: number | string | null;
  cut_off_year: number | null;
  cut_off_score_prev?: number | string | null;
  cut_off_year_prev?: number | null;
  admission_without_cutoff?: boolean | null;
};
export type UniversityAdmissionSummary = { count: number; min: number | null; max: number | null; year: number | null; scored: number };

// Count catalogue offers, including campus variants. Ranges never mix courses,
// missing years or entries explicitly marked as admission without a cutoff.
// Without `course` each university uses its latest course with scores; with
// `course` only that course counts (current or previous column alike).
export function summarizeUniversityAdmission(offers: AdmissionOffer[], course?: number): Map<string, UniversityAdmissionSummary> {
  const result = new Map<string, UniversityAdmissionSummary>();
  for (const offer of offers) {
    if (!offer.university_id) continue;
    const summary = result.get(offer.university_id) ?? { count: 0, min: null, max: null, year: null, scored: 0 };
    summary.count++;
    let score: number;
    let year: number | null;
    if (course === undefined) {
      score = offer.cut_off_score === null ? NaN : Number(offer.cut_off_score);
      year = offer.cut_off_year;
    } else {
      const resolved = cutOffForYear(offer, course);
      score = resolved ? resolved.score : NaN;
      year = resolved ? course : null;
    }
    if (!offer.admission_without_cutoff && Number.isFinite(score) && score >= 5 && score <= 14 && year != null && Number.isInteger(year) && year >= 2000 && year <= 2200) {
      if (summary.year === null || year > summary.year) {
        summary.year = year; summary.min = score; summary.max = score; summary.scored = 1;
      } else if (year === summary.year) {
        summary.min = Math.min(summary.min!, score); summary.max = Math.max(summary.max!, score); summary.scored++;
      }
    }
    result.set(offer.university_id, summary);
  }
  return result;
}
