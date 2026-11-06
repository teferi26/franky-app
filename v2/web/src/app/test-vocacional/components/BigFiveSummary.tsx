import { BIG_FIVE_LABELS, type BigFiveScores, type BigFiveTrait } from '../lib/big-five';
import { normalizeVocationalBigFive } from '@/lib/vocational-big-five';
import MeterBar from './MeterBar';

// Resumen Big Five: cinco escalas con la cifra en tabular y una barra que
// crece al montar. Superficie de tarjeta del sistema, sin colores por rasgo.
export default function BigFiveSummary({ scores: input }: { scores: Partial<BigFiveScores> | Record<string, number> }) {
  const scores = normalizeVocationalBigFive(input);
  const traits = (Object.keys(BIG_FIVE_LABELS) as BigFiveTrait[]).filter(trait => Number.isFinite(scores[trait]));
  if (!traits.length) return null;
  return <section className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-7">
    <p className="eyebrow">Personalidad</p>
    <h2 className="mt-2 font-heading text-xl font-bold text-text-primary">Tu resumen de personalidad</h2>
    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">Estas escalas resumen tus respuestas de personalidad. Son índices del cuestionario, no percentiles frente a otras personas ni una evaluación de tu capacidad para estudiar.</p>
    <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {traits.map((trait, i) => {
        const raw = Number(scores[trait]);
        const value = Math.round(trait === 'N' ? 100 - raw : raw);
        return <div key={trait}>
          <div className="mb-2 flex justify-between gap-3 text-sm"><dt className="text-text-secondary">{BIG_FIVE_LABELS[trait]}</dt><dd className="shrink-0 font-semibold text-text-primary tabular">{value}/100</dd></div>
          <MeterBar value={value} delay={i * 80} />
        </div>;
      })}
    </dl>
  </section>;
}
