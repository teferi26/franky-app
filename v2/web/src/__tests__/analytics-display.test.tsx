import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KpiCard from '../app/admin/analytics/components/KpiCard';
import { readAnalyticsTab } from '../app/admin/analytics/components/AnalyticsTabsNav';

describe('Analytics does not invent unavailable values or percentage changes', () => {
  it.each([undefined, null, Number.NaN, Infinity])('marks missing value %s without calling the currency formatter', value => {
    render(<KpiCard label="Ingresos" value={value} formatter={() => { throw new Error('Missing value must not be formatted'); }} />);
    expect(screen.getByLabelText('Dato no disponible')).toBeInTheDocument(); expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
  it('presents a real measured zero as zero', () => { render(<KpiCard label="Personas" value={0} />); expect(screen.getByText('0')).toBeInTheDocument(); });
  it('shows loading instead of a made-up count', () => { render(<KpiCard label="Personas" value={undefined} loading />); expect(screen.getByText('Cargando')).toBeInTheDocument(); expect(screen.queryByText('0')).not.toBeInTheDocument(); });
  it('does not invent +100% for an increase from zero', () => {
    render(<KpiCard label="Altas" value={8} current={8} previous={0} />);
    expect(screen.queryByText('+100.0%')).not.toBeInTheDocument(); expect(screen.getByText(/variación porcentual no calculable/)).toBeInTheDocument();
  });
  it('calculates a defined percentage against a nonzero baseline', () => { render(<KpiCard label="Altas" value={15} current={15} previous={10} />); expect(screen.getByLabelText('Variación 50.0% vs período anterior')).toBeInTheDocument(); });
  it('falls back to the overview for invalid links', () => { expect(readAnalyticsTab('unsupported')).toBe('overview'); expect(readAnalyticsTab(null)).toBe('overview'); expect(readAnalyticsTab('academic')).toBe('academic'); });
});
