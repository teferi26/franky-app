import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EventShirtSize from '@/app/eventos/components/event-shirt-size';
const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'student' } } }) },
  from: () => { const chain = { select: () => chain, eq: () => chain, maybeSingle: m.read, upsert: () => chain, single: m.save }; return chain; },
}) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const prices = { withoutCents: 1990, withCents: 3490 };
function setup() { m.read.mockResolvedValue({ data: { size: 'M', quoted_price_cents: 3490 }, error: null }); }
it('shows the saved option and server quote with Spanish text', async () => {
  setup(); render(<EventShirtSize eventId="origin" prices={prices} />);
  expect(await screen.findByText(/Tu inscripción · 34,90/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'M' })).toHaveAttribute('aria-pressed', 'true');
});
it('does not display an unconfirmed change after a network failure', async () => {
  setup(); m.save.mockRejectedValue(new Error('offline'));
  render(<EventShirtSize eventId="origin" prices={prices} />);
  await screen.findByText(/Tu inscripción · 34,90/);
  fireEvent.click(screen.getByRole('button', { name: /Sin camiseta/ }));
  await screen.findByRole('alert');
  expect(screen.getByText(/Tu inscripción · 34,90/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: /Sin camiseta/ })).toBeEnabled());
});
it('uses the server-returned quote when switching to no shirt', async () => {
  setup(); m.save.mockResolvedValue({ data: { size: 'ninguna', quoted_price_cents: 1990 }, error: null });
  render(<EventShirtSize eventId="origin" prices={prices} />);
  await screen.findByText(/Tu inscripción · 34,90/);
  fireEvent.click(screen.getByRole('button', { name: /Sin camiseta/ }));
  await screen.findByText(/Tu inscripción · 19,90/);
  expect(screen.getByRole('button', { name: /Sin camiseta/ })).toHaveAttribute('aria-pressed', 'true');
});
