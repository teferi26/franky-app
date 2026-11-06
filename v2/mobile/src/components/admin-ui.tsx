// Piezas compartidas por las dos mitades del panel: la analítica
// (app/admin.tsx) y la gestión (components/AdminGestion.tsx).
//
// Estaban duplicadas dentro de la pantalla de analítica. Al traer la gestión a
// la app hacían falta en los dos sitios, y dos copias del mismo formateador de
// números es exactamente cómo empiezan las diferencias tontas entre pantallas.

import React from 'react';
import { View, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { C, S, F, R, FONT } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';

/**
 * SIN DATO se pinta como raya, NUNCA como 0. La diferencia importa: un 0 real
 * ("no hay ningún propietario") y un dato que no ha llegado se veían igual, así
 * que un panel roto parecía un panel con la comunidad a cero.
 */
export const SIN_DATO = '—';

export function sumKnown(...values: (number | null | undefined)[]): number | undefined {
  return values.every(value => typeof value === 'number' && Number.isFinite(value))
    ? (values as number[]).reduce((total, value) => total + value, 0)
    : undefined;
}

export function n(v: unknown): string {
  const x = typeof v === 'number' ? v : Number(v);
  if (v == null || typeof v === 'boolean' || (typeof v === 'string' && !v.trim()) || !Number.isFinite(x)) return SIN_DATO;
  return x.toLocaleString('es-ES');
}

export function eur(v: unknown): string {
  const x = Number(v);
  if (v == null || typeof v === 'boolean' || (typeof v === 'string' && !v.trim()) || !Number.isFinite(x)) return SIN_DATO;
  return `${x.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/**
 * El SQL ya devuelve estos valores EN PORCENTAJE (round(100.0 * a / b, 1)),
 * así que aquí no se vuelve a multiplicar: hacerlo convertiría un 0,5 % real
 * en un 50 %.
 */
export function pct(v: unknown): string {
  const x = Number(v);
  if (v == null || typeof v === 'boolean' || (typeof v === 'string' && !v.trim()) || !Number.isFinite(x)) return SIN_DATO;
  return `${x.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

export function fecha(v: string | null | undefined): string {
  if (!v) return SIN_DATO;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return SIN_DATO;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function fechaHora(v: string | null | undefined): string {
  if (!v) return SIN_DATO;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return SIN_DATO;
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Aviso de que UNA sección no cargó, sin tumbar las demás. */
export function Aviso({ texto, tono = 'error' }: { texto?: string; tono?: 'error' | 'info' }) {
  if (!texto) return null;
  return (
    <View style={{ borderWidth: 0.5, borderColor: tono === 'error' ? C.error : C.border, borderRadius: R.md, padding: S.md, gap: 3 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: tono === 'error' ? C.errorText : C.blue, fontSize: 13, fontFamily: FONT.semibold }}>
        {tono === 'error' ? 'Esta sección no se pudo cargar' : 'Ojo con este dato'}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{texto}</Text>
    </View>
  );
}

/**
 * Métrica del panel: rótulo pequeño arriba y la cifra en Outfit con cifras
 * tabulares. Sin recuadro de color: dos por fila separadas por hairline, que
 * es como se lee una tabla de datos y no un tablero de juguete.
 */
export function Kpi({ icon: Icon, label, value, tint, pie }: {
  icon: LucideIcon; label: string; value: string; tint?: string; pie?: string;
}) {
  return (
    <View style={{
      flexGrow: 1, flexBasis: '47%', paddingVertical: S.md, paddingRight: S.md, gap: 5,
      borderTopWidth: 0.5, borderTopColor: C.borderLight,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={14} color={tint ?? C.muted} strokeWidth={1.75} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { flex: 1 }]} numberOfLines={2}>{label}</Text>
      </View>
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 25, fontFamily: FONT.display, color: C.text, letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {pie ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { fontSize: 11 }]}>{pie}</Text> : null}
    </View>
  );
}

export function Titulo({ children }: { children: React.ReactNode }) {
  return <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginTop: S.sm }]}>{children}</Text>;
}
