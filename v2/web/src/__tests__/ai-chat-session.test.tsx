import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: { user: { id: string } } | null) => void),
  getUser: vi.fn(), fetch: vi.fn(),
  pathname: '/',
}));
vi.mock('@/lib/supabase-client', () => ({ createClient: () => ({ auth: {
  getUser: f.getUser,
  onAuthStateChange: (listener: typeof f.listener) => { f.listener = listener; return { data: { subscription: { unsubscribe() {} } } }; },
} }) }));
vi.mock('next/navigation', () => ({ usePathname: () => f.pathname }));
vi.mock('next/image', () => ({ default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} /> }));
vi.mock('@/lib/sanitize', () => ({ renderSafeMarkdown: (text: string) => text }));
import FrankyAIChat from '@/components/FrankyAIChat';
import AskFrankyButton from '@/components/AskFrankyButton';
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const openChat = async () => fireEvent.click(await screen.findByRole('button', { name: 'Abrir asistente Franky AI' }));
const send = (text: string) => { fireEvent.change(screen.getByRole('textbox', { name: 'Pregunta a Franky AI' }), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' })); };

beforeEach(() => {
  f.listener = null;
  f.pathname = '/';
  delete document.documentElement.dataset.frankyAssistantOpen;
  f.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'owner-a' } } });
  f.fetch.mockReset().mockImplementation(async () => Response.json({ reply: 'Respuesta del asistente.' }));
  vi.stubGlobal('fetch', f.fetch);
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
});

describe('Franky AI conversation ownership and recovery', () => {
  it('keeps a BecarIA opening request until deferred authentication is ready', async () => {
    const initial = deferred<{ data: { user: { id: string } } }>(); f.getUser.mockReturnValue(initial.promise);
    render(<><AskFrankyButton /><FrankyAIChat /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar a BecarIA' }));
    await act(async () => initial.resolve({ data: { user: { id: 'owner-a' } } }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  it('discards a late response and clears the conversation when the owner changes', async () => {
    const pending = deferred<Response>(); f.fetch.mockReturnValue(pending.promise);
    render(<FrankyAIChat />); await openChat(); send('Pregunta privada A');
    const signal = f.fetch.mock.calls[0][1].signal;
    act(() => f.listener!('SIGNED_IN', { user: { id: 'owner-b' } }));
    expect(signal.aborted).toBe(true);
    await openChat();
    await act(async () => pending.resolve(Response.json({ reply: 'Respuesta privada A' })));
    expect(screen.queryByText('Pregunta privada A')).toBeNull();
    expect(screen.queryByText('Respuesta privada A')).toBeNull();
    f.fetch.mockResolvedValue(Response.json({ reply: 'Respuesta B' }));
    send('Pregunta B'); await screen.findByText('Respuesta B');
    expect(JSON.parse(f.fetch.mock.calls[1][1].body).history).toEqual([]);
  });
  it('does not restore a stale initial account after an auth event', async () => {
    const initial = deferred<{ data: { user: { id: string } } }>(); f.getUser.mockReturnValue(initial.promise);
    render(<FrankyAIChat />);
    act(() => f.listener!('SIGNED_IN', { user: { id: 'owner-b' } })); await openChat(); send('Pregunta de B');
    await screen.findByText('Respuesta del asistente.');
    await act(async () => initial.resolve({ data: { user: { id: 'owner-a' } } }));
    expect(screen.getByText('Pregunta de B')).toBeInTheDocument();
    act(() => f.listener!('SIGNED_OUT', null));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Abrir asistente Franky AI' })).toBeInTheDocument();
  });
  it('preserves the question after failure and does not send the error as conversation history', async () => {
    f.fetch.mockResolvedValueOnce(Response.json({ error: 'Servicio temporalmente no disponible.' }, { status: 503 }));
    render(<FrankyAIChat />); await openChat(); send('Mi pregunta');
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio temporalmente no disponible.');
    expect(screen.getByRole('textbox')).toHaveValue('Mi pregunta');
    expect(screen.queryByText('Mi pregunta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    await screen.findByText('Respuesta del asistente.');
    expect(JSON.parse(f.fetch.mock.calls[1][1].body)).toEqual({ message: 'Mi pregunta', history: [] });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps long conversations usable while sending only recent context', async () => {
    render(<FrankyAIChat />); await openChat();
    for (let i = 0; i < 12; i++) {
      send(`Pregunta ${i}`);
      await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    }
    const last = JSON.parse(f.fetch.mock.calls[11][1].body);
    expect(last.history).toHaveLength(10);
    expect(last.history[0]).toMatchObject({ role: 'user', content: 'Pregunta 6' });
    expect(screen.getByText('Pregunta 0')).toBeInTheDocument();
  });
  it('offers useful anonymous navigation without paid calls', async () => {
    f.getUser.mockResolvedValue({ data: { user: null } });
    render(<FrankyAIChat />); await openChat(); send('Busco piso y compañeros de piso');
    expect(await screen.findByRole('link', { name: 'Buscar alojamiento' })).toHaveAttribute('href', '/alojamiento');
    expect(screen.getByRole('link', { name: 'Buscar compañeros de piso' })).toHaveAttribute('href', '/roomie-match');
    expect(screen.getByRole('link', { name: 'Ver la app de Franky' })).toHaveAttribute('href', '/app');
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('renders provider text harmlessly and only approved action destinations', async () => {
    f.fetch.mockResolvedValue(Response.json({ reply: '<img src=x onerror=alert(1)>', mode: 'basic', actions: [{ label: 'Ir a BecarIA', href: '/becas' }, { label: 'evil', href: 'https://evil.test' }, { label: 'admin', href: '/admin' }] }));
    render(<FrankyAIChat />); await openChat(); send('becas');
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a BecarIA' })).toHaveAttribute('href', '/becas');
    expect(screen.queryByRole('link', { name: 'evil' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'admin' })).toBeNull();
    expect(document.querySelector('img[onerror]')).toBeNull();
  });
  it('sends only a scholarship ID from a detail page and cancels stale responses when changing scholarship', async () => {
    const pending = deferred<Response>(); f.fetch.mockReturnValue(pending.promise);
    const id = '11111111-1111-4111-8111-111111111111';
    f.pathname = `/becas/${id}`;
    const view = render(<FrankyAIChat />); await openChat(); send('¿Qué documentos necesito?');
    expect(JSON.parse(f.fetch.mock.calls[0][1].body)).toMatchObject({ scholarshipId: id });
    const signal = f.fetch.mock.calls[0][1].signal;
    f.pathname = '/becas/22222222-2222-4222-8222-222222222222'; view.rerender(<FrankyAIChat />);
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(Response.json({ reply: 'Respuesta de otra beca' })));
    expect(screen.queryByText('Respuesta de otra beca')).toBeNull();
  });
});
