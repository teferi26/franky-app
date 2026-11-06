import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';
import { motionMock } from './helpers/mobile-motion-mock';

const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() {
  let uid: string | null = 'admin-a'; const listeners = new Set<(event: string, session: any) => void>();
  const auth = { onAuthStateChange(fn: (event: string, session: any) => void) { listeners.add(fn); fn('INITIAL_SESSION', { user: { id: uid } }); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; } };
  const user = { id: 'target', full_name: 'Usuario de prueba', email: 'fixture@example.invalid', role: 'user', is_discarded: false };
  const api = {
    MfaRequiredError: class MfaRequiredError extends Error {},
    listUsuarios: vi.fn(async (): Promise<any[]> => [user]), alternarDescartado: vi.fn(async () => {}), cambiarRol: vi.fn(async () => {}), ponerStrike: vi.fn(async () => {}),
    listReportes: vi.fn(async (): Promise<any[]> => [{ id: 'report', reported_user_id: 'target', status: 'pending', context: 'profile', reason: 'spam' }]), resolverReporte: vi.fn(async () => {}), strikeDesdeReporte: vi.fn(async (..._args: any[]) => {}),
    listAuditoria: vi.fn(async () => []), listSugerenciasOcio: vi.fn(async (): Promise<any[]> => []), aprobarSugerenciaOcio: vi.fn(async () => {}), rechazarSugerenciaOcio: vi.fn(async () => {}),
    listPapelera: vi.fn(async (): Promise<any[]> => []), restaurarDePapelera: vi.fn(async () => {}), getResumenGestion: vi.fn(async () => ({ usuarios: 3 })),
  };
  const Box = ({ children }: any) => <div>{children}</div>, Btn = ({ label, onPress, disabled, busy }: any) => <button onClick={onPress} disabled={disabled || busy}>{label}</button>;
  const alert = vi.fn();
  const mocks: Record<string, any> = { react: { ...React, default: React }, 'react/jsx-runtime': jsx,
    'react-native': { View: Box, Text: Box, ActivityIndicator: () => <div role="status">Cargando</div>, TextInput: ({ value, onChangeText, placeholder }: any) => <input placeholder={placeholder} value={value} onChange={e => onChangeText(e.target.value)} />, Alert: { alert } },
    'lucide-react-native': new Proxy({}, { get: () => () => null }), '@/theme': { C: {}, S: {}, F: {}, R: {}, FONT: {} }, '@/lib/admin': api,
    '@/components/ui': { Btn, Chip: ({ label, onPress }: any) => <button onClick={onPress}>{label}</button>, Pill: ({ label }: any) => <span>{label}</span>, SearchBar: ({ value, onChange, placeholder }: any) => <input aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} /> },
    '@/components/motion': motionMock, '@/components/admin-ui': { Kpi: ({ label, value }: any) => <div>{label}: {value}</div>, Titulo: Box, Aviso: ({ texto }: any) => <div role="alert">{texto}</div>, n: (v: any) => v ?? '—', fecha: () => 'Fecha de prueba', fechaHora: () => 'Fecha de prueba', SIN_DATO: '—' },
  };
  const load = nativeLoader(mocks); mocks['./session'] = load('../mobile/src/lib/session-cache.ts').createSessionCache(auth);
  return { api, alert, Page: load('../mobile/src/components/AdminGestion.tsx').AdminGestion,
    switchTo(id: string | null) { uid = id; for (const listener of listeners) listener(id ? 'SIGNED_IN' : 'SIGNED_OUT', id ? { user: { id } } : null); } };
}

