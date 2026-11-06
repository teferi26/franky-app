export const VENUE_WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export const VENUE_CATEGORIES = [['bar', 'Bar'], ['pub', 'Pub'], ['restaurante', 'Restaurante'], ['cafeteria', 'Cafetería'], ['discoteca', 'Discoteca'], ['parque', 'Parque'], ['cultural', 'Cultura'], ['deportivo', 'Deporte'], ['coworking', 'Coworking']] as const;
export type VenueHours = { weekday: number; opens: string; closes: string; closes_next_day: boolean };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
/** Local civil times, independent of the viewing device's timezone. */
export function validateVenueHours(input: unknown): string | null {
  if (!Array.isArray(input) || input.length > 14) return 'Puedes indicar hasta 14 franjas semanales.';
  const spans: { start: number; end: number }[] = [];
  for (const row of input) {
    if (!row || typeof row !== 'object' || Object.keys(row).some(key => !['weekday', 'opens', 'closes', 'closes_next_day'].includes(key)) || !Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6 || typeof row.opens !== 'string' || !TIME.test(row.opens) || typeof row.closes !== 'string' || !TIME.test(row.closes) || typeof row.closes_next_day !== 'boolean') return 'Comprueba el día y las horas con formato HH:mm.';
    const start = row.weekday * 1440 + minutes(row.opens); const end = row.weekday * 1440 + minutes(row.closes) + (row.closes_next_day ? 1440 : 0);
    if (end <= start || end - start > 1440) return 'Cada franja debe durar entre un minuto y 24 horas. Indica si cierra al día siguiente.';
    for (const previous of spans) for (const shift of [-10080, 0, 10080]) if (start < previous.end + shift && end > previous.start + shift) return 'Hay franjas que se solapan; revisa también los cierres de madrugada.';
    spans.push({ start, end });
  }
  return null;
}
export function venueHoursSummary(hours: readonly VenueHours[]): string[] {
  return VENUE_WEEKDAYS.map((label, weekday) => {
    const rows = hours.filter(row => row.weekday === weekday).sort((a, b) => a.opens.localeCompare(b.opens));
    return `${label}: ${rows.length ? rows.map(row => `${row.opens}–${row.closes}${row.closes_next_day ? ' (día siguiente)' : ''}`).join(', ') : 'Cerrado'}`;
  });
}
