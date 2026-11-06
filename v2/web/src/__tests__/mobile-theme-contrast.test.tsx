import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const modes = ['light', 'dark', 'franky'] as const;
type RGB = [number, number, number];
function rgb(hex: string): RGB { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB; }
function luminance(value: RGB) {
  const [r, g, b] = value.map(byte => byte / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
function ratio(a: RGB, b: RGB) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}
function flatten(style: any): any { return Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {}; }

function fixture(mode: typeof modes[number]) {
  const modules = new Map<string, any>();
  const replace = vi.fn();
  function box(tag: string) {
    return ({ children, style, accessibilityRole, accessibilityLabel, accessibilityState, onPress, disabled, colors }: any) => React.createElement(tag, {
      'data-native-style': JSON.stringify(flatten(style)), 'data-gradient': colors ? JSON.stringify(colors) : undefined,
      role: accessibilityRole, 'aria-label': accessibilityLabel, 'aria-selected': accessibilityState?.selected,
      'aria-disabled': disabled, onClick: disabled ? undefined : onPress,
    }, children);
  }
  const View = box('div');
  class Value { interpolate() { return 1; } }
  const native = {
    View, Text: box('span'), Pressable: box('button'), ScrollView: View, TextInput: box('input'), Modal: View,
    ActivityIndicator: () => null, StyleSheet: { flatten },
    Animated: {
      View, Value, spring: () => ({ start() {} }), timing: () => ({ start() {}, stop() {} }),
      sequence: () => ({ start() {}, stop() {} }), loop: () => ({ start() {}, stop() {} }),
      event: () => () => {},
    },
    Easing: { bezier: () => (t: number) => t, inOut: (f: unknown) => f, quad: (t: number) => t },
    LayoutAnimation: {
      configureNext() {}, Types: { easeInEaseOut: 'easeInEaseOut' }, Properties: { opacity: 'opacity' },
    },
    UIManager: { setLayoutAnimationEnabledExperimental: undefined },
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  };
  const Icon = () => null;
  const mocks: Record<string, any> = {
    react: { ...React, default: React }, 'react/jsx-runtime': jsx, 'react-native': native,
    'expo-router': { useRouter: () => ({ replace }) },
    'expo-image': { Image: () => null }, 'expo-linear-gradient': { LinearGradient: View },
    'expo-haptics': { impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } },
    'lucide-react-native': new Proxy({}, { get: () => Icon }),
    '@/lib/a11y': { MAX_FONT_SCALE: 1.6, useReduceMotion: () => true },
    '@/lib/theme-switch': { getThemeMode: () => mode },
  };
  function load(relative: string): any {
    if (modules.has(relative)) return modules.get(relative);
    const mod = { exports: {} }; modules.set(relative, mod.exports);
    const code = ts.transpileModule(readFileSync(resolve('../mobile/src', relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(code, { exports: mod.exports, module: mod, require: (name: string) => {
      if (name in mocks) return mocks[name];
      if (name === '@/theme') return load('theme.ts');
      if (name === '@/components/ui') return load('components/ui.tsx');
      // Las primitivas de movimiento (src/components/motion.tsx) las usa el kit
      // desde el rediseno v3: se cargan igual que el resto de modulos locales.
      if (name === './motion' || name === '@/components/motion') return load('components/motion.tsx');
      if (name === './ui') return load('components/ui.tsx');
      throw Error(`Unexpected dependency: ${name}`);
    } });
    return mod.exports;
  }
  const theme = load('theme.ts'); theme.applyTheme(mode);
  return { theme, kit: load('components/ui.tsx'), load, replace, Icon };
}

function background(element: HTMLElement | null, canvas: string): RGB {
  if (!element) return rgb(canvas);
  const style = JSON.parse(element.dataset.nativeStyle ?? '{}');
  const color = style.backgroundColor as string | undefined;
  if (!color || color === 'transparent') return background(element.parentElement, canvas);
  const alpha = color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1;
  const under = alpha < 1 ? background(element.parentElement, canvas) : [0, 0, 0];
  return rgb(color).map((v, i) => v * alpha + under[i] * (1 - alpha)) as RGB;
}
function textContrast(element: HTMLElement, canvas: string) {
  const style = JSON.parse(element.dataset.nativeStyle ?? '{}');
  return ratio(rgb(style.color), background(element, canvas));
}

afterEach(cleanup);
describe('Mobile readable controls', () => {
  it.each([8, 52])('places the close target over its image, including a safe-area top of %i', top => {
    const { Tap } = fixture('dark').kit;
    const onPress = vi.fn();
    render(<Tap onPress={onPress} accessibilityLabel="Cerrar imagen" style={{ position: 'absolute', top, right: 14, zIndex: 2 }}><span>Cerrar</span></Tap>);
    const target = screen.getByRole('button', { name: 'Cerrar imagen' });
    expect(JSON.parse(target.getAttribute('data-native-style')!)).toMatchObject({ position: 'absolute', top, right: 14, zIndex: 2 });
    const visual = JSON.parse(target.firstElementChild!.getAttribute('data-native-style')!);
    expect(visual).not.toHaveProperty('position');
    expect(visual).not.toHaveProperty('top');
    expect(visual).not.toHaveProperty('right');
    fireEvent.click(target);
    expect(onPress).toHaveBeenCalledOnce();
  });
  it('keeps a full-cover photo action over its parent instead of collapsing it', () => {
    const { Tap } = fixture('light').kit;
    render(<Tap accessibilityLabel="Abrir foto" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}><span>Foto</span></Tap>);
    const target = screen.getByRole('button', { name: 'Abrir foto' });
    expect(JSON.parse(target.getAttribute('data-native-style')!)).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 });
    expect(JSON.parse(target.firstElementChild!.getAttribute('data-native-style')!).flex).toBe(1);
  });
  it.each([
    { position: 'absolute', left: 20, top: 48, width: 90, height: 60 },
    { position: 'absolute', left: 12, bottom: 20, width: 44, height: 44, elevation: 4 },
  ])('preserves the schedule and map floating-control contracts %j', style => {
    const { Tap } = fixture('light').kit;
    const onPress = vi.fn();
    render(<Tap onPress={onPress} accessibilityLabel="Abrir" style={style}><span>Abrir</span></Tap>);
    const target = screen.getByRole('button', { name: 'Abrir' });
    const outer = JSON.parse(target.getAttribute('data-native-style')!);
    const visual = JSON.parse(target.firstElementChild!.getAttribute('data-native-style')!);
    expect(outer).toMatchObject({ position: 'absolute', left: style.left, width: style.width });
    expect(visual).toMatchObject({ width: style.width, height: style.height });
    if ('top' in style) expect(outer.top).toBe(style.top);
    if ('bottom' in style) expect(outer.bottom).toBe(style.bottom);
    if ('elevation' in style) expect(visual.elevation).toBe(style.elevation);
    fireEvent.click(target);expect(onPress).toHaveBeenCalledOnce();
  });
  it('preserves ordinary sizing, appearance and disabled actions', () => {
    const { Tap } = fixture('light').kit;
    const onPress = vi.fn();
    render(<Tap disabled onPress={onPress} accessibilityLabel="Guardar" style={{ flex: 1, minWidth: 44, height: 44, padding: 8, backgroundColor: '#FFFFFF' }}><span>Guardar</span></Tap>);
    const target = screen.getByRole('button', { name: 'Guardar' });
    expect(JSON.parse(target.getAttribute('data-native-style')!)).toMatchObject({ flex: 1, minWidth: 44 });
    expect(JSON.parse(target.firstElementChild!.getAttribute('data-native-style')!)).toMatchObject({ flex: 1, height: 44, padding: 8, backgroundColor: '#FFFFFF' });
    fireEvent.click(target);
    expect(onPress).not.toHaveBeenCalled();
  });
  it.each(modes)('keeps solid action and status pairs readable in %s', mode => {
    const { C } = fixture(mode).theme;
    for (const [foreground, bg] of [[C.onAccent, C.blue], [C.onAccent, C.accent2], [C.onSuccess, C.success], [C.onError, C.error], [C.onWarm, C.accent3]]) {
      expect(ratio(rgb(foreground), rgb(bg)), `${foreground} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps white button labels readable across the whole brand gradient', () => {
    const { BRAND_GRADIENT } = fixture('franky').theme;
    const [a, b] = BRAND_GRADIENT.map(rgb);
    for (let step = 0; step <= 256; step++) {
      const color = a.map((v: number, i: number) => v + (b[i] - v) * step / 256) as RGB;
      expect(ratio(rgb('#FFFFFF'), color), `gradient step ${step}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(modes)('renders readable selected tabs and notification counters in %s', mode => {
    const f = fixture(mode); const { HomeSwitch, ViviendaSwitch } = f.load('components/HomeSwitch.tsx');
    const { CrushTabs } = f.load('components/crush/CrushTabs.tsx'); const { NavRow } = f.kit;
    const view = render(<><HomeSwitch active="crush" /><ViviendaSwitch active="roomie" /><CrushTabs active="requests" onChange={() => {}} pending={12} /><NavRow icon={f.Icon} title="Conversaciones" badge={7} /></>);
    for (const label of ['Crush', 'Compañeros', 'Peticiones', '12', '7']) expect(textContrast(screen.getByText(label), f.theme.C.bg), label).toBeGreaterThanOrEqual(4.5);
    view.rerender(<CrushTabs active="wall" onChange={() => {}} pending={12} />);
    expect(textContrast(screen.getByText('12'), f.theme.C.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(modes)('renders readable pill, secondary and danger labels on both surfaces in %s', mode => {
    const f = fixture(mode); const { Pill, Btn } = f.kit;
    for (const canvas of [f.theme.C.bg, f.theme.C.surface]) {
      const view = render(<><Pill label="Abierta" tone="green" /><Pill label="Aviso" tone="orange" /><Pill label="Cerrada" tone="red" /><Pill label="Destacada" tone="blue" /><Pill label="Información" /><Btn label="Ver" variant="secondary" /><Btn label="Quitar" variant="danger" /></>);
      for (const label of ['Abierta', 'Aviso', 'Cerrada', 'Destacada', 'Información', 'Ver', 'Quitar']) expect(textContrast(screen.getByText(label), canvas), `${label} on ${canvas}`).toBeGreaterThanOrEqual(4.5);
      view.unmount();
    }
  });

  it('renders all avatar initial colors with normal-text contrast', () => {
    const f = fixture('franky'); const { Avatar } = f.kit;
    render(<>{['A', 'B', 'C', 'D', 'E', 'F'].map(name => <Avatar key={name} name={name} size={28} />)}</>);
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) expect(textContrast(screen.getByText(name), f.theme.C.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the shared switch routes and selection behavior', () => {
    const f = fixture('dark'); const { HomeSwitch } = f.load('components/HomeSwitch.tsx');
    render(<HomeSwitch active="crush" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Crush', selected: true })); expect(f.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'FOMO', selected: false })); expect(f.replace).toHaveBeenCalledWith('/(tabs)/feed');
  });
});
