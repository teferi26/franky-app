"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BellRing } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { useSession } from '@/components/SessionProvider';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { Button } from '@/components/ui/button';

type Intent = { city: string; province: string | null; budget_max: number | null; enabled: boolean; expires_at: string };
const searchListeners = new Set<(owner: string, intent: Intent) => void>();
export async function recordHousingSearch(owner: string, city: string, budget: number | null, enabled?: boolean) {
  const db = createClient();
  const { data: old, error: readError } = await db.from('housing_search_intents').select('enabled').eq('user_id', owner).maybeSingle();
  if (readError) throw readError;
  const { data, error } = await db.rpc('save_housing_search', { p_city: city, p_budget_max: budget, p_enabled: enabled ?? old?.enabled ?? true, p_expected_user_id: owner });
  if (error) throw error;
  searchListeners.forEach(listener => listener(owner, data as Intent));
  return data as Intent;
}
export default function HousingSearchAlert({ city, budget }: { city?: string; budget?: number | null }) {
  const { user } = useSession();
  if (!user) {
    // Sin sesión: una línea discreta, no un bloque tintado.
    return (
      <p className="mb-6 flex items-center gap-2.5 rounded-2xl border border-border px-4 py-3 text-sm text-text-secondary">
        <BellRing className="h-4 w-4 shrink-0 text-violet" />
        <span>
          <Link href="/login?redirect=/alojamiento" className="link-underline font-semibold text-text-primary">Entra en tu cuenta</Link>
          {' '}para recibir avisos cuando aparezcan pisos en la zona que buscas.
        </span>
      </p>
    );
  }
  return <OwnedAlert key={user.id} owner={user.id} city={city || ''} budget={budget ?? null} />;
}
function OwnedAlert({ owner, city, budget }: { owner: string; city: string; budget: number | null }) {
  const isCurrent = useSessionGuard(owner);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    let alive = true;
    let updated = false;
    const receive = (savedOwner: string, saved: Intent) => {
      if (savedOwner !== owner || !alive || !isCurrent()) return;
      updated = true; setIntent(saved); setLoaded(true); setError('');
    };
    searchListeners.add(receive);
    createClient().from('housing_search_intents').select('city,province,budget_max,enabled,expires_at').eq('user_id', owner).maybeSingle().then(({ data, error }) => {
      if (!alive || updated || !isCurrent()) return;
      setLoaded(true); if (error) setError('No se pudieron comprobar tus avisos.'); else setIntent(data as Intent | null);
    });
    return () => { alive = false; searchListeners.delete(receive); };
  }, [owner, city, budget, isCurrent]);
  const active = intent?.enabled && Date.parse(intent.expires_at) > Date.now();
  const save = async (enabled: boolean) => {
    const destination = enabled ? city || intent?.city : intent?.city || city;
    if (!isCurrent() || busy.current || !destination) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const result = await recordHousingSearch(owner, destination, enabled ? budget : intent?.budget_max ?? null, enabled);
      if (isCurrent()) setIntent({ ...result, budget_max: enabled ? budget : intent?.budget_max ?? null });
    } catch { if (isCurrent()) setError('No se ha guardado el cambio. Vuelve a intentarlo.'); }
    finally { if (isCurrent()) { busy.current = false; setSaving(false); } }
  };
  // Aviso de zona (v3): superficie blanca con borde hairline, icono suelto en
  // violeta y botones del sistema. Sin fondo tintado.
  return (
    <aside className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:flex-row sm:items-center">
      <BellRing className="h-5 w-5 shrink-0 text-violet" />
      <div className="flex-1">
        <h2 className="font-heading text-[15px] font-bold text-text-primary">
          {active ? `Te avisamos de pisos en ${intent.province || intent.city}` : 'Que el próximo piso te encuentre'}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {active
            ? `Hasta el ${new Date(intent.expires_at).toLocaleDateString('es-ES')}${intent.budget_max ? ` · máximo ${intent.budget_max} €/mes` : ''}. Puedes cambiar la zona al buscar.`
            : city
              ? `Activa avisos durante 30 días para ${city} y su provincia.`
              : 'Elige una ciudad para guardar la zona en la que buscas.'}
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
      </div>
      <div className="flex gap-2">
        {city && (
          <Button variant="dark" disabled={saving || !loaded} onClick={() => save(true)}>
            {saving ? 'Guardando…' : active && intent.city === city ? 'Renovar 30 días' : 'Avisarme aquí'}
          </Button>
        )}
        {active && (
          <Button variant="outline" disabled={saving} onClick={() => save(false)}>
            Desactivar
          </Button>
        )}
      </div>
    </aside>
  );
}
