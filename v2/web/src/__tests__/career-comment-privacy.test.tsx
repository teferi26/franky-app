import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CareerComments from '@/app/carreras/[id]/career-comments';
import { publishCareerComment } from '@/lib/career-comment';
import { publishCareerComment as publishNative } from '../../../mobile/src/lib/career-comment';

const m = vi.hoisted(() => ({ uid: 'account-a', insert: vi.fn(), range: vi.fn(), existing: vi.fn(), user: vi.fn(), listeners: new Set<Function>() }));
vi.mock('@/components/SessionProvider', () => ({ useSession: () => ({ user: { id: m.uid }, loading: false }) }));
vi.mock('@/components/VerifiedBadge', () => ({ default: () => null }));
vi.mock('@/lib/supabase-client', () => {
  const query = { select: () => query, eq: () => query, order: () => query, range: m.range, insert: m.insert, maybeSingle: m.existing };
  const client = { from: () => query, auth: { getUser: m.user, onAuthStateChange: (fn: Function) => {
    m.listeners.add(fn); return { data: { subscription: { unsubscribe: () => m.listeners.delete(fn) } } };
  } } };
  return { createClient: () => client };
});
const draft = { id: 'comment', career_id: 'career', user_id: 'account-a', content: 'My experience', parent_id: null, is_anonymous: true };
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { vi.clearAllMocks(); m.uid = 'account-a'; m.listeners.clear(); m.range.mockResolvedValue({ data: [], error: null }); m.user.mockImplementation(async () => ({ data: { user: { id: m.uid } } })); });

describe.each([['web', publishCareerComment], ['native', publishNative]] as const)('%s anonymous publication', (_name, publish) => {
  const client = () => { const q = { insert: m.insert, select: () => q, eq: () => q, maybeSingle: m.existing }; return { from: () => q } as never; };
  it('never retries anonymously requested content as public after a write failure', async () => {
    m.insert.mockResolvedValue({ error: { code: '42703' } });
    await expect(publish(client(), draft)).rejects.toEqual({ code: '42703' });
    expect(m.insert).toHaveBeenCalledExactlyOnceWith(draft);
  });
  it('accepts an uncertain retry only when the stored draft and privacy exactly match', async () => {
    m.insert.mockResolvedValue({ error: { code: '23505' } });
    m.existing.mockResolvedValueOnce({ data: draft }).mockResolvedValueOnce({ data: { ...draft, is_anonymous: false } });
    await expect(publish(client(), draft)).resolves.toBeUndefined();
    await expect(publish(client(), draft)).rejects.toEqual({ code: '23505' });
  });
});

it('double click sends once, freezes anonymity and preserves the draft after failure', async () => {
  const pending = deferred<{ error: { code: string } }>(); m.insert.mockReturnValue(pending.promise);
  render(<CareerComments careerId="career" />);
  const box = await screen.findByRole('textbox', { name: 'Tu comentario' });
  fireEvent.change(box, { target: { value: 'Mi experiencia privada' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /anónimo/ }));
  const send = screen.getByRole('button', { name: 'Comentar' });
  act(() => { fireEvent.click(send); fireEvent.click(send); });
  await waitFor(() => expect(m.insert).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(box).toBeDisabled();
  const firstDraft = m.insert.mock.calls[0][0];
  expect(firstDraft.is_anonymous).toBe(true);
  await act(async () => pending.resolve({ error: { code: 'timeout' } }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Conservamos tu texto');
  expect(box).toHaveValue('Mi experiencia privada');
  expect(screen.getByRole('checkbox')).toBeChecked();
  m.insert.mockResolvedValue({ error: null });
  fireEvent.click(send);
  await waitFor(() => expect(m.insert).toHaveBeenCalledTimes(2));
  expect(m.insert.mock.calls[1][0]).toEqual(firstDraft);
});

it('changing account during authentication cancels the old account publication', async () => {
  const pending = deferred<{ data: { user: { id: string } } }>(); m.user.mockReturnValue(pending.promise);
  const view = render(<CareerComments careerId="career" />);
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Account A draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Comentar' }));
  act(() => { m.uid = 'account-b'; m.listeners.forEach(fn => fn('SIGNED_IN', { user: { id: 'account-b' } })); });
  view.rerender(<CareerComments careerId="career" />);
  await act(async () => pending.resolve({ data: { user: { id: 'account-a' } } }));
  expect(m.insert).not.toHaveBeenCalled();
  expect(await screen.findByRole('textbox')).toHaveValue('');
});
