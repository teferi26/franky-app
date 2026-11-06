'use client';
import { useState } from 'react';
import { useSession } from './SessionProvider';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { suppressSocialContent, type SocialContentKind } from '@/lib/social-moderation-client';
import { useConfirm } from './ui/confirm-dialog';

export function SocialSafetyActions({ kind, id, onSuppressed }: { kind: SocialContentKind; id: string; onSuppressed: () => void }) {
  const { user } = useSession();
  const current = useSessionGuard(user?.id ?? null);
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function act(action: 'hide' | 'report' | 'block') {
    if (!user || busy) return;
    setBusy(true); setError('');
    try {
      if (action !== 'hide' && !await confirm({ title: action === 'block' ? 'Bloquear a esta persona' : 'Denunciar contenido', description: 'Este contenido desaparecerá de tu vista. Las denuncias las revisa el equipo de Franky.', confirmText: action === 'block' ? 'Bloquear' : 'Denunciar' })) return;
      await suppressSocialContent(user.id, current, kind, id, action === 'block', action === 'hide');
      if (current()) onSuppressed();
    } catch { if (current()) setError('No se ha guardado. Comprueba la conexión e inténtalo de nuevo.'); }
    finally { if (current()) setBusy(false); }
  }
  return <div className="mt-3 flex flex-wrap gap-3 text-xs text-text-muted">
    <button disabled={busy} onClick={() => void act('hide')}>Ocultar</button>
    <button disabled={busy} onClick={() => void act('report')}>Denunciar</button>
    <button disabled={busy} onClick={() => void act('block')}>Bloquear</button>
    <a href="/contacto">Contactar con Franky</a>
    {error && <p role="alert">{error}</p>}
  </div>;
}
