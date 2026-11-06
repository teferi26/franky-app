import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BadgePercent, CalendarCheck2, Check, CreditCard, Gift, QrCode, ShieldCheck, Sparkles, Wallet } from 'lucide-react-native';
import { Btn, Card } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { cardRpc } from '@/lib/franky-card';
import { cardMoney } from '@/lib/franky-card-model';
import type { SessionIdentity } from '@/lib/session';
import { Stepper } from '@/pro/kit';
import { C, F, FONT, R, S } from '@/theme';
import type { CardPersonal } from '../../../../shared/franky-card';

/** Descuento mínimo de la red: toda ventaja Card empieza en un 5 %. */
const MIN_PERCENT = 5;

type Habit = { key: string; label: string; hint: string; unit: 'semana' | 'mes'; initial: number; step: number; max: number };

/** Gasto de un estudiante tipo. Solo son valores de partida: cada uno pone el suyo. */
const HABITS: Habit[] = [
  { key: 'cafe', label: 'Cafés y desayunos', hint: 'Cafeterías cerca del campus', unit: 'semana', initial: 10, step: 2, max: 100 },
  { key: 'comer', label: 'Comer o cenar fuera', hint: 'Menús, bares y restaurantes', unit: 'mes', initial: 40, step: 5, max: 400 },
  { key: 'pelo', label: 'Peluquería y estética', hint: 'Corte, barba, uñas', unit: 'mes', initial: 15, step: 5, max: 200 },
  { key: 'deporte', label: 'Gimnasio y deporte', hint: 'Cuota, clases, pádel', unit: 'mes', initial: 30, step: 5, max: 200 },
  { key: 'ocio', label: 'Ocio y salidas', hint: 'Pubs, discotecas, escape room', unit: 'mes', initial: 40, step: 5, max: 400 },
];

const STEPS = [
  { icon: CreditCard, title: 'Hazte la Card en un minuto', body: 'Pagas una vez al año, sin cuotas mensuales ni renovación automática.' },
  { icon: QrCode, title: 'Enséñala al pagar', body: 'Abre la app y muestra tu código en el mostrador. También desde Apple o Google Wallet.' },
  { icon: BadgePercent, title: 'El descuento se aplica al momento', body: 'Desde un 5 % en los locales adheridos, y más en las ofertas para estudiantes.' },
  { icon: Gift, title: 'Suma sellos y premios', body: 'Cada consumo cuenta para las tarjetas de sellos de tus sitios favoritos.' },
  { icon: Wallet, title: 'Mira cuánto llevas ahorrado', body: 'La app suma cada descuento confirmado para que veas si te compensa.' },
];

const PERKS = [
  { icon: BadgePercent, text: 'Descuentos en cafeterías, restaurantes, peluquerías, gimnasios y ocio' },
  { icon: Sparkles, text: 'Ofertas relámpago de huecos libres, solo para estudiantes' },
  { icon: CalendarCheck2, text: 'Reserva citas y mesas desde la app' },
  { icon: ShieldCheck, text: 'Precio de estudiante verificado donde el local lo ofrezca' },
];

function annual(h: Habit, value: number) {
  return h.unit === 'semana' ? value * 52 : value * 12;
}

/**
 * Por qué merece la pena la Franky Card, paso a paso, con una estimación
 * de ahorro calculada con el gasto que pone el propio estudiante y el
 * descuento medio real de la red. Nunca se presenta como ahorro garantizado.
 */
