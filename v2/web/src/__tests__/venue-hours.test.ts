import { describe, expect, it } from 'vitest';
import { validateVenueHours, venueHoursSummary, type VenueHours } from '../../../shared/venue-hours';
const day = (weekday: number, opens: string, closes: string, closes_next_day = false): VenueHours => ({ weekday, opens, closes, closes_next_day });
describe('venue weekly hours', () => {
  it('accepts split days, contiguous shifts and a full-day interval', () => { expect(validateVenueHours([day(0, '09:00', '13:00'), day(0, '13:00', '18:00'), day(2, '10:00', '10:00', true)])).toBeNull(); });
  it('rejects overlaps after a Sunday closing into Monday', () => { expect(validateVenueHours([day(6, '23:00', '02:00', true), day(0, '01:30', '03:00')])).toMatch(/solapan/); });
  it.each([[day(0, '24:00', '02:00', true)], [day(7, '09:00', '18:00')], [day(0, '18:00', '09:00')], [day(0, '09:00', '18:00', true)], Array(15).fill(day(0, '09:00', '18:00'))])('rejects malformed or excessive shifts %#', rows => { expect(validateVenueHours(rows)).not.toBeNull(); });
  it('formats closed days and an explicit overnight close without device timezone conversion', () => { const rows = venueHoursSummary([day(4, '23:00', '03:00', true)]); expect(rows[0]).toBe('Lunes: Cerrado'); expect(rows[4]).toBe('Viernes: 23:00–03:00 (día siguiente)'); });
});
