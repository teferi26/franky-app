"use client";
import { WEARABLE_SHIRT_SIZES } from '@/lib/event-shirts';
import { shirtPriceLabel, type ShirtPrices, type ShirtChoice } from '@/lib/event-shirt-pricing';
import { cn } from '@/lib/utils';

// Selector de opción (con o sin camiseta) y talla. Presentación v3: opciones
// como tarjetas hairline, la elegida marcada con el violeta de acento.
export default function EventShirtOptions({ prices, value, onChange, disabled = false }: {
  prices: ShirtPrices; value: ShirtChoice; onChange: (value: ShirtChoice) => void; disabled?: boolean;
}) {
  const withShirt = value !== null && value !== 'ninguna';
  const options = [
    { id: 'ninguna', label: 'Sin camiseta', cents: prices.withoutCents },
    { id: 'with_shirt', label: 'Con camiseta', cents: prices.withCents },
  ] as const;

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <legend className="mb-2 text-[13px] font-semibold tracking-tight text-text-primary">Elige tu opción</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = option.id === 'ninguna' ? value === 'ninguna' : withShirt;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={cn(
                'rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-200 disabled:opacity-60',
                active
                  ? 'border-violet bg-violet-50/70 shadow-card'
                  : 'border-border bg-bg-primary hover:border-text-primary/20'
              )}
            >
              <span className="block text-sm text-text-secondary">{option.label}</span>
              <strong className="mt-1 block font-heading text-lg font-bold tabular text-text-primary">
                {shirtPriceLabel(option.cents)}
              </strong>
            </button>
          );
        })}
      </div>

      {withShirt && (
        <div>
          <p className="mb-2 text-[13px] font-semibold tracking-tight text-text-primary">Elige la talla de tu camiseta</p>
          <div className="flex flex-wrap gap-2">
            {WEARABLE_SHIRT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={value === size}
                onClick={() => onChange(size)}
                className={cn(
                  'min-h-11 min-w-11 rounded-lg border px-3 text-sm font-semibold transition-colors duration-200',
                  value === size
                    ? 'border-violet bg-violet text-white'
                    : 'border-border bg-bg-primary text-text-secondary hover:border-text-primary/25'
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs leading-relaxed text-text-muted">
        El pago lo gestiona el organizador. Tu elección y talla quedan guardadas con tu inscripción.
      </p>
    </fieldset>
  );
}
