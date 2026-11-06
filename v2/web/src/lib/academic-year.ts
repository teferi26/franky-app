/** A mixed catalogue must use each row's year, never a global current-year label. */
export function cutOffCourse(year: number | null | undefined): string {
  return year && Number.isInteger(year) ? `${year}/${year + 1}` : "Curso no indicado";
}

// Curso vigente y anterior de las notas de corte: fuente única en v2/shared.
export * from "../../../shared/cut-off-year";