export function CardPitch({ owner, pricing }: { owner: SessionIdentity; pricing: CardPersonal['pricing'] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(HABITS.map((h) => [h.key, h.initial])));
  const [networkPercent, setNetworkPercent] = useState<number | null>(null);

  const loadNetwork = useCallback(async (signal: AbortSignal) => {
    try {
      const page = await cardRpc('list_franky_card_offers', { p_city: null, p_limit: 25 }, owner, signal);
      const active = page.items.filter((o) => o.status === 'active' || o.status === undefined);
      if (!signal.aborted && active.length) setNetworkPercent(active.reduce((sum, o) => sum + o.percent, 0) / active.length);
    } catch {
      // Sin red de ofertas visible se usa el mínimo del 5 %.
    }
  }, [owner]);

  useEffect(() => {
    const controller = new AbortController();
    void loadNetwork(controller.signal);
    return () => controller.abort();
  }, [loadNetwork]);

  const percent = Math.max(MIN_PERCENT, Math.round((networkPercent ?? MIN_PERCENT) * 10) / 10);
  const spend = useMemo(() => HABITS.reduce((sum, h) => sum + annual(h, values[h.key] ?? 0), 0), [values]);
  const firstYear = pricing.introductory_cents || pricing.annual_cents;
  const savingsCents = Math.round(spend * 100 * (percent / 100));
  const netCents = savingsCents - firstYear;

  return (
    <View style={{ gap: S.lg }}>
      <FadeIn>
        <View style={{ backgroundColor: '#121019', borderRadius: R.xl, padding: S.xl, gap: S.sm }}>
          <Text style={{ color: '#A78BFA', fontFamily: FONT.semibold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' }} maxFontSizeMultiplier={1.3}>Franky Card</Text>
          <Text style={{ color: '#FFFFFF', fontFamily: FONT.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8 }} maxFontSizeMultiplier={1.25}>
            Paga menos en los sitios a los que ya vas.
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 15 }} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {`${cardMoney(firstYear)} el primer año${pricing.annual_cents !== firstYear ? `, después ${cardMoney(pricing.annual_cents)}` : ''}. Menos que dos menús.`}
          </Text>
          <View style={{ marginTop: S.sm }}>
            <Btn label="Quiero mi Franky Card" icon={CreditCard} onPress={() => router.push('/card-planes')} />
          </View>
        </View>
      </FadeIn>

      <Card style={{ gap: S.md }}>
        <Text style={F.label}>Tu ahorro estimado</Text>
        <Text style={F.small}>Ajusta lo que sueles gastar y te decimos cuánto te ahorrarías en un año con el descuento medio de la red ({String(percent).replace('.', ',')} %).</Text>
        {HABITS.map((h) => (
          <View key={h.key} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={F.h3} maxFontSizeMultiplier={MAX_FONT_SCALE}>{h.label}</Text>
              <Text style={F.tiny} maxFontSizeMultiplier={MAX_FONT_SCALE}>{h.hint}</Text>
            </View>
            <Stepper
              label={`${h.label} por ${h.unit}`}
              value={values[h.key] ?? 0}
              min={0}
              max={h.max}
              step={h.step}
              format={(v) => `${v} €/${h.unit === 'semana' ? 'sem' : 'mes'}`}
              onChange={(v) => setValues((prev) => ({ ...prev, [h.key]: v }))}
            />
          </View>
        ))}
        <View style={{ borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: S.md, gap: 6 }}>
          <Row label="Gastas al año en estos sitios" value={cardMoney(Math.round(spend * 100))} />
          <Row label="Te ahorrarías con la Card" value={cardMoney(savingsCents)} strong />
          <Row label="Coste de la Card el primer año" value={`− ${cardMoney(firstYear)}`} />
          <View style={{ backgroundColor: netCents > 0 ? C.accentSoft : C.input, borderRadius: R.lg, padding: S.md, marginTop: S.sm }}>
            <Text style={{ fontFamily: FONT.display, fontSize: 28, color: C.text }} maxFontSizeMultiplier={1.25}>
              {netCents > 0 ? `+${cardMoney(netCents)} al año` : 'Con este gasto aún no compensa'}
            </Text>
            <Text style={F.small} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {netCents > 0
                ? `Recuperas la Card al gastar ${cardMoney(Math.ceil(firstYear / (percent / 100)))} en locales adheridos.`
                : 'Sube tu gasto habitual o espera a que haya más locales adheridos cerca de ti.'}
            </Text>
          </View>
          <Text style={F.tiny} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Es una estimación con los importes que has puesto. El ahorro real depende de los locales adheridos de tu ciudad y de las condiciones de cada ventaja.
          </Text>
        </View>
      </Card>

      <Card style={{ gap: S.md }}>
        <Text style={F.label}>Cómo funciona</Text>
        {STEPS.map((step, i) => (
          <View key={step.title} style={{ flexDirection: 'row', gap: S.md }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONT.heading, color: C.blueDeep }} maxFontSizeMultiplier={1.2}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={F.h3} maxFontSizeMultiplier={MAX_FONT_SCALE}>{step.title}</Text>
              <Text style={F.small} maxFontSizeMultiplier={MAX_FONT_SCALE}>{step.body}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card style={{ gap: S.md }}>
        <Text style={F.label}>Qué incluye</Text>
        {PERKS.map((perk) => (
          <View key={perk.text} style={{ flexDirection: 'row', gap: S.md, alignItems: 'center' }}>
            <perk.icon size={18} color={C.blue} strokeWidth={1.9} />
            <Text style={[F.body, { flex: 1 }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{perk.text}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: S.md, alignItems: 'center' }}>
          <Check size={18} color={C.success} strokeWidth={2.4} />
          <Text style={[F.body, { flex: 1 }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>Tus sellos y premios siguen siendo tuyos aunque no renueves.</Text>
        </View>
        <Btn label="Ver locales con descuento" variant="secondary" onPress={() => router.push('/card-ventajas')} />
        <Btn label="Quiero mi Franky Card" icon={CreditCard} onPress={() => router.push('/card-planes')} />
      </Card>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.md }}>
      <Text style={[F.small, { flex: 1 }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label}</Text>
      <Text style={[strong ? F.h3 : F.body, strong ? { color: C.blue } : null]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{value}</Text>
    </View>
  );
}
