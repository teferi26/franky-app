import React, { useRef, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { getAal, listVerifiedFactors, elevateWithTotp } from '@/lib/admin';
import { useWorkspace } from './WorkspaceProvider';
import { Btn, Card } from './ui';
import { C, F } from '@/theme';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';

/** Elevates the current actor; the sensitive server RPC still enforces AAL2. */
export function useWorkspaceMfa({ accountOnly = false }: { accountOnly?: boolean } = {}) {
  const { active, isCurrent } = useWorkspace(); const router = useRouter();
  const pending = useRef<{ work: () => Promise<void>; valid: () => boolean } | null>(null); const locked = useRef(false);
  const [factor, setFactor] = useState<string | null>(null); const [open, setOpen] = useState(false);
  const [code, setCode] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const protect = async (work: () => Promise<void>) => {
    const owner = captureSessionIdentity();
    const valid = () => !!owner && isCurrentSessionIdentity(owner) && (accountOnly || !!active && isCurrent(active.id));
    if (locked.current || pending.current || !valid()) return;
    locked.current = true;
    try {
      const level = await getAal(); if (!valid()) return;
      if (level === 'aal2') { await work(); return; }
      const factors = await listVerifiedFactors(); if (!valid()) return;
      pending.current = { work, valid }; setFactor(factors[0]?.id ?? null); setCode(''); setError(null); setOpen(true);
    } catch { if (valid()) { setOpen(true); setError('No pudimos verificar tu cuenta. Vuelve a intentarlo.'); } }
    finally { locked.current = false; }
  };
  const verify = async () => {
    const action = pending.current;
    if (!factor || !action?.valid() || locked.current || code.length !== 6) return; locked.current = true; setBusy(true); setError(null);
    try {
      await elevateWithTotp(factor, code, action.valid); if (!action.valid()) return;
      pending.current = null; setOpen(false); setCode(''); await action.work();
    } catch { if (action.valid()) setError('El código no es válido o ha caducado. Prueba con el código actual.'); }
    finally { locked.current = false; if (action.valid()) setBusy(false); }
  };
  const node = open ? <Card style={{ gap: 12, marginVertical: 18 }}><Text style={F.h3}>Verifica que eres tú</Text><Text style={F.small}>{factor ? 'Introduce el código de tu app de autenticación para confirmar esta operación.' : 'Activa la verificación en dos pasos en los ajustes de seguridad antes de gestionar permisos sensibles.'}</Text>{factor ? <><TextInput accessibilityLabel="Código de autenticación" value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} maxLength={6} keyboardType="number-pad" textContentType="oneTimeCode" style={{ padding: 14, color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 14, fontSize: 22, letterSpacing: 5 }} /><Btn label="Verificar y confirmar" busy={busy} disabled={code.length !== 6} onPress={() => void verify()} /></> : <Btn label="Configurar seguridad" onPress={() => { pending.current = null; setOpen(false); router.push('/seguridad'); }} />}{error ? <Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text> : null}<View><Btn label="Cancelar" variant="ghost" disabled={busy} onPress={() => { pending.current = null; setOpen(false); setCode(''); }} /></View></Card> : null;
  return { protect, node };
}
