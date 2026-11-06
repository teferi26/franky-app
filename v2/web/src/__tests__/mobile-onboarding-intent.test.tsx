import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { motionMock } from './helpers/mobile-motion-mock';

function fixture(seen = false) {
  const replace = vi.fn(), setIntent = vi.fn();
  const router = { replace };
  const Box = ({ children }: any) => <div>{children}</div>;
  const mocks: Record<string, any> = {
    react: { ...React, default: React }, 'react/jsx-runtime': jsx,
    'react-native': { View: Box, ScrollView: Box, Text: Box, Pressable: ({ children, onPress, accessibilityLabel, accessibilityState }: any) => <button role="radio" aria-label={accessibilityLabel} aria-checked={accessibilityState.checked} onClick={onPress}>{children}</button> },
    'expo-router': { useRouter: () => router },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'lucide-react-native': new Proxy({}, { get: () => () => null }),
    '@/components/ui': { ProgressBar: () => null, Btn: ({ label, onPress, disabled }: any) => <button onClick={onPress} disabled={disabled}>{label}</button> },
    '@/components/motion': motionMock,
    '@/lib/intent': { hasSeenGuide: async () => seen, setIntent },
    '@/lib/analytics': { track: vi.fn() }, '@/lib/a11y': { MAX_FONT_SCALE: 1.6 },
    '@/theme': { C: {}, S: {}, R: {}, F: {} },
  };
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync(resolve('../mobile/app/onboarding-intencion.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { module, exports: module.exports, require: (id: string) => { if (!(id in mocks)) throw Error(id); return mocks[id]; } });
  return { Page: module.exports.default, replace, setIntent };
}

it('allows changing the choice and saves only when explicitly confirmed', async () => {
  const f = fixture(); render(<f.Page />);
  const next = await screen.findByRole('button', { name: 'Este es mi punto de partida' });
  expect(next).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: 'Busco piso o compañero' }));
  expect(f.setIntent).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio', { name: 'Conocer gente de mi uni' }));
  expect(screen.getByRole('radio', { name: 'Conocer gente de mi uni' })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(next);
  expect(f.setIntent).toHaveBeenCalledExactlyOnceWith('gente');
  expect(f.replace).toHaveBeenCalledExactlyOnceWith('/guia');
});

it('retains the existing guard for people who already completed the guide', async () => {
  const f = fixture(true); render(<f.Page />);
  await waitFor(() => expect(f.replace).toHaveBeenCalledWith('/(tabs)/feed'));
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(f.setIntent).not.toHaveBeenCalled();
});
