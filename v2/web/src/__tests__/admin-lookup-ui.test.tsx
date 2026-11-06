import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserLookupTool from '../app/admin/components/UserLookupTool';

vi.mock('../app/admin/components/AdminSessionScope', () => ({ useAdminRequest: () => ({ isCurrent: () => true,
  run: async (work: any, options: any) => work({ authorization: 'Bearer owner-token', signal: options.signal, check: () => { if (options.signal.aborted) throw new Error('cancelled'); } }) }) }));
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const account = { email: 'ana@example.es', status: 'missing_profile', authUser: { id: '11111111-1111-4111-8111-111111111111' }, profile: null };
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => { fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); });
afterEach(() => vi.unstubAllGlobals());
function open() { render(<UserLookupTool />); fireEvent.click(screen.getByText(/Buscar \/ Reconciliar/)); fireEvent.change(screen.getByLabelText('Email del usuario'), { target: { value: 'ana@example.es' } }); }

describe('Lookup operations belong to the displayed account', () => {
  it('invalidates the result when the email changes and ignores its late response', async () => {
    let resolve!: (r: Response) => void; fetcher.mockReturnValue(new Promise(r => { resolve = r; }));
    open(); fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    const signal = fetcher.mock.calls[0][1].signal;
    fireEvent.change(screen.getByLabelText('Email del usuario'), { target: { value: 'bea@example.es' } });
    await act(async () => resolve(new Response(JSON.stringify(account))));
    expect(signal.aborted).toBe(true); expect(screen.queryByText(/Crear perfil para este usuario/)).toBeNull();
  });
  it('sends the displayed ID and pinned credential, and handles an incomplete audit without offering to create twice', async () => {
    fetcher.mockImplementationOnce(() => reply(account)).mockImplementationOnce(() => reply({ ok: true, audit_pending: true, profile: { id: account.authUser.id }, message: 'Perfil creado; auditoría pendiente.' }, 202));
    open(); fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await screen.findByRole('button', { name: /Crear perfil para este usuario/ }));
    await screen.findByText('Perfil creado; auditoría pendiente.');
    const [url, options] = fetcher.mock.calls[1];
    expect(url).toContain('ana%40example.es'); expect(options.headers.Authorization).toBe('Bearer owner-token');
    expect(JSON.parse(options.body)).toEqual({ userId: account.authUser.id });
    expect(screen.queryByRole('button', { name: /Crear perfil para este usuario/ })).toBeNull();
  });
  it('turns a network failure into a retryable message and clears the loading state', async () => {
    fetcher.mockRejectedValue(new Error('Sin conexión'));
    open(); fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Sin conexión'); expect(screen.getByRole('button', { name: 'Buscar' })).toBeEnabled();
  });
  it('aborts a pending request on closing the diagnostic', async () => {
    fetcher.mockReturnValue(new Promise(() => {})); open(); fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('Cerrar búsqueda')); expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
