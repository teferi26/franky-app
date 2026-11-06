// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { formatAcademicDuration, parseAcademicDuration } from '@/lib/academic-duration';
import { formatAcademicDuration as mobileFormat, parseAcademicDuration as mobileParse } from '../../../mobile/src/lib/academic-duration';

const state = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(), single: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ from: () => ({ update: state.update }) }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }));
import AdminEditCareerButton from '@/app/carreras/[id]/admin-edit-button';

const career = { id: 'one', name: 'Doble grado', description: null, cut_off_score: 11.739, duration_years: 4, credits: 240, employment_rate: null, avg_salary: null, career_prospects: null, places_offered: null, modality: 'presencial', campus: 'Leganés' };
beforeEach(() => {
  vi.clearAllMocks();
  state.single.mockResolvedValue({ data: { id: 'one' }, error: null });
  state.eq.mockReturnValue({ select: () => ({ single: state.single }) });
  state.update.mockReturnValue({ eq: state.eq });
});
afterEach(cleanup);

describe('fractional academic years on web and mobile', () => {
  it.each([[5.5, '5,5 años'], ['5,5', '5,5 años'], [4, '4 años'], [1, '1 año'], [2.3, '2,3 años'], [null, '—']])('formats %j without losing precision', (value, expected) => {
    expect(formatAcademicDuration(value)).toBe(expected);
    expect(mobileFormat(value)).toBe(expected);
    expect(mobileParse(value)).toBe(parseAcademicDuration(value));
  });
  it.each([0, -1, 100, 5.55, NaN, Infinity, '5x', '5e0', '5.50', '', {}, true])('rejects invalid duration %j instead of truncating it', value => {
    expect(parseAcademicDuration(value)).toBeNull();
    expect(mobileParse(value)).toBeNull();
  });
  it('saves 5.5 in the real editor while preserving the admission score', async () => {
    render(<AdminEditCareerButton career={career} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar carrera/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duración (años)' }), { target: { value: '5.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ duration_years: 5.5, cut_off_score: 11.739 }));
    expect(state.eq).toHaveBeenCalledWith('id', 'one');
  });
  it('rejects unsupported precision before writing', () => {
    render(<AdminEditCareerButton career={career} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar carrera/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duración (años)' }), { target: { value: '5.55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('alert').textContent).toContain('duración válida');
    expect(state.update).not.toHaveBeenCalled();
  });
  it.each(['denied', 'network'])('keeps the draft and allows retry after %s', async kind => {
    if (kind === 'network') state.single.mockRejectedValueOnce(new Error('offline'));
    else state.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    render(<AdminEditCareerButton career={career} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar carrera/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duración (años)' }), { target: { value: '5.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByRole('alert');
    expect(state.refresh).not.toHaveBeenCalled();
    expect((screen.getByRole('spinbutton', { name: 'Duración (años)' }) as HTMLInputElement).value).toBe('5.5');
    expect((screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
  });
});
