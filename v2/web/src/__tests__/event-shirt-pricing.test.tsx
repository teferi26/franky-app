import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEventPrice, shirtPrices, shirtChoiceCents, shirtChoiceReady } from '@/lib/event-shirt-pricing';
import EventActions from '@/app/eventos/[id]/event-actions';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upsert: vi.fn(), refresh: vi.fn(), getUser: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: () => ({ upsert: mocks.upsert }) }) }));
vi.mock('@/app/eventos/components/event-shirt-size', () => ({ default: () => <div>Opción guardada</div> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const prices = { withoutCents: 1990, withCents: 3490 };
const props = { eventId: 'origin', isLoggedIn: true, isRegistered: false, isPast: false, isFull: false, shirtsEnabled: true, prices };
function ready() { mocks.getUser.mockResolvedValue({ data: { user: { id: 'student' } } }); mocks.rpc.mockResolvedValue({ data: { registered: true }, error: null }); }

describe('event shirt pricing', () => {
  it('keeps native and web calculations identical', () => {
    expect(readFileSync(resolve('src/lib/event-shirt-pricing.ts'), 'utf8')).toBe(readFileSync(resolve('../mobile/src/lib/event-shirt-pricing.ts'), 'utf8'));
  });
  it('parses exact euro amounts and rejects invalid or unsupported values', () => {
    expect(parseEventPrice('19,90')).toBe(19.9);
    expect(parseEventPrice('34.90')).toBe(34.9);
    for (const value of ['', '-1', '0', 'NaN', '1e3', '19.999', '10000.01']) expect(parseEventPrice(value)).toBeNull();
    expect(shirtPrices({ payment_mode: 'info', price_without_shirt: '19.90', price_with_shirt: '34.90' })).toEqual(prices);
    expect(shirtPrices({ payment_mode: 'app', price_without_shirt: 19.9, price_with_shirt: 34.9 })).toBeNull();
    expect(shirtPrices({ payment_mode: 'info', price_without_shirt: 35, price_with_shirt: 20 })).toBeNull();
    expect(shirtPrices({ payment_mode: 'info', price_without_shirt: 19.9 })).toBeNull();
    expect(shirtChoiceReady(null)).toBe(false);
    expect(shirtChoiceReady('with_shirt')).toBe(false);
    expect(shirtChoiceCents(prices, 'M')).toBe(3490);
    expect(shirtChoiceCents(prices, 'ninguna')).toBe(1990);
  });
  it('requires an explicit choice; a shirt additionally requires a size', () => {
    render(<EventActions {...props} />);
    const register = screen.getByRole('button', { name: 'Inscribirme' });
    expect(register).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Con camiseta/ }));
    expect(register).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'M' }));
    expect(register).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Sin camiseta/ }));
    expect(register).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'M' })).toBeNull();
  });
  it.each([['ninguna', false], ['L', true]] as const)('registers %s atomically without client-supplied amounts', async (size, shirt) => {
    ready(); render(<EventActions {...props} />);
    fireEvent.click(screen.getByRole('button', { name: shirt ? /Con camiseta/ : /Sin camiseta/ }));
    if (shirt) fireEvent.click(screen.getByRole('button', { name: 'L' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }));
    await screen.findByText('Estás inscrito');
    expect(mocks.rpc).toHaveBeenCalledWith('register_event_shirt_option', { p_event_id: 'origin', p_size: size });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not report successful registration on capacity errors and permits retry', async () => {
    ready(); mocks.rpc.mockResolvedValue({ error: { message: 'Aforo completo' } });
    render(<EventActions {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Sin camiseta/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Aforo completo');
    expect(screen.queryByText('Estás inscrito')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Inscribirme' })).toBeEnabled());
  });
  it('keeps a confirmed registration if the optional chat is unavailable', async () => {
    ready(); mocks.rpc.mockResolvedValueOnce({ error: null }).mockRejectedValueOnce(new Error('offline'));
    render(<EventActions {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Sin camiseta/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }));
    await screen.findByText('Estás inscrito');
  });
  it('keeps the existing registration path for events without variants', async () => {
    ready(); mocks.upsert.mockResolvedValue({ error: null });
    render(<EventActions {...props} prices={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }));
    await screen.findByText('Estás inscrito');
    expect(mocks.upsert).toHaveBeenCalledWith({ event_id: 'origin', user_id: 'student', status: 'registered' }, { onConflict: 'event_id,user_id' });
  });
});