describe('Native management UI keeps confirmations and lists scoped to their owner', () => {
  it('asks the parent for MFA when privileged access expires during management', async () => {
    const f = fixture(), requestMfa = vi.fn(); f.api.listAuditoria.mockRejectedValueOnce(new f.api.MfaRequiredError()); render(<f.Page seccion="auditoria" esAdmin onMfaRequired={requestMfa} />);
    await waitFor(() => expect(requestMfa).toHaveBeenCalledTimes(1));
  });
  it('does not execute an open delete confirmation after switching accounts', async () => {
    const f = fixture(); render(<f.Page seccion="usuarios" esAdmin />); fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const confirm = f.alert.mock.calls[0][2].find((option: any) => option.style === 'destructive');
    act(() => f.switchTo('admin-b')); await act(async () => confirm.onPress()); expect(f.api.alternarDescartado).not.toHaveBeenCalled();
  });
  it('does not execute an old role confirmation after batched logout/login of the same UID', async () => {
    const f = fixture(); render(<f.Page seccion="usuarios" esAdmin />); fireEvent.click(await screen.findByRole('button', { name: 'Hacer analista' }));
    const confirm = f.alert.mock.calls[0][2][1]; act(() => { f.switchTo(null); f.switchTo('admin-a'); });
    await act(async () => confirm.onPress()); expect(f.api.cambiarRol).not.toHaveBeenCalled();
  });
  it('keeps the latest report filter when an older request resolves last', async () => {
    const f = fixture(), pending = deferred<any[]>(); f.api.listReportes.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([{ id: 'new', description: 'Revisado actual', status: 'reviewed', reason: 'spam' }]);
    render(<f.Page seccion="reportes" esAdmin />); await waitFor(() => expect(f.api.listReportes).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Revisados' })); await screen.findByText('Revisado actual');
    await act(async () => pending.resolve([{ id: 'old', description: 'Respuesta antigua', status: 'pending', reason: 'spam' }]));
    expect(screen.queryByText('Respuesta antigua')).toBeNull(); expect(screen.getByText('Revisado actual')).toBeInTheDocument();
  });
  it('blocks duplicate moderation taps until the first action settles', async () => {
    const f = fixture(), pending = deferred<void>(); f.api.strikeDesdeReporte.mockReturnValueOnce(pending.promise); render(<f.Page seccion="reportes" esAdmin />);
    const button = await screen.findByRole('button', { name: 'Strike' }); act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(f.api.strikeDesdeReporte).toHaveBeenCalledTimes(1); expect(f.api.strikeDesdeReporte.mock.calls[0][1]).toEqual({ userId: 'admin-a', generation: 1 });
    expect(f.api.strikeDesdeReporte.mock.calls[0][0]).toBe('report');
    await act(async () => pending.resolve());
  });
  it('provides a real retry after a list fails', async () => {
    const f = fixture(); f.api.listAuditoria.mockRejectedValueOnce(new Error('No hay conexión')); render(<f.Page seccion="auditoria" esAdmin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' })); await screen.findByText('No hay nada registrado todavía.'); expect(f.api.listAuditoria).toHaveBeenCalledTimes(2);
  });
  it('does not offer restoration for an account erased by its owner', async () => {
    const f = fixture(); f.api.listPapelera.mockResolvedValue([{ tipo: 'usuario', id: 'gone', etiqueta: 'Cuenta eliminada', bruto: { self_deleted: true } }]); render(<f.Page seccion="papelera" esAdmin />);
    await screen.findByText('Eliminada por su titular'); expect(screen.queryByRole('button', { name: 'Restaurar' })).toBeNull();
  });
  it('does not show A’s delayed list after a different admin signs in', async () => {
    const f = fixture(), pending = deferred<any[]>(); f.api.listSugerenciasOcio.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([{ id: 'b', name: 'Sugerencia B', status: 'pending' }]); render(<f.Page seccion="sugerencias" esAdmin />);
    await waitFor(() => expect(f.api.listSugerenciasOcio).toHaveBeenCalled()); act(() => f.switchTo('admin-b')); await screen.findByText('Sugerencia B');
    await act(async () => pending.resolve([{ id: 'a', name: 'Privada A', status: 'pending' }])); expect(screen.queryByText('Privada A')).toBeNull();
  });
});

