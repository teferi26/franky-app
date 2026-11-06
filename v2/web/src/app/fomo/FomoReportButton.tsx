"use client";
import { useState } from 'react';
import { Flag, ShieldBan } from 'lucide-react';
import { useSession } from '@/components/SessionProvider';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { suppressSocialContent } from '@/lib/social-moderation-client';

export default function FomoReportButton({ targetType, targetId, className = '', onSuppressed }: {
  targetType: 'thread' | 'reply'; targetId: string; className?: string; onSuppressed?: () => void;
}) {
  const { user } = useSession();
  const isCurrent = useSessionGuard(user?.id ?? null);
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function act(block: boolean) {
    if (!user || busy) return;
    const owner = user.id;
    setBusy(true); setError(false);
    try {
      const ok = await confirm({ title: block ? 'Bloquear a esta persona' : 'Denunciar contenido',
        description: block ? 'Dejarás de ver sus publicaciones. Su identidad anónima seguirá oculta.' : 'Dejarás de ver este contenido y el equipo recibirá tu denuncia.',
        confirmText: block ? 'Bloquear' : 'Denunciar', variant: 'danger' });
      if (!ok || !isCurrent()) return;
      await suppressSocialContent(owner, isCurrent, targetType === 'thread' ? 'fomo_thread' : 'fomo_reply', targetId, block);
      if (isCurrent()) onSuppressed?.();
    } catch { if (isCurrent()) setError(true); }
    finally { if (isCurrent()) setBusy(false); }
  }
  if (!user) return null;
  return <span className={`inline-flex items-center gap-3 ${className}`}>
    <button type="button" disabled={busy} onClick={() => void act(false)} title="Denunciar" aria-label="Denunciar" className="text-text-muted hover:text-error disabled:opacity-50"><Flag className="h-4 w-4" /></button>
    <button type="button" disabled={busy} onClick={() => void act(true)} title="Bloquear a esta persona" aria-label="Bloquear a esta persona" className="text-text-muted hover:text-error disabled:opacity-50"><ShieldBan className="h-4 w-4" /></button>
    {error && <span role="alert" className="text-xs text-error">No se ha guardado. Inténtalo de nuevo.</span>}
  </span>;
}
