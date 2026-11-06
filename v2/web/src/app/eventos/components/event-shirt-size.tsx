"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Shirt } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { SHIRT_SIZES, shirtSizeLabel, isShirtSize, type ShirtSize } from "@/lib/event-shirts";
import EventShirtOptions from './event-shirt-options';
import { shirtPriceLabel, type ShirtPrices } from '@/lib/event-shirt-pricing';

/**
 * Encuesta de talla de camiseta (migración 164). Se pregunta a quien participa
 * en un evento que reparte camisetas, para que el organizador sepa cuántas
 * llevar de cada talla.
 *
 * Se pinta solo cuando la persona YA participa (inscrita, o con entrada en los
 * eventos de pago): así el recuento del organizador coincide con la lista real
 * de asistentes y nadie aparece por haber tocado un botón sin apuntarse.
 *
 * Guarda al tocar (upsert de la propia fila, RLS `event_shirt_sizes_*_self`) y
 * se puede cambiar tantas veces como haga falta mientras el evento siga
 * repartiendo camisetas.
 */
export default function EventShirtSize({ eventId, prices = null }: { eventId: string; prices?: ShirtPrices | null }) {
  const pending = useRef(false);
  const [choosingSize, setChoosingSize] = useState(false);
  const [quote, setQuote] = useState<number | null>(null);
  const [size, setSize] = useState<ShirtSize | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ShirtSize | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setSize(null); setQuote(null); setError(null);
      try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      // Filtrar por user_id es obligatorio: el organizador también puede leer
      // las tallas de su evento, y sin este filtro se traería la de otro.
      const { data, error: loadError } = await supabase
        .from("event_shirt_sizes")
        .select("size,quoted_price_cents")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (loadError) throw loadError;
      const stored = (data as { size?: string } | null)?.size;
      if (isShirtSize(stored)) setSize(stored);
      setQuote(typeof data?.quoted_price_cents === 'number' ? data.quoted_price_cents : null);
      } catch { if (!cancelled) setError('No se pudo cargar tu opción. Recarga la página para comprobarla.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function choose(next: ShirtSize) {
    if (pending.current) return;
    pending.current = true;
    setSaving(next); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Vuelve a iniciar sesión para guardar tu opción."); return; }
      const { data: saved, error: saveError } = await supabase.from('event_shirt_sizes')
        .upsert({ event_id: eventId, user_id: user.id, size: next }, { onConflict: 'event_id,user_id' })
        .select('size,quoted_price_cents').single();
      if (saveError || !saved) { setError('No se pudo guardar tu opción. Inténtalo de nuevo.'); return; }
      setSize(next); setChoosingSize(false);
      setQuote(typeof saved.quoted_price_cents === 'number' ? saved.quoted_price_cents : null);
    } catch { setError('No se pudo confirmar el cambio. Revisa tu conexión y recarga la página.'); }
    finally { pending.current = false; setSaving(null); }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-secondary/60 p-4">
      {prices ? <>
        <p className="mb-3 text-sm font-semibold text-text-primary">Tu inscripción{quote !== null ? ` · ${shirtPriceLabel(quote)} a pagar al organizador` : ''}</p>
        {loading ? <p role="status">Cargando tu opción…</p> : <EventShirtOptions prices={prices} value={choosingSize ? 'with_shirt' : size} disabled={saving !== null} onChange={next => { if (next === 'with_shirt') setChoosingSize(true); else if (isShirtSize(next)) void choose(next); }} />}
        <p className="mt-2 text-xs text-text-muted">Cambiar entre con y sin camiseta aplica el precio mostrado. Cambiar solo la talla conserva tu importe.</p>
        {error && <p role="alert" className="mt-2 text-xs font-medium text-error">{error}</p>}
      </> : <>
      <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Shirt className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" />
        {size ? "Tu talla de camiseta" : "¿Qué talla de camiseta usas?"}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">
        {size
          ? "Guardada. Puedes cambiarla hasta el día del evento."
          : "En este evento se reparten camisetas: elige tu talla para que te reserven la tuya."}
      </p>

      {loading ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {SHIRT_SIZES.map((s) => {
              const active = size === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => choose(s)}
                  disabled={saving !== null}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors duration-200 disabled:opacity-60 ${
                    active
                      ? "border-violet bg-violet text-white"
                      : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/25"
                  } ${s === "ninguna" ? "text-xs font-medium" : ""}`}
                >
                  {saving === s ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : active ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : null}
                  {shirtSizeLabel(s)}
                </button>
              );
            })}
          </div>
          {error && <p role="alert" className="mt-2 text-xs font-medium text-error">{error}</p>}
        </>
      )}
      </>}
    </div>
  );
}
