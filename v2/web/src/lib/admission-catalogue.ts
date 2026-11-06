/** Public fields used by the admission explorer. Full academic records stay on the detail page. */
export type AdmissionCareer = {
  id: string;
  slug: string | null;
  name: string;
  branch: string;
  cut_off_score: number | null;
  cut_off_year: number | null;
  /** Nota del curso anterior (columnas *_prev). Solo se enseña con el conmutador. */
  cut_off_score_prev?: number | null;
  cut_off_year_prev?: number | null;
  admission_without_cutoff?: boolean;
  campus: string | null;
  modality?: string | null;
  duration_years: number | null;
  universities: {
    name: string;
    short_name: string | null;
    city: string | null;
    comunidad_autonoma: string | null;
    slug: string | null;
  } | null;
};

// University data and property names were repeated thousands of times in the
// HTML/RSC response. A dictionary keeps the complete, instantly filterable
// catalogue while staying below the data-cache limit, without a second request.
type AdmissionRow = [id: string, slug: string | null, name: string, branch: number,
  score: number | null, year: number | null, withoutCutoff: boolean,
  campus: string | null, duration: number | null, university: number | null, modality?: string | null,
  // Añadidos al final para no mover los índices anteriores.
  scorePrev?: number | null, yearPrev?: number | null];

export type AdmissionCatalogue = {
  branches: string[];
  universities: NonNullable<AdmissionCareer['universities']>[];
  rows: AdmissionRow[];
};

export function packAdmissionCatalogue(careers: AdmissionCareer[]): AdmissionCatalogue {
  const branches: string[] = [];
  const universities: AdmissionCatalogue['universities'] = [];
  const universityIndexes = new Map<string, number>();
  const rows: AdmissionRow[] = careers.map(career => {
    let branch = branches.indexOf(career.branch);
    if (branch < 0) branch = branches.push(career.branch) - 1;
    let university: number | null = null;
    if (career.universities) {
      const key = JSON.stringify(career.universities);
      const existing = universityIndexes.get(key);
      university = existing ?? universities.push(career.universities) - 1;
      if (existing === undefined) universityIndexes.set(key, university);
    }
    return [career.id, career.slug, career.name, branch, career.cut_off_score,
      career.cut_off_year, career.admission_without_cutoff === true, career.campus,
      career.duration_years, university, career.modality ?? null,
      career.cut_off_score_prev ?? null, career.cut_off_year_prev ?? null];
  });
  return { branches, universities, rows };
}

export function unpackAdmissionCatalogue(catalogue: AdmissionCatalogue): AdmissionCareer[] {
  return catalogue.rows.map(([id, slug, name, branch, cut_off_score, cut_off_year,
    admission_without_cutoff, campus, duration_years, university, modality = null,
    cut_off_score_prev = null, cut_off_year_prev = null]) => ({
    id, slug, name, branch: catalogue.branches[branch], cut_off_score, cut_off_year,
    cut_off_score_prev, cut_off_year_prev,
    admission_without_cutoff, campus, duration_years, modality,
    universities: university === null ? null : catalogue.universities[university],
  }));
}
